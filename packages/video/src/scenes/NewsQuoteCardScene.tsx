import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ContentPillar, NewsQuoteCardScene as NewsCardData } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES } from '../theme.js';

interface Props {
  scene: NewsCardData;
  pillar: ContentPillar;
}

export const NewsQuoteCardScene: React.FC<Props> = ({ scene, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });

  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: 'rgba(17, 19, 27, 0.96)',
        border: '1.5px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 28,
        padding: '38px 36px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      {/* Source & Date Header */}
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
              backgroundColor: theme.accentSoft,
              border: `1.5px solid ${theme.accentBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT_FAMILIES.mono,
              fontSize: 22,
              fontWeight: 700,
              color: theme.accent,
            }}
          >
            {scene.sourceLabel.slice(0, 1).toUpperCase()}
          </div>
          <span
            style={{
              fontFamily: FONT_FAMILIES.display,
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
            fontFamily: FONT_FAMILIES.mono,
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

      {/* Headline */}
      <h2
        style={{
          margin: 0,
          fontFamily: FONT_FAMILIES.display,
          fontSize: 44,
          fontWeight: 700,
          lineHeight: 1.15,
          color: '#FFFFFF',
        }}
      >
        {scene.headline}
      </h2>

      {/* Bullets */}
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
                  fontFamily: FONT_FAMILIES.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: theme.accent,
                  marginTop: 2,
                }}
              >
                0{idx + 1}
              </span>
              <span
                style={{
                  fontSize: 28,
                  lineHeight: 1.38,
                  fontWeight: 500,
                  color: '#E4E4E7',
                }}
              >
                {bullet}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
