import { GoogleGenAI } from '@google/genai';

export interface GeminiHealthResult {
  configured: boolean;
  ok: boolean;
  textModel: string;
  ttsModel: string;
  message: string;
}

function isRetryableGeminiError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as Record<string, unknown>;
  const numericStatus =
    typeof rec.status === 'number' ? rec.status : typeof rec.code === 'number' ? rec.code : null;
  if (
    numericStatus === 429 ||
    numericStatus === 500 ||
    numericStatus === 502 ||
    numericStatus === 503 ||
    numericStatus === 504
  ) {
    return true;
  }

  const combined = `${String(rec.status ?? '')} ${String(rec.message ?? '')}`;
  if (/\b(429|500|502|503|504)\b/.test(combined)) {
    return true;
  }
  return /\b(UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL)\b/i.test(combined);
}

export function createGeminiAbortSignal(
  signal?: AbortSignal,
  timeoutMs = 120_000,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new Error('Cancelled'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error('Cancelled');
    }
    try {
      return await raceWithAbort(fn(), opts.signal);
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) {
        throw new Error('Cancelled', { cause: err });
      }
      const retryable = isRetryableGeminiError(err);
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      const baseMs = 1500 * Math.pow(2, attempt - 1);
      const jitterMs = Math.floor(Math.random() * 400);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          opts.signal?.removeEventListener('abort', onAbort);
          resolve();
        }, baseMs + jitterMs);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('Cancelled'));
        };
        opts.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  throw lastError;
}

export function formatApiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { message?: unknown; status?: unknown; code?: unknown };
        message?: unknown;
      };
      if (typeof parsed.error?.message === 'string' && parsed.error.message.trim()) {
        const status =
          typeof parsed.error.status === 'string' ? ` (${parsed.error.status})` : '';
        return `${parsed.error.message.trim()}${status}`;
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Fall through to raw message
    }
  }
  return raw;
}

export async function checkGeminiHealth(opts: {
  apiKey: string;
  textModel: string;
  ttsModel: string;
}): Promise<GeminiHealthResult> {
  if (!opts.apiKey.trim()) {
    return {
      configured: false,
      ok: false,
      textModel: opts.textModel,
      ttsModel: opts.ttsModel,
      message: 'GEMINI_API_KEY is not set in .env.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey });
    const aiBeta = new GoogleGenAI({ apiKey: opts.apiKey, apiVersion: 'v1beta' });
    // Lightweight metadata checks (do not consume generation/TTS RPD quota)
    await ai.models.get({ model: opts.textModel });
    await aiBeta.models.get({ model: opts.ttsModel });
    return {
      configured: true,
      ok: true,
      textModel: opts.textModel,
      ttsModel: opts.ttsModel,
      message: `Connected cleanly to Gemini API (${opts.textModel}, TTS: ${opts.ttsModel}).`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      textModel: opts.textModel,
      ttsModel: opts.ttsModel,
      message: formatApiErrorMessage(err),
    };
  }
}
