import { z } from 'zod';
import {
  CONTENT_PILLARS,
  ReelStoryboardSchema,
  type ReelScene,
  type ReelStoryboard,
} from '../schemas/storyboard.js';

/**
 * Flat Gemini-safe JSON Schema (avoids `const` and complex discriminated `anyOf` branches
 * so Gemini structured output compiles reliably across 2.5 and 3.x models).
 */
export const GEMINI_STORYBOARD_JSON_SCHEMA = {
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
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'hook_title',
              'benchmark_bars',
              'code_compare',
              'terminal_demo',
              'news_quote_card',
              'takeaway_cta',
            ],
          },
          narration: { type: 'string' },
          hookTitle: {
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
          benchmarkBars: {
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
          codeCompare: {
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
          terminalDemo: {
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
          newsQuoteCard: {
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
          takeawayCta: {
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
        },
      },
    },
  },
} as const;

const FlatScenePayloadSchema = z.object({
  id: z.string(),
  type: z.enum([
    'hook_title',
    'benchmark_bars',
    'code_compare',
    'terminal_demo',
    'news_quote_card',
    'takeaway_cta',
  ]),
  narration: z.string(),
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
});

const FlatStoryboardPayloadSchema = z.object({
  title: z.string(),
  pillar: z.enum(CONTENT_PILLARS),
  caption: z.string(),
  hashtags: z.array(z.string()),
  scenes: z.array(FlatScenePayloadSchema),
});

const SCENE_WRAPPER_BY_TYPE = {
  hook_title: 'hookTitle',
  benchmark_bars: 'benchmarkBars',
  code_compare: 'codeCompare',
  terminal_demo: 'terminalDemo',
  news_quote_card: 'newsQuoteCard',
  takeaway_cta: 'takeawayCta',
} as const;

const SCENE_SNAKE_TO_CAMEL: Record<string, string> = {
  hook_title: 'hookTitle',
  benchmark_bars: 'benchmarkBars',
  code_compare: 'codeCompare',
  terminal_demo: 'terminalDemo',
  news_quote_card: 'newsQuoteCard',
  takeaway_cta: 'takeawayCta',
};

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
};

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
  const targetWrapper = SCENE_WRAPPER_BY_TYPE[sceneType as keyof typeof SCENE_WRAPPER_BY_TYPE];

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

export function convertFlatGeminiResponseToStoryboard(
  rawJson: unknown,
  sources: Array<{ title: string; url: string }>,
): ReelStoryboard {
  const normalized = normalizeRawStoryboardPayload(rawJson);
  const flat = FlatStoryboardPayloadSchema.parse(normalized);

  const scenes: ReelScene[] = flat.scenes.map((s, idx) => {
    const id = s.id.trim() || `scene-${idx + 1}`;
    switch (s.type) {
      case 'hook_title': {
        if (!s.hookTitle) throw new Error(`Scene ${id} missing hookTitle payload`);
        const rawStat = s.hookTitle.highlightStat?.trim();
        const highlightStat = rawStat
          ? rawStat.length <= 32
            ? rawStat
            : rawStat.slice(0, 32).replace(/\s+\S*$/, '').trim() || rawStat.slice(0, 32)
          : undefined;
        return {
          id,
          type: 'hook_title',
          narration: s.narration,
          ...s.hookTitle,
          highlightStat,
        };
      }
      case 'benchmark_bars': {
        if (!s.benchmarkBars) throw new Error(`Scene ${id} missing benchmarkBars payload`);
        return { id, type: 'benchmark_bars', narration: s.narration, ...s.benchmarkBars };
      }
      case 'code_compare': {
        if (!s.codeCompare) throw new Error(`Scene ${id} missing codeCompare payload`);
        const hasBefore = Boolean(s.codeCompare.beforeCode?.trim());
        const mode =
          s.codeCompare.mode === 'before_after' && !hasBefore ? 'single' : s.codeCompare.mode;
        return {
          id,
          type: 'code_compare',
          narration: s.narration,
          ...s.codeCompare,
          mode,
          beforeCode: hasBefore ? s.codeCompare.beforeCode : undefined,
        };
      }
      case 'terminal_demo': {
        if (!s.terminalDemo) throw new Error(`Scene ${id} missing terminalDemo payload`);
        return { id, type: 'terminal_demo', narration: s.narration, ...s.terminalDemo };
      }
      case 'news_quote_card': {
        if (!s.newsQuoteCard) throw new Error(`Scene ${id} missing newsQuoteCard payload`);
        return { id, type: 'news_quote_card', narration: s.narration, ...s.newsQuoteCard };
      }
      case 'takeaway_cta': {
        if (!s.takeawayCta) throw new Error(`Scene ${id} missing takeawayCta payload`);
        return { id, type: 'takeaway_cta', narration: s.narration, ...s.takeawayCta };
      }
    }
  });

  return ReelStoryboardSchema.parse({
    title: flat.title,
    pillar: flat.pillar,
    caption: flat.caption,
    hashtags: flat.hashtags,
    sources,
    scenes,
  });
}
