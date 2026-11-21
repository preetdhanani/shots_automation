import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, type GenerateVideosOperation, type GeneratedVideo } from '@google/genai';
import type { AppEnv } from '../config/env.js';
import { getAudioDurationMs } from '../media/ffmpeg.js';
import { runSubprocess } from '../media/subprocess.js';
import { sanitizeAssetSegment, type ReelAssetRef } from '../schemas/storyboard.js';

export interface VeoClientLike {
  models: {
    generateVideos: (params: {
      model: string;
      prompt: string;
      config?: {
        aspectRatio?: string;
        durationSeconds?: number;
        numberOfVideos?: number;
        abortSignal?: AbortSignal;
      };
    }) => Promise<GenerateVideosOperation>;
  };
  operations: {
    getVideosOperation: (params: {
      operation: GenerateVideosOperation;
      config?: { abortSignal?: AbortSignal };
    }) => Promise<GenerateVideosOperation>;
  };
  files: {
    download: (params: {
      file: GeneratedVideo;
      downloadPath: string;
      config?: { abortSignal?: AbortSignal };
    }) => Promise<void>;
  };
}

export interface GenerateBrollOptions {
  env: AppEnv;
  sceneId: string;
  prompt: string;
  outDir: string;
  durationSec?: number;
  signal?: AbortSignal;
  client?: VeoClientLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface GenerateBrollResult {
  asset: ReelAssetRef | null;
  warning?: string;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Aborted'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function probeVideoDurationMs(filePath: string, signal?: AbortSignal): Promise<number> {
  try {
    const res = await runSubprocess(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath],
      { signal, timeoutMs: 10_000 },
    );
    const parsed = JSON.parse(res.stdout) as { format?: { duration?: string } };
    const sec = Number.parseFloat(parsed.format?.duration ?? '0');
    if (Number.isFinite(sec) && sec > 0) {
      return Math.round(sec * 1000);
    }
  } catch {
    // Fall back to getAudioDurationMs or default
  }
  try {
    return await getAudioDurationMs(filePath, signal);
  } catch {
    return 8000;
  }
}

/**
 * Generates an opt-in 9:16 AI B-roll clip via Gemini Veo (`veo-3.1-fast-generate-preview`).
 * Never throws: returns `{ asset: null, warning }` on timeout, API error, or missing key
 * so the scene gracefully renders its animated fallback.
 */
export async function generateVeoBrollClip(
  opts: GenerateBrollOptions,
): Promise<GenerateBrollResult> {
  if (!opts.client && !opts.env.GEMINI_API_KEY.trim()) {
    return {
      asset: null,
      warning: 'Skipping AI B-roll: GEMINI_API_KEY is not configured.',
    };
  }

  const timeoutMs = opts.timeoutMs ?? 6 * 60 * 1000;
  const pollIntervalMs = opts.pollIntervalMs ?? 6_000;
  const startedAt = Date.now();
  const safeId = sanitizeAssetSegment(opts.sceneId);
  const fileName = `broll-${safeId}.mp4`;
  const outPath = path.join(opts.outDir, fileName);

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onParentAbort = () => timeoutController.abort();
  opts.signal?.addEventListener('abort', onParentAbort, { once: true });

  try {
    fs.mkdirSync(opts.outDir, { recursive: true });
    const ai: VeoClientLike =
      opts.client ?? (new GoogleGenAI({ apiKey: opts.env.GEMINI_API_KEY }) as unknown as VeoClientLike);

    let operation = await ai.models.generateVideos({
      model: opts.env.GEMINI_VEO_MODEL || 'veo-3.1-fast-generate-preview',
      prompt: opts.prompt,
      config: {
        aspectRatio: '9:16',
        durationSeconds: Math.max(4, Math.min(8, Math.round(opts.durationSec ?? 8))),
        numberOfVideos: 1,
        abortSignal: timeoutController.signal,
      },
    });

    while (!operation.done) {
      if (Date.now() - startedAt > timeoutMs || timeoutController.signal.aborted) {
        return {
          asset: null,
          warning: 'AI B-roll timed out or was cancelled; using animated fallback.',
        };
      }
      await sleepWithAbort(pollIntervalMs, timeoutController.signal);
      operation = await ai.operations.getVideosOperation({
        operation,
        config: { abortSignal: timeoutController.signal },
      });
    }

    if (operation.error) {
      const msg =
        typeof operation.error === 'object' && 'message' in operation.error
          ? String((operation.error as { message?: unknown }).message ?? 'Veo operation failed')
          : String(operation.error);
      return {
        asset: null,
        warning: `AI B-roll failed (${msg}); using animated fallback.`,
      };
    }

    const generated = operation.response?.generatedVideos?.[0];
    if (!generated?.video) {
      return {
        asset: null,
        warning: 'AI B-roll returned no video output; using animated fallback.',
      };
    }

    if (generated.video.videoBytes) {
      const bytes = Buffer.from(generated.video.videoBytes, 'base64');
      fs.writeFileSync(outPath, bytes);
    } else {
      await ai.files.download({
        file: generated,
        downloadPath: outPath,
        config: { abortSignal: timeoutController.signal },
      });
    }

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
      return {
        asset: null,
        warning: 'AI B-roll file was empty; using animated fallback.',
      };
    }

    const durationMs = await probeVideoDurationMs(outPath, timeoutController.signal);
    return {
      asset: {
        kind: 'video',
        file: fileName,
        durationMs,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      asset: null,
      warning: `AI B-roll unavailable (${msg}); using animated fallback.`,
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onParentAbort);
  }
}
