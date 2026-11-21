import { describe, expect, it } from 'vitest';
import {
  appendChannelOutroScene,
  assembleInstagramCaption,
  CHANNEL_OUTRO_NARRATION,
  computeNarrationHash,
  computeStoryboardVisualHash,
  convertFlatGeminiResponseToStoryboard,
  GEMINI_STORYBOARD_JSON_SCHEMA,
  isChannelOutroScene,
  looksLikeFakeCodeProse,
  SAMPLE_DEMO_STORYBOARD,
  sanitizeHashtags,
  validateStoryboardEditorial,
} from '@post/core';

describe('Storyboard Schemas & Editorial Quality Gate', () => {
  it('validates SAMPLE_DEMO_STORYBOARD cleanly', () => {
    const res = validateStoryboardEditorial(SAMPLE_DEMO_STORYBOARD);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.totalWords).toBeGreaterThanOrEqual(40);
    expect(res.totalWords).toBeLessThanOrEqual(175);
    expect(SAMPLE_DEMO_STORYBOARD.scenes).toHaveLength(6);
    expect(SAMPLE_DEMO_STORYBOARD.scenes[5]?.type).toBe('takeaway_cta');
    expect(SAMPLE_DEMO_STORYBOARD.scenes[5]?.narration).toBe(CHANNEL_OUTRO_NARRATION);
    expect(isChannelOutroScene(SAMPLE_DEMO_STORYBOARD.scenes[5]!)).toBe(true);
  });

  it('appends the standard channel outro scene idempotently', () => {
    const withoutOutro = {
      ...SAMPLE_DEMO_STORYBOARD,
      scenes: SAMPLE_DEMO_STORYBOARD.scenes.slice(0, 5),
    };
    const withOutro = appendChannelOutroScene(withoutOutro);
    expect(withOutro.scenes).toHaveLength(6);
    expect(withOutro.scenes[5]?.type).toBe('takeaway_cta');
    expect(withOutro.scenes[5]?.narration).toBe(CHANNEL_OUTRO_NARRATION);

    const idempotent = appendChannelOutroScene(withOutro);
    expect(idempotent.scenes).toHaveLength(6);
  });

  it('rejects ai_media_clip scene when AI B-roll is disabled, and allows 1 when enabled', () => {
    const mutated = {
      ...SAMPLE_DEMO_STORYBOARD,
      scenes: [
        ...SAMPLE_DEMO_STORYBOARD.scenes.slice(0, 4),
        {
          id: 's5',
          type: 'ai_media_clip' as const,
          narration: 'Here is a generated futuristic robot writing clean TypeScript code rapidly.',
          prompt: 'Futuristic terminal room',
          captionText: 'AI Clip',
        },
        ...SAMPLE_DEMO_STORYBOARD.scenes.slice(4),
      ],
    };
    const disabledRes = validateStoryboardEditorial(mutated);
    expect(disabledRes.ok).toBe(false);
    expect(disabledRes.errors.some((e) => e.includes('AI B-roll'))).toBe(true);

    const enabledRes = validateStoryboardEditorial(mutated, { allowAiMediaClip: true });
    expect(enabledRes.ok).toBe(true);
  });

  it('enforces 38-char code line limit and >= 6 words per scene', () => {
    const mutated = structuredClone(SAMPLE_DEMO_STORYBOARD);
    mutated.scenes[0]!.narration = 'Too short here.';
    if (mutated.scenes[2]?.type === 'code_compare') {
      mutated.scenes[2].afterCode = 'const veryLongVariableNameThatExceedsThirtyEightCharacters = true;';
    }
    const res = validateStoryboardEditorial(mutated);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('at least 6 words'))).toBe(true);
    expect(res.errors.some((e) => e.includes('max 38 chars'))).toBe(true);
  });

  it('enforces 2200-char assembled Instagram caption + hashtags limit', () => {
    const caption = 'a'.repeat(2190);
    const assembled = assembleInstagramCaption(caption, ['#ai', '#coding']);
    expect(assembled.length).toBeGreaterThan(2200);
  });

  it('keeps GEMINI_STORYBOARD_JSON_SCHEMA free of unsupported const keywords', () => {
    const serialized = JSON.stringify(GEMINI_STORYBOARD_JSON_SCHEMA);
    expect(serialized).not.toContain('"const"');
    const converted = convertFlatGeminiResponseToStoryboard(
      {
        title: 'Test Gemini Flat Conversion',
        pillar: 'ai_news',
        caption: 'Short summary caption for Instagram developers.',
        hashtags: ['#ai', '#dev', '#llm'],
        scenes: [
          {
            id: '1',
            type: 'hook_title',
            narration: 'Here is why this new model release changes local coding speed.',
            hookTitle: {
              badge: 'NEW MODEL',
              headline: 'Faster Coding Models',
              subheadline: 'Lower latency across real engineering tasks.',
            },
          },
          {
            id: '2',
            type: 'news_quote_card',
            narration: 'Benchmarks show major gains on tool calling and multi-file edits today.',
            newsQuoteCard: {
              sourceLabel: 'Official Blog',
              dateLabel: 'Nov 2026',
              headline: 'Tool Calling Boost',
              bullets: ['40% faster tool calls', 'Lower token cost per run'],
            },
          },
          {
            id: '3',
            type: 'takeaway_cta',
            narration: 'Try testing it in your agent harness and save this briefing.',
            takeawayCta: {
              badge: 'TAKEAWAY',
              headline: 'Benchmark On Real Repos',
              takeaway: 'Always evaluate models inside your actual coding harness.',
              ctaText: 'Follow for daily AI dev news',
            },
          },
        ],
      },
      [{ title: 'Source', url: 'https://example.com' }],
    );
    expect(converted.scenes[0]?.type).toBe('hook_title');
    expect(computeNarrationHash(converted)).toHaveLength(64);
    expect(computeStoryboardVisualHash(converted, true, '@dev')).toHaveLength(64);
  });

  it('rejects fake code prose, sanitizes hashtags (3-5), bounds before+after code lines, and guards @ai.dev.reels leaks', () => {
    expect(
      looksLikeFakeCodeProse(
        'This pattern avoids creating huge objects in memory.\nInstead we stream chunks to the worker.',
      ),
    ).toBe(true);
    expect(
      looksLikeFakeCodeProse(
        'const pool = new WorkerPool({ size: 4 });\nawait pool.run(task);',
      ),
    ).toBe(false);

    const oversizedCode = structuredClone(SAMPLE_DEMO_STORYBOARD);
    oversizedCode.scenes[1] = {
      id: 'scene-2',
      type: 'code_compare',
      narration: 'Compare before and after streaming handlers cleanly.',
      language: 'ts',
      filename: 'worker.ts',
      mode: 'before_after',
      beforeCode: Array.from({ length: 10 }, (_, i) => `const b${i} = ${i};`).join('\n'),
      afterCode: Array.from({ length: 9 }, (_, i) => `const a${i} = ${i};`).join('\n'),
    };
    const codeCheck = validateStoryboardEditorial(oversizedCode);
    expect(codeCheck.ok).toBe(false);
    expect(codeCheck.errors.some((e) => e.includes('18'))).toBe(true);

    const sanitized = sanitizeHashtags(
      ['#ai', 'coding', '#coding', '#next.js', 'a', '#TypeScript!', '#DevTools', '#Extra'],
      { maxTags: 5 },
    );
    expect(sanitized).toEqual(['#ai', '#coding', '#nextjs', '#typescript', '#devtools']);

    const leaky = structuredClone(SAMPLE_DEMO_STORYBOARD);
    leaky.caption = 'Save this tip and follow @ai.dev.reels today.';
    const leakCheck = validateStoryboardEditorial(leaky, {
      brandHandle: '',
      rejectDefaultBrandLeak: true,
    });
    expect(leakCheck.ok).toBe(false);
    expect(leakCheck.errors.some((e) => e.includes('@ai.dev.reels'))).toBe(true);

    const tooManyScenes = {
      ...SAMPLE_DEMO_STORYBOARD,
      scenes: [
        ...SAMPLE_DEMO_STORYBOARD.scenes,
        { ...SAMPLE_DEMO_STORYBOARD.scenes[1]!, id: 'extra-1' },
        { ...SAMPLE_DEMO_STORYBOARD.scenes[3]!, id: 'extra-2' },
        { ...SAMPLE_DEMO_STORYBOARD.scenes[1]!, id: 'extra-3' },
        { ...SAMPLE_DEMO_STORYBOARD.scenes[4]!, id: 'extra-4' },
      ],
    };
    const sceneLimitCheck = validateStoryboardEditorial(tooManyScenes);
    expect(sceneLimitCheck.ok).toBe(false);
    expect(sceneLimitCheck.errors.some((e) => e.includes('max 8 scenes'))).toBe(true);
  });
});
