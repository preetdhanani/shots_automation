import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  BACKGROUND_IDS,
  BACKGROUND_LABELS,
  CAMERA_MOVE_IDS,
  CAMERA_MOVE_LABELS,
  CAPTION_STYLE_IDS,
  CAPTION_STYLE_LABELS,
  checkFfmpegAvailability,
  checkGeminiHealth,
  checkMetaHealth,
  checkOpenAICompatibleHealth,
  computeFeedCleanCutoffMs,
  computeFreshness,
  computeReelFingerprint,
  computeStaleness,
  createCustomTopic,
  ensureWhisperModelDownloaded,
  FeedCleanIntervalSchema,
  fetchAndStoreTopics,
  fetchOpenAICompatibleModels,
  getDefaultAppSettingsFromEnv,
  getOrCreateVoicePreview,
  getVoicePreviewHash,
  getWhisperDownloadProgress,
  getWhisperSetupStatus,
  HOOK_STYLE_IDS,
  HOOK_STYLE_LABELS,
  LAYOUT_LABELS,
  MUSIC_MOOD_IDS,
  MUSIC_MOOD_LABELS,
  normalizeOpenAIBaseUrl,
  PALETTE_IDS,
  PALETTE_LABELS,
  PillarSchema,
  REEL_FORMAT_LIST,
  ReelFormatIdSchema,
  ReelStoryboardSchema,
  reloadDotEnv,
  RESERVED_LLM_ENDPOINT_IDS,
  resolveActiveLlmEndpoint,
  resolveAllLlmEndpoints,
  restyleStoryboard,
  SCENE_LAYOUTS,
  subscribeWhisperProgress,
  toPublicLlmEndpoint,
  TRANSITION_IDS,
  TRANSITION_LABELS,
  TYPOGRAPHY_IDS,
  TYPOGRAPHY_LABELS,
  validateApiKeyValue,
  validateStoryboardEditorial,
  VoiceNameSchema,
  type AppEnv,
  type LlmHealthResult,
  type LocalAssetStorage,
  type PipelineQueue,
  type PipelineRunRecord,
  type ReelCaptionsFile,
  type ReelOrchestrator,
  type ReelRecord,
  type ReelStatus,
  type RunStreamEvent,
  type Store,
  type TopicStatus,
} from '@post/core';
import { streamFileWithRange } from './range.js';

export interface ServerAppDeps {
  getEnv: () => AppEnv;
  setEnv?: (next: AppEnv) => void;
  store: Store;
  storage: LocalAssetStorage;
  queue: PipelineQueue;
  orchestrator: ReelOrchestrator;
  dashboardDistDir?: string;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return true; // In-process Hono app.request() without Host header
  const lower = hostHeader.trim().toLowerCase();
  return (
    lower === `127.0.0.1:${port}` ||
    lower === `localhost:${port}` ||
    lower === '127.0.0.1' ||
    lower === 'localhost'
  );
}

function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (!origin) return true;
  const lower = origin.trim().toLowerCase();
  const prodAllowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (prodAllowed.has(lower)) return true;

  if (process.env.NODE_ENV !== 'production') {
    const devAllowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
    if (devAllowed.has(lower)) return true;
  }
  return false;
}

function formatSsePayload(run: PipelineRunRecord, extra?: Record<string, unknown>): string {
  return JSON.stringify({ run, ...extra });
}

export function createServerApp(deps: ServerAppDeps): Hono {
  const app = new Hono();

  const currentEnv = () => deps.getEnv();
  const refreshEnv = () => {
    if (!deps.setEnv) {
      return currentEnv();
    }
    const next = reloadDotEnv(deps.getEnv().WORKSPACE_ROOT);
    deps.setEnv(next);
    return next;
  };
  const defaultAppSettings = () => getDefaultAppSettingsFromEnv(currentEnv());
  const buildLlmState = (env: AppEnv) => {
    const { active, all } = resolveActiveLlmEndpoint(deps.store, env);
    return {
      activeEndpointId: active.id,
      activeEndpoint: toPublicLlmEndpoint(active),
      endpoints: all.map(toPublicLlmEndpoint),
      scriptLlmReady: active.configured,
      ttsReady: Boolean(env.GEMINI_API_KEY.trim()),
    };
  };

  function resolveDraftOpenAICredentials(
    env: AppEnv,
    input: { endpointId?: string; baseUrl?: string; apiKey?: string; clearApiKey?: boolean },
  ): {
    targetBaseUrl: string;
    targetApiKey: string;
    saved: ReturnType<typeof resolveAllLlmEndpoints>[number] | undefined;
  } {
    const all = resolveAllLlmEndpoints(deps.store, env);
    const saved = input.endpointId ? all.find((ep) => ep.id === input.endpointId) : undefined;
    if (input.endpointId && !saved) {
      const err = new Error(`Unknown LLM endpoint "${input.endpointId}".`) as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }
    if (saved && saved.provider !== 'openai_compatible') {
      const err = new Error('Selected endpoint is not OpenAI-compatible.') as Error & {
        status?: number;
      };
      err.status = 400;
      throw err;
    }

    const rawBaseUrl = input.baseUrl?.trim() ? input.baseUrl : (saved?.baseUrl ?? '');
    const targetBaseUrl = normalizeOpenAIBaseUrl(rawBaseUrl);

    let targetApiKey = '';
    if (input.clearApiKey === true) {
      targetApiKey = '';
    } else if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
      targetApiKey = validateApiKeyValue(input.apiKey);
    } else if (saved) {
      let normalizedSavedBase: string;
      try {
        normalizedSavedBase = normalizeOpenAIBaseUrl(saved.baseUrl);
      } catch {
        normalizedSavedBase = '';
      }
      // Security: never forward a stored secret if the caller changed the target baseUrl
      if (normalizedSavedBase && normalizedSavedBase === targetBaseUrl) {
        targetApiKey = saved.apiKey;
      }
    }

    return { targetBaseUrl, targetApiKey, saved };
  }

  // Security middleware on /api/*
  app.use('/api/*', async (c, next) => {
    const env = currentEnv();
    const host = c.req.header('host');
    if (!isAllowedHost(host, env.SERVER_PORT)) {
      return c.json({ error: 'Forbidden Host header' }, 403);
    }

    if (MUTATING_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin && !isAllowedOrigin(origin, env.SERVER_PORT)) {
        return c.json({ error: 'Forbidden Origin' }, 403);
      }
      const referer = c.req.header('referer');
      if (!origin && referer) {
        try {
          const refOrigin = new URL(referer).origin;
          if (!isAllowedOrigin(refOrigin, env.SERVER_PORT)) {
            return c.json({ error: 'Forbidden Referer' }, 403);
          }
        } catch {
          return c.json({ error: 'Invalid Referer' }, 403);
        }
      }

      const csrfHeader = c.req.header('x-post-csrf');
      const contentType = c.req.header('content-type') ?? '';
      if (csrfHeader !== '1' && !contentType.toLowerCase().includes('application/json')) {
        return c.json(
          { error: 'Missing required X-Post-CSRF: 1 or application/json header.' },
          403,
        );
      }
    }

    await next();
  });

  // Health & Setup
  app.get('/api/health', async (c) => {
    const env = currentEnv();
    const [ffmpeg, whisper] = await Promise.all([
      checkFfmpegAvailability(),
      getWhisperSetupStatus(env),
    ]);
    const activeRuns = deps.store.listActivePipelineRuns();
    const reviewReels = deps.store.listReels({
      statuses: ['PUBLISHING', 'GENERATING', 'READY_FOR_REVIEW'],
      limit: 200,
    });
    const settings = deps.store.getSettings(defaultAppSettings());

    return c.json({
      ok: true,
      geminiConfigured: Boolean(env.GEMINI_API_KEY.trim()),
      geminiTextModel: env.GEMINI_TEXT_MODEL,
      geminiTtsModel: env.GEMINI_TTS_MODEL,
      searchGroundingEnabled: env.ENABLE_GEMINI_SEARCH_GROUNDING,
      metaConfigured: Boolean(env.META_IG_USER_ID.trim() && env.META_ACCESS_TOKEN.trim()),
      metaVersion: env.META_GRAPH_API_VERSION,
      ffmpeg,
      whisper,
      activeRunCount: activeRuns.length,
      pendingReviewCount: reviewReels.length,
      settings,
      llm: buildLlmState(env),
    });
  });

  app.post('/api/gemini/check', async (c) => {
    const env = refreshEnv();
    const result = await checkGeminiHealth({
      apiKey: env.GEMINI_API_KEY,
      textModel: env.GEMINI_TEXT_MODEL,
      ttsModel: env.GEMINI_TTS_MODEL,
    });
    return c.json(result);
  });

  // LLM Endpoints & Models
  app.get('/api/llm/endpoints', (c) => {
    return c.json(buildLlmState(currentEnv()));
  });

  app.post('/api/llm/endpoints', async (c) => {
    const CreateEndpointSchema = z.object({
      name: z.string().trim().min(1, 'Name is required.').max(80),
      baseUrl: z.string().trim().min(1, 'Base URL is required.').max(500),
      model: z.string().trim().min(1, 'Model ID is required.').max(160),
      apiKey: z.string().max(500).optional(),
      setActive: z.boolean().optional(),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = CreateEndpointSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid endpoint payload' }, 400);
    }

    try {
      const created = deps.store.createLlmEndpoint({
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
        model: parsed.data.model,
        apiKey: parsed.data.apiKey,
      });
      if (parsed.data.setActive !== false) {
        deps.store.updateSettings({ activeLlmEndpointId: created.id }, defaultAppSettings());
      }
      const state = buildLlmState(currentEnv());
      const endpoint = state.endpoints.find((ep) => ep.id === created.id)!;
      return c.json({ endpoint, ...state }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid endpoint' }, 400);
    }
  });

  app.patch('/api/llm/endpoints/:id', async (c) => {
    const id = c.req.param('id');
    if (RESERVED_LLM_ENDPOINT_IDS.has(id)) {
      return c.json({ error: 'Built-in and .env endpoints cannot be edited here.' }, 400);
    }

    const UpdateEndpointSchema = z.object({
      name: z.string().trim().min(1, 'Name is required.').max(80).optional(),
      baseUrl: z.string().trim().min(1, 'Base URL is required.').max(500).optional(),
      model: z.string().trim().min(1, 'Model ID is required.').max(160).optional(),
      apiKey: z.string().max(500).optional(),
      clearApiKey: z.boolean().optional(),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateEndpointSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid endpoint update' }, 400);
    }

    try {
      const updated = deps.store.updateLlmEndpoint(id, parsed.data);
      if (!updated) {
        return c.json({ error: 'LLM endpoint not found' }, 404);
      }
      const state = buildLlmState(currentEnv());
      const endpoint = state.endpoints.find((ep) => ep.id === updated.id)!;
      return c.json({ endpoint, ...state });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid endpoint update' }, 400);
    }
  });

  app.delete('/api/llm/endpoints/:id', (c) => {
    const id = c.req.param('id');
    if (RESERVED_LLM_ENDPOINT_IDS.has(id)) {
      return c.json({ error: 'Built-in and .env endpoints cannot be deleted.' }, 400);
    }
    const deleted = deps.store.deleteLlmEndpoint(id);
    if (!deleted) {
      return c.json({ error: 'LLM endpoint not found' }, 404);
    }
    return c.json({ deleted: true, id, ...buildLlmState(currentEnv()) });
  });

  app.post('/api/llm/select', async (c) => {
    const SelectSchema = z.object({
      endpointId: z.string().trim().min(1),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = SelectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'endpointId is required.' }, 400);
    }

    const all = resolveAllLlmEndpoints(deps.store, currentEnv());
    if (!all.some((ep) => ep.id === parsed.data.endpointId)) {
      return c.json({ error: `Unknown LLM endpoint "${parsed.data.endpointId}".` }, 404);
    }

    deps.store.updateSettings(
      { activeLlmEndpointId: parsed.data.endpointId },
      defaultAppSettings(),
    );
    return c.json(buildLlmState(currentEnv()));
  });

  app.post('/api/llm/models', async (c) => {
    const ModelsSchema = z.object({
      endpointId: z.string().trim().min(1).optional(),
      baseUrl: z.string().trim().max(500).optional(),
      apiKey: z.string().max(500).optional(),
      clearApiKey: z.boolean().optional(),
    });
    const body = await c.req.json().catch(() => ({}));
    const parsed = ModelsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
    }
    if (parsed.data.endpointId === 'gemini') {
      return c.json(
        { error: 'Model discovery is only available for OpenAI-compatible endpoints.' },
        400,
      );
    }

    const env = parsed.data.endpointId === 'env_openai_compatible' ? refreshEnv() : currentEnv();

    let resolved: ReturnType<typeof resolveDraftOpenAICredentials>;
    try {
      resolved = resolveDraftOpenAICredentials(env, parsed.data);
    } catch (err) {
      const status = (err as Error & { status?: number }).status === 404 ? 404 : 400;
      return c.json({ error: err instanceof Error ? err.message : 'Invalid Base URL' }, status);
    }

    const res = await fetchOpenAICompatibleModels({
      baseUrl: resolved.targetBaseUrl,
      apiKey: resolved.targetApiKey,
    });
    return c.json({
      ok: res.ok,
      models: res.models,
      baseUrl: resolved.targetBaseUrl,
      message: res.message,
    });
  });

  app.post('/api/llm/check', async (c) => {
    const CheckSchema = z.object({
      endpointId: z.string().trim().min(1).optional(),
      baseUrl: z.string().trim().max(500).optional(),
      model: z.string().trim().max(160).optional(),
      apiKey: z.string().max(500).optional(),
      clearApiKey: z.boolean().optional(),
    });
    const body = await c.req.json().catch(() => ({}));
    const parsed = CheckSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid check payload' }, 400);
    }

    const { endpointId, baseUrl, model, apiKey, clearApiKey } = parsed.data;
    const baseEnv = currentEnv();
    const { active } = resolveActiveLlmEndpoint(deps.store, baseEnv);

    const checkGemini =
      endpointId === 'gemini' || (!endpointId && !baseUrl && active.id === 'gemini');

    if (checkGemini) {
      const env = refreshEnv();
      const gem = await checkGeminiHealth({
        apiKey: env.GEMINI_API_KEY,
        textModel: env.GEMINI_TEXT_MODEL,
        ttsModel: env.GEMINI_TTS_MODEL,
      });
      const result: LlmHealthResult = {
        configured: gem.configured,
        ok: gem.ok,
        provider: 'gemini',
        endpointId: 'gemini',
        name: 'Google Gemini',
        model: gem.textModel,
        baseUrl: 'https://generativelanguage.googleapis.com',
        ttsModel: gem.ttsModel,
        message: gem.message,
      };
      return c.json(result);
    }

    const effectiveEndpointId = endpointId ?? (!baseUrl ? active.id : undefined);
    const env = effectiveEndpointId === 'env_openai_compatible' ? refreshEnv() : baseEnv;

    let resolved: ReturnType<typeof resolveDraftOpenAICredentials>;
    try {
      resolved = resolveDraftOpenAICredentials(env, {
        endpointId: effectiveEndpointId,
        baseUrl,
        apiKey,
        clearApiKey,
      });
    } catch (err) {
      const status = (err as Error & { status?: number }).status === 404 ? 404 : 400;
      return c.json({ error: err instanceof Error ? err.message : 'Invalid Base URL' }, status);
    }

    const result = await checkOpenAICompatibleHealth({
      endpointId: resolved.saved?.id ?? 'draft',
      name: resolved.saved?.name ?? 'Custom Endpoint',
      baseUrl: resolved.targetBaseUrl,
      model: model?.trim() || resolved.saved?.model || '',
      apiKey: resolved.targetApiKey,
    });
    return c.json(result);
  });

  app.post('/api/meta/check', async (c) => {
    const env = refreshEnv();
    const result = await checkMetaHealth(env);
    return c.json(result);
  });

  app.post('/api/setup/whisper', async (c) => {
    const env = currentEnv();
    const status = await getWhisperSetupStatus(env);
    if (!status.cliAvailable) {
      return c.json(
        {
          error: 'whisper-cli binary not found. Install via Homebrew: brew install whisper-cpp',
          status,
        },
        400,
      );
    }
    if (!status.modelAvailable && !status.downloading) {
      void ensureWhisperModelDownloaded(env).catch(() => {
        // Progress & error captured via whisperSetup state and SSE
      });
    }
    return c.json({
      started: !status.modelAvailable,
      progress: getWhisperDownloadProgress(),
      status: await getWhisperSetupStatus(env),
    });
  });

  app.get('/api/setup/whisper/events', (c) => {
    return streamSSE(c, async (stream) => {
      const sendProgress = async (progress: ReturnType<typeof getWhisperDownloadProgress>) => {
        await stream.writeSSE({
          event:
            progress.status === 'error'
              ? 'error'
              : progress.status === 'done'
                ? 'done'
                : 'progress',
          data: JSON.stringify(progress),
        });
      };

      const current = getWhisperDownloadProgress();
      await sendProgress(current);
      if (current.status === 'done' || current.status === 'error') {
        return;
      }

      let closed = false;
      const keepalive = setInterval(() => {
        if (!closed) {
          void stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
        }
      }, 15_000);

      await new Promise<void>((resolve) => {
        const unsubscribe = subscribeWhisperProgress((progress) => {
          void sendProgress(progress).then(() => {
            if (progress.status === 'done' || progress.status === 'error') {
              closed = true;
              clearInterval(keepalive);
              unsubscribe();
              resolve();
            }
          });
        });

        stream.onAbort(() => {
          closed = true;
          clearInterval(keepalive);
          unsubscribe();
          resolve();
        });
      });
    });
  });

  // Voice previews
  app.post('/api/tts/preview', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { voiceName?: unknown };
    const parsedVoice = VoiceNameSchema.safeParse(body.voiceName);
    if (!parsedVoice.success) {
      return c.json({ error: 'Invalid voiceName' }, 400);
    }

    const env = refreshEnv();
    const modelHash = getVoicePreviewHash(env.GEMINI_TTS_MODEL);
    const cachedPath = deps.storage.getVoicePreviewPath(parsedVoice.data, modelHash);
    if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 4000) {
      return c.json({ url: `/api/tts/preview/${parsedVoice.data}`, cached: true });
    }

    if (!env.GEMINI_API_KEY.trim()) {
      return c.json(
        { error: 'GEMINI_API_KEY is missing in .env; cannot generate uncached voice preview.' },
        400,
      );
    }

    try {
      const res = await getOrCreateVoicePreview(env, deps.storage, parsedVoice.data);
      return c.json({ url: `/api/tts/preview/${parsedVoice.data}`, cached: res.cached });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed to generate voice preview' },
        500,
      );
    }
  });

  app.get('/api/tts/preview/:voice', (c) => {
    const parsedVoice = VoiceNameSchema.safeParse(c.req.param('voice'));
    if (!parsedVoice.success) {
      return c.json({ error: 'Invalid voice name' }, 400);
    }
    const modelHash = getVoicePreviewHash(currentEnv().GEMINI_TTS_MODEL);
    const filePath = deps.storage.getVoicePreviewPath(parsedVoice.data, modelHash);
    return streamFileWithRange(c, filePath, 'audio/wav');
  });

  // Settings
  app.get('/api/settings', (c) => {
    return c.json({ settings: deps.store.getSettings(defaultAppSettings()) });
  });

  app.patch('/api/settings', async (c) => {
    const PatchSettingsSchema = z.object({
      defaultVoice: VoiceNameSchema.optional(),
      brandHandle: z.string().trim().max(40).optional(),
      musicEnabled: z.boolean().optional(),
      musicVolumeDb: z.number().min(-40).max(-6).optional(),
      minPublishSpacingHours: z.number().min(0).max(48).optional(),
      activeLlmEndpointId: z.string().trim().min(1).nullable().optional(),
      aiBrollEnabled: z.boolean().optional(),
      voiceRotation: z.boolean().optional(),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = PatchSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, 400);
    }
    if (typeof parsed.data.activeLlmEndpointId === 'string') {
      const all = resolveAllLlmEndpoints(deps.store, currentEnv());
      if (!all.some((ep) => ep.id === parsed.data.activeLlmEndpointId)) {
        return c.json({ error: `Unknown LLM endpoint "${parsed.data.activeLlmEndpointId}".` }, 400);
      }
    }
    const updated = deps.store.updateSettings(parsed.data, defaultAppSettings());
    return c.json({ settings: updated });
  });

  // Video Variety registries & recent fingerprints
  app.get('/api/variety', (c) => {
    const recentFingerprints = deps.store
      .listRecentReelsForVariety(12)
      .map((r) => computeReelFingerprint(r));

    return c.json({
      formats: REEL_FORMAT_LIST.map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        sceneCount: f.sceneCount,
      })),
      hookStyles: HOOK_STYLE_IDS.map((id) => ({ id, label: HOOK_STYLE_LABELS[id] })),
      sceneLayouts: SCENE_LAYOUTS,
      layoutLabels: LAYOUT_LABELS,
      transitions: TRANSITION_IDS.map((id) => ({ id, label: TRANSITION_LABELS[id] })),
      cameras: CAMERA_MOVE_IDS.map((id) => ({ id, label: CAMERA_MOVE_LABELS[id] })),
      backgrounds: BACKGROUND_IDS.map((id) => ({ id, label: BACKGROUND_LABELS[id] })),
      typographies: TYPOGRAPHY_IDS.map((id) => ({ id, label: TYPOGRAPHY_LABELS[id] })),
      captionStyles: CAPTION_STYLE_IDS.map((id) => ({ id, label: CAPTION_STYLE_LABELS[id] })),
      palettes: PALETTE_IDS.map((id) => ({ id, label: PALETTE_LABELS[id] })),
      musicMoods: MUSIC_MOOD_IDS.map((id) => ({ id, label: MUSIC_MOOD_LABELS[id] })),
      recentFingerprints,
    });
  });

  // Topics
  app.get('/api/topics', (c) => {
    const pillarParam = c.req.query('pillar');
    const statusParam = c.req.query('status');
    const pillar = pillarParam ? PillarSchema.safeParse(pillarParam).data : undefined;
    const status = (statusParam as TopicStatus | undefined) ?? 'NEW';
    const topics = deps.store.listTopics({ pillar, status, limit: 120 });
    return c.json({ topics });
  });

  app.post('/api/topics/fetch', async (c) => {
    const env = refreshEnv();
    const result = await fetchAndStoreTopics(deps.store, env);
    return c.json(result);
  });

  app.post('/api/topics/custom', async (c) => {
    const CustomSchema = z.object({
      prompt: z.string().trim().max(2000).default(''),
      url: z.string().trim().optional(),
      pillar: PillarSchema.optional(),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = CustomSchema.safeParse(body);
    if (!parsed.success || (!parsed.data.prompt && !parsed.data.url)) {
      return c.json({ error: 'Provide either a topic prompt or an http/https URL.' }, 400);
    }
    try {
      const topic = await createCustomTopic(deps.store, parsed.data);
      return c.json({ topic }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid custom topic' }, 400);
    }
  });

  app.get('/api/topics/clean/preview', (c) => {
    return c.json(deps.store.previewTopicsClean());
  });

  app.post('/api/topics/clean', async (c) => {
    const CleanSchema = z.object({
      interval: FeedCleanIntervalSchema,
    });
    const body = await c.req.json().catch(() => null);
    const parsed = CleanSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error:
            parsed.error.issues[0]?.message ?? 'Invalid clean interval. Choose 3d, 7d, or 30d.',
        },
        400,
      );
    }
    const cutoffMs = computeFeedCleanCutoffMs(parsed.data.interval);
    const cutoffIso = new Date(cutoffMs).toISOString();
    const result = deps.store.cleanTopicsOlderThan(cutoffMs);
    return c.json({
      interval: parsed.data.interval,
      cutoffIso,
      ...result,
    });
  });

  app.post('/api/topics/restore', async (c) => {
    const RestoreSchema = z.object({
      ids: z.array(z.string().trim().min(1)).min(1).max(10_000),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = RestoreSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Provide at least one topic ID to restore.',
        },
        400,
      );
    }
    const restoredCount = deps.store.restoreTopics(parsed.data.ids);
    return c.json({ restoredCount });
  });

  app.patch('/api/topics/:id/dismiss', (c) => {
    const updated = deps.store.updateTopicStatus(c.req.param('id'), 'DISMISSED');
    if (!updated) return c.json({ error: 'Topic not found' }, 404);
    return c.json({ topic: updated });
  });

  app.patch('/api/topics/:id/restore', (c) => {
    const updated = deps.store.updateTopicStatus(c.req.param('id'), 'NEW');
    if (!updated) return c.json({ error: 'Topic not found' }, 404);
    return c.json({ topic: updated });
  });

  // Reels
  app.get('/api/reels', (c) => {
    const statusQuery = c.req.query('status');
    const statuses = statusQuery
      ? (statusQuery.split(',').filter(Boolean) as ReelStatus[])
      : undefined;
    const reels = deps.store.listReels({ statuses, limit: 150 });
    const priority: Record<ReelStatus, number> = {
      PUBLISHING: 0,
      GENERATING: 1,
      READY_FOR_REVIEW: 2,
      DRAFT: 3,
      FAILED: 4,
      PUBLISHED: 5,
      REJECTED: 6,
    };
    reels.sort((a, b) => {
      const pa = priority[a.status] ?? 9;
      const pb = priority[b.status] ?? 9;
      if (pa !== pb) return pa - pb;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    const settings = deps.store.getSettings(defaultAppSettings());
    const enriched = reels.map((r) => ({
      ...r,
      staleness: computeStaleness(r, settings.brandHandle),
    }));
    return c.json({ reels: enriched });
  });

  const computeReelVarietyInfo = (reel: ReelRecord) => {
    const fingerprint = computeReelFingerprint(reel);
    const recentPeers = deps.store
      .listRecentReelsForVariety(15)
      .filter((r) => r.id !== reel.id)
      .map((r) => computeReelFingerprint(r));
    const freshness = computeFreshness(fingerprint, recentPeers);
    return { fingerprint, freshness };
  };

  app.get('/api/reels/:id', (c) => {
    const id = c.req.param('id');
    const reel = deps.store.getReel(id);
    if (!reel) return c.json({ error: 'Reel not found' }, 404);

    const topic = reel.topicId ? deps.store.getTopic(reel.topicId) : null;
    const publishAttempts = deps.store.listPublishAttempts(reel.id);
    const activeRun = deps.store.getLatestRunForReel(reel.id);
    const settings = deps.store.getSettings(defaultAppSettings());
    const staleness = computeStaleness(reel, settings.brandHandle);
    const variety = computeReelVarietyInfo(reel);

    let captionsFile: ReelCaptionsFile | null = null;
    try {
      const captionsPath = deps.storage.reelFile(reel.id, 'captions.json');
      if (fs.existsSync(captionsPath)) {
        captionsFile = JSON.parse(fs.readFileSync(captionsPath, 'utf8')) as ReelCaptionsFile;
      }
    } catch {
      captionsFile = null;
    }

    return c.json({
      reel,
      topic,
      sceneTimings: captionsFile?.sceneTimings ?? [],
      captions: captionsFile?.captions ?? [],
      publishAttempts,
      activeRun:
        activeRun && (activeRun.status === 'QUEUED' || activeRun.status === 'RUNNING')
          ? activeRun
          : null,
      latestRun: activeRun,
      staleness,
      variety,
      publishSpacing: deps.orchestrator.getPublishSpacingStatus(),
    });
  });

  app.post('/api/reels/generate', async (c) => {
    const GenerateSchema = z.object({
      topicId: z.string().trim().optional(),
      prompt: z.string().trim().optional(),
      url: z.string().trim().optional(),
      pillar: PillarSchema.optional(),
      format: z.union([ReelFormatIdSchema, z.literal('auto')]).optional(),
      voiceName: z.union([VoiceNameSchema, z.literal('auto')]).optional(),
      musicEnabled: z.boolean().optional(),
      llmEndpointId: z.string().trim().min(1).optional(),
      seed: z.number().int().optional(),
    });
    const body = await c.req.json().catch(() => null);
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid generate payload' }, 400);
    }

    const env = refreshEnv();
    let selectedEndpoint: ReturnType<typeof resolveActiveLlmEndpoint>['active'];
    try {
      selectedEndpoint = resolveActiveLlmEndpoint(
        deps.store,
        env,
        parsed.data.llmEndpointId,
      ).active;
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Unknown LLM endpoint' }, 400);
    }

    if (!selectedEndpoint.configured) {
      const message =
        selectedEndpoint.provider === 'gemini'
          ? 'Active Script LLM is Google Gemini, which requires GEMINI_API_KEY in .env. Add GEMINI_API_KEY or connect a custom OpenAI-compatible endpoint in Settings.'
          : `Selected LLM endpoint "${selectedEndpoint.name}" is incomplete. Check its Base URL and Model ID in Settings.`;
      return c.json({ error: message }, 400);
    }

    if (!env.GEMINI_API_KEY.trim()) {
      return c.json(
        {
          error: `Script LLM (${selectedEndpoint.name}) is ready, but voiceover synthesis still requires GEMINI_API_KEY in .env for Google Gemini TTS.`,
        },
        400,
      );
    }

    let topic = parsed.data.topicId ? deps.store.getTopic(parsed.data.topicId) : null;
    if (parsed.data.topicId && !topic) {
      return c.json({ error: 'Topic not found' }, 404);
    }
    if (!topic) {
      if (!parsed.data.prompt && !parsed.data.url) {
        return c.json({ error: 'Provide topicId, prompt, or url.' }, 400);
      }
      try {
        topic = await createCustomTopic(deps.store, {
          prompt: parsed.data.prompt ?? '',
          url: parsed.data.url,
          pillar: parsed.data.pillar,
        });
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Invalid URL' }, 400);
      }
    }

    const { reel, run } = deps.orchestrator.startGenerateFromTopic({
      topic,
      format: parsed.data.format,
      voiceName: parsed.data.voiceName,
      musicEnabled: parsed.data.musicEnabled,
      llmEndpointId: selectedEndpoint.id,
      seed: parsed.data.seed,
    });
    return c.json({ reel, run, topic }, 202);
  });

  app.post('/api/reels/sample', async (c) => {
    const SampleSchema = z.object({
      voiceName: VoiceNameSchema.optional(),
      musicEnabled: z.boolean().optional(),
    });
    const body = await c.req.json().catch(() => ({}));
    const parsed = SampleSchema.safeParse(body);
    const { reel, run } = deps.orchestrator.startSampleReel(parsed.success ? parsed.data : {});
    return c.json({ reel, run }, 202);
  });

  app.patch('/api/reels/:id', async (c) => {
    const id = c.req.param('id');
    const existing = deps.store.getReel(id);
    if (!existing) return c.json({ error: 'Reel not found' }, 404);
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED'].includes(existing.status)) {
      return c.json({ error: `Cannot edit reel while status is "${existing.status}".` }, 409);
    }

    const PatchSchema = z.object({
      title: z.string().trim().min(4).max(120).optional(),
      caption: z.string().trim().min(1).max(1900).optional(),
      hashtags: z.array(z.string().trim().min(2).max(40)).min(1).max(15).optional(),
      voiceName: VoiceNameSchema.optional(),
      musicEnabled: z.boolean().optional(),
      storyboard: ReelStoryboardSchema.optional(),
    });

    const body = await c.req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid reel update' }, 400);
    }

    const settings = deps.store.getSettings(defaultAppSettings());
    let nextStoryboard = parsed.data.storyboard;

    if (nextStoryboard) {
      // Preserve server-managed assets map & sync top-level caption/hashtags
      nextStoryboard = {
        ...nextStoryboard,
        caption: parsed.data.caption ?? nextStoryboard.caption,
        hashtags: parsed.data.hashtags ?? nextStoryboard.hashtags,
        ...(existing.storyboard.assets ? { assets: existing.storyboard.assets } : { assets: undefined }),
      };
      const allowAiMediaClip =
        settings.aiBrollEnabled ||
        existing.storyboard.scenes.some((s) => s.type === 'ai_media_clip');
      const editorial = validateStoryboardEditorial(nextStoryboard, { allowAiMediaClip });
      if (!editorial.ok) {
        return c.json({ error: editorial.errors.join(' ') }, 400);
      }
    } else if (parsed.data.caption !== undefined || parsed.data.hashtags !== undefined) {
      nextStoryboard = {
        ...existing.storyboard,
        caption: parsed.data.caption ?? existing.storyboard.caption,
        hashtags: parsed.data.hashtags ?? existing.storyboard.hashtags,
      };
    }

    const updated = deps.store.updateReel(id, {
      title: parsed.data.title,
      caption: parsed.data.caption,
      hashtags: parsed.data.hashtags,
      voiceName: parsed.data.voiceName,
      musicEnabled: parsed.data.musicEnabled,
      storyboard: nextStoryboard,
      pillar: nextStoryboard?.pillar,
    });
    if (!updated) return c.json({ error: 'Reel not found' }, 404);
    return c.json({
      reel: updated,
      staleness: computeStaleness(updated, settings.brandHandle),
      variety: computeReelVarietyInfo(updated),
    });
  });

  app.post('/api/reels/:id/restyle', async (c) => {
    const id = c.req.param('id');
    const existing = deps.store.getReel(id);
    if (!existing) return c.json({ error: 'Reel not found' }, 404);
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED'].includes(existing.status)) {
      return c.json({ error: `Cannot restyle reel while status is "${existing.status}".` }, 409);
    }

    const RestyleSchema = z.object({
      seed: z.number().int().optional(),
    });
    const body = await c.req.json().catch(() => ({}));
    const parsed = RestyleSchema.safeParse(body);
    const seed = parsed.success ? parsed.data.seed : undefined;

    const history = deps.store
      .listRecentReelsForVariety(12)
      .filter((r) => r.id !== existing.id)
      .map((r) => computeReelFingerprint(r));

    const nextStoryboard = restyleStoryboard(existing.storyboard, history, seed);
    const updated = deps.store.updateReel(id, { storyboard: nextStoryboard });
    if (!updated) return c.json({ error: 'Reel not found' }, 404);
    const settings = deps.store.getSettings(defaultAppSettings());

    return c.json({
      reel: updated,
      staleness: computeStaleness(updated, settings.brandHandle),
      variety: computeReelVarietyInfo(updated),
    });
  });

  app.post('/api/reels/:id/rerender', (c) => {
    try {
      const run = deps.orchestrator.startRerenderReel(c.req.param('id'));
      return c.json({ run }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Rerender failed' }, 400);
    }
  });

  app.post('/api/reels/:id/regenerate-audio', (c) => {
    refreshEnv();
    try {
      const run = deps.orchestrator.startRegenerateAudioAndRender(c.req.param('id'));
      return c.json({ run }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Regenerate failed' }, 400);
    }
  });

  app.post('/api/reels/:id/retry', (c) => {
    refreshEnv();
    try {
      const run = deps.orchestrator.startRetryFailedReel(c.req.param('id'));
      return c.json({ run }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Retry failed' }, 400);
    }
  });

  app.post('/api/reels/:id/reject', (c) => {
    const id = c.req.param('id');
    const reel = deps.store.getReel(id);
    if (!reel) return c.json({ error: 'Reel not found' }, 404);
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED'].includes(reel.status)) {
      return c.json({ error: `Cannot reject reel in status "${reel.status}".` }, 409);
    }
    const updated = deps.store.updateReel(id, { status: 'REJECTED' });
    return c.json({ reel: updated });
  });

  app.post('/api/reels/:id/restore', (c) => {
    const id = c.req.param('id');
    const reel = deps.store.getReel(id);
    if (!reel) return c.json({ error: 'Reel not found' }, 404);
    if (reel.status !== 'REJECTED') {
      return c.json({ error: 'Only rejected reels can be restored.' }, 400);
    }
    if (!deps.storage.hasValidFinalVideo(id)) {
      return c.json({ error: 'Video file missing or corrupt on disk.' }, 400);
    }
    const updated = deps.store.updateReel(id, { status: 'READY_FOR_REVIEW', errorMessage: null });
    return c.json({ reel: updated });
  });

  app.delete('/api/reels/:id', (c) => {
    const id = c.req.param('id');
    const reel = deps.store.getReel(id);
    if (!reel) return c.json({ error: 'Reel not found' }, 404);
    if (reel.status === 'GENERATING' || reel.status === 'PUBLISHING') {
      return c.json({ error: `Cannot delete reel while status is "${reel.status}".` }, 409);
    }
    deps.store.deleteReel(id);
    deps.storage.deleteReelDir(id);
    return c.json({ deleted: true, id });
  });

  app.post('/api/reels/:id/publish', async (c) => {
    refreshEnv();
    const id = c.req.param('id');
    const reel = deps.store.getReel(id);
    if (!reel) return c.json({ error: 'Reel not found' }, 404);

    const body = (await c.req.json().catch(() => ({}))) as { dryRun?: unknown; force?: unknown };
    const dryRun = body.dryRun === true;
    const force = body.force === true;

    if (dryRun) {
      try {
        const result = await deps.orchestrator.publishDryRun(id);
        return c.json(result);
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Dry run failed' }, 400);
      }
    }

    if (reel.isSample) {
      return c.json(
        {
          error:
            'Sample demo Reels cannot be published to live Instagram. Use Dry Run to test validation, or generate a real Reel.',
        },
        400,
      );
    }

    if (!force) {
      const spacing = deps.orchestrator.getPublishSpacingStatus();
      if (!spacing.allowed) {
        return c.json({ error: spacing.message, publishSpacing: spacing }, 429);
      }
    }

    try {
      const run = deps.orchestrator.startPublishAsync(id, { force });
      return c.json({ run, reelId: id }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Publish failed' }, 400);
    }
  });

  app.post('/api/reels/:id/reconcile', (c) => {
    refreshEnv();
    const id = c.req.param('id');
    try {
      const run = deps.orchestrator.startReconcileAsync(id);
      return c.json({ run, reelId: id }, 202);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Reconcile failed' }, 400);
    }
  });

  // Media streaming
  app.get('/api/reels/:id/video', (c) => {
    const id = c.req.param('id');
    let filePath: string;
    try {
      filePath = deps.storage.reelFile(id, 'final.mp4');
    } catch {
      return c.json({ error: 'Invalid reel id' }, 400);
    }
    const download = c.req.query('download') === '1';
    return streamFileWithRange(c, filePath, 'video/mp4', {
      downloadFilename: download ? `reel-${id}.mp4` : undefined,
    });
  });

  app.get('/api/reels/:id/cover', (c) => {
    const id = c.req.param('id');
    let filePath: string;
    try {
      filePath = deps.storage.reelFile(id, 'cover.jpg');
    } catch {
      return c.json({ error: 'Invalid reel id' }, 400);
    }
    return streamFileWithRange(c, filePath, 'image/jpeg');
  });

  // Pipeline runs & SSE
  const enrichRun = (run: PipelineRunRecord) => {
    const reel = run.reelId ? deps.store.getReel(run.reelId) : null;
    return {
      ...run,
      reelTitle: reel?.title ?? null,
    };
  };

  app.get('/api/runs', (c) => {
    const limitParam = Number.parseInt(c.req.query('limit') ?? '30', 10);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 30;
    const runs = deps.store.listPipelineRuns(limit).map(enrichRun);
    return c.json({
      runs,
      maxConcurrency: deps.queue.getMaxConcurrency(),
    });
  });

  app.get('/api/runs/active', (c) => {
    const activeRuns = deps.store.listActivePipelineRuns().map(enrichRun);
    const runningRuns = activeRuns.filter((r) => r.status === 'RUNNING');
    const queuedOnly = activeRuns.filter((r) => r.status === 'QUEUED');
    const activeRun = runningRuns[0] ?? activeRuns[0] ?? null;
    const queuedRuns = activeRuns.filter((r) => r.id !== activeRun?.id);
    return c.json({
      activeRun,
      queuedRuns,
      activeRuns,
      runningCount: runningRuns.length,
      queuedCount: queuedOnly.length,
      maxConcurrency: deps.queue.getMaxConcurrency(),
    });
  });

  app.get('/api/runs/:runId', (c) => {
    const run = deps.store.getPipelineRun(c.req.param('runId'));
    if (!run) return c.json({ error: 'Run not found' }, 404);
    return c.json({ run: enrichRun(run) });
  });

  app.post('/api/runs/:runId/cancel', (c) => {
    const cancelled = deps.queue.cancelRun(c.req.param('runId'));
    if (!cancelled) {
      return c.json({ error: 'Run not found or already finished' }, 404);
    }
    return c.json({ cancelled: true });
  });

  app.get('/api/runs/:runId/events', (c) => {
    const runId = c.req.param('runId');
    const initial = deps.store.getPipelineRun(runId);
    if (!initial) {
      return c.json({ error: 'Run not found' }, 404);
    }

    const lastEventIdHeader = c.req.header('last-event-id');
    const lastSeenSeq = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) : 0;

    return streamSSE(c, async (stream) => {
      let nextReplaySeq = 1;

      if (!Number.isFinite(lastSeenSeq) || lastSeenSeq <= 0) {
        await stream.writeSSE({
          id: String(nextReplaySeq++),
          event:
            initial.status === 'DONE'
              ? 'done'
              : initial.status === 'FAILED'
                ? 'failed'
                : initial.status === 'CANCELLED'
                  ? 'cancelled'
                  : 'snapshot',
          data: formatSsePayload(initial),
        });
      }

      if (
        initial.status === 'DONE' ||
        initial.status === 'FAILED' ||
        initial.status === 'CANCELLED'
      ) {
        return;
      }

      let closed = false;
      const keepalive = setInterval(() => {
        if (!closed) {
          void stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
        }
      }, 15_000);

      await new Promise<void>((resolve) => {
        const unsubscribe = deps.queue.subscribe(runId, (evt: RunStreamEvent) => {
          const eventId = nextReplaySeq + evt.seq;
          if (Number.isFinite(lastSeenSeq) && lastSeenSeq > 0 && eventId <= lastSeenSeq) {
            return;
          }
          void stream
            .writeSSE({
              id: String(eventId),
              event: evt.event,
              data: formatSsePayload(evt.run, evt.log ? { log: evt.log } : undefined),
            })
            .then(() => {
              if (evt.event === 'done' || evt.event === 'failed' || evt.event === 'cancelled') {
                closed = true;
                clearInterval(keepalive);
                unsubscribe();
                resolve();
              }
            })
            .catch(() => {
              closed = true;
              clearInterval(keepalive);
              unsubscribe();
              resolve();
            });
        });

        stream.onAbort(() => {
          closed = true;
          clearInterval(keepalive);
          unsubscribe();
          resolve();
        });
      });
    });
  });

  // Production static dashboard serving (when built)
  if (deps.dashboardDistDir && fs.existsSync(path.join(deps.dashboardDistDir, 'index.html'))) {
    const distRoot = path.resolve(deps.dashboardDistDir);
    const mimeByExt: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.json': 'application/json',
    };

    app.get('*', (c) => {
      if (c.req.path.startsWith('/api/')) {
        return c.json({ error: 'Not found' }, 404);
      }
      const reqRel = c.req.path === '/' ? 'index.html' : c.req.path.replace(/^\/+/, '');
      const candidate = path.resolve(distRoot, reqRel);
      const safeFile =
        candidate.startsWith(distRoot + path.sep) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
          ? candidate
          : path.join(distRoot, 'index.html');
      const ext = path.extname(safeFile).toLowerCase();
      const content = fs.readFileSync(safeFile);
      return new Response(content, {
        status: 200,
        headers: { 'Content-Type': mimeByExt[ext] ?? 'application/octet-stream' },
      });
    });
  }

  return app;
}
