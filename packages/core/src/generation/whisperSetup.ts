import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { AppEnv } from '../config/env.js';
import { runSubprocess } from '../media/subprocess.js';

export const WHISPER_MODEL_FILENAME = 'ggml-base.en.bin';
export const WHISPER_MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
export const WHISPER_MODEL_SHA256 =
  'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002';
export const WHISPER_MODEL_EXPECTED_BYTES = 147964211;

export interface WhisperSetupStatus {
  cliAvailable: boolean;
  cliPath: string | null;
  modelAvailable: boolean;
  modelPath: string;
  downloading: boolean;
  downloadedBytes: number;
  totalBytes: number;
  progressPct: number;
  error: string | null;
}

export interface WhisperDownloadProgress {
  status: 'idle' | 'downloading' | 'verifying' | 'done' | 'error';
  downloadedBytes: number;
  totalBytes: number;
  progressPct: number;
  error: string | null;
}

const whisperEmitter = new EventEmitter();
let activeDownload: Promise<string> | null = null;
let downloadState: WhisperDownloadProgress = {
  status: 'idle',
  downloadedBytes: 0,
  totalBytes: WHISPER_MODEL_EXPECTED_BYTES,
  progressPct: 0,
  error: null,
};

export function getWhisperModelPath(env: AppEnv): string {
  return path.join(env.CACHE_DIR_ABS, 'whisper-models', WHISPER_MODEL_FILENAME);
}

export async function detectWhisperCliPath(env: AppEnv): Promise<string | null> {
  const candidates = [
    env.WHISPER_CLI_PATH,
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    'whisper-cli',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) {
      continue;
    }
    try {
      const res = await runSubprocess(candidate, ['--version'], { timeoutMs: 4000 });
      if (res.code === 0) {
        return candidate;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export async function getWhisperSetupStatus(env: AppEnv): Promise<WhisperSetupStatus> {
  const cliPath = await detectWhisperCliPath(env);
  const modelPath = getWhisperModelPath(env);
  const modelAvailable =
    fs.existsSync(modelPath) && fs.statSync(modelPath).size >= WHISPER_MODEL_EXPECTED_BYTES * 0.95;

  return {
    cliAvailable: cliPath !== null,
    cliPath,
    modelAvailable,
    modelPath,
    downloading: activeDownload !== null,
    downloadedBytes: downloadState.downloadedBytes,
    totalBytes: downloadState.totalBytes,
    progressPct: modelAvailable ? 100 : downloadState.progressPct,
    error: downloadState.error,
  };
}

export function getWhisperDownloadProgress(): WhisperDownloadProgress {
  return { ...downloadState };
}

export function subscribeWhisperProgress(
  listener: (progress: WhisperDownloadProgress) => void,
): () => void {
  whisperEmitter.on('progress', listener);
  return () => {
    whisperEmitter.off('progress', listener);
  };
}

function emitProgress(next: WhisperDownloadProgress): void {
  downloadState = next;
  whisperEmitter.emit('progress', { ...next });
}

export async function ensureWhisperModelDownloaded(env: AppEnv): Promise<string> {
  const modelPath = getWhisperModelPath(env);
  if (fs.existsSync(modelPath) && fs.statSync(modelPath).size >= WHISPER_MODEL_EXPECTED_BYTES * 0.95) {
    emitProgress({
      status: 'done',
      downloadedBytes: fs.statSync(modelPath).size,
      totalBytes: fs.statSync(modelPath).size,
      progressPct: 100,
      error: null,
    });
    return modelPath;
  }

  if (activeDownload) {
    return activeDownload;
  }

  activeDownload = (async () => {
    const dir = path.dirname(modelPath);
    fs.mkdirSync(dir, { recursive: true });
    const partPath = `${modelPath}.part`;

    emitProgress({
      status: 'downloading',
      downloadedBytes: 0,
      totalBytes: WHISPER_MODEL_EXPECTED_BYTES,
      progressPct: 0,
      error: null,
    });

    try {
      const response = await fetch(WHISPER_MODEL_URL, {
        redirect: 'follow',
        headers: { 'User-Agent': 'PostReelsStudio/0.1' },
      });
      if (!response.ok || !response.body) {
        throw new Error(`Failed to download Whisper model (HTTP ${response.status}).`);
      }

      const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
      const totalBytes =
        Number.isFinite(contentLength) && contentLength > 0
          ? contentLength
          : WHISPER_MODEL_EXPECTED_BYTES;

      const reader = response.body.getReader();
      const hasher = createHash('sha256');
      const fileStream = fs.createWriteStream(partPath);
      let downloadedBytes = 0;
      let lastEmitAt = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          hasher.update(value);
          await new Promise<void>((resolve, reject) => {
            const ok = fileStream.write(value, (err) => {
              if (err) reject(err);
            });
            if (ok) resolve();
            else fileStream.once('drain', resolve);
          });

          downloadedBytes += value.byteLength;
          const now = Date.now();
          if (now - lastEmitAt >= 200 || downloadedBytes >= totalBytes) {
            lastEmitAt = now;
            emitProgress({
              status: 'downloading',
              downloadedBytes,
              totalBytes,
              progressPct: Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)),
              error: null,
            });
          }
        }
      } finally {
        await new Promise<void>((resolve) => fileStream.end(() => resolve()));
      }

      emitProgress({
        status: 'verifying',
        downloadedBytes,
        totalBytes,
        progressPct: 99,
        error: null,
      });

      if (contentLength > 0 && downloadedBytes !== contentLength) {
        throw new Error(
          `Downloaded ${downloadedBytes} bytes, expected ${contentLength} bytes from Content-Length.`,
        );
      }

      const digest = hasher.digest('hex');
      if (digest !== WHISPER_MODEL_SHA256) {
        throw new Error(
          `Whisper model SHA-256 mismatch (got ${digest}, expected ${WHISPER_MODEL_SHA256}).`,
        );
      }

      fs.renameSync(partPath, modelPath);
      emitProgress({
        status: 'done',
        downloadedBytes,
        totalBytes: downloadedBytes,
        progressPct: 100,
        error: null,
      });
      return modelPath;
    } catch (err) {
      if (fs.existsSync(partPath)) {
        fs.rmSync(partPath, { force: true });
      }
      const message = err instanceof Error ? err.message : String(err);
      emitProgress({
        status: 'error',
        downloadedBytes: 0,
        totalBytes: WHISPER_MODEL_EXPECTED_BYTES,
        progressPct: 0,
        error: message,
      });
      throw err;
    } finally {
      activeDownload = null;
    }
  })();

  return activeDownload;
}
