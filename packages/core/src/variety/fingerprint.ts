import {
  isChannelOutroScene,
  type ReelScene,
  type ReelStoryboard,
  type VoiceName,
} from '../schemas/storyboard.js';
import {
  DEFAULT_REEL_STYLE,
  DEFAULT_TRANSITION,
  resolveLayout,
  type BackgroundId,
  type CaptionStyleId,
  type HookStyleId,
  type MusicMoodId,
  type PaletteId,
  type ReelFormatId,
  type SceneType,
  type TransitionId,
  type TypographyId,
} from './registry.js';

export interface ReelFingerprint {
  reelId: string;
  title: string;
  createdAt: string;
  format: ReelFormatId | null;
  hookStyle: HookStyleId | null;
  sceneTypes: SceneType[];
  layouts: string[];
  transitions: TransitionId[];
  background: BackgroundId;
  typography: TypographyId;
  captionStyle: CaptionStyleId;
  palette: PaletteId;
  musicMood: MusicMoodId;
  voiceName: VoiceName;
  hookHeadline: string;
  openingWords: string;
  isGenerating?: boolean;
}

export interface FreshnessReport {
  /** 0 (identical to a recent reel) .. 100 (completely fresh). */
  score: number;
  comparedCount: number;
  mostSimilar?: {
    reelId: string;
    title: string;
    similarity: number;
  };
}

export interface FingerprintableReel {
  id: string;
  title: string;
  createdAt: string;
  status?: string;
  voiceName: VoiceName;
  storyboard: ReelStoryboard;
}

export function normalizeWordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

export function extractOpeningWords(text: string, count = 3): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, count).join(' ');
}

export function jaccardSimilarity(aTokens: readonly string[], bTokens: readonly string[]): number {
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function textJaccardSimilarity(a: string, b: string): number {
  return jaccardSimilarity(normalizeWordTokens(a), normalizeWordTokens(b));
}

function sequenceSimilarity(a: readonly string[], b: readonly string[]): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const minLen = Math.min(a.length, b.length);
  let posMatches = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) posMatches++;
  }
  const positional = posMatches / maxLen;
  const bag = jaccardSimilarity(a, b);
  return positional * 0.6 + bag * 0.4;
}

function contentScenesOf(storyboard: ReelStoryboard): ReelScene[] {
  // Exclude the standard channel outro so identical outro scenes do not inflate similarity.
  return storyboard.scenes.filter((scene) => !isChannelOutroScene(scene));
}

export function extractSceneHookHeadline(
  scene: ReelScene | undefined,
  fallbackTitle: string,
): string {
  if (!scene) return fallbackTitle;
  switch (scene.type) {
    case 'hook_title':
    case 'news_quote_card':
    case 'source_spotlight':
    case 'takeaway_cta':
      return scene.headline;
    case 'benchmark_bars':
    case 'code_compare':
    case 'terminal_demo':
    case 'versus_split':
    case 'checklist_steps':
    case 'timeline':
    case 'line_chart':
    case 'countdown_item':
      return scene.title;
    case 'big_stat':
      return `${scene.value} ${scene.label}`.trim();
    case 'myth_fact':
      return scene.myth;
    default:
      return fallbackTitle;
  }
}

export function computeReelFingerprint(reel: FingerprintableReel): ReelFingerprint {
  const sb = reel.storyboard;
  const style = sb.style ?? DEFAULT_REEL_STYLE;
  const scenes = contentScenesOf(sb);
  const firstScene = scenes[0];
  const hookHeadline = extractSceneHookHeadline(firstScene, sb.title);
  const openingWords = firstScene ? extractOpeningWords(firstScene.narration, 3) : '';

  return {
    reelId: reel.id,
    title: reel.title,
    createdAt: reel.createdAt,
    format: sb.format ?? null,
    hookStyle: sb.hookStyle ?? null,
    sceneTypes: scenes.map((s) => s.type),
    layouts: scenes.map((s) => `${s.type}:${resolveLayout(s.type, s.visual?.layout)}`),
    transitions: scenes.map((s) => s.visual?.transition ?? DEFAULT_TRANSITION),
    background: style.background,
    typography: style.typography,
    captionStyle: style.captionStyle,
    palette: style.palette,
    musicMood: style.musicMood,
    voiceName: reel.voiceName,
    hookHeadline,
    openingWords,
    isGenerating: reel.status === 'GENERATING',
  };
}

/**
 * Weighted similarity between two reels in [0, 1].
 * Weights:
 *  - format: 0.20
 *  - scene sequence: 0.20
 *  - hook text Jaccard: 0.15
 *  - style (bg, typography, caption, palette, music): 0.25 (0.05 each)
 *  - layouts + transitions: 0.15
 *  - voice: 0.05
 */
export function fingerprintSimilarity(a: ReelFingerprint, b: ReelFingerprint): number {
  const formatScore = a.format && b.format ? (a.format === b.format ? 1 : 0) : 0.5;
  const sceneScore = sequenceSimilarity(a.sceneTypes, b.sceneTypes);
  const hookScore = textJaccardSimilarity(a.hookHeadline, b.hookHeadline);

  let styleMatches = 0;
  if (a.background === b.background) styleMatches++;
  if (a.typography === b.typography) styleMatches++;
  if (a.captionStyle === b.captionStyle) styleMatches++;
  if (a.palette === b.palette) styleMatches++;
  if (a.musicMood === b.musicMood) styleMatches++;
  const styleScore = styleMatches / 5;

  const layoutScore = jaccardSimilarity(a.layouts, b.layouts);
  const transitionScore = sequenceSimilarity(a.transitions, b.transitions);
  const motionScore = layoutScore * 0.5 + transitionScore * 0.5;

  const voiceScore = a.voiceName === b.voiceName ? 1 : 0;

  const raw =
    formatScore * 0.2 +
    sceneScore * 0.2 +
    hookScore * 0.15 +
    styleScore * 0.25 +
    motionScore * 0.15 +
    voiceScore * 0.05;

  return Math.max(0, Math.min(1, Math.round(raw * 1000) / 1000));
}

export function computeFreshness(
  target: ReelFingerprint,
  history: readonly ReelFingerprint[],
): FreshnessReport {
  const peers = history.filter((item) => item.reelId !== target.reelId && !item.isGenerating);
  if (peers.length === 0) {
    return { score: 100, comparedCount: 0 };
  }

  let worstSim = -1;
  let mostSimilar: FreshnessReport['mostSimilar'];

  for (const peer of peers) {
    const sim = fingerprintSimilarity(target, peer);
    if (sim > worstSim) {
      worstSim = sim;
      mostSimilar = {
        reelId: peer.reelId,
        title: peer.title,
        similarity: sim,
      };
    }
  }

  const score = Math.max(0, Math.min(100, Math.round((1 - Math.max(0, worstSim)) * 100)));
  return {
    score,
    comparedCount: peers.length,
    mostSimilar,
  };
}
