import React, { useEffect, useState } from 'react';
import {
  CONTENT_PILLARS,
  PILLAR_LABELS,
  VOICE_NAMES,
  VOICE_PROFILES,
  type ContentPillar,
  type VoiceName,
} from '@post/core/shared';
import { Sparkles, Volume2, Square, X } from 'lucide-react';
import { playVoicePreview, stopVoicePreview, type LlmStateDto, type TopicDto } from '../api.js';
import { PillarBadge } from './PillarBadge.js';

interface Props {
  open: boolean;
  topic?: TopicDto | null;
  defaultVoice: VoiceName;
  defaultMusicEnabled: boolean;
  llmState: LlmStateDto | null;
  ttsReady: boolean;
  onClose: () => void;
  onGenerate: (input: {
    topicId?: string;
    prompt?: string;
    url?: string;
    pillar?: ContentPillar;
    voiceName: VoiceName;
    musicEnabled: boolean;
    llmEndpointId?: string;
    stayOnPage?: boolean;
  }) => Promise<void>;
  onError: (msg: string) => void;
}

export const CustomReelModal: React.FC<Props> = ({
  open,
  topic = null,
  defaultVoice,
  defaultMusicEnabled,
  llmState,
  ttsReady,
  onClose,
  onGenerate,
  onError,
}) => {
  const [prompt, setPrompt] = useState('');
  const [url, setUrl] = useState('');
  const [pillar, setPillar] = useState<ContentPillar>('harnesses');
  const [voiceName, setVoiceName] = useState<VoiceName>(defaultVoice);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(defaultMusicEnabled);
  const [llmEndpointId, setLlmEndpointId] = useState<string>(
    llmState?.activeEndpointId ?? 'gemini',
  );
  const [submitting, setSubmitting] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);

  useEffect(() => {
    if (!open) return;
    setVoiceName(defaultVoice);
    setMusicEnabled(defaultMusicEnabled);
    setLlmEndpointId(llmState?.activeEndpointId ?? 'gemini');
  }, [open, defaultVoice, defaultMusicEnabled, llmState?.activeEndpointId]);

  if (!open) return null;

  const endpoints = llmState?.endpoints ?? [];
  const selectedEndpoint =
    endpoints.find((ep) => ep.id === llmEndpointId) ?? llmState?.activeEndpoint ?? null;
  const scriptReady = Boolean(selectedEndpoint?.configured);
  const canGenerate = scriptReady && ttsReady;

  const submitGeneration = async (stayOnPage: boolean) => {
    if (!topic && !prompt.trim() && !url.trim()) {
      onError('Enter a topic idea or paste an article/GitHub URL.');
      return;
    }
    setSubmitting(true);
    try {
      stopVoicePreview();
      if (topic) {
        await onGenerate({
          topicId: topic.id,
          voiceName,
          musicEnabled,
          llmEndpointId: selectedEndpoint?.id,
          stayOnPage,
        });
      } else {
        await onGenerate({
          prompt: prompt.trim(),
          url: url.trim(),
          pillar,
          voiceName,
          musicEnabled,
          llmEndpointId: selectedEndpoint?.id,
          stayOnPage,
        });
        setPrompt('');
        setUrl('');
      }
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start generation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitGeneration(false);
  };

  const handlePreviewVoice = async () => {
    if (playingVoice === voiceName) {
      stopVoicePreview();
      return;
    }
    try {
      await playVoicePreview(voiceName, setPlayingVoice);
    } catch (err) {
      setPlayingVoice(null);
      onError(err instanceof Error ? err.message : 'Voice preview unavailable');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-reel-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/12 bg-[#11131B] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="custom-reel-title" className="text-lg font-semibold text-zinc-100">
              {topic ? 'Configure & Generate Reel' : 'Create Custom Reel'}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {topic
                ? 'Choose your voiceover voice, Script LLM, and audio options before generating.'
                : 'Enter a prompt, developer tip, or paste a blog/GitHub release URL.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopVoicePreview();
              onClose();
            }}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {topic ? (
            <div className="rounded-xl border border-white/10 bg-[#171A24] p-3.5">
              <div className="flex items-center gap-2">
                <PillarBadge pillar={topic.pillar} />
                <span className="font-mono text-[11px] text-zinc-400">{topic.sourceName}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-zinc-100">{topic.title}</p>
              {topic.summary ? (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{topic.summary}</p>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                  Topic Prompt or Developer Tip
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Example: Compare Claude Opus 4 vs Gemini 3.8 Flash on SWE-bench Verified and cost per million tokens"
                  className="w-full rounded-xl border border-white/10 bg-[#171A24] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                  Reference URL (optional)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/... or https://..."
                  className="w-full rounded-xl border border-white/10 bg-[#171A24] px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
                />
              </div>
            </>
          )}

          <div className={`grid grid-cols-1 gap-4 ${topic ? '' : 'sm:grid-cols-2'}`}>
            {!topic ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                  Content Pillar
                </label>
                <select
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value as ContentPillar)}
                  className="w-full rounded-xl border border-white/10 bg-[#171A24] px-3 py-2 text-sm text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {CONTENT_PILLARS.map((p) => (
                    <option key={p} value={p}>
                      {PILLAR_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Gemini TTS Voice
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value as VoiceName)}
                  className="w-full rounded-xl border border-white/10 bg-[#171A24] px-3 py-2 text-sm text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
                >
                  {VOICE_NAMES.map((v) => (
                    <option key={v} value={v}>
                      {v} - {VOICE_PROFILES[v].tone}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handlePreviewVoice}
                  title={
                    ttsReady
                      ? `Preview ${voiceName}`
                      : 'Plays cached voice preview if available (requires GEMINI_API_KEY on first run)'
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  {playingVoice === voiceName ? (
                    <Square className="h-3.5 w-3.5 text-cyan-300" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-cyan-300" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {endpoints.length > 0 ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Script LLM Endpoint
              </label>
              <select
                value={selectedEndpoint?.id ?? llmEndpointId}
                onChange={(e) => setLlmEndpointId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#171A24] px-3 py-2 text-sm text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
              >
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name} ({ep.model || 'Model unset'})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#171A24] px-3.5 py-2.5">
            <div>
              <span className="text-sm font-medium text-zinc-200">Subtle Background Music</span>
              <p className="text-xs text-zinc-400">
                Ducked ambient pad + soft scene transition clicks (-22dB)
              </p>
            </div>
            <input
              type="checkbox"
              checked={musicEnabled}
              onChange={(e) => setMusicEnabled(e.target.checked)}
              className="h-4 w-4 accent-cyan-400"
            />
          </label>

          {!canGenerate ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {(!selectedEndpoint || selectedEndpoint.provider === 'gemini') && !ttsReady ? (
                <>
                  GEMINI_API_KEY is missing in .env (needed for Gemini scripts and TTS voiceover).
                  Connect a custom LLM in Settings or click{' '}
                  <strong>Generate Sample Demo Reel</strong> to test offline.
                </>
              ) : selectedEndpoint && !selectedEndpoint.configured ? (
                <>
                  Selected endpoint <strong>{selectedEndpoint.name}</strong> is incomplete. Check
                  its Base URL and Model ID in Settings.
                </>
              ) : (
                <>
                  Script LLM (<strong>{selectedEndpoint?.name}</strong>) is ready, but voiceover
                  synthesis still requires <code>GEMINI_API_KEY</code> in .env for Google Gemini
                  TTS.
                </>
              )}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                stopVoicePreview();
                onClose();
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || !canGenerate}
              onClick={() => void submitGeneration(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {submitting ? 'Queuing...' : 'Queue in Background'}
            </button>
            <button
              type="submit"
              disabled={submitting || !canGenerate}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {submitting ? 'Starting...' : 'Generate & Watch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
