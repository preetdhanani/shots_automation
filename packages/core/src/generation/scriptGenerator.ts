import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AppEnv } from '../config/env.js';
import type { TopicRecord } from '../db/store.js';
import {
  appendChannelOutroScene,
  CHANNEL_OUTRO_NARRATION,
  createChannelOutroScene,
  PILLAR_LABELS,
  validateStoryboardEditorial,
  type ContentPillar,
  type ReelStoryboard,
} from '../schemas/storyboard.js';
import type { ReelFingerprint } from '../variety/fingerprint.js';
import {
  HOOK_STYLE_INSTRUCTIONS,
  REEL_FORMATS,
  type ReelFormatSpec,
} from '../variety/formats.js';
import { applyVisualPlan, type ReelVarietyPlan } from '../variety/planner.js';
import {
  HOOK_STYLE_LABELS,
  type HookStyleId,
  type SceneType,
} from '../variety/registry.js';
import { validateVarietyRules } from '../variety/validator.js';
import { createGeminiAbortSignal, withGeminiRetry } from './geminiClient.js';
import {
  buildGeminiStoryboardJsonSchema,
  convertFlatGeminiResponseToStoryboard,
} from './geminiSchema.js';
import type { ResolvedLlmEndpoint } from './llmRegistry.js';
import { callOpenAICompatibleStoryboard } from './openaiCompatibleClient.js';

export { appendChannelOutroScene, CHANNEL_OUTRO_NARRATION, createChannelOutroScene };

export interface GenerateStoryboardInput {
  topic: Pick<TopicRecord, 'title' | 'summary' | 'sourceName' | 'sourceUrl' | 'pillar'>;
  brandHandle: string;
  varietyPlan?: ReelVarietyPlan;
  history?: readonly ReelFingerprint[];
  brollEnabled?: boolean;
  signal?: AbortSignal;
}

const OPEN_AI_SCENE_SHAPES: Record<SceneType, string> = {
  hook_title:
    '"hook_title" -> "hookTitle": { "badge": string, "headline": string (4-8 words), "subheadline": string, "highlightStat"?: string (<= 32 chars) }',
  benchmark_bars:
    '"benchmark_bars" -> "benchmarkBars": { "title": string, "subtitle"?: string, "metricUnit": string, "sourceLabel": string, "bars": [{ "label": string (<=24 chars), "value": number, "isWinner"?: boolean, "note"?: string }] }',
  code_compare:
    '"code_compare" -> "codeCompare": { "title": string, "language": string, "filename": string, "mode": "single" | "before_after" (if "before_after", beforeCode MUST be non-empty), "beforeLabel"?: string, "beforeCode"?: string, "afterLabel"?: string, "afterCode": string, "highlightLines"?: number[] }',
  terminal_demo:
    '"terminal_demo" -> "terminalDemo": { "title": string, "windowTitle": string, "command": string, "outputLines": [{ "text": string (<=52 chars), "tone": "neutral" | "success" | "warn" | "accent" }] }',
  news_quote_card:
    '"news_quote_card" -> "newsQuoteCard": { "sourceLabel": string, "dateLabel": string, "headline": string, "bullets": string[] (2-4 items) }',
  takeaway_cta:
    '"takeaway_cta" -> "takeawayCta": { "badge": string, "headline": string, "takeaway": string, "ctaText": string }',
  big_stat:
    '"big_stat" -> "bigStat": { "value": string (<=12 chars, e.g. "+22%"), "label": string, "context": string, "sourceLabel"?: string, "trend"?: "up" | "down" | "neutral" }',
  versus_split:
    '"versus_split" -> "versusSplit": { "title": string, "left": { "name": string, "points": string[] (2-4, each <=40 chars), "score"?: string }, "right": { "name": string, "points": string[], "score"?: string }, "winner"?: "left" | "right" | "tie", "verdict"?: string }',
  checklist_steps:
    '"checklist_steps" -> "checklistSteps": { "title": string, "mode": "steps" | "checklist", "items": [{ "text": string (<=60 chars), "detail"?: string (<=70 chars) }] (2-5 items) }',
  timeline:
    '"timeline" -> "timeline": { "title": string, "events": [{ "label": string (<=16 chars), "text": string (<=64 chars) }] (2-5 events) }',
  social_post:
    '"social_post" -> "socialPost": { "authorName": string, "authorHandle"?: string, "platform": "x" | "threads" | "bluesky" | "linkedin" | "github" | "hn" | "reddit" | "blog", "postText": string (VERBATIM quote from the topic summary), "contextLabel"?: string }',
  line_chart:
    '"line_chart" -> "lineChart": { "title": string, "metricUnit": string, "sourceLabel": string, "points": [{ "label": string (<=10 chars), "value": number }] (3-8 points, real numbers only), "highlightIndex"?: number }',
  countdown_item:
    '"countdown_item" -> "countdownItem": { "rank": integer (3, then 2, then 1), "title": string (<=48 chars), "detail": string (<=110 chars), "tag"?: string (<=20 chars) }',
  myth_fact:
    '"myth_fact" -> "mythFact": { "myth": string (<=90 chars), "fact": string (<=120 chars), "sourceLabel"?: string }',
  source_spotlight:
    '"source_spotlight" -> "sourceSpotlight": { "headline": string (<=90 chars), "domain": string (<=40 chars), "caption"?: string (<=90 chars) }',
  ai_media_clip:
    '"ai_media_clip" -> "aiMediaClip": { "prompt": string (cinematic 9:16 visual prompt), "captionText": string (<=90 chars), "durationHintSec"?: number }',
};

function buildSystemPrompt(
  formatSpec: ReelFormatSpec | null,
  hookStyle: HookStyleId | null,
  allowedMiddleTypes: readonly SceneType[],
  brollEnabled: boolean,
): string {
  if (!formatSpec) {
    return [
      'You are an elite technical producer creating 35 to 55 second vertical Instagram Reels (9:16) for software engineers and AI builders.',
      'Write crisp, high-signal, zero-fluff English narration and structured visual scenes.',
      'Rules you MUST follow strictly:',
      '1. Output 5 scenes in JSON matching the exact schema.',
      '2. Scene 1 MUST be type "hook_title" with a punchy 4-8 word headline and strong hook narration.',
      '3. Scenes 2-4 MUST use the most informative visual scenes from: "benchmark_bars", "code_compare", "terminal_demo", "news_quote_card".',
      '4. Scene 5 MUST be type "takeaway_cta" with one sharp, actionable developer takeaway for this topic. Do NOT include a generic "follow this channel" sign-off in Scene 5 narration because a dedicated channel outro scene is appended automatically.',
      '5. Spoken narration total across Scenes 1-5 MUST be between 75 and 130 words, with at least 8 words per scene.',
      '6. Every line inside codeCompare.beforeCode and codeCompare.afterCode MUST be <= 36 characters and at most 10 lines total so code stays sharp on mobile screens.',
      '7. Every benchmark bar label MUST be <= 24 characters and use accurate numbers from the topic (never invent fake benchmark scores).',
      '8. Keep caption punchy (2-4 short lines + call to action) and provide 5-8 relevant developer hashtags.',
      '9. Never include stage directions or brackets like [pause] inside narration.',
    ].join('\n');
  }

  const [minScenes, maxScenes] = formatSpec.sceneCount;
  const sceneRangeLabel =
    minScenes === maxScenes ? `exactly ${minScenes}` : `${minScenes} to ${maxScenes}`;

  const lines: string[] = [
    'You are an elite technical producer creating high-retention vertical Instagram Reels (9:16) for software engineers and AI builders.',
    'Write crisp, varied, zero-fluff English narration and structured visual scenes tailored to the assigned format.',
    '',
    `Reel Format: ${formatSpec.id} (${formatSpec.label})`,
    `Format Goal: ${formatSpec.description}`,
  ];

  if (hookStyle) {
    lines.push(
      `Hook Style: ${hookStyle} (${HOOK_STYLE_LABELS[hookStyle]}) - ${HOOK_STYLE_INSTRUCTIONS[hookStyle]}`,
    );
  }

  lines.push(
    '',
    'Format Recipe:',
    ...formatSpec.recipe.map((step) => `- ${step}`),
    '',
    'Rules you MUST follow strictly:',
    `1. Output ${sceneRangeLabel} scenes in JSON matching the exact schema (do NOT add a generic channel outro; it is appended automatically).`,
    '2. Scene 1 MUST be type "hook_title" with a punchy 4-8 word headline and strong hook narration.',
    `3. Middle scenes MUST use ONLY these scene types: ${allowedMiddleTypes.map((t) => `"${t}"`).join(', ')}.`,
  );

  if (formatSpec.requiredTypes.length > 0) {
    lines.push(
      `   - Required middle scene type(s): ${formatSpec.requiredTypes.map((t) => `"${t}"`).join(', ')}.`,
    );
  }
  if (formatSpec.requiredAnyOf && formatSpec.requiredAnyOf.length > 0) {
    lines.push(
      `   - Include at least ONE of: ${formatSpec.requiredAnyOf.map((t) => `"${t}"`).join(', ')}.`,
    );
  }
  if (formatSpec.requireCountdownRanks) {
    lines.push(
      '   - Use 3 "countdown_item" scenes in descending rank order: rank 3, then rank 2, then rank 1.',
    );
  } else {
    lines.push(
      '   - Do NOT repeat the same scene type back-to-back (use at least 2 distinct middle scene types).',
    );
  }
  if (brollEnabled) {
    lines.push('   - You may optionally include at most ONE "ai_media_clip" scene for visual B-roll.');
  }

  lines.push(
    '4. Final scene MUST be type "takeaway_cta" with one sharp, actionable developer takeaway for this topic. Do NOT include a generic "follow this channel" sign-off.',
    '5. Spoken narration total across your scenes MUST be between 75 and 155 words, with at least 8 words per scene.',
    '6. Optionally include "visual": { "emphasis": ["word1", "word2"] } (1-3 short highlight words/numbers that appear in that scene headline/title) to drive kinetic emphasis.',
    '7. Every line inside codeCompare.beforeCode and codeCompare.afterCode MUST be <= 36 characters and at most 10 lines total.',
    '8. For benchmark_bars and line_chart, use accurate numbers from the topic (never invent fake benchmark scores).',
    '9. For social_post, postText MUST be a verbatim quote from the topic summary (do not invent fake posts).',
    '10. Keep caption punchy (2-4 short lines + call to action) and provide 5-8 relevant developer hashtags.',
    '11. Never include stage directions or brackets like [pause] inside narration.',
  );

  return lines.join('\n');
}

function buildOpenAIJsonSchemaGuidance(allowedTypes: readonly SceneType[]): string {
  const middleTypes = allowedTypes.filter((t) => t !== 'hook_title' && t !== 'takeaway_cta');
  const middleLines = middleTypes.map((t) => `      ${OPEN_AI_SCENE_SHAPES[t]}`);
  return [
    'Return ONLY a single valid JSON object (no markdown fences, no prose) with this exact structure:',
    '{',
    '  "title": string (min 6 chars),',
    '  "pillar": "ai_news" | "benchmarks" | "harnesses" | "coding_practices" | "vibe_coding",',
    '  "caption": string,',
    '  "hashtags": string[] (3-10 tags like "#ai"),',
    '  "scenes": [',
    `    { "id": "scene-1", "type": "hook_title", "narration": string, "visual"?: { "emphasis"?: string[] }, ${OPEN_AI_SCENE_SHAPES.hook_title.split(' -> ')[1]} },`,
    '    ... (middle scenes using ONLY these allowed types and wrapper keys):',
    ...middleLines,
    `    { "id": "scene-last", "type": "takeaway_cta", "narration": string, "visual"?: { "emphasis"?: string[] }, ${OPEN_AI_SCENE_SHAPES.takeaway_cta.split(' -> ')[1]} }`,
    '  ]',
    '}',
  ].join('\n');
}

function buildUserPrompt(
  topic: GenerateStoryboardInput['topic'],
  brandHandle: string,
  history: readonly ReelFingerprint[],
  previousErrors?: string[],
): string {
  const parts = [
    `Target Pillar: ${topic.pillar} (${PILLAR_LABELS[topic.pillar as ContentPillar]})`,
    `Source: ${topic.sourceName} (${topic.sourceUrl})`,
    `Brand Handle (for CTA context only): ${brandHandle}`,
    `Topic Title: ${topic.title}`,
    `Topic Summary & Facts:\n${topic.summary}`,
  ];

  const completedHooks = history
    .filter((h) => !h.isGenerating && h.hookHeadline)
    .slice(0, 8);
  if (completedHooks.length > 0) {
    const hookLines = completedHooks.map(
      (h) => `- "${h.hookHeadline}" (opened with: "${h.openingWords}")`,
    );
    parts.push(
      `Recently used hooks - do NOT reuse their wording, angle, or opening 3 words:\n${hookLines.join('\n')}`,
    );
  }

  if (previousErrors && previousErrors.length > 0) {
    parts.push(
      `Your previous JSON failed these validation rules. Fix ALL of them strictly:\n- ${previousErrors.join('\n- ')}`,
    );
  }
  return parts.join('\n\n');
}

async function callGeminiStoryboardOnce(
  ai: GoogleGenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  temperature: number,
  useThinking: boolean,
  signal?: AbortSignal,
): Promise<unknown> {
  return withGeminiRetry(
    async () => {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          abortSignal: createGeminiAbortSignal(signal, 120_000),
          systemInstruction: systemPrompt,
          temperature,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          ...(useThinking
            ? {
                thinkingConfig: {
                  thinkingLevel: ThinkingLevel.LOW,
                },
              }
            : {}),
        },
      });
      const text = response.text?.trim();
      if (!text) {
        throw new Error('Gemini returned empty storyboard response.');
      }
      return JSON.parse(text) as unknown;
    },
    { signal },
  );
}

async function callGeminiStoryboardWithThinkingFallback(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  temperature: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey });
  try {
    return await callGeminiStoryboardOnce(
      ai,
      model,
      systemPrompt,
      userPrompt,
      jsonSchema,
      temperature,
      true,
      signal,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('thinking')) {
      return await callGeminiStoryboardOnce(
        ai,
        model,
        systemPrompt,
        userPrompt,
        jsonSchema,
        temperature,
        false,
        signal,
      );
    }
    throw err;
  }
}

export async function generateStoryboard(
  env: AppEnv,
  endpoint: ResolvedLlmEndpoint,
  input: GenerateStoryboardInput,
): Promise<ReelStoryboard> {
  if (endpoint.provider === 'gemini') {
    if (!env.GEMINI_API_KEY.trim()) {
      throw new Error('GEMINI_API_KEY is missing in .env.');
    }
  } else {
    if (!endpoint.baseUrl.trim() || !endpoint.model.trim()) {
      throw new Error(
        `OpenAI-compatible endpoint "${endpoint.name}" is missing a Base URL or Model ID.`,
      );
    }
  }

  const brollEnabled = Boolean(input.brollEnabled);
  const varietyPlan = input.varietyPlan ?? null;
  const formatSpec = varietyPlan ? REEL_FORMATS[varietyPlan.format] : null;
  const history = input.history ?? [];

  const allowedMiddleTypes: SceneType[] = formatSpec
    ? [
        ...formatSpec.allowedTypes,
        ...(brollEnabled ? (['ai_media_clip'] as const) : []),
      ]
    : ['benchmark_bars', 'code_compare', 'terminal_demo', 'news_quote_card'];

  const allowedAllTypes: SceneType[] = ['hook_title', ...allowedMiddleTypes, 'takeaway_cta'];
  const dynamicSchema = buildGeminiStoryboardJsonSchema(allowedAllTypes);
  const temperature = varietyPlan ? 0.85 : 0.45;
  const maxAttempts = varietyPlan ? 3 : 2;

  const baseSystemPrompt = buildSystemPrompt(
    formatSpec,
    varietyPlan?.hookStyle ?? null,
    allowedMiddleTypes,
    brollEnabled,
  );
  const systemPrompt =
    endpoint.provider === 'openai_compatible'
      ? `${baseSystemPrompt}\n\n${buildOpenAIJsonSchemaGuidance(allowedAllTypes)}`
      : baseSystemPrompt;

  const sources = [{ title: input.topic.sourceName || 'Source', url: input.topic.sourceUrl }];
  const topicText = `${input.topic.title}\n${input.topic.summary}`;

  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userPrompt = buildUserPrompt(input.topic, input.brandHandle, history, lastErrors);

    const rawJson =
      endpoint.provider === 'gemini'
        ? await callGeminiStoryboardWithThinkingFallback(
            env.GEMINI_API_KEY,
            endpoint.model || env.GEMINI_TEXT_MODEL,
            systemPrompt,
            userPrompt,
            dynamicSchema,
            temperature,
            input.signal,
          )
        : await callOpenAICompatibleStoryboard({
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            apiKey: endpoint.apiKey,
            systemPrompt,
            userPrompt,
            jsonSchema: dynamicSchema,
            temperature,
            signal: input.signal,
          });

    try {
      const converted = convertFlatGeminiResponseToStoryboard(rawJson, sources);
      const withOutro = appendChannelOutroScene(converted);
      const editorial = validateStoryboardEditorial(withOutro, {
        allowAiMediaClip: brollEnabled,
      });

      const combinedErrors = [...editorial.errors];
      if (formatSpec) {
        const variety = validateVarietyRules(withOutro, {
          formatSpec,
          history,
          topicText,
          brollEnabled,
        });
        combinedErrors.push(...variety.errors);
      }

      if (combinedErrors.length === 0) {
        if (varietyPlan) {
          const styled = applyVisualPlan(
            {
              ...withOutro,
              format: varietyPlan.format,
              hookStyle: varietyPlan.hookStyle,
            },
            {
              style: varietyPlan.style,
              format: varietyPlan.format,
              history,
              seed: varietyPlan.style.seed,
              preserveExisting: false,
            },
          );
          return styled;
        }
        return withOutro;
      }
      lastErrors = combinedErrors;
    } catch (err) {
      lastErrors = [err instanceof Error ? err.message : String(err)];
    }
  }

  throw new Error(`Storyboard failed quality checks after retry: ${lastErrors.join('; ')}`);
}

export async function generateStoryboardWithGemini(
  env: AppEnv,
  input: GenerateStoryboardInput,
): Promise<ReelStoryboard> {
  return generateStoryboard(
    env,
    {
      id: 'gemini',
      name: 'Google Gemini',
      provider: 'gemini',
      source: 'builtin',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: env.GEMINI_TEXT_MODEL,
      apiKey: env.GEMINI_API_KEY,
      hasApiKey: Boolean(env.GEMINI_API_KEY.trim()),
      apiKeyHint: null,
      configured: Boolean(env.GEMINI_API_KEY.trim()),
      editable: false,
      createdAt: null,
      updatedAt: null,
    },
    input,
  );
}
