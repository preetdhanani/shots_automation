import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT_FAMILIES, PILLAR_THEMES, SAFE_ZONE } from '../theme.js';
import type { ContentPillar } from '@post/core';

interface SafeFrameProps {
  pillar: ContentPillar;
  brandHandle: string;
  sceneIndex: number;
  totalScenes: number;
  children: React.ReactNode;
}

export const SafeFrame: React.FC<SafeFrameProps> = ({
  pillar,
  brandHandle,
  sceneIndex,
  totalScenes,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 36], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#09090B',
        color: '#F4F4F5',
        fontFamily: FONT_FAMILIES.sans,
        overflow: 'hidden',
      }}
    >
      {/* Ambient radial obsidian studio glow */}
      <div
        style={{
          position: 'absolute',
          inset: -120,
          background: `radial-gradient(circle at ${28 + drift * 0.25}% ${22 + drift * 0.15}%, ${theme.glow} 0%, rgba(9, 9, 11, 0) 54%), radial-gradient(circle at 82% 76%, rgba(59, 130, 246, 0.10) 0%, rgba(9, 9, 11, 0) 48%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Subtle developer dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          opacity: 0.42,
          pointerEvents: 'none',
        }}
      />

      {/* Top safe-zone micro header */}
      <div
        style={{
          position: 'absolute',
          top: SAFE_ZONE.topHeaderY,
          left: SAFE_ZONE.left,
          right: SAFE_ZONE.right,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: theme.accent,
              boxShadow: `0 0 12px ${theme.accent}`,
            }}
          />
          <span
            style={{
              fontFamily: FONT_FAMILIES.mono,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: theme.accent,
            }}
          >
            {theme.label}
          </span>
          {brandHandle ? (
            <span
              style={{
                fontFamily: FONT_FAMILIES.mono,
                fontSize: 20,
                color: '#A1A1AA',
                marginLeft: 6,
              }}
            >
              {brandHandle}
            </span>
          ) : null}
        </div>

        {/* Scene progress segments */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {Array.from({ length: totalScenes }).map((_, idx) => (
            <div
              key={idx}
              style={{
                width: idx === sceneIndex ? 32 : 14,
                height: 6,
                borderRadius: 999,
                backgroundColor:
                  idx <= sceneIndex ? theme.accent : 'rgba(255, 255, 255, 0.16)',
                opacity: idx < sceneIndex ? 0.65 : 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Main non-overlapping content safe zone (y=200..1400, x=64..930) */}
      <div
        style={{
          position: 'absolute',
          top: SAFE_ZONE.contentTop,
          bottom: SAFE_ZONE.contentBottom,
          left: SAFE_ZONE.left,
          right: SAFE_ZONE.right,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
