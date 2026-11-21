import React, { useMemo } from 'react';
import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionToken, ContentPillar } from '@post/core';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { SAFE_ZONE } from '../theme.js';

interface CaptionOverlayProps {
  captions: CaptionToken[];
  pillar: ContentPillar;
  emphasisWords?: readonly string[];
}

function cleanWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+$%]/g, '');
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ captions, emphasisWords }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;
  const { style, palette, fonts } = useReelStyle();

  const emphasisSet = useMemo(
    () =>
      new Set(
        (emphasisWords ?? [])
          .flatMap((w) => w.split(/\s+/))
          .map(cleanWord)
          .filter(Boolean),
      ),
    [emphasisWords],
  );

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

  const captionStyle = style.captionStyle;

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
        zIndex: 10,
      }}
    >
      {captionStyle === 'bold_pop' ? (
        <div
          style={{
            textAlign: 'center',
            maxWidth: '100%',
            fontFamily: fonts.display,
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '6px 22px',
          }}
        >
          {currentPage.tokens.map((token, idx) => {
            const isActive = timeInMs >= token.fromMs && timeInMs < token.toMs;
            const isKey = emphasisSet.has(cleanWord(token.text));
            return (
              <span
                key={`${token.fromMs}-${idx}`}
                style={{
                  color: isActive ? palette.accent : isKey ? palette.secondary : '#FFFFFF',
                  transform: isActive ? 'scale(1.14) translateY(-3px)' : 'scale(1)',
                  display: 'inline-block',
                  WebkitTextStroke: '2px rgba(5, 5, 8, 0.92)',
                  textShadow: isActive
                    ? `0 6px 20px rgba(0,0,0,0.95), 0 0 24px ${palette.glow}`
                    : '0 5px 14px rgba(0,0,0,0.95)',
                }}
              >
                {token.text.trim()}
              </span>
            );
          })}
        </div>
      ) : captionStyle === 'underline_sweep' ? (
        <div
          style={{
            padding: '10px 18px',
            textAlign: 'center',
            maxWidth: '100%',
          }}
        >
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 44,
              fontWeight: 700,
              lineHeight: 1.25,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '4px 14px',
            }}
          >
            {currentPage.tokens.map((token, idx) => {
              const isActive = timeInMs >= token.fromMs && timeInMs < token.toMs;
              const wasSpoken = timeInMs >= token.toMs;
              return (
                <span
                  key={`${token.fromMs}-${idx}`}
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    color: isActive ? '#FFFFFF' : wasSpoken ? '#F4F4F5' : '#A1A1AA',
                    paddingBottom: 7,
                    borderBottom: isActive
                      ? `6px solid ${palette.accent}`
                      : '6px solid rgba(255,255,255,0.12)',
                    textShadow: isActive
                      ? `0 4px 18px rgba(0,0,0,0.95), 0 0 18px ${palette.glow}`
                      : '0 4px 12px rgba(0,0,0,0.95)',
                  }}
                >
                  {token.text.trim()}
                </span>
              );
            })}
          </div>
        </div>
      ) : captionStyle === 'karaoke_block' ? (
        <div
          style={{
            backgroundColor: 'rgba(10, 12, 18, 0.86)',
            border: `1.5px solid ${palette.surfaceBorder}`,
            borderRadius: 22,
            padding: '12px 22px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
            textAlign: 'center',
            maxWidth: '100%',
          }}
        >
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1.28,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '6px 8px',
            }}
          >
            {currentPage.tokens.map((token, idx) => {
              const isActive = timeInMs >= token.fromMs && timeInMs < token.toMs;
              const isKey = emphasisSet.has(cleanWord(token.text));
              return (
                <span
                  key={`${token.fromMs}-${idx}`}
                  style={{
                    display: 'inline-block',
                    padding: isActive ? '3px 12px' : '3px 6px',
                    borderRadius: 10,
                    backgroundColor: isActive ? palette.accent : 'transparent',
                    color: isActive ? '#07080D' : isKey ? palette.accent : '#F4F4F5',
                    boxShadow: isActive ? `0 0 20px ${palette.glow}` : undefined,
                  }}
                >
                  {token.text.trim()}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        /* Default: glass_box */
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
              fontFamily: fonts.display,
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
              const isKey = emphasisSet.has(cleanWord(token.text));
              return (
                <span
                  key={`${token.fromMs}-${idx}`}
                  style={{
                    color: isActive
                      ? palette.accent
                      : isKey
                        ? palette.secondary
                        : wasSpoken
                          ? '#FFFFFF'
                          : '#D4D4D8',
                    transform: isActive ? 'scale(1.06)' : 'scale(1)',
                    display: 'inline-block',
                    textShadow: isActive
                      ? `0 0 18px ${palette.glow}`
                      : '0 2px 8px rgba(0,0,0,0.8)',
                  }}
                >
                  {token.text.trim()}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
