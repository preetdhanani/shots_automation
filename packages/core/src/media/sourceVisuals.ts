import fs from 'node:fs';
import path from 'node:path';
import { safeFetchBuffer, safeFetchText, type SafeFetchOptions } from '../discovery/ssrf.js';
import type { ReelAssetRef } from '../schemas/storyboard.js';
import { runSubprocess } from './subprocess.js';

export interface FetchSourceVisualOptions {
  url: string;
  outDir: string;
  filename?: string;
  signal?: AbortSignal;
  fetchImpl?: SafeFetchOptions['fetchImpl'];
  lookupImpl?: SafeFetchOptions['lookupImpl'];
}

function decodeHtmlAttr(val: string): string {
  return val
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

/**
 * Extracts the best preview image URL (og:image:secure_url, og:image, twitter:image)
 * from an HTML document and resolves relative paths against `baseUrl`.
 */
export function extractSocialImageUrl(html: string, baseUrl: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const candidates = new Map<string, string>();

  for (const tag of metaTags) {
    const keyMatch = tag.match(/\b(?:property|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const contentMatch = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const key = (keyMatch?.[1] ?? keyMatch?.[2] ?? keyMatch?.[3] ?? '').trim().toLowerCase();
    const content = decodeHtmlAttr(
      contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3] ?? '',
    );
    if (!key || !content) continue;
    if (
      key === 'og:image:secure_url' ||
      key === 'og:image' ||
      key === 'twitter:image' ||
      key === 'twitter:image:src'
    ) {
      if (!candidates.has(key)) {
        candidates.set(key, content);
      }
    }
  }

  const orderedKeys = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];
  for (const key of orderedKeys) {
    const raw = candidates.get(key);
    if (!raw) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        return resolved.toString();
      }
    } catch {
      // Ignore malformed candidate URL
    }
  }

  return null;
}

async function probeImageDimensions(
  filePath: string,
  signal?: AbortSignal,
): Promise<{ width: number; height: number } | null> {
  try {
    const res = await runSubprocess(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        filePath,
      ],
      { signal, timeoutMs: 10_000 },
    );
    const parsed = JSON.parse(res.stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
    };
    const stream = parsed.streams?.[0];
    if (stream?.width && stream?.height) {
      return { width: stream.width, height: stream.height };
    }
  } catch {
    // Ignore probe failure
  }
  return null;
}

/**
 * Fetches an article's Open Graph / Twitter preview image safely (SSRF-guarded),
 * normalizes it via FFmpeg to a 1080px-wide JPEG, and returns a `ReelAssetRef`.
 * Always returns `null` on any failure so a reel never fails due to a missing image.
 */
export async function fetchSourceVisual(
  opts: FetchSourceVisualOptions,
): Promise<ReelAssetRef | null> {
  if (!opts.url || !/^https?:\/\//i.test(opts.url.trim())) {
    return null;
  }

  const fileName = opts.filename ?? 'source-visual.jpg';
  const rawTmpPath = path.join(opts.outDir, `.source-raw-${Date.now()}`);
  const outPath = path.join(opts.outDir, fileName);

  try {
    fs.mkdirSync(opts.outDir, { recursive: true });

    const page = await safeFetchText(opts.url, {
      timeoutMs: 10_000,
      maxBytes: 1_500_000,
      maxRedirects: 3,
      signal: opts.signal,
      fetchImpl: opts.fetchImpl,
      lookupImpl: opts.lookupImpl,
    });

    const imageUrl = extractSocialImageUrl(page.text, page.url);
    if (!imageUrl) {
      return null;
    }

    const imageRes = await safeFetchBuffer(imageUrl, {
      timeoutMs: 12_000,
      maxBytes: 8 * 1024 * 1024,
      maxRedirects: 3,
      signal: opts.signal,
      headers: {
        Accept: 'image/jpeg, image/png, image/webp, image/gif, image/*;q=0.8',
      },
      fetchImpl: opts.fetchImpl,
      lookupImpl: opts.lookupImpl,
    });

    const contentType = imageRes.contentType.toLowerCase().split(';')[0]?.trim() ?? '';
    if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
      return null;
    }
    if (imageRes.buffer.length < 256) {
      return null;
    }

    fs.writeFileSync(rawTmpPath, imageRes.buffer);

    await runSubprocess(
      'ffmpeg',
      [
        '-y',
        '-i',
        rawTmpPath,
        '-frames:v',
        '1',
        '-vf',
        "scale='min(1080,iw)':-2",
        '-q:v',
        '3',
        outPath,
      ],
      { signal: opts.signal, timeoutMs: 20_000 },
    );

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 256) {
      return null;
    }

    const dims = await probeImageDimensions(outPath, opts.signal);
    return {
      kind: 'image',
      file: fileName,
      sourceUrl: imageUrl,
      ...(dims ? { width: dims.width, height: dims.height } : {}),
    };
  } catch {
    return null;
  } finally {
    if (fs.existsSync(rawTmpPath)) {
      fs.rmSync(rawTmpPath, { force: true });
    }
  }
}
