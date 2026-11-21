import {
  createTikTokStyleCaptions,
  type Caption,
  type TikTokPage,
} from '@remotion/captions';
import type { CaptionToken } from '@post/core';

export type { TikTokPage };

const TERMINAL_PUNCT_RE = /[.?!]["')\]}]*$/;
const ABBREVIATION_RE = /\b(?:vs|e\.g|i\.e|etc|dr|mr|mrs|ms)\.$|\.\.\.$/i;

function endsWithSentencePunctuation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !TERMINAL_PUNCT_RE.test(trimmed)) return false;
  const withoutClosing = trimmed.replace(/["')\]}]+$/, '');
  return !ABBREVIATION_RE.test(withoutClosing);
}

function crossesSceneBoundary(
  prev: CaptionToken,
  cur: CaptionToken,
  boundariesMs: readonly number[],
): boolean {
  if (boundariesMs.length === 0) return false;
  const prevMid = (prev.startMs + prev.endMs) / 2;
  const curMid = (cur.startMs + cur.endMs) / 2;
  for (const b of boundariesMs) {
    if (prevMid < b && curMid >= b) {
      return true;
    }
  }
  return false;
}

function splitUtteranceChunks(
  captions: readonly CaptionToken[],
  sceneBoundariesMs: readonly number[],
): CaptionToken[][] {
  const chunks: CaptionToken[][] = [];
  let current: CaptionToken[] = [];

  for (let i = 0; i < captions.length; i++) {
    const token = captions[i]!;
    if (current.length > 0) {
      const prev = current[current.length - 1]!;
      if (
        endsWithSentencePunctuation(prev.text) ||
        crossesSceneBoundary(prev, token, sceneBoundariesMs)
      ) {
        chunks.push(current);
        current = [];
      }
    }
    current.push(token);
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function pageBoundaryIndex(
  startMs: number,
  boundariesMs: readonly number[],
): number {
  let count = 0;
  for (const b of boundariesMs) {
    if (b <= startMs) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function buildCaptionPages(
  captions: readonly CaptionToken[],
  opts: {
    combineTokensWithinMilliseconds?: number;
    maxWordsPerPage?: number;
    sceneBoundariesMs?: readonly number[];
  } = {},
): TikTokPage[] {
  if (captions.length === 0) return [];
  const maxWords = Math.max(1, opts.maxWordsPerPage ?? 4);
  const combineMs = opts.combineTokensWithinMilliseconds ?? 700;
  const boundariesMs = [...(opts.sceneBoundariesMs ?? [])].sort((a, b) => a - b);

  const chunks = splitUtteranceChunks(captions, boundariesMs);
  const result: TikTokPage[] = [];

  for (const chunk of chunks) {
    const normalized: Caption[] = chunk.map((c) => ({
      text: c.text,
      startMs: c.startMs,
      endMs: c.endMs,
      timestampMs: c.timestampMs ?? c.startMs,
      confidence: c.confidence ?? null,
    }));

    const rawPages = createTikTokStyleCaptions({
      captions: normalized,
      combineTokensWithinMilliseconds: combineMs,
    }).pages;

    for (const page of rawPages) {
      if (page.tokens.length <= maxWords) {
        result.push(page);
        continue;
      }

      // Split oversized pages into balanced 2-4 word sub-pages
      const total = page.tokens.length;
      const chunkCount = Math.ceil(total / maxWords);
      const baseSize = Math.floor(total / chunkCount);
      const remainder = total % chunkCount;
      const originalPageEndMs = page.startMs + page.durationMs;

      let cursor = 0;
      const subPages: TikTokPage[] = [];
      for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
        const size = baseSize + (cIdx < remainder ? 1 : 0);
        const slice = page.tokens.slice(cursor, cursor + size);
        cursor += size;
        if (slice.length === 0) continue;
        const startMs = slice[0]!.fromMs;
        const text = slice
          .map((t, tIdx) => (tIdx === 0 ? t.text.trimStart() : t.text))
          .join('');
        subPages.push({
          text,
          startMs,
          durationMs: Math.max(40, slice[slice.length - 1]!.toMs - startMs),
          tokens: slice,
        });
      }

      for (let sIdx = 0; sIdx < subPages.length; sIdx++) {
        const cur = subPages[sIdx]!;
        const next = subPages[sIdx + 1];
        if (next) {
          cur.durationMs = Math.max(40, next.startMs - cur.startMs);
        } else {
          cur.durationMs = Math.max(cur.durationMs, originalPageEndMs - cur.startMs);
        }
        result.push(cur);
      }
    }
  }

  // Normalize page durations so captions never cross scene boundaries or freeze during long pauses/tail
  for (let i = 0; i < result.length; i++) {
    const cur = result[i]!;
    const lastToken = cur.tokens[cur.tokens.length - 1]!;
    const lastToMs = lastToken.toMs;
    const next = result[i + 1];

    const curSceneBucket = pageBoundaryIndex(cur.startMs, boundariesMs);
    const nextBoundaryMs = boundariesMs[curSceneBucket];
    const nextSameScene =
      Boolean(next) && pageBoundaryIndex(next!.startMs, boundariesMs) === curSceneBucket;

    let endMs: number;
    if (next && nextSameScene && next.startMs - lastToMs <= 220) {
      endMs = Math.max(lastToMs, next.startMs);
    } else {
      const pauseCap = lastToMs + 180;
      endMs = Math.min(
        nextBoundaryMs ?? Infinity,
        next?.startMs ?? Infinity,
        pauseCap,
      );
      if (endMs < lastToMs) {
        endMs = Math.min(next?.startMs ?? lastToMs, lastToMs);
      }
    }
    cur.durationMs = Math.max(40, endMs - cur.startMs);
  }

  return result;
}

export function findActiveCaptionPage(
  pages: readonly TikTokPage[],
  timeInMs: number,
): TikTokPage | undefined {
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const next = pages[i + 1];
    if (timeInMs < page.startMs) continue;
    const pageEndMs = page.startMs + page.durationMs;
    const upperBoundMs = next ? Math.min(next.startMs, pageEndMs) : pageEndMs;
    if (timeInMs < upperBoundMs) {
      return page;
    }
  }
  return undefined;
}
