import React, { useEffect, useState } from 'react';
import { assembleInstagramCaption, type PublishSpacingStatus } from '@post/core/shared';
import { AlertTriangle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { InstagramIcon } from './InstagramIcon.js';
import type { MetaCheckDto, PublishResultDto, ReelDto } from '../api.js';

interface Props {
  open: boolean;
  reel: ReelDto;
  caption: string;
  hashtags: string[];
  metaStatus: MetaCheckDto | null;
  publishSpacing?: PublishSpacingStatus | null;
  onClose: () => void;
  onDryRun: () => Promise<PublishResultDto>;
  onConfirmPublish: (opts?: { force?: boolean }) => Promise<void>;
}

export const PublishModal: React.FC<Props> = ({
  open,
  reel,
  caption,
  hashtags,
  metaStatus,
  publishSpacing,
  onClose,
  onDryRun,
  onConfirmPublish,
}) => {
  const [dryRunResult, setDryRunResult] = useState<PublishResultDto | null>(null);
  const [runningDry, setRunningDry] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [overrideSpacing, setOverrideSpacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOverrideSpacing(false);
    setDryRunResult(null);
    setError(null);
  }, [open, reel.id]);

  if (!open) return null;

  const spacingBlocked = Boolean(!reel.isSample && publishSpacing && !publishSpacing.allowed);
  const publishDisabled = reel.isSample || publishing || (spacingBlocked && !overrideSpacing);

  const assembled = assembleInstagramCaption(caption, hashtags);
  const coverUrl = `/api/reels/${reel.id}/cover?v=${encodeURIComponent(reel.updatedAt)}`;

  const handleDryRun = async () => {
    setRunningDry(true);
    setError(null);
    try {
      const res = await onDryRun();
      setDryRunResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed');
    } finally {
      setRunningDry(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      await onConfirmPublish({ force: overrideSpacing });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-white/12 bg-[#11131B] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <InstagramIcon className="h-5 w-5 text-cyan-400" />
            <h2 id="publish-modal-title" className="text-lg font-semibold text-zinc-100">
              Confirm Instagram Publish
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            aria-label="Close publish confirmation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex gap-4">
          <img
            src={coverUrl}
            alt="Reel cover thumbnail"
            className="h-36 w-20 shrink-0 rounded-xl border border-white/10 object-cover"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Target Account:</span>
              <span className="font-mono font-semibold text-cyan-300">
                {metaStatus?.ok
                  ? `@${metaStatus.username ?? metaStatus.igUserId}`
                  : 'Not verified yet (check Settings)'}
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#171A24] p-3">
              <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-200">
                {assembled}
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-zinc-400">
                {assembled.length} / 2200 characters
              </p>
            </div>
          </div>
        </div>

        {reel.isSample ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This is an offline Sample Demo Reel. Live Instagram posting is locked so sample clips never post accidentally, but you can run a full Dry-Run Check below.
            </span>
          </div>
        ) : null}

        {spacingBlocked && publishSpacing ? (
          <div className="mt-4 space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{publishSpacing.message}</span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pl-6 font-medium text-amber-100">
              <input
                type="checkbox"
                checked={overrideSpacing}
                onChange={(e) => setOverrideSpacing(e.target.checked)}
                className="h-3.5 w-3.5 accent-amber-400"
              />
              <span>Override spacing guardrail and publish anyway</span>
            </label>
          </div>
        ) : null}

        {dryRunResult ? (
          <div className="mt-4 space-y-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              <span>{dryRunResult.message}</span>
            </div>
            {dryRunResult.warnings.map((w, idx) => (
              <p key={idx} className="text-amber-200">
                Warning: {w}
              </p>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDryRun}
            disabled={runningDry || publishing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {runningDry ? 'Checking...' : 'Run Dry-Run Check'}
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishDisabled}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-45"
            >
              <InstagramIcon className="h-4 w-4" />
              {publishing ? 'Starting Upload...' : 'Confirm & Publish Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
