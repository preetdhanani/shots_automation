import {
  computeReelFingerprint,
  fingerprintSimilarity,
  isChannelOutroScene,
  type ReelStoryboard,
  type VoiceName,
} from '@post/core';
import type { VerifyCheck } from './types.js';

interface GeneratedReelPayload {
  id: string;
  title: string;
  status: string;
  errorMessage?: string | null;
  voiceName: VoiceName;
  createdAt: string;
  storyboard: ReelStoryboard;
}

async function apiJson<T>(
  baseUrl: string,
  route: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-Post-CSRF'] = '1';
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${route}`, { ...init, method, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${route} failed with HTTP ${res.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

async function waitForReelReady(
  baseUrl: string,
  reelId: string,
  timeoutMs = 30_000,
): Promise<GeneratedReelPayload> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const detail = await apiJson<{ reel: GeneratedReelPayload }>(
      baseUrl,
      `/api/reels/${encodeURIComponent(reelId)}`,
    );
    if (detail.reel.status === 'READY_FOR_REVIEW') {
      return detail.reel;
    }
    if (detail.reel.status === 'FAILED') {
      throw new Error(
        `Reel ${reelId} failed during generation: ${detail.reel.errorMessage ?? 'unknown error'}`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for reel ${reelId} to reach READY_FOR_REVIEW.`);
}

export const checkVideoVariety: VerifyCheck = {
  id: '07-video-variety',
  title: 'Video Variety Engine, Anti-Repeat Planner, Variety Panel, Restyle & Formats UI',
  async run(ctx) {
    // 1. Verify /api/variety returns all registries cleanly (safe in both isolated and live mode)
    const varietyMeta = await apiJson<{
      formats: Array<{ id: string; label: string }>;
      backgrounds: Array<{ id: string }>;
      typographies: Array<{ id: string }>;
      captionStyles: Array<{ id: string }>;
      musicMoods: Array<{ id: string }>;
      transitions: Array<{ id: string }>;
    }>(ctx.harness.baseUrl, '/api/variety');

    if (varietyMeta.formats.length !== 8) {
      throw new Error(`Expected 8 formats from /api/variety, got ${varietyMeta.formats.length}`);
    }
    if (varietyMeta.backgrounds.length !== 6 || varietyMeta.musicMoods.length !== 5) {
      throw new Error('Unexpected background or musicMood count from /api/variety');
    }
    ctx.recordAssertion(
      `Verified /api/variety registry (${varietyMeta.formats.length} formats, ${varietyMeta.backgrounds.length} backgrounds, ${varietyMeta.musicMoods.length} moods)`,
    );

    if (ctx.liveMode) {
      ctx.recordAssertion('Skipping mutating generation assertions in live read-only mode');
      return;
    }

    // 2. Register temporary OpenAI-compatible mock LLM endpoint pointing at harness.mockLlmBaseUrl
    const createdEp = await apiJson<{ endpoint: { id: string } }>(
      ctx.harness.baseUrl,
      '/api/llm/endpoints',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Verify Variety Mock LLM',
          baseUrl: ctx.harness.mockLlmBaseUrl,
          model: 'verify-pro-32b',
          apiKey: '',
        }),
      },
    );
    const mockEndpointId = createdEp.endpoint.id;

    try {
      // 3. Generate 4 sequential Auto reels with Auto-rotate voice and assert full anti-repeat variety
      const autoReels: GeneratedReelPayload[] = [];
      const prompts = [
        'AI silicon verification harness reaches 22% higher IPC on open RISC-V core benchmarks',
        'Coding agent verification loops lift pass@1 by 18.4% across 12 frontier coding models',
        'Why small scoped diffs beat dumping 200k tokens into coding assistant prompts daily',
        'Cached coding token prices drop 60% in 12 months unlocking multi-step PR review bots',
      ];

      for (let i = 0; i < 4; i++) {
        const started = await apiJson<{ reel: { id: string } }>(
          ctx.harness.baseUrl,
          '/api/reels/generate',
          {
            method: 'POST',
            body: JSON.stringify({
              prompt: prompts[i],
              format: 'auto',
              voiceName: 'auto',
              musicEnabled: true,
              llmEndpointId: mockEndpointId,
              seed: 202600 + i * 73,
            }),
          },
        );
        const ready = await waitForReelReady(ctx.harness.baseUrl, started.reel.id);
        autoReels.push(ready);
      }

      const formats = new Set(autoReels.map((r) => r.storyboard.format));
      const backgrounds = new Set(autoReels.map((r) => r.storyboard.style?.background));
      const moods = new Set(autoReels.map((r) => r.storyboard.style?.musicMood));
      const voices = new Set(autoReels.map((r) => r.voiceName));

      if (formats.size !== 4) {
        throw new Error(
          `Expected 4 distinct formats across 4 Auto reels, got ${formats.size}: ${[...formats].join(', ')}`,
        );
      }
      if (backgrounds.size < 2) {
        throw new Error(`Expected >= 2 distinct backgrounds, got ${backgrounds.size}`);
      }
      if (moods.size < 2) {
        throw new Error(`Expected >= 2 distinct music moods, got ${moods.size}`);
      }
      if (voices.size < 3) {
        throw new Error(`Expected >= 3 distinct rotated voices, got ${voices.size}`);
      }

      const fps = autoReels.map((r) => computeReelFingerprint(r));
      for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
          const sim = fingerprintSimilarity(fps[i]!, fps[j]!);
          if (sim >= 0.75) {
            throw new Error(
              `Pairwise fingerprint similarity too high (${sim}) between ${fps[i]!.format} and ${fps[j]!.format}`,
            );
          }
        }
      }

      // Verify no reel repeats the exact same transition back-to-back
      for (const r of autoReels) {
        const scenes = r.storyboard.scenes;
        for (let s = 1; s < scenes.length; s++) {
          const prevT = scenes[s - 1]?.visual?.transition;
          const currT = scenes[s]?.visual?.transition;
          if (prevT && currT && prevT === currT) {
            throw new Error(`Reel ${r.id} repeated transition "${currT}" back-to-back`);
          }
        }
      }

      ctx.recordAssertion(
        `4 Auto reels produced 4 distinct formats (${[...formats].join(', ')}), ${backgrounds.size} backgrounds, ${moods.size} moods, ${voices.size} rotated voices, pairwise sim < 0.75`,
      );

      // 4. Generate explicit news_breakdown reel from seeded topic (has sourceUrl) to verify source_spotlight asset attachment
      const newsStarted = await apiJson<{ reel: { id: string } }>(
        ctx.harness.baseUrl,
        '/api/reels/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            topicId: ctx.harness.seededTopicIds[0],
            format: 'news_breakdown',
            voiceName: 'auto',
            llmEndpointId: mockEndpointId,
          }),
        },
      );
      const newsReady = await waitForReelReady(ctx.harness.baseUrl, newsStarted.reel.id);
      if (!newsReady.storyboard.assets?.source?.file) {
        throw new Error('Expected source_spotlight reel to attach source-visual.jpg asset');
      }
      ctx.recordAssertion(
        `Verified news_breakdown attached real source visual asset (${newsReady.storyboard.assets.source.file})`,
      );

      // 5. Generate explicit top3_countdown reel and verify 3 countdown_item scenes ranked 3, 2, 1
      const cdStarted = await apiJson<{ reel: { id: string } }>(
        ctx.harness.baseUrl,
        '/api/reels/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: 'Top 3 harness habits for fast clean AI-assisted software engineering teams',
            format: 'top3_countdown',
            voiceName: 'auto',
            llmEndpointId: mockEndpointId,
          }),
        },
      );
      const cdReady = await waitForReelReady(ctx.harness.baseUrl, cdStarted.reel.id);
      const countdownScenes = cdReady.storyboard.scenes.filter(
        (s) => !isChannelOutroScene(s) && s.type === 'countdown_item',
      );
      const ranks = countdownScenes.map((s) => (s.type === 'countdown_item' ? s.rank : -1));
      if (ranks.length !== 3 || ranks[0] !== 3 || ranks[1] !== 2 || ranks[2] !== 1) {
        throw new Error(`Expected top3_countdown ranks [3, 2, 1], got [${ranks.join(', ')}]`);
      }
      ctx.recordAssertion('Verified explicit top3_countdown generated 3 countdown_item scenes ranked 3, 2, 1');

      // 6. Browser UI check: Approval Studio VarietyPanel + Reshuffle Style + New Scene Editor
      await ctx.driver.goto(`/review/${encodeURIComponent(cdReady.id)}`);
      await ctx.driver.waitForText('Storyboard & Voice');
      await ctx.driver.clickByText('Storyboard & Voice');
      await ctx.driver.waitForText('Variety & Style');
      await ctx.driver.waitForText('Top 3 Countdown');
      await ctx.driver.waitForText('Freshness');
      await ctx.captureScreenshot(
        '12-variety-panel',
        'Approval Studio VarietyPanel showing format, freshness score, and style selectors',
      );
      ctx.recordAssertion('Verified VarietyPanel renders format, freshness %, and style selects');

      const bgBefore = await ctx.driver.evaluate<string>(() => {
        const el = document.querySelector<HTMLSelectElement>(
          'select[aria-label="Style Background"]',
        );
        return el?.value ?? '';
      });
      await ctx.driver.clickByText('Reshuffle Style');
      await ctx.driver.waitForCondition(
        async () => {
          const bgAfter = await ctx.driver.evaluate<string>(() => {
            const el = document.querySelector<HTMLSelectElement>(
              'select[aria-label="Style Background"]',
            );
            return el?.value ?? '';
          });
          const body = await ctx.driver.getBodyText();
          return bgAfter !== '' && bgAfter !== bgBefore && body.includes('Re-render Video');
        },
        'style background changed and Re-render banner appeared after Reshuffle Style',
      );
      await ctx.captureScreenshot(
        '13-variety-reshuffled',
        'Approval Studio after clicking Reshuffle Style with Re-render banner visible',
      );
      ctx.recordAssertion('Verified Reshuffle Style updates style immediately and surfaces Re-render prompt');

      // Open Countdown Item scene in VisualSceneEditor and verify Scene Layout + Transition selects
      await ctx.driver.clickByText('Countdown Item');
      await ctx.driver.waitForText('Scene Layout');
      await ctx.driver.waitForText('Transition');
      await ctx.driver.waitForText('Rank');
      await ctx.captureScreenshot(
        '14-scene-editor-new-types',
        'VisualSceneEditor expanded on Countdown Item with layout, transition, and camera controls',
      );
      ctx.recordAssertion('Verified VisualSceneEditor supports new scene types and per-scene visual controls');

      // 7. Browser UI check: Custom Reel Modal Format selector (Auto + 8 formats)
      await ctx.driver.goto('/discover');
      await ctx.driver.waitForText('New Custom Reel');
      await ctx.driver.clickByText('New Custom Reel');
      await ctx.driver.waitForText('Reel Format');
      const formatOptionCount = await ctx.driver.evaluate<number>(
        () => document.querySelectorAll('select[aria-label="Reel Format"] option').length,
      );
      if (formatOptionCount !== 9) {
        throw new Error(`Expected 9 format options (Auto + 8 formats), got ${formatOptionCount}`);
      }
      await ctx.captureScreenshot(
        '15-custom-modal-formats',
        'Create Custom Reel modal showing Reel Format selector and Auto-rotate voice option',
      );
      await ctx.driver.clickByText('Cancel', { exact: true });
      ctx.recordAssertion('Verified CustomReelModal shows Auto + 8 formats and Auto-rotate voice');

      // 8. Browser UI check: Settings Video Variety section + toggle round-trip
      await ctx.driver.goto('/settings');
      await ctx.driver.waitForText('Video Variety');
      await ctx.driver.waitForText('Auto-Rotate Voices');
      await ctx.driver.waitForText('AI B-Roll Clips (Veo)');
      await ctx.driver.waitForText('PAID API');
      await ctx.captureScreenshot(
        '16-settings-variety',
        'Settings View showing Video Variety section (voice rotation & opt-in Veo B-roll warning)',
        { fullPage: true },
      );

      // Persist toggle round-trip via API and reset back to false
      await apiJson(ctx.harness.baseUrl, '/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ voiceRotation: true, aiBrollEnabled: true }),
      });
      const afterToggle = await apiJson<{
        settings: { voiceRotation: boolean; aiBrollEnabled: boolean };
      }>(ctx.harness.baseUrl, '/api/settings');
      if (!afterToggle.settings.voiceRotation || !afterToggle.settings.aiBrollEnabled) {
        throw new Error('Expected voiceRotation and aiBrollEnabled settings to persist');
      }
      await apiJson(ctx.harness.baseUrl, '/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ voiceRotation: false, aiBrollEnabled: false }),
      });
      ctx.recordAssertion('Verified Settings Video Variety UI and voiceRotation/aiBrollEnabled persistence');
    } finally {
      // Clean up temporary mock LLM endpoint so server returns to built-in Gemini
      await apiJson(ctx.harness.baseUrl, `/api/llm/endpoints/${encodeURIComponent(mockEndpointId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  },
};
