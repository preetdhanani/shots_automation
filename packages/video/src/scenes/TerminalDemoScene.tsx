import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type ContentPillar,
  type TerminalDemoScene as TerminalData,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { computeBeatFrames, getActiveBeatIndex } from '../style/sceneRuntimeHelpers.js';

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

export const TerminalDemoScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { durationInFrames, words } = useSceneRuntime();
  const layout = resolveLayout('terminal_demo', scene.visual?.layout);

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
  const outputBeats = computeBeatFrames(durationInFrames, Math.max(1, scene.outputLines.length), words, {
    startFrac: 0.25,
    endFrac: 0.82,
  });
  const activeOutputIdx = getActiveBeatIndex(frame, outputBeats);

  if (layout === 'retro_fullscreen') {
    return (
      <div
        style={{
          opacity: cardSpring,
          backgroundColor: '#05080D',
          border: `2px solid ${palette.accentBorder}`,
          borderRadius: 18,
          padding: '32px 30px',
          boxShadow: `0 0 44px ${palette.glow}, inset 0 0 36px rgba(0,0,0,0.85)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          fontFamily: fonts.mono,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${palette.accentBorder}`,
            paddingBottom: 14,
            fontSize: 19,
            color: palette.accent,
          }}
        >
          <span>TTY // {scene.windowTitle.toUpperCase()}</span>
          <span>LIVE SHELL</span>
        </div>

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

        <div
          style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: `1px solid ${palette.accentBorder}`,
            borderRadius: 12,
            padding: '18px 20px',
            fontSize: 29,
            color: palette.accent,
            textShadow: `0 0 14px ${palette.glow}`,
          }}
        >
          &gt; {typedCommand}
          {showCursor ? (
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 30,
                backgroundColor: palette.accent,
                marginLeft: 8,
                verticalAlign: 'middle',
              }}
            />
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {scene.outputLines.map((line, idx) => {
            const lineStart = Math.min(10 + typeFrames + idx * 5, outputBeats[idx] ?? 10 + typeFrames + idx * 5);
            const lineSpring = spring({
              frame: Math.max(0, frame - lineStart),
              fps,
              config: { damping: 18, stiffness: 150 },
            });
            const isSpotlight = idx === activeOutputIdx;
            const color = line.tone === 'accent' ? palette.accent : TONE_COLORS[line.tone];
            return (
              <div
                key={idx}
                style={{
                  opacity: lineSpring * (isSpotlight ? 1 : 0.8),
                  fontSize: 25,
                  lineHeight: 1.4,
                  color,
                  backgroundColor: isSpotlight ? palette.accentSoft : 'transparent',
                  padding: '6px 10px',
                  borderRadius: 8,
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: 'window'
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
            fontFamily: fonts.mono,
            fontSize: 20,
            fontWeight: 600,
            color: palette.accent,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}
        >
          WORKFLOW & HARNESS
        </span>
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
      </div>

      <div
        style={{
          backgroundColor: '#0B0D13',
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: `0 24px 64px rgba(0, 0, 0, 0.65), 0 0 36px ${palette.glow}`,
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
              fontFamily: fonts.mono,
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
            fontFamily: fonts.mono,
          }}
        >
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
            <span style={{ color: palette.accent, fontWeight: 700 }}>$</span>
            <span style={{ wordBreak: 'break-word' }}>
              {typedCommand}
              {showCursor ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 28,
                    backgroundColor: palette.accent,
                    marginLeft: 8,
                    borderRadius: 2,
                    verticalAlign: 'middle',
                  }}
                />
              ) : null}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
            {scene.outputLines.map((line, idx) => {
              const lineStart = Math.min(12 + typeFrames + idx * 6, outputBeats[idx] ?? 12 + typeFrames + idx * 6);
              const lineSpring = spring({
                frame: Math.max(0, frame - lineStart),
                fps,
                config: { damping: 18, stiffness: 150 },
              });
              const isSpotlight = idx === activeOutputIdx;
              const color = line.tone === 'accent' ? palette.accent : TONE_COLORS[line.tone];
              return (
                <div
                  key={idx}
                  style={{
                    opacity: lineSpring * (isSpotlight ? 1 : 0.8),
                    transform: `translateX(${interpolate(lineSpring, [0, 1], [16, 0])}px) scale(${isSpotlight ? 1.015 : 1})`,
                    fontSize: 24,
                    lineHeight: 1.42,
                    color,
                    backgroundColor: isSpotlight ? palette.accentSoft : 'rgba(255, 255, 255, 0.03)',
                    padding: '10px 14px',
                    borderRadius: 10,
                    borderLeft: `3px solid ${color}`,
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
