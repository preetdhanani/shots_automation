import React from 'react';
import { PILLAR_LABELS, type ContentPillar } from '@post/core/shared';

const PILLAR_STYLES: Record<ContentPillar, string> = {
  ai_news: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  benchmarks: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  harnesses: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  coding_practices: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  vibe_coding: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export const PillarBadge: React.FC<{ pillar: ContentPillar }> = ({ pillar }) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide uppercase ${PILLAR_STYLES[pillar]}`}
    >
      {PILLAR_LABELS[pillar]}
    </span>
  );
};
