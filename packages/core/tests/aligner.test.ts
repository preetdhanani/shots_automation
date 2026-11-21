import { describe, expect, it } from 'vitest';
import {
  alignStoryboardWithWhisperAnchors,
  appendChannelOutroScene,
  extractWhisperWordAnchors,
  normalizeSpokenWord,
  normalizeTextForTts,
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

  it('clamps multiple overflowing trailing Whisper anchors inside audioDurationMs monotonically', () => {
    const words = SAMPLE_DEMO_STORYBOARD.scenes.flatMap((s) => s.narration.trim().split(/\s+/));
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

    // Simulate Whisper timestamps extending well past actual audioDurationMs on multiple trailing words
    const audioDurationMs = clockMs - 450;
    const aligned = alignStoryboardWithWhisperAnchors(
      SAMPLE_DEMO_STORYBOARD,
      anchors,
      audioDurationMs,
      30,
    );

    expect(aligned.alignmentMode).toBe('whisper');
    for (let i = 0; i < aligned.captions.length; i++) {
      const cur = aligned.captions[i]!;
      expect(cur.startMs).toBeGreaterThanOrEqual(0);
      expect(cur.endMs).toBeGreaterThan(cur.startMs);
      expect(cur.endMs).toBeLessThanOrEqual(audioDurationMs);
      expect(cur.timestampMs).toBe(cur.startMs);
      if (i > 0) {
        expect(cur.startMs).toBeGreaterThanOrEqual(aligned.captions[i - 1]!.endMs);
      }
    }
  });

  it('normalizes technical acronyms for TTS only and aligns both spoken & written Whisper tokens', () => {
    expect(normalizeTextForTts("PyPI's kubectl and nginx run on WASM via FastAPI.")).toBe(
      "Pie P I's kube control and engine X run on W A S M via Fast A P I.",
    );

    const sb = {
      ...SAMPLE_DEMO_STORYBOARD,
      scenes: [
        {
          ...SAMPLE_DEMO_STORYBOARD.scenes[0]!,
          narration: 'PyPI serves wheels while kubectl manages pods on nginx nodes today.',
        },
        ...SAMPLE_DEMO_STORYBOARD.scenes.slice(1),
      ],
    };

    const rawAnchorWords = [
      'pie',
      'p',
      'i',
      'serves',
      'wheels',
      'while',
      'cube',
      'control',
      'manages',
      'pods',
      'on',
      'engine',
      'x',
      'nodes',
      'today',
      ...SAMPLE_DEMO_STORYBOARD.scenes
        .slice(1)
        .flatMap((s) => s.narration.trim().split(/\s+/))
        .flatMap((w) => {
          const s = normalizeSpokenWord(w);
          return s.length > 0 ? s : [w.toLowerCase()];
        }),
    ];

    let clockMs = 220;
    const anchors = rawAnchorWords.map((normWord) => {
      const startMs = clockMs;
      const endMs = clockMs + 180;
      clockMs += 210;
      return { normWord, startMs, endMs, confidence: 0.95 };
    });

    const res = alignStoryboardWithWhisperAnchors(sb, anchors, clockMs + 900, 30);
    expect(res.alignmentMode).toBe('whisper');
    // Display caption preserves original PyPI spelling and spans all 3 phonetic tokens ("pie p i")
    expect(res.captions[0]!.text.trim()).toBe('PyPI');
    expect(res.captions[0]!.startMs).toBe(220);
    expect(res.captions[0]!.endMs).toBeGreaterThanOrEqual(800);
    // Display caption preserves kubectl across "cube control"
    expect(res.captions[4]!.text.trim()).toBe('kubectl');
    // Display caption preserves nginx across "engine x"
    expect(res.captions[8]!.text.trim()).toBe('nginx');
  });

  it('uses smooth 220ms head and 650ms tail pads in estimated mode and reserves pause gap before channel outro', () => {
    const withoutOutro = {
      ...SAMPLE_DEMO_STORYBOARD,
      scenes: SAMPLE_DEMO_STORYBOARD.scenes.slice(0, 5),
    };
    const standard = alignStoryboardWithWhisperAnchors(withoutOutro, [], 30_000, 30);
    expect(standard.alignmentMode).toBe('estimated');
    expect(standard.sceneTimings).toHaveLength(5);
    expect(standard.captions[0]!.startMs).toBe(220);
    expect(standard.captions[standard.captions.length - 1]!.endMs).toBeLessThanOrEqual(29_350);

    const legacyWithOutro = appendChannelOutroScene(SAMPLE_DEMO_STORYBOARD);
    const res = alignStoryboardWithWhisperAnchors(legacyWithOutro, [], 38_000, 30);
    expect(res.alignmentMode).toBe('estimated');
    expect(res.sceneTimings).toHaveLength(legacyWithOutro.scenes.length);
    expect(res.captions[res.captions.length - 1]!.endMs).toBeLessThanOrEqual(38_000);

    const contentWordCount = legacyWithOutro.scenes
      .slice(0, -1)
      .flatMap((s) => s.narration.trim().split(/\s+/)).length;
    const lastContentWord = res.captions[contentWordCount - 1]!;
    const firstOutroWord = res.captions[contentWordCount]!;
    const gapMs = firstOutroWord.startMs - lastContentWord.endMs;
    expect(gapMs).toBeGreaterThanOrEqual(600);

    const outroTiming = res.sceneTimings[res.sceneTimings.length - 1]!;
    expect(outroTiming.startMs).toBeGreaterThan(lastContentWord.endMs);
    expect(outroTiming.startMs).toBeLessThanOrEqual(firstOutroWord.startMs);
  });
});
