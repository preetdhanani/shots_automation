import { z } from 'zod';

export const CaptionTokenSchema = z.object({
  text: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  timestampMs: z.number().int().min(0).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type CaptionToken = z.infer<typeof CaptionTokenSchema>;

export const SceneTimingSchema = z.object({
  sceneId: z.string(),
  sceneType: z.string(),
  label: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  startFrame: z.number().int().min(0),
  durationInFrames: z.number().int().min(1),
});

export type SceneTiming = z.infer<typeof SceneTimingSchema>;

export const ReelCaptionsFileSchema = z.object({
  alignmentMode: z.enum(['whisper', 'estimated']),
  audioDurationMs: z.number().int().min(1000),
  fps: z.number().int().default(30),
  captions: z.array(CaptionTokenSchema),
  sceneTimings: z.array(SceneTimingSchema),
});

export type ReelCaptionsFile = z.infer<typeof ReelCaptionsFileSchema>;

export const VideoSpecReportSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  fileSizeBytes: z.number().int().nonnegative(),
  videoCodec: z.string(),
  pixelFormat: z.string(),
  audioCodec: z.string(),
  audioSampleRate: z.number().int().nonnegative(),
  audioChannels: z.number().int().nonnegative(),
  bitrateKbps: z.number().nonnegative(),
});

export type VideoSpecReport = z.infer<typeof VideoSpecReportSchema>;
