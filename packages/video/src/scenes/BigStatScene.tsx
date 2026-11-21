import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type BigStatScene as BigStatData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: BigStatData;
}

export const BigStatScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('big_stat', scene.visual?.layout);

  const numSpring = spring({ frame, fps, config: { damping: 13, stiffness: 135 } });
  const textSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 16, stiffness: 140 },
  });

  const trendBadge =
    scene.trend === 'up'
      ? { text: '▲ UPWARD SHIFT', color: '#34D399' }
      : scene.trend === 'down'
        ? { text: '▼ DROP', color: '#38BDF8' }
        : { text: '● KEY METRIC', color: palette.accent };

  const valueFontSize = scene.value.length > 7 ? 104 : scene.value.length > 4 ? 138 : 164;

  if (layout === 'split_context') {
    return (
      <div
        style={{
          backgroundColor: palette.surface,
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 30,
          overflow: 'hidden',
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 36px ${palette.glow}`,
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${palette.accentSoft} 0%, rgba(10,12,18,0.6) 100%)`,
            padding: '44px 38px 36px',
            borderBottom: `1.5px solid ${palette.accentBorder}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              fontWeight: 700,
              color: trendBadge.color,
              letterSpacing: '0.08em',
            }}
          >
            {trendBadge.text}
          </span>
          <div
            style={{
              opacity: numSpring,
              transform: `scale(${interpolate(numSpring, [0, 1], [0.82, 1])})`,
              transformOrigin: 'left center',
              fontFamily: fonts.mono,
              fontSize: Math.round(valueFontSize * 0.85),
              fontWeight: 700,
              lineHeight: 0.96,
              letterSpacing: '-0.04em',
              color: palette.accent,
              textShadow: `0 0 36px ${palette.glow}`,
            }}
          >
            {scene.value}
          </div>
        </div>

        <div
          style={{
            padding: '34px 38px 38px',
            opacity: textSpring,
            transform: `translateY(${interpolate(textSpring, [0, 1], [18, 0])}px)`,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(42 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.12,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.label} emphasis={scene.visual?.emphasis} />
          </h2>
          <p style={{ margin: 0, fontSize: 30, lineHeight: 1.4, color: '#D4D4D8' }}>
            {scene.context}
          </p>
          {scene.sourceLabel ? (
            <span style={{ fontFamily: fonts.mono, fontSize: 19, color: '#A1A1AA', marginTop: 4 }}>
              Source: {scene.sourceLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // Default: 'center'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 28,
        padding: '28px 16px',
      }}
    >
      <div
        style={{
          backgroundColor: palette.accentSoft,
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 999,
          padding: '10px 24px',
          fontFamily: fonts.mono,
          fontSize: 20,
          fontWeight: 700,
          color: trendBadge.color,
          letterSpacing: '0.08em',
        }}
      >
        {trendBadge.text}
      </div>

      <div
        style={{
          opacity: numSpring,
          transform: `scale(${interpolate(numSpring, [0, 1], [0.76, 1])})`,
          fontFamily: fonts.mono,
          fontSize: valueFontSize,
          fontWeight: 700,
          lineHeight: 0.94,
          letterSpacing: '-0.05em',
          color: palette.accent,
          textShadow: `0 0 46px ${palette.glow}`,
        }}
      >
        {scene.value}
      </div>

      <h2
        style={{
          margin: 0,
          opacity: textSpring,
          fontFamily: fonts.display,
          fontSize: Math.round(48 * fonts.headlineScale),
          fontWeight: 700,
          lineHeight: 1.1,
          textTransform: fonts.headlineTransform,
          color: '#FFFFFF',
        }}
      >
        <KineticText text={scene.label} emphasis={scene.visual?.emphasis} />
      </h2>

      <p
        style={{
          margin: 0,
          maxWidth: 740,
          opacity: textSpring,
          fontSize: 31,
          lineHeight: 1.4,
          color: '#D4D4D8',
        }}
      >
        {scene.context}
      </p>

      {scene.sourceLabel ? (
        <span style={{ fontFamily: fonts.mono, fontSize: 19, color: '#A1A1AA' }}>
          Source: {scene.sourceLabel}
        </span>
      ) : null}
    </div>
  );
};
