import type { ContentPillar, PaletteId, TypographyId } from '@post/core';

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

export interface ResolvedPalette extends PillarTheme {
  secondary: string;
  secondarySoft: string;
  surface: string;
  surfaceBorder: string;
  bgBase: string;
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

const COMPLEMENT_SECONDARIES: Record<ContentPillar, { secondary: string; secondarySoft: string }> = {
  ai_news: { secondary: '#F472B6', secondarySoft: 'rgba(244, 114, 182, 0.18)' },
  benchmarks: { secondary: '#60A5FA', secondarySoft: 'rgba(96, 165, 250, 0.18)' },
  harnesses: { secondary: '#2DD4BF', secondarySoft: 'rgba(45, 212, 191, 0.18)' },
  coding_practices: { secondary: '#818CF8', secondarySoft: 'rgba(129, 140, 248, 0.18)' },
  vibe_coding: { secondary: '#38BDF8', secondarySoft: 'rgba(56, 189, 248, 0.18)' },
};

const MONO_NEON_ACCENTS: Record<ContentPillar, { accent: string; soft: string; border: string; glow: string }> = {
  ai_news: {
    accent: '#00F5D4',
    soft: 'rgba(0, 245, 212, 0.14)',
    border: 'rgba(0, 245, 212, 0.52)',
    glow: 'rgba(0, 245, 212, 0.28)',
  },
  benchmarks: {
    accent: '#A3E635',
    soft: 'rgba(163, 230, 53, 0.14)',
    border: 'rgba(163, 230, 53, 0.52)',
    glow: 'rgba(163, 230, 53, 0.28)',
  },
  harnesses: {
    accent: '#E879F9',
    soft: 'rgba(232, 121, 249, 0.14)',
    border: 'rgba(232, 121, 249, 0.52)',
    glow: 'rgba(232, 121, 249, 0.28)',
  },
  coding_practices: {
    accent: '#FACC15',
    soft: 'rgba(250, 204, 21, 0.14)',
    border: 'rgba(250, 204, 21, 0.52)',
    glow: 'rgba(250, 204, 21, 0.28)',
  },
  vibe_coding: {
    accent: '#FF5E7E',
    soft: 'rgba(255, 94, 126, 0.14)',
    border: 'rgba(255, 94, 126, 0.52)',
    glow: 'rgba(255, 94, 126, 0.28)',
  },
};

export function resolvePalette(pillar: ContentPillar, paletteId: PaletteId): ResolvedPalette {
  const base = PILLAR_THEMES[pillar];
  const comp = COMPLEMENT_SECONDARIES[pillar];

  if (paletteId === 'complement') {
    return {
      ...base,
      secondary: comp.secondary,
      secondarySoft: comp.secondarySoft,
      surface: 'rgba(18, 19, 30, 0.94)',
      surfaceBorder: 'rgba(255, 255, 255, 0.14)',
      bgBase: '#0A0B12',
    };
  }

  if (paletteId === 'mono_neon') {
    const neon = MONO_NEON_ACCENTS[pillar];
    return {
      label: base.label,
      accent: neon.accent,
      accentSoft: neon.soft,
      accentBorder: neon.border,
      glow: neon.glow,
      secondary: '#FFFFFF',
      secondarySoft: 'rgba(255, 255, 255, 0.12)',
      surface: 'rgba(12, 12, 15, 0.96)',
      surfaceBorder: 'rgba(255, 255, 255, 0.18)',
      bgBase: '#050507',
    };
  }

  // Default: 'pillar' (preserves legacy studio appearance)
  return {
    ...base,
    secondary: '#3B82F6',
    secondarySoft: 'rgba(59, 130, 246, 0.14)',
    surface: 'rgba(17, 19, 27, 0.95)',
    surfaceBorder: 'rgba(255, 255, 255, 0.11)',
    bgBase: '#09090B',
  };
}

export const FONT_FAMILIES = {
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  sans: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
} as const;

/** Fixed heavy geometric sans for burnt-in captions across all reel typographies. */
export const CAPTION_FONT_FAMILY = "'Inter', 'Space Grotesk', system-ui, sans-serif";

export interface TypographyPreset {
  display: string;
  sans: string;
  mono: string;
  headlineTransform: 'none' | 'uppercase';
  headlineLetterSpacing: string;
  headlineScale: number;
}

export const TYPOGRAPHY_PRESETS: Record<TypographyId, TypographyPreset> = {
  grotesk: {
    display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    headlineTransform: 'none',
    headlineLetterSpacing: '-0.03em',
    headlineScale: 1,
  },
  condensed_caps: {
    display: "'Bebas Neue', 'Space Grotesk', system-ui, sans-serif",
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    headlineTransform: 'uppercase',
    headlineLetterSpacing: '0.025em',
    headlineScale: 1.12,
  },
  editorial_serif: {
    display: "'DM Serif Display', Georgia, serif",
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    headlineTransform: 'none',
    headlineLetterSpacing: '-0.015em',
    headlineScale: 1.02,
  },
  rounded_soft: {
    display: "'Nunito', 'Inter', system-ui, sans-serif",
    sans: "'Nunito', 'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    headlineTransform: 'none',
    headlineLetterSpacing: '-0.02em',
    headlineScale: 0.98,
  },
};
