import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PipelineQueue } from '../src/pipeline/queue.js';
import { SqliteStore } from '../src/db/store.js';

const tempDirs: string[] = [];

function makeTempStore(): SqliteStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-queue-test-'));
  tempDirs.push(dir);
  return new SqliteStore(path.join(dir, 'test.db'));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('PipelineQueue concurrency and instant cancellation', () => {
  it('runs multiple render jobs concurrently up to maxConcurrentRenders', async () => {
    const store = makeTempStore();
    const queue = new PipelineQueue(store, { maxConcurrentRenders: 2 });

    let activeNow = 0;
    let maxObserved = 0;
    const resolvers: Array<() => void> = [];

    const enqueueHold = () =>
      queue.createAndEnqueueRender({
        reelId: null,
        trigger: 'manual',
        workerSource: 'server',
        initialStep: 'script',
        execute: async (runId) => {
          activeNow++;
          maxObserved = Math.max(maxObserved, activeNow);
          await new Promise<void>((resolve) => {
            resolvers.push(resolve);
          });
          activeNow--;
          queue.finishRun(runId, 'DONE', 'ready', 'Finished');
        },
      });

    const r1 = enqueueHold();
    const r2 = enqueueHold();
    const r3 = enqueueHold();

    await new Promise((r) => setTimeout(r, 25));

    expect(maxObserved).toBe(2);
    expect(store.getPipelineRun(r1.id)?.status).toBe('RUNNING');
    expect(store.getPipelineRun(r2.id)?.status).toBe('RUNNING');
    expect(store.getPipelineRun(r3.id)?.status).toBe('QUEUED');

    // Finish first two jobs, third should start automatically
    resolvers.shift()?.();
    resolvers.shift()?.();
    await new Promise((r) => setTimeout(r, 25));

    expect(store.getPipelineRun(r3.id)?.status).toBe('RUNNING');
    resolvers.shift()?.();
    await new Promise((r) => setTimeout(r, 25));

    expect(store.getPipelineRun(r1.id)?.status).toBe('DONE');
    expect(store.getPipelineRun(r2.id)?.status).toBe('DONE');
    expect(store.getPipelineRun(r3.id)?.status).toBe('DONE');
    store.close();
  });

  it('cancels a hung running job immediately and frees its concurrency slot', async () => {
    const store = makeTempStore();
    const queue = new PipelineQueue(store, { maxConcurrentRenders: 1 });

    let cancelCallbackFired = false;
    let secondJobStarted = false;

    const hungRun = queue.createAndEnqueueRender({
      reelId: null,
      trigger: 'manual',
      workerSource: 'server',
      initialStep: 'script',
      onCancel: () => {
        cancelCallbackFired = true;
      },
      execute: async () => {
        // Simulate a hung network request that never resolves
        await new Promise<void>(() => {});
      },
    });

    const queuedRun = queue.createAndEnqueueRender({
      reelId: null,
      trigger: 'manual',
      workerSource: 'server',
      initialStep: 'script',
      execute: async (runId) => {
        secondJobStarted = true;
        queue.finishRun(runId, 'DONE', 'ready', 'Done');
      },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(store.getPipelineRun(hungRun.id)?.status).toBe('RUNNING');
    expect(store.getPipelineRun(queuedRun.id)?.status).toBe('QUEUED');

    const cancelled = queue.cancelRun(hungRun.id);
    expect(cancelled).toBe(true);
    expect(cancelCallbackFired).toBe(true);
    expect(store.getPipelineRun(hungRun.id)?.status).toBe('CANCELLED');

    await new Promise((r) => setTimeout(r, 25));
    expect(secondJobStarted).toBe(true);
    expect(store.getPipelineRun(queuedRun.id)?.status).toBe('DONE');
    store.close();
  });
});
