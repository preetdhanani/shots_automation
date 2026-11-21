import { z } from 'zod';
import {
  BACKGROUND_IDS,
  CAMERA_MOVE_IDS,
  CAPTION_STYLE_IDS,
  HOOK_STYLE_IDS,
  MUSIC_MOOD_IDS,
  PALETTE_IDS,
  REEL_FORMAT_IDS,
  TRANSITION_IDS,
  TYPOGRAPHY_IDS,
} from '../variety/registry.js';

export const CONTENT_PILLARS = [
  'ai_news',
  'benchmarks',
  'harnesses',
  'coding_practices',
  'vibe_coding',
] as const;

export type ContentPillar = (typeof CONTENT_PILLARS)[number];

export const PillarSchema = z.enum(CONTENT_PILLARS);

export const PILLAR_LABELS: Record<ContentPillar, string> = {
  ai_news: 'AI News',
  benchmarks: 'Benchmarks',
  harnesses: 'Harnesses',
  coding_practices: 'Coding Tips',
  vibe_coding: 'Vibe Coding',
};

export const VOICE_NAMES = [
  'Puck',
  'Fenrir',
  'Kore',
  'Zephyr',
  'Charon',
  'Aoede',
  'Leda',
] as const;

export type VoiceName = (typeof VOICE_NAMES)[number];

export const VoiceNameSchema = z.enum(VOICE_NAMES);

export const VOICE_PROFILES: Record<VoiceName, { tone: string; description: string }> = {
  Puck: { tone: 'Upbeat & Crisp', description: 'Energetic tech narrator for fast developer hooks' },
  Fenrir: { tone: 'Deep & Bold', description: 'Confident benchmark and model breakdown tone' },
  Kore: { tone: 'Clear & Warm', description: 'Clean editorial explainer voice' },
  Zephyr: { tone: 'Bright & Smooth', description: 'Friendly coding tips and vibe-coding cadence' },
  Charon: { tone: 'Calm & Grounded', description: 'Measured senior-engineer walkthrough' },
  Aoede: { tone: 'Expressive', description: 'Natural conversational AI news delivery' },
  Leda: { tone: 'Polished', description: 'Articulate studio broadcast clarity' },
};

export const ReelFormatIdSchema = z.enum(REEL_FORMAT_IDS);
export const HookStyleIdSchema = z.enum(HOOK_STYLE_IDS);
export const TransitionIdSchema = z.enum(TRANSITION_IDS);
export const CameraMoveIdSchema = z.enum(CAMERA_MOVE_IDS);
export const BackgroundIdSchema = z.enum(BACKGROUND_IDS);
export const TypographyIdSchema = z.enum(TYPOGRAPHY_IDS);
export const CaptionStyleIdSchema = z.enum(CAPTION_STYLE_IDS);
export const PaletteIdSchema = z.enum(PALETTE_IDS);
export const MusicMoodIdSchema = z.enum(MUSIC_MOOD_IDS);

export const SAFE_ASSET_FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export function isSafeAssetFilename(name: string): boolean {
  return SAFE_ASSET_FILENAME_RE.test(name) && !name.includes('..');
}

export function sanitizeAssetSegment(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 40);
  return cleaned || 'clip';
}

export const SceneVisualSchema = z.object({
  layout: z.string().trim().min(1).max(32).optional(),
  transition: TransitionIdSchema.optional(),
  camera: CameraMoveIdSchema.optional(),
  emphasis: z.array(z.string().trim().min(1).max(24)).max(4).optional(),
});

export type SceneVisual = z.infer<typeof SceneVisualSchema>;

export const ReelStyleSchema = z.object({
  seed: z.number().int(),
  background: BackgroundIdSchema,
  typography: TypographyIdSchema,
  captionStyle: CaptionStyleIdSchema,
  palette: PaletteIdSchema,
  musicMood: MusicMoodIdSchema,
});

export type ReelStyle = z.infer<typeof ReelStyleSchema>;

export const ReelAssetRefSchema = z.object({
  kind: z.enum(['image', 'video']),
  file: z
    .string()
    .trim()
    .refine(isSafeAssetFilename, 'Asset filename must match ^[a-z0-9][a-z0-9._-]*$ without ".."'),
  sourceUrl: z.string().url().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
});

export type ReelAssetRef = z.infer<typeof ReelAssetRefSchema>;

const SceneBaseSchema = z.object({
  id: z.string().trim().min(1).max(40),
  narration: z.string().trim().min(10).max(500),
  visual: SceneVisualSchema.optional(),
});

export const HookTitleSceneSchema = SceneBaseSchema.extend({
  type: z.literal('hook_title'),
  badge: z.string().trim().min(2).max(28),
  headline: z.string().trim().min(4).max(70),
  subheadline: z.string().trim().min(4).max(110),
  highlightStat: z.string().trim().max(32).optional(),
});

export const BenchmarkBarItemSchema = z.object({
  label: z.string().trim().min(1).max(26),
  value: z.number().finite().min(0).max(1_000_000),
  isWinner: z.boolean().optional(),
  note: z.string().trim().max(24).optional(),
});

export const BenchmarkBarsSceneSchema = SceneBaseSchema.extend({
  type: z.literal('benchmark_bars'),
  title: z.string().trim().min(3).max(56),
  subtitle: z.string().trim().max(70).optional(),
  metricUnit: z.string().trim().min(1).max(12),
  sourceLabel: z.string().trim().min(2).max(44),
  bars: z.array(BenchmarkBarItemSchema).min(2).max(5),
});

export const CodeCompareSceneSchema = SceneBaseSchema.extend({
  type: z.literal('code_compare'),
  title: z.string().trim().min(3).max(56),
  language: z.string().trim().min(1).max(20),
  filename: z.string().trim().min(1).max(40),
  mode: z.enum(['single', 'before_after']),
  beforeLabel: z.string().trim().max(24).optional(),
  beforeCode: z.string().optional(),
  afterLabel: z.string().trim().max(24).optional(),
  afterCode: z.string().min(4),
  highlightLines: z.array(z.number().int().min(1).max(30)).max(12).optional(),
});

export const TerminalOutputLineSchema = z.object({
  text: z.string().trim().min(1).max(52),
  tone: z.enum(['neutral', 'success', 'warn', 'accent']),
});

export const TerminalDemoSceneSchema = SceneBaseSchema.extend({
  type: z.literal('terminal_demo'),
  title: z.string().trim().min(3).max(56),
  windowTitle: z.string().trim().min(2).max(34),
  command: z.string().trim().min(2).max(76),
  outputLines: z.array(TerminalOutputLineSchema).min(1).max(7),
});

export const NewsQuoteCardSceneSchema = SceneBaseSchema.extend({
  type: z.literal('news_quote_card'),
  sourceLabel: z.string().trim().min(2).max(36),
  dateLabel: z.string().trim().min(2).max(24),
  headline: z.string().trim().min(4).max(96),
  bullets: z.array(z.string().trim().min(4).max(90)).min(2).max(4),
});

export const TakeawayCtaSceneSchema = SceneBaseSchema.extend({
  type: z.literal('takeaway_cta'),
  badge: z.string().trim().min(2).max(28),
  headline: z.string().trim().min(4).max(72),
  takeaway: z.string().trim().min(6).max(150),
  ctaText: z.string().trim().min(4).max(60),
});

export const BigStatSceneSchema = SceneBaseSchema.extend({
  type: z.literal('big_stat'),
  value: z.string().trim().min(1).max(12),
  label: z.string().trim().min(2).max(60),
  context: z.string().trim().min(4).max(110),
  sourceLabel: z.string().trim().min(2).max(44).optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional(),
});

export const VersusSideSchema = z.object({
  name: z.string().trim().min(1).max(22),
  points: z.array(z.string().trim().min(2).max(40)).min(2).max(4),
  score: z.string().trim().min(1).max(12).optional(),
});

export const VersusSplitSceneSchema = SceneBaseSchema.extend({
  type: z.literal('versus_split'),
  title: z.string().trim().min(3).max(56),
  left: VersusSideSchema,
  right: VersusSideSchema,
  winner: z.enum(['left', 'right', 'tie']).optional(),
  verdict: z.string().trim().min(2).max(70).optional(),
});

export const ChecklistItemSchema = z.object({
  text: z.string().trim().min(2).max(60),
  detail: z.string().trim().min(2).max(70).optional(),
});

export const ChecklistStepsSceneSchema = SceneBaseSchema.extend({
  type: z.literal('checklist_steps'),
  title: z.string().trim().min(3).max(56),
  mode: z.enum(['steps', 'checklist']),
  items: z.array(ChecklistItemSchema).min(2).max(5),
});

export const TimelineEventSchema = z.object({
  label: z.string().trim().min(1).max(16),
  text: z.string().trim().min(2).max(64),
});

export const TimelineSceneSchema = SceneBaseSchema.extend({
  type: z.literal('timeline'),
  title: z.string().trim().min(3).max(56),
  events: z.array(TimelineEventSchema).min(2).max(5),
});

export const SOCIAL_PLATFORMS = [
  'x',
  'threads',
  'bluesky',
  'linkedin',
  'github',
  'hn',
  'reddit',
  'blog',
] as const;

export const SocialPostSceneSchema = SceneBaseSchema.extend({
  type: z.literal('social_post'),
  authorName: z.string().trim().min(1).max(36),
  authorHandle: z.string().trim().min(1).max(36).optional(),
  platform: z.enum(SOCIAL_PLATFORMS),
  postText: z.string().trim().min(6).max(240),
  contextLabel: z.string().trim().min(2).max(44).optional(),
});

export const LineChartPointSchema = z.object({
  label: z.string().trim().min(1).max(10),
  value: z.number().finite().min(-1_000_000).max(1_000_000),
});

export const LineChartSceneSchema = SceneBaseSchema.extend({
  type: z.literal('line_chart'),
  title: z.string().trim().min(3).max(56),
  metricUnit: z.string().trim().min(1).max(12),
  sourceLabel: z.string().trim().min(2).max(44),
  points: z.array(LineChartPointSchema).min(3).max(8),
  highlightIndex: z.number().int().min(0).max(7).optional(),
});

export const CountdownItemSceneSchema = SceneBaseSchema.extend({
  type: z.literal('countdown_item'),
  rank: z.number().int().min(1).max(10),
  title: z.string().trim().min(3).max(48),
  detail: z.string().trim().min(4).max(110),
  tag: z.string().trim().min(1).max(20).optional(),
});

export const MythFactSceneSchema = SceneBaseSchema.extend({
  type: z.literal('myth_fact'),
  myth: z.string().trim().min(4).max(90),
  fact: z.string().trim().min(4).max(120),
  sourceLabel: z.string().trim().min(2).max(44).optional(),
});

export const SourceSpotlightSceneSchema = SceneBaseSchema.extend({
  type: z.literal('source_spotlight'),
  headline: z.string().trim().min(4).max(90),
  domain: z.string().trim().min(2).max(40),
  caption: z.string().trim().min(2).max(90).optional(),
  imageAsset: z.string().trim().min(1).max(40).optional(),
});

export const AiMediaClipSceneSchema = SceneBaseSchema.extend({
  type: z.literal('ai_media_clip'),
  prompt: z.string().trim().min(4).max(400),
  captionText: z.string().trim().min(2).max(90),
  durationHintSec: z.number().finite().min(1).max(15).optional(),
  videoAsset: z.string().trim().min(1).max(40).optional(),
});

export const ReelSceneSchema = z.discriminatedUnion('type', [
  HookTitleSceneSchema,
  BenchmarkBarsSceneSchema,
  CodeCompareSceneSchema,
  TerminalDemoSceneSchema,
  NewsQuoteCardSceneSchema,
  TakeawayCtaSceneSchema,
  BigStatSceneSchema,
  VersusSplitSceneSchema,
  ChecklistStepsSceneSchema,
  TimelineSceneSchema,
  SocialPostSceneSchema,
  LineChartSceneSchema,
  CountdownItemSceneSchema,
  MythFactSceneSchema,
  SourceSpotlightSceneSchema,
  AiMediaClipSceneSchema,
]);

export type ReelScene = z.infer<typeof ReelSceneSchema>;
export type HookTitleScene = z.infer<typeof HookTitleSceneSchema>;
export type BenchmarkBarsScene = z.infer<typeof BenchmarkBarsSceneSchema>;
export type CodeCompareScene = z.infer<typeof CodeCompareSceneSchema>;
export type TerminalDemoScene = z.infer<typeof TerminalDemoSceneSchema>;
export type NewsQuoteCardScene = z.infer<typeof NewsQuoteCardSceneSchema>;
export type TakeawayCtaScene = z.infer<typeof TakeawayCtaSceneSchema>;
export type BigStatScene = z.infer<typeof BigStatSceneSchema>;
export type VersusSplitScene = z.infer<typeof VersusSplitSceneSchema>;
export type ChecklistStepsScene = z.infer<typeof ChecklistStepsSceneSchema>;
export type TimelineScene = z.infer<typeof TimelineSceneSchema>;
export type SocialPostScene = z.infer<typeof SocialPostSceneSchema>;
export type LineChartScene = z.infer<typeof LineChartSceneSchema>;
export type CountdownItemScene = z.infer<typeof CountdownItemSceneSchema>;
export type MythFactScene = z.infer<typeof MythFactSceneSchema>;
export type SourceSpotlightScene = z.infer<typeof SourceSpotlightSceneSchema>;
export type AiMediaClipScene = z.infer<typeof AiMediaClipSceneSchema>;

export const SourceCitationSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.string().url(),
});

export const ReelStoryboardSchema = z.object({
  title: z.string().trim().min(4).max(120),
  pillar: PillarSchema,
  format: ReelFormatIdSchema.optional(),
  hookStyle: HookStyleIdSchema.optional(),
  style: ReelStyleSchema.optional(),
  assets: z.record(z.string().trim().min(1).max(40), ReelAssetRefSchema).optional(),
  caption: z.string().trim().min(10).max(1900),
  hashtags: z.array(z.string().trim().min(2).max(40)).min(3).max(10),
  sources: z.array(SourceCitationSchema).min(1).max(10),
  scenes: z.array(ReelSceneSchema).min(3).max(8),
});

export type ReelStoryboard = z.infer<typeof ReelStoryboardSchema>;

export const CHANNEL_OUTRO_NARRATION =
  'AI news, new models, benchmarks, harnesses, clean AI coding, and vibe coding tips from top devs. Follow this channel.';

export function isChannelOutroScene(scene: ReelScene): boolean {
  return scene.type === 'takeaway_cta' && scene.narration.trim() === CHANNEL_OUTRO_NARRATION;
}

export function createChannelOutroScene(id = 'scene-6'): TakeawayCtaScene {
  return {
    id,
    type: 'takeaway_cta',
    badge: 'FOLLOW FOR MORE',
    headline: 'Stay Ahead in AI Coding',
    takeaway:
      'AI news · New models · Benchmarks · Harnesses · Clean AI coding & vibe coding tips from top devs',
    ctaText: 'Follow this channel',
    narration: CHANNEL_OUTRO_NARRATION,
  };
}

export function appendChannelOutroScene(storyboard: ReelStoryboard): ReelStoryboard {
  const lastScene = storyboard.scenes[storyboard.scenes.length - 1];
  if (lastScene && lastScene.narration.trim() === CHANNEL_OUTRO_NARRATION) {
    return storyboard;
  }

  const existingIds = new Set(storyboard.scenes.map((scene) => scene.id));
  let outroId = `scene-${storyboard.scenes.length + 1}`;
  if (existingIds.has(outroId)) {
    outroId = 'scene-outro';
  }

  return {
    ...storyboard,
    scenes: [...storyboard.scenes, createChannelOutroScene(outroId)],
  };
}

export interface EditorialCheckResult {
  ok: boolean;
  errors: string[];
  totalWords: number;
  estimatedDurationSec: number;
}

export interface EditorialValidationOptions {
  allowAiMediaClip?: boolean;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function assembleInstagramCaption(caption: string, hashtags: string[]): string {
  const normalizedTags: string[] = [];
  const seen = new Set<string>();
  for (const raw of hashtags) {
    const clean = raw.trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    normalizedTags.push(`#${clean}`);
  }
  const cleanCaption = caption.trim();
  if (normalizedTags.length === 0) return cleanCaption;
  return `${cleanCaption}\n\n${normalizedTags.join(' ')}`;
}

function validateCodeBlock(code: string, label: string, errors: string[]): void {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 12) {
    errors.push(`${label} has ${lines.length} lines; max 12 lines allowed for 9:16 readability.`);
  }
  lines.forEach((line, idx) => {
    if (line.length > 38) {
      errors.push(
        `${label} line ${idx + 1} is ${line.length} chars; max 38 chars allowed to prevent wrapping.`,
      );
    }
  });
}

export function validateStoryboardEditorial(
  storyboard: ReelStoryboard,
  options: EditorialValidationOptions = {},
): EditorialCheckResult {
  const errors: string[] = [];
  let totalWords = 0;
  let aiMediaClipCount = 0;

  storyboard.scenes.forEach((scene, index) => {
    const sceneLabel = `Scene ${index + 1} (${scene.type})`;

    const words = countWords(scene.narration);
    totalWords += words;
    if (words < 6) {
      errors.push(`${sceneLabel} narration has ${words} words; at least 6 words required.`);
    }

    if (scene.type === 'ai_media_clip') {
      aiMediaClipCount++;
      if (!options.allowAiMediaClip) {
        errors.push(`${sceneLabel} requires AI B-roll to be enabled in Studio Settings.`);
      } else if (aiMediaClipCount > 1) {
        errors.push(`${sceneLabel} exceeds max 1 ai_media_clip scene per reel.`);
      }
    }

    if (scene.type === 'code_compare') {
      validateCodeBlock(scene.afterCode, `${sceneLabel} afterCode`, errors);
      if (scene.mode === 'before_after') {
        if (!scene.beforeCode || scene.beforeCode.trim().length === 0) {
          errors.push(`${sceneLabel} mode is before_after but beforeCode is empty.`);
        } else {
          validateCodeBlock(scene.beforeCode, `${sceneLabel} beforeCode`, errors);
        }
      }
    }

    if (scene.type === 'benchmark_bars') {
      const hasPositive = scene.bars.some((b) => b.value > 0);
      if (!hasPositive) {
        errors.push(`${sceneLabel} must contain at least one positive bar value.`);
      }
    }

    if (scene.type === 'line_chart') {
      const hasPositive = scene.points.some((p) => p.value > 0);
      if (!hasPositive) {
        errors.push(`${sceneLabel} must contain at least one positive data point.`);
      }
      if (scene.highlightIndex !== undefined && scene.highlightIndex >= scene.points.length) {
        errors.push(
          `${sceneLabel} highlightIndex ${scene.highlightIndex} is out of bounds for ${scene.points.length} points.`,
        );
      }
    }
  });

  if (totalWords < 70 || totalWords > 200) {
    errors.push(
      `Total spoken narration is ${totalWords} words; must be between 70 and 200 words (30-75s).`,
    );
  }

  for (const src of storyboard.sources) {
    try {
      const u = new URL(src.url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        errors.push(`Source "${src.title}" must use http or https URL.`);
      }
    } catch {
      errors.push(`Source "${src.title}" has an invalid URL.`);
    }
  }

  const fullCaption = assembleInstagramCaption(storyboard.caption, storyboard.hashtags);
  if (fullCaption.length > 2200) {
    errors.push(
      `Assembled Instagram caption + hashtags is ${fullCaption.length} chars; max 2200 allowed.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    totalWords,
    estimatedDurationSec: Math.round((totalWords / 2.65) * 10) / 10,
  };
}
