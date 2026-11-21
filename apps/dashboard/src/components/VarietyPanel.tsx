import React from 'react';
import {
  BACKGROUND_IDS,
  BACKGROUND_LABELS,
  CAPTION_STYLE_IDS,
  CAPTION_STYLE_LABELS,
  DEFAULT_REEL_STYLE,
  HOOK_STYLE_LABELS,
  MUSIC_MOOD_IDS,
  MUSIC_MOOD_LABELS,
  PALETTE_IDS,
  PALETTE_LABELS,
  REEL_FORMATS,
  TYPOGRAPHY_IDS,
  TYPOGRAPHY_LABELS,
  type BackgroundId,
  type CaptionStyleId,
  type MusicMoodId,
  type PaletteId,
  type ReelStoryboard,
  type ReelStyle,
  type TypographyId,
} from '@post/core/shared';
import { Shuffle, Sparkles } from 'lucide-react';
import type { ReelVarietyDto } from '../api.js';

interface Props {
  storyboard: ReelStoryboard;
  variety?: ReelVarietyDto;
  disabled?: boolean;
  reshuffling?: boolean;
  onChangeStyle: (nextStyle: ReelStyle) => void;
  onReshuffleStyle: () => void;
  onSelectSimilarReel?: (reelId: string) => void;
}

const SELECT_CLS =
  'w-full rounded-lg border border-white/10 bg-[#171A24] px-2.5 py-1.5 text-xs text-zinc-100 focus:border-cyan-400/60 focus:outline-none disabled:opacity-50';

export const VarietyPanel: React.FC<Props> = ({
  storyboard,
  variety,
  disabled = false,
  reshuffling = false,
  onChangeStyle,
  onReshuffleStyle,
  onSelectSimilarReel,
}) => {
  const style: ReelStyle = storyboard.style ?? { ...DEFAULT_REEL_STYLE };
  const formatSpec = storyboard.format ? REEL_FORMATS[storyboard.format] : null;
  const hookLabel = storyboard.hookStyle ? HOOK_STYLE_LABELS[storyboard.hookStyle] : null;
  const freshness = variety?.freshness;
  const score = freshness?.score ?? 100;

  const freshnessTone =
    score >= 70
      ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
      : score >= 45
        ? 'border-amber-500/35 bg-amber-500/12 text-amber-300'
        : 'border-rose-500/35 bg-rose-500/12 text-rose-300';

  const updateStyleField = <K extends keyof ReelStyle>(key: K, value: ReelStyle[K]) => {
    onChangeStyle({ ...style, [key]: value });
  };

  return (
    <div
      className="space-y-3.5 rounded-xl border border-white/10 bg-[#151822] p-4"
      data-testid="variety-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            Variety & Style
          </span>
          <span className="rounded-md border border-cyan-500/30 bg-cyan-500/12 px-2 py-0.5 font-mono text-[11px] font-medium text-cyan-200">
            {formatSpec ? formatSpec.label : 'Classic Format'}
          </span>
          {hookLabel ? (
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
              Hook: {hookLabel}
            </span>
          ) : null}
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold ${freshnessTone}`}
          >
            Freshness {score}%
          </span>
        </div>

        <button
          type="button"
          disabled={disabled || reshuffling}
          onClick={onReshuffleStyle}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/12 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-45"
        >
          <Shuffle className="h-3.5 w-3.5" />
          {reshuffling ? 'Reshuffling...' : 'Reshuffle Style'}
        </button>
      </div>

      {freshness?.mostSimilar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-[#11131B] px-3 py-2 text-[11px] text-zinc-400">
          <span>
            Compared with {freshness.comparedCount} recent reel
            {freshness.comparedCount === 1 ? '' : 's'} · Closest match:{' '}
            <strong className="text-zinc-200">{freshness.mostSimilar.title}</strong> (
            {Math.round(freshness.mostSimilar.similarity * 100)}% similar)
          </span>
          {onSelectSimilarReel ? (
            <button
              type="button"
              onClick={() => onSelectSimilarReel(freshness.mostSimilar!.reelId)}
              className="font-medium text-cyan-300 hover:underline"
            >
              Inspect
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">Background</label>
          <select
            aria-label="Style Background"
            disabled={disabled}
            value={style.background}
            onChange={(e) => updateStyleField('background', e.target.value as BackgroundId)}
            className={SELECT_CLS}
          >
            {BACKGROUND_IDS.map((id) => (
              <option key={id} value={id}>
                {BACKGROUND_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">Typography</label>
          <select
            aria-label="Style Typography"
            disabled={disabled}
            value={style.typography}
            onChange={(e) => updateStyleField('typography', e.target.value as TypographyId)}
            className={SELECT_CLS}
          >
            {TYPOGRAPHY_IDS.map((id) => (
              <option key={id} value={id}>
                {TYPOGRAPHY_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">Captions</label>
          <select
            aria-label="Style Captions"
            disabled={disabled}
            value={style.captionStyle}
            onChange={(e) => updateStyleField('captionStyle', e.target.value as CaptionStyleId)}
            className={SELECT_CLS}
          >
            {CAPTION_STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {CAPTION_STYLE_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">Palette</label>
          <select
            aria-label="Style Palette"
            disabled={disabled}
            value={style.palette}
            onChange={(e) => updateStyleField('palette', e.target.value as PaletteId)}
            className={SELECT_CLS}
          >
            {PALETTE_IDS.map((id) => (
              <option key={id} value={id}>
                {PALETTE_LABELS[id]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-400">Music Mood</label>
          <select
            aria-label="Style Music Mood"
            disabled={disabled}
            value={style.musicMood}
            onChange={(e) => updateStyleField('musicMood', e.target.value as MusicMoodId)}
            className={SELECT_CLS}
          >
            {MUSIC_MOOD_IDS.map((id) => (
              <option key={id} value={id}>
                {MUSIC_MOOD_LABELS[id]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
