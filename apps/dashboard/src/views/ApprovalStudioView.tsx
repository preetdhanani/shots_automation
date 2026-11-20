import React, { useEffect, useMemo, useState } from 'react';
import {
  assembleInstagramCaption,
  VOICE_NAMES,
  VOICE_PROFILES,
  type ReelStoryboard,
  type VoiceName,
} from '@post/core/shared';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { InstagramIcon } from '../components/InstagramIcon.js';
import {
  apiFetch,
  playVoicePreview,
  stopVoicePreview,
  type MetaCheckDto,
  type PublishResultDto,
  type ReelDetailDto,
  type ReelDto,
} from '../api.js';
import { PhonePreview } from '../components/PhonePreview.js';
import { PillarBadge } from '../components/PillarBadge.js';
import { PublishModal } from '../components/PublishModal.js';
import { VisualSceneEditor } from '../components/VisualSceneEditor.js';

interface Props {
  queueReels: ReelDto[];
  selectedReelId: string | null;
  brandHandle: string;
  metaStatus: MetaCheckDto | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  safeZoneOpen: boolean;
  onToggleSafeZone: () => void;
  onSelectReel: (reelId: string) => void;
  onRunStarted: (runId: string) => void;
  onRejectReel: (reel: ReelDto) => void;
  onReelsChanged: () => void;
  onNotify: (title: string, tone?: 'info' | 'success' | 'error') => void;
}

type StudioTab = 'publish' | 'storyboard' | 'audit';

export const ApprovalStudioView: React.FC<Props> = ({
  queueReels,
  selectedReelId,
  brandHandle,
  metaStatus,
  videoRef,
  safeZoneOpen,
  onToggleSafeZone,
  onSelectReel,
  onRunStarted,
  onRejectReel,
  onReelsChanged,
  onNotify,
}) => {
  const [detail, setDetail] = useState<ReelDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>('publish');
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);

  // Lifted edit state shared across all 3 studio tabs
  const [draftCaption, setDraftCaption] = useState('');
  const [draftHashtags, setDraftHashtags] = useState<string[]>([]);
  const [draftStoryboard, setDraftStoryboard] = useState<ReelStoryboard | null>(null);
  const [draftVoice, setDraftVoice] = useState<VoiceName>('Puck');
  const [draftMusicEnabled, setDraftMusicEnabled] = useState(true);

  const activeId = selectedReelId ?? queueReels[0]?.id ?? null;

  const loadDetail = async (id: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<ReelDetailDto>(`/api/reels/${encodeURIComponent(id)}`);
      setDetail(res);
      setDraftCaption(res.reel.caption);
      setDraftHashtags(res.reel.hashtags);
      setDraftStoryboard(res.reel.storyboard);
      setDraftVoice(res.reel.voiceName);
      setDraftMusicEnabled(res.reel.musicEnabled);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to load reel', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeId) {
      void loadDetail(activeId);
    } else {
      setDetail(null);
    }
  }, [activeId]);

  const reel = detail?.reel ?? null;

  const hasUnsavedDraft = useMemo(() => {
    if (!reel || !draftStoryboard) return false;
    return (
      draftCaption !== reel.caption ||
      JSON.stringify(draftHashtags) !== JSON.stringify(reel.hashtags) ||
      draftVoice !== reel.voiceName ||
      draftMusicEnabled !== reel.musicEnabled ||
      JSON.stringify(draftStoryboard) !== JSON.stringify(reel.storyboard)
    );
  }, [reel, draftCaption, draftHashtags, draftVoice, draftMusicEnabled, draftStoryboard]);

  const audioEditedLocally = useMemo(() => {
    if (!reel || !draftStoryboard) return false;
    if (draftVoice !== (reel.renderedVoiceName ?? reel.voiceName)) return true;
    const savedNarr = reel.storyboard.scenes.map((s) => s.narration.trim()).join('|');
    const draftNarr = draftStoryboard.scenes.map((s) => s.narration.trim()).join('|');
    return savedNarr !== draftNarr || Boolean(detail?.staleness.audioDirty);
  }, [reel, draftStoryboard, draftVoice, detail?.staleness.audioDirty]);

  const visualsEditedLocally = useMemo(() => {
    if (!reel || !draftStoryboard) return false;
    return (
      audioEditedLocally ||
      draftMusicEnabled !== reel.musicEnabled ||
      JSON.stringify(draftStoryboard) !== JSON.stringify(reel.storyboard) ||
      Boolean(detail?.staleness.visualsDirty)
    );
  }, [reel, draftStoryboard, draftMusicEnabled, audioEditedLocally, detail?.staleness.visualsDirty]);

  const assembledLength = useMemo(
    () => assembleInstagramCaption(draftCaption, draftHashtags).length,
    [draftCaption, draftHashtags],
  );

  const flushEdits = async (): Promise<ReelDto | null> => {
    if (!reel || !draftStoryboard) return null;
    if (!hasUnsavedDraft) return reel;
    if (['GENERATING', 'PUBLISHING', 'PUBLISHED'].includes(reel.status)) return reel;

    setSaving(true);
    try {
      const res = await apiFetch<{ reel: ReelDto; staleness: ReelDetailDto['staleness'] }>(
        `/api/reels/${encodeURIComponent(reel.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: draftStoryboard.title,
            caption: draftCaption,
            hashtags: draftHashtags,
            voiceName: draftVoice,
            musicEnabled: draftMusicEnabled,
            storyboard: draftStoryboard,
          }),
        },
      );
      setDetail((prev) => (prev ? { ...prev, reel: res.reel, staleness: res.staleness } : prev));
      onReelsChanged();
      return res.reel;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOnly = async () => {
    try {
      await flushEdits();
      onNotify('Saved draft changes.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  const handleRerender = async () => {
    if (!reel) return;
    setActionBusy(true);
    try {
      await flushEdits();
      const res = await apiFetch<{ run: { id: string } }>(
        `/api/reels/${encodeURIComponent(reel.id)}/rerender`,
        { method: 'POST' },
      );
      onReelsChanged();
      onRunStarted(res.run.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Re-render failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRegenerateVoice = async () => {
    if (!reel) return;
    setActionBusy(true);
    try {
      await flushEdits();
      const res = await apiFetch<{ run: { id: string } }>(
        `/api/reels/${encodeURIComponent(reel.id)}/regenerate-audio`,
        { method: 'POST' },
      );
      onReelsChanged();
      onRunStarted(res.run.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Regeneration failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleOpenPublishModal = async () => {
    try {
      await flushEdits();
      setPublishModalOpen(true);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed before publish', 'error');
    }
  };

  const handleDryRun = async (): Promise<PublishResultDto> => {
    if (!reel) throw new Error('No reel loaded');
    await flushEdits();
    return apiFetch<PublishResultDto>(`/api/reels/${encodeURIComponent(reel.id)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
    });
  };

  const handleConfirmPublish = async () => {
    if (!reel) return;
    await flushEdits();
    const res = await apiFetch<{ run: { id: string } }>(
      `/api/reels/${encodeURIComponent(reel.id)}/publish`,
      { method: 'POST', body: JSON.stringify({ dryRun: false }) },
    );
    onReelsChanged();
    onRunStarted(res.run.id);
  };

  const handleReconcile = async () => {
    if (!reel) return;
    setActionBusy(true);
    try {
      const res = await apiFetch<{ run: { id: string } }>(
        `/api/reels/${encodeURIComponent(reel.id)}/reconcile`,
        { method: 'POST' },
      );
      onReelsChanged();
      onRunStarted(res.run.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Reconcile failed', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyCaption = async () => {
    const text = assembleInstagramCaption(draftCaption, draftHashtags);
    await navigator.clipboard.writeText(text);
    onNotify('Copied caption + hashtags to clipboard.', 'success');
  };

  const handleAddTag = () => {
    const clean = tagInput.trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!clean) return;
    const tag = `#${clean}`;
    if (!draftHashtags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraftHashtags([...draftHashtags, tag]);
    }
    setTagInput('');
  };

  if (queueReels.length === 0 && !activeId) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-[#11131B]/60 p-10 text-center">
        <h2 className="text-lg font-semibold text-zinc-100">Review Queue is Empty</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Generate a Reel from Discover or run the offline Sample Demo Reel to review it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Queue Switcher Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(reel && !queueReels.some((q) => q.id === reel.id) ? [reel, ...queueReels] : queueReels).map((q) => {
          const isSelected = q.id === activeId;
          const badge =
            q.status === 'PUBLISHING'
              ? 'Reconcile'
              : q.status === 'GENERATING'
                ? 'Building'
                : q.status === 'FAILED'
                  ? 'Failed'
                  : q.status === 'PUBLISHED'
                    ? 'Published'
                    : q.status === 'REJECTED'
                      ? 'Rejected'
                      : q.isSample
                        ? 'Sample'
                        : 'Ready';

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onSelectReel(q.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition ${
                isSelected
                  ? 'border-cyan-400/55 bg-cyan-500/15 text-zinc-100'
                  : 'border-white/10 bg-[#11131B] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  q.status === 'PUBLISHING'
                    ? 'bg-amber-500/20 text-amber-200'
                    : q.status === 'GENERATING'
                      ? 'bg-cyan-500/20 text-cyan-200'
                      : q.status === 'FAILED'
                        ? 'bg-red-500/20 text-red-200'
                        : q.status === 'REJECTED'
                          ? 'bg-zinc-500/20 text-zinc-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                }`}
              >
                {badge}
              </span>
              <span className="max-w-[200px] truncate font-medium">{q.title}</span>
            </button>
          );
        })}
      </div>

      {loading || !reel || !draftStoryboard ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-[#11131B]">
          <RefreshCw className="h-5 w-5 animate-spin text-cyan-400" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left Sticky Phone Preview Stage */}
          <div className="flex flex-col items-center justify-start rounded-2xl border border-white/10 bg-[#11131B]/70 p-4">
            <PhonePreview
              reel={reel}
              sceneTimings={detail?.sceneTimings ?? []}
              brandHandle={brandHandle}
              videoRef={videoRef}
              safeZoneOpen={safeZoneOpen}
              onToggleSafeZone={onToggleSafeZone}
            />
          </div>

          {/* Right Independently Scrollable Studio Panel */}
          <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-[#11131B]">
            {/* Studio Header & Tabs */}
            <div className="border-b border-white/10 px-5 pt-4 pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PillarBadge pillar={reel.pillar} />
                    {reel.isSample ? (
                      <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] text-amber-200">
                        Offline Demo Sample
                      </span>
                    ) : null}
                    {hasUnsavedDraft ? (
                      <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-200">
                        Unsaved edits
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 truncate text-lg font-bold text-zinc-100">{reel.title}</h2>
                </div>

                {hasUnsavedDraft ? (
                  <button
                    type="button"
                    onClick={handleSaveOnly}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving...' : 'Save Draft'}
                  </button>
                ) : null}
              </div>

              <div className="mt-3 flex gap-1">
                {(
                  [
                    ['publish', 'Approve & Publish'],
                    ['storyboard', 'Storyboard & Voice'],
                    ['audit', 'Audit & Sources'],
                  ] as Array<[StudioTab, string]>
                ).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setActiveTab(tabId)}
                    className={`border-b-2 px-3.5 py-2.5 text-xs font-semibold transition ${
                      activeTab === tabId
                        ? 'border-cyan-400 text-cyan-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Tab Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {reel.status === 'PUBLISHING' ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-100">
                  <div>
                    <p className="font-semibold">Publish In Progress / Needs Reconciliation</p>
                    <p className="mt-0.5 text-amber-200/80">
                      {reel.errorMessage || 'A previous upload container is active on Meta. Reconcile safely without double-posting.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReconcile}
                    disabled={actionBusy}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-zinc-950 transition hover:bg-amber-300"
                  >
                    Reconcile / Resume Publish
                  </button>
                </div>
              ) : null}

              {reel.alignmentMode === 'estimated' ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Captions use estimated timing because the Whisper model is not downloaded yet. Download Whisper in Settings for exact word sync.
                  </span>
                </div>
              ) : null}

              {visualsEditedLocally && activeTab === 'publish' ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  <span>
                    {audioEditedLocally
                      ? 'Spoken narration or voice changed. Regenerate Voice & Video before publishing.'
                      : 'Visual scenes or music changed. Re-render video so the MP4 matches your edits.'}
                  </span>
                  <button
                    type="button"
                    onClick={audioEditedLocally ? handleRegenerateVoice : handleRerender}
                    disabled={actionBusy}
                    className="rounded-lg bg-cyan-400 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-cyan-300"
                  >
                    {audioEditedLocally ? 'Regenerate Voice & Video' : 'Re-render Video'}
                  </button>
                </div>
              ) : null}

              {activeTab === 'publish' ? (
                <div className="space-y-5">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-200">
                        Instagram Caption
                      </label>
                      <span
                        className={`font-mono text-[11px] ${
                          assembledLength > 2200 ? 'text-red-400' : 'text-zinc-400'
                        }`}
                      >
                        {assembledLength} / 2200 total (with hashtags)
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={draftCaption}
                      onChange={(e) => setDraftCaption(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#171A24] p-3 text-sm leading-relaxed text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
                    />
                  </div>

                  {/* Hashtag Chip Editor */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-200">
                      Hashtags
                    </label>
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#171A24] p-2.5">
                      {draftHashtags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-xs text-cyan-200"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() =>
                              setDraftHashtags(draftHashtags.filter((t) => t !== tag))
                            }
                            aria-label={`Remove ${tag}`}
                            className="text-cyan-300/70 hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder="Add #tag + Enter"
                        className="min-w-[130px] flex-1 bg-transparent px-1.5 py-1 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Primary & Fallback Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {reel.videoPath ? (
                        <a
                          href={`/api/reels/${reel.id}/video?download=1`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download MP4
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Video not rendered yet"
                          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 opacity-45"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download MP4
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCopyCaption}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Caption
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectReel(reel)}
                        disabled={reel.status === 'GENERATING' || reel.status === 'PUBLISHING'}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-45"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenPublishModal}
                      disabled={
                        reel.status !== 'READY_FOR_REVIEW' ||
                        assembledLength > 2200 ||
                        visualsEditedLocally
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-45"
                    >
                      <InstagramIcon className="h-4 w-4" />
                      {reel.isSample ? 'Dry-Run / Inspect Publish' : 'Approve & Publish to Instagram'}
                    </button>
                  </div>
                </div>
              ) : null}

              {activeTab === 'storyboard' ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-[#151822] p-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-300">
                        Voiceover Voice
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          value={draftVoice}
                          onChange={(e) => setDraftVoice(e.target.value as VoiceName)}
                          className="w-full rounded-lg border border-white/10 bg-[#10131C] px-3 py-1.5 text-sm text-zinc-100"
                        >
                          {VOICE_NAMES.map((v) => (
                            <option key={v} value={v}>
                              {v} ({VOICE_PROFILES[v].tone})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await playVoicePreview(draftVoice, setPlayingVoice);
                            } catch (err) {
                              onNotify(
                                err instanceof Error ? err.message : 'Preview unavailable',
                                'error',
                              );
                            }
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 p-2 text-cyan-300 hover:bg-white/10"
                          title="Audition selected voice"
                        >
                          <Volume2 className={`h-4 w-4 ${playingVoice ? 'animate-pulse' : ''}`} />
                        </button>
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-[#10131C] px-3.5 py-2">
                      <div>
                        <span className="text-xs font-medium text-zinc-200">
                          Background Music & SFX
                        </span>
                        <p className="text-[11px] text-zinc-400">Subtle -22dB pad + clicks</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftMusicEnabled}
                        onChange={(e) => {
                          stopVoicePreview();
                          setDraftMusicEnabled(e.target.checked);
                        }}
                        className="h-4 w-4 accent-cyan-400"
                      />
                    </label>
                  </div>

                  <VisualSceneEditor
                    storyboard={draftStoryboard}
                    onChange={setDraftStoryboard}
                  />

                  <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={handleRerender}
                      disabled={audioEditedLocally || actionBusy || reel.status === 'GENERATING'}
                      title={
                        audioEditedLocally
                          ? 'Narration or voice changed - regenerate voice + video instead'
                          : 'Re-render visuals keeping existing voiceover'
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Re-render Video (Fast - Keeps Voice)
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateVoice}
                      disabled={actionBusy || reel.status === 'GENERATING'}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Regenerate Voice & Video
                    </button>
                  </div>
                </div>
              ) : null}

              {activeTab === 'audit' ? (
                <div className="space-y-5 text-xs">
                  <div>
                    <h3 className="mb-2 font-semibold text-zinc-200">Grounded Sources</h3>
                    <div className="space-y-2">
                      {reel.storyboard.sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-[#151822] px-3.5 py-2.5 text-zinc-200 hover:border-cyan-400/40"
                        >
                          <span>{src.title}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-cyan-300" />
                        </a>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold text-zinc-200">Render & Spec Verification</h3>
                    <div className="rounded-xl border border-white/10 bg-[#0D1017] p-3 font-mono text-[11px] text-zinc-300">
                      <p>Alignment Mode: {reel.alignmentMode ?? 'none'}</p>
                      <p>
                        Duration: {reel.audioDurationMs ? `${(reel.audioDurationMs / 1000).toFixed(2)}s` : 'n/a'}
                      </p>
                      {reel.ffprobeJson ? (
                        <pre className="mt-2 overflow-x-auto text-zinc-400">
                          {JSON.stringify(JSON.parse(reel.ffprobeJson), null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold text-zinc-200">
                      Meta Publish Attempts ({detail?.publishAttempts.length ?? 0})
                    </h3>
                    {(detail?.publishAttempts.length ?? 0) === 0 ? (
                      <p className="text-zinc-400">No Instagram publish attempts yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detail!.publishAttempts.map((att) => (
                          <div
                            key={att.id}
                            className="rounded-xl border border-white/10 bg-[#151822] p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-zinc-200">
                                <Check className="h-3 w-3 text-cyan-300" />
                                {att.state}
                              </span>
                              <span className="font-mono text-zinc-400">{att.createdAt}</span>
                            </div>
                            {att.containerId ? (
                              <p className="mt-1 font-mono text-[11px] text-zinc-400">
                                Container: {att.containerId}
                              </p>
                            ) : null}
                            {att.errorMessage ? (
                              <p className="mt-1 text-red-300">{att.errorMessage}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {reel ? (
        <PublishModal
          open={publishModalOpen}
          reel={reel}
          caption={draftCaption}
          hashtags={draftHashtags}
          metaStatus={metaStatus}
          onClose={() => setPublishModalOpen(false)}
          onDryRun={handleDryRun}
          onConfirmPublish={handleConfirmPublish}
        />
      ) : null}
    </div>
  );
};
