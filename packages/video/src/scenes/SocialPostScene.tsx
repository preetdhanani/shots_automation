import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveLayout, type SocialPostScene as SocialPostData } from '@post/core';
import { useReelStyle } from '../style/ReelStyleContext.js';

interface Props {
  scene: SocialPostData;
}

const PLATFORM_BADGES: Record<SocialPostData['platform'], string> = {
  x: 'X / POST',
  threads: 'THREADS',
  bluesky: 'BLUESKY',
  linkedin: 'LINKEDIN',
  github: 'GITHUB',
  hn: 'HACKER NEWS',
  reddit: 'REDDIT',
  blog: 'ENGINEERING BLOG',
};

export const SocialPostScene: React.FC<Props> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, fonts } = useReelStyle();
  const layout = resolveLayout('social_post', scene.visual?.layout);

  const cardSpring = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  const platformLabel = PLATFORM_BADGES[scene.platform] ?? scene.platform.toUpperCase();

  if (layout === 'minimal') {
    return (
      <div
        style={{
          opacity: cardSpring,
          transform: `translateY(${interpolate(cardSpring, [0, 1], [20, 0])}px)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 26,
          padding: '20px 10px',
          borderLeft: `6px solid ${palette.accent}`,
          paddingLeft: 32,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 20,
            fontWeight: 700,
            color: palette.accent,
            letterSpacing: '0.08em',
          }}
        >
          {platformLabel} {scene.contextLabel ? `· ${scene.contextLabel}` : ''}
        </span>

        <p
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontSize: 42,
            fontWeight: 600,
            lineHeight: 1.28,
            color: '#FFFFFF',
          }}
        >
          &ldquo;{scene.postText}&rdquo;
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: '#F4F4F5' }}>
            {scene.authorName}
          </span>
          {scene.authorHandle ? (
            <span style={{ fontFamily: fonts.mono, fontSize: 22, color: '#A1A1AA' }}>
              {scene.authorHandle}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // Default: 'card'
  return (
    <div
      style={{
        opacity: cardSpring,
        transform: `translateY(${interpolate(cardSpring, [0, 1], [22, 0])}px)`,
        backgroundColor: palette.surface,
        border: `1.5px solid ${palette.accentBorder}`,
        borderRadius: 28,
        padding: '38px 36px',
        boxShadow: `0 24px 64px rgba(0,0,0,0.6), 0 0 32px ${palette.glow}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 999,
              backgroundColor: palette.accentSoft,
              border: `2px solid ${palette.accentBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fonts.display,
              fontSize: 28,
              fontWeight: 700,
              color: palette.accent,
            }}
          >
            {scene.authorName.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, color: '#FFFFFF' }}>
              {scene.authorName}
            </span>
            {scene.authorHandle ? (
              <span style={{ fontFamily: fonts.mono, fontSize: 20, color: '#A1A1AA' }}>
                {scene.authorHandle}
              </span>
            ) : null}
          </div>
        </div>

        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 18,
            fontWeight: 700,
            color: palette.accent,
            backgroundColor: palette.accentSoft,
            border: `1px solid ${palette.accentBorder}`,
            padding: '6px 14px',
            borderRadius: 999,
          }}
        >
          {platformLabel}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: fonts.sans,
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.42,
          color: '#FAFAFA',
        }}
      >
        &ldquo;{scene.postText}&rdquo;
      </p>

      {scene.contextLabel ? (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 16,
            fontFamily: fonts.mono,
            fontSize: 20,
            color: '#A1A1AA',
          }}
        >
          Verified Quote · {scene.contextLabel}
        </div>
      ) : null}
    </div>
  );
};
