import fs from 'node:fs';
import { Readable } from 'node:stream';
import type { Context } from 'hono';

export interface ByteRange {
  start: number;
  end: number;
}

export function parseByteRange(rangeHeader: string, fileSize: number): ByteRange | 'invalid' | null {
  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) {
    return null;
  }
  const spec = trimmed.slice('bytes='.length).split(',')[0]?.trim() ?? '';
  const dashIdx = spec.indexOf('-');
  if (dashIdx === -1) {
    return 'invalid';
  }

  const startStr = spec.slice(0, dashIdx).trim();
  const endStr = spec.slice(dashIdx + 1).trim();

  if (fileSize <= 0) {
    return 'invalid';
  }

  if (startStr === '' && endStr !== '') {
    const suffixLen = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return 'invalid';
    const start = Math.max(0, fileSize - suffixLen);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
    return 'invalid';
  }

  if (endStr === '') {
    return { start, end: fileSize - 1 };
  }

  const end = Number.parseInt(endStr, 10);
  if (!Number.isFinite(end) || end < start) {
    return 'invalid';
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

export function streamFileWithRange(
  c: Context,
  filePath: string,
  contentType: string,
  opts: { downloadFilename?: string } = {},
): Response {
  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404);
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'no-store');
  if (opts.downloadFilename) {
    const safeName = opts.downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
  }

  const rangeHeader = c.req.header('range');
  if (!rangeHeader) {
    headers.set('Content-Length', String(fileSize));
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(webStream, { status: 200, headers });
  }

  const parsed = parseByteRange(rangeHeader, fileSize);
  if (parsed === null) {
    headers.set('Content-Length', String(fileSize));
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(webStream, { status: 200, headers });
  }

  if (parsed === 'invalid') {
    headers.set('Content-Range', `bytes */${fileSize}`);
    return new Response(null, { status: 416, headers });
  }

  const chunkLength = parsed.end - parsed.start + 1;
  headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${fileSize}`);
  headers.set('Content-Length', String(chunkLength));
  const nodeStream = fs.createReadStream(filePath, { start: parsed.start, end: parsed.end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(webStream, { status: 206, headers });
}
