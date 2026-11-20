import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';
import type { AppEnv } from '../config/env.js';
import { prepareNormalizedVoicePair } from '../media/ffmpeg.js';
import { runSubprocess } from '../media/subprocess.js';
import type { LocalAssetStorage } from '../storage/assets.js';
import {
  VoiceNameSchema,
  type ReelStoryboard,
  type VoiceName,
} from '../schemas/storyboard.js';
import { createGeminiAbortSignal, withGeminiRetry } from './geminiClient.js';

export interface SynthesizedVoiceResult {
  rawAudioPath: string;
  trimmedMasterPath: string;
  voice48kPath: string;
  voice16kPath: string;
  durationMs: number;
}

const activePreviewRequests = new Map<string, Promise<{ filePath: string; cached: boolean }>>();

function buildFullNarrationText(storyboard: ReelStoryboard): string {
  return storyboard.scenes
    .map((s) => s.narration.trim())
    .filter(Boolean)
    .join(' ... ');
}

export async function synthesizeVoiceWithGemini(opts: {
  env: AppEnv;
  storyboard: ReelStoryboard;
  voiceName: VoiceName;
  workDir: string;
  signal?: AbortSignal;
}): Promise<SynthesizedVoiceResult> {
  if (!opts.env.GEMINI_API_KEY.trim()) {
    throw new Error('GEMINI_API_KEY is missing in .env.');
  }
  const voice = VoiceNameSchema.parse(opts.voiceName);
  const narrationText = buildFullNarrationText(opts.storyboard);
  const ai = new GoogleGenAI({ apiKey: opts.env.GEMINI_API_KEY, apiVersion: 'v1beta' });

  // Pass strictly spoken narration text so the TTS model never speaks director notes aloud
  const response = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: opts.env.GEMINI_TTS_MODEL,
        contents: narrationText,
        config: {
          abortSignal: createGeminiAbortSignal(opts.signal, 120_000),
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            languageCode: 'en-US',
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
      }),
    { signal: opts.signal },
  );

  const part = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData && typeof p.inlineData.data === 'string',
  );
  if (!part?.inlineData?.data) {
    throw new Error('Gemini TTS returned no inline audio data.');
  }

  const rawBytes = Buffer.from(part.inlineData.data, 'base64');
  if (rawBytes.byteLength < 1000) {
    throw new Error('Gemini TTS returned unexpectedly empty audio buffer.');
  }

  fs.mkdirSync(opts.workDir, { recursive: true });
  const rawAudioPath = path.join(opts.workDir, 'voice-raw.bin');
  const trimmedMasterPath = path.join(opts.workDir, 'voice-trimmed.wav');
  const voice48kPath = path.join(opts.workDir, 'voice-48k.wav');
  const voice16kPath = path.join(opts.workDir, 'voice-16k.wav');

  fs.writeFileSync(rawAudioPath, rawBytes);

  const { durationMs } = await prepareNormalizedVoicePair({
    rawAudioPath,
    rawBytes,
    mimeType: part.inlineData.mimeType,
    trimmedMasterPath,
    output48kPath: voice48kPath,
    output16kPath: voice16kPath,
    signal: opts.signal,
  });

  return {
    rawAudioPath,
    trimmedMasterPath,
    voice48kPath,
    voice16kPath,
    durationMs,
  };
}

export async function synthesizeSampleVoiceMacOS(opts: {
  storyboard: ReelStoryboard;
  workDir: string;
  signal?: AbortSignal;
}): Promise<SynthesizedVoiceResult> {
  fs.mkdirSync(opts.workDir, { recursive: true });
  const aiffPath = path.join(opts.workDir, 'sample-say.aiff');
  const rawAudioPath = path.join(opts.workDir, 'voice-raw.bin');
  const trimmedMasterPath = path.join(opts.workDir, 'voice-trimmed.wav');
  const voice48kPath = path.join(opts.workDir, 'voice-48k.wav');
  const voice16kPath = path.join(opts.workDir, 'voice-16k.wav');

  const text = buildFullNarrationText(opts.storyboard).replace(/\s*\.\.\.\s*/g, '. ');

  await runSubprocess('say', ['-r', '185', '-o', aiffPath, text], {
    signal: opts.signal,
    timeoutMs: 45_000,
  });

  await runSubprocess(
    'ffmpeg',
    ['-y', '-i', aiffPath, '-f', 'wav', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', rawAudioPath],
    { signal: opts.signal, timeoutMs: 30_000 },
  );

  if (fs.existsSync(aiffPath)) {
    fs.rmSync(aiffPath, { force: true });
  }

  const rawBytes = fs.readFileSync(rawAudioPath);
  const { durationMs } = await prepareNormalizedVoicePair({
    rawAudioPath,
    rawBytes,
    mimeType: 'audio/wav',
    trimmedMasterPath,
    output48kPath: voice48kPath,
    output16kPath: voice16kPath,
    signal: opts.signal,
  });

  return {
    rawAudioPath,
    trimmedMasterPath,
    voice48kPath,
    voice16kPath,
    durationMs,
  };
}

const PREVIEW_SAMPLE_PHRASE =
  'Here is a quick AI coding update: tighter harnesses and evals beat bigger prompts every time.';

export function getVoicePreviewHash(ttsModel: string): string {
  return createHash('sha256')
    .update(`${ttsModel}:${PREVIEW_SAMPLE_PHRASE}`)
    .digest('hex')
    .slice(0, 10);
}

export async function getOrCreateVoicePreview(
  env: AppEnv,
  storage: LocalAssetStorage,
  rawVoiceName: string,
): Promise<{ filePath: string; cached: boolean }> {
  const voiceName = VoiceNameSchema.parse(rawVoiceName);
  const modelHash = getVoicePreviewHash(env.GEMINI_TTS_MODEL);
  const targetPath = storage.getVoicePreviewPath(voiceName, modelHash);

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 4000) {
    return { filePath: targetPath, cached: true };
  }

  if (!env.GEMINI_API_KEY.trim()) {
    throw new Error('GEMINI_API_KEY is required to generate voice previews.');
  }

  const flightKey = `${voiceName}:${modelHash}`;
  const inFlight = activePreviewRequests.get(flightKey);
  if (inFlight) {
    return inFlight;
  }

  const job = (async () => {
    const tmpDir = `${targetPath}.tmp-dir`;
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: 'v1beta' });
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
          model: env.GEMINI_TTS_MODEL,
          contents: PREVIEW_SAMPLE_PHRASE,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              languageCode: 'en-US',
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        }),
      );

      const part = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData && typeof p.inlineData.data === 'string',
      );
      if (!part?.inlineData?.data) {
        throw new Error('Gemini TTS returned empty preview audio.');
      }

      const rawBytes = Buffer.from(part.inlineData.data, 'base64');
      const rawBin = path.join(tmpDir, 'raw.bin');
      const trimmed = path.join(tmpDir, 'trimmed.wav');
      const out48 = path.join(tmpDir, 'out48.wav');
      const out16 = path.join(tmpDir, 'out16.wav');
      fs.writeFileSync(rawBin, rawBytes);

      await prepareNormalizedVoicePair({
        rawAudioPath: rawBin,
        rawBytes,
        mimeType: part.inlineData.mimeType,
        trimmedMasterPath: trimmed,
        output48kPath: out48,
        output16kPath: out16,
      });

      const tmpWav = `${targetPath}.part`;
      fs.copyFileSync(out48, tmpWav);
      fs.renameSync(tmpWav, targetPath);
      return { filePath: targetPath, cached: false };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      activePreviewRequests.delete(flightKey);
    }
  })();

  activePreviewRequests.set(flightKey, job);
  return job;
}
