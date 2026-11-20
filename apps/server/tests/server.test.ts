import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
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
});
