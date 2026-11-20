import { createHash } from 'node:crypto';
import type { ContentPillar } from '../schemas/storyboard.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'your',
  'using',
  'how',
  'why',
  'new',
  'now',
  'out',
  'are',
  'you',
  'our',
  'can',
  'its',
]);

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [k, v] of kept) {
    url.searchParams.append(k, v);
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function hashCanonicalUrl(rawUrl: string): string {
  const canonical = canonicalizeUrl(rawUrl);
  return createHash('sha256').update(canonical).digest('hex');
}

export function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9.+_-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function computeTopicFingerprint(title: string): string {
  const tokens = Array.from(new Set(tokenizeTitle(title))).sort();
  return tokens.join(' ');
}

export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isNearDuplicateTitle(
  candidateTitle: string,
  existingFingerprints: string[],
  threshold = 0.72,
): boolean {
  const candidateTokens = tokenizeTitle(candidateTitle);
  if (candidateTokens.length === 0) return false;
  for (const fp of existingFingerprints) {
    const existingTokens = fp.split(/\s+/).filter(Boolean);
    if (jaccardSimilarity(candidateTokens, existingTokens) >= threshold) {
      return true;
    }
  }
  return false;
}

export function classifyPillar(title: string, summary: string, defaultPillar: ContentPillar): ContentPillar {
  const text = `${title} ${summary}`.toLowerCase();
  if (
    /\b(benchmark|swe-bench|livecodebench|gpqa|mmlu|evals|leaderboard|tok\/s|tokens per second|latency|cheaper|vs\.|comparison|elo)\b/.test(
      text,
    )
  ) {
    return 'benchmarks';
  }
  if (
    /\b(claude code|codex|cursor|windsurf|cline|aider|opencode|mcp|model context protocol|agent harness|coding agent|agents\.md|subagent|tool calling|sandbox)\b/.test(
      text,
    )
  ) {
    return 'harnesses';
  }
  if (/\b(vibe coding|vibe-coding|prompting tip|workflow|ship fast|solo dev|cursor rules)\b/.test(text)) {
    return 'vibe_coding';
  }
  if (
    /\b(best practice|code review|refactor|testing|architecture|pattern|prompt engineering|context engineering|guardrail|type safety)\b/.test(
      text,
    )
  ) {
    return 'coding_practices';
  }
  if (/\b(release|launch|announcing|introducing|model|gpt-|claude|gemini|llama|qwen|deepseek|mistral)\b/.test(text)) {
    return 'ai_news';
  }
  return defaultPillar;
}

export function scoreTopicCandidate(input: {
  title: string;
  summary: string;
  publishedAt: string;
  pillar: ContentPillar;
  baseWeight: number;
  engagementPoints?: number;
  recentPillarCounts: Record<ContentPillar, number>;
}): number {
  const text = `${input.title} ${input.summary}`.toLowerCase();
  const publishedMs = Date.parse(input.publishedAt);
  const ageHours = Number.isNaN(publishedMs) ? 72 : Math.max(0, (Date.now() - publishedMs) / 3_600_000);
  const freshness = 40 * Math.exp(-ageHours / 48);

  let visualBonus = 0;
  if (/\d+(\.\d+)?%|\d+x\b|\$\d+|tok\/s|v\d+\.\d+/.test(text)) {
    visualBonus += 14;
  }
  if (/\b(benchmark|swe-bench|vs|release|code|cli|mcp|agent|tip)\b/.test(text)) {
    visualBonus += 10;
  }

  const engagementBonus = input.engagementPoints
    ? Math.min(20, Math.log10(Math.max(1, input.engagementPoints)) * 8)
    : 0;

  const minCount = Math.min(...Object.values(input.recentPillarCounts));
  const currentCount = input.recentPillarCounts[input.pillar] ?? 0;
  const pillarBalanceBonus = currentCount === minCount ? 10 : Math.max(0, 6 - (currentCount - minCount) * 2);

  return Math.round((freshness + input.baseWeight + visualBonus + engagementBonus + pillarBalanceBonus) * 10) / 10;
}
