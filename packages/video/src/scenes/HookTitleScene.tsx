import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type ContentPillar,
  type HookTitleScene as HookTitleData,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { computeBeatFrames } from '../style/sceneRuntimeHelpers.js';

interface Props {
  scene: HookTitleData;
  pillar: ContentPillar;
}

export const HookTitleScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { isFirst, durationInFrames, words } = useSceneRuntime();
  const layout = resolveLayout('hook_title', scene.visual?.layout);

  const badgeSpring = isFirst
    ? 1
    : spring({ frame, fps, config: { damping: 16, stiffness: 160 } });
  const titleSpring = isFirst
    ? 1
    : spring({ frame: Math.max(0, frame - 4), fps, config: { damping: 15, stiffness: 130 } });
  const openSubSpring = spring({ frame, fps, config: { damping: 16, stiffness: 130 } });
  const subSpring = isFirst
    ? 1
    : spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 16, stiffness: 130 } });
  const statSpring = isFirst
    ? 1
    : spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  const subOpacity = isFirst ? interpolate(openSubSpring, [0, 1], [0.8, 1]) : subSpring;
  const subTranslateY = isFirst
    ? interpolate(openSubSpring, [0, 1], [8, 0])
    : interpolate(subSpring, [0, 1], [18, 0]);
  const stackedSubTranslateY = isFirst
    ? interpolate(openSubSpring, [0, 1], [8, 0])
    : interpolate(subSpring, [0, 1], [22, 0]);
  const statOpacity = isFirst ? interpolate(openSubSpring, [0, 1], [0.88, 1]) : statSpring;
  const statTranslateY = isFirst
    ? interpolate(openSubSpring, [0, 1], [6, 0])
    : interpolate(statSpring, [0, 1], [10, 0]);
  const statScale = isFirst
    ? interpolate(openSubSpring, [0, 1], [0.97, 1])
    : interpolate(statSpring, [0, 1], [0.94, 1]);
  const meterProgress = interpolate(
    frame,
    [0, Math.max(24, Math.round(durationInFrames * 0.72))],
    [0.28, 0.92],
    { extrapolateRight: 'clamp' },
  );
  const beatFrames = computeBeatFrames(durationInFrames, 3, words, {
    startFrac: 0.14,
    endFrac: 0.78,
  });
  const sweepFrac = interpolate(
    frame,
    [0, Math.max(20, (beatFrames[2] ?? durationInFrames - 6))],
    [0.12, 1],
    { extrapolateRight: 'clamp' },
  );

  const headlineSize = Math.round(74 * fonts.headlineScale);
  const statLen = scene.highlightStat?.length ?? 0;
  const receiptFontSize = statLen > 30 ? 25 : statLen > 20 ? 29 : 34;

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
            width: interpolate(titleSpring, [0, 1], [0, Math.round(240 + sweepFrac * 120)]),
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
            opacity: subOpacity,
            transform: `translateY(${subTranslateY}px)`,
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
              opacity: statOpacity,
              transform: `translateY(${statTranslateY}px) scale(${statScale})`,
              border: `1.5px solid ${palette.accentBorder}`,
              backgroundColor: 'rgba(14, 17, 26, 0.9)',
              borderRadius: 16,
              padding: '16px 26px',
              maxWidth: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              boxShadow: `0 12px 32px rgba(0,0,0,0.45), 0 0 24px ${palette.glow}`,
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: receiptFontSize,
                fontWeight: 700,
                color: palette.accent,
                overflowWrap: 'break-word',
              }}
            >
              {scene.highlightStat}
            </span>
            <div
              style={{
                width: '100%',
                minWidth: 240,
                height: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(meterProgress * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: palette.accent,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (layout === 'stat_hero') {
    const heroStat = scene.highlightStat || scene.badge;
    const heroFontSize =
      heroStat.length > 28
        ? 44
        : heroStat.length > 18
          ? 56
          : heroStat.length > 10
            ? 72
            : 104;
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
            fontSize: heroFontSize,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
            color: palette.accent,
            textShadow: `0 0 34px ${palette.glow}`,
            overflowWrap: 'break-word',
          }}
        >
          {heroStat}
        </div>

        <div
          style={{
            height: 3,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(sweepFrac * 100)}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: palette.accent,
            }}
          />
        </div>

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
            opacity: subOpacity,
            transform: `translateY(${subTranslateY}px)`,
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
          width: interpolate(titleSpring, [0, 1], [0, Math.round(96 + sweepFrac * 84)]),
          height: 5,
          borderRadius: 999,
          backgroundColor: palette.accent,
          boxShadow: `0 0 20px ${palette.glow}`,
        }}
      />

      <p
        style={{
          margin: 0,
          opacity: subOpacity,
          transform: `translateY(${stackedSubTranslateY}px)`,
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
            maxWidth: '100%',
            opacity: statOpacity,
            transform: `scale(${statScale})`,
            backgroundColor: 'rgba(14, 17, 26, 0.94)',
            border: `1.5px solid ${palette.accentBorder}`,
            borderRadius: 16,
            padding: '18px 26px',
            boxShadow: `0 16px 40px rgba(0,0,0,0.45), 0 0 28px ${palette.glow}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: receiptFontSize,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '-0.02em',
              overflowWrap: 'break-word',
            }}
          >
            {scene.highlightStat}
          </span>
          <div
            style={{
              width: '100%',
              minWidth: 260,
              height: 5,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(meterProgress * 100)}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: palette.accent,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
