import dns from 'node:dns/promises';
import net from 'node:net';

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  lookupImpl?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return -1;
  }
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  const mappedPrefix = '::ffff:';
  if (normalized.startsWith(mappedPrefix)) {
    const v4Part = normalized.slice(mappedPrefix.length);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIp(v4Part);
    }
  }

  if (net.isIPv4(normalized)) {
    const num = ipv4ToInt(normalized);
    if (num < 0) return true;
    const inRange = (cidrBase: string, maskBits: number): boolean => {
      const base = ipv4ToInt(cidrBase);
      const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
      return (num & mask) === (base & mask);
    };
    return (
      inRange('0.0.0.0', 8) ||
      inRange('10.0.0.0', 8) ||
      inRange('100.64.0.0', 10) ||
      inRange('127.0.0.0', 8) ||
      inRange('169.254.0.0', 16) ||
      inRange('172.16.0.0', 12) ||
      inRange('192.0.0.0', 24) ||
      inRange('192.168.0.0', 16) ||
      inRange('198.18.0.0', 15) ||
      inRange('224.0.0.0', 4) ||
      inRange('240.0.0.0', 4)
    );
  }

  if (net.isIPv6(normalized)) {
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA fc00::/7
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true; // Link-local fe80::/10
    }
    if (normalized.startsWith('ff')) return true; // Multicast
    return false;
  }

  return true;
}

export async function assertSafePublicUrl(
  rawUrl: string,
  lookupImpl?: (hostname: string) => Promise<Array<{ address: string; family: number }>>,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme "${url.protocol}". Only http and https are allowed.`);
  }

  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error(`Blocked local hostname "${hostname}".`);
  }

  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error(`Blocked private or reserved IP address "${hostname}".`);
    }
    return url;
  }

  const lookup =
    lookupImpl ??
    (async (h: string) => {
      const records = await dns.lookup(h, { all: true });
      return records;
    });

  const addresses = await lookup(hostname);
  if (addresses.length === 0) {
    throw new Error(`DNS lookup returned no addresses for "${hostname}".`);
  }
  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr.address)) {
      throw new Error(
        `Blocked hostname "${hostname}" resolving to private/reserved IP "${addr.address}".`,
      );
    }
  }

  return url;
}

async function readResponseWithByteLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const len = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error(`Response content-length ${len} exceeds max limit of ${maxBytes} bytes.`);
    }
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Response exceeded max limit of ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function safeFetchText(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<{ url: string; status: number; contentType: string; text: string }> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const fetchFn = options.fetchImpl ?? fetch;

  let currentUrl = (await assertSafePublicUrl(rawUrl, options.lookupImpl)).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PostReelsStudio/0.1 (+https://localhost)',
          Accept: 'application/json, application/atom+xml, application/rss+xml, text/html, */*',
          ...options.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect (${response.status}) missing Location header.`);
      }
      if (hop === maxRedirects) {
        throw new Error(`Exceeded max redirects (${maxRedirects}) fetching ${rawUrl}.`);
      }
      const resolvedNext = new URL(location, currentUrl).toString();
      currentUrl = (await assertSafePublicUrl(resolvedNext, options.lookupImpl)).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${currentUrl}`);
    }

    const text = await readResponseWithByteLimit(response, maxBytes);
    return {
      url: currentUrl,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      text,
    };
  }

  throw new Error(`Failed to fetch ${rawUrl}`);
}
