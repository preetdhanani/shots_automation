import { describe, expect, it } from 'vitest';
import {
  assertSafePublicUrl,
  canonicalizeUrl,
  computeFeedCleanCutoffMs,
  computeTopicFingerprint,
  enrichTopicForScripting,
  extractArticleFactsFromHtml,
  hashCanonicalUrl,
  isNearDuplicateTitle,
  isPrivateOrReservedIp,
  isTopicOlderThanCutoff,
  parseFeedXml,
  parseGithubReleases,
  parseHackerNewsHits,
  SqliteStore,
  summarizeFeedCleanByInterval,
} from '@post/core';

describe('Discovery, Deduplication, and SSRF Safety', () => {
  it('canonicalizes URLs stripping tracking parameters and hashes identically', () => {
    const a = 'https://OpenAI.com/news/model/?utm_source=x&ref=hn#top';
    const b = 'https://openai.com/news/model';
    expect(canonicalizeUrl(a)).toBe(b);
    expect(hashCanonicalUrl(a)).toBe(hashCanonicalUrl(b));
  });

  it('detects near-duplicate titles via Jaccard similarity', () => {
    const fp = computeTopicFingerprint('Anthropic Launches Claude Code v2.1 Harness Update');
    expect(
      isNearDuplicateTitle('Anthropic launches Claude Code v2.1 harness update today', [fp]),
    ).toBe(true);
    expect(
      isNearDuplicateTitle('PostgreSQL 18 adds async I/O tuning for high-throughput writes', [fp]),
    ).toBe(false);
  });

  it('blocks private, loopback, link-local, and SSRF DNS targets', async () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.20.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);

    await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow(/Unsupported/);
    await expect(
      assertSafePublicUrl('https://internal.example.com', async () => [
        { address: '127.0.0.1', family: 4 },
      ]),
    ).rejects.toThrow(/private\/reserved/);

    const ok = await assertSafePublicUrl('https://example.com/blog', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(ok.hostname).toBe('example.com');
  });

  it('parses RSS, Hacker News, and GitHub Releases feeds cleanly', () => {
    const rssItems = parseFeedXml(
      `<rss><channel><item><title>Gemini 3.8 Flash Benchmarks</title><link>https://ai.google.dev/post</link><description><![CDATA[<p>78% SWE-bench score</p>]]></description></item></channel></rss>`,
      {
        id: 'google',
        name: 'Google AI Blog',
        url: 'https://blog.google/rss',
        defaultPillar: 'ai_news',
        weight: 20,
      },
    );
    expect(rssItems).toHaveLength(1);
    expect(rssItems[0]!.summary).toContain('78% SWE-bench');

    const hnItems = parseHackerNewsHits(
      JSON.stringify({
        hits: [
          { objectID: '1', title: 'Claude Code MCP server patterns', points: 120 },
          { objectID: '2', title: 'Best sourdough starter hydration ratios', points: 250 },
          { objectID: '3', title: 'How Paid Advertising Became an Extraction Tax', points: 319 },
          { objectID: '4', title: 'Explain something in simple terms', points: 202 },
        ],
      }),
    );
    expect(hnItems).toHaveLength(1);
    expect(hnItems[0]!.title).toContain('Claude Code');

    const ghItems = parseGithubReleases(
      JSON.stringify([
        {
          tag_name: 'v1.2.0',
          name: 'v1.2.0 Hooks & Subagents',
          html_url: 'https://github.com/anthropics/claude-code/releases/tag/v1.2.0',
          body: 'Added lifecycle hooks.',
          published_at: '2026-11-19T12:00:00Z',
        },
      ]),
      {
        id: 'claude-code',
        owner: 'anthropics',
        repo: 'claude-code',
        name: 'Claude Code Releases',
        defaultPillar: 'harnesses',
        weight: 20,
      },
    );
    expect(ghItems).toHaveLength(1);
    expect(ghItems[0]!.title).toContain('v1.2.0');
  });

  it('extracts article benchmarks while stripping nav/header chrome and enriches short summaries', async () => {
    const html = `
      <html>
        <head><title>Gemini 4 Neon Launch</title></head>
        <body>
          <header><nav>Explore Subscribe Sign out Search</nav></header>
          <article>
            <p>Google DeepMind shipped Gemini 4 Neon as its fastest mid-tier coding model.</p>
            <p>Neon scored 61 on the Intelligence Index, beating Carbon at 60 while costing $3 input and $15 output per million tokens.</p>
            <p>On Vals Index it reached 70.9% at less than half the cost per task.</p>
          </article>
        </body>
      </html>
    `;
    const extracted = extractArticleFactsFromHtml(html, 'https://latent.space/p/neon');
    expect(extracted.title).toBe('Gemini 4 Neon Launch');
    expect(extracted.excerpt).not.toContain('Subscribe Sign out');
    expect(extracted.excerpt).toContain('scored 61');
    expect(extracted.excerpt).toContain('$3 input');

    const enriched = await enrichTopicForScripting(
      {
        title: 'Gemini 4 Neon',
        summary: 'Short RSS blurb.',
        sourceName: 'Latent Space',
        sourceUrl: 'https://latent.space/p/neon',
        pillar: 'ai_news',
      },
      {
        lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchImpl: (async () =>
          new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })) as typeof fetch,
      },
    );
    expect(enriched.summary).toContain('Article Facts & Benchmarks:');
    expect(enriched.summary).toContain('70.9%');
  });

  it('evaluates feed retention intervals accurately across mixed ISO timestamp formats', () => {
    const nowMs = Date.parse('2026-11-21T12:00:00.000Z');
    const cutoff7d = computeFeedCleanCutoffMs('7d', nowMs);

    // Exact boundary stays; 1ms older is removed
    expect(
      isTopicOlderThanCutoff({ publishedAt: new Date(cutoff7d).toISOString() }, cutoff7d),
    ).toBe(false);
    expect(
      isTopicOlderThanCutoff({ publishedAt: new Date(cutoff7d - 1).toISOString() }, cutoff7d),
    ).toBe(true);

    // Mixed Z vs .000Z vs offset timestamps and fallback to createdAt
    expect(
      isTopicOlderThanCutoff({ publishedAt: '2026-11-18T12:00:00Z' }, cutoff7d),
    ).toBe(false);
    expect(
      isTopicOlderThanCutoff({ publishedAt: '2026-11-10T14:00:00+02:00' }, cutoff7d),
    ).toBe(true);
    expect(
      isTopicOlderThanCutoff(
        { publishedAt: 'not-a-date', createdAt: '2026-11-01T00:00:00.000Z' },
        cutoff7d,
      ),
    ).toBe(true);
    expect(
      isTopicOlderThanCutoff(
        { publishedAt: 'not-a-date', createdAt: 'also-invalid' },
        cutoff7d,
      ),
    ).toBe(false);

    const summary = summarizeFeedCleanByInterval(
      [
        { publishedAt: '2026-11-21T10:00:00Z' },
        { publishedAt: '2026-11-17T10:00:00.000Z' },
        { publishedAt: '2026-11-05T10:00:00Z' },
        { publishedAt: '2026-10-01T10:00:00Z' },
      ],
      nowMs,
    );
    expect(summary['3d']).toEqual({ keep: 1, remove: 3 });
    expect(summary['7d']).toEqual({ keep: 2, remove: 2 });
    expect(summary['30d']).toEqual({ keep: 3, remove: 1 });
  });

  it('cleans old NEW topics in SqliteStore without touching USED topics or losing URL dedupe, and supports restore', () => {
    const store = new SqliteStore(':memory:');
    try {
      const nowMs = Date.now();
      const dayMs = 86_400_000;
      const { topics } = store.upsertTopics([
        {
          pillar: 'ai_news',
          title: 'Recent 1d Topic',
          summary: 'Fresh item',
          sourceName: 'HN',
          sourceUrl: 'https://example.com/1d',
          canonicalUrlHash: hashCanonicalUrl('https://example.com/1d'),
          topicFingerprint: computeTopicFingerprint('Recent 1d Topic'),
          publishedAt: new Date(nowMs - 1 * dayMs).toISOString().replace('.000Z', 'Z'),
          score: 90,
          rawPayloadJson: '{}',
        },
        {
          pillar: 'benchmarks',
          title: 'Old 10d Topic',
          summary: 'Old item',
          sourceName: 'Blog',
          sourceUrl: 'https://example.com/10d',
          canonicalUrlHash: hashCanonicalUrl('https://example.com/10d'),
          topicFingerprint: computeTopicFingerprint('Old 10d Topic'),
          publishedAt: new Date(nowMs - 10 * dayMs).toISOString(),
          score: 85,
          rawPayloadJson: '{}',
        },
        {
          pillar: 'harnesses',
          title: 'Old 40d Used Topic',
          summary: 'Already used for reel',
          sourceName: 'GitHub',
          sourceUrl: 'https://example.com/40d-used',
          canonicalUrlHash: hashCanonicalUrl('https://example.com/40d-used'),
          topicFingerprint: computeTopicFingerprint('Old 40d Used Topic'),
          publishedAt: new Date(nowMs - 40 * dayMs).toISOString(),
          score: 80,
          rawPayloadJson: '{}',
          status: 'USED',
        },
      ]);

      expect(() => store.cleanTopicsOlderThan(Number.NaN)).toThrow(RangeError);

      const preview = store.previewTopicsClean(nowMs);
      expect(preview.totalNew).toBe(2);
      expect(preview.intervals['7d']).toEqual({ keep: 1, remove: 1 });
      expect(preview.intervals['30d']).toEqual({ keep: 2, remove: 0 });

      const cleanRes = store.cleanTopicsOlderThan(computeFeedCleanCutoffMs('7d', nowMs));
      expect(cleanRes.removedCount).toBe(1);
      expect(cleanRes.keptCount).toBe(1);
      expect(cleanRes.removedIds).toEqual([topics[1]!.id]);

      expect(store.listTopics({ status: 'NEW' }).map((t) => t.id)).toEqual([topics[0]!.id]);
      expect(store.getTopic(topics[1]!.id)?.status).toBe('DISMISSED');
      expect(store.getTopic(topics[2]!.id)?.status).toBe('USED');

      // URL dedupe still detects cleaned topic so Fetch Latest does not re-import it
      expect(store.findTopicByUrlHash(hashCanonicalUrl('https://example.com/10d'))?.id).toBe(
        topics[1]!.id,
      );

      // Restoring only affects DISMISSED topics, never USED ones
      const restoredCount = store.restoreTopics([topics[1]!.id, topics[2]!.id]);
      expect(restoredCount).toBe(1);
      expect(store.getTopic(topics[1]!.id)?.status).toBe('NEW');
      expect(store.getTopic(topics[2]!.id)?.status).toBe('USED');
    } finally {
      store.close();
    }
  });
});
