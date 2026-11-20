import { z } from 'zod';

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

const SceneBaseSchema = z.object({
  id: z.string().trim().min(1).max(40),
  narration: z.string().trim().min(10).max(500),
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

export const AiMediaClipSceneSchema = SceneBaseSchema.extend({
  type: z.literal('ai_media_clip'),
  prompt: z.string().trim().min(4).max(400),
  captionText: z.string().trim().min(2).max(90),
  durationHintSec: z.number().finite().min(1).max(15).optional(),
});

export const ReelSceneSchema = z.discriminatedUnion('type', [
  HookTitleSceneSchema,
  BenchmarkBarsSceneSchema,
  CodeCompareSceneSchema,
  TerminalDemoSceneSchema,
  NewsQuoteCardSceneSchema,
  TakeawayCtaSceneSchema,
  AiMediaClipSceneSchema,
]);

export type ReelScene = z.infer<typeof ReelSceneSchema>;
export type HookTitleScene = z.infer<typeof HookTitleSceneSchema>;
export type BenchmarkBarsScene = z.infer<typeof BenchmarkBarsSceneSchema>;
export type CodeCompareScene = z.infer<typeof CodeCompareSceneSchema>;
export type TerminalDemoScene = z.infer<typeof TerminalDemoSceneSchema>;
export type NewsQuoteCardScene = z.infer<typeof NewsQuoteCardSceneSchema>;
export type TakeawayCtaScene = z.infer<typeof TakeawayCtaSceneSchema>;
export type AiMediaClipScene = z.infer<typeof AiMediaClipSceneSchema>;

export const SourceCitationSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.string().url(),
});

export const ReelStoryboardSchema = z.object({
  title: z.string().trim().min(4).max(120),
  pillar: PillarSchema,
  caption: z.string().trim().min(10).max(1900),
  hashtags: z.array(z.string().trim().min(2).max(40)).min(3).max(10),
  sources: z.array(SourceCitationSchema).min(1).max(10),
  scenes: z.array(ReelSceneSchema).min(3).max(7),
});

export type ReelStoryboard = z.infer<typeof ReelStoryboardSchema>;

export interface EditorialCheckResult {
  ok: boolean;
  errors: string[];
  totalWords: number;
  estimatedDurationSec: number;
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

export function validateStoryboardEditorial(storyboard: ReelStoryboard): EditorialCheckResult {
  const errors: string[] = [];
  let totalWords = 0;

  storyboard.scenes.forEach((scene, index) => {
    const sceneLabel = `Scene ${index + 1} (${scene.type})`;
    if (scene.type === 'ai_media_clip') {
      errors.push(`${sceneLabel} is reserved for Phase 2 and cannot be used in Phase 1.`);
      return;
    }

    const words = countWords(scene.narration);
    totalWords += words;
    if (words < 6) {
      errors.push(`${sceneLabel} narration has ${words} words; at least 6 words required.`);
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
  });

  if (totalWords < 70 || totalWords > 180) {
    errors.push(
      `Total spoken narration is ${totalWords} words; must be between 70 and 180 words (30-65s).`,
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
