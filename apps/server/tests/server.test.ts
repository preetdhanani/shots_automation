import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeNarrationHash,
  computeStoryboardVisualHash,
  loadEnv,
  LocalAssetStorage,
  PipelineQueue,
  ReelOrchestrator,
  SAMPLE_DEMO_STORYBOARD,
  SqliteStore,
} from '@post/core';
import { createServerApp } from '../src/app.js';

async function startCaptureServer(): Promise<{
  url: string;
  authHeaders: Array<{ path: string; auth: string | undefined }>;
  close: () => Promise<void>;
}> {
  const authHeaders: Array<{ path: string; auth: string | undefined }> = [];
  const server = http.createServer((req, res) => {
    authHeaders.push({ path: req.url ?? '', auth: req.headers.authorization });
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'custom-qwen-14b' }] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: 'OK' } }],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('Failed to start capture server');
  return {
    url: `http://127.0.0.1:${addr.port}`,
    authHeaders,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('Hono Server API Security, Range Streaming, Staleness, and Lifecycle', () => {
  let tmpDir: string;
  let store: SqliteStore;
  let storage: LocalAssetStorage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-srv-test-'));
    storage = new LocalAssetStorage(tmpDir);
    storage.ensureBaseDirs();
    store = new SqliteStore(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupApp(envOverrides: Partial<Record<string, string | undefined>> = {}) {
    const env = loadEnv({
      DATA_DIR: tmpDir,
      GEMINI_API_KEY: 'secret_gemini_key_do_not_leak',
      META_ACCESS_TOKEN: 'secret_meta_token_do_not_leak',
      META_IG_USER_ID: '17841400',
      ...envOverrides,
    });
    const queue = new PipelineQueue(store);
    const orchestrator = new ReelOrchestrator({
      env,
      store,
      storage,
      queue,
      renderVideo: async () => {},
    });
    return createServerApp({
      getEnv: () => env,
      store,
      storage,
      queue,
      orchestrator,
    });
  }

  it('never leaks API secrets on /api/health and enforces Host/Origin/CSRF guards', async () => {
    const app = setupApp();

    const healthRes = await app.request('/api/health', {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(healthRes.status).toBe(200);
    const healthBody = await healthRes.text();
    expect(healthBody).not.toContain('secret_gemini_key_do_not_leak');
    expect(healthBody).not.toContain('secret_meta_token_do_not_leak');

    // DNS rebinding Host block
    const badHost = await app.request('/api/health', {
      headers: { Host: 'evil.attacker.com:4310' },
    });
    expect(badHost.status).toBe(403);

    // Cross-origin POST block
    const badOrigin = await app.request('/api/reels/sample', {
      method: 'POST',
      headers: {
        Host: '127.0.0.1:4310',
        Origin: 'https://evil.com',
        'X-Post-CSRF': '1',
      },
    });
    expect(badOrigin.status).toBe(403);

    // Missing CSRF & JSON Content-Type block
    const missingCsrf = await app.request('/api/reels/sample', {
      method: 'POST',
      headers: { Host: '127.0.0.1:4310', 'Content-Type': 'text/plain' },
      body: 'hi',
    });
    expect(missingCsrf.status).toBe(403);
  });

  it('handles HTTP Range bytes=0-1 Safari probes, 416, and ?download=1', async () => {
    const app = setupApp();
    const reel = store.createReel({
      topicId: null,
      isSample: true,
      pillar: 'harnesses',
      status: 'READY_FOR_REVIEW',
      title: 'Range Test Reel',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: 'Test',
      hashtags: ['#ai', '#dev'],
      voiceName: 'Puck',
    });
    const videoFile = storage.reelFile(reel.id, 'final.mp4');
    fs.mkdirSync(path.dirname(videoFile), { recursive: true });
    fs.writeFileSync(videoFile, Buffer.from('0123456789abcdef'));

    const probeRes = await app.request(`/api/reels/${reel.id}/video`, {
      headers: { Host: '127.0.0.1:4310', Range: 'bytes=0-1' },
    });
    expect(probeRes.status).toBe(206);
    expect(probeRes.headers.get('content-range')).toBe('bytes 0-1/16');
    expect(probeRes.headers.get('cache-control')).toBe('no-store');
    expect(await probeRes.text()).toBe('01');

    const badRange = await app.request(`/api/reels/${reel.id}/video`, {
      headers: { Host: '127.0.0.1:4310', Range: 'bytes=999-1000' },
    });
    expect(badRange.status).toBe(416);

    const dlRes = await app.request(`/api/reels/${reel.id}/video?download=1`, {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('content-disposition')).toContain(`reel-${reel.id}.mp4`);
  });

  it('blocks live publish of sample Reels and rejects invalid path IDs', async () => {
    const app = setupApp();
    const reel = store.createReel({
      topicId: null,
      isSample: true,
      pillar: 'harnesses',
      status: 'READY_FOR_REVIEW',
      title: 'Sample Block Test',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: 'Sample',
      hashtags: ['#ai', '#dev'],
      voiceName: 'Puck',
    });

    const pubRes = await app.request(`/api/reels/${reel.id}/publish`, {
      method: 'POST',
      headers: {
        Host: '127.0.0.1:4310',
        'X-Post-CSRF': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dryRun: false }),
    });
    expect(pubRes.status).toBe(400);

    const traversal = await app.request('/api/reels/..%2F..%2Fetc/video', {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(traversal.status).toBe(400);
  });

  it('manages custom OpenAI-compatible endpoints without leaking keys or exfiltrating secrets', async () => {
    const mockTarget = await startCaptureServer();
    const attackerServer = await startCaptureServer();
    try {
      const app = setupApp({ GEMINI_API_KEY: '' });
      const headers = {
        Host: '127.0.0.1:4310',
        'X-Post-CSRF': '1',
        'Content-Type': 'application/json',
      };

      // Rejects CR/LF injection in API key
      const crlfRes = await app.request('/api/llm/endpoints', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Bad Key',
          baseUrl: `${mockTarget.url}/v1`,
          model: 'custom-qwen-14b',
          apiKey: 'sk-bad\r\nX-Injected: 1',
        }),
      });
      expect(crlfRes.status).toBe(400);

      // Create custom endpoint with secret key & verify key is masked in all responses
      const createRes = await app.request('/api/llm/endpoints', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Local Gateway',
          baseUrl: `${mockTarget.url}/v1/chat/completions`,
          model: 'custom-qwen-14b',
          apiKey: 'sk-topsecret-custom-8899',
        }),
      });
      expect(createRes.status).toBe(201);
      const createText = await createRes.text();
      expect(createText).not.toContain('sk-topsecret-custom-8899');
      const createdJson = JSON.parse(createText) as {
        endpoint: { id: string; baseUrl: string; hasApiKey: boolean; apiKeyHint: string | null };
        activeEndpointId: string;
        scriptLlmReady: boolean;
        ttsReady: boolean;
      };
      expect(createdJson.endpoint.baseUrl).toBe(`${mockTarget.url}/v1`);
      expect(createdJson.endpoint.hasApiKey).toBe(true);
      expect(createdJson.endpoint.apiKeyHint).toBe('sk-...8899');
      expect(createdJson.activeEndpointId).toBe(createdJson.endpoint.id);
      expect(createdJson.scriptLlmReady).toBe(true);
      expect(createdJson.ttsReady).toBe(false);

      const epId = createdJson.endpoint.id;

      // Health and GET endpoints also never leak plaintext API key
      const listRes = await app.request('/api/llm/endpoints', {
        headers: { Host: '127.0.0.1:4310' },
      });
      expect(listRes.status).toBe(200);
      expect(await listRes.text()).not.toContain('sk-topsecret-custom-8899');

      // Anti-exfiltration: endpointId + DIFFERENT baseUrl MUST NOT send stored key
      await app.request('/api/llm/models', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpointId: epId, baseUrl: `${attackerServer.url}/v1` }),
      });
      await app.request('/api/llm/check', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpointId: epId,
          baseUrl: `${attackerServer.url}/v1`,
          model: 'custom-qwen-14b',
        }),
      });
      expect(attackerServer.authHeaders.length).toBeGreaterThan(0);
      for (const reqInfo of attackerServer.authHeaders) {
        expect(reqInfo.auth).toBeUndefined();
      }

      // Gemini endpointId + custom baseUrl never probes custom server and blocks /models
      const gemModelsRes = await app.request('/api/llm/models', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpointId: 'gemini', baseUrl: `${attackerServer.url}/v1` }),
      });
      expect(gemModelsRes.status).toBe(400);

      // clearApiKey: true during draft check with matching URL does not send stored key
      const lenBeforeClearCheck = mockTarget.authHeaders.length;
      await app.request('/api/llm/check', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpointId: epId,
          baseUrl: `${mockTarget.url}/v1`,
          model: 'custom-qwen-14b',
          clearApiKey: true,
        }),
      });
      for (const reqInfo of mockTarget.authHeaders.slice(lenBeforeClearCheck)) {
        expect(reqInfo.auth).toBeUndefined();
      }

      // PATCH with apiKey: '' preserves saved key; clearApiKey: true clears it
      const patchPreserve = await app.request(`/api/llm/endpoints/${epId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ model: 'custom-qwen-32b', apiKey: '' }),
      });
      expect(patchPreserve.status).toBe(200);
      const patchPreserveJson = (await patchPreserve.json()) as {
        endpoint: { model: string; hasApiKey: boolean };
      };
      expect(patchPreserveJson.endpoint.model).toBe('custom-qwen-32b');
      expect(patchPreserveJson.endpoint.hasApiKey).toBe(true);

      const patchClear = await app.request(`/api/llm/endpoints/${epId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ clearApiKey: true }),
      });
      expect(patchClear.status).toBe(200);
      expect(
        ((await patchClear.json()) as { endpoint: { hasApiKey: boolean } }).endpoint.hasApiKey,
      ).toBe(false);

      // Built-in endpoint cannot be edited or deleted
      const patchBuiltin = await app.request('/api/llm/endpoints/gemini', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ model: 'other' }),
      });
      expect(patchBuiltin.status).toBe(400);
      const deleteBuiltin = await app.request('/api/llm/endpoints/gemini', {
        method: 'DELETE',
        headers,
      });
      expect(deleteBuiltin.status).toBe(400);

      // /api/reels/generate with unknown llmEndpointId returns 400 cleanly
      const genUnknown = await app.request('/api/reels/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: 'Test prompt', llmEndpointId: 'llm_missing_123' }),
      });
      expect(genUnknown.status).toBe(400);

      // /api/reels/generate with configured custom endpoint but missing GEMINI_API_KEY explains TTS requirement clearly
      const genMissingTts = await app.request('/api/reels/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: 'Test prompt', llmEndpointId: epId }),
      });
      expect(genMissingTts.status).toBe(400);
      const missingTtsMsg = ((await genMissingTts.json()) as { error: string }).error;
      expect(missingTtsMsg).toContain('Gemini TTS');

      // Deleting active custom endpoint resets active to 'gemini'
      const delRes = await app.request(`/api/llm/endpoints/${epId}`, {
        method: 'DELETE',
        headers,
      });
      expect(delRes.status).toBe(200);
      expect(((await delRes.json()) as { activeEndpointId: string }).activeEndpointId).toBe(
        'gemini',
      );
    } finally {
      await mockTarget.close();
      await attackerServer.close();
    }
  });

  it('serves /api/variety, persists aiBrollEnabled/voiceRotation settings, and restyles reels cleanly', async () => {
    const app = setupApp({ GEMINI_API_KEY: 'test-key' });
    const headers = {
      Host: '127.0.0.1:4310',
      'X-Post-CSRF': '1',
      'Content-Type': 'application/json',
    };

    const varietyRes = await app.request('/api/variety', {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(varietyRes.status).toBe(200);
    const varietyJson = (await varietyRes.json()) as {
      formats: Array<{ id: string }>;
      backgrounds: Array<{ id: string }>;
      musicMoods: Array<{ id: string }>;
    };
    expect(varietyJson.formats.length).toBe(8);
    expect(varietyJson.backgrounds.length).toBe(6);
    expect(varietyJson.musicMoods.length).toBe(5);

    const patchSettings = await app.request('/api/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ voiceRotation: true, aiBrollEnabled: true }),
    });
    expect(patchSettings.status).toBe(200);
    const settingsJson = (await patchSettings.json()) as {
      settings: { voiceRotation: boolean; aiBrollEnabled: boolean };
    };
    expect(settingsJson.settings.voiceRotation).toBe(true);
    expect(settingsJson.settings.aiBrollEnabled).toBe(true);

    // Create a rendered READY_FOR_REVIEW reel and test POST /api/reels/:id/restyle
    const readyReel = store.createReel({
      topicId: null,
      pillar: 'harnesses',
      status: 'READY_FOR_REVIEW',
      title: 'Ready Reel For Restyle',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: SAMPLE_DEMO_STORYBOARD.caption,
      hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
      voiceName: 'Puck',
      musicEnabled: true,
    });
    store.updateReel(readyReel.id, {
      renderedNarrationHash: computeNarrationHash(SAMPLE_DEMO_STORYBOARD),
      renderedVoiceName: 'Puck',
      renderedStoryboardHash: computeStoryboardVisualHash(
        SAMPLE_DEMO_STORYBOARD,
        true,
        '@ai.dev.reels',
      ),
    });
    const detailRes = await app.request(`/api/reels/${readyReel.id}`, {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(detailRes.status).toBe(200);
    const detailJson = (await detailRes.json()) as {
      variety?: { freshness: { score: number } };
    };
    expect(detailJson.variety?.freshness.score).toBe(100);

    const restyleRes = await app.request(`/api/reels/${readyReel.id}/restyle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ seed: 12345 }),
    });
    expect(restyleRes.status).toBe(200);
    const restyleJson = (await restyleRes.json()) as {
      reel: { storyboard: { style?: { background: string } } };
      staleness: { visualsDirty: boolean };
    };
    expect(restyleJson.reel.storyboard.style?.background).toBeTruthy();
    expect(restyleJson.staleness.visualsDirty).toBe(true);

    // Published reels cannot be restyled (409)
    const publishedReel = store.createReel({
      topicId: null,
      pillar: 'harnesses',
      status: 'PUBLISHED',
      title: 'Published Reel Locked',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: SAMPLE_DEMO_STORYBOARD.caption,
      hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
      voiceName: 'Puck',
      musicEnabled: true,
    });
    const lockedRes = await app.request(`/api/reels/${publishedReel.id}/restyle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(lockedRes.status).toBe(409);
  });

  it('previews, cleans, and restores Discover topics by retention interval', async () => {
    const app = setupApp();
    const headers = {
      Host: '127.0.0.1:4310',
      'X-Post-CSRF': '1',
      'Content-Type': 'application/json',
    };
    const nowMs = Date.now();
    const dayMs = 86_400_000;

    const { topics } = store.upsertTopics([
      {
        pillar: 'ai_news',
        title: 'Fresh Today News',
        summary: 'Fresh summary',
        sourceName: 'HN',
        sourceUrl: 'https://example.com/fresh',
        canonicalUrlHash: 'hash-fresh',
        topicFingerprint: 'fresh-today-news',
        publishedAt: new Date(nowMs - 1 * dayMs).toISOString(),
        score: 95,
        rawPayloadJson: '{}',
      },
      {
        pillar: 'benchmarks',
        title: 'Two Week Old Benchmark',
        summary: 'Old summary',
        sourceName: 'Blog',
        sourceUrl: 'https://example.com/2w',
        canonicalUrlHash: 'hash-2w',
        topicFingerprint: 'two-week-old-benchmark',
        publishedAt: new Date(nowMs - 14 * dayMs).toISOString(),
        score: 82,
        rawPayloadJson: '{}',
      },
      {
        pillar: 'harnesses',
        title: 'Old Used Topic',
        summary: 'Already used',
        sourceName: 'GH',
        sourceUrl: 'https://example.com/used',
        canonicalUrlHash: 'hash-used',
        topicFingerprint: 'old-used-topic',
        publishedAt: new Date(nowMs - 45 * dayMs).toISOString(),
        score: 70,
        rawPayloadJson: '{}',
        status: 'USED',
      },
    ]);

    const previewRes = await app.request('/api/topics/clean/preview', {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(previewRes.status).toBe(200);
    const previewJson = (await previewRes.json()) as {
      totalNew: number;
      intervals: Record<'3d' | '7d' | '30d', { keep: number; remove: number }>;
    };
    expect(previewJson.totalNew).toBe(2);
    expect(previewJson.intervals['7d']).toEqual({ keep: 1, remove: 1 });
    expect(previewJson.intervals['30d']).toEqual({ keep: 2, remove: 0 });

    const invalidClean = await app.request('/api/topics/clean', {
      method: 'POST',
      headers,
      body: JSON.stringify({ interval: '99d' }),
    });
    expect(invalidClean.status).toBe(400);

    const cleanRes = await app.request('/api/topics/clean', {
      method: 'POST',
      headers,
      body: JSON.stringify({ interval: '7d' }),
    });
    expect(cleanRes.status).toBe(200);
    const cleanJson = (await cleanRes.json()) as {
      interval: string;
      removedCount: number;
      keptCount: number;
      removedIds: string[];
    };
    expect(cleanJson.interval).toBe('7d');
    expect(cleanJson.removedCount).toBe(1);
    expect(cleanJson.keptCount).toBe(1);
    expect(cleanJson.removedIds).toEqual([topics[1]!.id]);

    const listAfterClean = await app.request('/api/topics?status=NEW', {
      headers: { Host: '127.0.0.1:4310' },
    });
    const listJson = (await listAfterClean.json()) as { topics: Array<{ id: string }> };
    expect(listJson.topics.map((t) => t.id)).toEqual([topics[0]!.id]);
    expect(store.getTopic(topics[2]!.id)?.status).toBe('USED');

    const emptyRestore = await app.request('/api/topics/restore', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: [] }),
    });
    expect(emptyRestore.status).toBe(400);

    const restoreRes = await app.request('/api/topics/restore', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: cleanJson.removedIds }),
    });
    expect(restoreRes.status).toBe(200);
    const restoreJson = (await restoreRes.json()) as { restoredCount: number };
    expect(restoreJson.restoredCount).toBe(1);
    expect(store.getTopic(topics[1]!.id)?.status).toBe('NEW');
  });

  it('defaults BRAND_HANDLE empty and musicVolumeDb -17, syncs PATCH caption/hashtags, and enforces 429 publish spacing', async () => {
    const env = loadEnv({
      DATA_DIR: tmpDir,
      META_IG_USER_ID: '178414000',
      META_ACCESS_TOKEN: 'meta_tok',
    });
    expect(env.BRAND_HANDLE).toBe('');

    const app = setupApp({
      META_IG_USER_ID: '178414000',
      META_ACCESS_TOKEN: 'meta_tok',
    });
    const headers = {
      Host: '127.0.0.1:4310',
      Origin: 'http://127.0.0.1:4310',
      'X-Post-CSRF': '1',
      'Content-Type': 'application/json',
    };

    const settingsGet = await app.request('/api/settings', {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(settingsGet.status).toBe(200);
    const settingsJson = (await settingsGet.json()) as {
      settings: { brandHandle: string; musicVolumeDb: number; minPublishSpacingHours: number };
    };
    expect(settingsJson.settings.brandHandle).toBe('');
    expect(settingsJson.settings.musicVolumeDb).toBe(-17);
    expect(settingsJson.settings.minPublishSpacingHours).toBe(6);

    const spacingPatch = await app.request('/api/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ minPublishSpacingHours: 8 }),
    });
    expect(spacingPatch.status).toBe(200);
    const spacingPatchJson = (await spacingPatch.json()) as {
      settings: { minPublishSpacingHours: number };
    };
    expect(spacingPatchJson.settings.minPublishSpacingHours).toBe(8);

    // Create a recently published reel + a new READY_FOR_REVIEW real reel
    const publishedReel = store.createReel({
      topicId: null,
      isSample: false,
      pillar: 'ai_news',
      status: 'READY_FOR_REVIEW',
      title: 'Recently Published',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: 'Old caption',
      hashtags: ['#ai', '#dev', '#llm'],
      voiceName: 'Puck',
    });
    store.updateReel(publishedReel.id, {
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    });

    const candidate = store.createReel({
      topicId: null,
      isSample: false,
      pillar: 'benchmarks',
      status: 'READY_FOR_REVIEW',
      title: 'Candidate Reel',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: 'Initial caption',
      hashtags: ['#ai', '#dev', '#llm'],
      voiceName: 'Puck',
    });

    // PATCH caption/hashtags syncs into storyboard
    const patchRes = await app.request(`/api/reels/${candidate.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        caption: 'Synced top caption',
        hashtags: ['#ai', '#coding', '#benchmarks'],
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = (await patchRes.json()) as {
      reel: { caption: string; storyboard: { caption: string; hashtags: string[] } };
    };
    expect(patchJson.reel.storyboard.caption).toBe('Synced top caption');
    expect(patchJson.reel.storyboard.hashtags).toEqual(['#ai', '#coding', '#benchmarks']);

    // GET /api/reels/:id includes blocked publishSpacing status
    const detailRes = await app.request(`/api/reels/${candidate.id}`, {
      headers: { Host: '127.0.0.1:4310' },
    });
    expect(detailRes.status).toBe(200);
    const detailJson = (await detailRes.json()) as {
      publishSpacing: { allowed: boolean; minSpacingHours: number };
    };
    expect(detailJson.publishSpacing.allowed).toBe(false);
    expect(detailJson.publishSpacing.minSpacingHours).toBe(8);

    // POST /api/reels/:id/publish returns HTTP 429 before starting a run
    const blockedRes = await app.request(`/api/reels/${candidate.id}/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dryRun: false }),
    });
    expect(blockedRes.status).toBe(429);

    // Passing force: true bypasses spacing guardrail
    const forcedRes = await app.request(`/api/reels/${candidate.id}/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dryRun: false, force: true }),
    });
    expect(forcedRes.status).toBe(202);
  });
});
