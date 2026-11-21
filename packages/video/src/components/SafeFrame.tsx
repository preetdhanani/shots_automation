import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { ContentPillar } from '@post/core';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { SAFE_ZONE } from '../theme.js';
import { BackgroundRenderer } from './backgrounds/BackgroundRenderer.js';

interface SafeFrameProps {
  pillar: ContentPillar;
  brandHandle: string;
  sceneIndex: number;
  totalScenes: number;
  children: React.ReactNode;
}

export const SafeFrame: React.FC<SafeFrameProps> = ({
  brandHandle,
  sceneIndex,
  totalScenes,
  children,
}) => {
  const { palette, fonts } = useReelStyle();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.bgBase,
        color: '#F4F4F5',
        fontFamily: fonts.sans,
        overflow: 'hidden',
      }}
    >
      <BackgroundRenderer />

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
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              backgroundColor: palette.accent,
              boxShadow: `0 0 12px ${palette.accent}`,
            }}
          />
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: palette.accent,
            }}
          >
            {palette.label}
          </span>
          {brandHandle ? (
            <span
              style={{
                fontFamily: fonts.mono,
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
                  idx <= sceneIndex ? palette.accent : 'rgba(255, 255, 255, 0.16)',
                opacity: idx < sceneIndex ? 0.65 : 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Main non-overlapping content safe zone (y=200..1390, x=76..944) */}
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
          zIndex: 3,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
