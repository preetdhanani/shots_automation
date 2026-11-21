import { createHash } from 'node:crypto';
import type { ReelStoryboard } from './storyboard.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function computeNarrationHash(storyboard: ReelStoryboard): string {
  const payload = storyboard.scenes.map((s) => ({
    id: s.id,
    narration: s.narration.trim().replace(/\s+/g, ' '),
  }));
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function computeStoryboardVisualHash(
  storyboard: ReelStoryboard,
  musicEnabled: boolean,
  brandHandle: string,
): string {
  // Pass optional fields raw (never defaulted) so legacy reels without variety
  // metadata keep identical hashes and do not become falsely stale.
  const payload = {
    title: storyboard.title,
    pillar: storyboard.pillar,
    format: storyboard.format,
    style: storyboard.style,
    assets: storyboard.assets,
    scenes: storyboard.scenes,
    musicEnabled,
    brandHandle: brandHandle.trim(),
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
