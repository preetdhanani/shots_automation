import {
  isChannelOutroScene,
  type ReelStoryboard,
} from '../schemas/storyboard.js';
import {
  extractOpeningWords,
  extractSceneHookHeadline,
  normalizeWordTokens,
  textJaccardSimilarity,
  type ReelFingerprint,
} from './fingerprint.js';
import type { ReelFormatSpec } from './formats.js';
import type { MiddleSceneType, SceneType } from './registry.js';

const DATA_FIRST_OPENING_TYPES = new Set<SceneType>([
  'hook_title',
  'benchmark_bars',
  'versus_split',
  'big_stat',
  'code_compare',
  'myth_fact',
]);

export interface VarietyValidationOptions {
  formatSpec?: ReelFormatSpec;
  history?: readonly ReelFingerprint[];
  topicText?: string;
  brollEnabled?: boolean;
}

export interface VarietyCheckResult {
  ok: boolean;
  errors: string[];
}

const SPAM_ENGAGEMENT_BAIT_PATTERNS: readonly RegExp[] = [
  /\bcomment\s+["'][a-z0-9_-]{2,20}["']/i,
  /\bcomment\s+[A-Z]{2,20}\b/,
  /\bdm\s+me\b/i,
  /\blink\s+in\s+bio\b/i,
];

function hasSpamEngagementBait(text: string): boolean {
  return SPAM_ENGAGEMENT_BAIT_PATTERNS.some((re) => re.test(text));
}

function tokenContainmentRatio(quote: string, sourceText: string): number {
  const quoteTokens = normalizeWordTokens(quote);
  if (quoteTokens.length === 0) return 0;
  const sourceSet = new Set(normalizeWordTokens(sourceText));
  if (sourceSet.size === 0) return 0;
  let matched = 0;
  for (const token of quoteTokens) {
    if (sourceSet.has(token)) matched++;
  }
  return matched / quoteTokens.length;
}

export function validateVarietyRules(
  storyboard: ReelStoryboard,
  options: VarietyValidationOptions = {},
): VarietyCheckResult {
  const errors: string[] = [];
  const brollEnabled = Boolean(options.brollEnabled);
  const formatSpec = options.formatSpec;

  const contentScenes = storyboard.scenes.filter((scene) => !isChannelOutroScene(scene));
  const firstScene = contentScenes[0];
  const lastContentScene = contentScenes[contentScenes.length - 1];
  const nonCtaScenes = contentScenes.slice(0, -1);
  const middleScenes = contentScenes.slice(1, -1);

  if (!firstScene || !DATA_FIRST_OPENING_TYPES.has(firstScene.type)) {
    errors.push(
      'Scene 1 must be "hook_title" or a data-first visual receipt scene ("benchmark_bars", "versus_split", "big_stat", "code_compare", or "myth_fact").',
    );
  }
  if (!lastContentScene || lastContentScene.type !== 'takeaway_cta') {
    errors.push('The final content scene must be type "takeaway_cta".');
  }

  let brollCount = 0;
  for (const scene of contentScenes) {
    if (scene.type === 'ai_media_clip') {
      brollCount++;
      if (!brollEnabled) {
        errors.push('ai_media_clip scene is only allowed when AI B-roll is enabled.');
      }
    }
  }
  if (brollCount > 1) {
    errors.push(`Reel has ${brollCount} ai_media_clip scenes; max 1 allowed.`);
  }

  if (formatSpec) {
    const [minScenes, maxScenes] = formatSpec.sceneCount;
    if (contentScenes.length < minScenes || contentScenes.length > maxScenes) {
      errors.push(
        `Format "${formatSpec.id}" requires ${minScenes} to ${maxScenes} content scenes, got ${contentScenes.length}.`,
      );
    }

    const allowedSet = new Set<string>(formatSpec.allowedTypes);
    if (brollEnabled) {
      allowedSet.add('ai_media_clip');
    }

    if (firstScene && firstScene.type !== 'hook_title' && !allowedSet.has(firstScene.type)) {
      errors.push(
        `Opening receipt scene "${firstScene.id}" uses type "${firstScene.type}", which is not allowed in format "${formatSpec.id}". Allowed: ${[...allowedSet].join(', ')}.`,
      );
    }

    for (const scene of middleScenes) {
      if (!allowedSet.has(scene.type)) {
        errors.push(
          `Scene "${scene.id}" uses type "${scene.type}", which is not allowed in format "${formatSpec.id}". Allowed: ${[...allowedSet].join(', ')}.`,
        );
      }
    }

    const presentBodyTypes = new Set<string>(nonCtaScenes.map((s) => s.type));
    for (const req of formatSpec.requiredTypes) {
      if (!presentBodyTypes.has(req)) {
        errors.push(`Format "${formatSpec.id}" requires at least one "${req}" scene.`);
      }
    }

    if (formatSpec.requiredAnyOf && formatSpec.requiredAnyOf.length > 0) {
      const hasAny = formatSpec.requiredAnyOf.some((req) => presentBodyTypes.has(req));
      if (!hasAny) {
        errors.push(
          `Format "${formatSpec.id}" requires at least one of: ${formatSpec.requiredAnyOf.join(', ')}.`,
        );
      }
    }

    if (formatSpec.requireCountdownRanks) {
      const countdowns = middleScenes.filter((s) => s.type === 'countdown_item');
      const ranks = countdowns.map((s) => s.rank);
      if (ranks.length !== 3 || ranks[0] !== 3 || ranks[1] !== 2 || ranks[2] !== 1) {
        errors.push(
          `Format "${formatSpec.id}" requires exactly 3 countdown_item scenes ranked 3, 2, 1 (got [${ranks.join(', ')}]).`,
        );
      }
    }
  }

  // Consecutive duplicate scene types check across all non-CTA scenes (including Scene 1 -> Scene 2)
  const allowedConsecutive = new Set<MiddleSceneType>(formatSpec?.allowConsecutiveTypes ?? []);
  for (let i = 1; i < nonCtaScenes.length; i++) {
    const prev = nonCtaScenes[i - 1]!;
    const curr = nonCtaScenes[i]!;
    if (prev.type === curr.type && !allowedConsecutive.has(curr.type as MiddleSceneType)) {
      errors.push(
        `Scenes "${prev.id}" and "${curr.id}" repeat type "${curr.type}" back-to-back. Vary scene types.`,
      );
    }
  }

  // Require >= 2 distinct middle types for 4+ content scenes unless consecutive type is the format's core mechanic
  if (contentScenes.length >= 4 && middleScenes.length >= 2) {
    const distinctMiddle = new Set(middleScenes.map((s) => s.type));
    const allAllowedConsecutive = [...distinctMiddle].every((t) =>
      allowedConsecutive.has(t as MiddleSceneType),
    );
    if (distinctMiddle.size < 2 && !allAllowedConsecutive) {
      errors.push(
        'Reels with 4+ content scenes must use at least 2 different visual scene types in the middle scenes.',
      );
    }
  }

  // Verbatim quote check for social_post scenes
  if (options.topicText && options.topicText.trim().length > 0) {
    for (const scene of contentScenes) {
      if (scene.type === 'social_post') {
        const overlap = tokenContainmentRatio(scene.postText, options.topicText);
        if (overlap < 0.8) {
          errors.push(
            `Scene "${scene.id}" (social_post) must quote text directly from the topic summary (${Math.round(overlap * 100)}% overlap, need >= 80%). Use another scene type if no direct quote exists.`,
          );
        }
      }
    }
  }

  // Anti-repeat hook check against completed recent reels (exclude GENERATING placeholder rows)
  const completedHistory = (options.history ?? []).filter((h) => !h.isGenerating);
  if (firstScene && completedHistory.length > 0) {
    const currentHookHeadline = extractSceneHookHeadline(firstScene, storyboard.title);
    const recent12 = completedHistory.slice(0, 12);
    for (const prev of recent12) {
      if (!prev.hookHeadline) continue;
      const sim = textJaccardSimilarity(currentHookHeadline, prev.hookHeadline);
      if (sim >= 0.6) {
        errors.push(
          `Hook headline "${currentHookHeadline}" is too similar (${Math.round(sim * 100)}%) to recent reel "${prev.hookHeadline}". Write a fresh angle.`,
        );
        break;
      }
    }

    const opening = extractOpeningWords(firstScene.narration, 3);
    if (opening.split(' ').length >= 3) {
      const recent5 = completedHistory.slice(0, 5);
      for (const prev of recent5) {
        if (prev.openingWords && prev.openingWords === opening) {
          errors.push(
            `Hook narration starts with "${opening}", which was already used in a recent reel. Start with completely different opening words.`,
          );
          break;
        }
      }
    }
  }

  // Anti-spam engagement bait check on caption & takeaway CTA
  if (hasSpamEngagementBait(storyboard.caption)) {
    errors.push(
      'Caption contains spammy engagement-bait ("Comment KEYWORD", "DM me", or "link in bio"). End with a genuine engineering question instead.',
    );
  }
  if (lastContentScene?.type === 'takeaway_cta' && hasSpamEngagementBait(lastContentScene.ctaText)) {
    errors.push(
      'Takeaway CTA contains spammy engagement-bait. Write a concrete technical check or genuine developer question instead.',
    );
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
