import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import {
  DEFAULT_CAMERA_MOVE,
  DEFAULT_TRANSITION,
  type ReelScene,
} from '@post/core';
import { CaptionOverlay } from './components/CaptionOverlay.js';
import { SafeFrame } from './components/SafeFrame.js';
import { SceneTransition } from './components/SceneTransition.js';
import { AiMediaClipScene } from './scenes/AiMediaClipScene.js';
import { BenchmarkBarsScene } from './scenes/BenchmarkBarsScene.js';
import { BigStatScene } from './scenes/BigStatScene.js';
import { ChecklistStepsScene } from './scenes/ChecklistStepsScene.js';
import { CodeCompareScene } from './scenes/CodeCompareScene.js';
import { CountdownItemScene } from './scenes/CountdownItemScene.js';
import { HookTitleScene } from './scenes/HookTitleScene.js';
import { LineChartScene } from './scenes/LineChartScene.js';
import { MythFactScene } from './scenes/MythFactScene.js';
import { NewsQuoteCardScene } from './scenes/NewsQuoteCardScene.js';
import { SocialPostScene } from './scenes/SocialPostScene.js';
import { SourceSpotlightScene } from './scenes/SourceSpotlightScene.js';
import { TakeawayCtaScene } from './scenes/TakeawayCtaScene.js';
import { TerminalDemoScene } from './scenes/TerminalDemoScene.js';
import { TimelineScene } from './scenes/TimelineScene.js';
import { VersusSplitScene } from './scenes/VersusSplitScene.js';
import { ReelStyleProvider } from './style/ReelStyleContext.js';
import type { ReelCompositionProps } from './types.js';

const SceneRenderer: React.FC<{
  scene: ReelScene;
  pillar: ReelCompositionProps['storyboard']['pillar'];
  assets: ReelCompositionProps['storyboard']['assets'];
  brandHandle: string;
  durationInFrames: number;
  isLast: boolean;
}> = ({ scene, pillar, assets, brandHandle, durationInFrames, isLast }) => {
  let content: React.ReactNode = null;
  switch (scene.type) {
    case 'hook_title':
      content = <HookTitleScene scene={scene} pillar={pillar} />;
      break;
    case 'benchmark_bars':
      content = <BenchmarkBarsScene scene={scene} pillar={pillar} />;
      break;
    case 'code_compare':
      content = <CodeCompareScene scene={scene} pillar={pillar} />;
      break;
    case 'terminal_demo':
      content = <TerminalDemoScene scene={scene} pillar={pillar} />;
      break;
    case 'news_quote_card':
      content = <NewsQuoteCardScene scene={scene} pillar={pillar} />;
      break;
    case 'takeaway_cta':
      content = <TakeawayCtaScene scene={scene} pillar={pillar} brandHandle={brandHandle} />;
      break;
    case 'big_stat':
      content = <BigStatScene scene={scene} />;
      break;
    case 'versus_split':
      content = <VersusSplitScene scene={scene} />;
      break;
    case 'checklist_steps':
      content = <ChecklistStepsScene scene={scene} />;
      break;
    case 'timeline':
      content = <TimelineScene scene={scene} />;
      break;
    case 'social_post':
      content = <SocialPostScene scene={scene} />;
      break;
    case 'line_chart':
      content = <LineChartScene scene={scene} />;
      break;
    case 'countdown_item':
      content = <CountdownItemScene scene={scene} />;
      break;
    case 'myth_fact':
      content = <MythFactScene scene={scene} />;
      break;
    case 'source_spotlight':
      content = <SourceSpotlightScene scene={scene} />;
      break;
    case 'ai_media_clip':
      content = (
        <AiMediaClipScene
          scene={scene}
          assetRef={scene.videoAsset ? assets?.[scene.videoAsset] : undefined}
        />
      );
      break;
  }

  const transition = scene.visual?.transition ?? DEFAULT_TRANSITION;
  const camera = scene.visual?.camera ?? DEFAULT_CAMERA_MOVE;

  return (
    <SceneTransition
      transition={transition}
      camera={camera}
      durationInFrames={durationInFrames}
      isLast={isLast}
    >
      {content}
    </SceneTransition>
  );
};

export const ReelComposition: React.FC<ReelCompositionProps> = ({
  storyboard,
  captions,
  sceneTimings,
  brandHandle,
  audioUrl,
  assetUrls,
}) => {
  const totalScenes = storyboard.scenes.length;

  const emphasisWords = useMemo(
    () =>
      storyboard.scenes.flatMap((s) => s.visual?.emphasis ?? []),
    [storyboard.scenes],
  );

  return (
    <ReelStyleProvider
      pillar={storyboard.pillar}
      format={storyboard.format}
      style={storyboard.style}
      assetUrls={assetUrls}
    >
      <AbsoluteFill style={{ backgroundColor: '#09090B' }}>
        {audioUrl ? <Audio src={audioUrl} /> : null}

        {storyboard.scenes.map((scene, idx) => {
          const timing = sceneTimings[idx];
          const from = timing?.startFrame ?? idx * 150;
          const duration = Math.max(1, timing?.durationInFrames ?? 150);

          return (
            <Sequence key={scene.id} from={from} durationInFrames={duration}>
              <SafeFrame
                pillar={storyboard.pillar}
                brandHandle={brandHandle}
                sceneIndex={idx}
                totalScenes={totalScenes}
              >
                <SceneRenderer
                  scene={scene}
                  pillar={storyboard.pillar}
                  assets={storyboard.assets}
                  brandHandle={brandHandle}
                  durationInFrames={duration}
                  isLast={idx === totalScenes - 1}
                />
              </SafeFrame>
            </Sequence>
          );
        })}

        <CaptionOverlay
          captions={captions}
          pillar={storyboard.pillar}
          emphasisWords={emphasisWords}
        />
      </AbsoluteFill>
    </ReelStyleProvider>
  );
};
