import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  checkGeminiHealth,
  checkMetaHealth,
  checkOpenAICompatibleHealth,
  CONTENT_PILLARS,
  createCustomTopic,
  detectWhisperCliPath,
  ensureWhisperModelDownloaded,
  exchangeShortLivedToken,
  fetchAndStoreTopics,
  loadEnv,
  LocalAssetStorage,
  PipelineQueue,
  REEL_FORMAT_IDS,
  ReelOrchestrator,
  resolveActiveLlmEndpoint,
  SqliteStore,
  type ContentPillar,
  type ReelFormatId,
} from '@post/core';
import { renderRemotionVideo } from '@post/video';

const LAUNCHD_LABEL = 'com.post.reels.daily';

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function waitForRunCompletion(
  queue: PipelineQueue,
  store: SqliteStore,
  runId: string,
): Promise<void> {
  const current = store.getPipelineRun(runId);
  if (current && ['DONE', 'FAILED', 'CANCELLED'].includes(current.status)) {
    if (current.status !== 'DONE') {
      throw new Error(current.logs[current.logs.length - 1]?.message ?? `Run ${current.status}`);
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = queue.subscribe(runId, (evt) => {
      if (evt.log) {
        console.log(`[${evt.log.step}] (${evt.run.progressPct}%) ${evt.log.message}`);
      }
      if (evt.event === 'done') {
        unsubscribe();
        resolve();
      } else if (evt.event === 'failed' || evt.event === 'cancelled') {
        unsubscribe();
        reject(new Error(evt.log?.message ?? `Run ${evt.event}`));
      }
    });
  });
}

function acquireLockfile(lockPath: string): () => void {
  if (fs.existsSync(lockPath)) {
    try {
      const pid = Number.parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
      if (pid > 0) {
        process.kill(pid, 0);
        throw new Error(`Another draft-daily process (PID ${pid}) is already running.`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('already running')) throw err;
    }
  }
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, String(process.pid), 'utf8');
  return () => {
    if (fs.existsSync(lockPath)) fs.rmSync(lockPath, { force: true });
  };
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;
  const env = loadEnv();
  const storage = new LocalAssetStorage(env.DATA_DIR_ABS);
  storage.ensureBaseDirs();

  if (cmd === 'setup:whisper') {
    const cli = await detectWhisperCliPath(env);
    if (!cli) {
      console.error('whisper-cli was not found. Install it with: brew install whisper-cpp');
      process.exit(1);
    }
    console.log(`Found whisper-cli at ${cli}`);
    console.log('Downloading ggml-base.en.bin (~148 MB) if needed...');
    const modelPath = await ensureWhisperModelDownloaded(env);
    console.log(`Whisper model ready at ${modelPath}`);
    return;
  }

  if (cmd === 'meta:check') {
    const health = await checkMetaHealth(env);
    console.log(JSON.stringify(health, null, 2));
    if (!health.ok) process.exit(1);
    return;
  }

  if (cmd === 'meta:exchange-token') {
    const shortToken = args[0];
    if (!shortToken) {
      console.error('Usage: npm run reel -- meta:exchange-token <SHORT_LIVED_TOKEN>');
      process.exit(1);
    }
    const res = await exchangeShortLivedToken(env, shortToken);
    console.log('Long-lived token expires:', res.expiresAt ?? 'unknown');
    console.log('META_ACCESS_TOKEN=' + res.accessToken);
    return;
  }

  if (cmd === 'schedule:install') {
    const hour = Number.parseInt(getArg(args, '--hour') ?? '8', 10);
    const minute = Number.parseInt(getArg(args, '--minute') ?? '30', 10);
    const plistDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistPath = path.join(plistDir, `${LAUNCHD_LABEL}.plist`);
    fs.mkdirSync(plistDir, { recursive: true });

    const nodeBinDir = path.dirname(process.execPath);
    const fullPath = `${nodeBinDir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
    const logOut = path.join(storage.logsDir, 'daily-draft.out.log');
    const logErr = path.join(storage.logsDir, 'daily-draft.err.log');

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${env.WORKSPACE_ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${fullPath}</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>--import</string>
    <string>tsx</string>
    <string>apps/server/src/cli.ts</string>
    <string>draft-daily</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${logOut}</string>
  <key>StandardErrorPath</key>
  <string>${logErr}</string>
</dict>
</plist>
`;
    fs.writeFileSync(plistPath, plist, 'utf8');
    try {
      execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
    } catch {
      // Ignore if not loaded yet
    }
    execFileSync('launchctl', ['load', plistPath], { stdio: 'inherit' });
    console.log(
      `Installed macOS LaunchAgent at ${plistPath} for daily ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`,
    );
    return;
  }

  if (cmd === 'schedule:remove') {
    const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
    if (fs.existsSync(plistPath)) {
      try {
        execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
      } catch {
        // Ignore
      }
      fs.rmSync(plistPath, { force: true });
      console.log(`Removed LaunchAgent ${plistPath}`);
    } else {
      console.log('No LaunchAgent installed.');
    }
    return;
  }

  const store = new SqliteStore(path.join(env.DATA_DIR_ABS, 'post.db'));
  const queue = new PipelineQueue(store);
  const orchestrator = new ReelOrchestrator({
    env,
    store,
    storage,
    queue,
    renderVideo: renderRemotionVideo,
    workerSource: 'cli',
  });

  try {
    if (cmd === 'fetch') {
      const result = await fetchAndStoreTopics(store, env);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (cmd === 'llm:check') {
      const llmEndpointId = getArg(args, '--llm');
      const { active } = resolveActiveLlmEndpoint(store, env, llmEndpointId);
      if (active.provider === 'gemini') {
        const gem = await checkGeminiHealth({
          apiKey: env.GEMINI_API_KEY,
          textModel: env.GEMINI_TEXT_MODEL,
          ttsModel: env.GEMINI_TTS_MODEL,
        });
        console.log(
          JSON.stringify(
            {
              configured: gem.configured,
              ok: gem.ok,
              provider: 'gemini',
              endpointId: 'gemini',
              name: active.name,
              model: gem.textModel,
              ttsModel: gem.ttsModel,
              message: gem.message,
            },
            null,
            2,
          ),
        );
        if (!gem.ok) process.exitCode = 1;
        return;
      }

      const health = await checkOpenAICompatibleHealth({
        endpointId: active.id,
        name: active.name,
        baseUrl: active.baseUrl,
        model: active.model,
        apiKey: active.apiKey,
      });
      console.log(JSON.stringify(health, null, 2));
      if (!health.ok) process.exitCode = 1;
      return;
    }

    if (cmd === 'generate') {
      const topicId = getArg(args, '--topic');
      const prompt = getArg(args, '--prompt');
      const url = getArg(args, '--url');
      const pillarArg = getArg(args, '--pillar') as ContentPillar | undefined;
      const formatArg = getArg(args, '--format') as ReelFormatId | 'auto' | undefined;
      const llmEndpointId = getArg(args, '--llm');
      const format =
        formatArg === 'auto' || (formatArg && REEL_FORMAT_IDS.includes(formatArg))
          ? formatArg
          : undefined;

      if (args.includes('--sample')) {
        const { reel, run } = orchestrator.startSampleReel();
        await waitForRunCompletion(queue, store, run.id);
        console.log(`Sample Reel ready: ${reel.id} -> ${storage.reelFile(reel.id, 'final.mp4')}`);
        return;
      }

      let topic = topicId ? store.getTopic(topicId) : null;
      if (!topic) {
        if (!prompt && !url) {
          console.error(
            'Usage: npm run reel -- generate (--topic <id> | --prompt "..." | --sample) [--llm <endpointId>]',
          );
          process.exitCode = 1;
          return;
        }
        topic = await createCustomTopic(store, {
          prompt: prompt ?? '',
          url,
          pillar: pillarArg && CONTENT_PILLARS.includes(pillarArg) ? pillarArg : undefined,
        });
      }

      const { reel, run } = orchestrator.startGenerateFromTopic({ topic, format, llmEndpointId });
      await waitForRunCompletion(queue, store, run.id);
      console.log(`Reel ready for review: ${reel.id} -> ${storage.reelFile(reel.id, 'final.mp4')}`);
      return;
    }

    if (cmd === 'draft-daily') {
      const llmEndpointId = getArg(args, '--llm');
      const release = acquireLockfile(path.join(env.DATA_DIR_ABS, 'daily-draft.lock'));
      try {
        await fetchAndStoreTopics(store, env);
        const candidates = store.listTopics({ status: 'NEW', limit: 25 });
        const top = candidates[0];
        if (!top) {
          console.log('No new topics available for daily draft.');
          return;
        }
        const { reel, run } = orchestrator.startGenerateFromTopic({
          topic: top,
          llmEndpointId,
        });
        await waitForRunCompletion(queue, store, run.id);
        console.log(`Daily draft generated (READY_FOR_REVIEW): ${reel.id}`);
      } finally {
        release();
      }
      return;
    }

    console.log(
      'Commands: fetch | generate [--llm <endpointId>] | draft-daily [--llm <endpointId>] | llm:check [--llm <endpointId>] | setup:whisper | meta:check | meta:exchange-token | schedule:install | schedule:remove',
    );
  } finally {
    store.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
