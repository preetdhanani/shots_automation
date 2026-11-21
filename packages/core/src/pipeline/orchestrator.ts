import fs from 'node:fs';
import path from 'node:path';
import type { AppEnv } from '../config/env.js';
import type {
  PipelineRunRecord,
  ReelRecord,
  Store,
  TopicRecord,
  WorkerSource,
} from '../db/store.js';
import { enrichTopicForScripting } from '../discovery/fetcher.js';
import { alignStoryboardWithWhisperAnchors, runWhisperAndAlign } from '../generation/aligner.js';
import {
  generateVeoBrollClip,
  type GenerateBrollOptions,
  type GenerateBrollResult,
} from '../generation/broll.js';
import { formatApiErrorMessage } from '../generation/geminiClient.js';
import {
  getDefaultAppSettingsFromEnv,
  resolveActiveLlmEndpoint,
} from '../generation/llmRegistry.js';
import { generateStoryboard } from '../generation/scriptGenerator.js';
import {
  synthesizeSampleVoiceMacOS,
  synthesizeVoiceWithGemini,
  type SynthesizedVoiceResult,
} from '../generation/tts.js';
import { ensureGeneratedAudioAssets } from '../media/audioAssets.js';
import {
  encodeDeliveryReel,
  extractCoverFrame,
  getAudioDurationMs,
  probeVideo,
} from '../media/ffmpeg.js';
import { buildSfxCuesForStoryboard } from '../media/musicLibrary.js';
import {
  fetchSourceVisual,
  type FetchSourceVisualOptions,
} from '../media/sourceVisuals.js';
import { InstagramGraphPublisher } from '../publish/instagram.js';
import type { PublishResult } from '../publish/publisher.js';
import { checkPublishSpacing, type PublishSpacingStatus } from '../publish/spacing.js';
import type { CaptionToken, ReelCaptionsFile, SceneTiming } from '../schemas/media.js';
import {
  sanitizeAssetSegment,
  type ReelAssetRef,
  type ReelStoryboard,
  type VoiceName,
} from '../schemas/storyboard.js';
import { computeNarrationHash, computeStoryboardVisualHash } from '../schemas/hashes.js';
import type { LocalAssetStorage } from '../storage/assets.js';
import { computeReelFingerprint, type ReelFingerprint } from '../variety/fingerprint.js';
import {
  pickRotatedVoice,
  planReelVariety,
  type ReelVarietyPlan,
} from '../variety/planner.js';
import type { ReelFormatId } from '../variety/registry.js';
import type { PipelineQueue } from './queue.js';
import { SAMPLE_DEMO_STORYBOARD } from './sampleFixture.js';

export type RenderVideoCallback = (opts: {
  cacheDirAbs: string;
  outputVideoPath: string;
  assetDir?: string;
  props: {
    storyboard: ReelStoryboard;
    captions: CaptionToken[];
    sceneTimings: SceneTiming[];
    audioDurationMs: number;
    brandHandle: string;
    fps: number;
  };
  signal?: AbortSignal;
  onBrowserDownloadProgress?: (pct: number) => void;
  onRenderProgress?: (pct: number, renderedFrames: number, totalFrames: number) => void;
}) => Promise<void>;

export type SynthesizeVoiceFn = (opts: {
  env: AppEnv;
  storyboard: ReelStoryboard;
  voiceName: VoiceName;
  workDir: string;
  isSample: boolean;
  signal?: AbortSignal;
}) => Promise<SynthesizedVoiceResult>;

export type FetchSourceVisualFn = (opts: FetchSourceVisualOptions) => Promise<ReelAssetRef | null>;

export type GenerateBrollFn = (opts: GenerateBrollOptions) => Promise<GenerateBrollResult>;

export interface OrchestratorDeps {
  env: AppEnv;
  getEnv?: () => AppEnv;
  store: Store;
  storage: LocalAssetStorage;
  queue: PipelineQueue;
  renderVideo: RenderVideoCallback;
  synthesizeVoice?: SynthesizeVoiceFn;
  fetchSourceVisual?: FetchSourceVisualFn;
  generateBroll?: GenerateBrollFn;
  workerSource?: WorkerSource;
}

export class ReelOrchestrator {
  private readonly staticEnv: AppEnv;
  private readonly getEnvFn?: () => AppEnv;
  private readonly store: Store;
  private readonly storage: LocalAssetStorage;
  private readonly queue: PipelineQueue;
  private readonly renderVideo: RenderVideoCallback;
  private readonly synthesizeVoiceFn: SynthesizeVoiceFn;
  private readonly fetchSourceVisualFn: FetchSourceVisualFn;
  private readonly generateBrollFn: GenerateBrollFn;
  private readonly workerSource: WorkerSource;

  constructor(deps: OrchestratorDeps) {
    this.staticEnv = deps.env;
    this.getEnvFn = deps.getEnv;
    this.store = deps.store;
    this.storage = deps.storage;
    this.queue = deps.queue;
    this.renderVideo = deps.renderVideo;
    this.synthesizeVoiceFn =
      deps.synthesizeVoice ??
      (async (opts) =>
        opts.isSample
          ? synthesizeSampleVoiceMacOS({
              storyboard: opts.storyboard,
              workDir: opts.workDir,
              signal: opts.signal,
            })
          : synthesizeVoiceWithGemini({
              env: opts.env,
              storyboard: opts.storyboard,
              voiceName: opts.voiceName,
              workDir: opts.workDir,
              signal: opts.signal,
            }));
    this.fetchSourceVisualFn = deps.fetchSourceVisual ?? fetchSourceVisual;
    this.generateBrollFn = deps.generateBroll ?? generateVeoBrollClip;
    this.workerSource = deps.workerSource ?? 'server';
  }

  private get currentEnv(): AppEnv {
    return this.getEnvFn ? this.getEnvFn() : this.staticEnv;
  }

  private getEffectiveSettings() {
    const env = this.currentEnv;
    return this.store.getSettings(getDefaultAppSettingsFromEnv(env));
  }

  private getRecentVarietyHistory(excludeReelId?: string): ReelFingerprint[] {
    return this.store
      .listRecentReelsForVariety(12)
      .filter((r) => r.id !== excludeReelId)
      .map((r) => computeReelFingerprint(r));
  }

  startGenerateFromTopic(opts: {
    topic: TopicRecord;
    format?: ReelFormatId | 'auto';
    voiceName?: VoiceName | 'auto';
    musicEnabled?: boolean;
    llmEndpointId?: string;
    seed?: number;
  }): { reel: ReelRecord; run: PipelineRunRecord } {
    const settings = this.getEffectiveSettings();
    const history = this.getRecentVarietyHistory();

    // Plan variety & voice synchronously before creating the reel row so parallel
    // queued jobs immediately observe this reel's format/style/voice and never collide.
    const varietyPlan = planReelVariety({
      pillar: opts.topic.pillar,
      history,
      requestedFormat: opts.format,
      seed: opts.seed,
    });

    const voiceName: VoiceName =
      opts.voiceName === 'auto' || (!opts.voiceName && settings.voiceRotation)
        ? pickRotatedVoice(history, settings.defaultVoice)
        : (opts.voiceName ?? settings.defaultVoice);
    const musicEnabled = opts.musicEnabled ?? settings.musicEnabled;

    const placeholderStoryboard: ReelStoryboard = {
      ...SAMPLE_DEMO_STORYBOARD,
      title: opts.topic.title.slice(0, 120),
      pillar: opts.topic.pillar,
      format: varietyPlan.format,
      hookStyle: varietyPlan.hookStyle,
      style: varietyPlan.style,
      sources: [{ title: opts.topic.sourceName, url: opts.topic.sourceUrl }],
    };

    const reel = this.store.createReel({
      topicId: opts.topic.id,
      isSample: false,
      pillar: opts.topic.pillar,
      status: 'GENERATING',
      title: opts.topic.title.slice(0, 120),
      storyboard: placeholderStoryboard,
      caption: opts.topic.summary.slice(0, 500),
      hashtags: placeholderStoryboard.hashtags,
      voiceName,
      musicEnabled,
    });

    this.store.updateTopicStatus(opts.topic.id, 'USED');

    const run = this.queue.createAndEnqueueRender({
      reelId: reel.id,
      trigger: this.workerSource === 'cli' ? 'daily_cli' : 'manual',
      workerSource: this.workerSource,
      initialStep: 'script',
      onCancel: () => this.cancelReelStatus(reel.id, false),
      execute: async (runId, signal) => {
        await this.executeFullGeneration({
          runId,
          reelId: reel.id,
          topic: opts.topic,
          varietyPlan,
          varietyHistory: history,
          voiceName,
          musicEnabled,
          isSample: false,
          llmEndpointId: opts.llmEndpointId,
          signal,
        });
      },
    });

    return { reel, run };
  }

  startSampleReel(opts: { voiceName?: VoiceName; musicEnabled?: boolean } = {}): {
    reel: ReelRecord;
    run: PipelineRunRecord;
  } {
    const settings = this.getEffectiveSettings();
    const voiceName = opts.voiceName ?? settings.defaultVoice;
    const musicEnabled = opts.musicEnabled ?? settings.musicEnabled;

    const reel = this.store.createReel({
      topicId: null,
      isSample: true,
      pillar: SAMPLE_DEMO_STORYBOARD.pillar,
      status: 'GENERATING',
      title: `[Sample] ${SAMPLE_DEMO_STORYBOARD.title}`,
      storyboard: SAMPLE_DEMO_STORYBOARD,
      caption: SAMPLE_DEMO_STORYBOARD.caption,
      hashtags: SAMPLE_DEMO_STORYBOARD.hashtags,
      voiceName,
      musicEnabled,
    });

    const run = this.queue.createAndEnqueueRender({
      reelId: reel.id,
      trigger: 'sample',
      workerSource: this.workerSource,
      initialStep: 'tts',
      onCancel: () => this.cancelReelStatus(reel.id, false),
      execute: async (runId, signal) => {
        await this.executeFullGeneration({
          runId,
          reelId: reel.id,
          topic: null,
          existingStoryboard: SAMPLE_DEMO_STORYBOARD,
          voiceName,
          musicEnabled,
          isSample: true,
          signal,
        });
      },
    });

    return { reel, run };
  }

  startRerenderReel(reelId: string): PipelineRunRecord {
    const reel = this.store.getReel(reelId);
    if (!reel) throw new Error(`Reel ${reelId} not found.`);
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED'].includes(reel.status)) {
      throw new Error(`Cannot re-render reel while status is "${reel.status}".`);
    }

    const voice48k = this.storage.reelFile(reelId, 'voice-48k.wav');
    const voice16k = this.storage.reelFile(reelId, 'voice-16k.wav');
    const captionsPath = this.storage.reelFile(reelId, 'captions.json');
    if (!fs.existsSync(voice48k)) {
      throw new Error('Existing voiceover audio is missing. Use Regenerate Voice + Video instead.');
    }

    const hadValidVideo = this.storage.hasValidFinalVideo(reelId);
    this.store.updateReel(reelId, { status: 'GENERATING', errorMessage: null });

    return this.queue.createAndEnqueueRender({
      reelId,
      trigger: 'rerender',
      workerSource: this.workerSource,
      initialStep: 'align',
      onCancel: () => this.cancelReelStatus(reelId, hadValidVideo),
      execute: async (runId, signal) => {
        const stagingDir = this.storage.getStagingDir(reelId, runId);
        try {
          const settings = this.getEffectiveSettings();
          const currentReel = this.store.getReel(reelId)!;
          const durationMs =
            currentReel.audioDurationMs ?? (await getAudioDurationMs(voice48k, signal));

          let captionsFile: ReelCaptionsFile;
          const currentNarrationHash = computeNarrationHash(currentReel.storyboard);
          const narrationMatches = currentNarrationHash === currentReel.renderedNarrationHash;

          if (narrationMatches && fs.existsSync(captionsPath)) {
            this.queue.updateProgress(runId, 'align', 38, 'Reusing synced word timestamps...');
            captionsFile = JSON.parse(fs.readFileSync(captionsPath, 'utf8')) as ReelCaptionsFile;
          } else if (fs.existsSync(voice16k)) {
            this.queue.updateProgress(runId, 'align', 38, 'Re-aligning captions to audio...');
            captionsFile = await runWhisperAndAlign({
              env: this.currentEnv,
              storyboard: currentReel.storyboard,
              voice16kPath: voice16k,
              audioDurationMs: durationMs,
              workDir: stagingDir,
              signal,
            });
          } else {
            captionsFile = alignStoryboardWithWhisperAnchors(
              currentReel.storyboard,
              [],
              durationMs,
            );
          }

          fs.writeFileSync(
            path.join(stagingDir, 'captions.json'),
            JSON.stringify(captionsFile, null, 2),
          );

          await this.renderAndFinalizeFromAudio({
            runId,
            reelId,
            stagingDir,
            assetDir: this.storage.getReelDir(reelId),
            storyboard: currentReel.storyboard,
            captionsFile,
            voice48kPath: voice48k,
            voiceName: currentReel.voiceName,
            musicEnabled: currentReel.musicEnabled,
            brandHandle: settings.brandHandle,
            musicVolumeDb: settings.musicVolumeDb,
            narrationHash: currentReel.renderedNarrationHash ?? currentNarrationHash,
            renderedVoiceName: currentReel.renderedVoiceName ?? currentReel.voiceName,
            promoteMappings: [
              { stagedName: 'captions.json', targetName: 'captions.json' },
              { stagedName: 'final.mp4', targetName: 'final.mp4' },
              { stagedName: 'cover.jpg', targetName: 'cover.jpg' },
            ],
            signal,
          });
        } catch (err) {
          this.rollbackReelStatus(reelId, hadValidVideo, err, signal);
          throw err;
        } finally {
          this.storage.cleanupStagingDir(stagingDir);
        }
      },
    });
  }

  startRegenerateAudioAndRender(reelId: string): PipelineRunRecord {
    const reel = this.store.getReel(reelId);
    if (!reel) throw new Error(`Reel ${reelId} not found.`);
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED'].includes(reel.status)) {
      throw new Error(`Cannot regenerate voice while status is "${reel.status}".`);
    }

    const hadValidVideo = this.storage.hasValidFinalVideo(reelId);
    this.store.updateReel(reelId, { status: 'GENERATING', errorMessage: null });

    return this.queue.createAndEnqueueRender({
      reelId,
      trigger: 'regenerate_audio',
      workerSource: this.workerSource,
      initialStep: 'tts',
      onCancel: () => this.cancelReelStatus(reelId, hadValidVideo),
      execute: async (runId, signal) => {
        const stagingDir = this.storage.getStagingDir(reelId, runId);
        try {
          const settings = this.getEffectiveSettings();
          const currentReel = this.store.getReel(reelId)!;

          this.queue.updateProgress(
            runId,
            'tts',
            20,
            currentReel.isSample
              ? 'Synthesizing sample voiceover with macOS speech...'
              : `Generating Gemini TTS voiceover (${currentReel.voiceName})...`,
          );

          const voiceRes = await this.synthesizeVoiceFn({
            env: this.currentEnv,
            storyboard: currentReel.storyboard,
            voiceName: currentReel.voiceName,
            workDir: stagingDir,
            isSample: currentReel.isSample,
            signal,
          });

          this.queue.updateProgress(runId, 'align', 38, 'Aligning word-level timestamps...');
          const captionsFile = await runWhisperAndAlign({
            env: this.currentEnv,
            storyboard: currentReel.storyboard,
            voice16kPath: voiceRes.voice16kPath,
            audioDurationMs: voiceRes.durationMs,
            workDir: stagingDir,
            signal,
          });
          fs.writeFileSync(
            path.join(stagingDir, 'captions.json'),
            JSON.stringify(captionsFile, null, 2),
          );
          fs.writeFileSync(
            path.join(stagingDir, 'storyboard.json'),
            JSON.stringify(currentReel.storyboard, null, 2),
          );

          await this.renderAndFinalizeFromAudio({
            runId,
            reelId,
            stagingDir,
            assetDir: this.storage.getReelDir(reelId),
            storyboard: currentReel.storyboard,
            captionsFile,
            voice48kPath: voiceRes.voice48kPath,
            voiceName: currentReel.voiceName,
            musicEnabled: currentReel.musicEnabled,
            brandHandle: settings.brandHandle,
            musicVolumeDb: settings.musicVolumeDb,
            narrationHash: computeNarrationHash(currentReel.storyboard),
            renderedVoiceName: currentReel.voiceName,
            promoteMappings: [
              { stagedName: 'storyboard.json', targetName: 'storyboard.json' },
              { stagedName: 'voice-raw.bin', targetName: 'voice-raw.bin' },
              { stagedName: 'voice-trimmed.wav', targetName: 'voice-trimmed.wav' },
              { stagedName: 'voice-48k.wav', targetName: 'voice-48k.wav' },
              { stagedName: 'voice-16k.wav', targetName: 'voice-16k.wav' },
              { stagedName: 'captions.json', targetName: 'captions.json' },
              { stagedName: 'final.mp4', targetName: 'final.mp4' },
              { stagedName: 'cover.jpg', targetName: 'cover.jpg' },
            ],
            signal,
          });
        } catch (err) {
          this.rollbackReelStatus(reelId, hadValidVideo, err, signal);
          throw err;
        } finally {
          this.storage.cleanupStagingDir(stagingDir);
        }
      },
    });
  }

  startRetryFailedReel(reelId: string): PipelineRunRecord {
    const reel = this.store.getReel(reelId);
    if (!reel) throw new Error(`Reel ${reelId} not found.`);
    if (reel.status !== 'FAILED') {
      throw new Error(`Only FAILED reels can be retried (current status: ${reel.status}).`);
    }
    const topic = reel.topicId ? this.store.getTopic(reel.topicId) : null;
    const history = this.getRecentVarietyHistory(reelId);
    const varietyPlan = reel.isSample
      ? undefined
      : planReelVariety({
          pillar: topic?.pillar ?? reel.pillar,
          history,
          requestedFormat: reel.storyboard.format,
        });

    this.store.updateReel(reelId, { status: 'GENERATING', errorMessage: null });

    return this.queue.createAndEnqueueRender({
      reelId,
      trigger: reel.isSample ? 'sample' : 'manual',
      workerSource: this.workerSource,
      initialStep: reel.isSample ? 'tts' : 'script',
      onCancel: () => this.cancelReelStatus(reelId, this.storage.hasValidFinalVideo(reelId)),
      execute: async (runId, signal) => {
        await this.executeFullGeneration({
          runId,
          reelId,
          topic,
          existingStoryboard: reel.isSample ? reel.storyboard : undefined,
          varietyPlan,
          varietyHistory: history,
          voiceName: reel.voiceName,
          musicEnabled: reel.musicEnabled,
          isSample: reel.isSample,
          signal,
        });
      },
    });
  }

  getPublishSpacingStatus(nowMs = Date.now()): PublishSpacingStatus {
    const settings = this.getEffectiveSettings();
    const latestPublished = this.store.getLatestPublishedReel();
    return checkPublishSpacing(latestPublished?.publishedAt ?? null, settings.minPublishSpacingHours, nowMs);
  }

  async publishDryRun(reelId: string): Promise<PublishResult> {
    const reel = this.store.getReel(reelId);
    if (!reel) throw new Error(`Reel ${reelId} not found.`);
    const publisher = new InstagramGraphPublisher({
      store: this.store,
      storage: this.storage,
      env: this.currentEnv,
    });
    return publisher.publish(reel, { dryRun: true });
  }

  startPublishAsync(reelId: string, opts: { force?: boolean } = {}): PipelineRunRecord {
    const reel = this.store.getReel(reelId);
    if (!reel) throw new Error(`Reel ${reelId} not found.`);
    if (reel.isSample) {
      throw new Error(
        'Sample demo Reels cannot be published to live Instagram. Generate a real Reel from Discover or a custom prompt.',
      );
    }
    if (reel.status !== 'READY_FOR_REVIEW') {
      throw new Error(`Reel status is "${reel.status}", expected "READY_FOR_REVIEW".`);
    }

    const publisher = new InstagramGraphPublisher({
      store: this.store,
      storage: this.storage,
      env: this.currentEnv,
    });

    return this.queue.runIndependentAsync({
      reelId,
      trigger: 'publish',
      workerSource: this.workerSource,
      initialStep: 'create_container',
      execute: async (runId, signal) => {
        const result = await publisher.publish(reel, {
          dryRun: false,
          bypassSpacing: opts.force === true,
          signal,
          onProgress: (step, pct, message) => {
            this.queue.updateProgress(runId, step, pct, message, { forcePersist: true });
          },
        });
        this.queue.finishRun(runId, 'DONE', 'done', result.message);
      },
    });
  }

  startReconcileAsync(reelId: string): PipelineRunRecord {
    const reel = this.store.getReel(reelId);
    if (!reel) throw new Error(`Reel ${reelId} not found.`);
    if (reel.status !== 'PUBLISHING') {
      throw new Error(`Only PUBLISHING reels need reconciliation (status: ${reel.status}).`);
    }

    const publisher = new InstagramGraphPublisher({
      store: this.store,
      storage: this.storage,
      env: this.currentEnv,
    });

    return this.queue.runIndependentAsync({
      reelId,
      trigger: 'publish',
      workerSource: this.workerSource,
      initialStep: 'poll_status',
      execute: async (runId, signal) => {
        const result = await publisher.reconcile(reel, {
          signal,
          onProgress: (step, pct, message) => {
            this.queue.updateProgress(runId, step, pct, message, { forcePersist: true });
          },
        });
        this.queue.finishRun(runId, 'DONE', 'done', result.message);
      },
    });
  }

  private async enrichStoryboardAssets(opts: {
    runId: string;
    storyboard: ReelStoryboard;
    topic: TopicRecord | null;
    stagingDir: string;
    brollEnabled: boolean;
    signal: AbortSignal;
  }): Promise<ReelStoryboard> {
    const assets: Record<string, ReelAssetRef> = { ...(opts.storyboard.assets ?? {}) };
    let scenes = [...opts.storyboard.scenes];
    let changed = false;

    const hasSourceSpotlight = scenes.some((s) => s.type === 'source_spotlight');
    const sourceUrl = opts.topic?.sourceUrl || opts.storyboard.sources[0]?.url;
    if (hasSourceSpotlight && sourceUrl) {
      this.queue.updateProgress(opts.runId, 'script', 16, 'Fetching source visual...');
      const fetched = await this.fetchSourceVisualFn({
        url: sourceUrl,
        outDir: opts.stagingDir,
        filename: 'source-visual.jpg',
        signal: opts.signal,
      });
      if (fetched) {
        assets.source = fetched;
        scenes = scenes.map((s) =>
          s.type === 'source_spotlight' ? { ...s, imageAsset: 'source' } : s,
        );
        changed = true;
      }
    }

    if (opts.brollEnabled) {
      const brollScene = scenes.find((s) => s.type === 'ai_media_clip');
      if (brollScene && brollScene.type === 'ai_media_clip') {
        this.queue.updateProgress(opts.runId, 'script', 20, 'Generating AI B-roll clip via Veo...');
        const brollRes = await this.generateBrollFn({
          env: this.currentEnv,
          sceneId: brollScene.id,
          prompt: brollScene.prompt,
          outDir: opts.stagingDir,
          durationSec: brollScene.durationHintSec,
          signal: opts.signal,
        });
        if (brollRes.asset) {
          const assetKey = `broll_${sanitizeAssetSegment(brollScene.id)}`;
          assets[assetKey] = brollRes.asset;
          scenes = scenes.map((s) =>
            s.id === brollScene.id && s.type === 'ai_media_clip'
              ? { ...s, videoAsset: assetKey }
              : s,
          );
          changed = true;
        } else if (brollRes.warning) {
          this.queue.updateProgress(opts.runId, 'script', 22, brollRes.warning, {
            level: 'warn',
          });
        }
      }
    }

    if (!changed) {
      return opts.storyboard;
    }

    return {
      ...opts.storyboard,
      assets,
      scenes,
    };
  }

  private async executeFullGeneration(opts: {
    runId: string;
    reelId: string;
    topic: TopicRecord | null;
    existingStoryboard?: ReelStoryboard;
    varietyPlan?: ReelVarietyPlan;
    varietyHistory?: ReelFingerprint[];
    voiceName: VoiceName;
    musicEnabled: boolean;
    isSample: boolean;
    llmEndpointId?: string;
    signal: AbortSignal;
  }): Promise<void> {
    const stagingDir = this.storage.getStagingDir(opts.reelId, opts.runId);
    try {
      const settings = this.getEffectiveSettings();
      const env = this.currentEnv;

      let storyboard = opts.existingStoryboard;
      if (!storyboard) {
        if (!opts.topic) {
          throw new Error('Topic is required to generate a new storyboard.');
        }
        const { active: endpoint } = resolveActiveLlmEndpoint(this.store, env, opts.llmEndpointId);
        const history = opts.varietyHistory ?? this.getRecentVarietyHistory(opts.reelId);
        const varietyPlan =
          opts.varietyPlan ??
          planReelVariety({
            pillar: opts.topic.pillar,
            history,
          });

        this.queue.updateProgress(
          opts.runId,
          'script',
          10,
          `Writing ${varietyPlan.format} storyboard with ${endpoint.name} (${endpoint.model})...`,
        );
        const enrichedTopic = await enrichTopicForScripting(opts.topic, {
          signal: opts.signal,
        });
        if (enrichedTopic.summary !== opts.topic.summary) {
          this.store.updateTopicSummary(opts.topic.id, enrichedTopic.summary);
        }
        storyboard = await generateStoryboard(env, endpoint, {
          topic: enrichedTopic,
          brandHandle: settings.brandHandle,
          varietyPlan,
          history,
          brollEnabled: settings.aiBrollEnabled,
          signal: opts.signal,
        });

        storyboard = await this.enrichStoryboardAssets({
          runId: opts.runId,
          storyboard,
          topic: opts.topic,
          stagingDir,
          brollEnabled: settings.aiBrollEnabled,
          signal: opts.signal,
        });

        this.store.updateReel(opts.reelId, {
          title: storyboard.title,
          pillar: storyboard.pillar,
          storyboard,
          caption: storyboard.caption,
          hashtags: storyboard.hashtags,
        });
      }

      fs.writeFileSync(
        path.join(stagingDir, 'storyboard.json'),
        JSON.stringify(storyboard, null, 2),
      );

      this.queue.updateProgress(
        opts.runId,
        'tts',
        25,
        opts.isSample
          ? 'Synthesizing sample narration via macOS speech...'
          : `Generating Gemini TTS voiceover (${opts.voiceName})...`,
      );

      const voiceRes = await this.synthesizeVoiceFn({
        env,
        storyboard,
        voiceName: opts.voiceName,
        workDir: stagingDir,
        isSample: opts.isSample,
        signal: opts.signal,
      });

      this.queue.updateProgress(
        opts.runId,
        'align',
        40,
        'Syncing word-level captions via local Whisper...',
      );

      const captionsFile = await runWhisperAndAlign({
        env,
        storyboard,
        voice16kPath: voiceRes.voice16kPath,
        audioDurationMs: voiceRes.durationMs,
        workDir: stagingDir,
        signal: opts.signal,
      });

      fs.writeFileSync(
        path.join(stagingDir, 'captions.json'),
        JSON.stringify(captionsFile, null, 2),
      );

      const promoteMappings: Array<{ stagedName: string; targetName: string }> = [
        { stagedName: 'storyboard.json', targetName: 'storyboard.json' },
        { stagedName: 'voice-raw.bin', targetName: 'voice-raw.bin' },
        { stagedName: 'voice-trimmed.wav', targetName: 'voice-trimmed.wav' },
        { stagedName: 'voice-48k.wav', targetName: 'voice-48k.wav' },
        { stagedName: 'voice-16k.wav', targetName: 'voice-16k.wav' },
        { stagedName: 'captions.json', targetName: 'captions.json' },
        { stagedName: 'final.mp4', targetName: 'final.mp4' },
        { stagedName: 'cover.jpg', targetName: 'cover.jpg' },
      ];

      // Dynamically include any staged visual/video assets created during this run
      for (const ref of Object.values(storyboard.assets ?? {})) {
        const stagedAssetPath = path.join(stagingDir, ref.file);
        if (fs.existsSync(stagedAssetPath)) {
          promoteMappings.push({ stagedName: ref.file, targetName: ref.file });
        }
      }

      await this.renderAndFinalizeFromAudio({
        runId: opts.runId,
        reelId: opts.reelId,
        stagingDir,
        assetDir: stagingDir,
        storyboard,
        captionsFile,
        voice48kPath: voiceRes.voice48kPath,
        voiceName: opts.voiceName,
        musicEnabled: opts.musicEnabled,
        brandHandle: settings.brandHandle,
        musicVolumeDb: settings.musicVolumeDb,
        narrationHash: computeNarrationHash(storyboard),
        renderedVoiceName: opts.voiceName,
        promoteMappings,
        signal: opts.signal,
      });
    } catch (err) {
      const hadValidVideo = this.storage.hasValidFinalVideo(opts.reelId);
      this.rollbackReelStatus(opts.reelId, hadValidVideo, err, opts.signal);
      throw err;
    } finally {
      this.storage.cleanupStagingDir(stagingDir);
    }
  }

  private async renderAndFinalizeFromAudio(opts: {
    runId: string;
    reelId: string;
    stagingDir: string;
    assetDir: string;
    storyboard: ReelStoryboard;
    captionsFile: ReelCaptionsFile;
    voice48kPath: string;
    voiceName: VoiceName;
    musicEnabled: boolean;
    brandHandle: string;
    musicVolumeDb: number;
    narrationHash: string;
    renderedVoiceName: VoiceName;
    promoteMappings: Array<{ stagedName: string; targetName: string }>;
    signal: AbortSignal;
  }): Promise<void> {
    const remotionRawPath = path.join(opts.stagingDir, 'remotion-raw.mp4');
    const stagedFinalPath = path.join(opts.stagingDir, 'final.mp4');
    const stagedCoverPath = path.join(opts.stagingDir, 'cover.jpg');

    this.queue.updateProgress(opts.runId, 'render', 46, 'Preparing Remotion video renderer...');

    await this.renderVideo({
      cacheDirAbs: this.currentEnv.CACHE_DIR_ABS,
      outputVideoPath: remotionRawPath,
      assetDir: opts.assetDir,
      props: {
        storyboard: opts.storyboard,
        captions: opts.captionsFile.captions,
        sceneTimings: opts.captionsFile.sceneTimings,
        audioDurationMs: opts.captionsFile.audioDurationMs,
        brandHandle: opts.brandHandle,
        fps: opts.captionsFile.fps,
      },
      signal: opts.signal,
      onBrowserDownloadProgress: (pct) => {
        this.queue.updateProgress(
          opts.runId,
          'render',
          46 + Math.round(pct * 0.08),
          `Downloading Headless Chrome shell (${pct}%)...`,
        );
      },
      onRenderProgress: (pct, renderedFrames, totalFrames) => {
        this.queue.updateProgress(
          opts.runId,
          'render',
          54 + Math.round(pct * 0.28),
          `Rendering frames (${renderedFrames}/${totalFrames})...`,
        );
      },
    });

    this.queue.updateProgress(opts.runId, 'encode', 84, 'Mixing audio & encoding Meta-spec MP4...');

    const musicMood = opts.storyboard.style?.musicMood ?? 'dark_pad';
    const seed = opts.storyboard.style?.seed ?? 0;
    const audioAssets = ensureGeneratedAudioAssets(this.storage.musicDir, {
      mood: musicMood,
      seed,
      sfxDir: this.storage.sfxDir,
    });
    const sfxCues = buildSfxCuesForStoryboard(
      opts.storyboard,
      opts.captionsFile.sceneTimings,
      audioAssets.sfx,
      opts.captionsFile.captions,
    );

    await encodeDeliveryReel({
      rawVideoPath: remotionRawPath,
      voice48kPath: opts.voice48kPath,
      outputMp4Path: stagedFinalPath,
      durationSec: opts.captionsFile.audioDurationMs / 1000,
      musicEnabled: opts.musicEnabled,
      musicPath: audioAssets.ambientPadPath,
      musicVolumeDb: opts.musicVolumeDb,
      sfxCues,
      signal: opts.signal,
    });

    this.queue.updateProgress(opts.runId, 'verify', 94, 'Verifying Instagram Reels spec...');
    const specReport = await probeVideo(stagedFinalPath, opts.signal);
    if (!specReport.ok) {
      throw new Error(`Rendered MP4 failed Meta spec check: ${specReport.errors.join(' ')}`);
    }

    await extractCoverFrame(stagedFinalPath, stagedCoverPath, 0, opts.signal);

    // Delete large uncompressed raw Remotion file before promoting
    if (fs.existsSync(remotionRawPath)) {
      fs.rmSync(remotionRawPath, { force: true });
    }

    this.storage.promoteStagedFiles(opts.reelId, opts.stagingDir, opts.promoteMappings);

    const finalPath = this.storage.reelFile(opts.reelId, 'final.mp4');
    const coverPath = this.storage.reelFile(opts.reelId, 'cover.jpg');

    this.store.updateReel(opts.reelId, {
      status: 'READY_FOR_REVIEW',
      renderedNarrationHash: opts.narrationHash,
      renderedVoiceName: opts.renderedVoiceName,
      renderedStoryboardHash: computeStoryboardVisualHash(
        opts.storyboard,
        opts.musicEnabled,
        opts.brandHandle,
      ),
      alignmentMode: opts.captionsFile.alignmentMode,
      audioDurationMs: opts.captionsFile.audioDurationMs,
      videoPath: finalPath,
      coverPath,
      ffprobeJson: JSON.stringify(specReport),
      errorMessage: null,
    });

    this.queue.finishRun(opts.runId, 'DONE', 'ready', 'Reel rendered and ready for review!');
  }

  private cancelReelStatus(reelId: string, hadValidVideo: boolean): void {
    const reel = this.store.getReel(reelId);
    if (!reel || reel.status !== 'GENERATING') return;
    this.store.updateReel(reelId, {
      status: hadValidVideo ? 'READY_FOR_REVIEW' : 'FAILED',
      errorMessage: hadValidVideo ? null : 'Run cancelled by user.',
    });
  }

  private rollbackReelStatus(
    reelId: string,
    hadValidVideo: boolean,
    err: unknown,
    signal: AbortSignal,
  ): void {
    const msg = signal.aborted ? 'Run cancelled by user.' : formatApiErrorMessage(err);
    this.store.updateReel(reelId, {
      status: hadValidVideo ? 'READY_FOR_REVIEW' : 'FAILED',
      errorMessage: signal.aborted && hadValidVideo ? null : msg,
    });
  }
}
