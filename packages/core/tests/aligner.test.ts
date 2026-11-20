import { describe, expect, it } from 'vitest';
import {
  alignStoryboardWithWhisperAnchors,
  extractWhisperWordAnchors,
  normalizeSpokenWord,
  SAMPLE_DEMO_STORYBOARD,
} from '@post/core';

describe('1-to-N Script-to-Whisper Aligner', () => {
  it('expands developer tokens accurately for spoken comparison', () => {
    expect(normalizeSpokenWord('AGENTS.md')).toEqual(['agents', 'dot', 'md']);
    expect(normalizeSpokenWord('$14')).toEqual(['dollar', 'fourteen']);
    expect(normalizeSpokenWord('30-50%')).toEqual(['thirty', 'fifty', 'percent']);
    expect(normalizeSpokenWord('1080x1920')).toEqual([
      'ten',
      'eighty',
      'by',
      'nineteen',
      'twenty',
    ]);
  });

  it('merges BPE sub-tokens and converts t_dtw centiseconds cleanly', () => {
    const anchors = extractWhisperWordAnchors({
      transcription: [
        {
          offsets: { from: 100, to: 900 },
          tokens: [
            { text: ' Anth', offsets: { from: 120, to: 300 }, p: 0.9, t_dtw: 35 },
            { text: 'ropic', offsets: { from: 300, to: 520 }, p: 0.92, t_dtw: 54 },
            { text: '[_TT_100]', offsets: { from: 520, to: 520 }, p: 1 },
            { text: ' ships', offsets: { from: 600, to: 850 }, p: 0.95, t_dtw: 88 },
          ],
        },
      ],
    });

    expect(anchors).toHaveLength(2);
    expect(anchors[0]!.normWord).toBe('anthropic');
    expect(anchors[0]!.startMs).toBe(120);
    expect(anchors[0]!.endMs).toBe(540); // t_dtw 54 * 10 = 540ms
    expect(anchors[1]!.normWord).toBe('ships');
    expect(anchors[1]!.endMs).toBe(880);
  });

  it('preserves exact spelling, monotonic timings, and drift-free scene boundaries', () => {
    const words = SAMPLE_DEMO_STORYBOARD.scenes.flatMap((s) => s.narration.trim().split(/\s+/));
    // Build synthetic Whisper anchors expanding numbers/punctuation cleanly
    let clockMs = 150;
    const anchors = words.flatMap((w) => {
      const spoken = normalizeSpokenWord(w);
      return (spoken.length > 0 ? spoken : [w.toLowerCase()]).map((normWord) => {
        const startMs = clockMs;
        const endMs = clockMs + 220;
        clockMs += 260;
        return { normWord, startMs, endMs, confidence: 0.94 };
      });
    });

    const totalMs = clockMs + 300;
    const aligned = alignStoryboardWithWhisperAnchors(SAMPLE_DEMO_STORYBOARD, anchors, totalMs, 30);

    expect(aligned.alignmentMode).toBe('whisper');
    expect(aligned.captions).toHaveLength(words.length);
    expect(aligned.captions.map((c) => c.text.trim())).toEqual(words);

    for (let i = 1; i < aligned.captions.length; i++) {
      expect(aligned.captions[i]!.startMs).toBeGreaterThanOrEqual(aligned.captions[i - 1]!.endMs);
    }

    expect(aligned.sceneTimings).toHaveLength(SAMPLE_DEMO_STORYBOARD.scenes.length);
    for (let i = 1; i < aligned.sceneTimings.length; i++) {
      expect(aligned.sceneTimings[i]!.startMs).toBe(aligned.sceneTimings[i - 1]!.endMs);
      expect(aligned.sceneTimings[i]!.startFrame).toBe(
        aligned.sceneTimings[i - 1]!.startFrame + aligned.sceneTimings[i - 1]!.durationInFrames,
      );
    }
  });

  it('falls back cleanly to weighted estimated mode when Whisper anchors are empty', () => {
    const res = alignStoryboardWithWhisperAnchors(SAMPLE_DEMO_STORYBOARD, [], 38_000, 30);
    expect(res.alignmentMode).toBe('estimated');
    expect(res.sceneTimings).toHaveLength(5);
    expect(res.captions[res.captions.length - 1]!.endMs).toBeLessThanOrEqual(38_000);
  });
});
