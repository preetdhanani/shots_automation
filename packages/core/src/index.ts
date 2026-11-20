export { findWorkspaceRoot, loadEnv, reloadDotEnv, type AppEnv } from './config/env.js';

export { computeNarrationHash, computeStoryboardVisualHash } from './schemas/hashes.js';

export {
  assembleInstagramCaption,
  CONTENT_PILLARS,
  countWords,
  PILLAR_LABELS,
  PillarSchema,
  ReelSceneSchema,
  ReelStoryboardSchema,
  validateStoryboardEditorial,
  VOICE_NAMES,
  VOICE_PROFILES,
  VoiceNameSchema,
  type AiMediaClipScene,
  type BenchmarkBarsScene,
  type CodeCompareScene,
  type ContentPillar,
  type EditorialCheckResult,
  type HookTitleScene,
  type NewsQuoteCardScene,
  type ReelScene,
  type ReelStoryboard,
  type TakeawayCtaScene,
  type TerminalDemoScene,
  type VoiceName,
} from './schemas/storyboard.js';

export {
  CaptionTokenSchema,
  ReelCaptionsFileSchema,
  SceneTimingSchema,
  VideoSpecReportSchema,
  type CaptionToken,
  type ReelCaptionsFile,
  type SceneTiming,
  type VideoSpecReport,
} from './schemas/media.js';

export {
  isLoopbackUrl,
  LLM_ENDPOINT_PRESETS,
  LLM_ENDPOINT_SOURCES,
  LLM_PROVIDERS,
  LlmEndpointPublicSchema,
  LlmEndpointSourceSchema,
  LlmProviderSchema,
  maskApiKey,
  normalizeOpenAIBaseUrl,
  RESERVED_LLM_ENDPOINT_IDS,
  validateApiKeyValue,
  type LlmEndpointPreset,
  type LlmEndpointPublicDto,
  type LlmEndpointSource,
  type LlmProvider,
} from './schemas/llm.js';

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

export { assertSafePublicUrl, isPrivateOrReservedIp, safeFetchText } from './discovery/ssrf.js';
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
  convertFlatGeminiResponseToStoryboard,
  GEMINI_STORYBOARD_JSON_SCHEMA,
  normalizeRawStoryboardPayload,
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
  appendChannelOutroScene,
  CHANNEL_OUTRO_NARRATION,
  createChannelOutroScene,
  generateStoryboard,
  generateStoryboardWithGemini,
  type GenerateStoryboardInput,
} from './generation/scriptGenerator.js';
export {
  getOrCreateVoicePreview,
  getVoicePreviewHash,
  synthesizeSampleVoiceMacOS,
  synthesizeVoiceWithGemini,
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
  buildDeliveryFfmpegArgs,
  checkFfmpegAvailability,
  detectGeminiAudioInput,
  encodeDeliveryReel,
  extractCoverFrame,
  getAudioDurationMs,
  prepareNormalizedVoicePair,
  probeVideo,
  verifyInstagramReelSpec,
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
  type OrchestratorDeps,
  type RenderVideoCallback,
} from './pipeline/orchestrator.js';
