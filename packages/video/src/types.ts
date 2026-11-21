import type { CaptionToken, ReelStoryboard, SceneTiming } from '@post/core';

export interface ReelCompositionProps extends Record<string, unknown> {
  storyboard: ReelStoryboard;
  captions: CaptionToken[];
  sceneTimings: SceneTiming[];
  audioDurationMs: number;
  brandHandle: string;
  fps: number;
  audioUrl?: string;
  /** Map of asset key -> http://127.0.0.1:<port>/<file> served during render. */
  assetUrls?: Record<string, string>;
}
