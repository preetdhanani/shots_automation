import { describe, expect, it } from 'vitest';
import {
  assertSafePublicUrl,
  canonicalizeUrl,
  computeTopicFingerprint,
  hashCanonicalUrl,
  isNearDuplicateTitle,
  isPrivateOrReservedIp,
  parseFeedXml,
  parseGithubReleases,
  parseHackerNewsHits,
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
});
