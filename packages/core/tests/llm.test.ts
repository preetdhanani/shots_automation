import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  callOpenAICompatibleStoryboard,
  CHANNEL_OUTRO_NARRATION,
  checkOpenAICompatibleHealth,
  convertFlatGeminiResponseToStoryboard,
  extractJsonFromLlmText,
  fetchOpenAICompatibleModels,
  generateStoryboard,
  loadEnv,
  maskApiKey,
  normalizeOpenAIBaseUrl,
  resolveActiveLlmEndpoint,
  SAMPLE_DEMO_STORYBOARD,
  SqliteStore,
  validateApiKeyValue,
} from '@post/core';

async function startTempServer(
  handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      handler(req, Buffer.concat(chunks).toString('utf8'), res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind temporary HTTP server');
  }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function buildValidStoryboardJson(shortFirstScene = false) {
  const firstNarration = shortFirstScene
    ? 'Too short.'
    : 'Stop pasting giant brittle prompts because lightweight local evaluation harnesses now catch silent regressions and agent failures automatically.';

  return {
    title: 'Local Agent Harnesses Explained',
    pillar: 'harnesses',
    caption: 'Harnesses beat prompt tweaks every time.\nSave this workflow check.',
    hashtags: ['#ai', '#coding', '#dev', '#llm', '#agents'],
    scenes: [
      {
        id: 1,
        type: 'hook_title',
        narration: firstNarration,
        hook_title: {
          badge: 'HARNESS TIP',
          headline: 'Harnesses Beat Bigger Prompts',
          subheadline: 'Test structured agent loops locally in seconds.',
          highlightStat: null,
        },
        benchmarkBars: null,
      },
      {
        id: '2',
        type: 'benchmark_bars',
        narration:
          'Verified engineering evals consistently show structured schemas outperform loose string parsing across coding models.',
        benchmarkBars: {
          title: 'Tool Reliability Score',
          subtitle: null,
          metricUnit: '%',
          sourceLabel: 'Eval Suite v2',
          bars: [
            { label: 'With Schema Gate', value: 94, isWinner: true, note: null },
            { label: 'Prompt Only', value: 61, isWinner: false, note: null },
          ],
        },
      },
      {
        id: '3',
        type: 'code_compare',
        narration:
          'Keep code diffs small and focused so deterministic schema checks catch boundary bugs immediately during builds.',
        codeCompare: {
          title: 'Strict Schema Check',
          language: 'typescript',
          filename: 'verify.ts',
          mode: 'before_after',
          beforeLabel: 'Loose',
          beforeCode: 'JSON.parse(rawOutput);',
          afterLabel: 'Checked',
          afterCode: 'Schema.parse(extractJson(raw));',
          highlightLines: [1],
        },
      },
      {
        id: '4',
        type: 'terminal_demo',
        narration:
          'Run one fast verification command against your local repository tests before shipping any model patch to production.',
        terminalDemo: {
          title: 'Harness Verification',
          windowTitle: 'zsh',
          command: 'npm test',
          outputLines: [
            { text: 'PASS storyboard schema check', tone: 'success' },
            { text: 'All 5 scenes validated cleanly', tone: 'accent' },
          ],
        },
      },
      {
        id: '5',
        type: 'takeaway_cta',
        narration:
          'Connect your favorite custom model or local Ollama server and test every script automatically first.',
        takeawayCta: {
          badge: 'TAKEAWAY',
          headline: 'Own Your Model Stack',
          takeaway: 'Swap local or hosted OpenAI-compatible models without breaking validation.',
          ctaText: 'Follow for daily AI tooling breakdowns',
        },
      },
    ],
  };
}

describe('Custom OpenAI-Compatible LLM Support', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-llm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normalizes OpenAI base URLs and masks/validates API keys safely', () => {
    expect(normalizeOpenAIBaseUrl('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434/v1');
    expect(normalizeOpenAIBaseUrl('https://openrouter.ai/api/v1/chat/completions')).toBe(
      'https://openrouter.ai/api/v1',
    );
    expect(normalizeOpenAIBaseUrl('http://192.168.1.40:8000/v1/models/')).toBe(
      'http://192.168.1.40:8000/v1',
    );
    expect(normalizeOpenAIBaseUrl('https://my-gateway.internal/proxy/v1/')).toBe(
      'https://my-gateway.internal/proxy/v1',
    );

    expect(() => normalizeOpenAIBaseUrl('file:///etc/passwd')).toThrow(/http/);
    expect(() => normalizeOpenAIBaseUrl('https://user:pass@api.openai.com/v1')).toThrow(
      /credentials/,
    );
    expect(() => normalizeOpenAIBaseUrl('https://api.openai.com/v1?key=123')).toThrow(
      /query parameters/,
    );

    expect(maskApiKey('')).toBeNull();
    expect(maskApiKey('short1234')).toBe('••••');
    expect(maskApiKey('sk-proj-abcdefgh1234')).toBe('sk-...1234');

    expect(validateApiKeyValue('  sk-test-1234  ')).toBe('sk-test-1234');
    expect(() => validateApiKeyValue('sk-bad\nAuthorization: evil')).toThrow(/invalid/i);
  });

  it('extracts JSON across think tags, closing-only think tags, prose braces, and code fences', () => {
    expect(
      extractJsonFromLlmText('<think>reasoning {foo} here</think>\n```json\n{"a": 1}\n```'),
    ).toEqual({ a: 1 });
    expect(extractJsonFromLlmText('step 1\n</think>\n{"ok": true, "n": 2}')).toEqual({
      ok: true,
      n: 2,
    });
    expect(
      extractJsonFromLlmText(
        'Note {not json here} before result: {"title": "Ready", "count": 5} done.',
      ),
    ).toEqual({ title: 'Ready', count: 5 });
    expect(() => extractJsonFromLlmText('plain apology text without json')).toThrow(
      /did not contain valid JSON/,
    );
  });

  it('normalizes null siblings, snake_case wrappers, numeric ids, and flattened scenes', () => {
    const valid = buildValidStoryboardJson(false);
    const converted = convertFlatGeminiResponseToStoryboard(valid, [
      { title: 'Eval Report', url: 'https://example.com' },
    ]);
    expect(converted.scenes[0]?.id).toBe('1');
    expect(converted.scenes[0]?.type).toBe('hook_title');

    // Direct flattened fields without wrapper object
    const flattened = convertFlatGeminiResponseToStoryboard(
      {
        title: 'Flattened OpenAI Test',
        pillar: 'vibe_coding',
        caption: 'Short caption.',
        hashtags: ['#ai', '#dev', '#vibe'],
        scenes: [
          {
            id: 1,
            type: 'hook_title',
            narration: 'Always inspect flattened JSON payloads from custom open models carefully.',
            badge: 'TIP',
            headline: 'Flattened Fields Work',
            subheadline: 'Normalized cleanly before schema checks.',
            benchmarkBars: null,
          },
          {
            id: 2,
            type: 'news_quote_card',
            narration:
              'Middle scene news quote cards normalize direct fields into nested schema objects cleanly.',
            sourceLabel: 'Spec',
            dateLabel: 'Nov 2026',
            headline: 'Unified Parser',
            bullets: ['Strips null values', 'Supports snake_case'],
          },
          {
            id: 3,
            type: 'takeaway_cta',
            narration: 'Validate every generated scene before handing off to voice synthesis.',
            badge: 'DONE',
            headline: 'Stay Safe',
            takeaway: 'Schema gates catch drift early.',
            ctaText: 'Follow for more tips',
          },
        ],
      },
      [{ title: 'Docs', url: 'https://example.com/docs' }],
    );
    expect(flattened.scenes[0]?.type).toBe('hook_title');
    expect(flattened.scenes[1]?.type).toBe('news_quote_card');
    expect(flattened.scenes[2]?.type).toBe('takeaway_cta');
  });

  it('migrates SQLite v1 -> v2 preserving existing data and manages LLM endpoint CRUD cleanly', () => {
    const dbPath = path.join(tmpDir, 'v1.db');
    const v1 = new DatabaseSync(dbPath);
    v1.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE topics (
        id TEXT PRIMARY KEY, pillar TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
        source_name TEXT NOT NULL, source_url TEXT NOT NULL, canonical_url_hash TEXT NOT NULL UNIQUE,
        topic_fingerprint TEXT NOT NULL, published_at TEXT NOT NULL, score REAL NOT NULL,
        raw_payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW', created_at TEXT NOT NULL
      );
      CREATE TABLE reels (
        id TEXT PRIMARY KEY, topic_id TEXT, is_sample INTEGER NOT NULL DEFAULT 0, pillar TEXT NOT NULL,
        status TEXT NOT NULL, title TEXT NOT NULL, storyboard_json TEXT NOT NULL, caption TEXT NOT NULL,
        hashtags_json TEXT NOT NULL, voice_name TEXT NOT NULL, music_enabled INTEGER NOT NULL DEFAULT 1,
        rendered_narration_hash TEXT, rendered_voice_name TEXT, rendered_storyboard_hash TEXT,
        alignment_mode TEXT, audio_duration_ms INTEGER, video_path TEXT, cover_path TEXT,
        ffprobe_json TEXT, instagram_media_id TEXT, instagram_permalink TEXT, error_message TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
      );
      CREATE TABLE publish_attempts (
        id TEXT PRIMARY KEY, reel_id TEXT NOT NULL, platform TEXT NOT NULL, state TEXT NOT NULL,
        container_id TEXT, upload_uri TEXT, remote_media_id TEXT, error_code TEXT,
        error_subcode TEXT, error_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE pipeline_runs (
        id TEXT PRIMARY KEY, reel_id TEXT, trigger TEXT NOT NULL, worker_source TEXT NOT NULL,
        worker_pid INTEGER, current_step TEXT NOT NULL, progress_pct INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL, logs_json TEXT NOT NULL DEFAULT '[]', started_at TEXT NOT NULL, finished_at TEXT
      );
      CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-11-01T00:00:00.000Z');
      INSERT INTO settings (key, value_json, updated_at) VALUES ('brandHandle', '"@legacy.dev"', '2026-11-01T00:00:00.000Z');
    `);
    v1.close();

    const store = new SqliteStore(dbPath);
    try {
      const settings = store.getSettings({
        defaultVoice: 'Puck',
        brandHandle: '@default',
        musicEnabled: true,
        musicVolumeDb: -22,
        minPublishSpacingHours: 6,
        activeLlmEndpointId: null,
        aiBrollEnabled: false,
        voiceRotation: false,
      });
      expect(settings.brandHandle).toBe('@legacy.dev');
      expect(settings.activeLlmEndpointId).toBeNull();

      // Precedence: fresh DB follows LLM_PROVIDER=openai_compatible from .env
      const envWithCompat = loadEnv({
        DATA_DIR: tmpDir,
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_COMPAT_BASE_URL: 'http://127.0.0.1:11434/v1',
        OPENAI_COMPAT_MODEL: 'qwen2.5:14b',
      });
      expect(resolveActiveLlmEndpoint(store, envWithCompat).active.id).toBe(
        'env_openai_compatible',
      );

      // Invalid .env URL / empty model never crash startup and mark configured=false
      const badEnvCompat = loadEnv({
        DATA_DIR: tmpDir,
        LLM_PROVIDER: 'openai_compatible',
        OPENAI_COMPAT_BASE_URL: 'ftp://bad.host',
        OPENAI_COMPAT_MODEL: '',
      });
      expect(resolveActiveLlmEndpoint(store, badEnvCompat).active.configured).toBe(false);

      // Custom endpoint CRUD + empty key preserves secret + delete active resets to 'gemini' without nested-tx crash
      const ep = store.createLlmEndpoint({
        name: 'My Ollama',
        baseUrl: 'http://127.0.0.1:11434/v1/',
        model: 'qwen2.5:14b',
        apiKey: 'sk-custom-secret-9999',
      });
      expect(ep.baseUrl).toBe('http://127.0.0.1:11434/v1');

      const preserved = store.updateLlmEndpoint(ep.id, { model: 'qwen2.5:32b', apiKey: '' });
      expect(preserved?.model).toBe('qwen2.5:32b');
      expect(preserved?.apiKey).toBe('sk-custom-secret-9999');

      store.updateSettings({ activeLlmEndpointId: ep.id }, settings);
      expect(resolveActiveLlmEndpoint(store, envWithCompat).active.id).toBe(ep.id);

      expect(store.deleteLlmEndpoint(ep.id)).toBe(true);
      expect(resolveActiveLlmEndpoint(store, envWithCompat).active.id).toBe('gemini');
    } finally {
      store.close();
    }
  });

  it('handles /models discovery, OpenRouter-style keyed health verification, parameter fallbacks, key redaction, and storyboard repair', async () => {
    let chatCallCount = 0;
    let attemptForTopic = 0;
    const seenPayloads: Array<Record<string, unknown>> = [];

    const mockServer = await startTempServer((req, bodyText, res) => {
      const auth = req.headers.authorization ?? '';

      if (req.url === '/v1/models' && req.method === 'GET') {
        if (auth === 'Bearer sk-unauthorized-bad') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid key sk-unauthorized-bad' } }));
          return;
        }
        // Returns 200 even if keyed bad Key B ("OpenRouter fake-200 /models" case)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            data: [{ id: 'gpt-compat-pro' }, { id: 'qwen2.5:14b' }],
          }),
        );
        return;
      }

      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        chatCallCount++;
        const payload = JSON.parse(bodyText) as Record<string, unknown>;
        seenPayloads.push(payload);

        if (auth === 'Bearer sk-bad-openrouter-key') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: 'Provider rejected key sk-bad-openrouter-key on upstream call',
                code: 401,
              },
            }),
          );
          return;
        }

        if (payload.model === 'probe-ok-model') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ finish_reason: 'stop', message: { content: 'OK' } }],
            }),
          );
          return;
        }

        // Combined compatibility downgrade test on first request sequence
        if (payload.model === 'downgrade-model') {
          if ('max_tokens' in payload) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: {
                  message:
                    "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
                },
              }),
            );
            return;
          }
          if ('temperature' in payload) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: { message: "Unsupported value: 'temperature' does not support 0.45" },
              }),
            );
            return;
          }
          const rf = payload.response_format as { type?: string } | undefined;
          if (rf?.type === 'json_schema') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: { message: 'response_format json_schema not supported' } }),
            );
            return;
          }
          if (rf?.type === 'json_object') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: { message: 'response_format json_object unsupported' } }),
            );
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content: `<think>planning storyboard</think>\n\`\`\`json\n${JSON.stringify(buildValidStoryboardJson(false))}\n\`\`\``,
                  },
                },
              ],
            }),
          );
          return;
        }

        if (payload.model === 'truncated-model') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ finish_reason: 'length', message: { content: '{"title": "Cut off' } }],
            }),
          );
          return;
        }

        if (payload.model === 'repair-model') {
          attemptForTopic++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content: JSON.stringify(buildValidStoryboardJson(attemptForTopic === 1)),
                  },
                },
              ],
            }),
          );
          return;
        }
      }

      res.writeHead(404);
      res.end('{}');
    });

    try {
      const modelsRes = await fetchOpenAICompatibleModels({ baseUrl: `${mockServer.url}/v1` });
      expect(modelsRes.ok).toBe(true);
      expect(modelsRes.models).toEqual(['gpt-compat-pro', 'qwen2.5:14b']);

      // Keyless loopback /models fast path does NOT trigger /chat/completions
      const countBeforeFast = chatCallCount;
      const localFastHealth = await checkOpenAICompatibleHealth({
        endpointId: 'llm_1',
        name: 'Local Ollama',
        baseUrl: `${mockServer.url}/v1`,
        model: 'qwen2.5:14b',
      });
      expect(localFastHealth.ok).toBe(true);
      expect(chatCallCount).toBe(countBeforeFast);

      // Keyed endpoint MUST probe /chat/completions and catch HTTP 200 error + redact key
      const badKeyHealth = await checkOpenAICompatibleHealth({
        endpointId: 'llm_2',
        name: 'OpenRouter Test',
        baseUrl: `${mockServer.url}/v1`,
        model: 'qwen2.5:14b',
        apiKey: 'sk-bad-openrouter-key',
      });
      expect(badKeyHealth.ok).toBe(false);
      expect(badKeyHealth.message).toContain('[REDACTED]');
      expect(badKeyHealth.message).not.toContain('sk-bad-openrouter-key');

      // Good probe works cleanly
      const goodProbeHealth = await checkOpenAICompatibleHealth({
        endpointId: 'llm_3',
        name: 'Custom Probe',
        baseUrl: `${mockServer.url}/v1`,
        model: 'probe-ok-model',
        apiKey: 'sk-good-key-1234',
      });
      expect(goodProbeHealth.ok).toBe(true);

      // Downgrade chain + think/fence stripping
      const rawDowngraded = await callOpenAICompatibleStoryboard({
        baseUrl: `${mockServer.url}/v1`,
        model: 'downgrade-model',
        systemPrompt: 'sys',
        userPrompt: 'usr',
      });
      const parsedStoryboard = convertFlatGeminiResponseToStoryboard(rawDowngraded, [
        { title: 'Eval', url: 'https://example.com' },
      ]);
      expect(parsedStoryboard.scenes).toHaveLength(5);
      expect(seenPayloads.some((p) => p.max_completion_tokens === 8192)).toBe(true);

      // Truncated model reports token truncation clearly
      await expect(
        callOpenAICompatibleStoryboard({
          baseUrl: `${mockServer.url}/v1`,
          model: 'truncated-model',
          systemPrompt: 'sys',
          userPrompt: 'usr',
        }),
      ).rejects.toThrow(/finish_reason: length/);

      // Full generateStoryboard() with 1-retry editorial repair
      const env = loadEnv({ DATA_DIR: tmpDir });
      const repaired = await generateStoryboard(
        env,
        {
          id: 'llm_repair',
          name: 'Custom Repair Endpoint',
          provider: 'openai_compatible',
          source: 'custom',
          baseUrl: `${mockServer.url}/v1`,
          model: 'repair-model',
          apiKey: '',
          hasApiKey: false,
          apiKeyHint: null,
          configured: true,
          editable: true,
          createdAt: null,
          updatedAt: null,
        },
        {
          topic: {
            title: 'Local Agent Harnesses',
            summary: SAMPLE_DEMO_STORYBOARD.caption,
            sourceName: 'GitHub',
            sourceUrl: 'https://github.com/example/harness',
            pillar: 'harnesses',
          },
          brandHandle: '@ai.dev.reels',
        },
      );
      expect(attemptForTopic).toBe(2);
      expect(repaired.scenes).toHaveLength(6);
      expect(repaired.scenes[5]?.type).toBe('takeaway_cta');
      expect(repaired.scenes[5]?.narration).toBe(CHANNEL_OUTRO_NARRATION);
    } finally {
      await mockServer.close();
    }
  });

  it('migrates SQLite v2 -> v3 upgrading legacy -22 dB music volume to -17 dB without touching custom values', () => {
    const legacyDbPath = path.join(tmpDir, 'v2-legacy.db');
    const db1 = new DatabaseSync(legacyDbPath);
    db1.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-11-01T00:00:00.000Z');
      INSERT INTO schema_migrations (version, applied_at) VALUES (2, '2026-11-01T00:00:00.000Z');
      INSERT INTO settings (key, value_json, updated_at) VALUES ('musicVolumeDb', '-22', '2026-11-01T00:00:00.000Z');
    `);
    db1.close();

    const upgradedStore = new SqliteStore(legacyDbPath);
    expect(
      upgradedStore.getSettings({
        defaultVoice: 'Puck',
        brandHandle: '',
        musicEnabled: true,
        musicVolumeDb: -17,
        minPublishSpacingHours: 6,
        activeLlmEndpointId: null,
        aiBrollEnabled: false,
        voiceRotation: false,
      }).musicVolumeDb,
    ).toBe(-17);
    upgradedStore.close();

    const customDbPath = path.join(tmpDir, 'v2-custom.db');
    const db2 = new DatabaseSync(customDbPath);
    db2.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-11-01T00:00:00.000Z');
      INSERT INTO schema_migrations (version, applied_at) VALUES (2, '2026-11-01T00:00:00.000Z');
      INSERT INTO settings (key, value_json, updated_at) VALUES ('musicVolumeDb', '-15', '2026-11-01T00:00:00.000Z');
    `);
    db2.close();

    const customStore = new SqliteStore(customDbPath);
    expect(
      customStore.getSettings({
        defaultVoice: 'Puck',
        brandHandle: '',
        musicEnabled: true,
        musicVolumeDb: -17,
        minPublishSpacingHours: 6,
        activeLlmEndpointId: null,
        aiBrollEnabled: false,
        voiceRotation: false,
      }).musicVolumeDb,
    ).toBe(-15);
    customStore.close();
  });
});
