import type {
  ContentPillar,
  LlmEndpointPublicDto,
  LlmProvider,
  ReelStoryboard,
  SceneTiming,
  VideoSpecReport,
  VoiceName,
} from '@post/core/shared';

export type TopicStatus = 'NEW' | 'USED' | 'DISMISSED';
export type ReelStatus =
  'DRAFT' | 'GENERATING' | 'READY_FOR_REVIEW' | 'PUBLISHING' | 'PUBLISHED' | 'REJECTED' | 'FAILED';
export type PipelineRunStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
export type PipelineTrigger =
  'manual' | 'daily_cli' | 'sample' | 'rerender' | 'regenerate_audio' | 'publish';

export interface TopicDto {
  id: string;
  pillar: ContentPillar;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  score: number;
  status: TopicStatus;
  createdAt: string;
}

export interface ReelStaleness {
  visualsDirty: boolean;
  audioDirty: boolean;
}

export interface ReelDto {
  id: string;
  topicId: string | null;
  isSample: boolean;
  pillar: ContentPillar;
  status: ReelStatus;
  title: string;
  storyboard: ReelStoryboard;
  caption: string;
  hashtags: string[];
  voiceName: VoiceName;
  musicEnabled: boolean;
  renderedNarrationHash: string | null;
  renderedVoiceName: VoiceName | null;
  renderedStoryboardHash: string | null;
  alignmentMode: 'whisper' | 'estimated' | null;
  audioDurationMs: number | null;
  videoPath: string | null;
  coverPath: string | null;
  ffprobeJson: string | null;
  instagramMediaId: string | null;
  instagramPermalink: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  staleness?: ReelStaleness;
}

export interface PublishAttemptDto {
  id: string;
  reelId: string;
  platform: 'instagram';
  state: 'INITIATED' | 'UPLOADED' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';
  containerId: string | null;
  uploadUri: string | null;
  remoteMediaId: string | null;
  errorCode: string | null;
  errorSubcode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineLogDto {
  ts: string;
  step: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface PipelineRunDto {
  id: string;
  reelId: string | null;
  reelTitle?: string | null;
  trigger: PipelineTrigger;
  workerSource: 'server' | 'cli';
  workerPid: number | null;
  currentStep: string;
  progressPct: number;
  status: PipelineRunStatus;
  logs: PipelineLogDto[];
  startedAt: string;
  finishedAt: string | null;
}

export interface AppSettingsDto {
  defaultVoice: VoiceName;
  brandHandle: string;
  musicEnabled: boolean;
  musicVolumeDb: number;
  activeLlmEndpointId: string | null;
}

export type LlmEndpointDto = LlmEndpointPublicDto;

export interface LlmStateDto {
  activeEndpointId: string;
  activeEndpoint: LlmEndpointDto;
  endpoints: LlmEndpointDto[];
  scriptLlmReady: boolean;
  ttsReady: boolean;
}

export interface LlmCheckDto {
  configured: boolean;
  ok: boolean;
  provider: LlmProvider;
  endpointId: string;
  name: string;
  model: string;
  baseUrl?: string;
  availableModels?: string[];
  ttsModel?: string;
  message: string;
}

export interface LlmModelsDto {
  ok: boolean;
  models: string[];
  baseUrl: string;
  message: string;
}

export interface WhisperStatusDto {
  cliAvailable: boolean;
  cliPath: string | null;
  modelAvailable: boolean;
  modelPath: string;
  downloading: boolean;
  downloadedBytes: number;
  totalBytes: number;
  progressPct: number;
  error: string | null;
}

export interface HealthDto {
  ok: boolean;
  geminiConfigured: boolean;
  geminiTextModel: string;
  geminiTtsModel: string;
  searchGroundingEnabled: boolean;
  metaConfigured: boolean;
  metaVersion: string;
  ffmpeg: { ffmpegOk: boolean; ffprobeOk: boolean; ffmpegVersion: string | null };
  whisper: WhisperStatusDto;
  activeRunCount: number;
  pendingReviewCount: number;
  settings: AppSettingsDto;
  llm: LlmStateDto;
}

export interface GeminiCheckDto {
  configured: boolean;
  ok: boolean;
  textModel: string;
  ttsModel: string;
  message: string;
}

export interface MetaCheckDto {
  configured: boolean;
  ok: boolean;
  version: string;
  igUserId: string | null;
  username: string | null;
  name: string | null;
  tokenType: 'system_user_or_non_expiring' | 'user_long_lived' | 'unknown';
  expiresAt: string | null;
  daysRemaining: number | null;
  scopes: string[];
  missingPermissions: string[];
  quotaUsed: number | null;
  quotaTotal: number | null;
  message: string;
}

export interface ReelDetailDto {
  reel: ReelDto;
  topic: TopicDto | null;
  sceneTimings: SceneTiming[];
  publishAttempts: PublishAttemptDto[];
  activeRun: PipelineRunDto | null;
  latestRun: PipelineRunDto | null;
  staleness: ReelStaleness;
}

export interface PublishResultDto {
  dryRun: boolean;
  published: boolean;
  reel: ReelDto;
  specReport: VideoSpecReport;
  assembledCaptionLength: number;
  warnings: string[];
  message: string;
}

export function formatErrorMessage(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { message?: unknown; status?: unknown };
        message?: unknown;
      };
      if (typeof parsed.error?.message === 'string' && parsed.error.message.trim()) {
        const status =
          typeof parsed.error.status === 'string' ? ` (${parsed.error.status})` : '';
        return `${parsed.error.message.trim()}${status}`;
      }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Fall through to raw string
    }
  }
  return trimmed;
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Post-CSRF', '1');
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (init.body === undefined) {
      init.body = '{}';
    }
  }

  const res = await fetch(url, { ...init, method, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed with HTTP ${res.status}`);
  }
  return data;
}

// Single-channel voice preview manager so overlapping clips never play together
let activePreviewAudio: HTMLAudioElement | null = null;
let activeVoiceChangeCb: ((voice: VoiceName | null) => void) | null = null;

export function stopVoicePreview(): void {
  if (activePreviewAudio) {
    activePreviewAudio.pause();
    activePreviewAudio.src = '';
    activePreviewAudio = null;
  }
  activeVoiceChangeCb?.(null);
}

export async function playVoicePreview(
  voiceName: VoiceName,
  onActiveChange: (voice: VoiceName | null) => void,
): Promise<void> {
  stopVoicePreview();
  activeVoiceChangeCb = onActiveChange;
  onActiveChange(voiceName);

  const res = await apiFetch<{ url: string; cached: boolean }>('/api/tts/preview', {
    method: 'POST',
    body: JSON.stringify({ voiceName }),
  });

  const audio = new Audio(`${res.url}?t=${Date.now()}`);
  activePreviewAudio = audio;
  audio.addEventListener('ended', () => {
    if (activePreviewAudio === audio) {
      activePreviewAudio = null;
      onActiveChange(null);
    }
  });
  audio.addEventListener('error', () => {
    if (activePreviewAudio === audio) {
      activePreviewAudio = null;
      onActiveChange(null);
    }
  });
  await audio.play();
}
