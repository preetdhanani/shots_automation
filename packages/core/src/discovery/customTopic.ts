import { createHash } from 'node:crypto';
import type { Store, TopicRecord } from '../db/store.js';
import type { ContentPillar } from '../schemas/storyboard.js';
import { classifyPillar, computeTopicFingerprint, hashCanonicalUrl } from './dedupe.js';
import { safeFetchText, type SafeFetchOptions } from './ssrf.js';

export interface CustomTopicInput {
  prompt: string;
  url?: string;
  pillar?: ContentPillar;
}

function extractTitleAndExcerpt(htmlOrText: string, fallbackUrl: string): {
  title: string;
  excerpt: string;
} {
  const titleMatch = htmlOrText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1]!.replace(/\s+/g, ' ').trim() : '';
  const bodyClean = htmlOrText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: rawTitle || new URL(fallbackUrl).hostname,
    excerpt: bodyClean.slice(0, 1200),
  };
}

export async function createCustomTopic(
  store: Store,
  input: CustomTopicInput,
  fetchOpts: SafeFetchOptions = {},
): Promise<TopicRecord> {
  const promptTrimmed = input.prompt.trim();
  const urlTrimmed = input.url?.trim() || '';

  let sourceUrl = `https://custom.local/topic/${createHash('sha256').update(promptTrimmed + Date.now()).digest('hex').slice(0, 12)}`;
  let sourceName = 'Custom Idea';
  let title = promptTrimmed.slice(0, 110);
  let summary = promptTrimmed;

  if (urlTrimmed) {
    const res = await safeFetchText(urlTrimmed, fetchOpts);
    sourceUrl = res.url;
    sourceName = new URL(res.url).hostname.replace(/^www\./, '');
    const extracted = extractTitleAndExcerpt(res.text, res.url);
    title = promptTrimmed ? promptTrimmed.slice(0, 110) : extracted.title.slice(0, 110);
    summary = promptTrimmed
      ? `${promptTrimmed}\n\nReference (${extracted.title}): ${extracted.excerpt}`
      : `${extracted.title}: ${extracted.excerpt}`;
  }

  const pillar = input.pillar ?? classifyPillar(title, summary, 'ai_news');
  const urlHash = urlTrimmed
    ? `${hashCanonicalUrl(sourceUrl)}-${Date.now()}`
    : createHash('sha256').update(`${promptTrimmed}-${Date.now()}-${Math.random()}`).digest('hex');

  return store.createTopic({
    pillar,
    title: title || 'Custom AI Developer Reel',
    summary: summary.slice(0, 2000),
    sourceName,
    sourceUrl,
    canonicalUrlHash: urlHash,
    topicFingerprint: computeTopicFingerprint(title || summary),
    publishedAt: new Date().toISOString(),
    score: 100,
    rawPayloadJson: JSON.stringify({ custom: true, url: urlTrimmed || null, prompt: promptTrimmed }),
    status: 'NEW',
  });
}
