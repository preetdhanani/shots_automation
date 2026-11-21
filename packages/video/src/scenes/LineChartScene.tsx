import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type LineChartScene as LineChartData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { computeBeatFrames } from '../style/sceneRuntimeHelpers.js';

interface Props {
  scene: LineChartData;
}

export const LineChartScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { durationInFrames, words } = useSceneRuntime();
  const layout = resolveLayout('line_chart', scene.visual?.layout);

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const chartBeats = computeBeatFrames(durationInFrames, Math.max(2, scene.points.length), words, {
    startFrac: 0.08,
    endFrac: 0.74,
  });
  const drawEndFrame = Math.max(28, chartBeats[chartBeats.length - 1] ?? Math.round(durationInFrames * 0.72));
  const drawProgress = interpolate(frame, [4, drawEndFrame], [0.06, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const haloRadius = interpolate(
    frame,
    [Math.max(8, drawEndFrame - 10), Math.max(24, durationInFrames - 6)],
    [12, 22],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const width = 760;
  const height = 380;
  const padX = 46;
  const padTop = 44;
  const padBottom = 56;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const vals = scene.points.map((p) => p.value);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);
  const span = Math.max(1e-6, rawMax - rawMin);
  const yMin = rawMin - span * 0.15;
  const yMax = rawMax + span * 0.15;
  const ySpan = Math.max(1e-6, yMax - yMin);

  const coords = scene.points.map((pt, idx) => {
    const x =
      scene.points.length <= 1
        ? padX + plotW / 2
        : padX + (idx / (scene.points.length - 1)) * plotW;
    const y = padTop + plotH - ((pt.value - yMin) / ySpan) * plotH;
    return { x, y, label: pt.label, value: pt.value };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const highlightIdx =
    scene.highlightIndex !== undefined && scene.highlightIndex < coords.length
      ? scene.highlightIndex
      : coords.length - 1;
  const highlightPoint = coords[highlightIdx];

  const isArea = layout === 'area';
  const clipW = Math.max(1, width * drawProgress);

  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [22, 0])}px)`,
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
        borderRadius: 28,
        padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
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
            TREND CURVE
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(42 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.12,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
          </h2>
        </div>

        {highlightPoint ? (
          <div
            style={{
              backgroundColor: palette.accentSoft,
              border: `1.5px solid ${palette.accentBorder}`,
              borderRadius: 16,
              padding: '10px 16px',
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            <div style={{ fontFamily: fonts.mono, fontSize: 16, color: '#A1A1AA' }}>
              {highlightPoint.label}
            </div>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 30,
                fontWeight: 700,
                color: palette.accent,
              }}
            >
              {scene.metricUnit === '$' ? `$${highlightPoint.value}` : `${highlightPoint.value}${scene.metricUnit}`}
            </div>
          </div>
        ) : null}
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="lineChartAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.accent} stopOpacity="0.42" />
            <stop offset="100%" stopColor={palette.accent} stopOpacity="0.0" />
          </linearGradient>
          <clipPath id="lineChartReveal">
            <rect x="0" y="0" width={clipW} height={height} />
          </clipPath>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
          const y = padTop + plotH * frac;
          return (
            <line
              key={idx}
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray={idx === 4 ? undefined : '6 6'}
              strokeWidth={1.5}
            />
          );
        })}

        <g clipPath="url(#lineChartReveal)">
          {isArea && areaPath ? (
            <path d={areaPath} fill="url(#lineChartAreaGrad)" />
          ) : null}

          <path
            d={linePath}
            fill="none"
            stroke={palette.accent}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {coords.map((c, idx) => {
            const isHi = idx === highlightIdx;
            return (
              <g key={idx}>
                {isHi ? (
                  <circle cx={c.x} cy={c.y} r={haloRadius} fill={palette.accentSoft} />
                ) : null}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isHi ? 8 : 5.5}
                  fill={isHi ? '#FFFFFF' : palette.accent}
                  stroke={palette.accent}
                  strokeWidth={3}
                />
                <text
                  x={c.x}
                  y={c.y - 18}
                  textAnchor="middle"
                  fill={isHi ? palette.accent : '#D4D4D8'}
                  fontFamily={fonts.mono}
                  fontSize={isHi ? 22 : 18}
                  fontWeight={700}
                >
                  {scene.metricUnit === '$' ? `$${c.value}` : `${c.value}${scene.metricUnit}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* X axis labels */}
        {coords.map((c, idx) => (
          <text
            key={`x-${idx}`}
            x={c.x}
            y={height - 14}
            textAnchor="middle"
            fill={idx === highlightIdx ? '#FFFFFF' : '#A1A1AA'}
            fontFamily={fonts.mono}
            fontSize={20}
            fontWeight={idx === highlightIdx ? 700 : 500}
          >
            {c.label}
          </text>
        ))}
      </svg>

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: 14,
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
};
