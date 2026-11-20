import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ContentPillar, TakeawayCtaScene as TakeawayData } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES } from '../theme.js';

interface Props {
  scene: TakeawayData;
  pillar: ContentPillar;
  brandHandle: string;
}

export const TakeawayCtaScene: React.FC<Props> = ({ scene, pillar, brandHandle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const mainSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const boxSpring = spring({
    frame: Math.max(0, frame - 6),
    fps,
    config: { damping: 15, stiffness: 135 },
  });
  const ctaSpring = spring({
    frame: Math.max(0, frame - 12),
    fps,
    config: { damping: 14, stiffness: 145 },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div
        style={{
          alignSelf: 'flex-start',
          opacity: mainSpring,
          backgroundColor: theme.accentSoft,
          border: `1.5px solid ${theme.accentBorder}`,
          borderRadius: 999,
          padding: '10px 22px',
        }}
      >
        <span
          style={{
            fontFamily: FONT_FAMILIES.mono,
            fontSize: 21,
            fontWeight: 700,
            color: theme.accent,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}
        >
          {scene.badge}
        </span>
      </div>

      <h2
        style={{
          margin: 0,
          opacity: mainSpring,
          transform: `translateY(${interpolate(mainSpring, [0, 1], [22, 0])}px)`,
          fontFamily: FONT_FAMILIES.display,
          fontSize: 58,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-0.025em',
          color: '#FFFFFF',
        }}
      >
        {scene.headline}
      </h2>

      {/* Key rule callout box */}
      <div
        style={{
          opacity: boxSpring,
          transform: `translateY(${interpolate(boxSpring, [0, 1], [20, 0])}px)`,
          backgroundColor: 'rgba(17, 19, 27, 0.96)',
          border: `1.5px solid ${theme.accentBorder}`,
          borderRadius: 24,
          padding: '32px 32px',
          boxShadow: `0 20px 54px rgba(0, 0, 0, 0.55), 0 0 32px ${theme.glow}`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: FONT_FAMILIES.sans,
            fontSize: 33,
            fontWeight: 600,
            lineHeight: 1.4,
            color: '#F4F4F5',
          }}
        >
          {scene.takeaway}
        </p>
      </div>

      {/* Bottom CTA */}
      <div
        style={{
          opacity: ctaSpring,
          transform: `scale(${interpolate(ctaSpring, [0, 1], [0.95, 1])})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          backgroundColor: theme.accent,
          color: '#09090B',
          borderRadius: 20,
          padding: '22px 28px',
        }}
      >
        <span
          style={{
            fontFamily: FONT_FAMILIES.display,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {scene.ctaText}
        </span>
        {brandHandle ? (
          <span
            style={{
              fontFamily: FONT_FAMILIES.mono,
              fontSize: 22,
              fontWeight: 700,
              backgroundColor: 'rgba(9, 9, 11, 0.14)',
              padding: '6px 14px',
              borderRadius: 10,
            }}
          >
            {brandHandle}
          </span>
        ) : null}
      </div>
    </div>
  );
};
