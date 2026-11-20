import React, { useState } from 'react';
import { ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import { InstagramIcon } from '../components/InstagramIcon.js';
import { formatErrorMessage, type ReelDto } from '../api.js';
import { PillarBadge } from '../components/PillarBadge.js';

interface Props {
  reels: ReelDto[];
  onRetryReel: (reelId: string) => void;
  onRestoreReel: (reelId: string) => void;
  onDeleteReel: (reelId: string) => void;
  onOpenReview: (reelId: string) => void;
}

type FilterTab = 'PUBLISHED' | 'REJECTED' | 'FAILED';

export const LibraryView: React.FC<Props> = ({
  reels,
  onRetryReel,
  onRestoreReel,
  onDeleteReel,
  onOpenReview,
}) => {
  const [tab, setTab] = useState<FilterTab>('PUBLISHED');
  const filtered = reels.filter((r) => r.status === tab);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Library & Archive</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Browse published Instagram Reels, retry failed runs, or restore rejected drafts.
          </p>
        </div>

        <div className="flex gap-1.5 rounded-xl border border-white/10 bg-[#11131B] p-1">
          {(['PUBLISHED', 'REJECTED', 'FAILED'] as FilterTab[]).map((status) => {
            const count = reels.filter((r) => r.status === status).length;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setTab(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === status
                    ? 'bg-cyan-400 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {status.charAt(0) + status.slice(1).toLowerCase()} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#11131B]/60 p-10 text-center">
          <p className="text-sm text-zinc-400">
            No {tab.toLowerCase()} Reels yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((reel) => (
            <div
              key={reel.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11131B]"
            >
              <div className="relative aspect-[9/16] max-h-64 w-full overflow-hidden bg-black">
                {reel.coverPath ? (
                  <img
                    src={`/api/reels/${reel.id}/cover?v=${encodeURIComponent(reel.updatedAt)}`}
                    alt={reel.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-zinc-500">
                    No preview frame
                  </div>
                )}
                <div className="absolute top-2.5 left-2.5">
                  <PillarBadge pillar={reel.pillar} />
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <h3 className="line-clamp-2 text-sm font-semibold text-zinc-100">
                    {reel.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                    {formatErrorMessage(reel.errorMessage) || reel.caption}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  {reel.status === 'PUBLISHED' && reel.instagramPermalink ? (
                    <a
                      href={reel.instagramPermalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:underline"
                    >
                      <InstagramIcon className="h-3.5 w-3.5" />
                      View Post <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : reel.status === 'FAILED' ? (
                    <button
                      type="button"
                      onClick={() => onRetryReel(reel.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-400 px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-cyan-300"
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRestoreReel(reel.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/15"
                    >
                      <RotateCcw className="h-3 w-3" /> Restore
                    </button>
                  )}

                  <div className="flex items-center gap-1">
                    {reel.videoPath ? (
                      <button
                        type="button"
                        onClick={() => onOpenReview(reel.id)}
                        className="rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
                      >
                        Inspect
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDeleteReel(reel.id)}
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-red-300"
                      aria-label={`Delete ${reel.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
