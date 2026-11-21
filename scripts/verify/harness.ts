import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { serve } from '@hono/node-server';
import {
  computeNarrationHash,
  computeStoryboardVisualHash,
  FORMAT_SAMPLE_STORYBOARDS,
  isChannelOutroScene,
  LocalAssetStorage,
  PipelineQueue,
  REEL_FORMAT_IDS,
  ReelOrchestrator,
  SAMPLE_DEMO_STORYBOARD,
  SqliteStore,
  toFlatStoryboardPayload,
  type AppEnv,
  type FetchSourceVisualFn,
  type GenerateBrollFn,
  type ReelFormatId,
  type ReelRecord,
  type RenderVideoCallback,
  type SynthesizeVoiceFn,
  type TopicRecord,
} from '@post/core';
import { createServerApp } from '../../apps/server/src/app.js';

export interface VerifyHarness {
  baseUrl: string;
  mockLlmBaseUrl: string;
  seededReadyReelId: string;
  seededPublishedReelId: string;
  seededTopicIds: string[];
  createTempSpacingFixtures?: () => { candidateId: string; cleanup: () => void };
  close: () => Promise<void>;
}

function generateTinyValidMedia(workDir: string): {
  mp4Path: string;
  jpgPath: string;
  voice48kPath: string;
  voice16kPath: string;
} {
  const mp4Path = path.join(workDir, 'fixture.mp4');
  const jpgPath = path.join(workDir, 'fixture.jpg');
  const voice48kPath = path.join(workDir, 'fixture-voice-48k.wav');
  const voice16kPath = path.join(workDir, 'fixture-voice-16k.wav');

  // 5-second spec-valid 1080x1920 30fps H.264 + stereo 48kHz AAC MP4
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1080x1920:rate=30:duration=5',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=240:sample_rate=48000:duration=5',
      '-t',
      '5',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-shortest',
      mp4Path,
    ],
    { stdio: 'ignore' },
  );

  // Rich colorful gradient JPEG so fixture covers & source_spotlight images are non-blank
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1080x720:duration=0.1',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      jpgPath,
    ],
    { stdio: 'ignore' },
  );

  // Non-silent 5s stereo 48kHz & mono 16kHz voice fixtures (exercises sidechaincompress ducking)
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:sample_rate=48000:duration=5',
      '-af',
      'volume=0.35',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      voice48kPath,
    ],
    { stdio: 'ignore' },
  );

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      voice48kPath,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      voice16kPath,
    ],
    { stdio: 'ignore' },
  );

  return { mp4Path, jpgPath, voice48kPath, voice16kPath };
}

const UNIQUE_HOOK_HEADLINES = [
  'Formal Silicon Proofs Beat Bugs',
  'Fast Harness Loops Lift Accuracy',
  'Tiny Scoped Diffs Ship Faster',
  'Cached Coding Tokens Drop 60%',
  'Autonomous Verifiers Catch Drift',
  'Ranked Countdown For Clean Code',
  'Head-To-Head Agent Loop Battle',
  'Four Steps To Zero Regressions',
  'Myths Slowing Modern Dev Teams',
  'Automated Visual Checks Win Daily',
];

const UNIQUE_HOOK_PREFIXES = [
  'Watch closely how',
  'Engineers just discovered',
  'Stop guessing why',
  'Real benchmarks prove',
  'Every senior builder',
  'Three sharp rules',
  'Here is what',
  'Modern AI teams',
  'Nobody talks about',
  'Fast local harnesses',
];

function extractFormatFromPrompt(systemPrompt: string): ReelFormatId {
  const match = systemPrompt.match(/Reel Format:\s*([a-z0-9_]+)/i);
  const candidate = match?.[1]?.trim() as ReelFormatId | undefined;
  if (candidate && REEL_FORMAT_IDS.includes(candidate)) {
    return candidate;
  }
  return 'deep_dive_demo';
}

function extractSummaryFromUserPrompt(userPrompt: string): string {
  const marker = 'Topic Summary & Facts:\n';
  const idx = userPrompt.indexOf(marker);
  if (idx === -1) return '';
  const tail = userPrompt.slice(idx + marker.length);
  const endIdx = tail.indexOf('\n\n');
  return (endIdx === -1 ? tail : tail.slice(0, endIdx)).trim();
}

function startMockOpenAIServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let generationSeq = 0;

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
        let parsed: { messages?: Array<{ role?: string; content?: string }> } = {};
        try {
          parsed = JSON.parse(body) as { messages?: Array<{ role?: string; content?: string }> };
        } catch {
          // Ignore parse error
        }

        const systemMsg =
          parsed.messages?.find((m) => m.role === 'system')?.content ??
          parsed.messages?.[0]?.content ??
          '';
        const userMsg =
          parsed.messages?.find((m) => m.role === 'user')?.content ??
          parsed.messages?.[1]?.content ??
          '';
        const isProbe = systemMsg.includes('Reply with OK') || userMsg.includes('Reply with OK');

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

        generationSeq++;
        const formatId = extractFormatFromPrompt(systemMsg);
        const template = structuredClone(FORMAT_SAMPLE_STORYBOARDS[formatId]);
        // Strip legacy channel outro if present
        const contentScenes = template.scenes.filter((s) => !isChannelOutroScene(s));
        const prefix = UNIQUE_HOOK_PREFIXES[(generationSeq - 1) % UNIQUE_HOOK_PREFIXES.length]!;
        const freshHeadline =
          UNIQUE_HOOK_HEADLINES[(generationSeq - 1) % UNIQUE_HOOK_HEADLINES.length]!;
        const summaryQuote = extractSummaryFromUserPrompt(userMsg);

        for (const scene of contentScenes) {
          if (scene.type === 'hook_title') {
            scene.headline = freshHeadline;
            scene.narration = `${prefix} issue ${generationSeq} transforms ${formatId.replace(/_/g, ' ')} workflows for modern developers today.`;
          }
          if (scene.type === 'social_post' && summaryQuote.length >= 20) {
            scene.postText = summaryQuote.slice(0, 220);
          }
        }

        const payload = toFlatStoryboardPayload({
          ...template,
          title: `${template.title.slice(0, 100)} (${generationSeq})`,
          scenes: contentScenes,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: `chatcmpl-verify-sb-${generationSeq}`,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: JSON.stringify(payload) },
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
  media: { mp4Path: string; jpgPath: string; voice48kPath: string; voice16kPath: string },
): { readyReel: ReelRecord; publishedReel: ReelRecord; topics: TopicRecord[] } {
  const nowMs = Date.now();
  const dayMs = 86_400_000;
  const nowIso = new Date(nowMs).toISOString();
  const twoDaysAgoIso = new Date(nowMs - 2 * dayMs).toISOString();
  const fiveDaysAgoIso = new Date(nowMs - 5 * dayMs).toISOString();
  const twelveDaysAgoIso = new Date(nowMs - 12 * dayMs).toISOString();
  const fortyFiveDaysAgoIso = new Date(nowMs - 45 * dayMs).toISOString();

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
      publishedAt: twoDaysAgoIso,
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
      publishedAt: fiveDaysAgoIso,
      score: 88,
      rawPayloadJson: '{}',
    },
    {
      topicFingerprint: 'verify-topic-4',
      title: 'Legacy Prompt Engineering Guide for Early Chatbots',
      summary:
        'Historical notes from two weeks ago covering static prompt templates before modern coding agent harnesses.',
      sourceName: 'Dev Archive',
      sourceUrl: 'https://example.com/legacy-prompt-guide',
      canonicalUrlHash: 'hash-verify-4',
      pillar: 'coding_practices',
      publishedAt: twelveDaysAgoIso,
      score: 74,
      rawPayloadJson: '{}',
    },
    {
      topicFingerprint: 'verify-topic-5',
      title: 'Archive: Early Transformer Attention Paper Walkthrough',
      summary:
        'Older research recap from last month reviewing foundational multi-head attention mechanics and positional encodings.',
      sourceName: 'ML Classics',
      sourceUrl: 'https://example.com/early-transformer-walkthrough',
      canonicalUrlHash: 'hash-verify-5',
      pillar: 'ai_news',
      publishedAt: fortyFiveDaysAgoIso,
      score: 68,
      rawPayloadJson: '{}',
    },
  ]);

  const brandHandle = '@verify.studio';
  const narrationHash = computeNarrationHash(SAMPLE_DEMO_STORYBOARD);
  const visualHash = computeStoryboardVisualHash(SAMPLE_DEMO_STORYBOARD, true, brandHandle);

  const readyReel = store.createReel({
    topicId: topics[0]!.id,
    isSample: true,
    title: SAMPLE_DEMO_STORYBOARD.title,
    pillar: SAMPLE_DEMO_STORYBOARD.pillar,
    status: 'READY_FOR_REVIEW',
    storyboard: SAMPLE_DEMO_STORYBOARD,
    caption: SAMPLE_DEMO_STORYBOARD.caption,
    hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
    voiceName: 'Puck',
    musicEnabled: true,
  });

  storage.ensureReelDir(readyReel.id);
  const readyVideoPath = storage.reelFile(readyReel.id, 'final.mp4');
  const readyCoverPath = storage.reelFile(readyReel.id, 'cover.jpg');
  const readyCaptionsPath = storage.reelFile(readyReel.id, 'captions.json');
  fs.copyFileSync(media.mp4Path, readyVideoPath);
  fs.copyFileSync(media.jpgPath, readyCoverPath);
  fs.copyFileSync(media.voice48kPath, storage.reelFile(readyReel.id, 'voice-48k.wav'));
  fs.copyFileSync(media.voice16kPath, storage.reelFile(readyReel.id, 'voice-16k.wav'));
  fs.writeFileSync(
    readyCaptionsPath,
    JSON.stringify({
      alignmentMode: 'estimated',
      audioDurationMs: 5000,
      fps: 30,
      captions: [],
      sceneTimings: SAMPLE_DEMO_STORYBOARD.scenes.map((scene, idx) => ({
        sceneId: scene.id,
        sceneType: scene.type,
        label: scene.type,
        startMs: idx * 800,
        endMs: (idx + 1) * 800,
        startFrame: idx * 24,
        durationInFrames: 24,
      })),
    }),
  );

  store.updateReel(readyReel.id, {
    videoPath: readyVideoPath,
    coverPath: readyCoverPath,
    alignmentMode: 'estimated',
    audioDurationMs: 5000,
    renderedNarrationHash: narrationHash,
    renderedVoiceName: 'Puck',
    renderedStoryboardHash: visualHash,
    ffprobeJson: JSON.stringify({
      ok: true,
      errors: [],
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 5.0,
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioSampleRate: 48000,
      fileSizeBytes: fs.statSync(readyVideoPath).size,
      hasAudio: true,
    }),
  });

  const publishedReel = store.createReel({
    topicId: topics[1]!.id,
    isSample: true,
    title: 'Published Benchmark Comparison Reel',
    pillar: 'benchmarks',
    status: 'PUBLISHED',
    storyboard: SAMPLE_DEMO_STORYBOARD,
    caption: 'Published benchmark summary for developer archive verification.',
    hashtags: ['#benchmarks', '#ai', '#coding'],
    voiceName: 'Fenrir',
    musicEnabled: true,
  });

  storage.ensureReelDir(publishedReel.id);
  const pubVideoPath = storage.reelFile(publishedReel.id, 'final.mp4');
  const pubCoverPath = storage.reelFile(publishedReel.id, 'cover.jpg');
  fs.copyFileSync(media.mp4Path, pubVideoPath);
  fs.copyFileSync(media.jpgPath, pubCoverPath);
  store.updateReel(publishedReel.id, {
    videoPath: pubVideoPath,
    coverPath: pubCoverPath,
    audioDurationMs: 5000,
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
    GEMINI_VEO_MODEL: 'veo-3.1-fast-generate-preview',
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
    BRAND_HANDLE: '@verify.studio',
    WHISPER_CLI_PATH: '',
    MAX_CONCURRENT_RENDERS: 2,
    SERVER_PORT: 4310,
    DATA_DIR: dataDir,
    WORKSPACE_ROOT: workspaceRoot,
    DATA_DIR_ABS: dataDir,
    CACHE_DIR_ABS: cacheDir,
  };

  const storage = new LocalAssetStorage(dataDir);
  storage.ensureBaseDirs();

  const store = new SqliteStore(path.join(dataDir, 'post.db'));
  const queue = new PipelineQueue(store, { maxConcurrentRenders: env.MAX_CONCURRENT_RENDERS });

  const fastRenderVideo: RenderVideoCallback = async ({ outputVideoPath, onRenderProgress }) => {
    onRenderProgress?.(50, 75, 150);
    await new Promise((resolve) => setTimeout(resolve, 120));
    fs.copyFileSync(media.mp4Path, outputVideoPath);
    onRenderProgress?.(100, 150, 150);
  };

  const stubSynthesizeVoice: SynthesizeVoiceFn = async ({ workDir, isSample, signal }) => {
    // Give sample runs a brief abortable window so Check 04 can observe live progress & Cancel
    if (isSample) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('Cancelled'));
          return;
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, 2200);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('Cancelled'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    fs.mkdirSync(workDir, { recursive: true });
    const rawPath = path.join(workDir, 'voice-raw.bin');
    const trimmedPath = path.join(workDir, 'voice-trimmed.wav');
    const voice48kPath = path.join(workDir, 'voice-48k.wav');
    const voice16kPath = path.join(workDir, 'voice-16k.wav');
    fs.copyFileSync(media.voice48kPath, rawPath);
    fs.copyFileSync(media.voice48kPath, trimmedPath);
    fs.copyFileSync(media.voice48kPath, voice48kPath);
    fs.copyFileSync(media.voice16kPath, voice16kPath);
    return {
      rawAudioPath: rawPath,
      trimmedMasterPath: trimmedPath,
      voice48kPath,
      voice16kPath,
      durationMs: 5000,
    };
  };

  const stubFetchSourceVisual: FetchSourceVisualFn = async ({ url, outDir, filename }) => {
    const file = filename ?? 'source-visual.jpg';
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(media.jpgPath, path.join(outDir, file));
    return {
      kind: 'image',
      file,
      sourceUrl: url,
      width: 1080,
      height: 720,
    };
  };

  const stubGenerateBroll: GenerateBrollFn = async ({ sceneId, outDir }) => {
    const file = `broll-${sceneId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(media.mp4Path, path.join(outDir, file));
    return {
      asset: {
        kind: 'video',
        file,
        durationMs: 5000,
      },
    };
  };

  const orchestrator = new ReelOrchestrator({
    env,
    getEnv: () => env,
    store,
    storage,
    queue,
    renderVideo: fastRenderVideo,
    synthesizeVoice: stubSynthesizeVoice,
    fetchSourceVisual: stubFetchSourceVisual,
    generateBroll: stubGenerateBroll,
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
    createTempSpacingFixtures: () => {
      const publishedTemp = store.createReel({
        topicId: seeded.topics[1]!.id,
        isSample: false,
        title: 'Temporary Recent Published Anchor Reel',
        pillar: 'benchmarks',
        status: 'READY_FOR_REVIEW',
        storyboard: SAMPLE_DEMO_STORYBOARD,
        caption: SAMPLE_DEMO_STORYBOARD.caption,
        hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
        voiceName: 'Fenrir',
        musicEnabled: true,
      });
      store.updateReel(publishedTemp.id, {
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString(),
        instagramMediaId: 'ig_temp_spacing_anchor',
      });

      const tempReel = store.createReel({
        topicId: seeded.topics[0]!.id,
        isSample: false,
        title: 'Temporary Spacing Guardrail Check Reel',
        pillar: SAMPLE_DEMO_STORYBOARD.pillar,
        status: 'READY_FOR_REVIEW',
        storyboard: SAMPLE_DEMO_STORYBOARD,
        caption: SAMPLE_DEMO_STORYBOARD.caption,
        hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
        voiceName: 'Puck',
        musicEnabled: true,
      });
      storage.ensureReelDir(tempReel.id);
      const vid = storage.reelFile(tempReel.id, 'final.mp4');
      const cov = storage.reelFile(tempReel.id, 'cover.jpg');
      fs.copyFileSync(media.mp4Path, vid);
      fs.copyFileSync(media.jpgPath, cov);
      fs.copyFileSync(media.voice48kPath, storage.reelFile(tempReel.id, 'voice-48k.wav'));
      fs.copyFileSync(media.voice16kPath, storage.reelFile(tempReel.id, 'voice-16k.wav'));
      fs.writeFileSync(
        storage.reelFile(tempReel.id, 'captions.json'),
        JSON.stringify({
          alignmentMode: 'estimated',
          audioDurationMs: 5000,
          fps: 30,
          captions: [],
          sceneTimings: SAMPLE_DEMO_STORYBOARD.scenes.map((scene, idx) => ({
            sceneId: scene.id,
            sceneType: scene.type,
            label: scene.type,
            startMs: idx * 800,
            endMs: (idx + 1) * 800,
            startFrame: idx * 24,
            durationInFrames: 24,
          })),
        }),
      );
      store.updateReel(tempReel.id, {
        videoPath: vid,
        coverPath: cov,
        audioDurationMs: 5000,
        renderedNarrationHash: computeNarrationHash(SAMPLE_DEMO_STORYBOARD),
        renderedVoiceName: 'Puck',
        renderedStoryboardHash: computeStoryboardVisualHash(SAMPLE_DEMO_STORYBOARD, true, '@verify.studio'),
      });
      return {
        candidateId: tempReel.id,
        cleanup: () => {
          store.deleteReel(tempReel.id);
          storage.deleteReelDir(tempReel.id);
          store.deleteReel(publishedTemp.id);
          storage.deleteReelDir(publishedTemp.id);
        },
      };
    },
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
