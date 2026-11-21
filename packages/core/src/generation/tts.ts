import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';
import type { AppEnv } from '../config/env.js';
import { concatVoiceSegmentsWithPause, prepareNormalizedVoicePair } from '../media/ffmpeg.js';
import { runSubprocess } from '../media/subprocess.js';
import type { LocalAssetStorage } from '../storage/assets.js';
import {
  CHANNEL_OUTRO_PAUSE_MS,
  CHANNEL_OUTRO_TAIL_PAD_MS,
  isChannelOutroScene,
  VoiceNameSchema,
  type ReelScene,
  type ReelStoryboard,
  type VoiceName,
} from '../schemas/storyboard.js';
import { createGeminiAbortSignal, withGeminiRetry } from './geminiClient.js';
import { normalizeTextForTts } from './pronunciation.js';

export interface SynthesizedVoiceResult {
  rawAudioPath: string;
  trimmedMasterPath: string;
  voice48kPath: string;
  voice16kPath: string;
  durationMs: number;
}

const activePreviewRequests = new Map<string, Promise<{ filePath: string; cached: boolean }>>();

function buildScenesNarrationText(scenes: readonly ReelScene[]): string {
  return scenes
    .map((s) => {
      const trimmed = normalizeTextForTts(s.narration.trim());
      if (!trimmed) return '';
      return /[.?!]["')\]}]*$/.test(trimmed) ? trimmed : `${trimmed}.`;
    })
    .filter(Boolean)
    .join(' ');
}

function splitMainAndOutroScenes(storyboard: ReelStoryboard): {
  mainScenes: readonly ReelScene[];
  outroScene: ReelScene;
} | null {
  if (storyboard.scenes.length < 2) return null;
  const lastScene = storyboard.scenes[storyboard.scenes.length - 1]!;
  if (!isChannelOutroScene(lastScene)) return null;
  return {
    mainScenes: storyboard.scenes.slice(0, -1),
    outroScene: lastScene,
  };
}

async function callGeminiTtsBytes(opts: {
  ai: GoogleGenAI;
  model: string;
  voice: VoiceName;
  text: string;
  signal?: AbortSignal;
}): Promise<{ rawBytes: Buffer; mimeType?: string }> {
  // Pass strictly spoken narration text so the TTS model never speaks director notes aloud
  const response = await withGeminiRetry(
    () =>
      opts.ai.models.generateContent({
        model: opts.model,
        contents: opts.text,
        config: {
          abortSignal: createGeminiAbortSignal(opts.signal, 120_000),
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            languageCode: 'en-US',
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: opts.voice,
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

  return { rawBytes, mimeType: part.inlineData.mimeType };
}

async function synthesizeMacOSWavBytes(opts: {
  text: string;
  aiffPath: string;
  wavPath: string;
  signal?: AbortSignal;
}): Promise<Buffer> {
  const cleanText = opts.text.replace(/\s*\.\.\.\s*/g, '. ');
  await runSubprocess('say', ['-r', '185', '-o', opts.aiffPath, cleanText], {
    signal: opts.signal,
    timeoutMs: 45_000,
  });

  await runSubprocess(
    'ffmpeg',
    [
      '-y',
      '-i',
      opts.aiffPath,
      '-f',
      'wav',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      opts.wavPath,
    ],
    { signal: opts.signal, timeoutMs: 30_000 },
  );

  if (fs.existsSync(opts.aiffPath)) {
    fs.rmSync(opts.aiffPath, { force: true });
  }
  return fs.readFileSync(opts.wavPath);
}

async function stitchMainAndOutroVoiceSegments(opts: {
  workDir: string;
  mainSegment: { rawBytes: Buffer; mimeType?: string };
  outroSegment: { rawBytes: Buffer; mimeType?: string };
  signal?: AbortSignal;
}): Promise<SynthesizedVoiceResult> {
  fs.mkdirSync(opts.workDir, { recursive: true });
  const tmpDir = path.join(opts.workDir, '.voice-segments-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const rawAudioPath = path.join(opts.workDir, 'voice-raw.bin');
  const trimmedMasterPath = path.join(opts.workDir, 'voice-trimmed.wav');
  const voice48kPath = path.join(opts.workDir, 'voice-48k.wav');
  const voice16kPath = path.join(opts.workDir, 'voice-16k.wav');

  try {
    const mainRawPath = path.join(tmpDir, 'main-raw.bin');
    const mainTrimmedPath = path.join(tmpDir, 'main-trimmed.wav');
    const main48kPath = path.join(tmpDir, 'main-48k.wav');
    const main16kPath = path.join(tmpDir, 'main-16k.wav');

    const outroRawPath = path.join(tmpDir, 'outro-raw.bin');
    const outroTrimmedPath = path.join(tmpDir, 'outro-trimmed.wav');
    const outro48kPath = path.join(tmpDir, 'outro-48k.wav');
    const outro16kPath = path.join(tmpDir, 'outro-16k.wav');

    fs.writeFileSync(mainRawPath, opts.mainSegment.rawBytes);
    fs.writeFileSync(outroRawPath, opts.outroSegment.rawBytes);

    await prepareNormalizedVoicePair({
      rawAudioPath: mainRawPath,
      rawBytes: opts.mainSegment.rawBytes,
      mimeType: opts.mainSegment.mimeType,
      trimmedMasterPath: mainTrimmedPath,
      output48kPath: main48kPath,
      output16kPath: main16kPath,
      headDelayMs: 220,
      tailPadSec: 0.12,
      signal: opts.signal,
    });

    await prepareNormalizedVoicePair({
      rawAudioPath: outroRawPath,
      rawBytes: opts.outroSegment.rawBytes,
      mimeType: opts.outroSegment.mimeType,
      trimmedMasterPath: outroTrimmedPath,
      output48kPath: outro48kPath,
      output16kPath: outro16kPath,
      headDelayMs: 110,
      tailPadSec: 0.12,
      signal: opts.signal,
    });

    const { durationMs } = await concatVoiceSegmentsWithPause({
      mainVoice48kPath: main48kPath,
      outroVoice48kPath: outro48kPath,
      pauseMs: CHANNEL_OUTRO_PAUSE_MS,
      tailPadMs: CHANNEL_OUTRO_TAIL_PAD_MS,
      output48kPath: voice48kPath,
      output16kPath: voice16kPath,
      signal: opts.signal,
    });

    fs.copyFileSync(voice48kPath, trimmedMasterPath);
    fs.copyFileSync(voice48kPath, rawAudioPath);

    return {
      rawAudioPath,
      trimmedMasterPath,
      voice48kPath,
      voice16kPath,
      durationMs,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function getOrSynthesizeOutroSegment(opts: {
  ai: GoogleGenAI;
  cacheDirAbs?: string;
  model: string;
  voice: VoiceName;
  text: string;
  signal?: AbortSignal;
}): Promise<{ rawBytes: Buffer; mimeType?: string }> {
  if (opts.cacheDirAbs) {
    const hash = createHash('sha256')
      .update(`${opts.model}:${opts.voice}:${opts.text}`)
      .digest('hex')
      .slice(0, 12);
    const cacheDir = path.join(opts.cacheDirAbs, 'tts-outro');
    const binPath = path.join(cacheDir, `${opts.voice}-${hash}.bin`);
    const metaPath = path.join(cacheDir, `${opts.voice}-${hash}.json`);
    if (fs.existsSync(binPath) && fs.statSync(binPath).size > 1000) {
      let mimeType: string | undefined;
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { mimeType?: string };
          mimeType = meta.mimeType;
        } catch {
          // Ignore invalid cache metadata
        }
      }
      return { rawBytes: fs.readFileSync(binPath), mimeType };
    }
    const res = await callGeminiTtsBytes(opts);
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(binPath, res.rawBytes);
      fs.writeFileSync(metaPath, JSON.stringify({ mimeType: res.mimeType }), 'utf8');
    } catch {
      // Non-fatal if cache write fails
    }
    return res;
  }
  return callGeminiTtsBytes(opts);
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
  const ai = new GoogleGenAI({ apiKey: opts.env.GEMINI_API_KEY, apiVersion: 'v1beta' });
  const split = splitMainAndOutroScenes(opts.storyboard);

  if (split) {
    const [mainSegment, outroSegment] = await Promise.all([
      callGeminiTtsBytes({
        ai,
        model: opts.env.GEMINI_TTS_MODEL,
        voice,
        text: buildScenesNarrationText(split.mainScenes),
        signal: opts.signal,
      }),
      getOrSynthesizeOutroSegment({
        ai,
        cacheDirAbs: opts.env.CACHE_DIR_ABS,
        model: opts.env.GEMINI_TTS_MODEL,
        voice,
        text: buildScenesNarrationText([split.outroScene]),
        signal: opts.signal,
      }),
    ]);

    return stitchMainAndOutroVoiceSegments({
      workDir: opts.workDir,
      mainSegment,
      outroSegment,
      signal: opts.signal,
    });
  }

  const narrationText = buildScenesNarrationText(opts.storyboard.scenes);
  const { rawBytes, mimeType } = await callGeminiTtsBytes({
    ai,
    model: opts.env.GEMINI_TTS_MODEL,
    voice,
    text: narrationText,
    signal: opts.signal,
  });

  fs.mkdirSync(opts.workDir, { recursive: true });
  const rawAudioPath = path.join(opts.workDir, 'voice-raw.bin');
  const trimmedMasterPath = path.join(opts.workDir, 'voice-trimmed.wav');
  const voice48kPath = path.join(opts.workDir, 'voice-48k.wav');
  const voice16kPath = path.join(opts.workDir, 'voice-16k.wav');

  fs.writeFileSync(rawAudioPath, rawBytes);

  const { durationMs } = await prepareNormalizedVoicePair({
    rawAudioPath,
    rawBytes,
    mimeType,
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
  const split = splitMainAndOutroScenes(opts.storyboard);
  if (split) {
    fs.mkdirSync(opts.workDir, { recursive: true });
    const sayTmpDir = path.join(opts.workDir, '.say-segments-tmp');
    fs.mkdirSync(sayTmpDir, { recursive: true });
    try {
      const mainBytes = await synthesizeMacOSWavBytes({
        text: buildScenesNarrationText(split.mainScenes),
        aiffPath: path.join(sayTmpDir, 'main.aiff'),
        wavPath: path.join(sayTmpDir, 'main.wav'),
        signal: opts.signal,
      });
      const outroBytes = await synthesizeMacOSWavBytes({
        text: buildScenesNarrationText([split.outroScene]),
        aiffPath: path.join(sayTmpDir, 'outro.aiff'),
        wavPath: path.join(sayTmpDir, 'outro.wav'),
        signal: opts.signal,
      });

      return await stitchMainAndOutroVoiceSegments({
        workDir: opts.workDir,
        mainSegment: { rawBytes: mainBytes, mimeType: 'audio/wav' },
        outroSegment: { rawBytes: outroBytes, mimeType: 'audio/wav' },
        signal: opts.signal,
      });
    } finally {
      fs.rmSync(sayTmpDir, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(opts.workDir, { recursive: true });
  const aiffPath = path.join(opts.workDir, 'sample-say.aiff');
  const rawAudioPath = path.join(opts.workDir, 'voice-raw.bin');
  const trimmedMasterPath = path.join(opts.workDir, 'voice-trimmed.wav');
  const voice48kPath = path.join(opts.workDir, 'voice-48k.wav');
  const voice16kPath = path.join(opts.workDir, 'voice-16k.wav');

  const rawBytes = await synthesizeMacOSWavBytes({
    text: buildScenesNarrationText(opts.storyboard.scenes),
    aiffPath,
    wavPath: rawAudioPath,
    signal: opts.signal,
  });

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
        headDelayMs: 110,
        tailPadSec: 0.15,
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
