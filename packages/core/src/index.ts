export { findWorkspaceRoot, loadEnv, reloadDotEnv, type AppEnv } from './config/env.js';

export { computeNarrationHash, computeStoryboardVisualHash } from './schemas/hashes.js';

export * from './shared.js';

export {
  computeStaleness,
  SqliteStore,
  type AlignmentMode,
  type AppSettings,
  type CreateLlmEndpointInput,
  type CreateReelInput,
  type CreateTopicInput,
  type LlmEndpointRecord,
  type PipelineLogEntry,
  type PipelineRunRecord,
  type PipelineRunStatus,
  type PipelineTrigger,
  type PublishAttemptRecord,
  type PublishAttemptState,
  type ReelRecord,
  type ReelStaleness,
  type ReelStatus,
  type Store,
  type TopicRecord,
  type TopicStatus,
  type UpdateLlmEndpointInput,
  type UpdateReelInput,
  type WorkerSource,
} from './db/store.js';

export { assertSafeId, LocalAssetStorage } from './storage/assets.js';

export {
  assertSafePublicUrl,
  isPrivateOrReservedIp,
  safeFetchBuffer,
  safeFetchText,
  type SafeFetchOptions,
} from './discovery/ssrf.js';
export {
  canonicalizeUrl,
  classifyPillar,
  computeTopicFingerprint,
  hashCanonicalUrl,
  isNearDuplicateTitle,
  jaccardSimilarity,
  scoreTopicCandidate,
  tokenizeTitle,
} from './discovery/dedupe.js';
export {
  fetchAndStoreTopics,
  parseFeedXml,
  parseGithubReleases,
  parseHackerNewsHits,
  type FetchTopicsResult,
  type SourceFetchSummary,
} from './discovery/fetcher.js';
export { createCustomTopic, type CustomTopicInput } from './discovery/customTopic.js';
export { GITHUB_RELEASE_SOURCES, RSS_SOURCES } from './discovery/sources.js';

export { checkGeminiHealth, type GeminiHealthResult } from './generation/geminiClient.js';
export {
  buildGeminiStoryboardJsonSchema,
  convertFlatGeminiResponseToStoryboard,
  GEMINI_STORYBOARD_JSON_SCHEMA,
  normalizeRawStoryboardPayload,
  toFlatStoryboardPayload,
} from './generation/geminiSchema.js';
export {
  getDefaultAppSettingsFromEnv,
  resolveActiveLlmEndpoint,
  resolveAllLlmEndpoints,
  toPublicLlmEndpoint,
  type ResolvedLlmEndpoint,
} from './generation/llmRegistry.js';
export {
  callOpenAICompatibleStoryboard,
  checkOpenAICompatibleHealth,
  extractJsonFromLlmText,
  fetchOpenAICompatibleModels,
  type LlmHealthResult,
} from './generation/openaiCompatibleClient.js';
export {
  generateStoryboard,
  generateStoryboardWithGemini,
  type GenerateStoryboardInput,
} from './generation/scriptGenerator.js';
export {
  generateVeoBrollClip,
  type GenerateBrollOptions,
  type GenerateBrollResult,
  type VeoClientLike,
} from './generation/broll.js';
export {
  getOrCreateVoicePreview,
  getVoicePreviewHash,
  synthesizeSampleVoiceMacOS,
  synthesizeVoiceWithGemini,
  type SynthesizedVoiceResult,
} from './generation/tts.js';
export {
  detectWhisperCliPath,
  ensureWhisperModelDownloaded,
  getWhisperDownloadProgress,
  getWhisperModelPath,
  getWhisperSetupStatus,
  subscribeWhisperProgress,
  type WhisperDownloadProgress,
  type WhisperSetupStatus,
} from './generation/whisperSetup.js';
export {
  alignStoryboardWithWhisperAnchors,
  extractWhisperWordAnchors,
  normalizeSpokenWord,
  runWhisperAndAlign,
  type RawWhisperJson,
  type WhisperWordAnchor,
} from './generation/aligner.js';

export { ensureGeneratedAudioAssets } from './media/audioAssets.js';
export {
  buildSfxCuesForStoryboard,
  ensureMusicAndSfxLibrary,
  resolveMusicTrackForMood,
  RISER_DURATION_MS,
  type AudioSfxCue,
  type GeneratedAudioLibrary,
} from './media/musicLibrary.js';
export {
  extractSocialImageUrl,
  fetchSourceVisual,
  type FetchSourceVisualOptions,
} from './media/sourceVisuals.js';
export {
  buildDeliveryFfmpegArgs,
  checkFfmpegAvailability,
  detectGeminiAudioInput,
  encodeDeliveryReel,
  extractCoverFrame,
  getAudioDurationMs,
  prepareNormalizedVoicePair,
  probeVideo,
  verifyInstagramReelSpec,
  type DeliveryEncodeOptions,
} from './media/ffmpeg.js';
export { runSubprocess, SubprocessCancelledError } from './media/subprocess.js';

export {
  checkMetaHealth,
  exchangeShortLivedToken,
  REQUIRED_META_PERMISSIONS,
} from './publish/metaAuth.js';
export { InstagramGraphPublisher, MetaPublishError } from './publish/instagram.js';
export type {
  MetaHealthStatus,
  PublishProgressFn,
  PublishResult,
  SocialPublisher,
} from './publish/publisher.js';

export { SAMPLE_DEMO_STORYBOARD } from './pipeline/sampleFixture.js';
export { PipelineQueue, type RunStreamEvent } from './pipeline/queue.js';
export {
  ReelOrchestrator,
  type FetchSourceVisualFn,
  type GenerateBrollFn,
  type OrchestratorDeps,
  type RenderVideoCallback,
  type SynthesizeVoiceFn,
} from './pipeline/orchestrator.js';
