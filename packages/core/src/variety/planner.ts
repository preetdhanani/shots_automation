import {
  VOICE_NAMES,
  isChannelOutroScene,
  type ContentPillar,
  type ReelScene,
  type ReelStoryboard,
  type ReelStyle,
  type VoiceName,
} from '../schemas/storyboard.js';
import type { ReelFingerprint } from './fingerprint.js';
import { REEL_FORMATS } from './formats.js';
import {
  BACKGROUND_IDS,
  CAMERA_MOVE_IDS,
  CAPTION_STYLE_IDS,
  MUSIC_MOOD_IDS,
  PALETTE_IDS,
  REEL_FORMAT_IDS,
  SCENE_LAYOUTS,
  TRANSITION_IDS,
  TYPOGRAPHY_IDS,
  isValidLayout,
  type CameraMoveId,
  type HookStyleId,
  type MusicMoodId,
  type ReelFormatId,
  type SceneType,
  type TransitionId,
} from './registry.js';
import { createSeededRng, weightedPick, type RngFn } from './rng.js';

export interface ReelVarietyPlan {
  format: ReelFormatId;
  hookStyle: HookStyleId;
  style: ReelStyle;
}

export interface PlanReelVarietyInput {
  pillar: ContentPillar;
  /** Most recent reels first (index 0 = newest). */
  history: readonly ReelFingerprint[];
  requestedFormat?: ReelFormatId | 'auto';
  seed?: number;
}

/**
 * Decay penalty where index 0 (most recent) applies the strongest penalty
 * and older reels apply progressively weaker penalties.
 */
function recencyMultiplier(
  candidate: string,
  recentValues: readonly (string | null | undefined)[],
  strength = 0.72,
  decay = 0.72,
): number {
  let weight = 1;
  for (let i = 0; i < recentValues.length; i++) {
    if (recentValues[i] === candidate) {
      const factor = Math.max(0.15, 1 - strength * Math.pow(decay, i));
      weight *= factor;
    }
  }
  return weight;
}

function pickWithRecency<T extends string>(
  candidates: readonly T[],
  recentValues: readonly (string | null | undefined)[],
  rng: RngFn,
  opts: {
    hardBlockLast?: number;
    exclude?: readonly (string | undefined)[];
    baseWeights?: Partial<Record<T, number>>;
  } = {},
): T {
  const hardBlockCount = opts.hardBlockLast ?? 0;
  const blocked = new Set<string>();
  for (let i = 0; i < Math.min(hardBlockCount, recentValues.length); i++) {
    const val = recentValues[i];
    if (val) blocked.add(val);
  }
  for (const ex of opts.exclude ?? []) {
    if (ex) blocked.add(ex);
  }

  const eligible = candidates.filter((c) => !blocked.has(c));
  const pool = eligible.length > 0 ? eligible : candidates;

  return weightedPick(
    pool.map((item) => {
      const base = opts.baseWeights?.[item] ?? 1;
      const penalty = recencyMultiplier(item, recentValues);
      return { item, weight: base * penalty };
    }),
    rng,
  );
}

export function planReelVariety(input: PlanReelVarietyInput): ReelVarietyPlan {
  const seed =
    input.seed !== undefined
      ? Math.trunc(input.seed) >>> 0
      : ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  const rng = createSeededRng(seed);
  const history = input.history;

  // 1. Format selection (hard-block last 3 formats out of 8 when Auto)
  let format: ReelFormatId;
  if (input.requestedFormat && input.requestedFormat !== 'auto') {
    format = input.requestedFormat;
  } else {
    const baseWeights: Partial<Record<ReelFormatId, number>> = {};
    for (const id of REEL_FORMAT_IDS) {
      baseWeights[id] = REEL_FORMATS[id].pillarFit[input.pillar] ?? 1;
    }
    format = pickWithRecency(
      REEL_FORMAT_IDS,
      history.map((h) => h.format),
      rng,
      { hardBlockLast: 3, baseWeights },
    );
  }

  const spec = REEL_FORMATS[format];

  // 2. Hook style (prefer format's hook styles, avoid repeating last 2)
  const hookStyle = pickWithRecency(
    spec.hookStyles,
    history.map((h) => h.hookStyle),
    rng,
    { hardBlockLast: Math.min(2, Math.max(0, spec.hookStyles.length - 1)) },
  );

  // 3. Visual style (hard-block last 1 background & last 1 musicMood so consecutive reels never match)
  const background = pickWithRecency(
    BACKGROUND_IDS,
    history.map((h) => h.background),
    rng,
    { hardBlockLast: 1 },
  );

  const typography = pickWithRecency(
    TYPOGRAPHY_IDS,
    history.map((h) => h.typography),
    rng,
    { hardBlockLast: 1 },
  );

  const captionStyle = pickWithRecency(
    CAPTION_STYLE_IDS,
    history.map((h) => h.captionStyle),
    rng,
    { hardBlockLast: 1 },
  );

  const palette = pickWithRecency(
    PALETTE_IDS,
    history.map((h) => h.palette),
    rng,
    { hardBlockLast: 1 },
  );

  // Music mood: give format's preferred moods a 2.5x boost while allowing all 5 moods to avoid repetition
  const moodWeights: Partial<Record<MusicMoodId, number>> = {};
  for (const mood of MUSIC_MOOD_IDS) {
    moodWeights[mood] = spec.musicMoods.includes(mood) ? 2.5 : 0.6;
  }
  const musicMood = pickWithRecency(
    MUSIC_MOOD_IDS,
    history.map((h) => h.musicMood),
    rng,
    { hardBlockLast: 1, baseWeights: moodWeights },
  );

  return {
    format,
    hookStyle,
    style: {
      seed,
      background,
      typography,
      captionStyle,
      palette,
      musicMood,
    },
  };
}

function recentLayoutsForSceneType(
  history: readonly ReelFingerprint[],
  sceneType: SceneType,
  maxReels = 3,
): string[] {
  const prefix = `${sceneType}:`;
  const used: string[] = [];
  for (const fp of history.slice(0, maxReels)) {
    for (const entry of fp.layouts) {
      if (entry.startsWith(prefix)) {
        used.push(entry.slice(prefix.length));
      }
    }
  }
  return used;
}

export interface ApplyVisualPlanOptions {
  style: ReelStyle;
  format?: ReelFormatId;
  history: readonly ReelFingerprint[];
  seed?: number;
  preserveExisting?: boolean;
}

export function applyVisualPlan(
  storyboard: ReelStoryboard,
  opts: ApplyVisualPlanOptions,
): ReelStoryboard {
  const seed = (opts.seed ?? opts.style.seed) >>> 0;
  const rng = createSeededRng(seed ^ 0x9e3779b9);
  const format = opts.format ?? storyboard.format;
  const formatSpec = format ? REEL_FORMATS[format] : null;
  const preferredTransitions = formatSpec ? formatSpec.preferredTransitions : TRANSITION_IDS;

  let prevTransition: TransitionId | null = null;
  let prevCamera: CameraMoveId | null = null;
  const usedLayoutsByType = new Map<SceneType, string[]>();

  const nextScenes: ReelScene[] = storyboard.scenes.map((scene, idx) => {
    const existing = scene.visual;

    // Layout: avoid layouts used for this sceneType in last 3 reels or earlier in this reel
    const availableLayouts = SCENE_LAYOUTS[scene.type] as readonly string[];
    let layout: string;
    if (opts.preserveExisting && existing?.layout && isValidLayout(scene.type, existing.layout)) {
      layout = existing.layout;
    } else if (isChannelOutroScene(scene)) {
      layout = availableLayouts[idx % availableLayouts.length] ?? availableLayouts[0]!;
    } else {
      const recentForType = [
        ...(usedLayoutsByType.get(scene.type) ?? []),
        ...recentLayoutsForSceneType(opts.history, scene.type, 3),
      ];
      layout = pickWithRecency(availableLayouts, recentForType, rng, {
        hardBlockLast: availableLayouts.length > 1 ? 1 : 0,
      });
    }
    usedLayoutsByType.set(scene.type, [layout, ...(usedLayoutsByType.get(scene.type) ?? [])]);

    // Transition: scene 0 uses a punchy enter, never the same transition twice in a row
    let transition: TransitionId;
    if (opts.preserveExisting && existing?.transition) {
      transition = existing.transition;
    } else {
      const transitionPool =
        preferredTransitions.length > 1
          ? preferredTransitions.filter((t) => t !== prevTransition)
          : TRANSITION_IDS.filter((t) => t !== prevTransition);
      transition = weightedPick(
        transitionPool.map((item) => ({ item, weight: 1 })),
        rng,
      );
    }
    prevTransition = transition;

    // Camera move: subtle motion on content scenes, varied across scenes
    let camera: CameraMoveId;
    if (opts.preserveExisting && existing?.camera) {
      camera = existing.camera;
    } else if (isChannelOutroScene(scene)) {
      camera = 'push_in';
    } else {
      const cameraPool = CAMERA_MOVE_IDS.filter((c) => c !== prevCamera);
      camera = weightedPick(
        cameraPool.map((item) => ({ item, weight: item === 'none' ? 0.5 : 1.2 })),
        rng,
      );
    }
    prevCamera = camera;

    return {
      ...scene,
      visual: {
        layout,
        transition,
        camera,
        ...(existing?.emphasis && existing.emphasis.length > 0
          ? { emphasis: existing.emphasis }
          : {}),
      },
    };
  });

  return {
    ...storyboard,
    format: format ?? storyboard.format,
    style: opts.style,
    scenes: nextScenes,
  };
}

/**
 * Generates a visibly distinct new style + scene visual plan without changing narration/script.
 */
export function restyleStoryboard(
  storyboard: ReelStoryboard,
  history: readonly ReelFingerprint[],
  seed?: number,
): ReelStoryboard {
  const nextSeed =
    seed !== undefined
      ? Math.trunc(seed) >>> 0
      : ((Date.now() ^ ((storyboard.style?.seed ?? 0) + 0x517cc1b7)) >>> 0);
  const rng = createSeededRng(nextSeed);
  const current = storyboard.style;
  const spec = storyboard.format ? REEL_FORMATS[storyboard.format] : null;

  const background = pickWithRecency(
    BACKGROUND_IDS,
    history.map((h) => h.background),
    rng,
    { exclude: [current?.background] },
  );
  const typography = pickWithRecency(
    TYPOGRAPHY_IDS,
    history.map((h) => h.typography),
    rng,
    { exclude: [current?.typography] },
  );
  const captionStyle = pickWithRecency(
    CAPTION_STYLE_IDS,
    history.map((h) => h.captionStyle),
    rng,
    { exclude: [current?.captionStyle] },
  );
  const palette = pickWithRecency(
    PALETTE_IDS,
    history.map((h) => h.palette),
    rng,
    { exclude: [current?.palette] },
  );
  const moodWeights: Partial<Record<MusicMoodId, number>> = {};
  for (const mood of MUSIC_MOOD_IDS) {
    moodWeights[mood] = spec?.musicMoods.includes(mood) ? 2.2 : 0.7;
  }
  const musicMood = pickWithRecency(
    MUSIC_MOOD_IDS,
    history.map((h) => h.musicMood),
    rng,
    { exclude: [current?.musicMood], baseWeights: moodWeights },
  );

  const nextStyle: ReelStyle = {
    seed: nextSeed,
    background,
    typography,
    captionStyle,
    palette,
    musicMood,
  };

  return applyVisualPlan(storyboard, {
    style: nextStyle,
    format: storyboard.format,
    history,
    seed: nextSeed,
    preserveExisting: false,
  });
}

/**
 * Least-recently-used voice rotation that never repeats the last 2 voices.
 */
export function pickRotatedVoice(
  history: readonly ReelFingerprint[],
  defaultVoice: VoiceName,
): VoiceName {
  if (history.length === 0) {
    return defaultVoice;
  }

  const lastTwo = new Set<VoiceName>(history.slice(0, 2).map((h) => h.voiceName));
  const lastUsedIdx = new Map<VoiceName, number>();
  history.forEach((h, idx) => {
    if (!lastUsedIdx.has(h.voiceName)) {
      lastUsedIdx.set(h.voiceName, idx);
    }
  });

  // Sort voices by: not in lastTwo first, then never-used first, then oldest-used first
  const ranked = [...VOICE_NAMES].sort((a, b) => {
    const aBlocked = lastTwo.has(a) ? 1 : 0;
    const bBlocked = lastTwo.has(b) ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;

    const aIdx = lastUsedIdx.get(a) ?? Number.POSITIVE_INFINITY;
    const bIdx = lastUsedIdx.get(b) ?? Number.POSITIVE_INFINITY;
    if (aIdx !== bIdx) return bIdx - aIdx;

    // Stable tie-breaker starting after defaultVoice so first rotation moves off default
    return VOICE_NAMES.indexOf(a) - VOICE_NAMES.indexOf(b);
  });

  return ranked[0] ?? defaultVoice;
}
