import type { ContentPillar } from '@post/core';

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

export const SAFE_ZONE = {
  left: 76,
  right: 136,
  topHeaderY: 132,
  contentTop: 200,
  contentBottom: 530, // 1920 - 530 = 1390px
  captionBottom: 390, // 1400..1530px
  captionHeight: 130,
} as const;

export interface PillarTheme {
  label: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  glow: string;
}

export const PILLAR_THEMES: Record<ContentPillar, PillarTheme> = {
  ai_news: {
    label: 'AI NEWS',
    accent: '#22D3EE',
    accentSoft: 'rgba(34, 211, 238, 0.14)',
    accentBorder: 'rgba(34, 211, 238, 0.4)',
    glow: 'rgba(34, 211, 238, 0.22)',
  },
  benchmarks: {
    label: 'BENCHMARKS',
    accent: '#34D399',
    accentSoft: 'rgba(52, 211, 153, 0.14)',
    accentBorder: 'rgba(52, 211, 153, 0.42)',
    glow: 'rgba(52, 211, 153, 0.22)',
  },
  harnesses: {
    label: 'AI HARNESS',
    accent: '#A78BFA',
    accentSoft: 'rgba(167, 139, 250, 0.15)',
    accentBorder: 'rgba(167, 139, 250, 0.42)',
    glow: 'rgba(167, 139, 250, 0.24)',
  },
  coding_practices: {
    label: 'CODING TIP',
    accent: '#FBBF24',
    accentSoft: 'rgba(251, 191, 36, 0.14)',
    accentBorder: 'rgba(251, 191, 36, 0.42)',
    glow: 'rgba(251, 191, 36, 0.20)',
  },
  vibe_coding: {
    label: 'VIBE CODING',
    accent: '#FB7185',
    accentSoft: 'rgba(251, 113, 133, 0.14)',
    accentBorder: 'rgba(251, 113, 133, 0.42)',
    glow: 'rgba(251, 113, 133, 0.22)',
  },
};

export const FONT_FAMILIES = {
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
} as const;
