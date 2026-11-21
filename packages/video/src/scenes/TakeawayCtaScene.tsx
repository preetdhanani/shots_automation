import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type ContentPillar,
  type TakeawayCtaScene as TakeawayData,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';

interface Props {
  scene: TakeawayData;
  pillar: ContentPillar;
  brandHandle: string;
}

export const TakeawayCtaScene: React.FC<Props> = ({ scene, brandHandle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { durationInFrames } = useSceneRuntime();
  const layout = resolveLayout('takeaway_cta', scene.visual?.layout);
  const cleanHandle = brandHandle.trim();

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
  const ctaFocus = interpolate(
    frame,
    [Math.round(durationInFrames * 0.35), Math.max(24, Math.round(durationInFrames * 0.78))],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

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
            transform: `translateY(${interpolate(ctaSpring, [0, 1], [14, 0])}px) scale(${1 + ctaFocus * 0.025})`,
            width: '100%',
            maxWidth: 760,
            backgroundColor: 'rgba(12, 14, 22, 0.88)',
            border: `1.5px solid ${palette.accentBorder}`,
            borderTop: `3px solid ${palette.accent}`,
            borderRadius: 14,
            padding: '18px 28px',
            boxShadow: ctaFocus > 0.2 ? `0 0 ${Math.round(14 + ctaFocus * 22)}px ${palette.glow}` : undefined,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 28, fontWeight: 700, color: palette.accent }}>
              &gt;
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 27, fontWeight: 700, color: '#FAFAFA' }}>
              {scene.ctaText}
            </span>
          </div>
          {cleanHandle ? (
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 20,
                fontWeight: 600,
                color: '#A1A1AA',
                letterSpacing: '0.04em',
              }}
            >
              {cleanHandle}
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
          transform: `translateY(${interpolate(ctaSpring, [0, 1], [14, 0])}px) scale(${1 + ctaFocus * 0.02})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          borderLeft: `5px solid ${palette.accent}`,
          backgroundColor: 'rgba(255, 255, 255, 0.035)',
          borderRadius: '0 14px 14px 0',
          padding: '18px 24px',
          boxShadow: ctaFocus > 0.2 ? `0 0 ${Math.round(12 + ctaFocus * 20)}px ${palette.glow}` : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ fontFamily: fonts.mono, fontSize: 26, fontWeight: 700, color: palette.accent }}>
            &gt;
          </span>
          <span style={{ fontFamily: fonts.mono, fontSize: 26, fontWeight: 700, color: '#F4F4F5' }}>
            {scene.ctaText}
          </span>
        </div>
        {cleanHandle ? (
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              fontWeight: 600,
              color: '#A1A1AA',
              flexShrink: 0,
            }}
          >
            {cleanHandle}
          </span>
        ) : null}
      </div>
    </div>
  );
};
