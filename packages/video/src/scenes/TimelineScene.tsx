import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type TimelineScene as TimelineData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: TimelineData;
}

export const TimelineScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('timeline', scene.visual?.layout);

  const lineProgress = interpolate(frame, [4, 24], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (layout === 'zigzag') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
            MILESTONE TIMELINE
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

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Center vertical spine */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 16,
              width: 3,
              height: `${lineProgress}%`,
              background: `linear-gradient(180deg, ${palette.accent}, ${palette.secondary})`,
              transform: 'translateX(-50%)',
              opacity: 0.7,
            }}
          />

          {scene.events.map((ev, idx) => {
            const evSpring = spring({
              frame: Math.max(0, frame - (4 + idx * 5)),
              fps,
              config: { damping: 16, stiffness: 145 },
            });
            const isLeft = idx % 2 === 0;
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: isLeft ? 'flex-start' : 'flex-end',
                  opacity: evSpring,
                  transform: `translateX(${interpolate(evSpring, [0, 1], [isLeft ? -26 : 26, 0])}px)`,
                }}
              >
                <div
                  style={{
                    width: '82%',
                    backgroundColor: palette.surface,
                    border: `1.5px solid ${idx === scene.events.length - 1 ? palette.accentBorder : palette.surfaceBorder}`,
                    borderRadius: 20,
                    padding: '18px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.mono,
                      fontSize: 19,
                      fontWeight: 700,
                      color: palette.accent,
                      textTransform: 'uppercase',
                    }}
                  >
                    {ev.label}
                  </span>
                  <span style={{ fontSize: 27, fontWeight: 600, color: '#F4F4F5', lineHeight: 1.3 }}>
                    {ev.text}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: 'vertical'
  return (
    <div
      style={{
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
        borderRadius: 28,
        padding: '38px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
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
          EVOLUTION TIMELINE
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

      <div style={{ position: 'relative', paddingLeft: 42, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Left rail */}
        <div
          style={{
            position: 'absolute',
            left: 11,
            top: 12,
            width: 4,
            height: `${lineProgress}%`,
            borderRadius: 999,
            background: `linear-gradient(180deg, ${palette.accent}, ${palette.secondary})`,
          }}
        />

        {scene.events.map((ev, idx) => {
          const evSpring = spring({
            frame: Math.max(0, frame - (4 + idx * 6)),
            fps,
            config: { damping: 16, stiffness: 145 },
          });
          const isLast = idx === scene.events.length - 1;
          return (
            <div
              key={idx}
              style={{
                position: 'relative',
                opacity: evSpring,
                transform: `translateY(${interpolate(evSpring, [0, 1], [16, 0])}px)`,
                backgroundColor: isLast ? palette.accentSoft : 'rgba(255,255,255,0.03)',
                border: isLast
                  ? `1.5px solid ${palette.accentBorder}`
                  : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 18,
                padding: '18px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: -39,
                  top: 24,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  backgroundColor: isLast ? palette.accent : '#18181B',
                  border: `3px solid ${palette.accent}`,
                  boxShadow: isLast ? `0 0 16px ${palette.glow}` : undefined,
                }}
              />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 19,
                  fontWeight: 700,
                  color: palette.accent,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {ev.label}
              </span>
              <span style={{ fontSize: 28, fontWeight: 600, color: '#F4F4F5', lineHeight: 1.32 }}>
                {ev.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
