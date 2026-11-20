import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  StopCircle,
  XCircle,
} from 'lucide-react';
import { apiFetch, type PipelineRunDto } from '../api.js';

interface Props {
  runId: string;
  onRunFinished: (run: PipelineRunDto) => void;
  onOpenReview: (reelId: string) => void;
  onBackDiscover: () => void;
}

const GENERATION_STEPS = [
  { key: 'script', label: 'Script & Quality Gate', hint: 'Structured 5-scene developer storyboard' },
  { key: 'tts', label: 'Voiceover Synthesis', hint: 'Continuous studio audio normalization' },
  { key: 'align', label: 'Whisper Word Sync', hint: '1-to-N technical caption timing' },
  { key: 'render', label: 'Remotion Render', hint: '1080x1920 30fps motion graphics' },
  { key: 'encode', label: 'Meta Spec Encode', hint: 'Closed-GOP H.264 + AAC 48kHz verify' },
  { key: 'ready', label: 'Ready for Review', hint: 'Opening Approval Studio' },
];

const PUBLISH_STEPS = [
  { key: 'create_container', label: 'Create Meta Container', hint: 'Initializing resumable Reels session' },
  { key: 'upload_binary', label: 'Stream MP4 Binary', hint: 'Direct upload to rupload.facebook.com' },
  { key: 'meta_processing', label: 'Meta Processing', hint: 'Waiting for Instagram transcoding' },
  { key: 'media_publish', label: 'Publish Live', hint: 'Publishing Reel to Instagram feed' },
];

function stepIndexFor(steps: Array<{ key: string }>, currentStep: string): number {
  if (currentStep === 'verify') return Math.max(0, steps.findIndex((s) => s.key === 'encode'));
  if (currentStep === 'done') return steps.length - 1;
  const idx = steps.findIndex((s) => s.key === currentStep);
  return idx >= 0 ? idx : 0;
}

export const LiveRunView: React.FC<Props> = ({
  runId,
  onRunFinished,
  onOpenReview,
  onBackDiscover,
}) => {
  const [run, setRun] = useState<PipelineRunDto | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let closed = false;
    let finishedNotified = false;

    const handleTerminal = (nextRun: PipelineRunDto) => {
      setRun(nextRun);
      if (!finishedNotified) {
        finishedNotified = true;
        onRunFinished(nextRun);
      }
    };

    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    const onPayload = (evt: MessageEvent<string>) => {
      if (closed) return;
      try {
        const parsed = JSON.parse(evt.data) as { run: PipelineRunDto };
        setRun(parsed.run);
        if (
          parsed.run.status === 'DONE' ||
          parsed.run.status === 'FAILED' ||
          parsed.run.status === 'CANCELLED'
        ) {
          source.close();
          handleTerminal(parsed.run);
        }
      } catch {
        // Ignore malformed SSE line
      }
    };

    source.addEventListener('snapshot', onPayload);
    source.addEventListener('progress', onPayload);
    source.addEventListener('log', onPayload);
    source.addEventListener('done', onPayload);
    source.addEventListener('failed', onPayload);
    source.addEventListener('cancelled', onPayload);

    return () => {
      closed = true;
      source.close();
    };
  }, [runId, onRunFinished]);

  useEffect(() => {
    if (!run) return;
    const startMs = Date.parse(run.startedAt);
    const updateElapsed = () => {
      const endMs = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
      setElapsedSec(Math.max(0, Math.floor((endMs - startMs) / 1000)));
    };
    updateElapsed();
    if (run.status !== 'QUEUED' && run.status !== 'RUNNING') return;
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [run]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await apiFetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
    } finally {
      setCancelling(false);
    }
  };

  if (!run) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#11131B] p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan-400" />
        <p className="mt-3 text-sm text-zinc-300">Connecting to live pipeline stream...</p>
      </div>
    );
  }

  const isPublish = run.trigger === 'publish';
  const steps = isPublish ? PUBLISH_STEPS : GENERATION_STEPS;
  const activeIdx = stepIndexFor(steps, run.currentStep);
  const isTerminal = run.status === 'DONE' || run.status === 'FAILED' || run.status === 'CANCELLED';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border border-white/12 bg-[#11131B] p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-cyan-300">
              {isPublish ? 'Instagram Publishing' : 'Reel Generation Pipeline'} · {run.status}
            </span>
            <h1 className="mt-1 text-xl font-bold text-zinc-100">
              {run.status === 'DONE'
                ? isPublish
                  ? 'Reel Published to Instagram'
                  : 'Reel Ready for Review'
                : run.status === 'FAILED'
                  ? 'Pipeline Stopped With Error'
                  : run.status === 'CANCELLED'
                    ? 'Run Cancelled'
                    : isPublish
                      ? 'Uploading & Publishing to Meta...'
                      : 'Building Your Vertical Reel...'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-white/10 bg-[#171A24] px-3 py-1.5 font-mono text-xs text-zinc-300">
              {elapsedSec}s elapsed · {run.progressPct}%
            </span>
            {!isTerminal ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                <StopCircle className="h-3.5 w-3.5" />
                {cancelling ? 'Stopping...' : 'Cancel'}
              </button>
            ) : null}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              run.status === 'FAILED'
                ? 'bg-red-400'
                : run.status === 'CANCELLED'
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
            }`}
            style={{ width: `${Math.max(4, run.progressPct)}%` }}
          />
        </div>

        {/* Visual Stepper */}
        <div className="mt-6 space-y-2.5">
          {steps.map((step, idx) => {
            const done = run.status === 'DONE' || idx < activeIdx;
            const active = !isTerminal && idx === activeIdx;
            const failedHere = run.status === 'FAILED' && idx === activeIdx;

            return (
              <div
                key={step.key}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  active
                    ? 'border-cyan-400/45 bg-cyan-500/10'
                    : failedHere
                      ? 'border-red-500/45 bg-red-500/10'
                      : done
                        ? 'border-emerald-500/25 bg-emerald-500/5'
                        : 'border-white/8 bg-[#151822]/60 opacity-65'
                }`}
              >
                <div className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : failedHere ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-white/25" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{step.label}</p>
                    <p className="text-xs text-zinc-400">{step.hint}</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-zinc-400">
                  {done ? 'Done' : failedHere ? 'Error' : active ? 'Running' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>

        {isTerminal ? (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onBackDiscover}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
            >
              Back to Discover
            </button>
            {run.reelId ? (
              <button
                type="button"
                onClick={() => onOpenReview(run.reelId!)}
                className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
              >
                Open in Approval Studio
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Collapsible Live Log Drawer */}
      <div className="rounded-2xl border border-white/10 bg-[#0D1017]">
        <button
          type="button"
          onClick={() => setLogsOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-zinc-300 hover:text-white"
        >
          <span className="flex items-center gap-2">
            {logsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Pipeline Logs ({run.logs.length})
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {run.logs[run.logs.length - 1]?.message ?? ''}
          </span>
        </button>

        {logsOpen ? (
          <div className="max-h-60 space-y-1.5 overflow-y-auto border-t border-white/10 p-4 font-mono text-xs">
            {run.logs.map((entry, idx) => (
              <div
                key={idx}
                className={
                  entry.level === 'error'
                    ? 'text-red-300'
                    : entry.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-zinc-300'
                }
              >
                <span className="text-zinc-500">[{entry.step}] </span>
                {entry.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
