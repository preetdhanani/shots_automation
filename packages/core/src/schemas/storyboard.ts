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
  highlightStat: z.string().trim().max(48).optional(),
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

export const CHANNEL_OUTRO_PAUSE_MS = 450;
export const CHANNEL_OUTRO_TAIL_PAD_MS = 650;
export const CHANNEL_OUTRO_ESTIMATED_GAP_MS = 680;

export const CHANNEL_OUTRO_NARRATION =
  'AI news, benchmarks, and coding tips. Follow this channel for more.';

const LEGACY_CHANNEL_OUTRO_NARRATIONS = new Set([
  CHANNEL_OUTRO_NARRATION,
  'AI news, new models, benchmarks, harnesses, clean AI coding, and vibe coding tips from top devs. Follow this channel.',
]);

export function isChannelOutroScene(scene: ReelScene): boolean {
  return (
    scene.type === 'takeaway_cta' &&
    LEGACY_CHANNEL_OUTRO_NARRATIONS.has(scene.narration.trim())
  );
}

export function createChannelOutroScene(id = 'scene-6'): TakeawayCtaScene {
  return {
    id,
    type: 'takeaway_cta',
    badge: 'FOLLOW FOR MORE',
    headline: 'Stay Ahead in AI Coding',
    takeaway: 'AI news · New models · Benchmarks · Harnesses · Coding tips',
    ctaText: 'Follow this channel for more',
    narration: CHANNEL_OUTRO_NARRATION,
  };
}

export function appendChannelOutroScene(storyboard: ReelStoryboard): ReelStoryboard {
  const lastScene = storyboard.scenes[storyboard.scenes.length - 1];
  if (lastScene && isChannelOutroScene(lastScene)) {
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
  brandHandle?: string;
  rejectDefaultBrandLeak?: boolean;
}

const HASHTAG_TYPO_FIXES: Record<string, string> = {
  googlendeepmind: 'googledeepmind',
  google_deepmind: 'googledeepmind',
  javasript: 'javascript',
  typesript: 'typescript',
  pyhton: 'python',
  machinlearning: 'machinelearning',
  artificalintelligence: 'artificialintelligence',
  developement: 'development',
};

export function sanitizeHashtags(
  hashtags: readonly string[],
  opts: { maxTags?: number } = {},
): string[] {
  const normalizedTags: string[] = [];
  const seen = new Set<string>();
  for (const raw of hashtags) {
    let token = raw.trim().replace(/^#+/, '').toLowerCase();
    token = token
      .replace(/c\+\+/g, 'cpp')
      .replace(/c#/g, 'csharp')
      .replace(/\.net\b/g, 'dotnet')
      .replace(/node\.js/g, 'nodejs')
      .replace(/next\.js/g, 'nextjs')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9_]/g, '');
    if (!token) continue;
    token = HASHTAG_TYPO_FIXES[token] ?? token;
    if (token.length < 2 || token.length > 30) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    normalizedTags.push(`#${token}`);
    if (opts.maxTags !== undefined && normalizedTags.length >= opts.maxTags) {
      break;
    }
  }
  return normalizedTags;
}

const CODE_SYNTAX_PUNCT_RE = /[{}[\]();=<>|&$:]|=>|->|::|--[a-z0-9]|\.\.?\/|~\/|["'`]/i;
const CODE_DOT_MEMBER_RE = /[a-z0-9_]\.[a-z0-9_]/i;
const CODE_IDENT_STYLE_RE = /[a-z][A-Z]|[a-z0-9]_[a-z0-9]|[a-z]+-[a-z]+/;
const CODE_LEADING_KW_RE =
  /^(?:npm|npx|pnpm|yarn|bun|git|gh|docker|kubectl|vercel|curl|wget|python3?|pip3?|uv|node|tsx|tsc|vitest|jest|pytest|cargo|rustc|go|make|cmake|ollama|ffmpeg|ffprobe|brew|apt|sh|bash|zsh|jq|grep|rg|awk|sed|cat|ls|cd|mkdir|rm|cp|mv|chmod|export|import|from|const|let|var|function|async|await|return|def|class|fn|pub|struct|enum|impl|match|select|insert|update|delete|create|alter|drop|run|copy|cmd|env|arg|if|else|for|while|try|catch|throw)\b/i;

export function looksLikeFakeCodeProse(
  code: string,
  opts: { allowCommentOnly?: boolean } = {},
): boolean {
  const rawLines = code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) return true;

  const nonCommentLines = rawLines.filter(
    (line) =>
      !(
        line.startsWith('//') ||
        line.startsWith('#') ||
        line.startsWith('--') ||
        line.startsWith('/*') ||
        line.startsWith('*')
      ),
  );

  if (nonCommentLines.length === 0) {
    return !opts.allowCommentOnly;
  }

  let syntaxLines = 0;
  let proseLines = 0;

  for (const line of nonCommentLines) {
    const cleanLine = line.replace(/^[+-]\s*/, '');
    const hasSyntax =
      CODE_SYNTAX_PUNCT_RE.test(cleanLine) ||
      CODE_DOT_MEMBER_RE.test(cleanLine) ||
      CODE_IDENT_STYLE_RE.test(cleanLine) ||
      CODE_LEADING_KW_RE.test(cleanLine);

    if (hasSyntax) {
      syntaxLines++;
      continue;
    }

    const words = cleanLine.split(/\s+/).filter(Boolean);
    const mostlyAlphaWords = words.filter((w) => /^[a-z.,!?'-]+$/i.test(w));
    if (words.length >= 3 && mostlyAlphaWords.length >= 3) {
      proseLines++;
    } else if (words.length <= 2 && /^[a-z0-9_-]+$/i.test(cleanLine)) {
      // Single CLI binary / token line
      syntaxLines++;
    }
  }

  if (syntaxLines === 0) return true;
  return proseLines / nonCommentLines.length >= 0.5;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function assembleInstagramCaption(caption: string, hashtags: string[]): string {
  const normalizedTags = sanitizeHashtags(hashtags);
  const cleanCaption = caption.trim();
  if (normalizedTags.length === 0) return cleanCaption;
  return `${cleanCaption}\n\n${normalizedTags.join(' ')}`;
}

function validateCodeBlock(
  code: string,
  label: string,
  errors: string[],
  opts: { allowCommentOnly?: boolean } = {},
): number {
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
  if (looksLikeFakeCodeProse(code, opts)) {
    errors.push(
      `${label} looks like plain English prose instead of real code or CLI commands. Write real syntax, config, or shell commands.`,
    );
  }
  return lines.length;
}

export function validateStoryboardEditorial(
  storyboard: ReelStoryboard,
  options: EditorialValidationOptions = {},
): EditorialCheckResult {
  const errors: string[] = [];
  let totalWords = 0;
  let contentWords = 0;
  let aiMediaClipCount = 0;

  if (storyboard.scenes.length > 8) {
    errors.push(
      `Storyboard has ${storyboard.scenes.length} scenes; max 8 scenes allowed.`,
    );
  }

  storyboard.scenes.forEach((scene, index) => {
    const sceneLabel = `Scene ${index + 1} (${scene.type})`;

    const words = countWords(scene.narration);
    totalWords += words;
    if (!isChannelOutroScene(scene)) {
      contentWords += words;
    }
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
      const afterCount = validateCodeBlock(scene.afterCode, `${sceneLabel} afterCode`, errors, {
        allowCommentOnly: false,
      });
      if (scene.mode === 'before_after') {
        if (!scene.beforeCode || scene.beforeCode.trim().length === 0) {
          errors.push(`${sceneLabel} mode is before_after but beforeCode is empty.`);
        } else {
          const beforeCount = validateCodeBlock(scene.beforeCode, `${sceneLabel} beforeCode`, errors, {
            allowCommentOnly: true,
          });
          if (beforeCount + afterCount > 18) {
            errors.push(
              `${sceneLabel} combined beforeCode + afterCode has ${beforeCount + afterCount} lines; max 18 combined lines allowed.`,
            );
          }
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

  if (contentWords < 40) {
    errors.push(
      `Content spoken narration is ${contentWords} words; at least 40 words required.`,
    );
  }
  if (totalWords > 175) {
    errors.push(
      `Total spoken narration is ${totalWords} words; max 175 words allowed (~65s).`,
    );
  }

  if (options.rejectDefaultBrandLeak && options.brandHandle?.trim().toLowerCase() !== '@ai.dev.reels') {
    const leakRe = /@ai\.dev\.reels/i;
    const leakedInCaption = leakRe.test(storyboard.caption);
    const leakedInScene = storyboard.scenes.some(
      (s) => leakRe.test(s.narration) || (s.type === 'takeaway_cta' && leakRe.test(s.ctaText)),
    );
    if (leakedInCaption || leakedInScene) {
      errors.push(
        'Leaked default handle "@ai.dev.reels" in caption, narration, or CTA. Omit handles unless specifically configured.',
      );
    }
  }

  const sanitizedTags = sanitizeHashtags(storyboard.hashtags);
  if (sanitizedTags.length < 3) {
    errors.push(`Hashtags produced only ${sanitizedTags.length} valid tag(s); at least 3 valid hashtags required.`);
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
