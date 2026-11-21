import type { CaptionToken, SceneTiming } from '@post/core';

export interface SceneWordToken {
  text: string;
  clean: string;
  startFrame: number;
  endFrame: number;
  startMs: number;
  endMs: number;
}

function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+$%]/g, '');
}

/**
 * Slices global `captions` into scene-relative word tokens measured from frame 0
 * of that <Sequence>.
 */
export function sliceSceneWordTokens(
  captions: readonly CaptionToken[],
  timing: Pick<SceneTiming, 'startMs' | 'endMs'> | undefined,
  fps: number,
): SceneWordToken[] {
  if (!timing || captions.length === 0) return [];
  const startMs = timing.startMs;
  const endMs = timing.endMs;
  const safeFps = fps > 0 ? fps : 30;
  const out: SceneWordToken[] = [];

  for (const tok of captions) {
    const midMs = (tok.startMs + tok.endMs) / 2;
    if (midMs < startMs - 40 || midMs > endMs + 40) continue;
    const relStartMs = Math.max(0, tok.startMs - startMs);
    const relEndMs = Math.max(relStartMs + 40, tok.endMs - startMs);
    out.push({
      text: tok.text.trim(),
      clean: normalizeToken(tok.text),
      startFrame: Math.max(0, Math.round((relStartMs / 1000) * safeFps)),
      endFrame: Math.max(1, Math.round((relEndMs / 1000) * safeFps)),
      startMs: relStartMs,
      endMs: relEndMs,
    });
  }

  return out;
}

/**
 * Finds the first scene-relative frame where any target token is spoken.
 */
export function findSpokenWordFrame(
  words: readonly SceneWordToken[],
  targetTokens: readonly string[],
  fallbackFrame: number,
): number {
  if (words.length === 0 || targetTokens.length === 0) return fallbackFrame;
  const normalizedTargets = targetTokens.map(normalizeToken).filter(Boolean);
  if (normalizedTargets.length === 0) return fallbackFrame;
  const targetSet = new Set(normalizedTargets);

  for (const w of words) {
    if (!w.clean) continue;
    if (targetSet.has(w.clean)) return w.startFrame;
    for (const target of normalizedTargets) {
      if (target.length >= 4 && w.clean.startsWith(target.slice(0, 4))) {
        return w.startFrame;
      }
    }
  }
  return fallbackFrame;
}

/**
 * Computes `beatCount` evenly paced frame thresholds inside `[startFrac, endFrac]`
 * anchored to real Whisper spoken word frames when available.
 */
export function computeBeatFrames(
  durationInFrames: number,
  beatCount: number,
  words: readonly SceneWordToken[],
  opts: { startFrac?: number; endFrac?: number } = {},
): number[] {
  const count = Math.max(1, Math.floor(beatCount));
  const dur = Math.max(1, durationInFrames);
  const startFrac = opts.startFrac ?? 0.08;
  const endFrac = opts.endFrac ?? 0.82;

  const beats: number[] = [];
  for (let i = 0; i < count; i++) {
    const frac =
      count === 1 ? startFrac : startFrac + (i / (count - 1)) * Math.max(0.05, endFrac - startFrac);
    if (words.length >= count) {
      const wordIdx = Math.min(
        words.length - 1,
        Math.max(0, Math.round((i / Math.max(1, count)) * words.length)),
      );
      const wordFrame = words[wordIdx]?.startFrame ?? Math.round(dur * frac);
      // Blend slightly with time fraction when first word starts at frame 0
      const resolved = i === 0 ? Math.min(wordFrame, Math.round(dur * startFrac)) : wordFrame;
      beats.push(Math.max(0, Math.min(dur - 1, resolved)));
    } else {
      beats.push(Math.max(0, Math.min(dur - 1, Math.round(dur * frac))));
    }
  }

  for (let i = 1; i < beats.length; i++) {
    if (beats[i]! <= beats[i - 1]!) {
      beats[i] = Math.min(dur - 1, beats[i - 1]! + 1);
    }
  }
  return beats;
}

export function getActiveBeatIndex(frame: number, beatFrames: readonly number[]): number {
  if (beatFrames.length === 0) return 0;
  let active = 0;
  for (let i = 0; i < beatFrames.length; i++) {
    if (frame >= beatFrames[i]!) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
