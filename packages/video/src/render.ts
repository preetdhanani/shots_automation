import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import {
  ensureBrowser,
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from '@remotion/renderer';
import type { ReelCompositionProps } from './types.js';

const REEL_COMPOSITION_ID = 'AiDevReel';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(pkgDir, '..', '..');

let activeBundlePromise: Promise<string> | null = null;
let browserEnsured = false;

function hashDirRecursive(dir: string, hasher: ReturnType<typeof createHash>): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
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

export async function ensureVideoBrowser(
  onProgress?: (pct: number) => void,
): Promise<void> {
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
              ...config.resolve?.alias,
              '@post/core': path.join(workspaceRoot, 'packages', 'core', 'src', 'shared.ts'),
            },
          },
        }),
      });

      if (fs.existsSync(serveDir)) {
        fs.rmSync(serveDir, { recursive: true, force: true });
      }
      fs.renameSync(tmpServeDir, serveDir);
      fs.writeFileSync(hashMarkerPath, sourceHash, 'utf8');
      return serveDir;
    } finally {
      if (fs.existsSync(tmpServeDir)) {
        fs.rmSync(tmpServeDir, { recursive: true, force: true });
      }
      activeBundlePromise = null;
    }
  })();

  return activeBundlePromise;
}

export interface RenderRemotionOptions {
  cacheDirAbs: string;
  outputVideoPath: string;
  props: ReelCompositionProps;
  signal?: AbortSignal;
  onBrowserDownloadProgress?: (pct: number) => void;
  onRenderProgress?: (pct: number, renderedFrames: number, totalFrames: number) => void;
}

export async function renderRemotionVideo(opts: RenderRemotionOptions): Promise<void> {
  if (opts.signal?.aborted) {
    throw new Error('Render cancelled before starting.');
  }

  await ensureVideoBrowser(opts.onBrowserDownloadProgress);
  const serveUrl = await getOrBuildRemotionBundle(opts.cacheDirAbs);

  const composition = await selectComposition({
    serveUrl,
    id: REEL_COMPOSITION_ID,
    inputProps: opts.props,
  });

  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => {
    cancel();
  };
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  fs.mkdirSync(path.dirname(opts.outputVideoPath), { recursive: true });
  let lastReportAt = 0;

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      crf: 10,
      muted: true,
      outputLocation: opts.outputVideoPath,
      inputProps: opts.props,
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
  }
}
