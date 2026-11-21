import {
  isLoopbackUrl,
  normalizeOpenAIBaseUrl,
  validateApiKeyValue,
  type LlmProvider,
} from '../schemas/llm.js';
import { GEMINI_STORYBOARD_JSON_SCHEMA } from './geminiSchema.js';

export interface LlmHealthResult {
  configured: boolean;
  ok: boolean;
  provider: LlmProvider;
  endpointId: string;
  name: string;
  model: string;
  baseUrl?: string;
  availableModels?: string[];
  ttsModel?: string;
  message: string;
}

const MODELS_MAX_BYTES = 5 * 1024 * 1024;
const PROBE_MAX_BYTES = 1024 * 1024;
const COMPLETION_MAX_BYTES = 2 * 1024 * 1024;

function redactSecret(text: string, secret?: string): string {
  let cleaned = text;
  const trimmedSecret = secret?.trim() ?? '';
  if (trimmedSecret.length >= 6) {
    cleaned = cleaned.split(trimmedSecret).join('[REDACTED]');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 400) {
    return `${cleaned.slice(0, 397)}...`;
  }
  return cleaned;
}

async function readResponseTextLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error(`Response exceeded ${maxBytes} byte limit.`);
    }
    return new TextDecoder().decode(buf);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`Response exceeded ${maxBytes} byte limit.`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function buildAuthHeaders(apiKey?: string, includeJsonContentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const cleanKey = apiKey ? validateApiKeyValue(apiKey) : '';
  if (cleanKey) {
    headers['Authorization'] = `Bearer ${cleanKey}`;
  }
  return headers;
}

function createCombinedAbortSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let didTimeout = false;

  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason);
  }

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`));
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

function formatFetchError(
  err: unknown,
  baseUrl: string,
  timedOut: boolean,
  apiKey?: string,
): string {
  if (timedOut) {
    return `Connection to ${baseUrl} timed out.`;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const cause =
    err && typeof err === 'object' && 'cause' in err && (err as { cause?: unknown }).cause
      ? String((err as { cause?: unknown }).cause)
      : '';
  const combined = `${raw} ${cause}`.trim();

  if (
    combined.includes('ECONNREFUSED') ||
    combined.includes('ENOTFOUND') ||
    combined.toLowerCase().includes('fetch failed')
  ) {
    return `Could not reach ${baseUrl}. Make sure the server is running and the URL is reachable.`;
  }
  return redactSecret(raw, apiKey) || `Failed to connect to ${baseUrl}.`;
}

function extractApiErrorMessage(status: number, bodyText: string, apiKey?: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: string | { message?: string; code?: string | number };
      message?: string;
    };
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return redactSecret(`HTTP ${status}: ${parsed.error}`, apiKey);
    }
    if (
      parsed.error &&
      typeof parsed.error === 'object' &&
      typeof parsed.error.message === 'string'
    ) {
      return redactSecret(`HTTP ${status}: ${parsed.error.message}`, apiKey);
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return redactSecret(`HTTP ${status}: ${parsed.message}`, apiKey);
    }
  } catch {
    // Non-JSON error body (e.g., proxy HTML)
  }

  const trimmed = redactSecret(bodyText, apiKey);
  return trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status} error from LLM endpoint.`;
}

function tryParsePlainObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

export function extractJsonFromLlmText(rawText: string): unknown {
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '');

  const closeTagMatches = [...cleaned.matchAll(/<\/think>/gi)];
  const lastCloseTag = closeTagMatches[closeTagMatches.length - 1];
  if (lastCloseTag && lastCloseTag.index !== undefined) {
    cleaned = cleaned.slice(lastCloseTag.index + lastCloseTag[0].length);
  }

  cleaned = cleaned.trim();
  const direct = tryParsePlainObject(cleaned);
  if (direct) return direct;

  for (const match of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const block = (match[1] ?? '').trim();
    const parsed = tryParsePlainObject(block);
    if (parsed) return parsed;
  }

  // Balanced JSON object scan skipping any prose braces before the actual JSON object
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < cleaned.length; j++) {
      const ch = cleaned[j]!;
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(i, j + 1);
          const parsed = tryParsePlainObject(candidate);
          if (parsed) {
            return parsed;
          }
          break;
        }
      }
    }
  }

  throw new Error('Model response did not contain valid JSON.');
}

export async function fetchOpenAICompatibleModels(opts: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ ok: boolean; models: string[]; message: string; status?: number }> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeOpenAIBaseUrl(opts.baseUrl);
  } catch (err) {
    return {
      ok: false,
      models: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let headers: Record<string, string>;
  try {
    headers = buildAuthHeaders(opts.apiKey, false);
  } catch (err) {
    return {
      ok: false,
      models: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const abort = createCombinedAbortSignal(opts.timeoutMs ?? 15_000, opts.signal);
  try {
    const res = await fetch(`${normalizedUrl}/models`, {
      method: 'GET',
      headers,
      signal: abort.signal,
    });
    const bodyText = await readResponseTextLimited(res, MODELS_MAX_BYTES);

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        models: [],
        status: res.status,
        message: `Authentication failed (HTTP ${res.status}). Check your API key.`,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        models: [],
        status: res.status,
        message: extractApiErrorMessage(res.status, bodyText, opts.apiKey),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return {
        ok: false,
        models: [],
        status: res.status,
        message: 'Endpoint returned invalid JSON from /models.',
      };
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'error' in parsed) {
      const errObj = (parsed as { error?: unknown }).error;
      if (errObj) {
        return {
          ok: false,
          models: [],
          status: res.status,
          message: extractApiErrorMessage(res.status, bodyText, opts.apiKey),
        };
      }
    }

    const rawItems = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown }).data)
        ? ((parsed as { data: unknown[] }).data ?? [])
        : [];

    const idSet = new Set<string>();
    for (const item of rawItems) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        const id = (item as { id: string }).id.trim();
        if (id) idSet.add(id);
      }
    }

    const models = [...idSet].sort((a, b) => a.localeCompare(b));
    return {
      ok: true,
      models,
      status: res.status,
      message:
        models.length > 0
          ? `Found ${models.length} model(s).`
          : 'Connected, but endpoint returned an empty model list.',
    };
  } catch (err) {
    return {
      ok: false,
      models: [],
      message: formatFetchError(err, normalizedUrl, abort.timedOut(), opts.apiKey),
    };
  } finally {
    abort.cleanup();
  }
}

async function probeOpenAICompatibleChat(opts: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ ok: boolean; message: string }> {
  const normalizedUrl = normalizeOpenAIBaseUrl(opts.baseUrl);
  const headers = buildAuthHeaders(opts.apiKey, true);
  let useMaxCompletionTokens = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const abort = createCombinedAbortSignal(opts.timeoutMs ?? 40_000, opts.signal);
    try {
      const payload: Record<string, unknown> = {
        model: opts.model,
        messages: [{ role: 'user', content: 'Reply with OK' }],
      };
      if (useMaxCompletionTokens) {
        payload.max_completion_tokens = 64;
      } else {
        payload.max_tokens = 32;
      }

      const res = await fetch(`${normalizedUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
      const bodyText = await readResponseTextLimited(res, PROBE_MAX_BYTES);

      if (!res.ok) {
        const errMsg = extractApiErrorMessage(res.status, bodyText, opts.apiKey);
        if (
          res.status === 400 &&
          !useMaxCompletionTokens &&
          /max_completion_tokens|max_tokens/i.test(errMsg)
        ) {
          useMaxCompletionTokens = true;
          continue;
        }
        return { ok: false, message: errMsg };
      }

      let parsed: { error?: unknown; choices?: unknown };
      try {
        parsed = JSON.parse(bodyText) as { error?: unknown; choices?: unknown };
      } catch {
        return { ok: false, message: 'Chat completion probe returned invalid JSON.' };
      }

      if (parsed.error) {
        return { ok: false, message: extractApiErrorMessage(200, bodyText, opts.apiKey) };
      }

      if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
        return { ok: true, message: 'Verified via chat completion.' };
      }

      return { ok: false, message: 'Endpoint returned HTTP 200 without choices.' };
    } catch (err) {
      return {
        ok: false,
        message: formatFetchError(err, normalizedUrl, abort.timedOut(), opts.apiKey),
      };
    } finally {
      abort.cleanup();
    }
  }

  return { ok: false, message: 'Chat completion probe failed.' };
}

export async function checkOpenAICompatibleHealth(opts: {
  endpointId: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<LlmHealthResult> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeOpenAIBaseUrl(opts.baseUrl);
  } catch (err) {
    return {
      configured: false,
      ok: false,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model: opts.model,
      baseUrl: opts.baseUrl,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const model = opts.model.trim();
  if (!model) {
    return {
      configured: false,
      ok: false,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model: '',
      baseUrl: normalizedUrl,
      message: 'Model ID is required.',
    };
  }

  try {
    validateApiKeyValue(opts.apiKey ?? '');
  } catch (err) {
    return {
      configured: false,
      ok: false,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model,
      baseUrl: normalizedUrl,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const modelsRes = await fetchOpenAICompatibleModels({
    baseUrl: normalizedUrl,
    apiKey: opts.apiKey,
    signal: opts.signal,
  });

  if (modelsRes.status === 401 || modelsRes.status === 403) {
    return {
      configured: true,
      ok: false,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model,
      baseUrl: normalizedUrl,
      message: modelsRes.message,
    };
  }

  const availableModels = modelsRes.models.length > 0 ? modelsRes.models : undefined;

  // Keyless local servers (Ollama / LM Studio) can confirm readiness cleanly via /models without waking inference
  if (
    isLoopbackUrl(normalizedUrl) &&
    !opts.apiKey?.trim() &&
    modelsRes.ok &&
    modelsRes.models.includes(model)
  ) {
    return {
      configured: true,
      ok: true,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model,
      baseUrl: normalizedUrl,
      availableModels,
      message: `Connected cleanly to ${opts.name}. Model "${model}" is ready (${modelsRes.models.length} local models found).`,
    };
  }

  // If /models failed with a transport error (no HTTP status), fail fast
  if (!modelsRes.ok && modelsRes.status === undefined) {
    return {
      configured: true,
      ok: false,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model,
      baseUrl: normalizedUrl,
      message: modelsRes.message,
    };
  }

  const probe = await probeOpenAICompatibleChat({
    baseUrl: normalizedUrl,
    model,
    apiKey: opts.apiKey,
    signal: opts.signal,
  });

  if (probe.ok) {
    return {
      configured: true,
      ok: true,
      provider: 'openai_compatible',
      endpointId: opts.endpointId,
      name: opts.name,
      model,
      baseUrl: normalizedUrl,
      availableModels,
      message: `Connected cleanly to ${opts.name} and verified model "${model}".`,
    };
  }

  return {
    configured: true,
    ok: false,
    provider: 'openai_compatible',
    endpointId: opts.endpointId,
    name: opts.name,
    model,
    baseUrl: normalizedUrl,
    availableModels,
    message: probe.message,
  };
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function extractChoiceMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          part &&
          typeof part === 'object' &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

export async function callOpenAICompatibleStoryboard(opts: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const normalizedUrl = normalizeOpenAIBaseUrl(opts.baseUrl);
  const headers = buildAuthHeaders(opts.apiKey, true);

  let formatMode: 'json_schema' | 'json_object' | 'none' = 'json_schema';
  let useMaxCompletionTokens = false;
  let includeTemperature = true;

  for (let compatHop = 0; compatHop < 6; compatHop++) {
    const payload: Record<string, unknown> = {
      model: opts.model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userPrompt },
      ],
    };

    if (includeTemperature) {
      payload.temperature = opts.temperature ?? 0.85;
    }
    if (useMaxCompletionTokens) {
      payload.max_completion_tokens = 8192;
    } else {
      payload.max_tokens = 8192;
    }
    if (formatMode === 'json_schema') {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'reel_storyboard',
          strict: false,
          schema: opts.jsonSchema ?? GEMINI_STORYBOARD_JSON_SCHEMA,
        },
      };
    } else if (formatMode === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    let status = 0;
    let bodyText = '';
    const maxTransientAttempts = 4;

    for (let attempt = 1; attempt <= maxTransientAttempts; attempt++) {
      if (opts.signal?.aborted) {
        throw new Error('Cancelled');
      }

      const abort = createCombinedAbortSignal(120_000, opts.signal);
      try {
        const res = await fetch(`${normalizedUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: abort.signal,
        });
        status = res.status;
        bodyText = await readResponseTextLimited(res, COMPLETION_MAX_BYTES);
      } catch (err) {
        if (opts.signal?.aborted) {
          throw new Error('Cancelled', { cause: err });
        }
        throw new Error(formatFetchError(err, normalizedUrl, abort.timedOut(), opts.apiKey), {
          cause: err,
        });
      } finally {
        abort.cleanup();
      }

      const retryable = status === 429 || status === 502 || status === 503 || status === 504;
      if (!retryable) {
        break;
      }
      if (attempt === maxTransientAttempts) {
        throw new Error(extractApiErrorMessage(status, bodyText, opts.apiKey));
      }

      const baseMs = 1500 * Math.pow(2, attempt - 1);
      const jitterMs = Math.floor(Math.random() * 400);
      await sleepWithAbort(baseMs + jitterMs, opts.signal);
    }

    if (status === 400 || status === 422) {
      const errMsg = extractApiErrorMessage(status, bodyText, opts.apiKey);
      const lower = errMsg.toLowerCase();

      if (
        !useMaxCompletionTokens &&
        (lower.includes('max_completion_tokens') || lower.includes('max_tokens'))
      ) {
        useMaxCompletionTokens = true;
        continue;
      }
      if (includeTemperature && lower.includes('temperature')) {
        includeTemperature = false;
        continue;
      }
      if (
        formatMode === 'json_schema' &&
        (lower.includes('response_format') ||
          lower.includes('json_schema') ||
          lower.includes('schema') ||
          lower.includes('unsupported') ||
          lower.includes('not supported'))
      ) {
        formatMode = 'json_object';
        continue;
      }
      if (
        formatMode === 'json_object' &&
        (lower.includes('response_format') ||
          lower.includes('json_object') ||
          lower.includes('unsupported') ||
          lower.includes('not supported'))
      ) {
        formatMode = 'none';
        continue;
      }

      throw new Error(errMsg);
    }

    if (status < 200 || status >= 300) {
      throw new Error(extractApiErrorMessage(status, bodyText, opts.apiKey));
    }

    let parsed: {
      error?: unknown;
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          content?: unknown;
          refusal?: unknown;
        };
      }>;
    };
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      throw new Error('LLM endpoint returned invalid JSON envelope.');
    }

    if (parsed.error) {
      throw new Error(extractApiErrorMessage(status, bodyText, opts.apiKey));
    }

    const choice = parsed.choices?.[0];
    if (!choice) {
      throw new Error('LLM endpoint returned no completion choices.');
    }
    if (choice.message?.refusal) {
      throw new Error(
        `LLM refused request: ${redactSecret(String(choice.message.refusal), opts.apiKey)}`,
      );
    }

    const text = extractChoiceMessageText(choice.message?.content).trim();
    if (!text) {
      if (choice.finish_reason === 'length') {
        throw new Error(
          'LLM response was truncated at token limit (finish_reason: length). Try a model with a higher output limit.',
        );
      }
      throw new Error('LLM returned empty storyboard response.');
    }

    try {
      return extractJsonFromLlmText(text);
    } catch (err) {
      if (choice.finish_reason === 'length') {
        throw new Error(
          'LLM response was truncated at token limit (finish_reason: length). Try a model with a higher output limit.',
          { cause: err },
        );
      }
      throw err;
    }
  }

  throw new Error('LLM endpoint failed after exhausting parameter compatibility fallbacks.');
}
