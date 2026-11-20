import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { VOICE_NAMES } from '../schemas/storyboard.js';

const BooleanFlagSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    if (!val) return false;
    return val.trim().toLowerCase() === 'true' || val.trim() === '1';
  });

const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(['gemini', 'openai_compatible']).default('gemini'),
  GEMINI_API_KEY: z.string().trim().default(''),
  GEMINI_TEXT_MODEL: z.string().trim().min(1).default('gemini-3.8-flash'),
  GEMINI_TTS_MODEL: z.string().trim().min(1).default('gemini-3.8-flash-tts'),
  GEMINI_TTS_VOICE: z.enum(VOICE_NAMES).default('Puck'),
  ENABLE_GEMINI_SEARCH_GROUNDING: BooleanFlagSchema,

  OPENAI_COMPAT_NAME: z.string().trim().default('OpenAI-Compatible (.env)'),
  OPENAI_COMPAT_BASE_URL: z.string().trim().default(''),
  OPENAI_COMPAT_API_KEY: z.string().trim().default(''),
  OPENAI_COMPAT_MODEL: z.string().trim().default(''),

  META_GRAPH_API_VERSION: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/)
    .default('v27.0'),
  META_APP_ID: z.string().trim().default(''),
  META_APP_SECRET: z.string().trim().default(''),
  META_IG_USER_ID: z.string().trim().default(''),
  META_ACCESS_TOKEN: z.string().trim().default(''),

  GITHUB_TOKEN: z.string().trim().default(''),

  BRAND_HANDLE: z.string().trim().default('@ai.dev.reels'),
  WHISPER_CLI_PATH: z.string().trim().default(''),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  DATA_DIR: z.string().trim().min(1).default('./data'),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  WORKSPACE_ROOT: string;
  DATA_DIR_ABS: string;
  CACHE_DIR_ABS: string;
};

let cachedWorkspaceRoot: string | null = null;
const dotEnvManagedKeys = new Set<string>();

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  if (cachedWorkspaceRoot && startDir === process.cwd()) {
    return cachedWorkspaceRoot;
  }

  let current = path.resolve(startDir);
  while (true) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { workspaces?: unknown };
        if (Array.isArray(pkg.workspaces)) {
          if (startDir === process.cwd()) {
            cachedWorkspaceRoot = current;
          }
          return current;
        }
      } catch {
        // Ignore unreadable package.json while walking upward
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(startDir);
}

function readDotEnvFile(workspaceRoot: string): Record<string, string> {
  const envPath = path.join(workspaceRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const parsed = parseEnv(content);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

export function reloadDotEnv(workspaceRoot: string = findWorkspaceRoot()): AppEnv {
  const fileVars = readDotEnvFile(workspaceRoot);

  for (const key of dotEnvManagedKeys) {
    if (!(key in fileVars)) {
      delete process.env[key];
    }
  }
  dotEnvManagedKeys.clear();

  for (const [key, value] of Object.entries(fileVars)) {
    process.env[key] = value;
    dotEnvManagedKeys.add(key);
  }

  return loadEnv({}, workspaceRoot);
}

export function loadEnv(
  overrides: Partial<Record<string, string | undefined>> = {},
  workspaceRoot: string = findWorkspaceRoot(),
): AppEnv {
  const fileVars = readDotEnvFile(workspaceRoot);
  const merged: Record<string, string | undefined> = {
    ...fileVars,
    ...process.env,
    ...overrides,
  };

  for (const [key, value] of Object.entries(merged)) {
    if (value === '') {
      delete merged[key];
    }
  }

  const parsed = EnvSchema.parse(merged);
  const dataDirAbs = path.isAbsolute(parsed.DATA_DIR)
    ? parsed.DATA_DIR
    : path.resolve(workspaceRoot, parsed.DATA_DIR);

  return {
    ...parsed,
    WORKSPACE_ROOT: workspaceRoot,
    DATA_DIR_ABS: dataDirAbs,
    CACHE_DIR_ABS: path.resolve(workspaceRoot, '.cache'),
  };
}
