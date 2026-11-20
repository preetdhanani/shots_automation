import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AppEnv } from '../config/env.js';
import type { TopicRecord } from '../db/store.js';
import {
  PILLAR_LABELS,
  validateStoryboardEditorial,
  type ContentPillar,
  type ReelStoryboard,
  type TakeawayCtaScene,
} from '../schemas/storyboard.js';
import { createGeminiAbortSignal, withGeminiRetry } from './geminiClient.js';
import {
  convertFlatGeminiResponseToStoryboard,
  GEMINI_STORYBOARD_JSON_SCHEMA,
} from './geminiSchema.js';
import type { ResolvedLlmEndpoint } from './llmRegistry.js';
import { callOpenAICompatibleStoryboard } from './openaiCompatibleClient.js';

export const CHANNEL_OUTRO_NARRATION =
  'AI news, new models, benchmarks, harnesses, clean AI coding, and vibe coding tips from top devs. Follow this channel.';

export function createChannelOutroScene(id = 'scene-6'): TakeawayCtaScene {
  return {
    id,
    type: 'takeaway_cta',
    badge: 'FOLLOW FOR MORE',
    headline: 'Stay Ahead in AI Coding',
    takeaway:
      'AI news · New models · Benchmarks · Harnesses · Clean AI coding & vibe coding tips from top devs',
    ctaText: 'Follow this channel',
    narration: CHANNEL_OUTRO_NARRATION,
  };
}

export function appendChannelOutroScene(storyboard: ReelStoryboard): ReelStoryboard {
  const lastScene = storyboard.scenes[storyboard.scenes.length - 1];
  if (lastScene && lastScene.narration.trim() === CHANNEL_OUTRO_NARRATION) {
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

export interface GenerateStoryboardInput {
  topic: Pick<TopicRecord, 'title' | 'summary' | 'sourceName' | 'sourceUrl' | 'pillar'>;
  brandHandle: string;
  signal?: AbortSignal;
}

function buildSystemPrompt(): string {
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

function buildUserPrompt(
  topic: GenerateStoryboardInput['topic'],
  brandHandle: string,
  previousErrors?: string[],
): string {
  const parts = [
    `Target Pillar: ${topic.pillar} (${PILLAR_LABELS[topic.pillar as ContentPillar]})`,
    `Source: ${topic.sourceName} (${topic.sourceUrl})`,
    `Brand Handle (for CTA context only): ${brandHandle}`,
    `Topic Title: ${topic.title}`,
    `Topic Summary & Facts:\n${topic.summary}`,
  ];
  if (previousErrors && previousErrors.length > 0) {
    parts.push(
      `\nYour previous JSON failed these validation rules. Fix ALL of them strictly:\n- ${previousErrors.join('\n- ')}`,
    );
  }
  return parts.join('\n\n');
}

function buildOpenAIJsonSchemaGuidance(): string {
  return [
    'Return ONLY a single valid JSON object (no markdown fences, no prose) with this exact structure:',
    '{',
    '  "title": string (min 6 chars),',
    '  "pillar": "ai_news" | "benchmarks" | "harnesses" | "coding_practices" | "vibe_coding",',
    '  "caption": string,',
    '  "hashtags": string[] (3-15 tags like "#ai"),',
    '  "scenes": [',
    '    { "id": "scene-1", "type": "hook_title", "narration": string, "hookTitle": { "badge": string, "headline": string, "subheadline": string, "highlightStat"?: string (<= 32 chars) } },',
    '    ... (3 middle scenes matching one of these exact types and wrapper keys):',
    '      "benchmark_bars" -> "benchmarkBars": { "title": string, "subtitle"?: string, "metricUnit": string, "sourceLabel": string, "bars": [{ "label": string, "value": number, "isWinner"?: boolean, "note"?: string }] }',
    '      "code_compare" -> "codeCompare": { "title": string, "language": string, "filename": string, "mode": "single" | "before_after" (if "before_after", beforeCode MUST be non-empty), "beforeLabel"?: string, "beforeCode"?: string, "afterLabel"?: string, "afterCode": string, "highlightLines"?: number[] }',
    '      "terminal_demo" -> "terminalDemo": { "title": string, "windowTitle": string, "command": string, "outputLines": [{ "text": string, "tone": "neutral" | "success" | "warn" | "accent" }] }',
    '      "news_quote_card" -> "newsQuoteCard": { "sourceLabel": string, "dateLabel": string, "headline": string, "bullets": string[] }',
    '    { "id": "scene-5", "type": "takeaway_cta", "narration": string, "takeawayCta": { "badge": string, "headline": string, "takeaway": string, "ctaText": string } }',
    '  ]',
    '}',
  ].join('\n');
}

async function callGeminiStoryboardOnce(
  ai: GoogleGenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
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
          temperature: 0.45,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseJsonSchema: GEMINI_STORYBOARD_JSON_SCHEMA,
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
  signal?: AbortSignal,
): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey });
  try {
    return await callGeminiStoryboardOnce(ai, model, systemPrompt, userPrompt, true, signal);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('thinking')) {
      return await callGeminiStoryboardOnce(ai, model, systemPrompt, userPrompt, false, signal);
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

  const baseSystemPrompt = buildSystemPrompt();
  const systemPrompt =
    endpoint.provider === 'openai_compatible'
      ? `${baseSystemPrompt}\n\n${buildOpenAIJsonSchemaGuidance()}`
      : baseSystemPrompt;
  const sources = [{ title: input.topic.sourceName || 'Source', url: input.topic.sourceUrl }];

  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userPrompt = buildUserPrompt(input.topic, input.brandHandle, lastErrors);

    const rawJson =
      endpoint.provider === 'gemini'
        ? await callGeminiStoryboardWithThinkingFallback(
            env.GEMINI_API_KEY,
            endpoint.model || env.GEMINI_TEXT_MODEL,
            systemPrompt,
            userPrompt,
            input.signal,
          )
        : await callOpenAICompatibleStoryboard({
            baseUrl: endpoint.baseUrl,
            model: endpoint.model,
            apiKey: endpoint.apiKey,
            systemPrompt,
            userPrompt,
            signal: input.signal,
          });

    try {
      const converted = convertFlatGeminiResponseToStoryboard(rawJson, sources);
      const storyboard = appendChannelOutroScene(converted);
      const editorial = validateStoryboardEditorial(storyboard);
      if (editorial.ok) {
        return storyboard;
      }
      lastErrors = editorial.errors;
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
