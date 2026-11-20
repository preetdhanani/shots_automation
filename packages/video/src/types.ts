import type { CaptionToken, ReelStoryboard, SceneTiming } from '@post/core';

export interface ReelCompositionProps extends Record<string, unknown> {
  storyboard: ReelStoryboard;
  captions: CaptionToken[];
  sceneTimings: SceneTiming[];
  audioDurationMs: number;
  brandHandle: string;
  fps: number;
  audioUrl?: string;
}
