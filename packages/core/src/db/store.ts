import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  ReelStoryboardSchema,
  type ContentPillar,
  type ReelStoryboard,
  type VoiceName,
} from '../schemas/storyboard.js';
import {
  normalizeOpenAIBaseUrl,
  RESERVED_LLM_ENDPOINT_IDS,
  validateApiKeyValue,
} from '../schemas/llm.js';
import { computeNarrationHash, computeStoryboardVisualHash } from '../schemas/hashes.js';

export type TopicStatus = 'NEW' | 'USED' | 'DISMISSED';
export type ReelStatus =
  'DRAFT' | 'GENERATING' | 'READY_FOR_REVIEW' | 'PUBLISHING' | 'PUBLISHED' | 'REJECTED' | 'FAILED';
export type PublishAttemptState = 'INITIATED' | 'UPLOADED' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';
export type PipelineTrigger =
  'manual' | 'daily_cli' | 'sample' | 'rerender' | 'regenerate_audio' | 'publish';
export type PipelineRunStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
export type WorkerSource = 'server' | 'cli';
export type AlignmentMode = 'whisper' | 'estimated';

export interface TopicRecord {
  id: string;
  pillar: ContentPillar;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrlHash: string;
  topicFingerprint: string;
  publishedAt: string;
  score: number;
  rawPayloadJson: string;
  status: TopicStatus;
  createdAt: string;
}

export interface ReelRecord {
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
  alignmentMode: AlignmentMode | null;
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
}

export interface PublishAttemptRecord {
  id: string;
  reelId: string;
  platform: 'instagram';
  state: PublishAttemptState;
  containerId: string | null;
  uploadUri: string | null;
  remoteMediaId: string | null;
  errorCode: string | null;
  errorSubcode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineLogEntry {
  ts: string;
  step: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface PipelineRunRecord {
  id: string;
  reelId: string | null;
  trigger: PipelineTrigger;
  workerSource: WorkerSource;
  workerPid: number | null;
  currentStep: string;
  progressPct: number;
  status: PipelineRunStatus;
  logs: PipelineLogEntry[];
  startedAt: string;
  finishedAt: string | null;
}

export interface AppSettings {
  defaultVoice: VoiceName;
  brandHandle: string;
  musicEnabled: boolean;
  musicVolumeDb: number;
  activeLlmEndpointId: string | null;
  aiBrollEnabled: boolean;
  voiceRotation: boolean;
}

export interface LlmEndpointRecord {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLlmEndpointInput {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface UpdateLlmEndpointInput {
  name?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface ReelStaleness {
  visualsDirty: boolean;
  audioDirty: boolean;
}

export interface CreateTopicInput {
  id?: string;
  pillar: ContentPillar;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrlHash: string;
  topicFingerprint: string;
  publishedAt: string;
  score: number;
  rawPayloadJson: string;
  status?: TopicStatus;
}

export interface CreateReelInput {
  id?: string;
  topicId: string | null;
  isSample?: boolean;
  pillar: ContentPillar;
  status: ReelStatus;
  title: string;
  storyboard: ReelStoryboard;
  caption: string;
  hashtags: string[];
  voiceName: VoiceName;
  musicEnabled?: boolean;
}

export interface UpdateReelInput {
  status?: ReelStatus;
  title?: string;
  pillar?: ContentPillar;
  storyboard?: ReelStoryboard;
  caption?: string;
  hashtags?: string[];
  voiceName?: VoiceName;
  musicEnabled?: boolean;
  renderedNarrationHash?: string | null;
  renderedVoiceName?: VoiceName | null;
  renderedStoryboardHash?: string | null;
  alignmentMode?: AlignmentMode | null;
  audioDurationMs?: number | null;
  videoPath?: string | null;
  coverPath?: string | null;
  ffprobeJson?: string | null;
  instagramMediaId?: string | null;
  instagramPermalink?: string | null;
  errorMessage?: string | null;
  publishedAt?: string | null;
}

export interface Store {
  close(): void;
  listTopics(opts?: {
    pillar?: ContentPillar;
    status?: TopicStatus;
    limit?: number;
  }): TopicRecord[];
  getTopic(id: string): TopicRecord | null;
  findTopicByUrlHash(hash: string): TopicRecord | null;
  upsertTopics(items: CreateTopicInput[]): {
    inserted: number;
    skipped: number;
    topics: TopicRecord[];
  };
  createTopic(input: CreateTopicInput): TopicRecord;
  updateTopicStatus(id: string, status: TopicStatus): TopicRecord | null;
  countTopicsSinceByPillar(sinceIso: string): Record<ContentPillar, number>;
  countReelsByPillarSince(sinceIso: string): Record<ContentPillar, number>;

  listReels(opts?: { statuses?: ReelStatus[]; limit?: number }): ReelRecord[];
  listRecentReelsForVariety(limit?: number): ReelRecord[];
  getReel(id: string): ReelRecord | null;
  createReel(input: CreateReelInput): ReelRecord;
  updateReel(id: string, input: UpdateReelInput): ReelRecord | null;
  deleteReel(id: string): boolean;
  claimReelForPublish(id: string): boolean;

  listPublishAttempts(reelId: string): PublishAttemptRecord[];
  getLatestPublishAttempt(reelId: string): PublishAttemptRecord | null;
  createPublishAttempt(input: {
    reelId: string;
    state?: PublishAttemptState;
    containerId?: string | null;
    uploadUri?: string | null;
  }): PublishAttemptRecord;
  updatePublishAttempt(
    id: string,
    patch: Partial<{
      state: PublishAttemptState;
      containerId: string | null;
      uploadUri: string | null;
      remoteMediaId: string | null;
      errorCode: string | null;
      errorSubcode: string | null;
      errorMessage: string | null;
    }>,
  ): PublishAttemptRecord | null;

  createPipelineRun(input: {
    id?: string;
    reelId: string | null;
    trigger: PipelineTrigger;
    workerSource: WorkerSource;
    workerPid: number | null;
    currentStep?: string;
    status?: PipelineRunStatus;
  }): PipelineRunRecord;
  getPipelineRun(id: string): PipelineRunRecord | null;
  listActivePipelineRuns(): PipelineRunRecord[];
  listPipelineRuns(limit?: number): PipelineRunRecord[];
  getLatestRunForReel(reelId: string): PipelineRunRecord | null;
  updatePipelineRun(
    id: string,
    patch: Partial<{
      reelId: string | null;
      currentStep: string;
      progressPct: number;
      status: PipelineRunStatus;
      finishedAt: string | null;
    }>,
    appendLog?: PipelineLogEntry,
  ): PipelineRunRecord | null;

  getSettings(defaults: AppSettings): AppSettings;
  updateSettings(patch: Partial<AppSettings>, defaults: AppSettings): AppSettings;

  listLlmEndpoints(): LlmEndpointRecord[];
  getLlmEndpoint(id: string): LlmEndpointRecord | null;
  createLlmEndpoint(input: CreateLlmEndpointInput): LlmEndpointRecord;
  updateLlmEndpoint(id: string, patch: UpdateLlmEndpointInput): LlmEndpointRecord | null;
  deleteLlmEndpoint(id: string): boolean;

  reconcileBootState(hasValidVideo: (reel: ReelRecord) => boolean): {
    failedRuns: string[];
    recoveredGeneratingReels: string[];
    pendingPublishingReels: ReelRecord[];
  };
}

export function computeStaleness(reel: ReelRecord, brandHandle: string): ReelStaleness {
  if (!reel.renderedStoryboardHash || !reel.renderedNarrationHash || !reel.renderedVoiceName) {
    return { visualsDirty: false, audioDirty: false };
  }
  const currentNarrationHash = computeNarrationHash(reel.storyboard);
  const currentVisualHash = computeStoryboardVisualHash(
    reel.storyboard,
    reel.musicEnabled,
    brandHandle,
  );
  const audioDirty =
    currentNarrationHash !== reel.renderedNarrationHash ||
    reel.voiceName !== reel.renderedVoiceName;
  const visualsDirty = audioDirty || currentVisualHash !== reel.renderedStoryboardHash;
  return { visualsDirty, audioDirty };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isPidAlive(pid: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

export class SqliteStore implements Store {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.migrate();
    if (dbPath !== ':memory:') {
      try {
        fs.chmodSync(dbPath, 0o600);
      } catch {
        // Ignore permission adjustments on unsupported filesystems
      }
    }
  }

  close(): void {
    this.db.close();
  }

  private withImmediateTx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback errors if transaction already closed
      }
      throw error;
    }
  }

  private migrate(): void {
    this.withImmediateTx(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
      `);

      const row = this.db
        .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
        .get() as { v: number };

      if (row.v < 1) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            pillar TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_url TEXT NOT NULL,
            canonical_url_hash TEXT NOT NULL UNIQUE,
            topic_fingerprint TEXT NOT NULL,
            published_at TEXT NOT NULL,
            score REAL NOT NULL,
            raw_payload_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'NEW',
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_topics_status_score ON topics(status, score DESC);
          CREATE INDEX IF NOT EXISTS idx_topics_fingerprint ON topics(topic_fingerprint);

          CREATE TABLE IF NOT EXISTS reels (
            id TEXT PRIMARY KEY,
            topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
            is_sample INTEGER NOT NULL DEFAULT 0,
            pillar TEXT NOT NULL,
            status TEXT NOT NULL,
            title TEXT NOT NULL,
            storyboard_json TEXT NOT NULL,
            caption TEXT NOT NULL,
            hashtags_json TEXT NOT NULL,
            voice_name TEXT NOT NULL,
            music_enabled INTEGER NOT NULL DEFAULT 1,
            rendered_narration_hash TEXT,
            rendered_voice_name TEXT,
            rendered_storyboard_hash TEXT,
            alignment_mode TEXT,
            audio_duration_ms INTEGER,
            video_path TEXT,
            cover_path TEXT,
            ffprobe_json TEXT,
            instagram_media_id TEXT,
            instagram_permalink TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            published_at TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_reels_status_updated ON reels(status, updated_at DESC);

          CREATE TABLE IF NOT EXISTS publish_attempts (
            id TEXT PRIMARY KEY,
            reel_id TEXT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
            platform TEXT NOT NULL,
            state TEXT NOT NULL,
            container_id TEXT,
            upload_uri TEXT,
            remote_media_id TEXT,
            error_code TEXT,
            error_subcode TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_publish_attempts_reel ON publish_attempts(reel_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS pipeline_runs (
            id TEXT PRIMARY KEY,
            reel_id TEXT REFERENCES reels(id) ON DELETE CASCADE,
            trigger TEXT NOT NULL,
            worker_source TEXT NOT NULL,
            worker_pid INTEGER,
            current_step TEXT NOT NULL,
            progress_pct INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            logs_json TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL,
            finished_at TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_runs_status ON pipeline_runs(status, started_at ASC);
          CREATE INDEX IF NOT EXISTS idx_runs_reel ON pipeline_runs(reel_id, started_at DESC);

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        this.db
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(1, nowIso());
      }

      if (row.v < 2) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS llm_endpoints (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        this.db
          .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(2, nowIso());
      }
    });
  }

  private mapTopicRow(row: Record<string, unknown>): TopicRecord {
    return {
      id: String(row.id),
      pillar: row.pillar as ContentPillar,
      title: String(row.title),
      summary: String(row.summary),
      sourceName: String(row.source_name),
      sourceUrl: String(row.source_url),
      canonicalUrlHash: String(row.canonical_url_hash),
      topicFingerprint: String(row.topic_fingerprint),
      publishedAt: String(row.published_at),
      score: Number(row.score),
      rawPayloadJson: String(row.raw_payload_json),
      status: row.status as TopicStatus,
      createdAt: String(row.created_at),
    };
  }

  private mapReelRow(row: Record<string, unknown>): ReelRecord {
    const storyboardRaw = JSON.parse(String(row.storyboard_json));
    const storyboard = ReelStoryboardSchema.parse(storyboardRaw);
    const hashtags = JSON.parse(String(row.hashtags_json)) as string[];

    return {
      id: String(row.id),
      topicId: row.topic_id == null ? null : String(row.topic_id),
      isSample: Number(row.is_sample) === 1,
      pillar: row.pillar as ContentPillar,
      status: row.status as ReelStatus,
      title: String(row.title),
      storyboard,
      caption: String(row.caption),
      hashtags,
      voiceName: row.voice_name as VoiceName,
      musicEnabled: Number(row.music_enabled) === 1,
      renderedNarrationHash:
        row.rendered_narration_hash == null ? null : String(row.rendered_narration_hash),
      renderedVoiceName:
        row.rendered_voice_name == null ? null : (String(row.rendered_voice_name) as VoiceName),
      renderedStoryboardHash:
        row.rendered_storyboard_hash == null ? null : String(row.rendered_storyboard_hash),
      alignmentMode:
        row.alignment_mode == null ? null : (String(row.alignment_mode) as AlignmentMode),
      audioDurationMs: row.audio_duration_ms == null ? null : Number(row.audio_duration_ms),
      videoPath: row.video_path == null ? null : String(row.video_path),
      coverPath: row.cover_path == null ? null : String(row.cover_path),
      ffprobeJson: row.ffprobe_json == null ? null : String(row.ffprobe_json),
      instagramMediaId: row.instagram_media_id == null ? null : String(row.instagram_media_id),
      instagramPermalink: row.instagram_permalink == null ? null : String(row.instagram_permalink),
      errorMessage: row.error_message == null ? null : String(row.error_message),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      publishedAt: row.published_at == null ? null : String(row.published_at),
    };
  }

  private mapPublishAttemptRow(row: Record<string, unknown>): PublishAttemptRecord {
    return {
      id: String(row.id),
      reelId: String(row.reel_id),
      platform: 'instagram',
      state: row.state as PublishAttemptState,
      containerId: row.container_id == null ? null : String(row.container_id),
      uploadUri: row.upload_uri == null ? null : String(row.upload_uri),
      remoteMediaId: row.remote_media_id == null ? null : String(row.remote_media_id),
      errorCode: row.error_code == null ? null : String(row.error_code),
      errorSubcode: row.error_subcode == null ? null : String(row.error_subcode),
      errorMessage: row.error_message == null ? null : String(row.error_message),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapPipelineRunRow(row: Record<string, unknown>): PipelineRunRecord {
    return {
      id: String(row.id),
      reelId: row.reel_id == null ? null : String(row.reel_id),
      trigger: row.trigger as PipelineTrigger,
      workerSource: row.worker_source as WorkerSource,
      workerPid: row.worker_pid == null ? null : Number(row.worker_pid),
      currentStep: String(row.current_step),
      progressPct: Number(row.progress_pct),
      status: row.status as PipelineRunStatus,
      logs: JSON.parse(String(row.logs_json)) as PipelineLogEntry[],
      startedAt: String(row.started_at),
      finishedAt: row.finished_at == null ? null : String(row.finished_at),
    };
  }

  listTopics(
    opts: { pillar?: ContentPillar; status?: TopicStatus; limit?: number } = {},
  ): TopicRecord[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (opts.pillar) {
      clauses.push('pillar = ?');
      params.push(opts.pillar);
    }
    if (opts.status) {
      clauses.push('status = ?');
      params.push(opts.status);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = opts.limit ?? 100;
    params.push(limit);
    const rows = this.db
      .prepare(`SELECT * FROM topics ${where} ORDER BY score DESC, created_at DESC LIMIT ?`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapTopicRow(r));
  }

  getTopic(id: string): TopicRecord | null {
    const row = this.db.prepare('SELECT * FROM topics WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    return row ? this.mapTopicRow(row) : null;
  }

  findTopicByUrlHash(hash: string): TopicRecord | null {
    const row = this.db.prepare('SELECT * FROM topics WHERE canonical_url_hash = ?').get(hash) as
      Record<string, unknown> | undefined;
    return row ? this.mapTopicRow(row) : null;
  }

  upsertTopics(items: CreateTopicInput[]): {
    inserted: number;
    skipped: number;
    topics: TopicRecord[];
  } {
    return this.withImmediateTx(() => {
      let inserted = 0;
      let skipped = 0;
      const insertedTopics: TopicRecord[] = [];
      const stmt = this.db.prepare(`
        INSERT INTO topics (
          id, pillar, title, summary, source_name, source_url,
          canonical_url_hash, topic_fingerprint, published_at, score,
          raw_payload_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canonical_url_hash) DO NOTHING
      `);
      const now = nowIso();
      for (const item of items) {
        const id = item.id ?? `top_${randomUUID().slice(0, 12)}`;
        const info = stmt.run(
          id,
          item.pillar,
          item.title,
          item.summary,
          item.sourceName,
          item.sourceUrl,
          item.canonicalUrlHash,
          item.topicFingerprint,
          item.publishedAt,
          item.score,
          item.rawPayloadJson,
          item.status ?? 'NEW',
          now,
        );
        if (info.changes > 0) {
          inserted++;
          const created = this.getTopic(id);
          if (created) insertedTopics.push(created);
        } else {
          skipped++;
        }
      }
      return { inserted, skipped, topics: insertedTopics };
    });
  }

  createTopic(input: CreateTopicInput): TopicRecord {
    return this.withImmediateTx(() => {
      const id = input.id ?? `top_${randomUUID().slice(0, 12)}`;
      const now = nowIso();
      this.db
        .prepare(
          `INSERT INTO topics (
            id, pillar, title, summary, source_name, source_url,
            canonical_url_hash, topic_fingerprint, published_at, score,
            raw_payload_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.pillar,
          input.title,
          input.summary,
          input.sourceName,
          input.sourceUrl,
          input.canonicalUrlHash,
          input.topicFingerprint,
          input.publishedAt,
          input.score,
          input.rawPayloadJson,
          input.status ?? 'NEW',
          now,
        );
      return this.getTopic(id)!;
    });
  }

  updateTopicStatus(id: string, status: TopicStatus): TopicRecord | null {
    return this.withImmediateTx(() => {
      const info = this.db.prepare('UPDATE topics SET status = ? WHERE id = ?').run(status, id);
      if (info.changes === 0) return null;
      return this.getTopic(id);
    });
  }

  countTopicsSinceByPillar(sinceIso: string): Record<ContentPillar, number> {
    const counts: Record<ContentPillar, number> = {
      ai_news: 0,
      benchmarks: 0,
      harnesses: 0,
      coding_practices: 0,
      vibe_coding: 0,
    };
    const rows = this.db
      .prepare('SELECT pillar, COUNT(*) AS cnt FROM topics WHERE created_at >= ? GROUP BY pillar')
      .all(sinceIso) as Array<{ pillar: ContentPillar; cnt: number }>;
    for (const r of rows) {
      if (r.pillar in counts) counts[r.pillar] = Number(r.cnt);
    }
    return counts;
  }

  countReelsByPillarSince(sinceIso: string): Record<ContentPillar, number> {
    const counts: Record<ContentPillar, number> = {
      ai_news: 0,
      benchmarks: 0,
      harnesses: 0,
      coding_practices: 0,
      vibe_coding: 0,
    };
    const rows = this.db
      .prepare(
        "SELECT pillar, COUNT(*) AS cnt FROM reels WHERE created_at >= ? AND status != 'REJECTED' GROUP BY pillar",
      )
      .all(sinceIso) as Array<{ pillar: ContentPillar; cnt: number }>;
    for (const r of rows) {
      if (r.pillar in counts) counts[r.pillar] = Number(r.cnt);
    }
    return counts;
  }

  listReels(opts: { statuses?: ReelStatus[]; limit?: number } = {}): ReelRecord[] {
    const params: (string | number)[] = [];
    let where = '';
    if (opts.statuses && opts.statuses.length > 0) {
      const placeholders = opts.statuses.map(() => '?').join(', ');
      where = `WHERE status IN (${placeholders})`;
      params.push(...opts.statuses);
    }
    params.push(opts.limit ?? 100);
    const rows = this.db
      .prepare(`SELECT * FROM reels ${where} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapReelRow(r));
  }

  listRecentReelsForVariety(limit = 12): ReelRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM reels
         WHERE is_sample = 0 AND status NOT IN ('FAILED', 'REJECTED')
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapReelRow(r));
  }

  getReel(id: string): ReelRecord | null {
    const row = this.db.prepare('SELECT * FROM reels WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    return row ? this.mapReelRow(row) : null;
  }

  createReel(input: CreateReelInput): ReelRecord {
    return this.withImmediateTx(() => {
      const id = input.id ?? `reel_${randomUUID().slice(0, 12)}`;
      const now = nowIso();
      this.db
        .prepare(
          `INSERT INTO reels (
            id, topic_id, is_sample, pillar, status, title, storyboard_json,
            caption, hashtags_json, voice_name, music_enabled,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.topicId,
          input.isSample ? 1 : 0,
          input.pillar,
          input.status,
          input.title,
          JSON.stringify(input.storyboard),
          input.caption,
          JSON.stringify(input.hashtags),
          input.voiceName,
          input.musicEnabled === false ? 0 : 1,
          now,
          now,
        );
      return this.getReel(id)!;
    });
  }

  updateReel(id: string, input: UpdateReelInput): ReelRecord | null {
    return this.withImmediateTx(() => {
      const sets: string[] = [];
      const params: (string | number | null)[] = [];

      const push = (col: string, val: string | number | null) => {
        sets.push(`${col} = ?`);
        params.push(val);
      };

      if (input.status !== undefined) push('status', input.status);
      if (input.title !== undefined) push('title', input.title);
      if (input.pillar !== undefined) push('pillar', input.pillar);
      if (input.storyboard !== undefined) push('storyboard_json', JSON.stringify(input.storyboard));
      if (input.caption !== undefined) push('caption', input.caption);
      if (input.hashtags !== undefined) push('hashtags_json', JSON.stringify(input.hashtags));
      if (input.voiceName !== undefined) push('voice_name', input.voiceName);
      if (input.musicEnabled !== undefined) push('music_enabled', input.musicEnabled ? 1 : 0);
      if (input.renderedNarrationHash !== undefined)
        push('rendered_narration_hash', input.renderedNarrationHash);
      if (input.renderedVoiceName !== undefined)
        push('rendered_voice_name', input.renderedVoiceName);
      if (input.renderedStoryboardHash !== undefined)
        push('rendered_storyboard_hash', input.renderedStoryboardHash);
      if (input.alignmentMode !== undefined) push('alignment_mode', input.alignmentMode);
      if (input.audioDurationMs !== undefined) push('audio_duration_ms', input.audioDurationMs);
      if (input.videoPath !== undefined) push('video_path', input.videoPath);
      if (input.coverPath !== undefined) push('cover_path', input.coverPath);
      if (input.ffprobeJson !== undefined) push('ffprobe_json', input.ffprobeJson);
      if (input.instagramMediaId !== undefined) push('instagram_media_id', input.instagramMediaId);
      if (input.instagramPermalink !== undefined)
        push('instagram_permalink', input.instagramPermalink);
      if (input.errorMessage !== undefined) push('error_message', input.errorMessage);
      if (input.publishedAt !== undefined) push('published_at', input.publishedAt);

      if (sets.length === 0) return this.getReel(id);
      push('updated_at', nowIso());
      params.push(id);

      const info = this.db
        .prepare(`UPDATE reels SET ${sets.join(', ')} WHERE id = ?`)
        .run(...params);
      if (info.changes === 0) return null;
      return this.getReel(id);
    });
  }

  deleteReel(id: string): boolean {
    return this.withImmediateTx(() => {
      const info = this.db.prepare('DELETE FROM reels WHERE id = ?').run(id);
      return info.changes > 0;
    });
  }

  claimReelForPublish(id: string): boolean {
    return this.withImmediateTx(() => {
      const info = this.db
        .prepare(
          "UPDATE reels SET status = 'PUBLISHING', error_message = NULL, updated_at = ? WHERE id = ? AND status = 'READY_FOR_REVIEW' AND is_sample = 0",
        )
        .run(nowIso(), id);
      return info.changes === 1;
    });
  }

  listPublishAttempts(reelId: string): PublishAttemptRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM publish_attempts WHERE reel_id = ? ORDER BY created_at DESC')
      .all(reelId) as Record<string, unknown>[];
    return rows.map((r) => this.mapPublishAttemptRow(r));
  }

  getLatestPublishAttempt(reelId: string): PublishAttemptRecord | null {
    const row = this.db
      .prepare('SELECT * FROM publish_attempts WHERE reel_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(reelId) as Record<string, unknown> | undefined;
    return row ? this.mapPublishAttemptRow(row) : null;
  }

  createPublishAttempt(input: {
    reelId: string;
    state?: PublishAttemptState;
    containerId?: string | null;
    uploadUri?: string | null;
  }): PublishAttemptRecord {
    return this.withImmediateTx(() => {
      const id = `pub_${randomUUID().slice(0, 12)}`;
      const now = nowIso();
      this.db
        .prepare(
          `INSERT INTO publish_attempts (
            id, reel_id, platform, state, container_id, upload_uri, created_at, updated_at
          ) VALUES (?, ?, 'instagram', ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.reelId,
          input.state ?? 'INITIATED',
          input.containerId ?? null,
          input.uploadUri ?? null,
          now,
          now,
        );
      const row = this.db.prepare('SELECT * FROM publish_attempts WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      return this.mapPublishAttemptRow(row);
    });
  }

  updatePublishAttempt(
    id: string,
    patch: Partial<{
      state: PublishAttemptState;
      containerId: string | null;
      uploadUri: string | null;
      remoteMediaId: string | null;
      errorCode: string | null;
      errorSubcode: string | null;
      errorMessage: string | null;
    }>,
  ): PublishAttemptRecord | null {
    return this.withImmediateTx(() => {
      const sets: string[] = [];
      const params: (string | null)[] = [];
      const push = (col: string, val: string | null) => {
        sets.push(`${col} = ?`);
        params.push(val);
      };
      if (patch.state !== undefined) push('state', patch.state);
      if (patch.containerId !== undefined) push('container_id', patch.containerId);
      if (patch.uploadUri !== undefined) push('upload_uri', patch.uploadUri);
      if (patch.remoteMediaId !== undefined) push('remote_media_id', patch.remoteMediaId);
      if (patch.errorCode !== undefined) push('error_code', patch.errorCode);
      if (patch.errorSubcode !== undefined) push('error_subcode', patch.errorSubcode);
      if (patch.errorMessage !== undefined) push('error_message', patch.errorMessage);
      if (sets.length === 0) return null;
      push('updated_at', nowIso());
      params.push(id);
      const info = this.db
        .prepare(`UPDATE publish_attempts SET ${sets.join(', ')} WHERE id = ?`)
        .run(...params);
      if (info.changes === 0) return null;
      const row = this.db.prepare('SELECT * FROM publish_attempts WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      return this.mapPublishAttemptRow(row);
    });
  }

  createPipelineRun(input: {
    id?: string;
    reelId: string | null;
    trigger: PipelineTrigger;
    workerSource: WorkerSource;
    workerPid: number | null;
    currentStep?: string;
    status?: PipelineRunStatus;
  }): PipelineRunRecord {
    return this.withImmediateTx(() => {
      const id = input.id ?? `run_${randomUUID().slice(0, 12)}`;
      const now = nowIso();
      this.db
        .prepare(
          `INSERT INTO pipeline_runs (
            id, reel_id, trigger, worker_source, worker_pid, current_step,
            progress_pct, status, logs_json, started_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, '[]', ?)`,
        )
        .run(
          id,
          input.reelId,
          input.trigger,
          input.workerSource,
          input.workerPid,
          input.currentStep ?? 'queued',
          input.status ?? 'QUEUED',
          now,
        );
      return this.getPipelineRun(id)!;
    });
  }

  getPipelineRun(id: string): PipelineRunRecord | null {
    const row = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    return row ? this.mapPipelineRunRow(row) : null;
  }

  listActivePipelineRuns(): PipelineRunRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM pipeline_runs WHERE status IN ('QUEUED', 'RUNNING') ORDER BY started_at ASC",
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapPipelineRunRow(r));
  }

  listPipelineRuns(limit = 30): PipelineRunRecord[] {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = this.db
      .prepare('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?')
      .all(safeLimit) as Record<string, unknown>[];
    return rows.map((r) => this.mapPipelineRunRow(r));
  }

  getLatestRunForReel(reelId: string): PipelineRunRecord | null {
    const row = this.db
      .prepare('SELECT * FROM pipeline_runs WHERE reel_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(reelId) as Record<string, unknown> | undefined;
    return row ? this.mapPipelineRunRow(row) : null;
  }

  updatePipelineRun(
    id: string,
    patch: Partial<{
      reelId: string | null;
      currentStep: string;
      progressPct: number;
      status: PipelineRunStatus;
      finishedAt: string | null;
    }>,
    appendLog?: PipelineLogEntry,
  ): PipelineRunRecord | null {
    return this.withImmediateTx(() => {
      const current = this.getPipelineRun(id);
      if (!current) return null;

      const sets: string[] = [];
      const params: (string | number | null)[] = [];

      if (patch.reelId !== undefined) {
        sets.push('reel_id = ?');
        params.push(patch.reelId);
      }
      if (patch.currentStep !== undefined) {
        sets.push('current_step = ?');
        params.push(patch.currentStep);
      }
      if (patch.progressPct !== undefined) {
        sets.push('progress_pct = ?');
        params.push(Math.max(0, Math.min(100, Math.round(patch.progressPct))));
      }
      if (patch.status !== undefined) {
        sets.push('status = ?');
        params.push(patch.status);
      }
      if (patch.finishedAt !== undefined) {
        sets.push('finished_at = ?');
        params.push(patch.finishedAt);
      }
      if (appendLog) {
        const nextLogs = [...current.logs.slice(-199), appendLog];
        sets.push('logs_json = ?');
        params.push(JSON.stringify(nextLogs));
      }

      if (sets.length === 0) return current;
      params.push(id);
      this.db.prepare(`UPDATE pipeline_runs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return this.getPipelineRun(id);
    });
  }

  getSettings(defaults: AppSettings): AppSettings {
    const rows = this.db.prepare('SELECT key, value_json FROM settings').all() as Array<{
      key: string;
      value_json: string;
    }>;
    const map = new Map<string, unknown>();
    for (const r of rows) {
      try {
        map.set(r.key, JSON.parse(r.value_json));
      } catch {
        // Ignore corrupt setting value
      }
    }
    const activeRaw = map.get('activeLlmEndpointId');
    const activeLlmEndpointId =
      activeRaw === null
        ? null
        : typeof activeRaw === 'string' && activeRaw.trim() !== ''
          ? activeRaw
          : defaults.activeLlmEndpointId;

    return {
      defaultVoice: (map.get('defaultVoice') as VoiceName | undefined) ?? defaults.defaultVoice,
      brandHandle:
        typeof map.get('brandHandle') === 'string'
          ? (map.get('brandHandle') as string)
          : defaults.brandHandle,
      musicEnabled:
        typeof map.get('musicEnabled') === 'boolean'
          ? (map.get('musicEnabled') as boolean)
          : defaults.musicEnabled,
      musicVolumeDb:
        typeof map.get('musicVolumeDb') === 'number'
          ? (map.get('musicVolumeDb') as number)
          : defaults.musicVolumeDb,
      activeLlmEndpointId,
      aiBrollEnabled:
        typeof map.get('aiBrollEnabled') === 'boolean'
          ? (map.get('aiBrollEnabled') as boolean)
          : defaults.aiBrollEnabled,
      voiceRotation:
        typeof map.get('voiceRotation') === 'boolean'
          ? (map.get('voiceRotation') as boolean)
          : defaults.voiceRotation,
    };
  }

  updateSettings(patch: Partial<AppSettings>, defaults: AppSettings): AppSettings {
    this.withImmediateTx(() => {
      const stmt = this.db.prepare(`
        INSERT INTO settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `);
      const now = nowIso();
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          stmt.run(key, JSON.stringify(value), now);
        }
      }
    });
    return this.getSettings(defaults);
  }

  private mapLlmEndpointRow(row: Record<string, unknown>): LlmEndpointRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      baseUrl: String(row.base_url),
      model: String(row.model),
      apiKey: String(row.api_key ?? ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  listLlmEndpoints(): LlmEndpointRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM llm_endpoints ORDER BY created_at ASC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.mapLlmEndpointRow(r));
  }

  getLlmEndpoint(id: string): LlmEndpointRecord | null {
    const row = this.db.prepare('SELECT * FROM llm_endpoints WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    return row ? this.mapLlmEndpointRow(row) : null;
  }

  createLlmEndpoint(input: CreateLlmEndpointInput): LlmEndpointRecord {
    const id = input.id?.trim() || `llm_${randomUUID().slice(0, 12)}`;
    if (RESERVED_LLM_ENDPOINT_IDS.has(id)) {
      throw new Error(`Endpoint ID "${id}" is reserved.`);
    }
    const name = input.name.trim();
    if (!name || name.length > 80) {
      throw new Error('Endpoint name must be between 1 and 80 characters.');
    }
    const model = input.model.trim();
    if (!model || model.length > 160) {
      throw new Error('Model ID must be between 1 and 160 characters.');
    }
    const baseUrl = normalizeOpenAIBaseUrl(input.baseUrl);
    const apiKey = validateApiKeyValue(input.apiKey ?? '');

    return this.withImmediateTx(() => {
      const now = nowIso();
      this.db
        .prepare(
          `INSERT INTO llm_endpoints (id, name, base_url, model, api_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, name, baseUrl, model, apiKey, now, now);
      return this.getLlmEndpoint(id)!;
    });
  }

  updateLlmEndpoint(id: string, patch: UpdateLlmEndpointInput): LlmEndpointRecord | null {
    if (RESERVED_LLM_ENDPOINT_IDS.has(id)) {
      return null;
    }

    return this.withImmediateTx(() => {
      const existing = this.getLlmEndpoint(id);
      if (!existing) return null;

      const sets: string[] = [];
      const params: (string | number)[] = [];
      const push = (col: string, val: string | number) => {
        sets.push(`${col} = ?`);
        params.push(val);
      };

      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name || name.length > 80) {
          throw new Error('Endpoint name must be between 1 and 80 characters.');
        }
        push('name', name);
      }
      if (patch.model !== undefined) {
        const model = patch.model.trim();
        if (!model || model.length > 160) {
          throw new Error('Model ID must be between 1 and 160 characters.');
        }
        push('model', model);
      }
      if (patch.baseUrl !== undefined) {
        push('base_url', normalizeOpenAIBaseUrl(patch.baseUrl));
      }

      if (patch.clearApiKey === true) {
        push('api_key', '');
      } else if (patch.apiKey !== undefined && patch.apiKey.trim() !== '') {
        push('api_key', validateApiKeyValue(patch.apiKey));
      }

      if (sets.length === 0) return existing;

      push('updated_at', nowIso());
      params.push(id);
      this.db.prepare(`UPDATE llm_endpoints SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return this.getLlmEndpoint(id);
    });
  }

  deleteLlmEndpoint(id: string): boolean {
    if (RESERVED_LLM_ENDPOINT_IDS.has(id)) {
      return false;
    }

    return this.withImmediateTx(() => {
      const info = this.db.prepare('DELETE FROM llm_endpoints WHERE id = ?').run(id);
      if (info.changes === 0) return false;

      const activeRow = this.db
        .prepare("SELECT value_json FROM settings WHERE key = 'activeLlmEndpointId'")
        .get() as { value_json: string } | undefined;
      if (activeRow) {
        try {
          if (JSON.parse(activeRow.value_json) === id) {
            this.db
              .prepare(
                `INSERT INTO settings (key, value_json, updated_at)
                 VALUES ('activeLlmEndpointId', ?, ?)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
              )
              .run(JSON.stringify('gemini'), nowIso());
          }
        } catch {
          // Ignore malformed setting value
        }
      }
      return true;
    });
  }

  reconcileBootState(hasValidVideo: (reel: ReelRecord) => boolean): {
    failedRuns: string[];
    recoveredGeneratingReels: string[];
    pendingPublishingReels: ReelRecord[];
  } {
    return this.withImmediateTx(() => {
      const failedRuns: string[] = [];
      const recoveredGeneratingReels: string[] = [];
      const now = nowIso();

      const activeRuns = this.listActivePipelineRuns();
      const activeCliReelIds = new Set<string>();

      for (const run of activeRuns) {
        const keepLiveCli = run.workerSource === 'cli' && isPidAlive(run.workerPid);
        if (keepLiveCli) {
          if (run.reelId) activeCliReelIds.add(run.reelId);
          continue;
        }
        const logs = [
          ...run.logs,
          {
            ts: now,
            step: run.currentStep,
            message: 'Marked failed during server startup reconciliation after unexpected stop.',
            level: 'warn' as const,
          },
        ];
        this.db
          .prepare(
            "UPDATE pipeline_runs SET status = 'FAILED', finished_at = ?, logs_json = ? WHERE id = ?",
          )
          .run(now, JSON.stringify(logs), run.id);
        failedRuns.push(run.id);
      }

      const generatingReels = this.listReels({ statuses: ['GENERATING'], limit: 200 });
      for (const reel of generatingReels) {
        if (activeCliReelIds.has(reel.id)) continue;
        if (hasValidVideo(reel)) {
          this.db
            .prepare(
              "UPDATE reels SET status = 'READY_FOR_REVIEW', error_message = NULL, updated_at = ? WHERE id = ?",
            )
            .run(now, reel.id);
        } else {
          this.db
            .prepare(
              "UPDATE reels SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?",
            )
            .run(
              'Generation was interrupted when the server stopped. Click Retry to regenerate.',
              now,
              reel.id,
            );
        }
        recoveredGeneratingReels.push(reel.id);
      }

      const pendingPublishingReels = this.listReels({ statuses: ['PUBLISHING'], limit: 50 });
      return {
        failedRuns,
        recoveredGeneratingReels,
        pendingPublishingReels,
      };
    });
  }
}
