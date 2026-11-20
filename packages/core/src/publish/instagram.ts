import fs from 'node:fs';
import type { AppEnv } from '../config/env.js';
import type { ReelRecord, Store } from '../db/store.js';
import { probeVideo } from '../media/ffmpeg.js';
import type { VideoSpecReport } from '../schemas/media.js';
import { assembleInstagramCaption } from '../schemas/storyboard.js';
import type { LocalAssetStorage } from '../storage/assets.js';
import { checkMetaHealth } from './metaAuth.js';
import type {
  MetaHealthStatus,
  PublishProgressFn,
  PublishResult,
  SocialPublisher,
} from './publisher.js';

interface MetaApiErrorPayload {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
}

const TRANSIENT_PUBLISH_SUBCODES = new Set([2207027, 2207001, 2207032, 2207053]);

export class MetaPublishError extends Error {
  readonly code: string | null;
  readonly subcode: string | null;
  readonly safeToResetToReview: boolean;

  constructor(
    message: string,
    opts: { code?: number | string | null; subcode?: number | string | null; safeToResetToReview: boolean },
  ) {
    super(message);
    this.name = 'MetaPublishError';
    this.code = opts.code != null ? String(opts.code) : null;
    this.subcode = opts.subcode != null ? String(opts.subcode) : null;
    this.safeToResetToReview = opts.safeToResetToReview;
  }
}

function formatMetaSubcodeMessage(err: MetaApiErrorPayload): string {
  const base = err.error_user_msg || err.message || 'Meta Graph API error';
  switch (err.error_subcode) {
    case 2207042:
      return `Instagram 24-hour API publishing limit reached (subcode 2207042). ${base}`;
    case 2207026:
      return `Meta rejected video encoding format (subcode 2207026). Re-render video and retry. ${base}`;
    case 2207020:
      return `Meta upload container expired after 24h (subcode 2207020). Retry publish to start a fresh container.`;
    default:
      return err.error_subcode ? `${base} (code ${err.code ?? '?'}, subcode ${err.error_subcode})` : base;
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('Cancelled');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class InstagramGraphPublisher implements SocialPublisher {
  readonly platform = 'instagram' as const;
  private readonly store: Store;
  private readonly storage: LocalAssetStorage;
  private readonly env: AppEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(opts: {
    store: Store;
    storage: LocalAssetStorage;
    env: AppEnv;
    fetchImpl?: typeof fetch;
    pollIntervalMs?: number;
    maxPollAttempts?: number;
  }) {
    this.store = opts.store;
    this.storage = opts.storage;
    this.env = opts.env;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 4000;
    this.maxPollAttempts = opts.maxPollAttempts ?? 45;
  }

  async checkHealth(): Promise<MetaHealthStatus> {
    return checkMetaHealth(this.env, this.fetchImpl);
  }

  private async verifyLocalPreconditions(reel: ReelRecord): Promise<{
    videoPath: string;
    specReport: VideoSpecReport;
    caption: string;
  }> {
    const videoPath = reel.videoPath ?? this.storage.reelFile(reel.id, 'final.mp4');
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Rendered MP4 not found for reel ${reel.id}.`);
    }
    const specReport = await probeVideo(videoPath);
    if (!specReport.ok) {
      throw new Error(`Video failed Instagram Reels spec check: ${specReport.errors.join(' ')}`);
    }
    const caption = assembleInstagramCaption(reel.caption, reel.hashtags);
    if (caption.length > 2200) {
      throw new Error(
        `Assembled caption + hashtags is ${caption.length} chars (max 2200 allowed by Instagram).`,
      );
    }
    return { videoPath, specReport, caption };
  }

  async publish(
    reel: ReelRecord,
    opts: { dryRun?: boolean; onProgress?: PublishProgressFn; signal?: AbortSignal } = {},
  ): Promise<PublishResult> {
    const { videoPath, specReport, caption } = await this.verifyLocalPreconditions(reel);

    if (opts.dryRun) {
      const warnings: string[] = [];
      if (reel.isSample) {
        warnings.push('This is an offline sample demo Reel (live Instagram posting is disabled).');
      }
      const health = await this.checkHealth();
      if (!health.configured) {
        warnings.push('Meta credentials are not configured yet in .env; local spec & caption passed.');
      } else if (!health.ok) {
        warnings.push(`Meta credential warning: ${health.message}`);
      } else if (health.quotaUsed !== null && health.quotaTotal !== null && health.quotaUsed >= health.quotaTotal) {
        warnings.push(`24h Meta publishing quota full (${health.quotaUsed}/${health.quotaTotal}).`);
      }

      return {
        dryRun: true,
        published: false,
        reel,
        attempt: null,
        specReport,
        assembledCaptionLength: caption.length,
        warnings,
        message: health.ok
          ? `Dry run passed (${caption.length}/2200 chars, valid 1080x1920 H.264/AAC MP4, connected @${health.username ?? health.igUserId}).`
          : `Local dry run passed (${caption.length}/2200 chars, valid 1080x1920 H.264/AAC MP4).`,
      };
    }

    if (reel.isSample) {
      throw new MetaPublishError(
        'Sample demo Reels cannot be published to live Instagram. Generate a real Reel from Discover or a custom prompt.',
        { safeToResetToReview: true },
      );
    }

    const version = this.env.META_GRAPH_API_VERSION;
    const igUserId = this.env.META_IG_USER_ID.trim();
    const token = this.env.META_ACCESS_TOKEN.trim();
    if (!igUserId || !token) {
      throw new MetaPublishError(
        'META_IG_USER_ID and META_ACCESS_TOKEN must be set in .env before publishing.',
        { safeToResetToReview: true },
      );
    }

    const claimed = this.store.claimReelForPublish(reel.id);
    if (!claimed) {
      throw new Error(
        `Reel ${reel.id} cannot be published because its status is "${reel.status}".`,
      );
    }

    const attempt = this.store.createPublishAttempt({
      reelId: reel.id,
      state: 'INITIATED',
    });

    try {
      opts.onProgress?.('create_container', 15, 'Creating Meta resumable Reels container...');
      const { containerId, uploadUri } = await this.createResumableContainer({
        version,
        igUserId,
        token,
        caption,
        signal: opts.signal,
      });

      this.store.updatePublishAttempt(attempt.id, {
        containerId,
        uploadUri,
      });

      return await this.uploadPollAndPublish({
        reelId: reel.id,
        attemptId: attempt.id,
        containerId,
        uploadUri,
        videoPath,
        version,
        igUserId,
        token,
        specReport,
        captionLength: caption.length,
        onProgress: opts.onProgress,
        signal: opts.signal,
      });
    } catch (err) {
      const mErr =
        err instanceof MetaPublishError
          ? err
          : new MetaPublishError(err instanceof Error ? err.message : String(err), {
              safeToResetToReview: true,
            });

      this.store.updatePublishAttempt(attempt.id, {
        state: 'FAILED',
        errorCode: mErr.code,
        errorSubcode: mErr.subcode,
        errorMessage: mErr.message,
      });

      this.store.updateReel(reel.id, {
        status: mErr.safeToResetToReview ? 'READY_FOR_REVIEW' : 'PUBLISHING',
        errorMessage: mErr.message,
      });

      throw mErr;
    }
  }

  async reconcile(
    reel: ReelRecord,
    opts: { onProgress?: PublishProgressFn; signal?: AbortSignal } = {},
  ): Promise<PublishResult> {
    const attempt = this.store.getLatestPublishAttempt(reel.id);
    const { videoPath, specReport, caption } = await this.verifyLocalPreconditions(reel);

    if (!attempt?.containerId) {
      const reset =
        this.store.updateReel(reel.id, {
          status: 'READY_FOR_REVIEW',
          errorMessage: null,
        }) ?? reel;
      return {
        dryRun: false,
        published: false,
        reel: reset,
        attempt: attempt ?? null,
        specReport,
        assembledCaptionLength: caption.length,
        warnings: [],
        message: 'No Meta container existed yet. Reel returned safely to Ready for Review.',
      };
    }

    const version = this.env.META_GRAPH_API_VERSION;
    const igUserId = this.env.META_IG_USER_ID.trim();
    const token = this.env.META_ACCESS_TOKEN.trim();

    opts.onProgress?.('poll_status', 50, `Checking Meta container ${attempt.containerId} status...`);
    const statusRes = await this.queryContainerStatus(version, attempt.containerId, token, opts.signal);

    if (statusRes.statusCode === 'PUBLISHED') {
      return await this.finalizePublished({
        reelId: reel.id,
        attemptId: attempt.id,
        remoteMediaId: attempt.remoteMediaId ?? statusRes.mediaId ?? attempt.containerId,
        version,
        token,
        specReport,
        captionLength: caption.length,
        onProgress: opts.onProgress,
      });
    }

    if (statusRes.statusCode === 'ERROR' || statusRes.statusCode === 'EXPIRED') {
      this.store.updatePublishAttempt(attempt.id, {
        state: 'FAILED',
        errorMessage: `Container ${attempt.containerId} ended with ${statusRes.statusCode}.`,
      });
      const reset =
        this.store.updateReel(reel.id, {
          status: 'READY_FOR_REVIEW',
          errorMessage: `Previous Meta container ended with ${statusRes.statusCode}. Ready to publish again.`,
        }) ?? reel;
      return {
        dryRun: false,
        published: false,
        reel: reset,
        attempt: this.store.getLatestPublishAttempt(reel.id),
        specReport,
        assembledCaptionLength: caption.length,
        warnings: [],
        message: `Previous container ${statusRes.statusCode}. Returned safely to Ready for Review.`,
      };
    }

    try {
      return await this.uploadPollAndPublish({
        reelId: reel.id,
        attemptId: attempt.id,
        containerId: attempt.containerId,
        uploadUri: attempt.uploadUri ?? `https://rupload.facebook.com/ig-api-upload/${version}/${attempt.containerId}`,
        videoPath,
        version,
        igUserId,
        token,
        specReport,
        captionLength: caption.length,
        skipUploadIfAlreadyUploaded: attempt.state === 'UPLOADED' || attempt.state === 'PROCESSING' || statusRes.statusCode === 'FINISHED',
        initialStatusCode: statusRes.statusCode,
        onProgress: opts.onProgress,
        signal: opts.signal,
      });
    } catch (err) {
      const mErr =
        err instanceof MetaPublishError
          ? err
          : new MetaPublishError(err instanceof Error ? err.message : String(err), {
              safeToResetToReview: false,
            });
      this.store.updatePublishAttempt(attempt.id, {
        state: 'FAILED',
        errorCode: mErr.code,
        errorSubcode: mErr.subcode,
        errorMessage: mErr.message,
      });
      this.store.updateReel(reel.id, {
        status: mErr.safeToResetToReview ? 'READY_FOR_REVIEW' : 'PUBLISHING',
        errorMessage: mErr.message,
      });
      throw mErr;
    }
  }

  private async createResumableContainer(opts: {
    version: string;
    igUserId: string;
    token: string;
    caption: string;
    signal?: AbortSignal;
  }): Promise<{ containerId: string; uploadUri: string }> {
    const body = new URLSearchParams({
      upload_type: 'resumable',
      media_type: 'REELS',
      caption: opts.caption,
      share_to_feed: 'true',
      thumb_offset: '800',
    });

    const res = await this.fetchImpl(
      `https://graph.facebook.com/${opts.version}/${encodeURIComponent(opts.igUserId)}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: opts.signal,
      },
    );

    const json = (await res.json()) as {
      id?: string;
      uri?: string;
      error?: MetaApiErrorPayload;
    };

    if (!res.ok || json.error || !json.id) {
      throw new MetaPublishError(formatMetaSubcodeMessage(json.error ?? {}), {
        code: json.error?.code ?? res.status,
        subcode: json.error?.error_subcode,
        safeToResetToReview: true,
      });
    }

    const uploadUri =
      json.uri || `https://rupload.facebook.com/ig-api-upload/${opts.version}/${json.id}`;
    return { containerId: json.id, uploadUri };
  }

  private async queryRuploadOffset(
    uploadUri: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<number> {
    try {
      const res = await this.fetchImpl(uploadUri, {
        method: 'GET',
        headers: { Authorization: `OAuth ${token}` },
        signal,
      });
      if (!res.ok) return 0;
      const json = (await res.json()) as { h?: string; offset?: number };
      if (typeof json.offset === 'number' && json.offset >= 0) return json.offset;
      if (typeof json.h === 'string') {
        const m = json.h.match(/"offset"\s*:\s*(\d+)/);
        if (m) return Number.parseInt(m[1]!, 10);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private async uploadBinaryResumable(opts: {
    uploadUri: string;
    token: string;
    videoPath: string;
    resumeOffsetCheck?: boolean;
    signal?: AbortSignal;
  }): Promise<void> {
    const stat = fs.statSync(opts.videoPath);
    const totalBytes = stat.size;
    const offset = opts.resumeOffsetCheck
      ? await this.queryRuploadOffset(opts.uploadUri, opts.token, opts.signal)
      : 0;

    if (offset >= totalBytes) {
      return;
    }

    const blob = await fs.openAsBlob(opts.videoPath, { type: 'application/octet-stream' });
    const slice = offset > 0 ? blob.slice(offset) : blob;

    const res = await this.fetchImpl(opts.uploadUri, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${opts.token}`,
        file_size: String(totalBytes),
        offset: String(offset),
        'Content-Type': 'application/octet-stream',
      },
      body: slice,
      signal: opts.signal,
    });

    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: MetaApiErrorPayload;
      debug_info?: { message?: string };
    };

    if (!res.ok || json.error || json.success === false) {
      throw new MetaPublishError(
        json.error
          ? formatMetaSubcodeMessage(json.error)
          : json.debug_info?.message ?? `Resumable binary upload failed with HTTP ${res.status}.`,
        {
          code: json.error?.code ?? res.status,
          subcode: json.error?.error_subcode,
          safeToResetToReview: false,
        },
      );
    }
  }

  private async queryContainerStatus(
    version: string,
    containerId: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<{ statusCode: string; statusDetail: string; mediaId?: string }> {
    const res = await this.fetchImpl(
      `https://graph.facebook.com/${version}/${encodeURIComponent(containerId)}?fields=status_code,status`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    );
    const json = (await res.json()) as {
      status_code?: string;
      status?: string;
      id?: string;
      error?: MetaApiErrorPayload;
    };
    if (!res.ok || json.error) {
      throw new MetaPublishError(formatMetaSubcodeMessage(json.error ?? {}), {
        code: json.error?.code ?? res.status,
        subcode: json.error?.error_subcode,
        safeToResetToReview: false,
      });
    }
    return {
      statusCode: (json.status_code ?? 'IN_PROGRESS').toUpperCase(),
      statusDetail: json.status ?? '',
    };
  }

  private async publishMediaContainer(opts: {
    version: string;
    igUserId: string;
    token: string;
    containerId: string;
    signal?: AbortSignal;
  }): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const body = new URLSearchParams({ creation_id: opts.containerId });
      const res = await this.fetchImpl(
        `https://graph.facebook.com/${opts.version}/${encodeURIComponent(opts.igUserId)}/media_publish`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal: opts.signal,
        },
      );
      const json = (await res.json()) as { id?: string; error?: MetaApiErrorPayload };
      if (res.ok && json.id) {
        return json.id;
      }

      const subcode = json.error?.error_subcode;
      const isTransient = subcode !== undefined && TRANSIENT_PUBLISH_SUBCODES.has(subcode);
      if (isTransient && attempt < 3) {
        await sleep(2500 * attempt, opts.signal);
        continue;
      }

      const safeReset = subcode === 2207020 || subcode === 2207026;
      throw new MetaPublishError(formatMetaSubcodeMessage(json.error ?? {}), {
        code: json.error?.code ?? res.status,
        subcode,
        safeToResetToReview: safeReset,
      });
    }

    throw new MetaPublishError('Meta media_publish failed after retries.', {
      safeToResetToReview: false,
    });
  }

  private async uploadPollAndPublish(opts: {
    reelId: string;
    attemptId: string;
    containerId: string;
    uploadUri: string;
    videoPath: string;
    version: string;
    igUserId: string;
    token: string;
    specReport: VideoSpecReport;
    captionLength: number;
    skipUploadIfAlreadyUploaded?: boolean;
    initialStatusCode?: string;
    onProgress?: PublishProgressFn;
    signal?: AbortSignal;
  }): Promise<PublishResult> {
    let statusCode = opts.initialStatusCode ?? 'IN_PROGRESS';

    if (!opts.skipUploadIfAlreadyUploaded) {
      opts.onProgress?.('upload_binary', 38, 'Streaming MP4 binary directly to Meta...');
      await this.uploadBinaryResumable({
        uploadUri: opts.uploadUri,
        token: opts.token,
        videoPath: opts.videoPath,
        resumeOffsetCheck: true,
        signal: opts.signal,
      });
      this.store.updatePublishAttempt(opts.attemptId, { state: 'UPLOADED' });
    }

    if (statusCode !== 'FINISHED' && statusCode !== 'PUBLISHED') {
      this.store.updatePublishAttempt(opts.attemptId, { state: 'PROCESSING' });
      opts.onProgress?.('meta_processing', 62, 'Waiting for Meta transcoding & safety checks...');

      for (let poll = 0; poll < this.maxPollAttempts; poll++) {
        const res = await this.queryContainerStatus(
          opts.version,
          opts.containerId,
          opts.token,
          opts.signal,
        );
        statusCode = res.statusCode;

        if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') {
          break;
        }
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          throw new MetaPublishError(
            `Meta container processing failed (${statusCode}): ${res.statusDetail || 'unknown error'}`,
            { safeToResetToReview: true },
          );
        }

        const pct = Math.min(84, 62 + Math.round(((poll + 1) / this.maxPollAttempts) * 20));
        opts.onProgress?.('meta_processing', pct, `Meta processing status: ${statusCode}...`);
        await sleep(this.pollIntervalMs, opts.signal);
      }

      if (statusCode !== 'FINISHED' && statusCode !== 'PUBLISHED') {
        throw new MetaPublishError(
          `Timed out waiting for Meta container ${opts.containerId}. Use Reconcile / Resume Publish to finish without double-posting.`,
          { safeToResetToReview: false },
        );
      }
    }

    let remoteMediaId: string;
    if (statusCode === 'PUBLISHED') {
      remoteMediaId = opts.containerId;
    } else {
      opts.onProgress?.('media_publish', 90, 'Publishing Reel to Instagram feed...');
      remoteMediaId = await this.publishMediaContainer({
        version: opts.version,
        igUserId: opts.igUserId,
        token: opts.token,
        containerId: opts.containerId,
        signal: opts.signal,
      });
    }

    return await this.finalizePublished({
      reelId: opts.reelId,
      attemptId: opts.attemptId,
      remoteMediaId,
      version: opts.version,
      token: opts.token,
      specReport: opts.specReport,
      captionLength: opts.captionLength,
      onProgress: opts.onProgress,
    });
  }

  private async finalizePublished(opts: {
    reelId: string;
    attemptId: string;
    remoteMediaId: string;
    version: string;
    token: string;
    specReport: VideoSpecReport;
    captionLength: number;
    onProgress?: PublishProgressFn;
  }): Promise<PublishResult> {
    const publishedAt = new Date().toISOString();

    this.store.updatePublishAttempt(opts.attemptId, {
      state: 'PUBLISHED',
      remoteMediaId: opts.remoteMediaId,
      errorCode: null,
      errorSubcode: null,
      errorMessage: null,
    });

    let updatedReel = this.store.updateReel(opts.reelId, {
      status: 'PUBLISHED',
      instagramMediaId: opts.remoteMediaId,
      publishedAt,
      errorMessage: null,
    })!;

    // Best-effort permalink lookup AFTER committing PUBLISHED so permission errors never fail a completed post
    let permalink: string | null = null;
    try {
      const pRes = await this.fetchImpl(
        `https://graph.facebook.com/${opts.version}/${encodeURIComponent(opts.remoteMediaId)}?fields=permalink`,
        { headers: { Authorization: `Bearer ${opts.token}` } },
      );
      if (pRes.ok) {
        const pJson = (await pRes.json()) as { permalink?: string };
        if (pJson.permalink) {
          permalink = pJson.permalink;
          updatedReel =
            this.store.updateReel(opts.reelId, { instagramPermalink: permalink }) ?? updatedReel;
        }
      }
    } catch {
      // Ignore permalink lookup failure
    }

    opts.onProgress?.('done', 100, 'Reel is live on Instagram!');
    return {
      dryRun: false,
      published: true,
      reel: updatedReel,
      attempt: this.store.getLatestPublishAttempt(opts.reelId),
      specReport: opts.specReport,
      assembledCaptionLength: opts.captionLength,
      warnings: [],
      message: permalink
        ? `Published to Instagram: ${permalink}`
        : `Published to Instagram (Media ID ${opts.remoteMediaId}).`,
    };
  }
}
