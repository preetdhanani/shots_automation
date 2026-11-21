import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSafeAssetFilename, type ReelAssetRef } from '@post/core';
import { bundle } from '@remotion/bundler';
import {
  ensureBrowser,
  makeCancelSignal,
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import type { ReelCompositionProps } from './types.js';

const REEL_COMPOSITION_ID = 'AiDevReel';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(pkgDir, '..', '..');

let activeBundlePromise: Promise<string> | null = null;
let browserEnsured = false;

function contentTypeForFile(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

interface LocalAssetServerHandle {
  assetUrls: Record<string, string>;
  close: () => Promise<void>;
}

/**
 * Starts an ephemeral 127.0.0.1 HTTP static server exposing ONLY filenames
 * registered in `assets` from `assetDir`, with byte-range (`206`) and CORS
 * support required by Remotion's `<Img>` and `<OffthreadVideo>`.
 */
async function startLocalAssetServer(
  assetDir: string | undefined,
  assets: Record<string, ReelAssetRef> | undefined,
): Promise<LocalAssetServerHandle> {
  if (!assetDir || !assets || Object.keys(assets).length === 0) {
    return { assetUrls: {}, close: async () => {} };
  }

  const allowedFiles = new Map<string, string>();
  const keyToFile = new Map<string, string>();
  for (const [key, ref] of Object.entries(assets)) {
    if (!isSafeAssetFilename(ref.file)) continue;
    const absPath = path.join(assetDir, ref.file);
    if (fs.existsSync(absPath)) {
      allowedFiles.set(ref.file, absPath);
      keyToFile.set(key, ref.file);
    }
  }

  if (allowedFiles.size === 0) {
    return { assetUrls: {}, close: async () => {} };
  }

  const server = http.createServer((req, res) => {
    const rawPath = (req.url ?? '/').split('?')[0] ?? '/';
    const fileName = decodeURIComponent(rawPath.replace(/^\/+/, ''));
    const absPath = allowedFiles.get(fileName);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');

    if (!absPath || !fs.existsSync(absPath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const stat = fs.statSync(absPath);
    const totalSize = stat.size;
    const mime = contentTypeForFile(fileName);
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        res.end();
        return;
      }
      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(totalSize - 1, Number.parseInt(match[2], 10)) : totalSize - 1;
      if (start >= totalSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        res.end();
        return;
      }
      const chunkLen = end - start + 1;
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Length': String(chunkLen),
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(absPath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': String(totalSize),
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(absPath).pipe(res);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind local Remotion asset server'));
        return;
      }
      resolve(addr.port);
    });
  });

  const assetUrls: Record<string, string> = {};
  for (const [key, fileName] of keyToFile.entries()) {
    assetUrls[key] = `http://127.0.0.1:${port}/${encodeURIComponent(fileName)}`;
  }

  return {
    assetUrls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function hashDirRecursive(dir: string, hasher: ReturnType<typeof createHash>): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hashDirRecursive(full, hasher);
    } else if (entry.isFile()) {
      hasher.update(full);
      hasher.update(fs.readFileSync(full));
    }
  }
}

export function computeBundleSourceHash(): string {
  const hasher = createHash('sha256');
  hashDirRecursive(path.join(pkgDir, 'src'), hasher);
  hashDirRecursive(path.join(workspaceRoot, 'packages', 'core', 'src'), hasher);
  for (const file of [
    path.join(pkgDir, 'package.json'),
    path.join(pkgDir, 'remotion.config.ts'),
    path.join(workspaceRoot, 'package-lock.json'),
  ]) {
    if (fs.existsSync(file)) {
      hasher.update(file);
      hasher.update(fs.readFileSync(file));
    }
  }
  return hasher.digest('hex').slice(0, 16);
}

export async function ensureVideoBrowser(onProgress?: (pct: number) => void): Promise<void> {
  if (browserEnsured) return;
  let lastPct = -1;
  await ensureBrowser({
    onBrowserDownload: () => ({
      version: null,
      onProgress: ({ percent }) => {
        const pct = Math.round(percent * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress?.(pct);
        }
      },
    }),
  });
  browserEnsured = true;
}

export async function getOrBuildRemotionBundle(cacheDirAbs: string): Promise<string> {
  const sourceHash = computeBundleSourceHash();
  const bundleBaseDir = path.join(cacheDirAbs, 'remotion-bundle');
  const hashMarkerPath = path.join(bundleBaseDir, '.bundle-hash');
  const serveDir = path.join(bundleBaseDir, 'bundle');

  if (
    fs.existsSync(hashMarkerPath) &&
    fs.existsSync(path.join(serveDir, 'index.html')) &&
    fs.readFileSync(hashMarkerPath, 'utf8').trim() === sourceHash
  ) {
    return serveDir;
  }

  if (activeBundlePromise) {
    return activeBundlePromise;
  }

  activeBundlePromise = (async () => {
    const tmpServeDir = path.join(bundleBaseDir, `.tmp-bundle-${sourceHash}-${Date.now()}`);
    fs.mkdirSync(bundleBaseDir, { recursive: true });
    try {
      const entryPoint = path.join(pkgDir, 'src', 'remotionEntry.ts');
      await bundle({
        entryPoint,
        outDir: tmpServeDir,
        webpackOverride: (config) => ({
          ...config,
          resolve: {
            ...config.resolve,
            extensionAlias: {
              '.js': ['.ts', '.tsx', '.js', '.jsx'],
              '.mjs': ['.mts', '.mjs'],
            },
            alias: {
              ...(config.resolve?.alias ?? {}),
              '@post/core/shared': path.join(workspaceRoot, 'packages', 'core', 'src', 'shared.ts'),
              '@post/core': path.join(workspaceRoot, 'packages', 'core', 'src', 'shared.ts'),
            },
          },
        }),
      });

      const oldBackupDir = path.join(bundleBaseDir, `.old-bundle-${Date.now()}`);
      if (fs.existsSync(serveDir)) {
        fs.renameSync(serveDir, oldBackupDir);
      }
      fs.renameSync(tmpServeDir, serveDir);
      fs.writeFileSync(hashMarkerPath, sourceHash, 'utf8');
      if (fs.existsSync(oldBackupDir)) {
        fs.rmSync(oldBackupDir, { recursive: true, force: true });
      }
      return serveDir;
    } catch (err) {
      if (fs.existsSync(tmpServeDir)) {
        fs.rmSync(tmpServeDir, { recursive: true, force: true });
      }
      throw err;
    } finally {
      activeBundlePromise = null;
    }
  })();

  return activeBundlePromise;
}

export interface RenderRemotionOptions {
  cacheDirAbs: string;
  outputVideoPath: string;
  assetDir?: string;
  props: ReelCompositionProps;
  signal?: AbortSignal;
  onBrowserDownloadProgress?: (pct: number) => void;
  onRenderProgress?: (pct: number, renderedFrames: number, totalFrames: number) => void;
}

export async function renderRemotionVideo(opts: RenderRemotionOptions): Promise<void> {
  await ensureVideoBrowser(opts.onBrowserDownloadProgress);
  const serveUrl = await getOrBuildRemotionBundle(opts.cacheDirAbs);

  const assetServer = await startLocalAssetServer(opts.assetDir, opts.props.storyboard.assets);
  const resolvedProps: ReelCompositionProps =
    Object.keys(assetServer.assetUrls).length > 0
      ? { ...opts.props, assetUrls: { ...(opts.props.assetUrls ?? {}), ...assetServer.assetUrls } }
      : opts.props;

  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => {
    cancel();
  };
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  fs.mkdirSync(path.dirname(opts.outputVideoPath), { recursive: true });
  let lastReportAt = 0;

  try {
    const composition = await selectComposition({
      serveUrl,
      id: REEL_COMPOSITION_ID,
      inputProps: resolvedProps,
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      crf: 10,
      muted: true,
      outputLocation: opts.outputVideoPath,
      inputProps: resolvedProps,
      cancelSignal,
      overwrite: true,
      onProgress: ({ progress, renderedFrames }) => {
        const now = Date.now();
        if (now - lastReportAt >= 250 || progress >= 1) {
          lastReportAt = now;
          opts.onRenderProgress?.(
            Math.round(progress * 100),
            renderedFrames,
            composition.durationInFrames,
          );
        }
      },
    });
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    await assetServer.close();
  }
}

export interface VerificationStillJob {
  id: string;
  outputPath: string;
  frame: number;
  props: ReelCompositionProps;
}

export interface RenderVerificationStillsOptions {
  cacheDirAbs: string;
  jobs: readonly VerificationStillJob[];
  /** Optional shared directory containing fixture image/video assets. */
  assetDir?: string;
  /** Registered fixture asset refs served to all jobs that reference them. */
  sharedAssets?: Record<string, ReelAssetRef>;
  scale?: number;
  imageFormat?: 'jpeg' | 'png';
  onJobDone?: (job: VerificationStillJob, idx: number, total: number) => void;
}

/**
 * Renders many verification stills using ONE reused Headless Chrome instance
 * and ONE Remotion bundle so Check 08 runs in seconds instead of minutes.
 */
export async function renderVerificationStills(
  opts: RenderVerificationStillsOptions,
): Promise<void> {
  if (opts.jobs.length === 0) return;

  await ensureVideoBrowser();
  const serveUrl = await getOrBuildRemotionBundle(opts.cacheDirAbs);

  // Merge all registered assets across jobs + sharedAssets into one static server
  const mergedAssets: Record<string, ReelAssetRef> = { ...(opts.sharedAssets ?? {}) };
  for (const job of opts.jobs) {
    Object.assign(mergedAssets, job.props.storyboard.assets ?? {});
  }
  const assetServer = await startLocalAssetServer(opts.assetDir, mergedAssets);

  const browser = await openBrowser('chrome', {
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null,
    logLevel: 'error',
  });

  try {
    const firstJob = opts.jobs[0]!;
    const baseComposition = await selectComposition({
      serveUrl,
      id: REEL_COMPOSITION_ID,
      inputProps: firstJob.props,
      puppeteerInstance: browser,
    });

    const scale = opts.scale ?? 0.5;
    const imageFormat = opts.imageFormat ?? 'jpeg';

    for (let i = 0; i < opts.jobs.length; i++) {
      const job = opts.jobs[i]!;
      fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });

      const resolvedProps: ReelCompositionProps =
        Object.keys(assetServer.assetUrls).length > 0
          ? {
              ...job.props,
              assetUrls: { ...assetServer.assetUrls, ...(job.props.assetUrls ?? {}) },
            }
          : job.props;

      const lastTiming = resolvedProps.sceneTimings[resolvedProps.sceneTimings.length - 1];
      const framesFromScenes = lastTiming ? lastTiming.startFrame + lastTiming.durationInFrames : 0;
      const durationInFrames = Math.max(120, framesFromScenes, job.frame + 10);

      await renderStill({
        composition: {
          ...baseComposition,
          durationInFrames,
          props: resolvedProps,
        },
        serveUrl,
        output: job.outputPath,
        frame: job.frame,
        inputProps: resolvedProps,
        puppeteerInstance: browser,
        scale,
        imageFormat,
        overwrite: true,
      });

      opts.onJobDone?.(job, i, opts.jobs.length);
    }
  } finally {
    await browser.close({ silent: true });
    await assetServer.close();
  }
}
