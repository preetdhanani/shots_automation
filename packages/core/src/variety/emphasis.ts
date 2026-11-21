import type { ReelScene } from '../schemas/storyboard.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'its',
  'not',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'vs',
  'what',
  'when',
  'why',
  'with',
  'you',
  'your',
]);

const METRIC_OR_NUMBER_RE = /[0-9%+$]|^\d+(\.\d+)?[xkmbt]?$/i;

export function cleanEmphasisToken(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9+$%]+|[^a-z0-9+%]+$/gi, '');
}

/**
 * Returns the exact string rendered inside <KineticText> for each scene type.
 */
export function getSceneEmphasisTargetText(scene: ReelScene): string {
  switch (scene.type) {
    case 'hook_title':
    case 'news_quote_card':
    case 'source_spotlight':
    case 'takeaway_cta':
      return scene.headline;
    case 'benchmark_bars':
    case 'code_compare':
    case 'terminal_demo':
    case 'versus_split':
    case 'checklist_steps':
    case 'timeline':
    case 'line_chart':
    case 'countdown_item':
      return scene.title;
    case 'big_stat':
      return scene.label;
    case 'myth_fact':
      return scene.fact;
    case 'ai_media_clip':
      return scene.captionText;
    case 'social_post':
      return scene.postText;
  }
}

function clampDisplayToken(raw: string): string {
  return raw.replace(/^["'`([{]+|[,.:;!?"'`)\]}]+$/g, '').trim().slice(0, 24);
}

/**
 * Ensures `visual.emphasis` contains 1-3 short tokens that actually exist
 * inside the scene's rendered <KineticText> headline/title/text.
 */
export function repairSceneEmphasis(scene: ReelScene): string[] | undefined {
  const targetText = getSceneEmphasisTargetText(scene).trim();
  if (!targetText) return undefined;

  const targetWords = targetText.split(/\s+/).filter(Boolean);
  const cleanedToDisplay = new Map<string, string>();
  const cleanTargetList: Array<{ cleaned: string; display: string }> = [];

  for (const w of targetWords) {
    const cleaned = cleanEmphasisToken(w);
    const display = clampDisplayToken(w);
    if (!cleaned || !display) continue;
    cleanTargetList.push({ cleaned, display });
    if (!cleanedToDisplay.has(cleaned)) {
      cleanedToDisplay.set(cleaned, display);
    }
  }

  if (cleanTargetList.length === 0) return undefined;

  const rawEmphasis = scene.visual?.emphasis ?? [];
  const matched: string[] = [];
  const seenCleaned = new Set<string>();

  for (const phrase of rawEmphasis) {
    const subWords = phrase.split(/\s+/).filter(Boolean);
    for (const sub of subWords) {
      const c = cleanEmphasisToken(sub);
      if (!c || seenCleaned.has(c)) continue;
      const display = cleanedToDisplay.get(c);
      if (display) {
        seenCleaned.add(c);
        matched.push(display);
        if (matched.length >= 3) break;
      }
    }
    if (matched.length >= 3) break;
  }

  if (matched.length > 0) {
    return matched.slice(0, 3);
  }

  // Fallback: score target words to pick 1-2 high-signal tokens
  const scored = cleanTargetList
    .map((entry, idx) => {
      let score = 0;
      if (METRIC_OR_NUMBER_RE.test(entry.display)) score += 50;
      if (/[A-Z]{2,}/.test(entry.display) || entry.display.includes('.')) score += 25;
      if (!STOPWORDS.has(entry.cleaned) && entry.cleaned.length >= 4) score += 15 + Math.min(12, entry.cleaned.length);
      if (STOPWORDS.has(entry.cleaned)) score -= 30;
      return { ...entry, idx, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const picked: string[] = [];
  const seenPicked = new Set<string>();
  for (const cand of scored) {
    if (seenPicked.has(cand.cleaned)) continue;
    seenPicked.add(cand.cleaned);
    picked.push(cand.display);
    if (picked.length >= 2) break;
  }

  if (picked.length === 0 && cleanTargetList[0]) {
    picked.push(cleanTargetList[0].display);
  }

  return picked.length > 0 ? picked : undefined;
}
