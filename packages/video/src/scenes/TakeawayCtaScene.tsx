import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type ContentPillar,
  type TakeawayCtaScene as TakeawayData,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: TakeawayData;
  pillar: ContentPillar;
  brandHandle: string;
}

export const TakeawayCtaScene: React.FC<Props> = ({ scene, brandHandle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('takeaway_cta', scene.visual?.layout);

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

  if (layout === 'centered') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 32,
          padding: '20px 10px',
        }}
      >
        <div
          style={{
            opacity: mainSpring,
            backgroundColor: palette.accentSoft,
            border: `1.5px solid ${palette.accentBorder}`,
            borderRadius: 999,
            padding: '10px 26px',
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 21,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.08em',
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
            transform: `scale(${interpolate(mainSpring, [0, 1], [0.92, 1])})`,
            fontFamily: fonts.display,
            fontSize: Math.round(66 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: fonts.headlineLetterSpacing,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
        </h2>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            opacity: boxSpring,
            fontFamily: fonts.sans,
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.4,
            color: '#E4E4E7',
          }}
        >
          {scene.takeaway}
        </p>

        <div
          style={{
            opacity: ctaSpring,
            transform: `scale(${interpolate(ctaSpring, [0, 1], [0.9, 1])})`,
            backgroundColor: palette.accent,
            color: '#07080D',
            borderRadius: 999,
            padding: '22px 42px',
            boxShadow: `0 0 36px ${palette.glow}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <span style={{ fontFamily: fonts.display, fontSize: 30, fontWeight: 700 }}>
            {scene.ctaText}
          </span>
          {brandHandle ? (
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 22,
                fontWeight: 700,
                backgroundColor: 'rgba(9, 9, 11, 0.16)',
                padding: '6px 14px',
                borderRadius: 999,
              }}
            >
              {brandHandle}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // Default: 'card'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div
        style={{
          alignSelf: 'flex-start',
          opacity: mainSpring,
          backgroundColor: palette.accentSoft,
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 999,
          padding: '10px 22px',
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 21,
            fontWeight: 700,
            color: palette.accent,
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
          fontFamily: fonts.display,
          fontSize: Math.round(58 * fonts.headlineScale),
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: fonts.headlineLetterSpacing,
          textTransform: fonts.headlineTransform,
          color: '#FFFFFF',
        }}
      >
        <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
      </h2>

      <div
        style={{
          opacity: boxSpring,
          transform: `translateY(${interpolate(boxSpring, [0, 1], [20, 0])}px)`,
          backgroundColor: palette.surface,
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 24,
          padding: '32px 32px',
          boxShadow: `0 20px 54px rgba(0, 0, 0, 0.55), 0 0 32px ${palette.glow}`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: fonts.sans,
            fontSize: 33,
            fontWeight: 600,
            lineHeight: 1.4,
            color: '#F4F4F5',
          }}
        >
          {scene.takeaway}
        </p>
      </div>

      <div
        style={{
          opacity: ctaSpring,
          transform: `scale(${interpolate(ctaSpring, [0, 1], [0.95, 1])})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          backgroundColor: palette.accent,
          color: '#09090B',
          borderRadius: 20,
          padding: '22px 28px',
        }}
      >
        <span style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700 }}>
          {scene.ctaText}
        </span>
        {brandHandle ? (
          <span
            style={{
              fontFamily: fonts.mono,
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
