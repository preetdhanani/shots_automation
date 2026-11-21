import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type ChecklistStepsScene as ChecklistData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { computeBeatFrames, getActiveBeatIndex } from '../style/sceneRuntimeHelpers.js';

interface Props {
  scene: ChecklistData;
}

export const ChecklistStepsScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const { durationInFrames, words } = useSceneRuntime();
  const layout = resolveLayout('checklist_steps', scene.visual?.layout);

  const isSteps = scene.mode === 'steps';
  const stepBeats = computeBeatFrames(durationInFrames, Math.max(1, scene.items.length), words, {
    startFrac: 0.12,
    endFrac: 0.78,
  });
  const activeStepIdx = getActiveBeatIndex(frame, stepBeats);

  if (layout === 'cards') {
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
            {isSteps ? 'STEP-BY-STEP PLAYBOOK' : 'DEVELOPER CHECKLIST'}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {scene.items.map((item, idx) => {
            const itemSpring = spring({
              frame: Math.max(0, frame - idx * 4),
              fps,
              config: { damping: 16, stiffness: 145 },
            });
            const isSpotlight = idx === activeStepIdx;
            return (
              <div
                key={idx}
                style={{
                  opacity: itemSpring * (isSpotlight ? 1 : 0.8),
                  transform: `translateY(${interpolate(itemSpring, [0, 1], [20, 0])}px) scale(${isSpotlight ? 1.015 : 1})`,
                  backgroundColor: isSpotlight ? palette.accentSoft : palette.surface,
                  border: `1.5px solid ${isSpotlight ? palette.accentBorder : palette.surfaceBorder}`,
                  borderRadius: 22,
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 18,
                  boxShadow: isSpotlight
                    ? `0 14px 36px rgba(0,0,0,0.45), 0 0 24px ${palette.glow}`
                    : '0 14px 36px rgba(0,0,0,0.45)',
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    backgroundColor: palette.accentSoft,
                    border: `1.5px solid ${palette.accentBorder}`,
                    color: palette.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: fonts.mono,
                    fontSize: 22,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {isSteps ? `0${idx + 1}` : '✓'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 30,
                      fontWeight: 700,
                      color: '#FFFFFF',
                      lineHeight: 1.2,
                    }}
                  >
                    {item.text}
                  </span>
                  {item.detail ? (
                    <span style={{ fontSize: 23, color: '#A1A1AA', lineHeight: 1.35 }}>
                      {item.detail}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: 'list'
  return (
    <div
      style={{
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
        borderRadius: 28,
        padding: '38px 34px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.58)',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
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
          {isSteps ? 'WORKFLOW STEPS' : 'CHECKLIST'}
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(44 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.12,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
          }}
        >
          <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {scene.items.map((item, idx) => {
          const itemSpring = spring({
            frame: Math.max(0, frame - idx * 4),
            fps,
            config: { damping: 16, stiffness: 145 },
          });
          const isSpotlight = idx === activeStepIdx;
          return (
            <div
              key={idx}
              style={{
                opacity: itemSpring * (isSpotlight ? 1 : 0.78),
                transform: `translateX(${interpolate(itemSpring, [0, 1], [24, 0])}px) scale(${isSpotlight ? 1.015 : 1})`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 18,
                padding: '10px 14px',
                borderRadius: 14,
                backgroundColor: isSpotlight ? palette.accentSoft : 'transparent',
                paddingBottom: idx < scene.items.length - 1 ? 18 : 10,
                borderBottom:
                  idx < scene.items.length - 1 ? '1px solid rgba(255,255,255,0.08)' : undefined,
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 26,
                  fontWeight: 700,
                  color: palette.accent,
                  minWidth: 42,
                }}
              >
                {isSteps ? `${idx + 1}.` : '[✓]'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: '#FAFAFA', lineHeight: 1.25 }}>
                  {item.text}
                </span>
                {item.detail ? (
                  <span style={{ fontSize: 23, color: '#A1A1AA', lineHeight: 1.35 }}>
                    {item.detail}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
