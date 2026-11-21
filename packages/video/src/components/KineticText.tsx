import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface KineticTextProps {
  text: string;
  emphasis?: readonly string[];
  highlightNumbers?: boolean;
  startFrame?: number;
  style?: React.CSSProperties;
}

const NUMBER_TOKEN_RE = /^[+-]?\$?\d+(?:[.,]\d+)?[%xXkKmMbB+]?$/;

function cleanToken(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9+$%]+|[^a-z0-9+%]+$/gi, '');
}

export const KineticText: React.FC<KineticTextProps> = ({
  text,
  emphasis,
  highlightNumbers = true,
  startFrame = 4,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useReelStyle();

  const emphasisSet = new Set(
    (emphasis ?? [])
      .flatMap((phrase) => phrase.split(/\s+/))
      .map(cleanToken)
      .filter((w) => w.length > 0),
  );

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <span style={style}>
      {words.map((word, idx) => {
        const cleaned = cleanToken(word);
        const isNum = highlightNumbers && NUMBER_TOKEN_RE.test(word.replace(/[,:;!?]$/, ''));
        const isEmphasized = (cleaned.length > 0 && emphasisSet.has(cleaned)) || isNum;

        if (!isEmphasized) {
          return (
            <React.Fragment key={`${word}-${idx}`}>
              {idx > 0 ? ' ' : ''}
              {word}
            </React.Fragment>
          );
        }

        const pop = spring({
          frame: Math.max(0, frame - (startFrame + Math.min(idx, 6) * 2)),
          fps,
          config: { damping: 12, stiffness: 190 },
        });
        const scale = 0.94 + pop * 0.08;

        return (
          <React.Fragment key={`${word}-${idx}`}>
            {idx > 0 ? ' ' : ''}
            <span
              style={{
                display: 'inline-block',
                color: palette.accent,
                textShadow: `0 0 22px ${palette.glow}`,
                transform: `scale(${scale.toFixed(3)})`,
                transformOrigin: 'center bottom',
              }}
            >
              {word}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
};
