import type { ContentPillar } from '../schemas/storyboard.js';
import {
  REEL_FORMAT_IDS,
  type HookStyleId,
  type MiddleSceneType,
  type MusicMoodId,
  type ReelFormatId,
  type TransitionId,
} from './registry.js';

export interface ReelFormatSpec {
  id: ReelFormatId;
  label: string;
  description: string;
  /** Min and max scene count BEFORE the auto-appended channel outro scene. */
  sceneCount: readonly [number, number];
  /** Every scene type listed here MUST appear at least once in middle scenes. */
  requiredTypes: readonly MiddleSceneType[];
  /** If non-empty, at least ONE of these types MUST appear in middle scenes. */
  requiredAnyOf?: readonly MiddleSceneType[];
  /** Allowed middle scene types (excluding ai_media_clip which is added when B-roll is enabled). */
  allowedTypes: readonly MiddleSceneType[];
  /** Types allowed to appear consecutively in this format. */
  allowConsecutiveTypes?: readonly MiddleSceneType[];
  /** When true, middle countdown_item scenes must count down 3, 2, 1. */
  requireCountdownRanks?: boolean;
  /** Prompt recipe instructions for the Script LLM. */
  recipe: readonly string[];
  hookStyles: readonly HookStyleId[];
  musicMoods: readonly MusicMoodId[];
  preferredTransitions: readonly TransitionId[];
  pillarFit: Record<ContentPillar, number>;
}

export const REEL_FORMATS: Record<ReelFormatId, ReelFormatSpec> = {
  news_breakdown: {
    id: 'news_breakdown',
    label: 'News Breakdown',
    description: 'Headline launch or update broken down with source visual, timeline, and impact.',
    sceneCount: [4, 5],
    requiredTypes: [],
    requiredAnyOf: ['source_spotlight', 'news_quote_card'],
    allowedTypes: [
      'source_spotlight',
      'news_quote_card',
      'big_stat',
      'timeline',
      'benchmark_bars',
      'social_post',
    ],
    recipe: [
      'Open with a crisp hook_title framing what just dropped and why builders should care.',
      'Use source_spotlight or news_quote_card to anchor the announcement with real facts.',
      'Follow with timeline, big_stat, benchmark_bars, or a verbatim social_post quote showing concrete impact.',
      'Close with one sharp takeaway_cta telling engineers what to test or watch next.',
    ],
    hookStyles: ['bold_claim', 'shocking_number', 'curiosity_gap'],
    musicMoods: ['dark_pad', 'upbeat_pulse', 'tension_build'],
    preferredTransitions: ['slide_left', 'wipe', 'fade', 'zoom_punch'],
    pillarFit: {
      ai_news: 2.2,
      benchmarks: 1.0,
      harnesses: 0.9,
      coding_practices: 0.7,
      vibe_coding: 0.8,
    },
  },
  hot_take: {
    id: 'hot_take',
    label: 'Hot Take',
    description: 'Contrarian developer opinion backed by myth-busting evidence or a real comparison.',
    sceneCount: [4, 5],
    requiredTypes: [],
    requiredAnyOf: ['myth_fact', 'versus_split', 'big_stat'],
    allowedTypes: [
      'myth_fact',
      'big_stat',
      'versus_split',
      'code_compare',
      'social_post',
      'news_quote_card',
    ],
    recipe: [
      'Open with a punchy contrarian or pain_point hook_title that challenges conventional wisdom.',
      'Prove the argument using myth_fact, big_stat, versus_split, or code_compare.',
      'Keep every claim grounded in facts from the topic without inventing fake benchmarks.',
      'Close with a clear takeaway_cta rule engineers can apply immediately.',
    ],
    hookStyles: ['contrarian', 'pain_point', 'bold_claim'],
    musicMoods: ['tension_build', 'upbeat_pulse', 'dark_pad'],
    preferredTransitions: ['whip_pan', 'glitch', 'zoom_punch', 'slide_left'],
    pillarFit: {
      ai_news: 1.1,
      benchmarks: 1.0,
      harnesses: 1.6,
      coding_practices: 1.8,
      vibe_coding: 2.0,
    },
  },
  top3_countdown: {
    id: 'top3_countdown',
    label: 'Top 3 Countdown',
    description: 'Fast-paced 3 -> 2 -> 1 countdown highlighting the top takeaways, tools, or shifts.',
    sceneCount: [5, 5],
    requiredTypes: ['countdown_item'],
    allowedTypes: ['countdown_item'],
    allowConsecutiveTypes: ['countdown_item'],
    requireCountdownRanks: true,
    recipe: [
      'Output exactly 5 scenes: hook_title, three countdown_item scenes (rank 3, then rank 2, then rank 1), and takeaway_cta.',
      'Build momentum from #3 up to the strongest #1 insight.',
      'Each countdown_item needs a crisp title, concrete detail, and short tag.',
      'Close with a concise takeaway_cta summarizing the #1 priority.',
    ],
    hookStyles: ['curiosity_gap', 'bold_claim', 'question'],
    musicMoods: ['upbeat_pulse', 'bright_synth', 'lofi_chill'],
    preferredTransitions: ['zoom_punch', 'slide_up', 'whip_pan', 'iris'],
    pillarFit: {
      ai_news: 1.2,
      benchmarks: 1.0,
      harnesses: 1.4,
      coding_practices: 1.7,
      vibe_coding: 1.9,
    },
  },
  myth_vs_fact: {
    id: 'myth_vs_fact',
    label: 'Myth vs Fact',
    description: 'Busts 2 to 3 common developer misconceptions with crisp myth-to-reality flips.',
    sceneCount: [4, 5],
    requiredTypes: ['myth_fact'],
    allowedTypes: ['myth_fact', 'big_stat', 'code_compare'],
    allowConsecutiveTypes: ['myth_fact'],
    recipe: [
      'Open with a contrarian or question hook_title calling out a widespread mistake.',
      'Include 2 to 3 myth_fact scenes (optionally paired with one big_stat or code_compare).',
      'Make each myth short and recognizable, and each fact specific and actionable.',
      'Close with a takeaway_cta giving the new default habit.',
    ],
    hookStyles: ['contrarian', 'question', 'pain_point'],
    musicMoods: ['tension_build', 'lofi_chill', 'dark_pad'],
    preferredTransitions: ['wipe', 'glitch', 'slide_left', 'zoom_punch'],
    pillarFit: {
      ai_news: 0.9,
      benchmarks: 1.2,
      harnesses: 1.5,
      coding_practices: 2.0,
      vibe_coding: 1.8,
    },
  },
  versus_battle: {
    id: 'versus_battle',
    label: 'X vs Y Battle',
    description: 'Head-to-head comparison with split scorecard plus benchmark or trend proof.',
    sceneCount: [4, 5],
    requiredTypes: ['versus_split'],
    allowedTypes: ['versus_split', 'benchmark_bars', 'line_chart', 'code_compare', 'big_stat'],
    recipe: [
      'Open with a high-stakes hook_title framing the matchup (Option A vs Option B).',
      'Use versus_split for the direct side-by-side breakdown with clear winner or tie verdict.',
      'Back up the verdict with benchmark_bars, line_chart, code_compare, or big_stat using real topic numbers.',
      'Close with takeaway_cta stating exactly when to pick each side.',
    ],
    hookStyles: ['question', 'bold_claim', 'shocking_number'],
    musicMoods: ['upbeat_pulse', 'tension_build', 'bright_synth'],
    preferredTransitions: ['whip_pan', 'slide_left', 'zoom_punch', 'wipe'],
    pillarFit: {
      ai_news: 1.2,
      benchmarks: 2.4,
      harnesses: 1.6,
      coding_practices: 1.2,
      vibe_coding: 1.1,
    },
  },
  step_tutorial: {
    id: 'step_tutorial',
    label: 'Step-by-Step Tutorial',
    description: 'Actionable developer recipe with numbered steps, real command, and clean code.',
    sceneCount: [4, 6],
    requiredTypes: ['checklist_steps'],
    allowedTypes: ['checklist_steps', 'terminal_demo', 'code_compare', 'big_stat'],
    recipe: [
      'Open with a pain_point or curiosity_gap hook_title promising a concrete workflow upgrade.',
      'Include checklist_steps breaking the workflow into 3 to 5 tight steps.',
      'Pair with terminal_demo and/or code_compare showing the exact command or pattern.',
      'Close with takeaway_cta telling developers the first step to wire today.',
    ],
    hookStyles: ['pain_point', 'curiosity_gap', 'question'],
    musicMoods: ['lofi_chill', 'bright_synth', 'upbeat_pulse'],
    preferredTransitions: ['slide_up', 'slide_left', 'fade', 'iris'],
    pillarFit: {
      ai_news: 0.7,
      benchmarks: 0.7,
      harnesses: 2.0,
      coding_practices: 2.2,
      vibe_coding: 2.1,
    },
  },
  deep_dive_demo: {
    id: 'deep_dive_demo',
    label: 'Deep Dive Demo',
    description: 'Hands-on technical walkthrough combining terminal output, code diff, and metrics.',
    sceneCount: [4, 6],
    requiredTypes: ['terminal_demo', 'code_compare'],
    allowedTypes: [
      'terminal_demo',
      'code_compare',
      'benchmark_bars',
      'big_stat',
      'checklist_steps',
    ],
    recipe: [
      'Open with a bold_claim or pain_point hook_title about an engineering pattern or harness.',
      'Show both terminal_demo and code_compare (keep code lines <= 36 chars, max 10 lines).',
      'Optionally add benchmark_bars, big_stat, or checklist_steps to quantify the win.',
      'Close with takeaway_cta focusing on reliability and developer speed.',
    ],
    hookStyles: ['bold_claim', 'pain_point', 'curiosity_gap'],
    musicMoods: ['dark_pad', 'lofi_chill', 'upbeat_pulse'],
    preferredTransitions: ['slide_left', 'wipe', 'fade', 'slide_up'],
    pillarFit: {
      ai_news: 0.8,
      benchmarks: 1.2,
      harnesses: 2.3,
      coding_practices: 1.9,
      vibe_coding: 1.5,
    },
  },
  stat_shock: {
    id: 'stat_shock',
    label: 'Stat Shock',
    description: 'Leads with one jaw-dropping metric, then unpacks the trend line and evidence.',
    sceneCount: [4, 5],
    requiredTypes: ['big_stat'],
    allowedTypes: ['big_stat', 'line_chart', 'benchmark_bars', 'timeline', 'news_quote_card'],
    recipe: [
      'Open with a shocking_number hook_title spotlighting the headline metric.',
      'Follow immediately with big_stat to anchor the number and its context.',
      'Add line_chart, benchmark_bars, timeline, or news_quote_card using only verified topic numbers.',
      'Close with takeaway_cta translating the metric into a practical decision.',
    ],
    hookStyles: ['shocking_number', 'curiosity_gap', 'bold_claim'],
    musicMoods: ['tension_build', 'dark_pad', 'bright_synth'],
    preferredTransitions: ['zoom_punch', 'iris', 'wipe', 'slide_up'],
    pillarFit: {
      ai_news: 1.6,
      benchmarks: 2.3,
      harnesses: 1.1,
      coding_practices: 0.9,
      vibe_coding: 0.9,
    },
  },
};

export const REEL_FORMAT_LIST: readonly ReelFormatSpec[] = REEL_FORMAT_IDS.map(
  (id) => REEL_FORMATS[id],
);

export const HOOK_STYLE_INSTRUCTIONS: Record<HookStyleId, string> = {
  question: 'Frame the hook as a sharp, provocative question engineers immediately want answered.',
  bold_claim: 'Open with a direct, high-conviction claim backed by the topic facts.',
  shocking_number: 'Lead with the single most surprising real number or metric from the topic.',
  contrarian: 'Challenge a popular assumption or habit developers currently follow.',
  pain_point: 'Call out a concrete engineering frustration or failure mode in the first sentence.',
  curiosity_gap: 'Tease an unexpected shift or technique that pays off in the middle scenes.',
};
