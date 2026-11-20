import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { ReelScene } from '@post/core';
import { CaptionOverlay } from './components/CaptionOverlay.js';
import { SafeFrame } from './components/SafeFrame.js';
import { BenchmarkBarsScene } from './scenes/BenchmarkBarsScene.js';
import { CodeCompareScene } from './scenes/CodeCompareScene.js';
import { HookTitleScene } from './scenes/HookTitleScene.js';
import { NewsQuoteCardScene } from './scenes/NewsQuoteCardScene.js';
import { TakeawayCtaScene } from './scenes/TakeawayCtaScene.js';
import { TerminalDemoScene } from './scenes/TerminalDemoScene.js';
import type { ReelCompositionProps } from './types.js';

const SceneRenderer: React.FC<{
  scene: ReelScene;
  pillar: ReelCompositionProps['storyboard']['pillar'];
  brandHandle: string;
  durationInFrames: number;
  isLast: boolean;
}> = ({ scene, pillar, brandHandle, durationInFrames, isLast }) => {
  const frame = useCurrentFrame();
  const fadeOut =
    isLast || durationInFrames <= 8
      ? 1
      : interpolate(frame, [durationInFrames - 4, durationInFrames], [1, 0.2], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

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
    case 'ai_media_clip':
      content = null;
      break;
  }

  return <div style={{ opacity: fadeOut }}>{content}</div>;
};

export const ReelComposition: React.FC<ReelCompositionProps> = ({
  storyboard,
  captions,
  sceneTimings,
  brandHandle,
  audioUrl,
}) => {
  const totalScenes = storyboard.scenes.length;

  return (
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
                brandHandle={brandHandle}
                durationInFrames={duration}
                isLast={idx === totalScenes - 1}
              />
            </SafeFrame>
          </Sequence>
        );
      })}

      <CaptionOverlay captions={captions} pillar={storyboard.pillar} />
    </AbsoluteFill>
  );
};
