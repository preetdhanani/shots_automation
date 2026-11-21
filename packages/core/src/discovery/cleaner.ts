import { z } from 'zod';

export const FEED_CLEAN_INTERVALS = ['3d', '7d', '30d'] as const;
export type FeedCleanInterval = (typeof FEED_CLEAN_INTERVALS)[number];
export const FeedCleanIntervalSchema = z.enum(FEED_CLEAN_INTERVALS);

export interface FeedCleanIntervalOption {
  id: FeedCleanInterval;
  label: string;
  shortLabel: string;
  days: number;
  durationMs: number;
  description: string;
}

const MS_PER_DAY = 86_400_000;

export const FEED_CLEAN_INTERVAL_OPTIONS: readonly FeedCleanIntervalOption[] = [
  {
    id: '3d',
    label: 'Last 3 days',
    shortLabel: '3 days',
    days: 3,
    durationMs: 3 * MS_PER_DAY,
    description: 'Keep news published within the last 3 days',
  },
  {
    id: '7d',
    label: 'Last week',
    shortLabel: '1 week',
    days: 7,
    durationMs: 7 * MS_PER_DAY,
    description: 'Keep news published within the last 7 days',
  },
  {
    id: '30d',
    label: 'Last month',
    shortLabel: '1 month',
    days: 30,
    durationMs: 30 * MS_PER_DAY,
    description: 'Keep news published within the last 30 days',
  },
];

export interface FeedCleanIntervalCounts {
  keep: number;
  remove: number;
}

/** Look up metadata for a feed retention interval. */
export function getFeedCleanIntervalOption(interval: FeedCleanInterval): FeedCleanIntervalOption {
  const option = FEED_CLEAN_INTERVAL_OPTIONS.find((item) => item.id === interval);
  if (!option) {
    throw new RangeError(`Unsupported feed clean interval: ${interval}`);
  }
  return option;
}

/** Compute the UTC epoch cutoff (ms) for keeping topics within the given interval. */
export function computeFeedCleanCutoffMs(
  interval: FeedCleanInterval,
  nowMs = Date.now(),
): number {
  return nowMs - getFeedCleanIntervalOption(interval).durationMs;
}

/** Parse a topic's publishedAt timestamp, falling back to createdAt if unparseable. */
export function parseTopicTimestampMs(publishedAt: string, createdAt?: string): number | null {
  const publishedMs = Date.parse(publishedAt);
  if (Number.isFinite(publishedMs)) return publishedMs;

  if (createdAt) {
    const createdMs = Date.parse(createdAt);
    if (Number.isFinite(createdMs)) return createdMs;
  }
  return null;
}

/** Return true only when a topic has a valid timestamp strictly older than cutoffMs. */
export function isTopicOlderThanCutoff(
  topic: { publishedAt: string; createdAt?: string },
  cutoffMs: number,
): boolean {
  if (!Number.isFinite(cutoffMs)) {
    throw new RangeError('Invalid cutoff timestamp');
  }
  const ms = parseTopicTimestampMs(topic.publishedAt, topic.createdAt);
  return ms !== null && ms < cutoffMs;
}

/** Summarize how many topics stay vs get removed across all supported intervals. */
export function summarizeFeedCleanByInterval(
  topics: ReadonlyArray<{ publishedAt: string; createdAt?: string }>,
  nowMs = Date.now(),
): Record<FeedCleanInterval, FeedCleanIntervalCounts> {
  const result = {} as Record<FeedCleanInterval, FeedCleanIntervalCounts>;
  for (const interval of FEED_CLEAN_INTERVALS) {
    const cutoffMs = computeFeedCleanCutoffMs(interval, nowMs);
    let remove = 0;
    for (const topic of topics) {
      if (isTopicOlderThanCutoff(topic, cutoffMs)) {
        remove++;
      }
    }
    result[interval] = {
      keep: topics.length - remove,
      remove,
    };
  }
  return result;
}
