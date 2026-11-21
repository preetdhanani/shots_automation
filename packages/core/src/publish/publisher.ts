import type { PublishAttemptRecord, ReelRecord } from '../db/store.js';
import type { VideoSpecReport } from '../schemas/media.js';

export type PublishProgressFn = (step: string, progressPct: number, message: string) => void;

export interface MetaHealthStatus {
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

export interface PublishResult {
  dryRun: boolean;
  published: boolean;
  reel: ReelRecord;
  attempt: PublishAttemptRecord | null;
  specReport: VideoSpecReport;
  assembledCaptionLength: number;
  warnings: string[];
  message: string;
}

export interface SocialPublisher {
  readonly platform: 'instagram';
  checkHealth(): Promise<MetaHealthStatus>;
  publish(
    reel: ReelRecord,
    opts?: {
      dryRun?: boolean;
      bypassSpacing?: boolean;
      onProgress?: PublishProgressFn;
      signal?: AbortSignal;
    },
  ): Promise<PublishResult>;
  reconcile(
    reel: ReelRecord,
    opts?: { onProgress?: PublishProgressFn; signal?: AbortSignal },
  ): Promise<PublishResult>;
}
