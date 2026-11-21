import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import {
  FORMAT_SAMPLE_STORYBOARDS,
  REEL_FORMAT_IDS,
  SCENE_SHORT_LABELS,
  type ReelStoryboard,
  type SceneTiming,
} from '@post/core';
import { ReelComposition } from './ReelComposition.js';
import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from './theme.js';
import type { ReelCompositionProps } from './types.js';

export const REEL_COMPOSITION_ID = 'AiDevReel';

function buildStudioPropsForStoryboard(storyboard: ReelStoryboard): ReelCompositionProps {
  const framesPerScene = 120; // 4s per scene in Remotion Studio preview
  const msPerScene = (framesPerScene / VIDEO_FPS) * 1000;
  const sceneTimings: SceneTiming[] = storyboard.scenes.map((scene, idx) => ({
    sceneId: scene.id,
    sceneType: scene.type,
    label: SCENE_SHORT_LABELS[scene.type],
    startMs: idx * msPerScene,
    endMs: (idx + 1) * msPerScene,
    startFrame: idx * framesPerScene,
    durationInFrames: framesPerScene,
  }));

  const captions = storyboard.scenes.flatMap((scene, idx) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean);
    const startBase = idx * msPerScene;
    const perWord = Math.max(120, Math.floor((msPerScene - 200) / Math.max(1, words.length)));
    return words.map((word, wIdx) => ({
      text: `${wIdx === 0 && idx === 0 ? '' : ' '}${word}`,
      startMs: startBase + wIdx * perWord,
      endMs: startBase + (wIdx + 1) * perWord,
    }));
  });

  return {
    brandHandle: '@ai.dev.reels',
    fps: VIDEO_FPS,
    audioDurationMs: storyboard.scenes.length * msPerScene,
    captions,
    sceneTimings,
    storyboard,
  };
}

const DEFAULT_STUDIO_PROPS: ReelCompositionProps = buildStudioPropsForStoryboard(
  FORMAT_SAMPLE_STORYBOARDS.deep_dive_demo,
);

const calculateMetadata: CalculateMetadataFunction<ReelCompositionProps> = ({ props }) => {
  const lastScene = props.sceneTimings[props.sceneTimings.length - 1];
  const framesFromScenes = lastScene ? lastScene.startFrame + lastScene.durationInFrames : 0;
  const framesFromAudio = Math.ceil((props.audioDurationMs / 1000) * (props.fps || VIDEO_FPS));
  const durationInFrames = Math.max(90, framesFromScenes, framesFromAudio);

  return {
    durationInFrames,
    fps: props.fps || VIDEO_FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={REEL_COMPOSITION_ID}
        component={ReelComposition}
        durationInFrames={720}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={DEFAULT_STUDIO_PROPS}
        calculateMetadata={calculateMetadata}
      />
      {REEL_FORMAT_IDS.map((formatId) => {
        // Remotion composition IDs forbid underscores; use hyphenated IDs.
        const compId = `Format-${formatId.replace(/_/g, '-')}`;
        const sampleProps = buildStudioPropsForStoryboard(FORMAT_SAMPLE_STORYBOARDS[formatId]);
        return (
          <Composition
            key={compId}
            id={compId}
            component={ReelComposition}
            durationInFrames={sampleProps.storyboard.scenes.length * 120}
            fps={VIDEO_FPS}
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
            defaultProps={sampleProps}
            calculateMetadata={calculateMetadata}
          />
        );
      })}
    </>
  );
};
