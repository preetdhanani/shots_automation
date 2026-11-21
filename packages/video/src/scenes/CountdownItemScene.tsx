import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type CountdownItemScene as CountdownData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: CountdownData;
}

export const CountdownItemScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('countdown_item', scene.visual?.layout);

  const numSpring = spring({ frame, fps, config: { damping: 12, stiffness: 145 } });
  const bodySpring = spring({
    frame: Math.max(0, frame - 7),
    fps,
    config: { damping: 16, stiffness: 140 },
  });

  if (layout === 'badge_side') {
    return (
      <div
        style={{
          backgroundColor: palette.surface,
          border: `2px solid ${palette.accentBorder}`,
          borderRadius: 30,
          padding: '42px 36px',
          boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 36px ${palette.glow}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              opacity: numSpring,
              transform: `scale(${interpolate(numSpring, [0, 1], [0.75, 1])})`,
              width: 132,
              height: 132,
              borderRadius: 28,
              backgroundColor: palette.accent,
              color: '#07080D',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: `0 0 36px ${palette.glow}`,
            }}
          >
            <span style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 700, opacity: 0.7 }}>
              RANK
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 64, fontWeight: 700, lineHeight: 0.95 }}>
              #{scene.rank}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scene.tag ? (
              <span
                style={{
                  alignSelf: 'flex-start',
                  fontFamily: fonts.mono,
                  fontSize: 19,
                  fontWeight: 700,
                  color: palette.accent,
                  backgroundColor: palette.accentSoft,
                  border: `1px solid ${palette.accentBorder}`,
                  padding: '6px 14px',
                  borderRadius: 999,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}
              >
                {scene.tag}
              </span>
            ) : null}
            <h2
              style={{
                margin: 0,
                fontFamily: fonts.display,
                fontSize: Math.round(46 * fonts.headlineScale),
                fontWeight: 700,
                lineHeight: 1.08,
                textTransform: fonts.headlineTransform,
                color: '#FFFFFF',
              }}
            >
              <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
            </h2>
          </div>
        </div>

        <div style={{ height: 1.5, backgroundColor: 'rgba(255,255,255,0.1)' }} />

        <p
          style={{
            margin: 0,
            opacity: bodySpring,
            transform: `translateY(${interpolate(bodySpring, [0, 1], [16, 0])}px)`,
            fontSize: 33,
            lineHeight: 1.42,
            color: '#E4E4E7',
          }}
        >
          {scene.detail}
        </p>
      </div>
    );
  }

  // Default: 'giant_number'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            opacity: numSpring,
            transform: `scale(${interpolate(numSpring, [0, 1], [0.7, 1])})`,
            transformOrigin: 'left center',
            fontFamily: fonts.mono,
            fontSize: 176,
            fontWeight: 700,
            lineHeight: 0.88,
            letterSpacing: '-0.06em',
            color: palette.accent,
            textShadow: `0 0 48px ${palette.glow}`,
          }}
        >
          #{scene.rank}
        </div>
        {scene.tag ? (
          <div
            style={{
              backgroundColor: palette.accentSoft,
              border: `1.5px solid ${palette.accentBorder}`,
              borderRadius: 14,
              padding: '10px 20px',
              fontFamily: fonts.mono,
              fontSize: 21,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}
          >
            {scene.tag}
          </div>
        ) : null}
      </div>

      <div
        style={{
          opacity: bodySpring,
          transform: `translateY(${interpolate(bodySpring, [0, 1], [24, 0])}px)`,
          backgroundColor: palette.surface,
          border: `1.5px solid ${palette.surfaceBorder}`,
          borderRadius: 28,
          padding: '34px 34px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxShadow: '0 22px 58px rgba(0,0,0,0.58)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(52 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.08,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
        </h2>
        <p style={{ margin: 0, fontSize: 32, lineHeight: 1.4, color: '#D4D4D8' }}>
          {scene.detail}
        </p>
      </div>
    </div>
  );
};
