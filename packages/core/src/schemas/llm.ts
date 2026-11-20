import { z } from 'zod';

export const LLM_PROVIDERS = ['gemini', 'openai_compatible'] as const;
export const LlmProviderSchema = z.enum(LLM_PROVIDERS);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const LLM_ENDPOINT_SOURCES = ['builtin', 'env', 'custom'] as const;
export const LlmEndpointSourceSchema = z.enum(LLM_ENDPOINT_SOURCES);
export type LlmEndpointSource = z.infer<typeof LlmEndpointSourceSchema>;

export const LlmEndpointPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: LlmProviderSchema,
  source: LlmEndpointSourceSchema,
  baseUrl: z.string(),
  model: z.string(),
  hasApiKey: z.boolean(),
  apiKeyHint: z.string().nullable(),
  configured: z.boolean(),
  editable: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type LlmEndpointPublicDto = z.infer<typeof LlmEndpointPublicSchema>;

export interface LlmEndpointPreset {
  id: string;
  label: string;
  name: string;
  baseUrl: string;
  placeholderModel: string;
  requiresApiKey: boolean;
  description: string;
}

export const LLM_ENDPOINT_PRESETS: readonly LlmEndpointPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    name: 'Ollama Local',
    baseUrl: 'http://127.0.0.1:11434/v1',
    placeholderModel: 'qwen2.5:14b',
    requiresApiKey: false,
    description: 'Local open-weight models via Ollama (run ollama serve).',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    name: 'LM Studio Local',
    baseUrl: 'http://127.0.0.1:1234/v1',
    placeholderModel: 'local-model',
    requiresApiKey: false,
    description: 'Local desktop inference server on macOS.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    placeholderModel: 'anthropic/claude-sonnet-4',
    requiresApiKey: true,
    description: 'Access Claude, GPT, DeepSeek, Llama, and Qwen with one key.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    placeholderModel: 'gpt-4.1',
    requiresApiKey: true,
    description: 'Official OpenAI API or compatible enterprise gateway.',
  },
  {
    id: 'groq',
    label: 'Groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    placeholderModel: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    description: 'Ultra-fast LPU inference for Llama and Qwen models.',
  },
  {
    id: 'custom',
    label: 'Custom',
    name: 'Custom LLM',
    baseUrl: '',
    placeholderModel: 'my-model',
    requiresApiKey: false,
    description: 'Any vLLM, LiteLLM, Together, Fireworks, or self-hosted /v1 server.',
  },
] as const;

export const RESERVED_LLM_ENDPOINT_IDS = new Set(['gemini', 'env_openai_compatible']);

export function maskApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.length < 12) return '••••';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

export function validateApiKeyValue(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length > 500) {
    throw new Error('API key is too long (max 500 characters).');
  }
  if (/[^\x21-\x7E]/.test(trimmed)) {
    throw new Error('API key contains invalid whitespace or control characters.');
  }
  return trimmed;
}

export function normalizeOpenAIBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Base URL is required.');
  }
  if (trimmed.length > 500) {
    throw new Error('Base URL is too long (max 500 characters).');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Base URL must be a valid http:// or https:// URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL must start with http:// or https://.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Do not embed credentials in the Base URL. Use the API Key field instead.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Base URL must not contain query parameters or hash fragments.');
  }

  let cleanedPath = parsed.pathname.replace(/\/+$/, '');
  cleanedPath = cleanedPath.replace(/(?:\/chat\/completions|\/models)$/i, '');
  cleanedPath = cleanedPath.replace(/\/+$/, '');
  if (cleanedPath === '/') {
    cleanedPath = '';
  }

  return `${parsed.origin}${cleanedPath}`;
}

export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}
