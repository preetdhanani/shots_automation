import React from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CodeCompareScene as CodeCompareData, ContentPillar } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES } from '../theme.js';

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
  accentColor: string;
  compact: boolean;
}> = ({ code, language, label, tone, highlightLines, accentColor, compact }) => {
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
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              backgroundColor: pillColor,
            }}
          />
          <span
            style={{
              fontFamily: FONT_FAMILIES.mono,
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
              fontFamily: FONT_FAMILIES.mono,
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
                    borderRadius: isHighlighted ? '0 6px 6px 0' : 6,
                    backgroundColor: isHighlighted ? 'rgba(52, 211, 153, 0.14)' : 'transparent',
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

export const CodeCompareScene: React.FC<Props> = ({ scene, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = PILLAR_THEMES[pillar];

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const afterSpring = spring({
    frame: Math.max(0, frame - 8),
    fps,
    config: { damping: 16, stiffness: 135 },
  });

  const isBeforeAfter = scene.mode === 'before_after' && Boolean(scene.beforeCode);

  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: 'rgba(17, 19, 27, 0.96)',
        border: '1.5px solid rgba(255, 255, 255, 0.11)',
        borderRadius: 28,
        padding: '30px 30px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header & Editor Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#EF4444' }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#F59E0B' }} />
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#10B981' }} />
            <span
              style={{
                marginLeft: 10,
                fontFamily: FONT_FAMILIES.mono,
                fontSize: 20,
                color: '#A1A1AA',
              }}
            >
              {scene.filename}
            </span>
          </div>
          <span
            style={{
              fontFamily: FONT_FAMILIES.mono,
              fontSize: 18,
              color: theme.accent,
              backgroundColor: theme.accentSoft,
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
            fontFamily: FONT_FAMILIES.display,
            fontSize: 40,
            fontWeight: 700,
            lineHeight: 1.15,
            color: '#FAFAFA',
          }}
        >
          {scene.title}
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
              accentColor={theme.accent}
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
              accentColor={theme.accent}
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
          accentColor={theme.accent}
          compact={false}
        />
      )}
    </div>
  );
};
