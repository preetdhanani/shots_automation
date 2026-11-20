import { GoogleGenAI } from '@google/genai';

export interface GeminiHealthResult {
  configured: boolean;
  ok: boolean;
  textModel: string;
  ttsModel: string;
  message: string;
}

function getStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const rec = err as Record<string, unknown>;
  if (typeof rec.status === 'number') return rec.status;
  if (typeof rec.code === 'number') return rec.code;
  const msg = String(rec.message ?? '');
  const m = msg.match(/\b(429|500|502|503|504)\b/);
  return m ? Number.parseInt(m[1]!, 10) : null;
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
      return await fn();
    } catch (err) {
      lastError = err;
      const status = getStatusCode(err);
      const retryable = status === 429 || status === 502 || status === 503 || status === 504;
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
    // Lightweight metadata check (does not consume generation/TTS RPD quota)
    await ai.models.get({ model: opts.textModel });
    return {
      configured: true,
      ok: true,
      textModel: opts.textModel,
      ttsModel: opts.ttsModel,
      message: `Connected cleanly to Gemini API (${opts.textModel}).`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      textModel: opts.textModel,
      ttsModel: opts.ttsModel,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
