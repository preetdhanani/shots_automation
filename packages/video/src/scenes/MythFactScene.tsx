import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type MythFactScene as MythFactData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: MythFactData;
}

export const MythFactScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('myth_fact', scene.visual?.layout);

  const mythSpring = spring({ frame, fps, config: { damping: 16, stiffness: 150 } });
  const strikeProgress = interpolate(frame, [10, 20], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const factSpring = spring({
    frame: Math.max(0, frame - 14),
    fps,
    config: { damping: 14, stiffness: 145 },
  });

  if (layout === 'stacked') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            opacity: mythSpring,
            backgroundColor: 'rgba(248, 113, 113, 0.09)',
            border: '1.5px solid rgba(248, 113, 113, 0.4)',
            borderRadius: 24,
            padding: '30px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 21,
              fontWeight: 700,
              color: '#F87171',
              letterSpacing: '0.08em',
            }}
          >
            ✕ THE MYTH
          </span>
          <p
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: 36,
              fontWeight: 600,
              lineHeight: 1.24,
              color: '#FECACA',
              textDecoration: strikeProgress > 50 ? 'line-through' : 'none',
              opacity: interpolate(strikeProgress, [0, 100], [1, 0.72]),
            }}
          >
            {scene.myth}
          </p>
        </div>

        <div
          style={{
            opacity: factSpring,
            transform: `translateY(${interpolate(factSpring, [0, 1], [24, 0])}px)`,
            backgroundColor: palette.surface,
            border: `2px solid ${palette.accentBorder}`,
            borderRadius: 26,
            padding: '34px 32px',
            boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 34px ${palette.glow}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 21,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.08em',
            }}
          >
            ✓ THE REALITY
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(42 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.16,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.fact} emphasis={scene.visual?.emphasis} />
          </h2>
          {scene.sourceLabel ? (
            <span style={{ fontFamily: fonts.mono, fontSize: 19, color: '#A1A1AA' }}>
              Source: {scene.sourceLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // Default: 'flip' (dramatic busted stamp + glowing truth reveal)
  return (
    <div
      style={{
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
        borderRadius: 30,
        padding: '38px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.62)',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              fontWeight: 700,
              color: '#F87171',
              letterSpacing: '0.08em',
            }}
          >
            MYTH
          </span>
          <span
            style={{
              opacity: interpolate(strikeProgress, [20, 100], [0, 1], { extrapolateLeft: 'clamp' }),
              transform: `rotate(-4deg) scale(${interpolate(strikeProgress, [20, 100], [1.25, 1], { extrapolateLeft: 'clamp' })})`,
              fontFamily: fonts.mono,
              fontSize: 19,
              fontWeight: 700,
              color: '#FCA5A5',
              border: '2px solid #EF4444',
              padding: '4px 14px',
              borderRadius: 8,
            }}
          >
            BUSTED
          </span>
        </div>

        <p
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.28,
            color: '#A1A1AA',
            textDecoration: strikeProgress > 35 ? 'line-through' : 'none',
            textDecorationColor: '#EF4444',
            textDecorationThickness: 4,
            opacity: interpolate(strikeProgress, [0, 100], [1, 0.72]),
          }}
        >
          {scene.myth}
        </p>
      </div>

      <div style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.09)' }} />

      <div
        style={{
          opacity: factSpring,
          transform: `scale(${interpolate(factSpring, [0, 1], [0.94, 1])})`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <span
          style={{
            alignSelf: 'flex-start',
            fontFamily: fonts.mono,
            fontSize: 20,
            fontWeight: 700,
            color: '#07080D',
            backgroundColor: palette.accent,
            padding: '6px 16px',
            borderRadius: 999,
            letterSpacing: '0.08em',
          }}
        >
          FACT
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(44 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.15,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.fact} emphasis={scene.visual?.emphasis} />
        </h2>
        {scene.sourceLabel ? (
          <span style={{ fontFamily: fonts.mono, fontSize: 19, color: '#A1A1AA' }}>
            Source: {scene.sourceLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
};
