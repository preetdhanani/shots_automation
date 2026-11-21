import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type ContentPillar,
  type NewsQuoteCardScene as NewsCardData,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: NewsCardData;
  pillar: ContentPillar;
}

export const NewsQuoteCardScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('news_quote_card', scene.visual?.layout);

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });

  if (layout === 'breaking_ticker') {
    return (
      <div
        style={{
          opacity: cardSpring,
          backgroundColor: '#0A0C12',
          border: `2px solid ${palette.accentBorder}`,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: `0 24px 64px rgba(0,0,0,0.62), 0 0 32px ${palette.glow}`,
        }}
      >
        <div
          style={{
            backgroundColor: palette.accent,
            color: '#07080D',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: fonts.mono,
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>● BRIEFING // {scene.sourceLabel}</span>
          <span>{scene.dateLabel}</span>
        </div>

        <div style={{ padding: '34px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(46 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.12,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {scene.bullets.map((bullet, idx) => {
              const itemSpring = spring({
                frame: Math.max(0, frame - (6 + idx * 5)),
                fps,
                config: { damping: 16, stiffness: 145 },
              });
              return (
                <div
                  key={idx}
                  style={{
                    opacity: itemSpring,
                    transform: `translateX(${interpolate(itemSpring, [0, 1], [-18, 0])}px)`,
                    borderLeft: `4px solid ${palette.accent}`,
                    paddingLeft: 18,
                    fontSize: 29,
                    lineHeight: 1.36,
                    fontWeight: 500,
                    color: '#E4E4E7',
                  }}
                >
                  {bullet}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'pull_quote') {
    return (
      <div
        style={{
          opacity: cardSpring,
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
          padding: '18px 8px',
        }}
      >
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 120,
            lineHeight: 0.65,
            color: palette.accent,
            opacity: 0.8,
          }}
        >
          &ldquo;
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(52 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.1,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
        </h2>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 21,
            color: palette.accent,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          — {scene.sourceLabel} · {scene.dateLabel}
        </div>
        <div
          style={{
            backgroundColor: palette.surface,
            border: `1px solid ${palette.surfaceBorder}`,
            borderRadius: 22,
            padding: '24px 26px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {scene.bullets.map((bullet, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ color: palette.accent, fontSize: 26, fontWeight: 700 }}>•</span>
              <span style={{ fontSize: 27, lineHeight: 1.36, color: '#E4E4E7' }}>{bullet}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: 'card'
  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
        borderRadius: 28,
        padding: '38px 36px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: palette.accentSoft,
              border: `1.5px solid ${palette.accentBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.mono,
              fontSize: 22,
              fontWeight: 700,
              color: palette.accent,
            }}
          >
            {scene.sourceLabel.slice(0, 1).toUpperCase()}
          </div>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: 26,
              fontWeight: 700,
              color: '#F4F4F5',
            }}
          >
            {scene.sourceLabel}
          </span>
        </div>

        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 20,
            color: '#A1A1AA',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            padding: '6px 14px',
            borderRadius: 999,
          }}
        >
          {scene.dateLabel}
        </span>
      </div>

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
        <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {scene.bullets.map((bullet, idx) => {
          const itemSpring = spring({
            frame: Math.max(0, frame - (8 + idx * 6)),
            fps,
            config: { damping: 16, stiffness: 140 },
          });
          return (
            <div
              key={idx}
              style={{
                opacity: itemSpring,
                transform: `translateY(${interpolate(itemSpring, [0, 1], [16, 0])}px)`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                backgroundColor: 'rgba(255, 255, 255, 0.035)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: 18,
                padding: '18px 22px',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: palette.accent,
                  marginTop: 2,
                }}
              >
                0{idx + 1}
              </span>
              <span style={{ fontSize: 28, lineHeight: 1.38, fontWeight: 500, color: '#E4E4E7' }}>
                {bullet}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
