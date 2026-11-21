import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionToken, ContentPillar, SceneTiming } from '@post/core';
import { useReelStyle } from '../style/ReelStyleContext.js';
import { CAPTION_FONT_FAMILY, SAFE_ZONE } from '../theme.js';
import { buildCaptionPages, findActiveCaptionPage } from './captionPaging.js';

interface CaptionOverlayProps {
  captions: CaptionToken[];
  sceneTimings?: readonly SceneTiming[];
  pillar: ContentPillar;
  emphasisWords?: readonly string[];
}

function cleanWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+$%]/g, '');
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  captions,
  sceneTimings,
  emphasisWords,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;
  const { style, palette } = useReelStyle();

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

  const sceneBoundariesMs = useMemo(
    () => (sceneTimings ?? []).slice(1).map((t) => t.startMs),
    [sceneTimings],
  );

  const pages = useMemo(
    () =>
      buildCaptionPages(captions, {
        combineTokensWithinMilliseconds: 700,
        maxWordsPerPage: 4,
        sceneBoundariesMs,
      }),
    [captions, sceneBoundariesMs],
  );

  // Keep Frame 0-2 (cover frame) completely caption-free for clean IG Reels grid thumbnails
  if (frame < 3 || timeInMs < 100) {
    return null;
  }

  const currentPage = findActiveCaptionPage(pages, timeInMs);

  if (!currentPage || currentPage.tokens.length === 0) {
    return null;
  }

  const firstStartMs = Math.max(100, pages[0]?.startMs ?? 100);
  const fadeInOpacity = interpolate(timeInMs, [firstStartMs, firstStartMs + 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lastPage = pages[pages.length - 1]!;
  const lastTokenEndMs = lastPage.tokens[lastPage.tokens.length - 1]!.toMs;
  const tailFadeOpacity =
    currentPage === lastPage && timeInMs >= lastTokenEndMs
      ? interpolate(timeInMs, [lastTokenEndMs, lastTokenEndMs + 180], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;
  const overlayOpacity = Math.min(fadeInOpacity, tailFadeOpacity);

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
        opacity: overlayOpacity,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {captionStyle === 'bold_pop' ? (
        <div
          style={{
            textAlign: 'center',
            maxWidth: '100%',
            fontFamily: CAPTION_FONT_FAMILY,
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 28px',
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
                  transform: isActive ? 'scale(1.07) translateY(-3px)' : 'scale(1)',
                  display: 'inline-block',
                  WebkitTextStroke: '4px rgba(5, 5, 8, 0.94)',
                  paintOrder: 'stroke fill',
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
              fontFamily: CAPTION_FONT_FAMILY,
              fontSize: 44,
              fontWeight: 700,
              lineHeight: 1.25,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '6px 18px',
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
                    WebkitTextStroke: '2px rgba(5, 5, 8, 0.85)',
                    paintOrder: 'stroke fill',
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
              fontFamily: CAPTION_FONT_FAMILY,
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1.28,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '6px 12px',
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
              fontFamily: CAPTION_FONT_FAMILY,
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: '0em',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '6px 20px',
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
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
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
