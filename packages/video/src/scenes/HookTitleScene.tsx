import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type ContentPillar,
  type HookTitleScene as HookTitleData,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: HookTitleData;
  pillar: ContentPillar;
}

export const HookTitleScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('hook_title', scene.visual?.layout);

  const badgeSpring = spring({ frame, fps, config: { damping: 16, stiffness: 160 } });
  const titleSpring = spring({ frame: Math.max(0, frame - 4), fps, config: { damping: 15, stiffness: 130 } });
  const subSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 130 } });
  const statSpring = spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 14, stiffness: 140 } });

  const headlineSize = Math.round(74 * fonts.headlineScale);

  if (layout === 'impact_center') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 32,
          padding: '24px 12px',
        }}
      >
        <div
          style={{
            opacity: badgeSpring,
            transform: `scale(${interpolate(badgeSpring, [0, 1], [0.88, 1])})`,
            backgroundColor: palette.accent,
            color: '#07080D',
            borderRadius: 12,
            padding: '10px 26px',
            boxShadow: `0 0 32px ${palette.glow}`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {scene.badge}
          </span>
        </div>

        <div
          style={{
            width: interpolate(titleSpring, [0, 1], [0, 320]),
            height: 4,
            borderRadius: 999,
            background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)`,
          }}
        />

        <h1
          style={{
            margin: 0,
            opacity: titleSpring,
            transform: `scale(${interpolate(titleSpring, [0, 1], [0.92, 1])})`,
            fontFamily: fonts.display,
            fontSize: Math.round(84 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.03,
            letterSpacing: fonts.headlineLetterSpacing,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            opacity: subSpring,
            transform: `translateY(${interpolate(subSpring, [0, 1], [18, 0])}px)`,
            fontFamily: fonts.sans,
            fontSize: 33,
            fontWeight: 500,
            lineHeight: 1.36,
            color: '#D4D4D8',
          }}
        >
          {scene.subheadline}
        </p>

        {scene.highlightStat ? (
          <div
            style={{
              opacity: statSpring,
              transform: `translateY(${interpolate(statSpring, [0, 1], [16, 0])}px)`,
              border: `2px solid ${palette.accentBorder}`,
              backgroundColor: palette.accentSoft,
              borderRadius: 999,
              padding: '14px 32px',
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 34,
                fontWeight: 700,
                color: palette.accent,
              }}
            >
              {scene.highlightStat}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  if (layout === 'stat_hero') {
    const heroStat = scene.highlightStat || scene.badge;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
          backgroundColor: palette.surface,
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 32,
          padding: '44px 40px',
          boxShadow: `0 28px 72px rgba(0,0,0,0.6), 0 0 42px ${palette.glow}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: palette.accent,
              boxShadow: `0 0 18px ${palette.accent}`,
            }}
          />
        </div>

        {/* Giant Hero Metric / Callout */}
        <div
          style={{
            opacity: badgeSpring,
            transform: `scale(${interpolate(badgeSpring, [0, 1], [0.85, 1])})`,
            transformOrigin: 'left center',
            fontFamily: fonts.mono,
            fontSize: heroStat.length > 10 ? 74 : 108,
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: '-0.04em',
            color: palette.accent,
            textShadow: `0 0 34px ${palette.glow}`,
          }}
        >
          {heroStat}
        </div>

        <div style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.1)' }} />

        <h1
          style={{
            margin: 0,
            opacity: titleSpring,
            transform: `translateY(${interpolate(titleSpring, [0, 1], [22, 0])}px)`,
            fontFamily: fonts.display,
            fontSize: Math.round(62 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: fonts.headlineLetterSpacing,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
        </h1>

        <p
          style={{
            margin: 0,
            opacity: subSpring,
            fontFamily: fonts.sans,
            fontSize: 31,
            fontWeight: 500,
            lineHeight: 1.38,
            color: '#D4D4D8',
          }}
        >
          {scene.subheadline}
        </p>
      </div>
    );
  }

  // Default: 'stacked' (classic look upgraded with palette + typography + KineticText)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <div
        style={{
          alignSelf: 'flex-start',
          opacity: badgeSpring,
          transform: `translateY(${interpolate(badgeSpring, [0, 1], [18, 0])}px)`,
          backgroundColor: palette.accentSoft,
          border: `1.5px solid ${palette.accentBorder}`,
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
            backgroundColor: palette.accent,
          }}
        />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            fontWeight: 700,
            color: palette.accent,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {scene.badge}
        </span>
      </div>

      <div
        style={{
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [28, 0])}px)`,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: headlineSize,
            fontWeight: 700,
            lineHeight: 1.07,
            letterSpacing: fonts.headlineLetterSpacing,
            textTransform: fonts.headlineTransform,
            color: '#FAFAFA',
          }}
        >
          <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
        </h1>
      </div>

      <div
        style={{
          width: interpolate(titleSpring, [0, 1], [0, 140]),
          height: 5,
          borderRadius: 999,
          backgroundColor: palette.accent,
          boxShadow: `0 0 20px ${palette.glow}`,
        }}
      />

      <p
        style={{
          margin: 0,
          opacity: subSpring,
          transform: `translateY(${interpolate(subSpring, [0, 1], [22, 0])}px)`,
          fontFamily: fonts.sans,
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.38,
          color: '#D4D4D8',
        }}
      >
        {scene.subheadline}
      </p>

      {scene.highlightStat ? (
        <div
          style={{
            marginTop: 8,
            alignSelf: 'flex-start',
            opacity: statSpring,
            transform: `scale(${interpolate(statSpring, [0, 1], [0.92, 1])})`,
            backgroundColor: 'rgba(20, 23, 31, 0.92)',
            border: `1.5px solid ${palette.accentBorder}`,
            borderRadius: 20,
            padding: '20px 28px',
            boxShadow: `0 16px 40px rgba(0,0,0,0.45), 0 0 28px ${palette.glow}`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 36,
              fontWeight: 700,
              color: palette.accent,
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
