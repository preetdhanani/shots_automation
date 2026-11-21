import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type BenchmarkBarsScene as BenchmarkData,
  type ContentPillar,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { computeBeatFrames, getActiveBeatIndex } from '../style/sceneRuntimeHelpers.js';

interface Props {
  scene: BenchmarkData;
  pillar: ContentPillar;
}

export const BenchmarkBarsScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { isFirst, durationInFrames, words } = useSceneRuntime();
  const layout = resolveLayout('benchmark_bars', scene.visual?.layout);

  const cardSpring = isFirst
    ? 1
    : spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const barBeatFrames = computeBeatFrames(durationInFrames, Math.max(1, scene.bars.length), words, {
    startFrac: 0.12,
    endFrac: 0.78,
  });
  const activeBarIdx = getActiveBeatIndex(frame, barBeatFrames);
  const latePulse = interpolate(
    frame,
    [Math.max(10, Math.round(durationInFrames * 0.5)), Math.max(20, durationInFrames - 6)],
    [1, 1.03],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const maxVal = Math.max(1, ...scene.bars.map((b) => b.value));
  const minVal = Math.min(...scene.bars.map((b) => b.value));

  const formatVal = (raw: number, target: number, progress: number) => {
    const val = progress >= 0.99 ? target : raw;
    return Number.isInteger(target) ? Math.round(val).toString() : val.toFixed(1);
  };

  const formatValueWithUnit = (valStr: string, unit: string): string => {
    const clean = unit.trim();
    if (!clean) return valStr;
    const lower = clean.toLowerCase();
    if (lower === 'score' || lower === 'index' || lower === 'points') {
      return valStr;
    }
    if (/^[%$€£°+x]|^(ms|s|k|m|b)$/i.test(clean)) {
      return `${valStr}${clean}`;
    }
    return `${valStr} ${clean}`;
  };

  const getVisualRatio = (value: number): number => {
    if (scene.bars.length >= 2 && maxVal > minVal && minVal / maxVal > 0.78) {
      return 0.58 + 0.42 * ((value - minVal) / (maxVal - minVal));
    }
    return value / maxVal;
  };

  if (layout === 'columns') {
    return (
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
          backgroundColor: palette.surface,
          border: `1.5px solid ${palette.surfaceBorder}`,
          borderRadius: 28,
          padding: '38px 34px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.58)',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 19,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            BENCHMARK COLUMNS
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(44 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.12,
              textTransform: fonts.headlineTransform,
              color: '#FAFAFA',
            }}
          >
            <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
          </h2>
        </div>

        {/* Vertical rising columns */}
        <div
          style={{
            height: 460,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-around',
            gap: 18,
            padding: '20px 10px 8px',
            borderBottom: '1.5px solid rgba(255,255,255,0.14)',
          }}
        >
          {scene.bars.map((bar, idx) => {
            const barSpring = isFirst
              ? 1
              : spring({
                  frame: Math.max(0, frame - idx * 4),
                  fps,
                  config: { damping: 16, stiffness: 115 },
                });
            const isWinner = Boolean(bar.isWinner);
            const isSpotlight = idx === activeBarIdx;
            const barHeight = Math.max(
              24,
              getVisualRatio(bar.value) * 340 * barSpring * (isWinner ? latePulse : 1),
            );
            return (
              <div
                key={`${bar.label}-${idx}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  minWidth: 0,
                  transform: `scale(${isSpotlight ? 1.03 : 1})`,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 30,
                    fontWeight: 700,
                    color: isWinner || isSpotlight ? palette.accent : '#F4F4F5',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatValueWithUnit(
                    formatVal(bar.value * barSpring, bar.value, barSpring),
                    scene.metricUnit,
                  )}
                </span>
                <div
                  style={{
                    width: '68%',
                    maxWidth: 148,
                    height: barHeight,
                    borderRadius: '16px 16px 6px 6px',
                    background: isWinner
                      ? `linear-gradient(180deg, #FFFFFF 0%, ${palette.accent} 40%, ${palette.secondary} 100%)`
                      : isSpotlight
                        ? `linear-gradient(180deg, ${palette.accent}, #3F3F46)`
                        : 'linear-gradient(180deg, #71717A, #3F3F46)',
                    boxShadow:
                      isWinner || isSpotlight ? `0 0 28px ${palette.glow}` : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Labels row */}
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: 14 }}>
          {scene.bars.map((bar, idx) => (
            <div
              key={`lbl-${idx}`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                textAlign: 'center',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: fonts.display,
                  fontSize: 23,
                  fontWeight: bar.isWinner ? 700 : 500,
                  color: bar.isWinner ? palette.accent : '#D4D4D8',
                  lineHeight: 1.2,
                }}
              >
                {bar.label}
              </span>
              {bar.note ? (
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 17,
                    color: bar.isWinner ? palette.accent : '#A1A1AA',
                    backgroundColor: bar.isWinner ? palette.accentSoft : 'rgba(255,255,255,0.06)',
                    padding: '3px 10px',
                    borderRadius: 8,
                  }}
                >
                  {bar.note}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: fonts.mono,
            fontSize: 19,
            color: '#A1A1AA',
          }}
        >
          <span>Source: {scene.sourceLabel}</span>
          <span>Unit: {scene.metricUnit}</span>
        </div>
      </div>
    );
  }

  if (layout === 'ranked_cards') {
    const sorted = [...scene.bars].sort((a, b) => b.value - a.value);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            RANKED LEADERBOARD
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(48 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.12,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sorted.map((bar, idx) => {
            const rowSpring = isFirst
              ? 1
              : spring({
                  frame: Math.max(0, frame - idx * 4),
                  fps,
                  config: { damping: 16, stiffness: 135 },
                });
            const isTop = idx === 0 || Boolean(bar.isWinner);
            const isSpotlight = idx === activeBarIdx;
            return (
              <div
                key={`${bar.label}-${idx}`}
                style={{
                  opacity: rowSpring,
                  transform: `translateX(${interpolate(rowSpring, [0, 1], [32, 0])}px) scale(${isSpotlight ? 1.015 : isTop ? (latePulse - 1) * 0.6 + 1 : 1})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 18,
                  padding: '22px 24px',
                  borderRadius: 22,
                  backgroundColor: isTop || isSpotlight ? palette.accentSoft : palette.surface,
                  border:
                    isTop || isSpotlight
                      ? `2px solid ${palette.accentBorder}`
                      : `1px solid ${palette.surfaceBorder}`,
                  boxShadow:
                    isTop || isSpotlight
                      ? `0 16px 40px rgba(0,0,0,0.45), 0 0 24px ${palette.glow}`
                      : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      backgroundColor: isTop ? palette.accent : 'rgba(255,255,255,0.08)',
                      color: isTop ? '#07080D' : '#D4D4D8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: fonts.mono,
                      fontSize: 26,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    #{idx + 1}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span
                      style={{
                        fontFamily: fonts.display,
                        fontSize: 30,
                        fontWeight: 700,
                        color: '#FFFFFF',
                      }}
                    >
                      {bar.label}
                    </span>
                    {bar.note ? (
                      <span
                        style={{
                          fontFamily: fonts.mono,
                          fontSize: 18,
                          color: isTop ? palette.accent : '#A1A1AA',
                        }}
                      >
                        {bar.note}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 38,
                    fontWeight: 700,
                    color: isTop ? palette.accent : '#E4E4E7',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValueWithUnit(
                    formatVal(bar.value * rowSpring, bar.value, rowSpring),
                    scene.metricUnit,
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <span style={{ fontFamily: fonts.mono, fontSize: 19, color: '#A1A1AA' }}>
          Source: {scene.sourceLabel}
        </span>
      </div>
    );
  }

  // Default: 'horizontal'
  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
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
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${palette.accent}, rgba(255,255,255,0.12))`,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 20,
            fontWeight: 600,
            color: palette.accent,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          BENCHMARK COMPARISON
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(44 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.14,
            textTransform: fonts.headlineTransform,
            color: '#FAFAFA',
          }}
        >
          <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
        </h2>
        {scene.subtitle ? (
          <p style={{ margin: 0, fontSize: 25, color: '#A1A1AA', lineHeight: 1.35 }}>
            {scene.subtitle}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {scene.bars.map((bar, idx) => {
          const barSpring = isFirst
            ? 1
            : spring({
                frame: Math.max(0, frame - idx * 4),
                fps,
                config: { damping: 18, stiffness: 110 },
              });
          const isWinner = Boolean(bar.isWinner);
          const isSpotlight = idx === activeBarIdx;
          const pct = Math.max(
            4,
            Math.min(100, getVisualRatio(bar.value) * 100 * barSpring * (isWinner ? latePulse : 1)),
          );

          return (
            <div
              key={`${bar.label}-${idx}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '16px 20px',
                borderRadius: 18,
                transform: `scale(${isSpotlight ? 1.015 : 1})`,
                backgroundColor:
                  isWinner || isSpotlight
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(255, 255, 255, 0.025)',
                border:
                  isWinner || isSpotlight
                    ? `1.5px solid ${palette.accentBorder}`
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
                      fontFamily: fonts.display,
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
                        fontFamily: fonts.mono,
                        fontSize: 18,
                        color: isWinner ? palette.accent : '#A1A1AA',
                        backgroundColor: isWinner ? palette.accentSoft : 'rgba(255,255,255,0.06)',
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
                    fontFamily: fonts.mono,
                    fontSize: 30,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: isWinner ? palette.accent : '#F4F4F5',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValueWithUnit(
                    formatVal(bar.value * barSpring, bar.value, barSpring),
                    scene.metricUnit,
                  )}
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
                      ? `linear-gradient(90deg, ${palette.accent}, #FFFFFF)`
                      : 'linear-gradient(90deg, #52525B, #71717A)',
                    boxShadow: isWinner ? `0 0 18px ${palette.glow}` : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: fonts.mono,
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
