import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ContentPillar, HookTitleScene as HookTitleData } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES } from '../theme.js';

interface Props {
  scene: HookTitleData;
  pillar: ContentPillar;
}

export const HookTitleScene: React.FC<Props> = ({ scene, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const badgeSpring = spring({ frame, fps, config: { damping: 16, stiffness: 160 } });
  const titleSpring = spring({ frame: Math.max(0, frame - 4), fps, config: { damping: 15, stiffness: 130 } });
  const subSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 130 } });
  const statSpring = spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 14, stiffness: 140 } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      {/* Accent category badge */}
      <div
        style={{
          alignSelf: 'flex-start',
          opacity: badgeSpring,
          transform: `translateY(${interpolate(badgeSpring, [0, 1], [18, 0])}px)`,
          backgroundColor: theme.accentSoft,
          border: `1.5px solid ${theme.accentBorder}`,
          borderRadius: 999,
          padding: '12px 24px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: theme.accent,
          }}
        />
        <span
          style={{
            fontFamily: FONT_FAMILIES.mono,
            fontSize: 22,
            fontWeight: 700,
            color: theme.accent,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {scene.badge}
        </span>
      </div>

      {/* Hero headline */}
      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [28, 0])}px)`,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: FONT_FAMILIES.display,
            fontSize: 74,
            fontWeight: 700,
            lineHeight: 1.07,
            letterSpacing: '-0.03em',
            color: '#FAFAFA',
          }}
        >
          {scene.headline}
        </h1>
      </div>

      {/* Accent divider */}
      <div
        style={{
          width: interpolate(titleSpring, [0, 1], [0, 140]),
          height: 5,
          borderRadius: 999,
          backgroundColor: theme.accent,
          boxShadow: `0 0 20px ${theme.glow}`,
        }}
      />

      {/* Subheadline */}
      <p
        style={{
          margin: 0,
          opacity: subSpring,
          transform: `translateY(${interpolate(subSpring, [0, 1], [22, 0])}px)`,
          fontFamily: FONT_FAMILIES.sans,
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.38,
          color: '#D4D4D8',
        }}
      >
        {scene.subheadline}
      </p>

      {/* Highlight Stat Pill */}
      {scene.highlightStat ? (
        <div
          style={{
            marginTop: 8,
            alignSelf: 'flex-start',
            opacity: statSpring,
            transform: `scale(${interpolate(statSpring, [0, 1], [0.92, 1])})`,
            backgroundColor: 'rgba(20, 23, 31, 0.92)',
            border: `1.5px solid ${theme.accentBorder}`,
            borderRadius: 20,
            padding: '20px 28px',
            boxShadow: `0 16px 40px rgba(0,0,0,0.45), 0 0 28px ${theme.glow}`,
          }}
        >
          <span
            style={{
              fontFamily: FONT_FAMILIES.mono,
              fontSize: 36,
              fontWeight: 700,
              color: theme.accent,
              letterSpacing: '-0.02em',
            }}
          >
            {scene.highlightStat}
          </span>
        </div>
      ) : null}
    </div>
  );
};
