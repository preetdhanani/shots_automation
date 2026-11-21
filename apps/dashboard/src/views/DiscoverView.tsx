import React, { useMemo, useState } from 'react';
import { CONTENT_PILLARS, PILLAR_LABELS, type ContentPillar } from '@post/core/shared';
import { BrushCleaning, ExternalLink, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import type { TopicDto } from '../api.js';
import { PillarBadge } from '../components/PillarBadge.js';

interface Props {
  topics: TopicDto[];
  loading: boolean;
  fetching: boolean;
  activeLlmLabel: string;
  scriptLlmReady: boolean;
  ttsReady: boolean;
  onFetchLatest: () => void;
  onOpenCleanModal: () => void;
  onOpenCustomModal: () => void;
  onGenerateFromTopic: (topic: TopicDto) => void;
  onDismissTopic: (topic: TopicDto) => void;
  onGenerateSample: () => void;
}

function formatAge(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs) || diffMs < 0) return 'Recent';
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getTopicSignals(topic: TopicDto): string[] {
  const text = `${topic.title} ${topic.summary}`.toLowerCase();
  const tags: string[] = [];
  if (/\d+(\.\d+)?%|benchmark|swe-bench|gpqa|tok\/s|vs\b/.test(text)) {
    tags.push('Benchmark Data');
  }
  if (/release|v\d+\.\d+|cli|mcp|code|hook|agent/.test(text)) {
    tags.push('Code / Release');
  }
  return tags;
}

export const DiscoverView: React.FC<Props> = ({
  topics,
  loading,
  fetching,
  activeLlmLabel,
  scriptLlmReady,
  ttsReady,
  onFetchLatest,
  onOpenCleanModal,
  onOpenCustomModal,
  onGenerateFromTopic,
  onDismissTopic,
  onGenerateSample,
}) => {
  const [selectedPillar, setSelectedPillar] = useState<'all' | ContentPillar>('all');

  const filteredTopics = useMemo(() => {
    if (selectedPillar === 'all') return topics;
    return topics.filter((t) => t.pillar === selectedPillar);
  }, [topics, selectedPillar]);

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Discover AI & Dev Topics
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Ranked signals across AI labs, model benchmarks, coding harnesses, and dev workflows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenCleanModal}
            disabled={loading || fetching || topics.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#141720] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <BrushCleaning className="h-3.5 w-3.5 text-amber-300" />
            Clean Feed
          </button>
          <button
            type="button"
            onClick={onOpenCustomModal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#141720] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5 text-cyan-300" />
            New Custom Reel
          </button>
          <button
            type="button"
            onClick={onFetchLatest}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching Feeds...' : 'Fetch Latest'}
          </button>
        </div>
      </div>

      {/* Pillar filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedPillar('all')}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            selectedPillar === 'all'
              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
              : 'border-white/10 bg-[#12151E] text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All ({topics.length})
        </button>
        {CONTENT_PILLARS.map((pillar) => {
          const count = topics.filter((t) => t.pillar === pillar).length;
          return (
            <button
              key={pillar}
              type="button"
              onClick={() => setSelectedPillar(pillar)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                selectedPillar === pillar
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/10 bg-[#12151E] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {PILLAR_LABELS[pillar]} ({count})
            </button>
          );
        })}
      </div>

      {/* Topic Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-white/10 bg-[#11131B]"
            />
          ))}
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-[#11131B]/60 p-10 text-center">
          <h3 className="text-base font-semibold text-zinc-200">No topics in this filter yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
            Click <strong>Fetch Latest</strong> to pull today&apos;s AI releases, benchmarks, and
            coding tips, or test the studio offline with a sample demo Reel.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onFetchLatest}
              disabled={fetching}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Fetch Latest Topics
            </button>
            <button
              type="button"
              onClick={onGenerateSample}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              Generate Sample Demo Reel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredTopics.map((topic) => {
            const signals = getTopicSignals(topic);
            return (
              <article
                key={topic.id}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#11131B] p-5 transition hover:border-white/20"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PillarBadge pillar={topic.pillar} />
                      <span className="font-mono text-[11px] text-zinc-400">
                        {topic.sourceName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400">
                      <span>{formatAge(topic.publishedAt)}</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                        Score {topic.score.toFixed(0)}
                      </span>
                    </div>
                  </div>

                  <h3 className="mt-3 text-base font-semibold leading-snug text-zinc-100">
                    {topic.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">
                    {topic.summary}
                  </p>

                  {signals.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {signals.map((sig) => (
                        <span
                          key={sig}
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                        >
                          {sig}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3.5">
                  <div className="flex items-center gap-2">
                    <a
                      href={topic.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onDismissTopic(topic)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-white/5 hover:text-red-300"
                    >
                      <Trash2 className="h-3 w-3" /> Dismiss
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onGenerateFromTopic(topic)}
                    title={
                      scriptLlmReady && ttsReady
                        ? `Generate 9:16 Reel with ${activeLlmLabel}`
                        : !scriptLlmReady
                          ? 'Configure an active Script LLM in Settings first'
                          : 'GEMINI_API_KEY is required in .env for Gemini TTS voiceover'
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400/95 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate Reel
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
