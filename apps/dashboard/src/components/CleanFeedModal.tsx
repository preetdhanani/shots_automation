import React, { useEffect, useMemo, useState } from 'react';
import {
  FEED_CLEAN_INTERVAL_OPTIONS,
  getFeedCleanIntervalOption,
  summarizeFeedCleanByInterval,
  type FeedCleanInterval,
} from '@post/core/shared';
import { BrushCleaning, CheckCircle2, X } from 'lucide-react';
import { apiFetch, type FeedCleanPreviewDto, type TopicDto } from '../api.js';

interface Props {
  open: boolean;
  topics: TopicDto[];
  onClose: () => void;
  onClean: (interval: FeedCleanInterval) => Promise<void>;
  onError: (msg: string) => void;
}

export const CleanFeedModal: React.FC<Props> = ({
  open,
  topics,
  onClose,
  onClean,
  onError,
}) => {
  const [selectedInterval, setSelectedInterval] = useState<FeedCleanInterval>('7d');
  const [serverPreview, setServerPreview] = useState<FeedCleanPreviewDto | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedInterval('7d');
    setServerPreview(null);
    setLoadingPreview(true);

    let cancelled = false;
    const controller = new AbortController();
    void apiFetch<FeedCleanPreviewDto>('/api/topics/clean/preview', {
      signal: controller.signal,
    })
      .then((res) => {
        if (!cancelled) {
          setServerPreview(res);
        }
      })
      .catch(() => {
        // Fallback to locally loaded topics if preview fetch fails or aborts
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPreview(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  const fallbackCounts = useMemo(() => summarizeFeedCleanByInterval(topics), [topics]);

  if (!open) return null;

  const previewCounts = serverPreview?.intervals ?? fallbackCounts;
  const selectedCounts = previewCounts[selectedInterval];
  const selectedOption = getFeedCleanIntervalOption(selectedInterval);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || selectedCounts.remove === 0) return;
    setSubmitting(true);
    try {
      await onClean(selectedInterval);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to clean feed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clean-feed-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/12 bg-[#11131B] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <BrushCleaning className="h-4 w-4" />
            </div>
            <div>
              <h2 id="clean-feed-title" className="text-lg font-semibold text-zinc-100">
                Clean Discover Feed
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Keep news published within your selected window and remove older unreviewed topics.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
            aria-label="Close clean feed modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <fieldset disabled={submitting} className="space-y-2.5" role="radiogroup">
            <legend className="sr-only">Feed retention interval</legend>
            {FEED_CLEAN_INTERVAL_OPTIONS.map((option) => {
              const counts = previewCounts[option.id];
              const isSelected = selectedInterval === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition focus-within:ring-2 focus-within:ring-cyan-400/60 ${
                    isSelected
                      ? 'border-cyan-400/50 bg-cyan-500/12'
                      : 'border-white/10 bg-[#171A24] hover:border-white/20'
                  } ${submitting ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <input
                    type="radio"
                    name="feed-clean-interval"
                    value={option.id}
                    checked={isSelected}
                    onChange={() => setSelectedInterval(option.id)}
                    disabled={submitting}
                    className="sr-only"
                  />
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/25 bg-black/30'
                      }`}
                    >
                      {isSelected ? <span className="h-2 w-2 rounded-full bg-cyan-300" /> : null}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-100">{option.label}</div>
                      <div className="text-xs text-zinc-400">{option.description}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
                    <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      {counts.keep} stay
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 ${
                        counts.remove > 0
                          ? 'border-amber-500/30 bg-amber-500/12 text-amber-200'
                          : 'border-white/10 bg-white/5 text-zinc-400'
                      }`}
                    >
                      {counts.remove} remove
                    </span>
                  </div>
                </label>
              );
            })}
          </fieldset>

          {loadingPreview && topics.length >= 120 ? (
            <p className="font-mono text-[11px] text-zinc-400">Syncing full feed counts...</p>
          ) : null}

          {selectedCounts.remove > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-100">
              <p className="font-medium">
                Removing {selectedCounts.remove} older{' '}
                {selectedCounts.remove === 1 ? 'topic' : 'topics'}. {selectedCounts.keep}{' '}
                {selectedCounts.keep === 1 ? 'topic' : 'topics'} within the{' '}
                {selectedOption.label.toLowerCase()} will stay.
              </p>
              <p className="mt-1 text-amber-200/80">
                Only unreviewed Discover items are removed. Generated Reels stay untouched, cleaned
                items will not reappear on Fetch Latest, and you can undo right after.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <p>
                All {selectedCounts.keep} {selectedCounts.keep === 1 ? 'topic is' : 'topics are'}{' '}
                already within the {selectedOption.label.toLowerCase()}. Nothing older to remove.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || selectedCounts.remove === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <BrushCleaning className="h-4 w-4" />
              {submitting
                ? 'Cleaning Feed...'
                : selectedCounts.remove === 0
                  ? 'Nothing to Clean'
                  : `Remove ${selectedCounts.remove} Older ${
                      selectedCounts.remove === 1 ? 'Topic' : 'Topics'
                    }`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
