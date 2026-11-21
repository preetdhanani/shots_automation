import { z } from 'zod';
import {
  CONTENT_PILLARS,
  HookStyleIdSchema,
  ReelStoryboardSchema,
  sanitizeHashtags,
  type ReelScene,
  type ReelStoryboard,
  type SceneVisual,
} from '../schemas/storyboard.js';
import { repairSceneEmphasis } from '../variety/emphasis.js';
import {
  CAMERA_MOVE_IDS,
  SCENE_TYPES,
  TRANSITION_IDS,
  isValidLayout,
  type CameraMoveId,
  type SceneType,
  type TransitionId,
} from '../variety/registry.js';

const SCENE_WRAPPER_BY_TYPE: Record<SceneType, string> = {
  hook_title: 'hookTitle',
  benchmark_bars: 'benchmarkBars',
  code_compare: 'codeCompare',
  terminal_demo: 'terminalDemo',
  news_quote_card: 'newsQuoteCard',
  takeaway_cta: 'takeawayCta',
  big_stat: 'bigStat',
  versus_split: 'versusSplit',
  checklist_steps: 'checklistSteps',
  timeline: 'timeline',
  social_post: 'socialPost',
  line_chart: 'lineChart',
  countdown_item: 'countdownItem',
  myth_fact: 'mythFact',
  source_spotlight: 'sourceSpotlight',
  ai_media_clip: 'aiMediaClip',
};

const SCENE_SNAKE_TO_CAMEL: Record<string, string> = { ...SCENE_WRAPPER_BY_TYPE };

const SCENE_DIRECT_FIELDS: Record<string, readonly string[]> = {
  hookTitle: ['badge', 'headline', 'subheadline', 'highlightStat'],
  benchmarkBars: ['title', 'subtitle', 'metricUnit', 'sourceLabel', 'bars'],
  codeCompare: [
    'title',
    'language',
    'filename',
    'mode',
    'beforeLabel',
    'beforeCode',
    'afterLabel',
    'afterCode',
    'highlightLines',
  ],
  terminalDemo: ['title', 'windowTitle', 'command', 'outputLines'],
  newsQuoteCard: ['sourceLabel', 'dateLabel', 'headline', 'bullets'],
  takeawayCta: ['badge', 'headline', 'takeaway', 'ctaText'],
  bigStat: ['value', 'label', 'context', 'sourceLabel', 'trend'],
  versusSplit: ['title', 'left', 'right', 'winner', 'verdict'],
  checklistSteps: ['title', 'mode', 'items'],
  timeline: ['title', 'events'],
  socialPost: ['authorName', 'authorHandle', 'platform', 'postText', 'contextLabel'],
  lineChart: ['title', 'metricUnit', 'sourceLabel', 'points', 'highlightIndex'],
  countdownItem: ['rank', 'title', 'detail', 'tag'],
  mythFact: ['myth', 'fact', 'sourceLabel'],
  sourceSpotlight: ['headline', 'domain', 'caption'],
  aiMediaClip: ['prompt', 'captionText', 'durationHintSec'],
};

const WRAPPER_JSON_SCHEMAS: Record<SceneType, Record<string, unknown>> = {
  hook_title: {
    type: 'object',
    additionalProperties: false,
    required: ['badge', 'headline', 'subheadline'],
    properties: {
      badge: { type: 'string' },
      headline: { type: 'string' },
      subheadline: { type: 'string' },
      highlightStat: { type: 'string' },
    },
  },
  benchmark_bars: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'metricUnit', 'sourceLabel', 'bars'],
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      metricUnit: { type: 'string' },
      sourceLabel: { type: 'string' },
      bars: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'value'],
          properties: {
            label: { type: 'string' },
            value: { type: 'number' },
            isWinner: { type: 'boolean' },
            note: { type: 'string' },
          },
        },
      },
    },
  },
  code_compare: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'language', 'filename', 'mode', 'afterCode'],
    properties: {
      title: { type: 'string' },
      language: { type: 'string' },
      filename: { type: 'string' },
      mode: { type: 'string', enum: ['single', 'before_after'] },
      beforeLabel: { type: 'string' },
      beforeCode: { type: 'string' },
      afterLabel: { type: 'string' },
      afterCode: { type: 'string' },
      highlightLines: {
        type: 'array',
        items: { type: 'integer' },
      },
    },
  },
  terminal_demo: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'windowTitle', 'command', 'outputLines'],
    properties: {
      title: { type: 'string' },
      windowTitle: { type: 'string' },
      command: { type: 'string' },
      outputLines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'tone'],
          properties: {
            text: { type: 'string' },
            tone: { type: 'string', enum: ['neutral', 'success', 'warn', 'accent'] },
          },
        },
      },
    },
  },
  news_quote_card: {
    type: 'object',
    additionalProperties: false,
    required: ['sourceLabel', 'dateLabel', 'headline', 'bullets'],
    properties: {
      sourceLabel: { type: 'string' },
      dateLabel: { type: 'string' },
      headline: { type: 'string' },
      bullets: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
  takeaway_cta: {
    type: 'object',
    additionalProperties: false,
    required: ['badge', 'headline', 'takeaway', 'ctaText'],
    properties: {
      badge: { type: 'string' },
      headline: { type: 'string' },
      takeaway: { type: 'string' },
      ctaText: { type: 'string' },
    },
  },
  big_stat: {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'label', 'context'],
    properties: {
      value: { type: 'string' },
      label: { type: 'string' },
      context: { type: 'string' },
      sourceLabel: { type: 'string' },
      trend: { type: 'string', enum: ['up', 'down', 'neutral'] },
    },
  },
  versus_split: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'left', 'right'],
    properties: {
      title: { type: 'string' },
      left: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'points'],
        properties: {
          name: { type: 'string' },
          points: { type: 'array', items: { type: 'string' } },
          score: { type: 'string' },
        },
      },
      right: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'points'],
        properties: {
          name: { type: 'string' },
          points: { type: 'array', items: { type: 'string' } },
          score: { type: 'string' },
        },
      },
      winner: { type: 'string', enum: ['left', 'right', 'tie'] },
      verdict: { type: 'string' },
    },
  },
  checklist_steps: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'mode', 'items'],
    properties: {
      title: { type: 'string' },
      mode: { type: 'string', enum: ['steps', 'checklist'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text'],
          properties: {
            text: { type: 'string' },
            detail: { type: 'string' },
          },
        },
      },
    },
  },
  timeline: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'events'],
    properties: {
      title: { type: 'string' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'text'],
          properties: {
            label: { type: 'string' },
            text: { type: 'string' },
          },
        },
      },
    },
  },
  social_post: {
    type: 'object',
    additionalProperties: false,
    required: ['authorName', 'platform', 'postText'],
    properties: {
      authorName: { type: 'string' },
      authorHandle: { type: 'string' },
      platform: {
        type: 'string',
        enum: ['x', 'threads', 'bluesky', 'linkedin', 'github', 'hn', 'reddit', 'blog'],
      },
      postText: { type: 'string' },
      contextLabel: { type: 'string' },
    },
  },
  line_chart: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'metricUnit', 'sourceLabel', 'points'],
    properties: {
      title: { type: 'string' },
      metricUnit: { type: 'string' },
      sourceLabel: { type: 'string' },
      points: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'value'],
          properties: {
            label: { type: 'string' },
            value: { type: 'number' },
          },
        },
      },
      highlightIndex: { type: 'integer' },
    },
  },
  countdown_item: {
    type: 'object',
    additionalProperties: false,
    required: ['rank', 'title', 'detail'],
    properties: {
      rank: { type: 'integer' },
      title: { type: 'string' },
      detail: { type: 'string' },
      tag: { type: 'string' },
    },
  },
  myth_fact: {
    type: 'object',
    additionalProperties: false,
    required: ['myth', 'fact'],
    properties: {
      myth: { type: 'string' },
      fact: { type: 'string' },
      sourceLabel: { type: 'string' },
    },
  },
  source_spotlight: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'domain'],
    properties: {
      headline: { type: 'string' },
      domain: { type: 'string' },
      caption: { type: 'string' },
    },
  },
  ai_media_clip: {
    type: 'object',
    additionalProperties: false,
    required: ['prompt', 'captionText'],
    properties: {
      prompt: { type: 'string' },
      captionText: { type: 'string' },
      durationHintSec: { type: 'number' },
    },
  },
};

const LEGACY_SCENE_TYPES: readonly SceneType[] = [
  'hook_title',
  'benchmark_bars',
  'code_compare',
  'terminal_demo',
  'news_quote_card',
  'takeaway_cta',
];

/**
 * Builds a compact Gemini-safe JSON Schema containing ONLY the allowed scene
 * wrappers for the planned format (avoids CFG state-limit errors and enforces
 * allowed types at decode time).
 */
export function buildGeminiStoryboardJsonSchema(
  allowedSceneTypes: readonly SceneType[] = LEGACY_SCENE_TYPES,
): Record<string, unknown> {
  const uniqueTypes = Array.from(new Set<SceneType>(allowedSceneTypes));
  const sceneProperties: Record<string, unknown> = {
    id: { type: 'string' },
    type: {
      type: 'string',
      enum: uniqueTypes,
    },
    narration: { type: 'string' },
    visual: {
      type: 'object',
      additionalProperties: false,
      properties: {
        emphasis: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  };

  for (const sceneType of uniqueTypes) {
    const wrapperKey = SCENE_WRAPPER_BY_TYPE[sceneType];
    sceneProperties[wrapperKey] = WRAPPER_JSON_SCHEMAS[sceneType];
  }

  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'pillar', 'caption', 'hashtags', 'scenes'],
    properties: {
      title: { type: 'string' },
      pillar: {
        type: 'string',
        enum: [...CONTENT_PILLARS],
      },
      caption: { type: 'string' },
      hashtags: {
        type: 'array',
        items: { type: 'string' },
      },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'type', 'narration'],
          properties: sceneProperties,
        },
      },
    },
  };
}

/**
 * Default flat Gemini-safe JSON Schema (avoids `const` and complex discriminated
 * `anyOf` branches so Gemini structured output compiles reliably across 2.5 and 3.x models).
 */
export const GEMINI_STORYBOARD_JSON_SCHEMA = buildGeminiStoryboardJsonSchema(LEGACY_SCENE_TYPES);

const FlatVisualPayloadSchema = z
  .object({
    layout: z.string().optional(),
    transition: z.string().optional(),
    camera: z.string().optional(),
    emphasis: z.array(z.string()).optional(),
  })
  .optional();

const FlatScenePayloadSchema = z.object({
  id: z.string(),
  type: z.enum(SCENE_TYPES),
  narration: z.string(),
  visual: FlatVisualPayloadSchema,
  hookTitle: z
    .object({
      badge: z.string(),
      headline: z.string(),
      subheadline: z.string(),
      highlightStat: z.string().optional(),
    })
    .optional(),
  benchmarkBars: z
    .object({
      title: z.string(),
      subtitle: z.string().optional(),
      metricUnit: z.string(),
      sourceLabel: z.string(),
      bars: z.array(
        z.object({
          label: z.string(),
          value: z.number(),
          isWinner: z.boolean().optional(),
          note: z.string().optional(),
        }),
      ),
    })
    .optional(),
  codeCompare: z
    .object({
      title: z.string(),
      language: z.string(),
      filename: z.string(),
      mode: z.enum(['single', 'before_after']),
      beforeLabel: z.string().optional(),
      beforeCode: z.string().optional(),
      afterLabel: z.string().optional(),
      afterCode: z.string(),
      highlightLines: z.array(z.number().int()).optional(),
    })
    .optional(),
  terminalDemo: z
    .object({
      title: z.string(),
      windowTitle: z.string(),
      command: z.string(),
      outputLines: z.array(
        z.object({
          text: z.string(),
          tone: z.enum(['neutral', 'success', 'warn', 'accent']),
        }),
      ),
    })
    .optional(),
  newsQuoteCard: z
    .object({
      sourceLabel: z.string(),
      dateLabel: z.string(),
      headline: z.string(),
      bullets: z.array(z.string()),
    })
    .optional(),
  takeawayCta: z
    .object({
      badge: z.string(),
      headline: z.string(),
      takeaway: z.string(),
      ctaText: z.string(),
    })
    .optional(),
  bigStat: z
    .object({
      value: z.string(),
      label: z.string(),
      context: z.string(),
      sourceLabel: z.string().optional(),
      trend: z.enum(['up', 'down', 'neutral']).optional(),
    })
    .optional(),
  versusSplit: z
    .object({
      title: z.string(),
      left: z.object({
        name: z.string(),
        points: z.array(z.string()),
        score: z.string().optional(),
      }),
      right: z.object({
        name: z.string(),
        points: z.array(z.string()),
        score: z.string().optional(),
      }),
      winner: z.enum(['left', 'right', 'tie']).optional(),
      verdict: z.string().optional(),
    })
    .optional(),
  checklistSteps: z
    .object({
      title: z.string(),
      mode: z.enum(['steps', 'checklist']),
      items: z.array(
        z.object({
          text: z.string(),
          detail: z.string().optional(),
        }),
      ),
    })
    .optional(),
  timeline: z
    .object({
      title: z.string(),
      events: z.array(
        z.object({
          label: z.string(),
          text: z.string(),
        }),
      ),
    })
    .optional(),
  socialPost: z
    .object({
      authorName: z.string(),
      authorHandle: z.string().optional(),
      platform: z.enum(['x', 'threads', 'bluesky', 'linkedin', 'github', 'hn', 'reddit', 'blog']),
      postText: z.string(),
      contextLabel: z.string().optional(),
    })
    .optional(),
  lineChart: z
    .object({
      title: z.string(),
      metricUnit: z.string(),
      sourceLabel: z.string(),
      points: z.array(
        z.object({
          label: z.string(),
          value: z.number(),
        }),
      ),
      highlightIndex: z.number().int().optional(),
    })
    .optional(),
  countdownItem: z
    .object({
      rank: z.number().int(),
      title: z.string(),
      detail: z.string(),
      tag: z.string().optional(),
    })
    .optional(),
  mythFact: z
    .object({
      myth: z.string(),
      fact: z.string(),
      sourceLabel: z.string().optional(),
    })
    .optional(),
  sourceSpotlight: z
    .object({
      headline: z.string(),
      domain: z.string(),
      caption: z.string().optional(),
    })
    .optional(),
  aiMediaClip: z
    .object({
      prompt: z.string(),
      captionText: z.string(),
      durationHintSec: z.number().optional(),
    })
    .optional(),
});

const FlatStoryboardPayloadSchema = z.object({
  title: z.string(),
  pillar: z.enum(CONTENT_PILLARS),
  hookStyle: z.string().optional(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  scenes: z.array(FlatScenePayloadSchema),
});

function stripNullFieldsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripNullFieldsDeep(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== null && val !== undefined) {
        out[key] = stripNullFieldsDeep(val);
      }
    }
    return out;
  }
  return value;
}

function normalizeSceneRecord(rawScene: unknown): unknown {
  if (!rawScene || typeof rawScene !== 'object' || Array.isArray(rawScene)) {
    return rawScene;
  }
  const scene = { ...(rawScene as Record<string, unknown>) };

  if (typeof scene.id === 'number') {
    scene.id = String(scene.id);
  }

  for (const [snakeKey, camelKey] of Object.entries(SCENE_SNAKE_TO_CAMEL)) {
    if (scene[camelKey] === undefined && scene[snakeKey] !== undefined) {
      scene[camelKey] = scene[snakeKey];
      delete scene[snakeKey];
    }
  }

  const sceneType = typeof scene.type === 'string' ? scene.type : '';
  const targetWrapper = SCENE_WRAPPER_BY_TYPE[sceneType as SceneType];

  if (targetWrapper && scene[targetWrapper] === undefined) {
    const allowedKeys = SCENE_DIRECT_FIELDS[targetWrapper] ?? [];
    const lifted: Record<string, unknown> = {};
    let pickedCount = 0;
    for (const field of allowedKeys) {
      if (scene[field] !== undefined) {
        lifted[field] = scene[field];
        pickedCount++;
      }
    }
    if (pickedCount > 0) {
      return {
        id: scene.id,
        type: scene.type,
        narration: scene.narration,
        ...(scene.visual !== undefined ? { visual: scene.visual } : {}),
        [targetWrapper]: lifted,
      };
    }
  }

  return scene;
}

export function normalizeRawStoryboardPayload(rawJson: unknown): unknown {
  const cleaned = stripNullFieldsDeep(rawJson);
  if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
    return cleaned;
  }
  const obj = { ...(cleaned as Record<string, unknown>) };
  if (Array.isArray(obj.scenes)) {
    obj.scenes = obj.scenes.map((scene) => normalizeSceneRecord(scene));
  }
  return obj;
}

function sanitizeSceneVisual(
  sceneType: SceneType,
  raw: z.infer<typeof FlatVisualPayloadSchema>,
): SceneVisual | undefined {
  if (!raw) return undefined;
  const out: SceneVisual = {};

  if (raw.layout && isValidLayout(sceneType, raw.layout.trim())) {
    out.layout = raw.layout.trim();
  }
  if (raw.transition && (TRANSITION_IDS as readonly string[]).includes(raw.transition.trim())) {
    out.transition = raw.transition.trim() as TransitionId;
  }
  if (raw.camera && (CAMERA_MOVE_IDS as readonly string[]).includes(raw.camera.trim())) {
    out.camera = raw.camera.trim() as CameraMoveId;
  }
  if (Array.isArray(raw.emphasis)) {
    const cleaned = raw.emphasis
      .map((w) => w.trim().slice(0, 24))
      .filter((w) => w.length > 0)
      .slice(0, 4);
    if (cleaned.length > 0) {
      out.emphasis = cleaned;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function clampString(val: string | undefined, max: number): string | undefined {
  const trimmed = val?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).replace(/\s+\S*$/, '').trim() || trimmed.slice(0, max);
}

function normalizeNarrationDashes(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]+\s*/g, ', ')
    .replace(/([,;:.?!])\s*,\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finalizeConvertedScene(scene: ReelScene): ReelScene {
  const repairedEmphasis = repairSceneEmphasis(scene);
  if (!repairedEmphasis) {
    return scene;
  }
  return {
    ...scene,
    visual: {
      ...(scene.visual ?? {}),
      emphasis: repairedEmphasis,
    },
  };
}

export function convertFlatGeminiResponseToStoryboard(
  rawJson: unknown,
  sources: Array<{ title: string; url: string }>,
): ReelStoryboard {
  const normalized = normalizeRawStoryboardPayload(rawJson);
  const flat = FlatStoryboardPayloadSchema.parse(normalized);

  const scenes: ReelScene[] = flat.scenes.map((s, idx) => {
    const id = s.id.trim() || `scene-${idx + 1}`;
    const visual = sanitizeSceneVisual(s.type, s.visual);
    const base = {
      id,
      narration: normalizeNarrationDashes(s.narration),
      ...(visual ? { visual } : {}),
    };

    switch (s.type) {
      case 'hook_title': {
        if (!s.hookTitle) throw new Error(`Scene ${id} missing hookTitle payload`);
        return finalizeConvertedScene({
          ...base,
          type: 'hook_title',
          ...s.hookTitle,
          highlightStat: clampString(s.hookTitle.highlightStat, 48),
        });
      }
      case 'benchmark_bars': {
        if (!s.benchmarkBars) throw new Error(`Scene ${id} missing benchmarkBars payload`);
        return finalizeConvertedScene({ ...base, type: 'benchmark_bars', ...s.benchmarkBars });
      }
      case 'code_compare': {
        if (!s.codeCompare) throw new Error(`Scene ${id} missing codeCompare payload`);
        const hasBefore = Boolean(s.codeCompare.beforeCode?.trim());
        const mode =
          s.codeCompare.mode === 'before_after' && !hasBefore ? 'single' : s.codeCompare.mode;
        return finalizeConvertedScene({
          ...base,
          type: 'code_compare',
          ...s.codeCompare,
          mode,
          beforeCode: hasBefore ? s.codeCompare.beforeCode : undefined,
        });
      }
      case 'terminal_demo': {
        if (!s.terminalDemo) throw new Error(`Scene ${id} missing terminalDemo payload`);
        return finalizeConvertedScene({ ...base, type: 'terminal_demo', ...s.terminalDemo });
      }
      case 'news_quote_card': {
        if (!s.newsQuoteCard) throw new Error(`Scene ${id} missing newsQuoteCard payload`);
        return finalizeConvertedScene({ ...base, type: 'news_quote_card', ...s.newsQuoteCard });
      }
      case 'takeaway_cta': {
        if (!s.takeawayCta) throw new Error(`Scene ${id} missing takeawayCta payload`);
        return finalizeConvertedScene({ ...base, type: 'takeaway_cta', ...s.takeawayCta });
      }
      case 'big_stat': {
        if (!s.bigStat) throw new Error(`Scene ${id} missing bigStat payload`);
        return finalizeConvertedScene({ ...base, type: 'big_stat', ...s.bigStat });
      }
      case 'versus_split': {
        if (!s.versusSplit) throw new Error(`Scene ${id} missing versusSplit payload`);
        return finalizeConvertedScene({ ...base, type: 'versus_split', ...s.versusSplit });
      }
      case 'checklist_steps': {
        if (!s.checklistSteps) throw new Error(`Scene ${id} missing checklistSteps payload`);
        return finalizeConvertedScene({ ...base, type: 'checklist_steps', ...s.checklistSteps });
      }
      case 'timeline': {
        if (!s.timeline) throw new Error(`Scene ${id} missing timeline payload`);
        return finalizeConvertedScene({ ...base, type: 'timeline', ...s.timeline });
      }
      case 'social_post': {
        if (!s.socialPost) throw new Error(`Scene ${id} missing socialPost payload`);
        return finalizeConvertedScene({ ...base, type: 'social_post', ...s.socialPost });
      }
      case 'line_chart': {
        if (!s.lineChart) throw new Error(`Scene ${id} missing lineChart payload`);
        return finalizeConvertedScene({ ...base, type: 'line_chart', ...s.lineChart });
      }
      case 'countdown_item': {
        if (!s.countdownItem) throw new Error(`Scene ${id} missing countdownItem payload`);
        return finalizeConvertedScene({ ...base, type: 'countdown_item', ...s.countdownItem });
      }
      case 'myth_fact': {
        if (!s.mythFact) throw new Error(`Scene ${id} missing mythFact payload`);
        return finalizeConvertedScene({ ...base, type: 'myth_fact', ...s.mythFact });
      }
      case 'source_spotlight': {
        if (!s.sourceSpotlight) throw new Error(`Scene ${id} missing sourceSpotlight payload`);
        return finalizeConvertedScene({ ...base, type: 'source_spotlight', ...s.sourceSpotlight });
      }
      case 'ai_media_clip': {
        if (!s.aiMediaClip) throw new Error(`Scene ${id} missing aiMediaClip payload`);
        return finalizeConvertedScene({ ...base, type: 'ai_media_clip', ...s.aiMediaClip });
      }
    }
  });

  const parsedHookStyle = flat.hookStyle
    ? HookStyleIdSchema.safeParse(flat.hookStyle).data
    : undefined;

  const cleanedTags = sanitizeHashtags(flat.hashtags, { maxTags: 5 });
  const hashtags = cleanedTags.length >= 3 ? cleanedTags : flat.hashtags;

  return ReelStoryboardSchema.parse({
    title: flat.title,
    pillar: flat.pillar,
    ...(parsedHookStyle ? { hookStyle: parsedHookStyle } : {}),
    caption: flat.caption.replace(/\s*[\u2014\u2013]+\s*/g, ' - ').trim(),
    hashtags,
    sources,
    scenes,
  });
}

/**
 * Inverse converter from a canonical `ReelStoryboard` back into the flat LLM
 * JSON payload shape (used by round-trip unit tests and the E2E mock LLM).
 */
export function toFlatStoryboardPayload(storyboard: ReelStoryboard): Record<string, unknown> {
  return {
    title: storyboard.title,
    pillar: storyboard.pillar,
    ...(storyboard.hookStyle ? { hookStyle: storyboard.hookStyle } : {}),
    caption: storyboard.caption,
    hashtags: storyboard.hashtags,
    scenes: storyboard.scenes.map((scene) => {
      const { id, type, narration, visual, ...rest } = scene;
      const wrapperKey = SCENE_WRAPPER_BY_TYPE[type];
      // Strip pipeline-assigned asset refs so the payload looks like LLM output
      const payloadCopy = { ...(rest as Record<string, unknown>) };
      delete payloadCopy.imageAsset;
      delete payloadCopy.videoAsset;

      return {
        id,
        type,
        narration,
        ...(visual ? { visual } : {}),
        [wrapperKey]: payloadCopy,
      };
    }),
  };
}
