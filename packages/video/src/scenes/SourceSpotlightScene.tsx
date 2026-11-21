import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type SourceSpotlightScene as SourceSpotlightData } from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: SourceSpotlightData;
}

export const SourceSpotlightScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { palette, fonts, assetUrls } = useReelStyle();
  const layout = resolveLayout('source_spotlight', scene.visual?.layout);

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const zoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1.0, 1.07], {
    extrapolateRight: 'clamp',
  });

  const imageUrl = scene.imageAsset ? assetUrls[scene.imageAsset] : undefined;

  const renderFallbackGraphic = () => (
    <div
      style={{
        height: 410,
        background: `linear-gradient(135deg, ${palette.accentSoft} 0%, #0D111A 55%, ${palette.secondarySoft} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '32px 30px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 20,
          fontWeight: 700,
          color: palette.accent,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        PRIMARY SOURCE · {scene.domain}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: Math.round(44 * fonts.headlineScale),
          fontWeight: 700,
          lineHeight: 1.12,
          textTransform: fonts.headlineTransform,
          color: '#FFFFFF',
        }}
      >
        <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ width: 90, height: 6, borderRadius: 999, backgroundColor: palette.accent }} />
        <span style={{ width: 42, height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)' }} />
      </div>
    </div>
  );

  if (layout === 'polaroid') {
    return (
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px) rotate(-1.2deg)`,
          backgroundColor: '#131620',
          border: `2px solid ${palette.accentBorder}`,
          borderRadius: 26,
          padding: '22px 22px 32px',
          boxShadow: `0 28px 70px rgba(0,0,0,0.68), 0 0 36px ${palette.glow}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.12)',
            backgroundColor: '#090B10',
          }}
        >
          {imageUrl ? (
            <div style={{ height: 470, overflow: 'hidden', position: 'relative' }}>
              <Img
                src={imageUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `scale(${zoom.toFixed(4)})`,
                }}
              />
            </div>
          ) : (
            renderFallbackGraphic()
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 8px' }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 19,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.07em',
            }}
          >
            {scene.domain}
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(38 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.15,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
          </h2>
          {scene.caption ? (
            <p style={{ margin: 0, fontSize: 25, color: '#A1A1AA', lineHeight: 1.35 }}>
              {scene.caption}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // Default: 'browser_frame'
  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
        backgroundColor: '#0D1017',
        border: `1.5px solid ${palette.accentBorder}`,
        borderRadius: 26,
        overflow: 'hidden',
        boxShadow: `0 24px 64px rgba(0,0,0,0.65), 0 0 34px ${palette.glow}`,
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          padding: '16px 22px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#EF4444' }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#F59E0B' }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: '#10B981' }} />
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '7px 14px',
            fontFamily: fonts.mono,
            fontSize: 19,
            color: '#D4D4D8',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          https://{scene.domain}
        </div>
      </div>

      {/* Media preview or editorial fallback */}
      {imageUrl ? (
        <div style={{ height: 470, overflow: 'hidden', position: 'relative', backgroundColor: '#07080D' }}>
          <Img
            src={imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${zoom.toFixed(4)})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 55%, rgba(13,16,23,0.92) 100%)',
            }}
          />
        </div>
      ) : (
        renderFallbackGraphic()
      )}

      {/* Headline + caption bar */}
      <div style={{ padding: '26px 28px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {imageUrl ? (
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(38 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.15,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.headline} emphasis={scene.visual?.emphasis} />
          </h2>
        ) : null}
        {scene.caption ? (
          <p style={{ margin: 0, fontSize: 26, lineHeight: 1.38, color: '#D4D4D8' }}>
            {scene.caption}
          </p>
        ) : null}
      </div>
    </div>
  );
};
