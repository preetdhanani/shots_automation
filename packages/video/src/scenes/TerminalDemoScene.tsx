import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ContentPillar, TerminalDemoScene as TerminalData } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES } from '../theme.js';

interface Props {
  scene: TerminalData;
  pillar: ContentPillar;
}

const TONE_COLORS = {
  neutral: '#E4E4E7',
  success: '#34D399',
  warn: '#FBBF24',
  accent: '#38BDF8',
} as const;

export const TerminalDemoScene: React.FC<Props> = ({ scene, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const typeFrames = Math.min(28, Math.max(12, Math.round(scene.command.length * 0.5)));
  const typedCount = Math.floor(
    interpolate(frame, [4, 4 + typeFrames], [0, scene.command.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const typedCommand = scene.command.slice(0, typedCount);
  const doneTyping = typedCount >= scene.command.length;
  const showCursor = !doneTyping || frame % 20 < 11;

  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span
          style={{
            fontFamily: FONT_FAMILIES.mono,
            fontSize: 20,
            fontWeight: 600,
            color: theme.accent,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}
        >
          WORKFLOW & HARNESS
        </span>
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
      </div>

      {/* Terminal Card */}
      <div
        style={{
          backgroundColor: '#0B0D13',
          border: `1.5px solid ${theme.accentBorder}`,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: `0 24px 64px rgba(0, 0, 0, 0.65), 0 0 36px ${theme.glow}`,
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#EF4444' }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#F59E0B' }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#10B981' }} />
          <span
            style={{
              marginLeft: 12,
              fontFamily: FONT_FAMILIES.mono,
              fontSize: 20,
              color: '#A1A1AA',
            }}
          >
            {scene.windowTitle}
          </span>
        </div>

        <div
          style={{
            padding: '28px 28px 34px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            fontFamily: FONT_FAMILIES.mono,
          }}
        >
          {/* Command prompt line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              fontSize: 27,
              lineHeight: 1.4,
              color: '#FFFFFF',
            }}
          >
            <span style={{ color: theme.accent, fontWeight: 700 }}>$</span>
            <span style={{ wordBreak: 'break-word' }}>
              {typedCommand}
              {showCursor ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 28,
                    backgroundColor: theme.accent,
                    marginLeft: 8,
                    borderRadius: 2,
                    verticalAlign: 'middle',
                  }}
                />
              ) : null}
            </span>
          </div>

          {/* Output lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
            {scene.outputLines.map((line, idx) => {
              const lineStart = 12 + typeFrames + idx * 6;
              const lineSpring = spring({
                frame: Math.max(0, frame - lineStart),
                fps,
                config: { damping: 18, stiffness: 150 },
              });
              return (
                <div
                  key={idx}
                  style={{
                    opacity: lineSpring,
                    transform: `translateX(${interpolate(lineSpring, [0, 1], [16, 0])}px)`,
                    fontSize: 24,
                    lineHeight: 1.42,
                    color: line.tone === 'accent' ? theme.accent : TONE_COLORS[line.tone],
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    padding: '10px 14px',
                    borderRadius: 10,
                    borderLeft: `3px solid ${line.tone === 'accent' ? theme.accent : TONE_COLORS[line.tone]}`,
                  }}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
