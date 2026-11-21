import { describe, expect, it } from 'vitest';
import {
  buildCaptionPages,
  findActiveCaptionPage,
} from '../src/components/captionPaging.js';
import {
  computeBeatFrames,
  findSpokenWordFrame,
  getActiveBeatIndex,
  sliceSceneWordTokens,
} from '../src/style/sceneRuntimeHelpers.js';

describe('Video Choreography & Caption Paging', () => {
  it('splits oversized caption segments into balanced 2-4 word pages with zero overlap lag', () => {
    const captions = [
      { text: 'Local', startMs: 100, endMs: 250 },
      { text: ' coding', startMs: 250, endMs: 420 },
      { text: ' agents', startMs: 420, endMs: 600 },
      { text: ' run', startMs: 600, endMs: 750 },
      { text: ' fast', startMs: 750, endMs: 920 },
      { text: ' without', startMs: 920, endMs: 1100 },
      { text: ' cloud', startMs: 1100, endMs: 1280 },
      { text: ' latency', startMs: 1280, endMs: 1500 },
    ];

    const pages = buildCaptionPages(captions, {
      combineTokensWithinMilliseconds: 900,
      maxWordsPerPage: 4,
    });

    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const page of pages) {
      expect(page.tokens.length).toBeLessThanOrEqual(4);
      expect(page.tokens.length).toBeGreaterThanOrEqual(1);
    }

    // At exact boundary of page[1].startMs, page[1] must win immediately with zero overlap
    const boundaryMs = pages[1]!.startMs;
    const activeAtBoundary = findActiveCaptionPage(pages, boundaryMs);
    expect(activeAtBoundary).toBe(pages[1]);
    expect(findActiveCaptionPage(pages, boundaryMs - 1)).toBe(pages[0]);
    expect(findActiveCaptionPage(pages, 50)).toBeUndefined();
  });

  it('slices Whisper word tokens per scene and computes monotonically sorted beat frames', () => {
    const captions = [
      { text: 'First', startMs: 0, endMs: 200 },
      { text: 'Myth', startMs: 1100, endMs: 1400 },
      { text: 'actually', startMs: 2100, endMs: 2450 },
      { text: 'faster', startMs: 2500, endMs: 2800 },
      { text: 'now', startMs: 2900, endMs: 3200 },
    ];

    const words = sliceSceneWordTokens(captions, { startMs: 1000, endMs: 4000 }, 30);
    expect(words.map((w) => w.clean)).toEqual(['myth', 'actually', 'faster', 'now']);
    expect(words[0]!.startFrame).toBe(3);

    const pivot = findSpokenWordFrame(words, ['reality', 'actually'], 40);
    expect(pivot).toBe(words[1]!.startFrame);

    const fallback = findSpokenWordFrame(words, ['missing'], 42);
    expect(fallback).toBe(42);

    const beats = computeBeatFrames(90, 3, words);
    expect(beats).toHaveLength(3);
    expect(beats[0]!).toBeLessThanOrEqual(beats[1]!);
    expect(beats[1]!).toBeLessThanOrEqual(beats[2]!);

    expect(getActiveBeatIndex(0, beats)).toBe(0);
    expect(getActiveBeatIndex(beats[2]!, beats)).toBe(2);
  });

  it('splits captions on sentence punctuation & scene boundaries and expires before closing tail', () => {
    const captions = [
      { text: 'Claude', startMs: 220, endMs: 420 },
      { text: ' vs.', startMs: 420, endMs: 650 },
      { text: ' GPT?', startMs: 650, endMs: 920 },
      { text: ' AI', startMs: 930, endMs: 1120 },
      { text: ' news', startMs: 1120, endMs: 1380 },
      { text: ' ships', startMs: 1500, endMs: 1750 },
      { text: ' fast', startMs: 1750, endMs: 2000 },
    ];

    const pages = buildCaptionPages(captions, {
      combineTokensWithinMilliseconds: 900,
      maxWordsPerPage: 4,
      sceneBoundariesMs: [1450],
    });

    // "Claude vs. GPT?" stays together (vs. abbreviation guarded), splits cleanly at "?"
    expect(pages.map((p) => p.text)).toEqual([
      'Claude vs. GPT?',
      'AI news',
      'ships fast',
    ]);

    // Last page clears after lastToken.toMs + 180ms so captions disappear during the 0.90s closing tail
    expect(findActiveCaptionPage(pages, 1950)).toBe(pages[2]);
    expect(findActiveCaptionPage(pages, 2179)).toBe(pages[2]);
    expect(findActiveCaptionPage(pages, 2180)).toBeUndefined();
    expect(findActiveCaptionPage(pages, 2800)).toBeUndefined();
  });
});
