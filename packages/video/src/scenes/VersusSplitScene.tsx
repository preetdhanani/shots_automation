import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type VersusSplitScene as VersusData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { computeBeatFrames, getActiveBeatIndex } from '../style/sceneRuntimeHelpers.js';

interface Props {
  scene: VersusData;
}

export const VersusSplitScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { isFirst, durationInFrames, words } = useSceneRuntime();
  const layout = resolveLayout('versus_split', scene.visual?.layout);

  const leftSpring = isFirst
    ? 1
    : spring({ frame: Math.max(0, frame - 2), fps, config: { damping: 16, stiffness: 140 } });
  const rightSpring = isFirst
    ? 1
    : spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 16, stiffness: 140 } });
  const verdictSpring = isFirst
    ? 1
    : spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 15, stiffness: 145 } });
  const beatFrames = computeBeatFrames(durationInFrames, 3, words, {
    startFrac: 0.14,
    endFrac: 0.74,
  });
  const activeBeat = getActiveBeatIndex(frame, beatFrames);

  const renderSide = (
    side: VersusData['left'],
    which: 'left' | 'right',
    anim: number,
    compact: boolean,
  ) => {
    const isWinner = scene.winner === which;
    const isLoser = scene.winner && scene.winner !== 'tie' && scene.winner !== which;
    const isFocusedBeat =
      (which === 'left' && activeBeat === 0) ||
      (which === 'right' && (activeBeat === 1 || (activeBeat >= 2 && isWinner)));
    const accent = which === 'left' ? palette.secondary : palette.accent;
    return (
      <div
        style={{
          flex: 1,
          opacity: anim * (isFocusedBeat ? 1 : 0.86),
          transform: `translateY(${interpolate(anim, [0, 1], [22, 0])}px) scale(${isFocusedBeat ? 1.01 : 0.99})`,
          backgroundColor: isWinner ? palette.accentSoft : palette.surface,
          border:
            isWinner || isFocusedBeat
              ? `2px solid ${palette.accentBorder}`
              : `1.5px solid ${palette.surfaceBorder}`,
          borderRadius: 24,
          padding: compact ? '24px 22px' : '26px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow:
            isWinner || isFocusedBeat
              ? `0 18px 46px rgba(0,0,0,0.5), 0 0 28px ${palette.glow}`
              : undefined,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: compact ? 'column' : 'row',
            alignItems: compact ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: compact ? 8 : 10,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: fonts.display,
                fontSize: compact ? 30 : 34,
                fontWeight: 700,
                lineHeight: 1.12,
                color: '#FFFFFF',
              }}
            >
              {side.name}
            </span>
            {isWinner ? (
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 16,
                  fontWeight: 700,
                  backgroundColor: palette.accent,
                  color: '#07080D',
                  padding: '4px 10px',
                  borderRadius: 8,
                }}
              >
                WINNER
              </span>
            ) : null}
          </div>
          {side.score ? (
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: compact ? 28 : 32,
                fontWeight: 700,
                color: isWinner ? palette.accent : accent,
              }}
            >
              {side.score}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {side.points.map((pt, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: isLoser ? '#F87171' : isWinner ? palette.accent : accent,
                }}
              >
                {isLoser ? '×' : '✓'}
              </span>
              <span
                style={{
                  fontSize: compact ? 23 : 26,
                  lineHeight: 1.32,
                  color: isLoser ? '#A1A1AA' : '#F4F4F5',
                }}
              >
                {pt}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
          HEAD-TO-HEAD COMPARISON
        </span>
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
          <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
        </h2>
      </div>

      {layout === 'horizontal' ? (
        <div style={{ display: 'flex', flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>
          {renderSide(scene.left, 'left', leftSpring, true)}
          {renderSide(scene.right, 'right', rightSpring, true)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
          {renderSide(scene.left, 'left', leftSpring, false)}
          <div
            style={{
              alignSelf: 'center',
              margin: '-10px 0',
              zIndex: 2,
              backgroundColor: palette.accent,
              color: '#07080D',
              fontFamily: fonts.mono,
              fontSize: 22,
              fontWeight: 700,
              padding: '6px 18px',
              borderRadius: 999,
              boxShadow: `0 0 24px ${palette.glow}`,
            }}
          >
            VS
          </div>
          {renderSide(scene.right, 'right', rightSpring, false)}
        </div>
      )}

      {scene.verdict ? (
        <div
          style={{
            opacity: verdictSpring,
            backgroundColor: activeBeat >= 2 ? palette.accentSoft : 'rgba(255,255,255,0.05)',
            borderLeft: `4px solid ${palette.accent}`,
            borderRadius: 14,
            padding: '16px 20px',
            fontSize: 25,
            fontWeight: 600,
            color: '#F4F4F5',
            boxShadow: activeBeat >= 2 ? `0 0 24px ${palette.glow}` : undefined,
          }}
        >
          {scene.verdict}
        </div>
      ) : null}
    </div>
  );
};
