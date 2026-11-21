import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { useReelStyle } from '../../style/ReelStyleContext.js';

export const BackgroundRenderer: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { style, palette } = useReelStyle();

  const progress = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const drift = progress * 36;

  switch (style.background) {
    case 'mesh_gradient': {
      const x1 = 22 + Math.sin(progress * Math.PI * 2) * 14;
      const y1 = 24 + Math.cos(progress * Math.PI * 2) * 10;
      const x2 = 78 - Math.sin(progress * Math.PI * 1.5) * 16;
      const y2 = 72 + Math.sin(progress * Math.PI * 2) * 12;
      return (
        <AbsoluteFill style={{ backgroundColor: palette.bgBase, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              inset: -140,
              background: `
                radial-gradient(circle at ${x1}% ${y1}%, ${palette.glow} 0%, transparent 52%),
                radial-gradient(circle at ${x2}% ${y2}%, ${palette.secondarySoft} 0%, transparent 55%),
                radial-gradient(circle at 50% 48%, ${palette.accentSoft} 0%, transparent 64%)
              `,
              filter: 'blur(26px)',
            }}
          />
        </AbsoluteFill>
      );
    }

    case 'blueprint': {
      const offsetY = progress * 48;
      return (
        <AbsoluteFill style={{ backgroundColor: '#07111F', pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
                linear-gradient(to right, rgba(56, 189, 248, 0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(56, 189, 248, 0.12) 1px, transparent 1px),
                linear-gradient(to right, rgba(56, 189, 248, 0.045) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(56, 189, 248, 0.045) 1px, transparent 1px)
              `,
              backgroundSize: '120px 120px, 120px 120px, 30px 30px, 30px 30px',
              backgroundPosition: `0 ${offsetY}px`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 50% 34%, ${palette.glow} 0%, rgba(7, 17, 31, 0.85) 70%)`,
            }}
          />
          {/* Corner blueprint registration marks */}
          <div
            style={{
              position: 'absolute',
              top: 90,
              left: 44,
              width: 28,
              height: 28,
              borderTop: `2px solid ${palette.accentBorder}`,
              borderLeft: `2px solid ${palette.accentBorder}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 340,
              right: 88,
              width: 28,
              height: 28,
              borderBottom: `2px solid ${palette.accentBorder}`,
              borderRight: `2px solid ${palette.accentBorder}`,
            }}
          />
        </AbsoluteFill>
      );
    }

    case 'scanlines': {
      const scanY = (frame * 3) % 1920;
      return (
        <AbsoluteFill style={{ backgroundColor: '#06070B', pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `
                radial-gradient(ellipse at 50% 10%, ${palette.glow} 0%, transparent 56%),
                linear-gradient(180deg, rgba(6,7,11,0.2) 0%, rgba(6,7,11,0.9) 100%)
              `,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 6px)',
              opacity: 0.72,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: scanY,
              height: 120,
              background: `linear-gradient(180deg, transparent, ${palette.accentSoft}, transparent)`,
              opacity: 0.65,
            }}
          />
        </AbsoluteFill>
      );
    }

    case 'aurora': {
      const shiftA = interpolate(progress, [0, 1], [-140, 140]);
      const shiftB = interpolate(progress, [0, 1], [120, -120]);
      return (
        <AbsoluteFill style={{ backgroundColor: '#060913', pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              top: -120,
              left: -260 + shiftA,
              width: 1500,
              height: 580,
              transform: 'rotate(-14deg)',
              background: `linear-gradient(90deg, transparent 5%, ${palette.glow} 38%, ${palette.secondarySoft} 68%, transparent 95%)`,
              filter: 'blur(42px)',
              opacity: 0.92,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 180,
              left: -220 + shiftB,
              width: 1450,
              height: 440,
              transform: 'rotate(11deg)',
              background: `linear-gradient(90deg, transparent 10%, ${palette.secondarySoft} 45%, ${palette.accentSoft} 75%, transparent 95%)`,
              filter: 'blur(48px)',
              opacity: 0.8,
            }}
          />
        </AbsoluteFill>
      );
    }

    case 'spotlight_noise': {
      const beamX = 42 + Math.sin(progress * Math.PI * 2) * 12;
      return (
        <AbsoluteFill style={{ backgroundColor: '#0B0B0E', pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `
                radial-gradient(ellipse 68% 42% at ${beamX}% 12%, ${palette.glow} 0%, rgba(11,11,14,0) 76%),
                radial-gradient(ellipse 80% 50% at 50% 100%, rgba(255,255,255,0.05) 0%, transparent 65%)
              `,
            }}
          />
          {/* Subtle diagonal studio micro-texture */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.032) 0px, rgba(255,255,255,0.032) 2px, transparent 2px, transparent 14px)',
              opacity: 0.7,
            }}
          />
        </AbsoluteFill>
      );
    }

    case 'dot_grid':
    default:
      return (
        <AbsoluteFill style={{ backgroundColor: palette.bgBase, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              inset: -120,
              background: `radial-gradient(circle at ${28 + drift * 0.25}% ${22 + drift * 0.15}%, ${palette.glow} 0%, rgba(9, 9, 11, 0) 54%), radial-gradient(circle at 82% 76%, ${palette.secondarySoft} 0%, rgba(9, 9, 11, 0) 48%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
              opacity: 0.42,
            }}
          />
        </AbsoluteFill>
      );
  }
};
