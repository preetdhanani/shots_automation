import { GoogleGenAI } from '@google/genai';
import { XMLParser } from 'fast-xml-parser';
import type { AppEnv } from '../config/env.js';
import type { CreateTopicInput, Store } from '../db/store.js';
import type { ContentPillar } from '../schemas/storyboard.js';
import {
  classifyPillar,
  computeTopicFingerprint,
  hashCanonicalUrl,
  isNearDuplicateTitle,
  scoreTopicCandidate,
} from './dedupe.js';
import {
  AI_DEV_KEYWORDS,
  GITHUB_RELEASE_SOURCES,
  RSS_SOURCES,
  type GithubRepoSource,
  type RssFeedSource,
} from './sources.js';
import { safeFetchText, type SafeFetchOptions } from './ssrf.js';

export interface RawDiscoveredItem {
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  defaultPillar: ContentPillar;
  baseWeight: number;
  engagementPoints?: number;
  rawPayload: unknown;
}

export interface SourceFetchSummary {
  source: string;
  status: 'ok' | 'error' | 'skipped';
  fetchedCount: number;
  error?: string;
}

export interface FetchTopicsResult {
  inserted: number;
  skippedDuplicates: number;
  totalParsed: number;
  sources: SourceFetchSummary[];
}

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function extractAtomLink(linkField: unknown): string {
  for (const item of asArray(linkField)) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const href = obj['@_href'] ?? obj.href;
      const rel = obj['@_rel'] ?? obj.rel;
      if (typeof href === 'string' && (!rel || rel === 'alternate')) {
        return href;
      }
    }
  }
  return '';
}

function textValue(field: unknown): string {
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (field && typeof field === 'object') {
    const rec = field as Record<string, unknown>;
    if (typeof rec['#text'] === 'string') return rec['#text'];
  }
  return '';
}

export function parseFeedXml(xmlText: string, source: RssFeedSource): RawDiscoveredItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
  });
  const parsed = parser.parse(xmlText) as Record<string, unknown>;

  const rssChannel = (parsed.rss as Record<string, unknown> | undefined)?.channel as
    | Record<string, unknown>
    | undefined;
  const atomFeed = parsed.feed as Record<string, unknown> | undefined;

  const out: RawDiscoveredItem[] = [];

  if (rssChannel) {
    for (const item of asArray(rssChannel.item as Record<string, unknown>[]).slice(0, 10)) {
      const title = stripHtmlTags(textValue(item.title));
      const link = textValue(item.link).trim();
      if (!title || !link) continue;
      const rawDesc = textValue(item.description) || textValue(item['content:encoded']);
      const summary = stripHtmlTags(rawDesc).slice(0, 420) || title;
      const pub = textValue(item.pubDate) || textValue(item['dc:date']) || new Date().toISOString();
      out.push({
        title,
        summary,
        sourceName: source.name,
        sourceUrl: link,
        publishedAt: Number.isNaN(Date.parse(pub)) ? new Date().toISOString() : new Date(pub).toISOString(),
        defaultPillar: source.defaultPillar,
        baseWeight: source.weight,
        rawPayload: { feedId: source.id, title, link },
      });
    }
    return out;
  }

  if (atomFeed) {
    for (const entry of asArray(atomFeed.entry as Record<string, unknown>[]).slice(0, 10)) {
      const title = stripHtmlTags(textValue(entry.title));
      const link = extractAtomLink(entry.link);
      if (!title || !link) continue;
      const rawSummary = textValue(entry.summary) || textValue(entry.content);
      const summary = stripHtmlTags(rawSummary).slice(0, 420) || title;
      const pub =
        textValue(entry.published) || textValue(entry.updated) || new Date().toISOString();
      out.push({
        title,
        summary,
        sourceName: source.name,
        sourceUrl: link,
        publishedAt: Number.isNaN(Date.parse(pub)) ? new Date().toISOString() : new Date(pub).toISOString(),
        defaultPillar: source.defaultPillar,
        baseWeight: source.weight,
        rawPayload: { feedId: source.id, title, link },
      });
    }
  }

  return out;
}

const AI_DEV_KEYWORD_PATTERNS = AI_DEV_KEYWORDS.map(
  (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
);

export function parseHackerNewsHits(jsonText: string): RawDiscoveredItem[] {
  const data = JSON.parse(jsonText) as {
    hits?: Array<{
      objectID: string;
      title?: string;
      url?: string;
      points?: number;
      created_at?: string;
      story_text?: string;
    }>;
  };
  const out: RawDiscoveredItem[] = [];
  for (const hit of data.hits ?? []) {
    const title = hit.title?.trim() ?? '';
    if (!title) continue;
    const url = hit.url?.trim() || `https://news.ycombinator.com/item?id=${hit.objectID}`;
    const haystack = `${title} ${hit.story_text ?? ''}`;
    const matchesAi = AI_DEV_KEYWORD_PATTERNS.some((re) => re.test(haystack));
    if (!matchesAi) continue;
    out.push({
      title,
      summary:
        stripHtmlTags(hit.story_text ?? '').slice(0, 420) ||
        `Trending on Hacker News (${hit.points ?? 0} points): ${title}`,
      sourceName: 'Hacker News',
      sourceUrl: url,
      publishedAt: hit.created_at ?? new Date().toISOString(),
      defaultPillar: 'ai_news',
      baseWeight: 15,
      engagementPoints: hit.points ?? 0,
      rawPayload: { objectID: hit.objectID, points: hit.points },
    });
  }
  return out;
}

export function parseGithubReleases(jsonText: string, src: GithubRepoSource): RawDiscoveredItem[] {
  const releases = JSON.parse(jsonText) as Array<{
    id?: number;
    tag_name?: string;
    name?: string;
    html_url?: string;
    body?: string;
    published_at?: string;
    draft?: boolean;
    prerelease?: boolean;
  }>;

  const out: RawDiscoveredItem[] = [];
  for (const rel of releases) {
    if (rel.draft || !rel.html_url || !rel.tag_name) continue;
    const label = rel.name?.trim() || rel.tag_name;
    const title = `${src.name.replace(/ Releases$/, '')} ${label}`;
    const summary =
      stripHtmlTags((rel.body ?? '').replace(/[#*`]/g, ' ')).slice(0, 420) ||
      `New release ${rel.tag_name} for ${src.owner}/${src.repo}`;
    out.push({
      title,
      summary,
      sourceName: src.name,
      sourceUrl: rel.html_url,
      publishedAt: rel.published_at ?? new Date().toISOString(),
      defaultPillar: src.defaultPillar,
      baseWeight: src.weight,
      rawPayload: { repo: `${src.owner}/${src.repo}`, tag: rel.tag_name },
    });
  }
  return out;
}

async function fetchGeminiGroundedTopics(env: AppEnv): Promise<RawDiscoveredItem[]> {
  if (!env.ENABLE_GEMINI_SEARCH_GROUNDING || !env.GEMINI_API_KEY) {
    return [];
  }
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: env.GEMINI_TEXT_MODEL,
    contents:
      'Find 3 notable AI coding news stories, new LLM benchmark releases, or top developer vibe-coding tips from the past 7 days. Return a JSON array of objects with fields: title, summary, url, pillar (one of ai_news, benchmarks, harnesses, coding_practices, vibe_coding).',
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
    },
  });

  const text = response.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const items = JSON.parse(match[0]) as Array<{
    title?: string;
    summary?: string;
    url?: string;
    pillar?: ContentPillar;
  }>;

  return items
    .filter((i) => i.title && i.summary && i.url && i.url.startsWith('http'))
    .map((i) => ({
      title: i.title!.trim(),
      summary: i.summary!.trim().slice(0, 420),
      sourceName: 'Gemini Search Grounding',
      sourceUrl: i.url!.trim(),
      publishedAt: new Date().toISOString(),
      defaultPillar: i.pillar ?? 'ai_news',
      baseWeight: 20,
      rawPayload: i,
    }));
}

export async function fetchAndStoreTopics(
  store: Store,
  env: AppEnv,
  fetchOpts: SafeFetchOptions = {},
): Promise<FetchTopicsResult> {
  const summaries: SourceFetchSummary[] = [];
  const rawItems: RawDiscoveredItem[] = [];

  const rssTasks = RSS_SOURCES.map(async (src) => {
    try {
      const res = await safeFetchText(src.url, fetchOpts);
      const parsed = parseFeedXml(res.text, src);
      rawItems.push(...parsed);
      summaries.push({ source: src.name, status: 'ok', fetchedCount: parsed.length });
    } catch (err) {
      summaries.push({
        source: src.name,
        status: 'error',
        fetchedCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const hnTask = (async () => {
    try {
      const res = await safeFetchText(
        'https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E40&hitsPerPage=35',
        fetchOpts,
      );
      const parsed = parseHackerNewsHits(res.text);
      rawItems.push(...parsed);
      summaries.push({ source: 'Hacker News', status: 'ok', fetchedCount: parsed.length });
    } catch (err) {
      summaries.push({
        source: 'Hacker News',
        status: 'error',
        fetchedCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  const ghTasks = GITHUB_RELEASE_SOURCES.map(async (src) => {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        ...fetchOpts.headers,
      };
      if (env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
      }
      const res = await safeFetchText(
        `https://api.github.com/repos/${src.owner}/${src.repo}/releases?per_page=3`,
        { ...fetchOpts, headers },
      );
      const parsed = parseGithubReleases(res.text, src);
      rawItems.push(...parsed);
      summaries.push({ source: src.name, status: 'ok', fetchedCount: parsed.length });
    } catch (err) {
      summaries.push({
        source: src.name,
        status: 'error',
        fetchedCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const groundingTask = (async () => {
    if (!env.ENABLE_GEMINI_SEARCH_GROUNDING || !env.GEMINI_API_KEY) {
      summaries.push({ source: 'Gemini Search Grounding', status: 'skipped', fetchedCount: 0 });
      return;
    }
    try {
      const parsed = await fetchGeminiGroundedTopics(env);
      rawItems.push(...parsed);
      summaries.push({
        source: 'Gemini Search Grounding',
        status: 'ok',
        fetchedCount: parsed.length,
      });
    } catch (err) {
      summaries.push({
        source: 'Gemini Search Grounding',
        status: 'error',
        fetchedCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  await Promise.all([...rssTasks, hnTask, ...ghTasks, groundingTask]);

  const weekAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const recentPillarCounts = store.countReelsByPillarSince(weekAgoIso);
  const existingTopics = store.listTopics({ limit: 300 });
  const existingFingerprints = existingTopics.map((t) => t.topicFingerprint);

  const candidates: CreateTopicInput[] = [];
  let skippedDuplicates = 0;

  for (const item of rawItems) {
    let urlHash: string;
    try {
      urlHash = hashCanonicalUrl(item.sourceUrl);
    } catch {
      continue;
    }
    if (store.findTopicByUrlHash(urlHash)) {
      skippedDuplicates++;
      continue;
    }
    if (isNearDuplicateTitle(item.title, existingFingerprints)) {
      skippedDuplicates++;
      continue;
    }

    const fingerprint = computeTopicFingerprint(item.title);
    existingFingerprints.push(fingerprint);

    const pillar = classifyPillar(item.title, item.summary, item.defaultPillar);
    const score = scoreTopicCandidate({
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt,
      pillar,
      baseWeight: item.baseWeight,
      engagementPoints: item.engagementPoints,
      recentPillarCounts,
    });

    candidates.push({
      pillar,
      title: item.title,
      summary: item.summary,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      canonicalUrlHash: urlHash,
      topicFingerprint: fingerprint,
      publishedAt: item.publishedAt,
      score,
      rawPayloadJson: JSON.stringify(item.rawPayload),
      status: 'NEW',
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const { inserted, skipped } = store.upsertTopics(candidates);

  return {
    inserted,
    skippedDuplicates: skippedDuplicates + skipped,
    totalParsed: rawItems.length,
    sources: summaries,
  };
}
