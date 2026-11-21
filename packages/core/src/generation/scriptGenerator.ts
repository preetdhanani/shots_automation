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
    '"hook_title" -> "hookTitle": { "badge": string, "headline": string (4-8 words), "subheadline": string, "highlightStat"?: string (<= 48 chars, must include comparison e.g. "Neon 61 vs Carbon 60 · $3/M") }',
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
  const dataFirstOpeners = (['benchmark_bars', 'versus_split', 'big_stat', 'code_compare', 'myth_fact'] as const).filter(
    (t) => allowedMiddleTypes.includes(t),
  );
  const openerNote =
    dataFirstOpeners.length > 0
      ? `Scene 1 may be either ${dataFirstOpeners.map((t) => `"${t}"`).join(', ')} (lead directly with visual receipts in Second 1!) OR "hook_title" with a comparison highlightStat.`
      : 'Scene 1 MUST be type "hook_title" with a punchy 4-8 word headline and concrete comparison highlightStat.';

  if (!formatSpec) {
    return [
      'You are a sharp technical video creator making tight 20 to 28 second vertical Reels (9:16) for software engineers and AI builders.',
      'Write crisp, conversational English like a senior engineer texting a teammate - dense reference facts, zero hype.',
      'Rules you MUST follow strictly:',
      '1. Output 5 scenes in JSON matching the exact schema. Do NOT add a channel outro or "follow this channel" sign-off because a dedicated channel outro scene is appended automatically.',
      `2. ${openerNote}`,
      '3. Middle scenes MUST use the highest-signal visual scenes from: "benchmark_bars", "code_compare", "terminal_demo", "news_quote_card".',
      '4. Focus on ONE story and ONE sharp angle. If the source mentions unrelated secondary news (e.g. an IPO or M&A deal), drop the side story completely.',
      '5. Never show an isolated score (like "61") without showing what it beats, the baseline/flagship leader, or the $/M token cost difference.',
      '6. Final scene MUST be type "takeaway_cta" ending on a sharp engineering rule, actionable check, or developer question (ctaText <= 46 chars, written as a concrete technical check or question, NEVER "Follow this channel").',
      '7. Total spoken narration across all scenes MUST be tight: 50 to 90 words total (8 to 16 words per scene, 1 crisp claim per scene so visuals cut every 2.5-4s).',
      '8. Ban AI-slop filler: NEVER write "Same day, two massive signals", "the whole conversation changes", "colliding within 24 hours", "here is your move", "game-changer", or "let\'s dive in".',
      '9. Every line inside codeCompare.beforeCode and codeCompare.afterCode MUST be genuine runnable syntax, config (JSON/YAML), git diff, or real CLI commands (NEVER plain English prose sentences), <= 36 characters wide and at most 10 lines total (<= 16 combined lines in before_after).',
      '10. Include "visual": { "emphasis": ["word1", "word2"] } copying 1-2 exact words verbatim from that scene headline/title/label/fact/postText (never from narration).',
      '11. Every benchmark bar label MUST be <= 24 characters and use verified numbers from the topic (never invent fake benchmark scores).',
      '12. Structure the Instagram caption for saves & debate: Line 1 crisp hook summary; middle 3 short "- " mini-cheatsheet takeaways; final line 1 sharp developer debate question (NEVER spammy "Comment KEYWORD", "DM me", "Link in bio", or "Follow @..."). Provide 3-5 clean, accurately spelled lowercase developer hashtags.',
      '13. Never include stage directions, brackets like [pause], or em-dashes inside narration or captions; use commas or periods instead.',
    ].join('\n');
  }

  const [minScenes, maxScenes] = formatSpec.sceneCount;
  const sceneRangeLabel =
    minScenes === maxScenes ? `exactly ${minScenes}` : `${minScenes} to ${maxScenes}`;

  const lines: string[] = [
    'You are a sharp technical video creator making tight 20 to 28 second vertical Reels (9:16) for software engineers and AI builders.',
    'Write crisp, conversational English like a senior engineer texting a teammate - dense reference data, zero AI hype.',
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
    `1. Output ${sceneRangeLabel} scenes in JSON matching the exact schema. Do NOT add a channel outro or "follow this channel" sign-off because a dedicated channel outro scene is appended automatically.`,
    `2. ${openerNote}`,
    `3. Body scenes (before takeaway_cta) MUST use ONLY these scene types: ${allowedMiddleTypes.map((t) => `"${t}"`).join(', ')} (plus "hook_title" if used in Scene 1).`,
  );

  if (formatSpec.requiredTypes.length > 0) {
    lines.push(
      `   - Required visual scene type(s): ${formatSpec.requiredTypes.map((t) => `"${t}"`).join(', ')}.`,
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
    '4. Focus on ONE story and ONE sharp angle. If the topic text is a digest mentioning multiple unrelated stories, cover ONLY the single strongest technical story and drop the rest.',
    '5. Never show an isolated score or stat without context - always pair numbers on screen with what they beat, the flagship baseline, or the $/M token cost difference.',
    '6. Final scene MUST be type "takeaway_cta" ending on a sharp engineering rule, actionable check, or developer question (ctaText <= 46 chars, written as a sharp technical check or question, NEVER "Follow this channel").',
    '7. Total spoken narration across all scenes MUST be tight: 50 to 90 words total (8 to 16 words per scene, 1 crisp claim per scene = 2.5-4s visual cuts).',
    '8. Ban AI-slop filler: NEVER write "Same day, two massive signals", "the whole conversation changes", "colliding within 24 hours", "here is your move", "game-changer", or "let\'s dive in".',
    '9. Include "visual": { "emphasis": ["word1", "word2"] } copying 1-2 exact words verbatim from that scene headline/title/label/fact/postText (never from narration) to drive kinetic emphasis.',
    '10. Every line inside codeCompare.beforeCode and codeCompare.afterCode MUST be genuine runnable syntax, config (JSON/YAML), git diff, or real CLI commands (NEVER plain English prose sentences), <= 36 characters wide and at most 10 lines total (<= 16 combined lines in before_after).',
    '11. For benchmark_bars and line_chart, use verified numbers from the topic (never invent fake benchmark scores).',
    '12. For social_post, postText MUST be a verbatim quote from the topic summary (do not invent fake posts).',
    '13. Structure Instagram caption for saves & debate: Line 1 crisp hook summary; middle 3 short "- " mini-cheatsheet bullets; final line 1 sharp developer debate question (NEVER spammy "Comment KEYWORD", "DM me", "Link in bio", or "Follow @..."). Provide 3-5 clean, accurately spelled lowercase developer hashtags.',
    '14. Never include stage directions, brackets like [pause], or em-dashes inside narration or captions; use commas or periods instead.',
  );

  return lines.join('\n');
}

function buildOpenAIJsonSchemaGuidance(allowedTypes: readonly SceneType[]): string {
  const bodyTypes = allowedTypes.filter((t) => t !== 'takeaway_cta');
  const bodyLines = bodyTypes.map((t) => `      ${OPEN_AI_SCENE_SHAPES[t]}`);
  return [
    'Return ONLY a single valid JSON object (no markdown fences, no prose) with this exact structure:',
    '{',
    '  "title": string (min 6 chars),',
    '  "pillar": "ai_news" | "benchmarks" | "harnesses" | "coding_practices" | "vibe_coding",',
    '  "caption": string (Line 1 hook + 3 "- " mini-cheatsheet bullets + 1 dev debate question),',
    '  "hashtags": string[] (3-5 clean lowercase tags like "#ai"),',
    '  "scenes": [',
    '    // Scene 1: "hook_title" OR a data-first receipt ("benchmark_bars" | "versus_split" | "big_stat" | "code_compare" | "myth_fact" if allowed below)',
    '    // Middle scenes using ONLY these allowed types and wrapper keys:',
    ...bodyLines,
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
  const cleanHandle = brandHandle.trim();
  const handleGuidance = cleanHandle
    ? `Brand Handle (for optional CTA context only): ${cleanHandle} (never leak @ai.dev.reels)`
    : 'Brand Handle: none configured. Do NOT invent any @handle, never write "Follow @...", and never use @ai.dev.reels.';

  const parts = [
    `Target Pillar: ${topic.pillar} (${PILLAR_LABELS[topic.pillar as ContentPillar]})`,
    `Source: ${topic.sourceName} (${topic.sourceUrl})`,
    handleGuidance,
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
        brandHandle: input.brandHandle,
        rejectDefaultBrandLeak: true,
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
