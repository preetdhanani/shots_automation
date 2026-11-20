import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BenchmarkBarsScene as BenchmarkData, ContentPillar } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES } from '../theme.js';

interface Props {
  scene: BenchmarkData;
  pillar: ContentPillar;
}

export const BenchmarkBarsScene: React.FC<Props> = ({ scene, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const maxVal = Math.max(1, ...scene.bars.map((b) => b.value));

  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: 'rgba(17, 19, 27, 0.95)',
        border: '1.5px solid rgba(255, 255, 255, 0.11)',
        borderRadius: 28,
        padding: '38px 36px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.58)',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top accent hairline */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${theme.accent}, rgba(255,255,255,0.12))`,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            fontFamily: FONT_FAMILIES.mono,
            fontSize: 20,
            fontWeight: 600,
            color: theme.accent,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          BENCHMARK COMPARISON
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: FONT_FAMILIES.display,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.14,
            color: '#FAFAFA',
          }}
        >
          {scene.title}
        </h2>
        {scene.subtitle ? (
          <p
            style={{
              margin: 0,
              fontSize: 25,
              color: '#A1A1AA',
              lineHeight: 1.35,
            }}
          >
            {scene.subtitle}
          </p>
        ) : null}
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {scene.bars.map((bar, idx) => {
          const barSpring = spring({
            frame: Math.max(0, frame - (6 + idx * 4)),
            fps,
            config: { damping: 18, stiffness: 110 },
          });
          const pct = Math.max(4, (bar.value / maxVal) * 100 * barSpring);
          const animatedVal = bar.value * barSpring;
          const formattedVal = Number.isInteger(bar.value)
            ? Math.round(animatedVal).toString()
            : animatedVal.toFixed(1);
          const isWinner = Boolean(bar.isWinner);

          return (
            <div
              key={`${bar.label}-${idx}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '16px 20px',
                borderRadius: 18,
                backgroundColor: isWinner
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(255, 255, 255, 0.025)',
                border: isWinner
                  ? `1.5px solid ${theme.accentBorder}`
                  : '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: FONT_FAMILIES.display,
                      fontSize: 28,
                      fontWeight: isWinner ? 700 : 600,
                      color: isWinner ? '#FFFFFF' : '#E4E4E7',
                    }}
                  >
                    {bar.label}
                  </span>
                  {bar.note ? (
                    <span
                      style={{
                        fontFamily: FONT_FAMILIES.mono,
                        fontSize: 18,
                        color: isWinner ? theme.accent : '#A1A1AA',
                        backgroundColor: isWinner ? theme.accentSoft : 'rgba(255,255,255,0.06)',
                        padding: '4px 10px',
                        borderRadius: 8,
                      }}
                    >
                      {bar.note}
                    </span>
                  ) : null}
                </div>

                <span
                  style={{
                    fontFamily: FONT_FAMILIES.mono,
                    fontSize: 30,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: isWinner ? theme.accent : '#F4F4F5',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formattedVal}
                  {scene.metricUnit}
                </span>
              </div>

              <div
                style={{
                  width: '100%',
                  height: 18,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: isWinner
                      ? `linear-gradient(90deg, ${theme.accent}, #FFFFFF)`
                      : 'linear-gradient(90deg, #52525B, #71717A)',
                    boxShadow: isWinner ? `0 0 18px ${theme.glow}` : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Source Footer */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: FONT_FAMILIES.mono,
          fontSize: 19,
          color: '#A1A1AA',
        }}
      >
        <span>Source: {scene.sourceLabel}</span>
        <span>Unit: {scene.metricUnit}</span>
      </div>
    </div>
  );
};
