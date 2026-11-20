import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import {
  computeNarrationHash,
  computeStoryboardVisualHash,
  LocalAssetStorage,
  PipelineQueue,
  ReelOrchestrator,
  SAMPLE_DEMO_STORYBOARD,
  SqliteStore,
  type AppEnv,
  type ReelRecord,
  type RenderVideoCallback,
  type TopicRecord,
} from '@post/core';
import { createServerApp } from '../../apps/server/src/app.js';

export interface VerifyHarness {
  baseUrl: string;
  mockLlmBaseUrl: string;
  seededReadyReelId: string;
  seededPublishedReelId: string;
  seededTopicIds: string[];
  close: () => Promise<void>;
}

function generateTinyValidMedia(workDir: string): { mp4Path: string; jpgPath: string } {
  const mp4Path = path.join(workDir, 'fixture.mp4');
  const jpgPath = path.join(workDir, 'fixture.jpg');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x11131b:s=360x640:d=1',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      mp4Path,
    ],
    { stdio: 'ignore' },
  );

  execFileSync(
    'ffmpeg',
    ['-y', '-i', mp4Path, '-frames:v', '1', '-q:v', '3', jpgPath],
    { stdio: 'ignore' },
  );

  return { mp4Path, jpgPath };
}

function startMockOpenAIServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');

      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [
              { id: 'verify-coder-7b', object: 'model' },
              { id: 'verify-pro-32b', object: 'model' },
            ],
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let parsed: { messages?: Array<{ content?: string }> } = {};
        try {
          parsed = JSON.parse(body) as { messages?: Array<{ content?: string }> };
        } catch {
          // Ignore parse error
        }

        const firstMsg = parsed.messages?.[0]?.content ?? '';
        const isProbe = firstMsg.includes('Reply with OK');

        if (isProbe) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'chatcmpl-verify-probe',
              choices: [{ index: 0, message: { role: 'assistant', content: 'OK' } }],
            }),
          );
          return;
        }

        const storyboardPayload = {
          title: 'Mock Verified Coding Harness Release',
          pillar: 'harnesses',
          caption: 'Deterministic verification loops catch regressions before shipping.',
          hashtags: ['#ai', '#devtools', '#coding', '#benchmarks', '#vibecoding'],
          scenes: [
            {
              id: 'scene-1',
              type: 'hook_title',
              narration:
                'Deterministic verification loops catch broken UI flows before your users ever see them.',
              hookTitle: {
                badge: 'VERIFICATION',
                headline: 'Verify Every Flow Automatically',
                subheadline: 'Screenshots, console checks, and API assertions on every run.',
                highlightStat: '0 regressions',
              },
            },
            {
              id: 'scene-2',
              type: 'benchmark_bars',
              narration:
                'Automated browser loops cut UI bug escape rates sharply compared to manual spot checks.',
              benchmarkBars: {
                title: 'Bug Catch Rate',
                metricUnit: '%',
                sourceLabel: 'Internal E2E',
                bars: [
                  { label: 'Manual Check', value: 42 },
                  { label: 'Unit Only', value: 68 },
                  { label: 'Full E2E Loop', value: 96, isWinner: true },
                ],
              },
            },
            {
              id: 'scene-3',
              type: 'code_compare',
              narration:
                'Wire a manifest drift test so every new screen forces a matching verification check.',
              codeCompare: {
                title: 'Manifest Drift Gate',
                language: 'ts',
                filename: 'manifest.ts',
                mode: 'before_after',
                beforeLabel: 'Ad-hoc',
                beforeCode: '// remember to test new pages',
                afterLabel: 'Enforced',
                afterCode: 'expect(missingViews).toEqual([]);',
                highlightLines: [1],
              },
            },
            {
              id: 'scene-4',
              type: 'terminal_demo',
              narration:
                'One single command boots an isolated server, drives headless Chrome, and writes a visual report.',
              terminalDemo: {
                title: 'Single Command Verify',
                windowTitle: 'zsh - post',
                command: 'npm run verify:e2e',
                outputLines: [
                  { text: '[ok] 6/6 E2E checks passed', tone: 'success' },
                  { text: '[ok] 0 console errors, 0 HTTP 4xx/5xx', tone: 'accent' },
                ],
              },
            },
            {
              id: 'scene-5',
              type: 'takeaway_cta',
              narration:
                'Make your verification suite evolve automatically alongside every feature you ship.',
              takeawayCta: {
                badge: 'PRO RULE',
                headline: 'Automate Your Eyes',
                takeaway: 'Treat visual E2E checks as first-class CI gates.',
                ctaText: 'Save this workflow',
              },
            },
          ],
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-verify-sb',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: JSON.stringify(storyboardPayload) },
              },
            ],
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind mock OpenAI server'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}/v1`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

function seedFixtureData(
  store: SqliteStore,
  storage: LocalAssetStorage,
  media: { mp4Path: string; jpgPath: string },
): { readyReel: ReelRecord; publishedReel: ReelRecord; topics: TopicRecord[] } {
  const nowIso = new Date().toISOString();
  const { topics } = store.upsertTopics([
    {
      topicFingerprint: 'verify-topic-1',
      title: 'Frostbite: AI-Designed CPU Architecture Passes Silicon Verification',
      summary:
        'Researchers used an automated agent harness to design, simulate, and formally verify a new RISC-V core with 22% higher IPC.',
      sourceName: 'Hacker News',
      sourceUrl: 'https://news.ycombinator.com/item?id=990001',
      canonicalUrlHash: 'hash-verify-1',
      pillar: 'ai_news',
      publishedAt: nowIso,
      score: 94,
      rawPayloadJson: '{}',
    },
    {
      topicFingerprint: 'verify-topic-2',
      title: 'SWE-bench Verified 2026: Harness Loops Beat 10x Larger Contexts',
      summary:
        'Benchmark study comparing 12 coding models shows fast typecheck and unit test loops improve pass@1 by 18.4% across all models.',
      sourceName: 'SWE-bench Blog',
      sourceUrl: 'https://www.swebench.com/verify-study',
      canonicalUrlHash: 'hash-verify-2',
      pillar: 'benchmarks',
      publishedAt: nowIso,
      score: 91,
      rawPayloadJson: '{}',
    },
    {
      topicFingerprint: 'verify-topic-3',
      title: 'Top Vibe Coding Practices: Keep Diffs Small & Verify Every Step',
      summary:
        'Senior engineers share practical harnesses for keeping AI-assisted coding sessions clean, testable, and fast.',
      sourceName: 'Dev Engineering',
      sourceUrl: 'https://example.com/vibe-coding-tips',
      canonicalUrlHash: 'hash-verify-3',
      pillar: 'vibe_coding',
      publishedAt: nowIso,
      score: 88,
      rawPayloadJson: '{}',
    },
  ]);

  const brandHandle = '@ai.dev.reels';
  const narrationHash = computeNarrationHash(SAMPLE_DEMO_STORYBOARD);
  const visualHash = computeStoryboardVisualHash(SAMPLE_DEMO_STORYBOARD, true, brandHandle);

  const readyReel = store.createReel({
    topicId: topics[0]!.id,
    title: SAMPLE_DEMO_STORYBOARD.title,
    pillar: SAMPLE_DEMO_STORYBOARD.pillar,
    status: 'READY_FOR_REVIEW',
    voiceName: 'Puck',
    storyboard: SAMPLE_DEMO_STORYBOARD,
    caption: SAMPLE_DEMO_STORYBOARD.caption,
    hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
    isSample: true,
  });

  storage.ensureReelDir(readyReel.id);
  const readyVideoPath = storage.reelFile(readyReel.id, 'final.mp4');
  const readyCoverPath = storage.reelFile(readyReel.id, 'cover.jpg');
  const readyCaptionsPath = storage.reelFile(readyReel.id, 'captions.json');
  fs.copyFileSync(media.mp4Path, readyVideoPath);
  fs.copyFileSync(media.jpgPath, readyCoverPath);
  fs.writeFileSync(
    readyCaptionsPath,
    JSON.stringify({ alignmentMode: 'estimated', captions: [], sceneTimings: [] }, null, 2),
  );
  store.updateReel(readyReel.id, {
    videoPath: readyVideoPath,
    coverPath: readyCoverPath,
    audioDurationMs: 41_200,
    alignmentMode: 'estimated',
    renderedNarrationHash: narrationHash,
    renderedVoiceName: 'Puck',
    renderedStoryboardHash: visualHash,
    ffprobeJson: JSON.stringify({
      ok: true,
      errors: [],
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 41.2,
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioSampleRate: 48000,
      fileSizeBytes: fs.statSync(readyVideoPath).size,
      hasAudio: true,
    }),
  });

  const publishedReel = store.createReel({
    topicId: topics[1]!.id,
    title: 'Published Benchmark Comparison Reel',
    pillar: 'benchmarks',
    status: 'PUBLISHED',
    voiceName: 'Kore',
    storyboard: SAMPLE_DEMO_STORYBOARD,
    caption: 'Published benchmark reel ready in library.',
    hashtags: ['#benchmarks', '#ai', '#coding'],
    isSample: false,
  });

  storage.ensureReelDir(publishedReel.id);
  const pubVideoPath = storage.reelFile(publishedReel.id, 'final.mp4');
  const pubCoverPath = storage.reelFile(publishedReel.id, 'cover.jpg');
  fs.copyFileSync(media.mp4Path, pubVideoPath);
  fs.copyFileSync(media.jpgPath, pubCoverPath);
  store.updateReel(publishedReel.id, {
    videoPath: pubVideoPath,
    coverPath: pubCoverPath,
    audioDurationMs: 39_500,
    instagramMediaId: 'ig_verify_123456',
    instagramPermalink: 'https://www.instagram.com/reel/verify123/',
    publishedAt: nowIso,
  });

  return { readyReel, publishedReel, topics };
}

export async function startVerifyHarness(workspaceRoot: string): Promise<VerifyHarness> {
  const dashboardDistDir = path.join(workspaceRoot, 'apps', 'dashboard', 'dist');
  if (!fs.existsSync(path.join(dashboardDistDir, 'index.html'))) {
    throw new Error(
      `Dashboard dist not found at ${dashboardDistDir}. Run "npm run build" before running verify:e2e.`,
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-verify-'));
  const dataDir = path.join(tmpDir, 'data');
  const cacheDir = path.join(tmpDir, 'cache');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const media = generateTinyValidMedia(tmpDir);
  const mockLlm = await startMockOpenAIServer();

  const env: AppEnv = {
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'verify-dummy-gemini-key',
    GEMINI_TEXT_MODEL: 'gemini-3.8-flash',
    GEMINI_TTS_MODEL: 'gemini-3.8-flash-tts',
    GEMINI_TTS_VOICE: 'Puck',
    ENABLE_GEMINI_SEARCH_GROUNDING: false,
    OPENAI_COMPAT_NAME: 'OpenAI-Compatible (.env)',
    OPENAI_COMPAT_BASE_URL: '',
    OPENAI_COMPAT_API_KEY: '',
    OPENAI_COMPAT_MODEL: '',
    META_GRAPH_API_VERSION: 'v27.0',
    META_APP_ID: '',
    META_APP_SECRET: '',
    META_IG_USER_ID: '',
    META_ACCESS_TOKEN: '',
    GITHUB_TOKEN: '',
    BRAND_HANDLE: '@ai.dev.reels',
    WHISPER_CLI_PATH: '',
    SERVER_PORT: 4310,
    DATA_DIR: dataDir,
    WORKSPACE_ROOT: workspaceRoot,
    DATA_DIR_ABS: dataDir,
    CACHE_DIR_ABS: cacheDir,
  };

  const storage = new LocalAssetStorage(dataDir);
  storage.ensureBaseDirs();

  const store = new SqliteStore(path.join(dataDir, 'post.db'));
  const queue = new PipelineQueue(store);

  const fastRenderVideo: RenderVideoCallback = async ({ outputVideoPath, onRenderProgress }) => {
    onRenderProgress?.(50, 15, 30);
    await new Promise((resolve) => setTimeout(resolve, 250));
    fs.copyFileSync(media.mp4Path, outputVideoPath);
    onRenderProgress?.(100, 30, 30);
  };

  const orchestrator = new ReelOrchestrator({
    env,
    getEnv: () => env,
    store,
    storage,
    queue,
    renderVideo: fastRenderVideo,
    workerSource: 'server',
  });

  const seeded = seedFixtureData(store, storage, media);

  // Omit setEnv so refreshEnv() never reads repo .env or resets SERVER_PORT
  const app = createServerApp({
    getEnv: () => env,
    store,
    storage,
    queue,
    orchestrator,
    dashboardDistDir,
  });

  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const srv = serve(
      {
        fetch: app.fetch,
        hostname: '127.0.0.1',
        port: 0,
      },
      (info) => {
        env.SERVER_PORT = info.port;
        resolve(srv);
      },
    );
  });

  const baseUrl = `http://127.0.0.1:${env.SERVER_PORT}`;

  return {
    baseUrl,
    mockLlmBaseUrl: mockLlm.baseUrl,
    seededReadyReelId: seeded.readyReel.id,
    seededPublishedReelId: seeded.publishedReel.id,
    seededTopicIds: seeded.topics.map((t) => t.id),
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await mockLlm.close();
      store.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
