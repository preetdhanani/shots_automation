import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentPillar, ReelFormatId, VoiceName } from '@post/core/shared';
import { Archive, CheckSquare, Compass, Layers, Loader2, Plus, Settings, Sparkles, X } from 'lucide-react';
import {
  apiFetch,
  type GeminiCheckDto,
  type HealthDto,
  type LlmStateDto,
  type MetaCheckDto,
  type PipelineRunDto,
  type ReelDto,
  type TopicDto,
} from './api.js';
import { CustomReelModal } from './components/CustomReelModal.js';
import { SetupReadinessStrip } from './components/SetupReadinessStrip.js';
import { ToastStack, type ToastItem } from './components/Toast.js';
import { ApprovalStudioView } from './views/ApprovalStudioView.js';
import { DiscoverView } from './views/DiscoverView.js';
import { LibraryView } from './views/LibraryView.js';
import { LiveRunView } from './views/LiveRunView.js';
import { RunsView } from './views/RunsView.js';
import { SettingsView } from './views/SettingsView.js';

type RouteState =
  | { page: 'discover' }
  | { page: 'runs' }
  | { page: 'run'; runId: string }
  | { page: 'review'; reelId: string | null }
  | { page: 'library' }
  | { page: 'settings' };

function parseRoute(pathname: string): RouteState {
  if (pathname === '/runs' || pathname === '/runs/') {
    return { page: 'runs' };
  }
  if (pathname.startsWith('/runs/')) {
    const runId = pathname.slice('/runs/'.length).split('/')[0];
    if (runId) return { page: 'run', runId };
  }
  if (pathname.startsWith('/review')) {
    const rest = pathname.slice('/review'.length).replace(/^\/+/, '');
    return { page: 'review', reelId: rest || null };
  }
  if (pathname === '/library') return { page: 'library' };
  if (pathname === '/settings') return { page: 'settings' };
  return { page: 'discover' };
}

function routeToPath(route: RouteState): string {
  switch (route.page) {
    case 'discover':
      return '/discover';
    case 'runs':
      return '/runs';
    case 'run':
      return `/runs/${encodeURIComponent(route.runId)}`;
    case 'review':
      return route.reelId ? `/review/${encodeURIComponent(route.reelId)}` : '/review';
    case 'library':
      return '/library';
    case 'settings':
      return '/settings';
  }
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<RouteState>(() => parseRoute(window.location.pathname));
  const [health, setHealth] = useState<HealthDto | null>(null);
  const [topics, setTopics] = useState<TopicDto[]>([]);
  const [reels, setReels] = useState<ReelDto[]>([]);
  const [activeRuns, setActiveRuns] = useState<PipelineRunDto[]>([]);
  const [maxConcurrency, setMaxConcurrency] = useState(3);

  const [topicsLoading, setTopicsLoading] = useState(true);
  const [fetchingTopics, setFetchingTopics] = useState(false);
  const [startingSample, setStartingSample] = useState(false);
  const [checkingGemini, setCheckingGemini] = useState(false);
  const [switchingLlm, setSwitchingLlm] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [selectedTopicForModal, setSelectedTopicForModal] = useState<TopicDto | null>(null);
  const [safeZoneOpen, setSafeZoneOpen] = useState(true);

  const [geminiCheck, setGeminiCheck] = useState<GeminiCheckDto | null>(null);
  const [metaCheck, setMetaCheck] = useState<MetaCheckDto | null>(null);
  const [whisperProgress, setWhisperProgress] = useState<{
    downloading: boolean;
    progressPct: number;
    error: string | null;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6500);
  }, []);

  const navigate = useCallback((next: RouteState) => {
    setRoute(next);
    const targetUrl = routeToPath(next);
    if (window.location.pathname !== targetUrl) {
      window.history.pushState({}, '', targetUrl);
    }
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await apiFetch<HealthDto>('/api/health');
      setHealth(h);
    } catch {
      // Ignore background poll failures
    }
  }, []);

  const refreshTopics = useCallback(async () => {
    setTopicsLoading(true);
    try {
      const res = await apiFetch<{ topics: TopicDto[] }>('/api/topics?status=NEW');
      setTopics(res.topics);
    } finally {
      setTopicsLoading(false);
    }
  }, []);

  const refreshReels = useCallback(async () => {
    const res = await apiFetch<{ reels: ReelDto[] }>('/api/reels');
    setReels(res.reels);
  }, []);

  const refreshActiveRuns = useCallback(async () => {
    try {
      const res = await apiFetch<{
        activeRun: PipelineRunDto | null;
        queuedRuns: PipelineRunDto[];
        activeRuns?: PipelineRunDto[];
        maxConcurrency?: number;
      }>('/api/runs/active');
      const allActive =
        res.activeRuns ??
        [...(res.activeRun ? [res.activeRun] : []), ...(res.queuedRuns ?? [])];
      setActiveRuns(allActive);
      if (typeof res.maxConcurrency === 'number') {
        setMaxConcurrency(res.maxConcurrency);
      }
    } catch {
      // Ignore poll errors
    }
  }, []);

  useEffect(() => {
    void Promise.all([refreshHealth(), refreshTopics(), refreshReels(), refreshActiveRuns()]);
  }, [refreshHealth, refreshTopics, refreshReels, refreshActiveRuns]);

  useEffect(() => {
    const intervalMs = activeRuns.length > 0 ? 2000 : 4000;
    const timer = setInterval(() => {
      void refreshActiveRuns();
      if (activeRuns.length > 0) {
        void refreshReels();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activeRuns.length, refreshActiveRuns, refreshReels]);

  // Guarded keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      const isEditing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(target?.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSelectedTopicForModal(null);
        setCustomModalOpen(true);
        return;
      }

      if (e.key === 'Escape' && customModalOpen) {
        setCustomModalOpen(false);
        setSelectedTopicForModal(null);
        return;
      }

      if (isEditing || customModalOpen || tag === 'button') return;

      if (route.page === 'review') {
        if (e.key === ' ') {
          const vid = videoRef.current;
          if (vid) {
            e.preventDefault();
            if (vid.paused) void vid.play();
            else vid.pause();
          }
        } else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          setSafeZoneOpen((v) => !v);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [route.page, customModalOpen]);

  const handleDownloadWhisper = async () => {
    try {
      await apiFetch('/api/setup/whisper', { method: 'POST' });
      setWhisperProgress({ downloading: true, progressPct: 2, error: null });
      const es = new EventSource('/api/setup/whisper/events');
      const handleEvt = (evt: MessageEvent<string>) => {
        try {
          const data = JSON.parse(evt.data) as {
            status: string;
            progressPct: number;
            error: string | null;
          };
          setWhisperProgress({
            downloading: data.status === 'downloading' || data.status === 'verifying',
            progressPct: data.progressPct,
            error: data.error,
          });
          if (data.status === 'done') {
            es.close();
            void refreshHealth();
            pushToast({ title: 'Whisper model downloaded and verified.', tone: 'success' });
          } else if (data.status === 'error') {
            es.close();
            pushToast({ title: data.error ?? 'Whisper download failed', tone: 'error' });
          }
        } catch {
          // Ignore
        }
      };
      es.addEventListener('progress', handleEvt);
      es.addEventListener('done', handleEvt);
      es.addEventListener('error', handleEvt);
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Whisper setup failed',
        tone: 'error',
      });
    }
  };

  const handleVerifyGemini = async () => {
    setCheckingGemini(true);
    try {
      const res = await apiFetch<GeminiCheckDto>('/api/gemini/check', { method: 'POST' });
      setGeminiCheck(res);
      void refreshHealth();
      pushToast({ title: res.message, tone: res.ok ? 'success' : 'error' });
    } finally {
      setCheckingGemini(false);
    }
  };

  const handleSelectSidebarLlm = async (endpointId: string) => {
    setSwitchingLlm(true);
    try {
      const res = await apiFetch<LlmStateDto>('/api/llm/select', {
        method: 'POST',
        body: JSON.stringify({ endpointId }),
      });
      await refreshHealth();
      pushToast({
        title: `Script LLM switched to ${res.activeEndpoint.name}.`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Failed to switch LLM endpoint',
        tone: 'error',
      });
    } finally {
      setSwitchingLlm(false);
    }
  };

  const handleVerifyMeta = async () => {
    try {
      const res = await apiFetch<MetaCheckDto>('/api/meta/check', { method: 'POST' });
      setMetaCheck(res);
      void refreshHealth();
      pushToast({ title: res.message, tone: res.ok ? 'success' : 'error' });
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Meta check failed',
        tone: 'error',
      });
    }
  };

  const handleFetchTopics = async () => {
    setFetchingTopics(true);
    try {
      const res = await apiFetch<{ inserted: number; skippedDuplicates: number }>(
        '/api/topics/fetch',
        { method: 'POST' },
      );
      await refreshTopics();
      pushToast({
        title: `Added ${res.inserted} new AI & dev topic(s).`,
        description: `${res.skippedDuplicates} duplicates filtered out.`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Topic fetch failed',
        tone: 'error',
      });
    } finally {
      setFetchingTopics(false);
    }
  };

  const handleGenerateSample = async () => {
    setStartingSample(true);
    try {
      const res = await apiFetch<{ reel: ReelDto; run: PipelineRunDto }>('/api/reels/sample', {
        method: 'POST',
      });
      void refreshActiveRuns();
      void refreshReels();
      navigate({ page: 'run', runId: res.run.id });
    } catch (err) {
      pushToast({
        title: err instanceof Error ? err.message : 'Sample generation failed',
        tone: 'error',
      });
    } finally {
      setStartingSample(false);
    }
  };

  const handleGenerateFromTopic = (topic: TopicDto) => {
    setSelectedTopicForModal(topic);
    setCustomModalOpen(true);
  };

  const handleDismissTopic = async (topic: TopicDto) => {
    setTopics((prev) => prev.filter((t) => t.id !== topic.id));
    await apiFetch(`/api/topics/${encodeURIComponent(topic.id)}/dismiss`, { method: 'PATCH' });
    pushToast({
      title: 'Topic dismissed.',
      undoLabel: 'Undo',
      onUndo: async () => {
        await apiFetch(`/api/topics/${encodeURIComponent(topic.id)}/restore`, { method: 'PATCH' });
        void refreshTopics();
      },
    });
  };

  const handleRejectReel = async (reel: ReelDto) => {
    await apiFetch(`/api/reels/${encodeURIComponent(reel.id)}/reject`, { method: 'POST' });
    await refreshReels();
    pushToast({
      title: `Moved "${reel.title}" to Rejected.`,
      undoLabel: 'Undo',
      onUndo: async () => {
        await apiFetch(`/api/reels/${encodeURIComponent(reel.id)}/restore`, { method: 'POST' });
        await refreshReels();
        navigate({ page: 'review', reelId: reel.id });
      },
    });
    navigate({ page: 'review', reelId: null });
  };

  const handleCancelRun = useCallback(
    async (runId: string) => {
      try {
        await apiFetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
        await Promise.all([refreshActiveRuns(), refreshReels(), refreshHealth()]);
        pushToast({ title: 'Render job cancelled.', tone: 'info' });
      } catch (err) {
        pushToast({
          title: err instanceof Error ? err.message : 'Could not cancel job',
          tone: 'error',
        });
      }
    },
    [refreshActiveRuns, refreshReels, refreshHealth, pushToast],
  );

  const handleRetryReel = useCallback(
    async (reelId: string) => {
      const res = await apiFetch<{ run: PipelineRunDto }>(
        `/api/reels/${encodeURIComponent(reelId)}/retry`,
        { method: 'POST' },
      );
      void refreshReels();
      void refreshActiveRuns();
      navigate({ page: 'run', runId: res.run.id });
    },
    [refreshReels, refreshActiveRuns, navigate],
  );

  const handleRunFinished = useCallback(
    (run: PipelineRunDto) => {
      void refreshReels();
      void refreshHealth();
      void refreshActiveRuns();
      if (run.status === 'DONE' && run.reelId) {
        pushToast({
          title:
            run.trigger === 'publish'
              ? 'Reel published to Instagram!'
              : 'Reel is ready in Approval Studio!',
          tone: 'success',
        });
        navigate({ page: 'review', reelId: run.reelId });
      }
    },
    [refreshReels, refreshHealth, refreshActiveRuns, pushToast, navigate],
  );

  const reviewQueueReels = reels.filter((r) =>
    ['PUBLISHING', 'GENERATING', 'READY_FOR_REVIEW'].includes(r.status),
  );
  const llmState = health?.llm ?? null;
  const activeLlm = llmState?.activeEndpoint ?? null;
  const activeLlmLabel = activeLlm
    ? `${activeLlm.name}${activeLlm.model ? ` (${activeLlm.model})` : ''}`
    : 'Google Gemini';

  return (
    <div className="flex h-dvh overflow-hidden bg-[#09090B] text-zinc-100">
      {/* Persistent Sidebar */}
      <aside className="flex min-h-0 w-60 shrink-0 flex-col justify-between gap-4 overflow-y-auto border-r border-white/10 bg-[#0D0F15] p-4">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2 pt-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400 text-zinc-950 font-display font-bold">
              P
            </div>
            <div>
              <div className="font-display text-sm font-bold leading-none text-zinc-100">
                Post Studio
              </div>
              <div className="mt-1 font-mono text-[10px] text-zinc-400">AI Reels Automation</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedTopicForModal(null);
              setCustomModalOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-3.5 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
          >
            <Plus className="h-4 w-4" />
            New Custom Reel
          </button>

          <nav className="space-y-1">
            {(
              [
                { id: 'discover', label: 'Discover', icon: Compass, badge: null },
                {
                  id: 'runs',
                  label: 'Render Queue',
                  icon: Layers,
                  badge: activeRuns.length > 0 ? activeRuns.length : null,
                },
                {
                  id: 'review',
                  label: 'Review Queue',
                  icon: CheckSquare,
                  badge: reviewQueueReels.length > 0 ? reviewQueueReels.length : null,
                },
                { id: 'library', label: 'Library', icon: Archive, badge: null },
                { id: 'settings', label: 'Settings & Health', icon: Settings, badge: null },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active =
                route.page === item.id || (item.id === 'runs' && route.page === 'run');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    item.id === 'review'
                      ? navigate({ page: 'review', reelId: null })
                      : navigate({ page: item.id })
                  }
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 ${active ? 'text-cyan-300' : ''}`} />
                    {item.label}
                  </span>
                  {item.badge !== null ? (
                    <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Quick Switcher + Active Job Pill + Shortcut Hint */}
        <div className="space-y-3">
          {llmState && activeLlm ? (
            <div className="rounded-xl border border-white/10 bg-[#12151F] p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      llmState.scriptLlmReady ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  Script LLM
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ page: 'settings' })}
                  className="text-[10px] text-cyan-300 hover:text-cyan-200"
                >
                  Configure
                </button>
              </div>
              <select
                aria-label="Active Script LLM"
                value={llmState.activeEndpointId}
                disabled={switchingLlm}
                onChange={(e) => void handleSelectSidebarLlm(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#09090B] px-2 py-1.5 text-xs font-medium text-zinc-100 focus:border-cyan-400/60 focus:outline-none disabled:opacity-60"
              >
                {llmState.endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name}
                  </option>
                ))}
              </select>
              <p
                className="mt-1.5 truncate font-mono text-[10px] text-zinc-400"
                title={activeLlm.model || 'Model not configured'}
              >
                {activeLlm.model || 'Model not configured'}
              </p>
            </div>
          ) : null}

          {activeRuns.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/10 p-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-cyan-200">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Active Jobs ({activeRuns.length})
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ page: 'runs' })}
                  className="text-[10px] text-cyan-300 hover:underline"
                >
                  All
                </button>
              </div>
              <div className="space-y-1.5">
                {activeRuns.slice(0, 3).map((ar) => (
                  <div
                    key={ar.id}
                    className="flex items-center justify-between gap-1.5 rounded-lg border border-white/10 bg-[#0D1017]/80 px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => navigate({ page: 'run', runId: ar.id })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[11px] font-medium text-zinc-100">
                        {ar.reelTitle || ar.id}
                      </p>
                      <p className="truncate font-mono text-[10px] text-zinc-400">
                        {ar.status === 'QUEUED' ? 'queued' : `${ar.currentStep} · ${ar.progressPct}%`}
                      </p>
                    </button>
                    <button
                      type="button"
                      title="Cancel job"
                      aria-label={`Cancel ${ar.reelTitle || ar.id}`}
                      onClick={() => void handleCancelRun(ar.id)}
                      className="shrink-0 rounded p-1 text-zinc-400 transition hover:bg-red-500/20 hover:text-red-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {activeRuns.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => navigate({ page: 'runs' })}
                    className="w-full text-center font-mono text-[10px] text-cyan-300 hover:underline"
                  >
                    +{activeRuns.length - 3} more in queue
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerateSample}
              disabled={startingSample}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              {startingSample ? 'Starting Demo...' : 'Run Sample Demo'}
            </button>
          )}

          <div className="px-1 font-mono text-[10px] leading-relaxed text-zinc-500">
            <div>Cmd+K Custom Reel</div>
            <div>Space Play · S Toggle HUD</div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {route.page === 'discover' || route.page === 'settings' ? (
          <SetupReadinessStrip
            health={health}
            whisperProgress={whisperProgress}
            onDownloadWhisper={handleDownloadWhisper}
            onVerifyGemini={handleVerifyGemini}
            onGenerateSample={handleGenerateSample}
            onOpenSettings={() => navigate({ page: 'settings' })}
            checkingGemini={checkingGemini}
            startingSample={startingSample}
          />
        ) : null}

        {route.page === 'discover' ? (
          <DiscoverView
            topics={topics}
            loading={topicsLoading}
            fetching={fetchingTopics}
            activeLlmLabel={activeLlmLabel}
            scriptLlmReady={Boolean(llmState?.scriptLlmReady ?? health?.geminiConfigured)}
            ttsReady={Boolean(llmState?.ttsReady ?? health?.geminiConfigured)}
            onFetchLatest={handleFetchTopics}
            onOpenCustomModal={() => {
              setSelectedTopicForModal(null);
              setCustomModalOpen(true);
            }}
            onGenerateFromTopic={handleGenerateFromTopic}
            onDismissTopic={handleDismissTopic}
            onGenerateSample={handleGenerateSample}
          />
        ) : null}

        {route.page === 'runs' ? (
          <RunsView
            activeRuns={activeRuns}
            maxConcurrency={maxConcurrency}
            onOpenRun={(runId) => navigate({ page: 'run', runId })}
            onOpenReview={(reelId) => navigate({ page: 'review', reelId })}
            onRetryReel={handleRetryReel}
            onCancelRun={handleCancelRun}
            onOpenCustomModal={() => {
              setSelectedTopicForModal(null);
              setCustomModalOpen(true);
            }}
            onBackDiscover={() => navigate({ page: 'discover' })}
          />
        ) : null}

        {route.page === 'run' ? (
          <LiveRunView
            runId={route.runId}
            activeRuns={activeRuns}
            onRunFinished={handleRunFinished}
            onOpenReview={(reelId) => navigate({ page: 'review', reelId })}
            onRetryReel={handleRetryReel}
            onSelectRun={(runId) => navigate({ page: 'run', runId })}
            onOpenRuns={() => navigate({ page: 'runs' })}
            onOpenCustomModal={() => {
              setSelectedTopicForModal(null);
              setCustomModalOpen(true);
            }}
            onRunCancelled={() => {
              void refreshActiveRuns();
              void refreshReels();
            }}
            onBackDiscover={() => navigate({ page: 'discover' })}
          />
        ) : null}

        {route.page === 'review' ? (
          <ApprovalStudioView
            queueReels={reviewQueueReels}
            selectedReelId={route.reelId}
            brandHandle={health?.settings.brandHandle ?? '@ai.dev.reels'}
            metaStatus={metaCheck}
            videoRef={videoRef}
            safeZoneOpen={safeZoneOpen}
            onToggleSafeZone={() => setSafeZoneOpen((v) => !v)}
            onSelectReel={(reelId) => navigate({ page: 'review', reelId })}
            onRunStarted={(runId) => {
              void refreshActiveRuns();
              navigate({ page: 'run', runId });
            }}
            onRejectReel={handleRejectReel}
            onReelsChanged={() => void refreshReels()}
            onNotify={(title, tone) => pushToast({ title, tone })}
          />
        ) : null}

        {route.page === 'library' ? (
          <LibraryView
            reels={reels}
            onRetryReel={async (reelId) => {
              const res = await apiFetch<{ run: PipelineRunDto }>(
                `/api/reels/${encodeURIComponent(reelId)}/retry`,
                { method: 'POST' },
              );
              void refreshReels();
              navigate({ page: 'run', runId: res.run.id });
            }}
            onRestoreReel={async (reelId) => {
              await apiFetch(`/api/reels/${encodeURIComponent(reelId)}/restore`, {
                method: 'POST',
              });
              await refreshReels();
              navigate({ page: 'review', reelId });
            }}
            onDeleteReel={async (reelId) => {
              await apiFetch(`/api/reels/${encodeURIComponent(reelId)}`, { method: 'DELETE' });
              await refreshReels();
              pushToast({ title: 'Reel deleted.', tone: 'info' });
            }}
            onOpenReview={(reelId) => navigate({ page: 'review', reelId })}
          />
        ) : null}

        {route.page === 'settings' ? (
          <SettingsView
            health={health}
            geminiCheck={geminiCheck}
            metaCheck={metaCheck}
            whisperProgress={whisperProgress}
            onVerifyGemini={handleVerifyGemini}
            onVerifyMeta={handleVerifyMeta}
            onDownloadWhisper={handleDownloadWhisper}
            onSettingsUpdated={() => void refreshHealth()}
            onNotify={(title, tone) => pushToast({ title, tone })}
          />
        ) : null}
      </main>

      <CustomReelModal
        open={customModalOpen}
        topic={selectedTopicForModal}
        defaultVoice={health?.settings.defaultVoice ?? 'Puck'}
        defaultVoiceRotation={Boolean(health?.settings.voiceRotation)}
        defaultMusicEnabled={health?.settings.musicEnabled ?? true}
        llmState={llmState}
        ttsReady={Boolean(llmState?.ttsReady ?? health?.geminiConfigured)}
        onClose={() => {
          setCustomModalOpen(false);
          setSelectedTopicForModal(null);
        }}
        onGenerate={async (input: {
          topicId?: string;
          prompt?: string;
          url?: string;
          pillar?: ContentPillar;
          format?: ReelFormatId | 'auto';
          voiceName: VoiceName | 'auto';
          musicEnabled: boolean;
          llmEndpointId?: string;
          stayOnPage?: boolean;
        }) => {
          const { stayOnPage, ...payload } = input;
          const res = await apiFetch<{ reel: ReelDto; run: PipelineRunDto }>(
            '/api/reels/generate',
            { method: 'POST', body: JSON.stringify(payload) },
          );
          if (payload.topicId) {
            void refreshTopics();
          }
          void refreshReels();
          void refreshActiveRuns();
          if (stayOnPage) {
            pushToast({
              title: `Queued "${res.reel.title}" in background.`,
              description: 'Track progress or cancel anytime in Render Queue.',
              tone: 'success',
            });
          } else {
            navigate({ page: 'run', runId: res.run.id });
          }
        }}
        onError={(msg) => pushToast({ title: msg, tone: 'error' })}
      />

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
};
