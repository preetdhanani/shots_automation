import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InstagramGraphPublisher,
  loadEnv,
  LocalAssetStorage,
  SAMPLE_DEMO_STORYBOARD,
  SqliteStore,
} from '@post/core';

function createValidTestMp4(outPath: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x09090B:s=1080x1920:r=30:d=3.5',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-t',
      '3.5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { stdio: 'ignore' },
  );
}

describe('InstagramGraphPublisher & Crash Reconciliation', () => {
  let tmpDir: string;
  let store: SqliteStore;
  let storage: LocalAssetStorage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-pub-test-'));
    storage = new LocalAssetStorage(tmpDir);
    storage.ensureBaseDirs();
    store = new SqliteStore(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('blocks live publish for sample Reels while allowing dry run', async () => {
    const reel = store.createReel({
      topicId: null,
      isSample: true,
      pillar: 'harnesses',
      status: 'READY_FOR_REVIEW',
      title: 'Sample Reel',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: 'Sample caption',
      hashtags: ['#ai', '#dev'],
      voiceName: 'Puck',
    });
    const mp4Path = storage.reelFile(reel.id, 'final.mp4');
    createValidTestMp4(mp4Path);
    store.updateReel(reel.id, { videoPath: mp4Path });

    const env = loadEnv({
      DATA_DIR: tmpDir,
      META_IG_USER_ID: '178414000',
      META_ACCESS_TOKEN: 'meta_tok',
    });

    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ id: '178414000', username: 'aidev' }), { status: 200 });

    const publisher = new InstagramGraphPublisher({ store, storage, env, fetchImpl: mockFetch });
    const dry = await publisher.publish(store.getReel(reel.id)!, { dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.warnings.some((w) => w.includes('sample'))).toBe(true);

    await expect(publisher.publish(store.getReel(reel.id)!)).rejects.toThrow(/Sample demo Reels/);
  });

  it('executes 4-step Resumable Upload, retries transient 2207027, and guards concurrent claims', async () => {
    const reel = store.createReel({
      topicId: null,
      isSample: false,
      pillar: 'benchmarks',
      status: 'READY_FOR_REVIEW',
      title: 'Real Reel',
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: 'Benchmark breakdown',
      hashtags: ['#ai', '#benchmarks'],
      voiceName: 'Puck',
    });
    const mp4Path = storage.reelFile(reel.id, 'final.mp4');
    createValidTestMp4(mp4Path);
    store.updateReel(reel.id, { videoPath: mp4Path });

    const calls: Array<{ url: string; method: string; auth: string | null; body: string }> = [];
    let pollCount = 0;
    let publishCalls = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const headers = new Headers(init?.headers);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({
        url,
        method,
        auth: headers.get('authorization'),
        body: typeof init?.body === 'string' ? init.body : '[binary]',
      });

      if (url.endsWith('/178414000/media') && method === 'POST') {
        expect(headers.get('authorization')).toBe('Bearer meta_tok');
        expect(typeof init?.body === 'string' && init.body).toContain('upload_type=resumable');
        expect(typeof init?.body === 'string' && init.body).toContain('thumb_offset=800');
        return new Response(
          JSON.stringify({
            id: 'container_999',
            uri: 'https://rupload.facebook.com/ig-api-upload/v27.0/container_999',
          }),
          { status: 200 },
        );
      }

      if (url.startsWith('https://rupload.facebook.com/')) {
        if (method === 'GET') return new Response(JSON.stringify({ offset: 0 }), { status: 200 });
        expect(headers.get('authorization')).toBe('OAuth meta_tok');
        expect(Number(headers.get('file_size'))).toBeGreaterThan(1000);
        expect(headers.get('offset')).toBe('0');
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      if (url.includes('/container_999?fields=status_code')) {
        pollCount++;
        return new Response(
          JSON.stringify({ status_code: pollCount >= 2 ? 'FINISHED' : 'IN_PROGRESS' }),
          { status: 200 },
        );
      }

      if (url.endsWith('/178414000/media_publish')) {
        publishCalls++;
        if (publishCalls === 1) {
          return new Response(
            JSON.stringify({ error: { message: 'Not ready yet', code: 9007, error_subcode: 2207027 } }),
            { status: 400 },
          );
        }
        return new Response(JSON.stringify({ id: 'ig_media_777' }), { status: 200 });
      }

      if (url.includes('/ig_media_777?fields=permalink')) {
        // Permalink error must NOT fail already-published Reel
        return new Response(JSON.stringify({ error: { message: 'No permalink perm' } }), {
          status: 403,
        });
      }

      return new Response('{}', { status: 404 });
    };

    const env = loadEnv({
      DATA_DIR: tmpDir,
      META_IG_USER_ID: '178414000',
      META_ACCESS_TOKEN: 'meta_tok',
    });

    const publisher = new InstagramGraphPublisher({
      store,
      storage,
      env,
      fetchImpl: mockFetch,
      pollIntervalMs: 10,
      maxPollAttempts: 5,
    });

    const res = await publisher.publish(store.getReel(reel.id)!);
    expect(res.published).toBe(true);
    expect(res.reel.status).toBe('PUBLISHED');
    expect(res.reel.instagramMediaId).toBe('ig_media_777');
    expect(publishCalls).toBe(2);

    // Concurrent second publish claim fails cleanly
    expect(store.claimReelForPublish(reel.id)).toBe(false);
  });

  it('preserves live CLI pipeline runs on boot reconciliation while recovering dead server runs', () => {
    const cliRun = store.createPipelineRun({
      reelId: null,
      trigger: 'daily_cli',
      workerSource: 'cli',
      workerPid: process.pid, // live PID
      status: 'RUNNING',
    });
    const deadServerRun = store.createPipelineRun({
      reelId: null,
      trigger: 'manual',
      workerSource: 'server',
      workerPid: 999999,
      status: 'RUNNING',
    });

    const rec = store.reconcileBootState(() => false);
    expect(rec.failedRuns).toContain(deadServerRun.id);
    expect(rec.failedRuns).not.toContain(cliRun.id);
    expect(store.getPipelineRun(cliRun.id)?.status).toBe('RUNNING');
  });
});
