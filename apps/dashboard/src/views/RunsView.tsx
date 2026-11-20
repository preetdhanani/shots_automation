import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  StopCircle,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatErrorMessage, type PipelineRunDto } from '../api.js';

interface Props {
  activeRuns: PipelineRunDto[];
  maxConcurrency: number;
  onOpenRun: (runId: string) => void;
  onOpenReview: (reelId: string) => void;
  onRetryReel: (reelId: string) => Promise<void>;
  onCancelRun: (runId: string) => Promise<void>;
  onOpenCustomModal: () => void;
  onBackDiscover: () => void;
}

const STEP_LABELS: Record<string, string> = {
  script: 'Script & Quality Gate',
  tts: 'Voiceover Synthesis',
  align: 'Whisper Word Sync',
  render: 'Remotion Render',
  encode: 'Meta Spec Encode',
  verify: 'Meta Spec Verify',
  ready: 'Ready for Review',
  done: 'Completed',
  create_container: 'Create Meta Container',
  upload_binary: 'Upload Video',
  meta_processing: 'Meta Processing',
  media_publish: 'Publish Live',
};

function formatElapsed(startedAt: string, finishedAt: string | null, nowMs: number): string {
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : nowMs;
  if (Number.isNaN(start)) return '0s';
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}m ${rem}s`;
}

export const RunsView: React.FC<Props> = ({
  activeRuns,
  maxConcurrency,
  onOpenRun,
  onOpenReview,
  onRetryReel,
  onCancelRun,
  onOpenCustomModal,
  onBackDiscover,
}) => {
  const [recentRuns, setRecentRuns] = useState<PipelineRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingIds, setCancellingIds] = useState<Record<string, boolean>>({});
  const [retryingIds, setRetryingIds] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadRuns = async () => {
    try {
      const res = await apiFetch<{ runs: PipelineRunDto[] }>('/api/runs?limit=30');
      setRecentRuns(res.runs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRuns();
    const poll = setInterval(() => {
      void loadRuns();
    }, 3000);
    return () => clearInterval(poll);
  }, [activeRuns.length]);

  useEffect(() => {
    if (activeRuns.length === 0) return;
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [activeRuns.length]);

  const handleCancel = async (runId: string) => {
    setCancellingIds((prev) => ({ ...prev, [runId]: true }));
    try {
      await onCancelRun(runId);
      await loadRuns();
    } finally {
      setCancellingIds((prev) => ({ ...prev, [runId]: false }));
    }
  };

  const handleRetry = async (reelId: string) => {
    setRetryingIds((prev) => ({ ...prev, [reelId]: true }));
    try {
      await onRetryReel(reelId);
      await loadRuns();
    } finally {
      setRetryingIds((prev) => ({ ...prev, [reelId]: false }));
    }
  };

  const activeIdSet = new Set(activeRuns.map((r) => r.id));
  const historyRuns = recentRuns.filter(
    (r) => !activeIdSet.has(r.id) && r.status !== 'RUNNING' && r.status !== 'QUEUED',
  );
  const runningCount = activeRuns.filter((r) => r.status === 'RUNNING').length;
  const queuedCount = activeRuns.filter((r) => r.status === 'QUEUED').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Render Queue & Jobs</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Generate and monitor up to {maxConcurrency} Reels in parallel, or cancel stuck jobs
            immediately.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onBackDiscover}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#141720] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            <Compass className="h-3.5 w-3.5 text-cyan-300" />
            Discover Topics
          </button>
          <button
            type="button"
            onClick={onOpenCustomModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
          >
            <Plus className="h-3.5 w-3.5" />
            New Custom Reel
          </button>
        </div>
      </div>

      {/* Active & Queued Jobs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Active & Queued ({activeRuns.length})
            </h2>
          </div>
          <span className="font-mono text-xs text-zinc-400">
            {runningCount} running · {queuedCount} queued · {maxConcurrency} max parallel
          </span>
        </div>

        {activeRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-[#11131B]/60 p-8 text-center">
            <p className="text-sm font-medium text-zinc-200">No active render jobs right now</p>
            <p className="mt-1 text-xs text-zinc-400">
              Start multiple Reels from Discover or click <strong>New Custom Reel</strong> to run
              them in parallel.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {activeRuns.map((run) => {
              const isQueued = run.status === 'QUEUED';
              const stepLabel = STEP_LABELS[run.currentStep] ?? run.currentStep;
              const lastLog = formatErrorMessage(run.logs[run.logs.length - 1]?.message ?? '');
              const busy = Boolean(cancellingIds[run.id]);

              return (
                <div
                  key={run.id}
                  className={`flex flex-col justify-between rounded-2xl border p-5 ${
                    isQueued
                      ? 'border-amber-400/30 bg-[#14141C]'
                      : 'border-cyan-400/35 bg-[#11131B]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                              isQueued
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'bg-cyan-500/20 text-cyan-200'
                            }`}
                          >
                            {isQueued ? (
                              <Clock className="h-3 w-3" />
                            ) : (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                            {run.status}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-400">
                            {formatElapsed(run.startedAt, run.finishedAt, nowMs)}
                          </span>
                        </div>
                        <h3 className="mt-2 truncate text-sm font-semibold text-zinc-100">
                          {run.reelTitle || run.reelId || run.id}
                        </h3>
                      </div>

                      <span className="shrink-0 font-mono text-xs font-semibold text-cyan-300">
                        {run.progressPct}%
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isQueued ? 'bg-amber-400/80' : 'bg-cyan-400'
                        }`}
                        style={{ width: `${Math.max(4, run.progressPct)}%` }}
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-zinc-300">{stepLabel}</span>
                      <span className="min-w-0 truncate font-mono text-[11px] text-zinc-500">
                        {lastLog}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => onOpenRun(run.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Inspect Pipeline
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCancel(run.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      {busy ? 'Cancelling...' : 'Cancel Job'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Completed / Failed / Cancelled Runs */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200">Recent Runs</h2>
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#11131B] p-6 text-center text-xs text-zinc-400">
            Loading job history...
          </div>
        ) : historyRuns.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#11131B]/60 p-6 text-center text-xs text-zinc-400">
            No finished runs yet.
          </div>
        ) : (
          <div className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10 bg-[#11131B]">
            {historyRuns.map((run) => {
              const lastError = [...run.logs].reverse().find((l) => l.level === 'error');
              const summary = formatErrorMessage(
                lastError?.message ?? run.logs[run.logs.length - 1]?.message ?? '',
              );
              const retryBusy = Boolean(run.reelId && retryingIds[run.reelId]);

              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {run.status === 'DONE' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : run.status === 'CANCELLED' ? (
                      <StopCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {run.reelTitle || run.reelId || run.id}
                      </p>
                      <p className="truncate text-xs text-zinc-400">
                        {run.status} · {formatElapsed(run.startedAt, run.finishedAt, nowMs)}
                        {summary ? ` · ${summary}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRun(run.id)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/5"
                    >
                      Logs
                    </button>
                    {run.status === 'DONE' && run.reelId ? (
                      <button
                        type="button"
                        onClick={() => onOpenReview(run.reelId!)}
                        className="rounded-lg bg-cyan-400 px-2.5 py-1 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
                      >
                        Review
                      </button>
                    ) : (run.status === 'FAILED' || run.status === 'CANCELLED') &&
                      run.reelId &&
                      run.trigger !== 'publish' ? (
                      <button
                        type="button"
                        disabled={retryBusy}
                        onClick={() => void handleRetry(run.reelId!)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-zinc-100 transition hover:bg-white/15 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
