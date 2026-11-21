import React from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  resolveLayout,
  type CodeCompareScene as CodeCompareData,
  type ContentPillar,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: CodeCompareData;
  pillar: ContentPillar;
}

const CodePanel: React.FC<{
  code: string;
  language: string;
  label?: string;
  tone: 'neutral' | 'before' | 'after';
  highlightLines?: number[];
  dimUnfocused?: boolean;
  accentColor: string;
  monoFont: string;
  compact: boolean;
}> = ({
  code,
  language,
  label,
  tone,
  highlightLines,
  dimUnfocused,
  accentColor,
  monoFont,
  compact,
}) => {
  const highlightSet = new Set(highlightLines ?? []);
  const borderColor =
    tone === 'before'
      ? 'rgba(248, 113, 113, 0.36)'
      : tone === 'after'
        ? 'rgba(52, 211, 153, 0.44)'
        : 'rgba(255, 255, 255, 0.12)';
  const pillColor =
    tone === 'before' ? '#F87171' : tone === 'after' ? '#34D399' : accentColor;

  return (
    <div
      style={{
        backgroundColor: '#0D1017',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
      {label ? (
        <div
          style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: pillColor }} />
          <span
            style={{
              fontFamily: monoFont,
              fontSize: 19,
              fontWeight: 700,
              color: pillColor,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
        </div>
      ) : null}

      <Highlight theme={themes.nightOwl} code={code.trimEnd()} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{
              margin: 0,
              padding: compact ? '18px 20px' : '24px 24px',
              fontFamily: monoFont,
              fontSize: compact ? 23 : 27,
              lineHeight: compact ? 1.46 : 1.54,
              backgroundColor: 'transparent',
              overflow: 'hidden',
            }}
          >
            {tokens.map((line, i) => {
              const lineNum = i + 1;
              const isHighlighted = highlightSet.has(lineNum);
              const lineProps = getLineProps({ line });
              const dimmed = Boolean(dimUnfocused && highlightSet.size > 0 && !isHighlighted);
              return (
                <div
                  key={i}
                  {...lineProps}
                  style={{
                    ...lineProps.style,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '2px 8px',
                    opacity: dimmed ? 0.34 : 1,
                    borderRadius: isHighlighted ? '0 6px 6px 0' : 6,
                    backgroundColor: isHighlighted ? 'rgba(52, 211, 153, 0.16)' : 'transparent',
                    borderLeft: isHighlighted
                      ? `3px solid ${accentColor}`
                      : '3px solid transparent',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      color: '#52525B',
                      fontSize: compact ? 18 : 20,
                      textAlign: 'right',
                      userSelect: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {lineNum}
                  </span>
                  <span style={{ whiteSpace: 'pre' }}>
                    {line.map((token, key) => {
                      const tokenProps = getTokenProps({ token });
                      return <span key={key} {...tokenProps} />;
                    })}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
};

export const CodeCompareScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('code_compare', scene.visual?.layout);

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const afterSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 16, stiffness: 135 },
  });

  const isBeforeAfter = scene.mode === 'before_after' && Boolean(scene.beforeCode);

  if (layout === 'diff') {
    const beforeLines = isBeforeAfter ? scene.beforeCode!.replace(/\r\n/g, '\n').split('\n') : [];
    const afterLines = scene.afterCode.replace(/\r\n/g, '\n').split('\n');
    const diffRows: Array<{ sign: '-' | '+' | ' '; text: string }> = [
      ...beforeLines.map((text) => ({ sign: '-' as const, text })),
      ...afterLines.map((text) => ({
        sign: (isBeforeAfter ? '+' : ' ') as '+' | ' ',
        text,
      })),
    ];

    return (
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${interpolate(cardSpring, [0, 1], [22, 0])}px)`,
          backgroundColor: '#0B0E14',
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 26,
          overflow: 'hidden',
          boxShadow: `0 24px 64px rgba(0,0,0,0.62), 0 0 30px ${palette.glow}`,
        }}
      >
        <div
          style={{
            padding: '22px 28px',
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 19, color: palette.accent }}>
              git diff -- {scene.filename}
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 18, color: '#34D399' }}>
              +{afterLines.length} -{beforeLines.length}
            </span>
          </div>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(38 * fonts.headlineScale),
              fontWeight: 700,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
          </h2>
        </div>

        <div
          style={{
            padding: '20px 18px',
            fontFamily: fonts.mono,
            fontSize: 22,
            lineHeight: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {diffRows.slice(0, 16).map((row, idx) => {
            const rowSpring = spring({
              frame: Math.max(0, frame - (3 + idx * 2)),
              fps,
              config: { damping: 18, stiffness: 160 },
            });
            const bg =
              row.sign === '-'
                ? 'rgba(248, 113, 113, 0.14)'
                : row.sign === '+'
                  ? 'rgba(52, 211, 153, 0.14)'
                  : 'transparent';
            const color =
              row.sign === '-' ? '#FCA5A5' : row.sign === '+' ? '#6EE7B7' : '#E4E4E7';
            return (
              <div
                key={idx}
                style={{
                  opacity: rowSpring,
                  backgroundColor: bg,
                  color,
                  padding: '4px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  gap: 12,
                  whiteSpace: 'pre',
                }}
              >
                <span style={{ fontWeight: 700, width: 18 }}>{row.sign}</span>
                <span>{row.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (layout === 'focus') {
    return (
      <div
        style={{
          opacity: cardSpring,
          transform: `scale(${interpolate(cardSpring, [0, 1], [0.95, 1])})`,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            CODE SPOTLIGHT · {scene.filename}
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 18,
              color: '#07080D',
              backgroundColor: palette.accent,
              padding: '4px 12px',
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            {scene.language}
          </span>
        </div>

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

        <div style={{ boxShadow: `0 24px 64px rgba(0,0,0,0.65), 0 0 34px ${palette.glow}`, borderRadius: 20 }}>
          <CodePanel
            code={scene.afterCode}
            language={scene.language}
            label={scene.afterLabel ?? 'Key Pattern'}
            tone="after"
            highlightLines={scene.highlightLines}
            dimUnfocused
            accentColor={palette.accent}
            monoFont={fonts.mono}
            compact={false}
          />
        </div>
      </div>
    );
  }

  // Default: 'stacked'
  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.surfaceBorder}`,
        borderRadius: 28,
        padding: '30px 30px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#EF4444' }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#F59E0B' }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#10B981' }} />
            <span
              style={{
                marginLeft: 10,
                fontFamily: fonts.mono,
                fontSize: 20,
                color: '#A1A1AA',
              }}
            >
              {scene.filename}
            </span>
          </div>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 18,
              color: palette.accent,
              backgroundColor: palette.accentSoft,
              padding: '4px 12px',
              borderRadius: 8,
            }}
          >
            {scene.language}
          </span>
        </div>

        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(40 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.15,
            textTransform: fonts.headlineTransform,
            color: '#FAFAFA',
          }}
        >
          <KineticText text={scene.title} emphasis={scene.visual?.emphasis} />
        </h2>
      </div>

      {isBeforeAfter ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ opacity: 0.9 }}>
            <CodePanel
              code={scene.beforeCode!}
              language={scene.language}
              label={scene.beforeLabel ?? 'Before'}
              tone="before"
              accentColor={palette.accent}
              monoFont={fonts.mono}
              compact
            />
          </div>
          <div
            style={{
              opacity: afterSpring,
              transform: `translateY(${interpolate(afterSpring, [0, 1], [16, 0])}px)`,
            }}
          >
            <CodePanel
              code={scene.afterCode}
              language={scene.language}
              label={scene.afterLabel ?? 'Better Pattern'}
              tone="after"
              highlightLines={scene.highlightLines}
              accentColor={palette.accent}
              monoFont={fonts.mono}
              compact
            />
          </div>
        </div>
      ) : (
        <CodePanel
          code={scene.afterCode}
          language={scene.language}
          label={scene.afterLabel}
          tone="neutral"
          highlightLines={scene.highlightLines}
          accentColor={palette.accent}
          monoFont={fonts.mono}
          compact={false}
        />
      )}
    </div>
  );
};
