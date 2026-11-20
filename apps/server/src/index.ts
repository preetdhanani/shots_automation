import path from 'node:path';
import { serve } from '@hono/node-server';
import {
  InstagramGraphPublisher,
  LocalAssetStorage,
  loadEnv,
  PipelineQueue,
  ReelOrchestrator,
  SqliteStore,
} from '@post/core';
import { renderRemotionVideo } from '@post/video';
import { createServerApp } from './app.js';

async function main(): Promise<void> {
  let env = loadEnv();
  const storage = new LocalAssetStorage(env.DATA_DIR_ABS);
  storage.ensureBaseDirs();

  const store = new SqliteStore(path.join(env.DATA_DIR_ABS, 'post.db'));
  const queue = new PipelineQueue(store);
  const orchestrator = new ReelOrchestrator({
    env,
    getEnv: () => env,
    store,
    storage,
    queue,
    renderVideo: renderRemotionVideo,
    workerSource: 'server',
  });

  // Crash recovery & reconciliation on boot
  const bootRec = store.reconcileBootState((reel) => storage.hasValidFinalVideo(reel.id));
  if (bootRec.failedRuns.length > 0 || bootRec.recoveredGeneratingReels.length > 0) {
    console.log(
      `[boot] Reconciled ${bootRec.failedRuns.length} interrupted run(s) and ${bootRec.recoveredGeneratingReels.length} generating reel(s).`,
    );
  }
  if (bootRec.pendingPublishingReels.length > 0 && env.META_IG_USER_ID && env.META_ACCESS_TOKEN) {
    const publisher = new InstagramGraphPublisher({ store, storage, env });
    for (const reel of bootRec.pendingPublishingReels) {
      void publisher.reconcile(reel).catch((err) => {
        console.warn(`[boot] Could not auto-reconcile publishing reel ${reel.id}:`, err);
      });
    }
  }

  const dashboardDistDir = path.join(env.WORKSPACE_ROOT, 'apps', 'dashboard', 'dist');
  const app = createServerApp({
    getEnv: () => env,
    setEnv: (next) => {
      env = next;
    },
    store,
    storage,
    queue,
    orchestrator,
    dashboardDistDir,
  });

  const server = serve({
    fetch: app.fetch,
    hostname: '127.0.0.1',
    port: env.SERVER_PORT,
  });

  console.log(`Post Reels Studio server listening on http://127.0.0.1:${env.SERVER_PORT}`);

  const shutdown = () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
