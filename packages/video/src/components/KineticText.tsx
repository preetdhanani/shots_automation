import React from 'react';
import { cleanEmphasisToken } from '@post/core';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { useSceneRuntime } from '../style/SceneRuntimeContext.js';
import { findSpokenWordFrame } from '../style/sceneRuntimeHelpers.js';

interface KineticTextProps {
  text: string;
  emphasis?: readonly string[];
  highlightNumbers?: boolean;
  startFrame?: number;
  style?: React.CSSProperties;
}

const NUMBER_TOKEN_RE = /^[+-]?\$?\d+(?:[.,]\d+)?[%xXkKmMbB+]?$/;

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
  const { isFirst, words: spokenWords } = useSceneRuntime();

  const emphasisSet = new Set(
    (emphasis ?? [])
      .flatMap((phrase) => phrase.split(/\s+/))
      .map(cleanEmphasisToken)
      .filter((w) => w.length > 0),
  );

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <span style={style}>
      {words.map((word, idx) => {
        const cleaned = cleanEmphasisToken(word);
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

        const spokenPulseFrame = findSpokenWordFrame(
          spokenWords,
          [cleaned],
          startFrame + Math.min(idx, 6) * 2,
        );

        let scale = 1;
        let glowRadius = 22;

        if (isFirst) {
          // Frame 0 is settled at scale 1.0 for clean cover thumbnail, then pulses at spoken timestamp
          const pulseDist = Math.abs(frame - Math.max(4, spokenPulseFrame));
          if (frame >= 3 && pulseDist < 10) {
            const boost = 1 - pulseDist / 10;
            scale = 1 + 0.045 * boost;
            glowRadius = 22 + 16 * boost;
          }
        } else {
          const pop = spring({
            frame: Math.max(0, frame - (startFrame + Math.min(idx, 6) * 2)),
            fps,
            config: { damping: 14, stiffness: 190 },
          });
          scale = 0.95 + pop * 0.05;
          const pulseDist = Math.abs(frame - spokenPulseFrame);
          if (spokenWords.length > 0 && pulseDist < 9) {
            const boost = 1 - pulseDist / 9;
            scale += 0.045 * boost;
            glowRadius += 14 * boost;
          }
        }

        return (
          <React.Fragment key={`${word}-${idx}`}>
            {idx > 0 ? ' ' : ''}
            <span
              style={{
                display: 'inline-block',
                paddingInline: '0.03em',
                color: palette.accent,
                textShadow: `0 0 ${Math.round(glowRadius)}px ${palette.glow}`,
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
