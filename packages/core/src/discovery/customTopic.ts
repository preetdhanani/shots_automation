import { createHash } from 'node:crypto';
import type { Store, TopicRecord } from '../db/store.js';
import type { ContentPillar } from '../schemas/storyboard.js';
import { classifyPillar, computeTopicFingerprint, hashCanonicalUrl } from './dedupe.js';
import { extractArticleFactsFromHtml } from './fetcher.js';
import { safeFetchText, type SafeFetchOptions } from './ssrf.js';

export interface CustomTopicInput {
  prompt: string;
  url?: string;
  pillar?: ContentPillar;
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
    const extracted = extractArticleFactsFromHtml(res.text, res.url, 2600);
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
    summary: summary.slice(0, 3200),
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
