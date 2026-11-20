/**
 * Browser-safe registries for the Video Variety Engine.
 *
 * This file must stay free of Node-only imports because it is re-exported via
 * `@post/core/shared` for the dashboard and the Remotion bundle.
 */

export const REEL_FORMAT_IDS = [
  'news_breakdown',
  'hot_take',
  'top3_countdown',
  'myth_vs_fact',
  'versus_battle',
  'step_tutorial',
  'deep_dive_demo',
  'stat_shock',
] as const;
export type ReelFormatId = (typeof REEL_FORMAT_IDS)[number];

export const HOOK_STYLE_IDS = [
  'question',
  'bold_claim',
  'shocking_number',
  'contrarian',
  'pain_point',
  'curiosity_gap',
] as const;
export type HookStyleId = (typeof HOOK_STYLE_IDS)[number];

export const TRANSITION_IDS = [
  'fade',
  'slide_left',
  'slide_up',
  'zoom_punch',
  'whip_pan',
  'wipe',
  'glitch',
  'iris',
] as const;
export type TransitionId = (typeof TRANSITION_IDS)[number];

export const CAMERA_MOVE_IDS = ['none', 'push_in', 'pull_out', 'drift_left', 'drift_right'] as const;
export type CameraMoveId = (typeof CAMERA_MOVE_IDS)[number];

export const BACKGROUND_IDS = [
  'dot_grid',
  'mesh_gradient',
  'blueprint',
  'scanlines',
  'aurora',
  'spotlight_noise',
] as const;
export type BackgroundId = (typeof BACKGROUND_IDS)[number];

export const TYPOGRAPHY_IDS = ['grotesk', 'condensed_caps', 'editorial_serif', 'rounded_soft'] as const;
export type TypographyId = (typeof TYPOGRAPHY_IDS)[number];

export const CAPTION_STYLE_IDS = ['glass_box', 'bold_pop', 'underline_sweep', 'karaoke_block'] as const;
export type CaptionStyleId = (typeof CAPTION_STYLE_IDS)[number];

export const PALETTE_IDS = ['pillar', 'complement', 'mono_neon'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const MUSIC_MOOD_IDS = [
  'dark_pad',
  'upbeat_pulse',
  'lofi_chill',
  'tension_build',
  'bright_synth',
] as const;
export type MusicMoodId = (typeof MUSIC_MOOD_IDS)[number];

export const SFX_IDS = ['click', 'whoosh', 'pop', 'riser', 'glitch'] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const SCENE_TYPES = [
  'hook_title',
  'benchmark_bars',
  'code_compare',
  'terminal_demo',
  'news_quote_card',
  'takeaway_cta',
  'big_stat',
  'versus_split',
  'checklist_steps',
  'timeline',
  'social_post',
  'line_chart',
  'countdown_item',
  'myth_fact',
  'source_spotlight',
  'ai_media_clip',
] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

/** Middle scene types the LLM may write (hook/takeaway are positional, ai_media_clip is gated). */
export const MIDDLE_SCENE_TYPES = [
  'benchmark_bars',
  'code_compare',
  'terminal_demo',
  'news_quote_card',
  'big_stat',
  'versus_split',
  'checklist_steps',
  'timeline',
  'social_post',
  'line_chart',
  'countdown_item',
  'myth_fact',
  'source_spotlight',
  'ai_media_clip',
] as const satisfies readonly SceneType[];
export type MiddleSceneType = (typeof MIDDLE_SCENE_TYPES)[number];

/** Layout variants per scene type. The first entry is the default (today's look for legacy types). */
export const SCENE_LAYOUTS = {
  hook_title: ['stacked', 'impact_center', 'stat_hero'],
  benchmark_bars: ['horizontal', 'columns', 'ranked_cards'],
  code_compare: ['stacked', 'diff', 'focus'],
  terminal_demo: ['window', 'retro_fullscreen'],
  news_quote_card: ['card', 'breaking_ticker', 'pull_quote'],
  takeaway_cta: ['card', 'centered'],
  big_stat: ['center', 'split_context'],
  versus_split: ['vertical', 'horizontal'],
  checklist_steps: ['list', 'cards'],
  timeline: ['vertical', 'zigzag'],
  social_post: ['card', 'minimal'],
  line_chart: ['area', 'line'],
  countdown_item: ['giant_number', 'badge_side'],
  myth_fact: ['flip', 'stacked'],
  source_spotlight: ['browser_frame', 'polaroid'],
  ai_media_clip: ['full_bleed', 'framed'],
} as const satisfies Record<SceneType, readonly [string, ...string[]]>;

export type SceneLayoutId<T extends SceneType = SceneType> = (typeof SCENE_LAYOUTS)[T][number];

export function defaultLayoutFor(type: SceneType): string {
  return SCENE_LAYOUTS[type][0];
}

export function isValidLayout(type: SceneType, layout: string | undefined | null): boolean {
  if (!layout) return false;
  return (SCENE_LAYOUTS[type] as readonly string[]).includes(layout);
}

export function resolveLayout(type: SceneType, layout: string | undefined | null): string {
  return isValidLayout(type, layout) ? (layout as string) : defaultLayoutFor(type);
}

export const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  hook_title: 'Hook Title',
  benchmark_bars: 'Benchmark Chart',
  code_compare: 'Code Compare',
  terminal_demo: 'Terminal Demo',
  news_quote_card: 'News Card',
  takeaway_cta: 'Takeaway & CTA',
  big_stat: 'Big Stat',
  versus_split: 'Versus Split',
  checklist_steps: 'Checklist / Steps',
  timeline: 'Timeline',
  social_post: 'Quote Post',
  line_chart: 'Line Chart',
  countdown_item: 'Countdown Item',
  myth_fact: 'Myth vs Fact',
  source_spotlight: 'Source Spotlight',
  ai_media_clip: 'AI B-roll Clip',
};

/** Short labels used for scene timing / caption chips. */
export const SCENE_SHORT_LABELS: Record<SceneType, string> = {
  hook_title: 'Hook',
  benchmark_bars: 'Benchmark',
  code_compare: 'Code',
  terminal_demo: 'Terminal',
  news_quote_card: 'News',
  takeaway_cta: 'Takeaway',
  big_stat: 'Stat',
  versus_split: 'Versus',
  checklist_steps: 'Steps',
  timeline: 'Timeline',
  social_post: 'Quote',
  line_chart: 'Chart',
  countdown_item: 'Countdown',
  myth_fact: 'Myth/Fact',
  source_spotlight: 'Source',
  ai_media_clip: 'B-roll',
};

export const LAYOUT_LABELS: Record<string, string> = {
  stacked: 'Stacked',
  impact_center: 'Impact Center',
  stat_hero: 'Stat Hero',
  horizontal: 'Horizontal',
  columns: 'Columns',
  ranked_cards: 'Ranked Cards',
  diff: 'Unified Diff',
  focus: 'Focus Zoom',
  window: 'Window',
  retro_fullscreen: 'Retro Fullscreen',
  card: 'Card',
  breaking_ticker: 'Breaking Ticker',
  pull_quote: 'Pull Quote',
  centered: 'Centered',
  center: 'Center',
  split_context: 'Split Context',
  vertical: 'Vertical',
  list: 'List',
  cards: 'Cards',
  zigzag: 'Zigzag',
  minimal: 'Minimal',
  area: 'Area',
  line: 'Line',
  giant_number: 'Giant Number',
  badge_side: 'Badge Side',
  flip: 'Flip',
  browser_frame: 'Browser Frame',
  polaroid: 'Polaroid',
  full_bleed: 'Full Bleed',
  framed: 'Framed',
};

export const TRANSITION_LABELS: Record<TransitionId, string> = {
  fade: 'Fade',
  slide_left: 'Slide Left',
  slide_up: 'Slide Up',
  zoom_punch: 'Zoom Punch',
  whip_pan: 'Whip Pan',
  wipe: 'Wipe',
  glitch: 'Glitch',
  iris: 'Iris',
};

export const CAMERA_MOVE_LABELS: Record<CameraMoveId, string> = {
  none: 'Static',
  push_in: 'Push In',
  pull_out: 'Pull Out',
  drift_left: 'Drift Left',
  drift_right: 'Drift Right',
};

export const BACKGROUND_LABELS: Record<BackgroundId, string> = {
  dot_grid: 'Dot Grid',
  mesh_gradient: 'Mesh Gradient',
  blueprint: 'Blueprint',
  scanlines: 'Scanlines',
  aurora: 'Aurora',
  spotlight_noise: 'Spotlight Grain',
};

export const TYPOGRAPHY_LABELS: Record<TypographyId, string> = {
  grotesk: 'Grotesk',
  condensed_caps: 'Condensed Caps',
  editorial_serif: 'Editorial Serif',
  rounded_soft: 'Rounded Soft',
};

export const CAPTION_STYLE_LABELS: Record<CaptionStyleId, string> = {
  glass_box: 'Glass Box',
  bold_pop: 'Bold Pop',
  underline_sweep: 'Underline Sweep',
  karaoke_block: 'Karaoke Block',
};

export const PALETTE_LABELS: Record<PaletteId, string> = {
  pillar: 'Pillar Accent',
  complement: 'Complement Duo',
  mono_neon: 'Mono Neon',
};

export const MUSIC_MOOD_LABELS: Record<MusicMoodId, string> = {
  dark_pad: 'Dark Pad',
  upbeat_pulse: 'Upbeat Pulse',
  lofi_chill: 'Lo-fi Chill',
  tension_build: 'Tension Build',
  bright_synth: 'Bright Synth',
};

export const HOOK_STYLE_LABELS: Record<HookStyleId, string> = {
  question: 'Question',
  bold_claim: 'Bold Claim',
  shocking_number: 'Shocking Number',
  contrarian: 'Contrarian',
  pain_point: 'Pain Point',
  curiosity_gap: 'Curiosity Gap',
};

/** Transition -> SFX used in the FFmpeg mix. */
export const TRANSITION_SFX: Record<TransitionId, SfxId> = {
  fade: 'click',
  slide_left: 'whoosh',
  slide_up: 'whoosh',
  whip_pan: 'whoosh',
  wipe: 'whoosh',
  zoom_punch: 'pop',
  iris: 'pop',
  glitch: 'glitch',
};

/** Default style used when a storyboard has no `style` (legacy reels keep today's look). */
export const DEFAULT_REEL_STYLE = {
  seed: 0,
  background: 'dot_grid',
  typography: 'grotesk',
  captionStyle: 'glass_box',
  palette: 'pillar',
  musicMood: 'dark_pad',
} as const satisfies {
  seed: number;
  background: BackgroundId;
  typography: TypographyId;
  captionStyle: CaptionStyleId;
  palette: PaletteId;
  musicMood: MusicMoodId;
};

export const DEFAULT_TRANSITION: TransitionId = 'fade';
export const DEFAULT_CAMERA_MOVE: CameraMoveId = 'none';
