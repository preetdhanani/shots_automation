import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CameraMoveId, TransitionId } from '@post/core';

interface SceneTransitionProps {
  transition: TransitionId;
  camera: CameraMoveId;
  durationInFrames: number;
  isLast: boolean;
  children: React.ReactNode;
}

export const SceneTransition: React.FC<SceneTransitionProps> = ({
  transition,
  camera,
  durationInFrames,
  isLast,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterFrames = 12;
  const enterProgress = interpolate(frame, [0, enterFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 170 },
  });

  const fadeOut =
    isLast || durationInFrames <= 8
      ? 1
      : interpolate(frame, [durationInFrames - 4, durationInFrames], [1, 0.18], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

  // Subtle camera motion across the entire scene duration
  const camProgress = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  let camScale = 1;
  let camX = 0;
  switch (camera) {
    case 'push_in':
      camScale = interpolate(camProgress, [0, 1], [1.0, 1.038]);
      break;
    case 'pull_out':
      camScale = interpolate(camProgress, [0, 1], [1.04, 1.0]);
      break;
    case 'drift_left':
      camX = interpolate(camProgress, [0, 1], [10, -10]);
      break;
    case 'drift_right':
      camX = interpolate(camProgress, [0, 1], [-10, 10]);
      break;
    case 'none':
    default:
      break;
  }

  let opacity = fadeOut;
  let tx = camX;
  let ty = 0;
  let scale = camScale;
  let clipPath: string | undefined;
  let filter: string | undefined;

  switch (transition) {
    case 'slide_left': {
      tx += interpolate(enterSpring, [0, 1], [160, 0]);
      opacity = Math.min(1, enterProgress * 1.4) * fadeOut;
      break;
    }
    case 'slide_up': {
      ty += interpolate(enterSpring, [0, 1], [130, 0]);
      opacity = Math.min(1, enterProgress * 1.4) * fadeOut;
      break;
    }
    case 'zoom_punch': {
      scale *= interpolate(enterSpring, [0, 1], [0.82, 1]);
      opacity = Math.min(1, enterProgress * 1.5) * fadeOut;
      break;
    }
    case 'whip_pan': {
      const whip = interpolate(enterProgress, [0, 1], [260, 0]);
      tx += whip;
      const blurPx = interpolate(enterProgress, [0, 0.7, 1], [10, 2, 0], {
        extrapolateRight: 'clamp',
      });
      if (blurPx > 0.2) {
        filter = `blur(${blurPx.toFixed(1)}px)`;
      }
      opacity = Math.min(1, enterProgress * 1.6) * fadeOut;
      break;
    }
    case 'wipe': {
      const rightInset = interpolate(enterProgress, [0, 1], [100, 0]);
      clipPath = `inset(0 ${rightInset.toFixed(1)}% 0 0)`;
      break;
    }
    case 'iris': {
      const radius = interpolate(enterProgress, [0, 1], [8, 120]);
      clipPath = `circle(${radius.toFixed(1)}% at 50% 50%)`;
      break;
    }
    case 'glitch': {
      if (frame < 10) {
        const jitterX = frame % 2 === 0 ? 18 - frame * 1.5 : -(14 - frame * 1.2);
        const jitterY = frame % 3 === 0 ? -6 : 4;
        tx += jitterX;
        ty += jitterY;
        const hue = frame % 2 === 0 ? 28 : -24;
        filter = `hue-rotate(${hue}deg) contrast(1.18)`;
      }
      opacity = Math.min(1, (frame + 2) / 5) * fadeOut;
      break;
    }
    case 'fade':
    default: {
      opacity = interpolate(frame, [0, 8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }) * fadeOut;
      break;
    }
  }

  return (
    <div
      style={{
        width: '100%',
        opacity,
        transform: `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`,
        transformOrigin: 'center center',
        clipPath,
        filter,
      }}
    >
      {children}
    </div>
  );
};
