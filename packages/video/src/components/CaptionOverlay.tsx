import React, { useMemo } from 'react';
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionToken, ContentPillar } from '@post/core';
import { FONT_FAMILIES, PILLAR_THEMES, SAFE_ZONE } from '../theme.js';

interface CaptionOverlayProps {
  captions: CaptionToken[];
  pillar: ContentPillar;
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ captions, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;
  const theme = PILLAR_THEMES[pillar];

  const pages = useMemo(() => {
    const normalized: Caption[] = captions.map((c) => ({
      text: c.text,
      startMs: c.startMs,
      endMs: c.endMs,
      timestampMs: c.timestampMs ?? c.startMs,
      confidence: c.confidence ?? null,
    }));
    return createTikTokStyleCaptions({
      captions: normalized,
      combineTokensWithinMilliseconds: 950,
    }).pages;
  }, [captions]);

  const currentPage = pages.find(
    (page) => timeInMs >= page.startMs && timeInMs <= page.startMs + page.durationMs + 120,
  );

  if (!currentPage || currentPage.tokens.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: SAFE_ZONE.captionBottom,
        left: SAFE_ZONE.left,
        right: SAFE_ZONE.right,
        height: SAFE_ZONE.captionHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(12, 14, 20, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 20,
          padding: '14px 26px',
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55)',
          textAlign: 'center',
          maxWidth: '100%',
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILIES.display,
            fontSize: 40,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '4px 10px',
          }}
        >
          {currentPage.tokens.map((token, idx) => {
            const isActive = timeInMs >= token.fromMs && timeInMs < token.toMs;
            const wasSpoken = timeInMs >= token.toMs;
            return (
              <span
                key={`${token.fromMs}-${idx}`}
                style={{
                  color: isActive ? theme.accent : wasSpoken ? '#FFFFFF' : '#D4D4D8',
                  transform: isActive ? 'scale(1.06)' : 'scale(1)',
                  display: 'inline-block',
                  textShadow: isActive ? `0 0 18px ${theme.glow}` : '0 2px 8px rgba(0,0,0,0.8)',
                }}
              >
                {token.text.trim()}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
