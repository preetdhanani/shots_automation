import fs from 'node:fs';
import path from 'node:path';
import type { AppEnv } from '../config/env.js';
import { runSubprocess } from '../media/subprocess.js';
import type { CaptionToken, ReelCaptionsFile, SceneTiming } from '../schemas/media.js';
import type { ReelScene, ReelStoryboard } from '../schemas/storyboard.js';
import { SCENE_SHORT_LABELS } from '../variety/registry.js';
import { detectWhisperCliPath, getWhisperModelPath, WHISPER_MODEL_EXPECTED_BYTES } from './whisperSetup.js';

export interface WhisperWordAnchor {
  normWord: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

interface RawWhisperToken {
  text?: string;
  offsets?: { from?: number; to?: number };
  p?: number;
  t_dtw?: number;
}

interface RawWhisperSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
  tokens?: RawWhisperToken[];
}

export interface RawWhisperJson {
  transcription?: RawWhisperSegment[];
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function intToSpokenWords(n: number): string[] {
  if (!Number.isFinite(n) || n < 0 || n > 999999) {
    return String(n).split('');
  }
  const intVal = Math.floor(n);
  if (intVal < 20) return [ONES[intVal]!];
  if (intVal < 100) {
    const ten = Math.floor(intVal / 10);
    const rem = intVal % 10;
    return rem === 0 ? [TENS[ten]!] : [TENS[ten]!, ONES[rem]!];
  }
  if (intVal < 1000) {
    const hundred = Math.floor(intVal / 100);
    const rem = intVal % 100;
    return rem === 0
      ? [ONES[hundred]!, 'hundred']
      : [ONES[hundred]!, 'hundred', ...intToSpokenWords(rem)];
  }
  const thousand = Math.floor(intVal / 1000);
  const rem = intVal % 1000;
  return rem === 0
    ? [...intToSpokenWords(thousand), 'thousand']
    : [...intToSpokenWords(thousand), 'thousand', ...intToSpokenWords(rem)];
}

export function normalizeSpokenWord(raw: string): string[] {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return [];

  const tokens: string[] = [];
  const parts = cleaned
    .replace(/\$/g, ' dollar ')
    .replace(/%/g, ' percent ')
    .replace(/(\d)\.(\d)/g, '$1 point $2')
    .replace(/\./g, ' dot ')
    .replace(/(\d)x(\d)/gi, '$1 by $2')
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const part of parts) {
    const stripped = part.replace(/'/g, '');
    if (!stripped) continue;
    if (/^\d+$/.test(stripped)) {
      const num = Number.parseInt(stripped, 10);
      if (num >= 1000 && num <= 2099 && num % 100 !== 0) {
        const hi = Math.floor(num / 100);
        const lo = num % 100;
        tokens.push(...intToSpokenWords(hi), ...(lo < 10 ? ['oh', ONES[lo]!] : intToSpokenWords(lo)));
      } else {
        tokens.push(...intToSpokenWords(num));
      }
    } else {
      tokens.push(stripped);
    }
  }
  return tokens;
}

export function extractWhisperWordAnchors(whisperJson: RawWhisperJson): WhisperWordAnchor[] {
  const anchors: WhisperWordAnchor[] = [];
  const segments = whisperJson.transcription ?? [];

  let curWord = '';
  let curStart = 0;
  let curEnd = 0;
  let curConfSum = 0;
  let curConfCount = 0;

  const flush = () => {
    const expanded = normalizeSpokenWord(curWord);
    if (expanded.length > 0) {
      const span = Math.max(40, curEnd - curStart);
      const step = span / expanded.length;
      expanded.forEach((normWord, i) => {
        anchors.push({
          normWord,
          startMs: Math.round(curStart + i * step),
          endMs: Math.round(curStart + (i + 1) * step),
          confidence: curConfCount > 0 ? Math.round((curConfSum / curConfCount) * 100) / 100 : null,
        });
      });
    }
    curWord = '';
    curStart = 0;
    curEnd = 0;
    curConfSum = 0;
    curConfCount = 0;
  };

  for (const seg of segments) {
    const segTokens = seg.tokens ?? [];
    for (const tok of segTokens) {
      const rawText = tok.text ?? '';
      if (!rawText || /^\[.*\]$/.test(rawText.trim())) {
        continue;
      }

      const rawFrom = tok.offsets?.from ?? seg.offsets?.from ?? 0;
      const rawTo = tok.offsets?.to ?? seg.offsets?.to ?? rawFrom;
      const dtwMs = typeof tok.t_dtw === 'number' && tok.t_dtw >= 0 ? tok.t_dtw * 10 : null;
      const startMs = Math.max(0, rawFrom);
      const endMs = Math.max(startMs + 25, dtwMs !== null ? Math.max(rawTo, dtwMs) : rawTo);

      const startsNewWord = /^\s/.test(rawText) || curWord.length === 0;
      if (startsNewWord && curWord.length > 0) {
        flush();
      }

      if (curWord.length === 0) {
        curStart = startMs;
      }
      curWord += rawText;
      curEnd = Math.max(curEnd, endMs);
      if (typeof tok.p === 'number') {
        curConfSum += tok.p;
        curConfCount++;
      }
    }
    if (curWord.length > 0) {
      flush();
    }
  }

  return anchors;
}

interface DisplayWordItem {
  displayIdx: number;
  sceneIdx: number;
  displayText: string;
}

interface ExpandedSubToken {
  displayIdx: number;
  normWord: string;
}

function similarityScore(a: string, b: string): number {
  if (a === b) return 3;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 1.8;
  return -1.4;
}

function getSceneLabel(scene: ReelScene): string {
  return SCENE_SHORT_LABELS[scene.type];
}

export function alignStoryboardWithWhisperAnchors(
  storyboard: ReelStoryboard,
  anchors: WhisperWordAnchor[],
  audioDurationMs: number,
  fps = 30,
): ReelCaptionsFile {
  const displayItems: DisplayWordItem[] = [];
  const expanded: ExpandedSubToken[] = [];

  storyboard.scenes.forEach((scene, sceneIdx) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean);
    for (const rawWord of words) {
      const displayIdx = displayItems.length;
      displayItems.push({
        displayIdx,
        sceneIdx,
        displayText: rawWord,
      });
      const norms = normalizeSpokenWord(rawWord);
      const subTokens = norms.length > 0 ? norms : [rawWord.toLowerCase()];
      for (const normWord of subTokens) {
        expanded.push({ displayIdx, normWord });
      }
    }
  });

  if (displayItems.length === 0) {
    throw new Error('Storyboard has zero spoken words.');
  }

  const useWhisper = anchors.length >= Math.max(4, Math.floor(expanded.length * 0.35));
  const matchedBounds = new Map<
    number,
    { startMs: number; endMs: number; confidence: number | null }
  >();

  if (useWhisper) {
    const n = expanded.length;
    const m = anchors.length;
    const gapPenalty = -1.2;

    const dp = new Float32Array((n + 1) * (m + 1));
    const trace = new Uint8Array((n + 1) * (m + 1)); // 1: diag, 2: up (skip script), 3: left (skip whisper)
    const cols = m + 1;

    for (let i = 1; i <= n; i++) {
      dp[i * cols] = dp[(i - 1) * cols]! + gapPenalty;
      trace[i * cols] = 2;
    }
    for (let j = 1; j <= m; j++) {
      dp[j] = dp[j - 1]! + gapPenalty;
      trace[j] = 3;
    }

    for (let i = 1; i <= n; i++) {
      const sub = expanded[i - 1]!.normWord;
      for (let j = 1; j <= m; j++) {
        const anc = anchors[j - 1]!.normWord;
        const diag = dp[(i - 1) * cols + (j - 1)]! + similarityScore(sub, anc);
        const up = dp[(i - 1) * cols + j]! + gapPenalty;
        const left = dp[i * cols + (j - 1)]! + gapPenalty;

        if (diag >= up && diag >= left) {
          dp[i * cols + j] = diag;
          trace[i * cols + j] = 1;
        } else if (up >= left) {
          dp[i * cols + j] = up;
          trace[i * cols + j] = 2;
        } else {
          dp[i * cols + j] = left;
          trace[i * cols + j] = 3;
        }
      }
    }

    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      const dir = trace[i * cols + j]!;
      if (dir === 1 && i > 0 && j > 0) {
        const sub = expanded[i - 1]!;
        const anc = anchors[j - 1]!;
        if (similarityScore(sub.normWord, anc.normWord) > 0) {
          const prev = matchedBounds.get(sub.displayIdx);
          if (!prev) {
            matchedBounds.set(sub.displayIdx, {
              startMs: anc.startMs,
              endMs: anc.endMs,
              confidence: anc.confidence,
            });
          } else {
            matchedBounds.set(sub.displayIdx, {
              startMs: Math.min(prev.startMs, anc.startMs),
              endMs: Math.max(prev.endMs, anc.endMs),
              confidence: prev.confidence ?? anc.confidence,
            });
          }
        }
        i--;
        j--;
      } else if (dir === 2 && i > 0) {
        i--;
      } else {
        j--;
      }
    }
  }

  const effectiveUseWhisper = useWhisper && matchedBounds.size >= Math.floor(displayItems.length * 0.35);

  const captions: CaptionToken[] = new Array<CaptionToken>(displayItems.length);

  if (effectiveUseWhisper) {
    // Interpolate unmatched gaps linearly between nearest matched neighbors
    let cursor = 0;
    while (cursor < displayItems.length) {
      if (matchedBounds.has(cursor)) {
        const b = matchedBounds.get(cursor)!;
        captions[cursor] = {
          text: (cursor === 0 ? '' : ' ') + displayItems[cursor]!.displayText,
          startMs: b.startMs,
          endMs: Math.max(b.startMs + 40, b.endMs),
          timestampMs: b.startMs,
          confidence: b.confidence,
        };
        cursor++;
        continue;
      }

      const gapStartIdx = cursor;
      while (cursor < displayItems.length && !matchedBounds.has(cursor)) {
        cursor++;
      }
      const gapEndIdx = cursor - 1;
      const prevEnd =
        gapStartIdx > 0 ? captions[gapStartIdx - 1]!.endMs : Math.min(120, Math.round(audioDurationMs * 0.02));
      const nextStart =
        cursor < displayItems.length
          ? matchedBounds.get(cursor)!.startMs
          : Math.max(prevEnd + 100, audioDurationMs - 100);

      const count = gapEndIdx - gapStartIdx + 1;
      const weights = displayItems
        .slice(gapStartIdx, gapEndIdx + 1)
        .map((w) => Math.max(2, w.displayText.length));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      const totalSpan = Math.max(count * 40, nextStart - prevEnd);

      let runningMs = prevEnd;
      for (let k = 0; k < count; k++) {
        const share = Math.max(30, Math.round((totalSpan * weights[k]!) / weightSum));
        const endMs = k === count - 1 ? Math.max(runningMs + 30, nextStart) : runningMs + share;
        const idx = gapStartIdx + k;
        captions[idx] = {
          text: (idx === 0 ? '' : ' ') + displayItems[idx]!.displayText,
          startMs: runningMs,
          endMs,
          timestampMs: runningMs,
          confidence: null,
        };
        runningMs = endMs;
      }
    }
  } else {
    // Weighted character duration estimation fallback
    const headPad = 120;
    const tailPad = 140;
    const usableMs = Math.max(1000, audioDurationMs - headPad - tailPad);
    const weights = displayItems.map((d) => Math.max(3, d.displayText.replace(/[^a-zA-Z0-9]/g, '').length) + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let runningMs = headPad;

    displayItems.forEach((item, idx) => {
      const share = (usableMs * weights[idx]!) / totalWeight;
      const startMs = Math.round(runningMs);
      runningMs += share;
      const endMs = idx === displayItems.length - 1 ? audioDurationMs - tailPad : Math.round(runningMs);
      captions[idx] = {
        text: (idx === 0 ? '' : ' ') + item.displayText,
        startMs,
        endMs: Math.max(startMs + 40, endMs),
        timestampMs: startMs,
        confidence: null,
      };
    });
  }

  // Enforce strict monotonicity across all caption tokens
  for (let idx = 0; idx < captions.length; idx++) {
    const cur = captions[idx]!;
    if (idx > 0) {
      const prev = captions[idx - 1]!;
      if (cur.startMs < prev.endMs) {
        cur.startMs = prev.endMs;
      }
    }
    if (cur.endMs <= cur.startMs) {
      cur.endMs = cur.startMs + 40;
    }
    if (cur.endMs > audioDurationMs) {
      cur.endMs = Math.max(cur.startMs + 20, audioDurationMs);
    }
    cur.timestampMs = cur.startMs;
  }

  // Derive scene boundaries strictly from aligned word spans without audio drift
  const sceneWordRanges = storyboard.scenes.map((_, sIdx) => {
    let firstIdx = -1;
    let lastIdx = -1;
    displayItems.forEach((item, wIdx) => {
      if (item.sceneIdx === sIdx) {
        if (firstIdx === -1) firstIdx = wIdx;
        lastIdx = wIdx;
      }
    });
    return { firstIdx, lastIdx };
  });

  const sceneStartMs: number[] = new Array<number>(storyboard.scenes.length).fill(0);
  const sceneEndMs: number[] = new Array<number>(storyboard.scenes.length).fill(audioDurationMs);

  for (let s = 0; s < storyboard.scenes.length - 1; s++) {
    const curRange = sceneWordRanges[s]!;
    const nextRange = sceneWordRanges[s + 1]!;
    const curLastWordEnd =
      curRange.lastIdx >= 0 ? captions[curRange.lastIdx]!.endMs : sceneStartMs[s]! + 1500;
    const nextFirstWordStart =
      nextRange.firstIdx >= 0 ? captions[nextRange.firstIdx]!.startMs : curLastWordEnd;

    // Place transition boundary cleanly at midpoint of silence gap between scenes,
    // strictly clamped so scene[s+1] starts no later than its first spoken word
    const midpoint =
      nextFirstWordStart >= curLastWordEnd
        ? Math.round((curLastWordEnd + nextFirstWordStart) / 2)
        : nextFirstWordStart;
    const clampedBoundary = Math.max(
      sceneStartMs[s]! + 200,
      Math.min(midpoint, nextFirstWordStart),
    );
    sceneEndMs[s] = clampedBoundary;
    sceneStartMs[s + 1] = clampedBoundary;
  }

  sceneStartMs[0] = 0;
  sceneEndMs[storyboard.scenes.length - 1] = Math.max(
    audioDurationMs,
    sceneStartMs[storyboard.scenes.length - 1]! + 300,
  );

  const totalFrames = Math.max(fps * 3, Math.ceil((sceneEndMs[storyboard.scenes.length - 1]! / 1000) * fps));
  const sceneTimings: SceneTiming[] = [];
  let frameCursor = 0;

  storyboard.scenes.forEach((scene, sIdx) => {
    const startMs = sceneStartMs[sIdx]!;
    const endMs = sceneEndMs[sIdx]!;
    const isLast = sIdx === storyboard.scenes.length - 1;
    const targetEndFrame = isLast
      ? totalFrames
      : Math.max(frameCursor + 1, Math.round((endMs / 1000) * fps));
    const durationInFrames = Math.max(1, targetEndFrame - frameCursor);

    sceneTimings.push({
      sceneId: scene.id,
      sceneType: scene.type,
      label: getSceneLabel(scene),
      startMs,
      endMs,
      startFrame: frameCursor,
      durationInFrames,
    });
    frameCursor += durationInFrames;
  });

  return {
    alignmentMode: effectiveUseWhisper ? 'whisper' : 'estimated',
    audioDurationMs,
    fps,
    captions,
    sceneTimings,
  };
}

export async function runWhisperAndAlign(opts: {
  env: AppEnv;
  storyboard: ReelStoryboard;
  voice16kPath: string;
  audioDurationMs: number;
  workDir: string;
  signal?: AbortSignal;
}): Promise<ReelCaptionsFile> {
  const cliPath = await detectWhisperCliPath(opts.env);
  const modelPath = getWhisperModelPath(opts.env);
  const modelReady =
    fs.existsSync(modelPath) && fs.statSync(modelPath).size >= WHISPER_MODEL_EXPECTED_BYTES * 0.95;

  if (!cliPath || !modelReady) {
    return alignStoryboardWithWhisperAnchors(opts.storyboard, [], opts.audioDurationMs);
  }

  const outPrefix = path.join(opts.workDir, 'whisper-raw');
  const outJsonPath = `${outPrefix}.json`;

  try {
    await runSubprocess(
      cliPath,
      [
        '-m',
        modelPath,
        '-f',
        opts.voice16kPath,
        '-dtw',
        'base.en',
        '-nfa',
        '-ojf',
        '-of',
        outPrefix,
      ],
      { signal: opts.signal, timeoutMs: 120_000 },
    );

    if (!fs.existsSync(outJsonPath)) {
      return alignStoryboardWithWhisperAnchors(opts.storyboard, [], opts.audioDurationMs);
    }

    const raw = JSON.parse(fs.readFileSync(outJsonPath, 'utf8')) as RawWhisperJson;
    const anchors = extractWhisperWordAnchors(raw);
    return alignStoryboardWithWhisperAnchors(opts.storyboard, anchors, opts.audioDurationMs);
  } catch (err) {
    if (err instanceof Error && err.name === 'SubprocessCancelledError') {
      throw err;
    }
    return alignStoryboardWithWhisperAnchors(opts.storyboard, [], opts.audioDurationMs);
  }
}
