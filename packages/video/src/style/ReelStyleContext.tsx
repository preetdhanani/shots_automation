import React, { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_REEL_STYLE,
  type ContentPillar,
  type ReelFormatId,
  type ReelStyle,
} from '@post/core';
import {
  resolvePalette,
  TYPOGRAPHY_PRESETS,
  type ResolvedPalette,
  type TypographyPreset,
} from '../theme.js';

export interface ReelStyleContextValue {
  pillar: ContentPillar;
  format?: ReelFormatId;
  style: ReelStyle;
  palette: ResolvedPalette;
  fonts: TypographyPreset;
  assetUrls: Record<string, string>;
}

const DEFAULT_VALUE: ReelStyleContextValue = {
  pillar: 'harnesses',
  style: DEFAULT_REEL_STYLE,
  palette: resolvePalette('harnesses', 'pillar'),
  fonts: TYPOGRAPHY_PRESETS.grotesk,
  assetUrls: {},
};

const ReelStyleContext = createContext<ReelStyleContextValue>(DEFAULT_VALUE);

export const ReelStyleProvider: React.FC<{
  pillar: ContentPillar;
  format?: ReelFormatId;
  style?: ReelStyle;
  assetUrls?: Record<string, string>;
  children: React.ReactNode;
}> = ({ pillar, format, style, assetUrls, children }) => {
  const value = useMemo<ReelStyleContextValue>(() => {
    const resolvedStyle: ReelStyle = style ?? DEFAULT_REEL_STYLE;
    return {
      pillar,
      format,
      style: resolvedStyle,
      palette: resolvePalette(pillar, resolvedStyle.palette),
      fonts: TYPOGRAPHY_PRESETS[resolvedStyle.typography],
      assetUrls: assetUrls ?? {},
    };
  }, [pillar, format, style, assetUrls]);

  return <ReelStyleContext.Provider value={value}>{children}</ReelStyleContext.Provider>;
};

export function useReelStyle(): ReelStyleContextValue {
  return useContext(ReelStyleContext);
}
