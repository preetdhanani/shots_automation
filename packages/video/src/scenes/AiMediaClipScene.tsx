import React from 'react';
import {
  interpolate,
  Loop,
  OffthreadVideo,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  resolveLayout,
  type AiMediaClipScene as AiMediaClipData,
  type ReelAssetRef,
} from '@post/core';
import { KineticText } from '../components/KineticText.js';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: AiMediaClipData;
  assetRef?: ReelAssetRef;
}

export const AiMediaClipScene: React.FC<Props> = ({ scene, assetRef }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts, assetUrls } = useReelStyle();
  const layout = resolveLayout('ai_media_clip', scene.visual?.layout);

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const videoUrl = scene.videoAsset ? assetUrls[scene.videoAsset] : undefined;
  const clipDurationMs = assetRef?.durationMs ?? (scene.durationHintSec ?? 6) * 1000;
  const loopFrames = Math.max(1, Math.floor((clipDurationMs / 1000) * fps) - 1);

  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.12);

  const renderVisualSurface = (heightPx: number) => {
    if (videoUrl) {
      return (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: heightPx,
            overflow: 'hidden',
            backgroundColor: '#05070C',
          }}
        >
          <Loop durationInFrames={loopFrames}>
            <OffthreadVideo
              src={videoUrl}
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </Loop>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(5,7,12,0.18) 0%, rgba(5,7,12,0.82) 100%)',
            }}
          />
        </div>
      );
    }

    // Animated abstract kinetic fallback when offline or Veo unavailable
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: heightPx,
          overflow: 'hidden',
          background: `radial-gradient(circle at ${30 + pulse * 38}% ${32 + (1 - pulse) * 28}%, ${palette.glow} 0%, #090C14 58%), radial-gradient(circle at ${74 - pulse * 26}% 72%, ${palette.secondarySoft} 0%, transparent 55%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 300 + pulse * 70,
            height: 300 + pulse * 70,
            borderRadius: 999,
            border: `2px solid ${palette.accentBorder}`,
            boxShadow: `0 0 60px ${palette.glow}`,
            opacity: 0.75,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 170 + (1 - pulse) * 50,
            height: 170 + (1 - pulse) * 50,
            borderRadius: 999,
            border: `2px solid ${palette.secondary}`,
            opacity: 0.55,
          }}
        />
      </div>
    );
  };

  if (layout === 'framed') {
    return (
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${interpolate(cardSpring, [0, 1], [24, 0])}px)`,
          backgroundColor: palette.surface,
          border: `1.5px solid ${palette.accentBorder}`,
          borderRadius: 28,
          overflow: 'hidden',
          boxShadow: `0 24px 64px rgba(0,0,0,0.62), 0 0 34px ${palette.glow}`,
        }}
      >
        {renderVisualSurface(560)}
        <div style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 19,
              fontWeight: 700,
              color: palette.accent,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {videoUrl ? 'AI MOTION CLIP' : 'VISUAL INTERLUDE'}
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: Math.round(40 * fonts.headlineScale),
              fontWeight: 700,
              lineHeight: 1.15,
              textTransform: fonts.headlineTransform,
              color: '#FFFFFF',
            }}
          >
            <KineticText text={scene.captionText} emphasis={scene.visual?.emphasis} />
          </h2>
        </div>
      </div>
    );
  }

  // Default: 'full_bleed'
  return (
    <div
      style={{
        opacity: cardSpring,
        position: 'relative',
        borderRadius: 30,
        overflow: 'hidden',
        border: `2px solid ${palette.accentBorder}`,
        boxShadow: `0 28px 72px rgba(0,0,0,0.68), 0 0 40px ${palette.glow}`,
      }}
    >
      {renderVisualSurface(860)}

      <div
        style={{
          position: 'absolute',
          left: 32,
          right: 32,
          bottom: 36,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <span
          style={{
            alignSelf: 'flex-start',
            fontFamily: fonts.mono,
            fontSize: 19,
            fontWeight: 700,
            color: '#07080D',
            backgroundColor: palette.accent,
            padding: '6px 16px',
            borderRadius: 999,
            letterSpacing: '0.08em',
          }}
        >
          {videoUrl ? 'AI B-ROLL' : 'VISUAL SPOTLIGHT'}
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: Math.round(48 * fonts.headlineScale),
            fontWeight: 700,
            lineHeight: 1.1,
            textTransform: fonts.headlineTransform,
            color: '#FFFFFF',
            textShadow: '0 4px 20px rgba(0,0,0,0.9)',
          }}
        >
          <KineticText text={scene.captionText} emphasis={scene.visual?.emphasis} />
        </h2>
      </div>
    </div>
  );
};
