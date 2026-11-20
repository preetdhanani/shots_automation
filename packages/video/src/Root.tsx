import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { ReelComposition } from './ReelComposition.js';
import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from './theme.js';
import type { ReelCompositionProps } from './types.js';

export const REEL_COMPOSITION_ID = 'AiDevReel';

const DEFAULT_STUDIO_PROPS: ReelCompositionProps = {
  brandHandle: '@ai.dev.reels',
  fps: VIDEO_FPS,
  audioDurationMs: 24_000,
  captions: [
    { text: 'Stop', startMs: 120, endMs: 420, timestampMs: 120, confidence: 1 },
    { text: ' guessing', startMs: 420, endMs: 820, timestampMs: 420, confidence: 1 },
    { text: ' agent', startMs: 820, endMs: 1200, timestampMs: 820, confidence: 1 },
    { text: ' prompts.', startMs: 1200, endMs: 1650, timestampMs: 1200, confidence: 1 },
  ],
  sceneTimings: [
    { sceneId: 's1', sceneType: 'hook_title', label: 'Hook', startMs: 0, endMs: 4500, startFrame: 0, durationInFrames: 135 },
    { sceneId: 's2', sceneType: 'benchmark_bars', label: 'Benchmark', startMs: 4500, endMs: 9500, startFrame: 135, durationInFrames: 150 },
    { sceneId: 's3', sceneType: 'code_compare', label: 'Code', startMs: 9500, endMs: 15000, startFrame: 285, durationInFrames: 165 },
    { sceneId: 's4', sceneType: 'terminal_demo', label: 'Terminal', startMs: 15000, endMs: 20000, startFrame: 450, durationInFrames: 150 },
    { sceneId: 's5', sceneType: 'takeaway_cta', label: 'Takeaway', startMs: 20000, endMs: 24000, startFrame: 600, durationInFrames: 120 },
  ],
  storyboard: {
    title: 'Why Coding Harnesses Beat Bigger Prompts',
    pillar: 'harnesses',
    caption: 'Small harness improvements beat giant prompts every week.',
    hashtags: ['#aicoding', '#llm', '#devtools', '#codingagents', '#typescript'],
    sources: [{ title: 'SWE-bench Leaderboard', url: 'https://www.swebench.com' }],
    scenes: [
      {
        id: 's1',
        type: 'hook_title',
        narration: 'Stop stuffing bigger prompts into your coding agent when the real unlock is the harness.',
        badge: 'AI HARNESSES',
        headline: 'Your Prompt Is Not The Bottleneck',
        subheadline: 'Tool feedback loops beat raw prompt size on real repo tasks.',
        highlightStat: '+18.4% SWE-bench lift',
      },
      {
        id: 's2',
        type: 'benchmark_bars',
        narration: 'Adding automated test verification jumps resolution scores across top coding models.',
        title: 'SWE-bench Verified Resolution',
        subtitle: 'Same model, better verification harness',
        metricUnit: '%',
        sourceLabel: 'Agent Eval Suite',
        bars: [
          { label: 'Bare Prompt Loop', value: 49.2, note: 'No checks' },
          { label: 'Lint + Type Hook', value: 58.6 },
          { label: 'Full Test Harness', value: 67.6, isWinner: true, note: 'Winner' },
        ],
      },
      {
        id: 's3',
        type: 'code_compare',
        narration: 'Instead of hoping edits compile, give the agent a single verify command.',
        title: 'Enforce Verification Before Exit',
        language: 'json',
        filename: 'AGENTS.md / hooks',
        mode: 'before_after',
        beforeLabel: 'Fragile Prompt',
        beforeCode: '// "Please make sure tests pass"\n// No command, no real check',
        afterLabel: 'Deterministic Hook',
        afterCode: '{\n  "afterEdit": [\n    "npm run typecheck",\n    "npm test -- --run"\n  ]\n}',
        highlightLines: [2, 3, 4],
      },
      {
        id: 's4',
        type: 'terminal_demo',
        narration: 'Every file edit runs fast checks automatically before handing control back to you.',
        title: 'Live Harness Gate',
        windowTitle: 'zsh - repo-agent',
        command: 'npm run verify:agent',
        outputLines: [
          { text: '[ok] tsc --noEmit passed (0 errors)', tone: 'success' },
          { text: '[ok] 42 unit tests green in 1.4s', tone: 'success' },
          { text: '[ready] clean diff staged for review', tone: 'accent' },
        ],
      },
      {
        id: 's5',
        type: 'takeaway_cta',
        narration: 'Treat your AI workflow like CI and save this tip for your next coding session.',
        badge: 'KEY RULE',
        headline: 'Verify Every Edit Automatically',
        takeaway: 'Tight fast feedback loops let smaller, cheaper models beat brute-force prompting.',
        ctaText: 'Save & follow for daily AI dev tips',
      },
    ],
  },
};

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
  );
};
