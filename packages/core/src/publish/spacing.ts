export const DEFAULT_MIN_PUBLISH_SPACING_HOURS = 6;

export interface PublishSpacingStatus {
  allowed: boolean;
  minSpacingHours: number;
  lastPublishedAt: string | null;
  elapsedMs: number | null;
  remainingMs: number;
  nextAllowedAt: string | null;
  message: string | null;
}

function formatDurationShort(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function checkPublishSpacing(
  lastPublishedAt: string | null,
  minSpacingHours: number,
  nowMs: number = Date.now(),
): PublishSpacingStatus {
  const normalizedHours = Number.isFinite(minSpacingHours) ? Math.max(0, minSpacingHours) : 0;

  if (normalizedHours <= 0 || !lastPublishedAt) {
    return {
      allowed: true,
      minSpacingHours: normalizedHours,
      lastPublishedAt,
      elapsedMs: null,
      remainingMs: 0,
      nextAllowedAt: null,
      message: null,
    };
  }

  const lastMs = Date.parse(lastPublishedAt);
  if (Number.isNaN(lastMs)) {
    return {
      allowed: true,
      minSpacingHours: normalizedHours,
      lastPublishedAt,
      elapsedMs: null,
      remainingMs: 0,
      nextAllowedAt: null,
      message: null,
    };
  }

  const minMs = normalizedHours * 3_600_000;
  const elapsedMs = Math.max(0, nowMs - lastMs);
  const remainingMs = Math.max(0, minMs - elapsedMs);

  if (remainingMs <= 0) {
    return {
      allowed: true,
      minSpacingHours: normalizedHours,
      lastPublishedAt,
      elapsedMs,
      remainingMs: 0,
      nextAllowedAt: null,
      message: null,
    };
  }

  const nextAllowedAt = new Date(lastMs + minMs).toISOString();
  const elapsedLabel = formatDurationShort(Math.max(60_000, elapsedMs));
  const remainingLabel = formatDurationShort(remainingMs);
  return {
    allowed: false,
    minSpacingHours: normalizedHours,
    lastPublishedAt,
    elapsedMs,
    remainingMs,
    nextAllowedAt,
    message: `Publish spacing guardrail: last Reel was published ${elapsedLabel} ago. Wait ${remainingLabel} (min ${normalizedHours}h gap) or override explicitly.`,
  };
}
