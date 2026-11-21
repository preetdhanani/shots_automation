import type { AppEnv } from '../config/env.js';
import type { AppSettings, Store } from '../db/store.js';
import { maskApiKey, normalizeOpenAIBaseUrl, type LlmEndpointPublicDto } from '../schemas/llm.js';

export interface ResolvedLlmEndpoint extends LlmEndpointPublicDto {
  apiKey: string;
}

export function toPublicLlmEndpoint(ep: ResolvedLlmEndpoint): LlmEndpointPublicDto {
  return {
    id: ep.id,
    name: ep.name,
    provider: ep.provider,
    source: ep.source,
    baseUrl: ep.baseUrl,
    model: ep.model,
    hasApiKey: ep.hasApiKey,
    apiKeyHint: ep.apiKeyHint,
    configured: ep.configured,
    editable: ep.editable,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
  };
}

export function getDefaultAppSettingsFromEnv(env: AppEnv): AppSettings {
  return {
    defaultVoice: env.GEMINI_TTS_VOICE,
    brandHandle: env.BRAND_HANDLE,
    musicEnabled: true,
    musicVolumeDb: -22,
    activeLlmEndpointId: null,
    aiBrollEnabled: false,
    voiceRotation: false,
  };
}

export function resolveAllLlmEndpoints(store: Store, env: AppEnv): ResolvedLlmEndpoint[] {
  const endpoints: ResolvedLlmEndpoint[] = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      provider: 'gemini',
      source: 'builtin',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: env.GEMINI_TEXT_MODEL,
      apiKey: env.GEMINI_API_KEY,
      hasApiKey: Boolean(env.GEMINI_API_KEY.trim()),
      apiKeyHint: maskApiKey(env.GEMINI_API_KEY),
      configured: Boolean(env.GEMINI_API_KEY.trim()),
      editable: false,
      createdAt: null,
      updatedAt: null,
    },
  ];

  const envBaseRaw = env.OPENAI_COMPAT_BASE_URL.trim();
  if (envBaseRaw) {
    let normalizedUrl = envBaseRaw;
    let urlValid = true;
    try {
      normalizedUrl = normalizeOpenAIBaseUrl(envBaseRaw);
    } catch {
      urlValid = false;
    }
    const envModel = env.OPENAI_COMPAT_MODEL.trim();
    endpoints.push({
      id: 'env_openai_compatible',
      name: env.OPENAI_COMPAT_NAME.trim() || 'OpenAI-Compatible (.env)',
      provider: 'openai_compatible',
      source: 'env',
      baseUrl: normalizedUrl,
      model: envModel,
      apiKey: env.OPENAI_COMPAT_API_KEY,
      hasApiKey: Boolean(env.OPENAI_COMPAT_API_KEY.trim()),
      apiKeyHint: maskApiKey(env.OPENAI_COMPAT_API_KEY),
      configured: Boolean(urlValid && envModel),
      editable: false,
      createdAt: null,
      updatedAt: null,
    });
  }

  for (const row of store.listLlmEndpoints()) {
    let normalizedUrl = row.baseUrl;
    let urlValid = Boolean(row.baseUrl.trim());
    if (urlValid) {
      try {
        normalizedUrl = normalizeOpenAIBaseUrl(row.baseUrl);
      } catch {
        urlValid = false;
      }
    }
    endpoints.push({
      id: row.id,
      name: row.name,
      provider: 'openai_compatible',
      source: 'custom',
      baseUrl: normalizedUrl,
      model: row.model,
      apiKey: row.apiKey,
      hasApiKey: Boolean(row.apiKey.trim()),
      apiKeyHint: maskApiKey(row.apiKey),
      configured: Boolean(urlValid && row.model.trim()),
      editable: true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return endpoints;
}

export function resolveActiveLlmEndpoint(
  store: Store,
  env: AppEnv,
  overrideId?: string,
): { active: ResolvedLlmEndpoint; all: ResolvedLlmEndpoint[] } {
  const all = resolveAllLlmEndpoints(store, env);

  if (overrideId !== undefined && overrideId.trim() !== '') {
    const match = all.find((ep) => ep.id === overrideId.trim());
    if (!match) {
      throw new Error(`Unknown LLM endpoint "${overrideId}".`);
    }
    return { active: match, all };
  }

  const settings = store.getSettings(getDefaultAppSettingsFromEnv(env));
  if (settings.activeLlmEndpointId) {
    const pinned = all.find((ep) => ep.id === settings.activeLlmEndpointId);
    if (pinned) {
      return { active: pinned, all };
    }
  }

  if (env.LLM_PROVIDER === 'openai_compatible') {
    const envCompat = all.find((ep) => ep.id === 'env_openai_compatible');
    if (envCompat) {
      return { active: envCompat, all };
    }
  }

  return { active: all[0]!, all };
}
