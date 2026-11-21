import { describe, expect, it } from 'vitest';
import {
  applyVisualPlan,
  BROLL_SAMPLE_STORYBOARD,
  buildGeminiStoryboardJsonSchema,
  computeFreshness,
  computeNarrationHash,
  computeReelFingerprint,
  CONTENT_PILLARS,
  convertFlatGeminiResponseToStoryboard,
  fingerprintSimilarity,
  FORMAT_SAMPLE_STORYBOARDS,
  isChannelOutroScene,
  pickRotatedVoice,
  planReelVariety,
  REEL_FORMAT_IDS,
  REEL_FORMATS,
  ReelStoryboardSchema,
  repairSceneEmphasis,
  restyleStoryboard,
  toFlatStoryboardPayload,
  validateStoryboardEditorial,
  validateVarietyRules,
  type ReelFingerprint,
  type VoiceName,
} from '@post/core';

describe('Video Variety Engine - Planner, Fingerprints, Formats & Gates', () => {
  it('validates all 8 FORMAT_SAMPLE_STORYBOARDS through schema, editorial, variety gate, and flat round-trip', () => {
    for (const formatId of REEL_FORMAT_IDS) {
      const sample = FORMAT_SAMPLE_STORYBOARDS[formatId];
      const parsed = ReelStoryboardSchema.parse(sample);
      expect(parsed.format).toBe(formatId);

      const editorial = validateStoryboardEditorial(parsed);
      expect(editorial.ok, `${formatId} editorial errors: ${editorial.errors.join('; ')}`).toBe(
        true,
      );

      const variety = validateVarietyRules(parsed, {
        formatSpec: REEL_FORMATS[formatId],
      });
      expect(variety.ok, `${formatId} variety errors: ${variety.errors.join('; ')}`).toBe(true);

      // Flat round-trip preserves scene count and types losslessly
      const flat = toFlatStoryboardPayload(parsed);
      const roundTripped = convertFlatGeminiResponseToStoryboard(flat, parsed.sources);
      expect(roundTripped.scenes.map((s) => s.type)).toEqual(parsed.scenes.map((s) => s.type));
      expect(roundTripped.scenes.map((s) => s.visual?.layout)).toEqual(
        parsed.scenes.map((s) => s.visual?.layout),
      );
    }

    // B-roll sample passes only when B-roll is enabled
    expect(validateStoryboardEditorial(BROLL_SAMPLE_STORYBOARD).ok).toBe(false);
    expect(
      validateStoryboardEditorial(BROLL_SAMPLE_STORYBOARD, { allowAiMediaClip: true }).ok,
    ).toBe(true);
  });

  it('produces deterministic plans for a fixed seed and avoids repeating recent formats/styles across 30 simulated runs', () => {
    const planA = planReelVariety({ pillar: 'harnesses', history: [], seed: 4242 });
    const planB = planReelVariety({ pillar: 'harnesses', history: [], seed: 4242 });
    expect(planA).toEqual(planB);

    const history: ReelFingerprint[] = [];
    const seenFormats = new Set<string>();
    const consecutiveSims: number[] = [];

    for (let i = 0; i < 30; i++) {
      const pillar = CONTENT_PILLARS[i % CONTENT_PILLARS.length]!;
      const plan = planReelVariety({ pillar, history, seed: 1000 + i * 97 });
      const voice = pickRotatedVoice(history, 'Puck');

      // Format must never repeat any of the last 3 formats
      const last3Formats = history.slice(0, 3).map((h) => h.format);
      expect(last3Formats).not.toContain(plan.format);

      // Background & music mood must never repeat the immediately preceding reel
      if (history[0]) {
        expect(plan.style.background).not.toBe(history[0].background);
        expect(plan.style.musicMood).not.toBe(history[0].musicMood);
      }

      // Voice rotation must never repeat last 2 voices
      const last2Voices = history.slice(0, 2).map((h) => h.voiceName);
      expect(last2Voices).not.toContain(voice);

      const baseSample = structuredClone(FORMAT_SAMPLE_STORYBOARDS[plan.format]);
      if (baseSample.scenes[0]?.type === 'hook_title') {
        baseSample.scenes[0].headline = `Unique Topic ${i} Angle ${plan.format}`;
        baseSample.scenes[0].narration = `Episode ${i} opens cleanly with fresh developer insight about this ${plan.format} topic.`;
      }

      const styled = applyVisualPlan(
        { ...baseSample, format: plan.format, hookStyle: plan.hookStyle },
        { style: plan.style, format: plan.format, history, seed: plan.style.seed },
      );

      // No back-to-back identical transitions within a single reel
      for (let s = 1; s < styled.scenes.length; s++) {
        expect(styled.scenes[s]?.visual?.transition).not.toBe(
          styled.scenes[s - 1]?.visual?.transition,
        );
      }

      // Legacy channel outro (if present) must still be excluded from fingerprint sceneTypes
      const fp = computeReelFingerprint({
        id: `sim-${i}`,
        title: `Sim Reel ${i}`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
        voiceName: voice,
        storyboard: styled,
      });

      const contentCount = styled.scenes.filter((s) => !isChannelOutroScene(s)).length;
      expect(fp.sceneTypes).toHaveLength(contentCount);
      expect(isChannelOutroScene(styled.scenes[styled.scenes.length - 1]!)).toBe(true);

      if (history[0]) {
        const sim = fingerprintSimilarity(fp, history[0]);
        consecutiveSims.push(sim);
        expect(sim).toBeLessThan(0.75);
      }

      seenFormats.add(plan.format);
      history.unshift(fp);
    }

    expect(seenFormats.size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...consecutiveSims)).toBeLessThan(0.75);
  });

  it('computes freshness accurately and ignores self-matches', () => {
    const fp1 = computeReelFingerprint({
      id: 'reel-1',
      title: 'First Reel',
      createdAt: '2026-11-20T00:00:00.000Z',
      voiceName: 'Puck',
      storyboard: FORMAT_SAMPLE_STORYBOARDS.news_breakdown,
    });
    const fp2 = computeReelFingerprint({
      id: 'reel-2',
      title: 'Second Reel',
      createdAt: '2026-11-20T00:05:00.000Z',
      voiceName: 'Fenrir',
      storyboard: FORMAT_SAMPLE_STORYBOARDS.top3_countdown,
    });

    // Self-only history gives 100% freshness (never matches itself)
    expect(computeFreshness(fp1, [fp1]).score).toBe(100);
    // Distinct format/style gives high freshness
    const rep = computeFreshness(fp2, [fp1]);
    expect(rep.score).toBeGreaterThan(70);
    expect(rep.mostSimilar?.reelId).toBe('reel-1');
  });

  it('enforces variety validation rules (hooks, consecutive scenes, countdown ranks, verbatim quotes, B-roll)', () => {
    // 1. Duplicate hook headline & opening words rejected
    const prevFp = computeReelFingerprint({
      id: 'prev-1',
      title: 'Prev',
      createdAt: '2026-11-20T00:00:00.000Z',
      voiceName: 'Puck',
      storyboard: FORMAT_SAMPLE_STORYBOARDS.hot_take,
    });
    const dupRes = validateVarietyRules(FORMAT_SAMPLE_STORYBOARDS.hot_take, {
      formatSpec: REEL_FORMATS.hot_take,
      history: [prevFp],
    });
    expect(dupRes.ok).toBe(false);
    expect(dupRes.errors.some((e) => e.includes('too similar'))).toBe(true);
    expect(dupRes.errors.some((e) => e.includes('opening words'))).toBe(true);

    // 2. Fake social_post quote rejected when topicText does not contain it
    const fakeQuote = validateVarietyRules(FORMAT_SAMPLE_STORYBOARDS.news_breakdown, {
      formatSpec: REEL_FORMATS.news_breakdown,
      topicText: 'Completely unrelated article about Rust async runtimes and Tokio performance.',
    });
    expect(fakeQuote.ok).toBe(false);
    expect(fakeQuote.errors.some((e) => e.includes('social_post'))).toBe(true);

    // 3. Verbatim social_post quote passes when topicText contains it
    const realQuote = validateVarietyRules(FORMAT_SAMPLE_STORYBOARDS.news_breakdown, {
      formatSpec: REEL_FORMATS.news_breakdown,
      topicText:
        'Researchers used an automated agent harness to design, simulate, and formally verify a new RISC-V core with 22% higher IPC.',
    });
    expect(realQuote.ok).toBe(true);

    // 4. Wrong countdown ranks rejected
    const badCountdown = structuredClone(FORMAT_SAMPLE_STORYBOARDS.top3_countdown);
    if (badCountdown.scenes[1]?.type === 'countdown_item') {
      badCountdown.scenes[1].rank = 1;
    }
    const rankRes = validateVarietyRules(badCountdown, {
      formatSpec: REEL_FORMATS.top3_countdown,
    });
    expect(rankRes.ok).toBe(false);
    expect(rankRes.errors.some((e) => e.includes('ranked 3, 2, 1'))).toBe(true);

    // 5. Back-to-back duplicate scene types rejected outside allowed consecutive formats
    const dupMid = structuredClone(FORMAT_SAMPLE_STORYBOARDS.stat_shock);
    dupMid.scenes[2] = { ...dupMid.scenes[1]!, id: 'scene-3' };
    const dupMidRes = validateVarietyRules(dupMid, {
      formatSpec: REEL_FORMATS.stat_shock,
    });
    expect(dupMidRes.ok).toBe(false);
    expect(dupMidRes.errors.some((e) => e.includes('back-to-back'))).toBe(true);
  });

  it('restores distinct visual styles via restyleStoryboard without changing spoken narration', () => {
    const original = FORMAT_SAMPLE_STORYBOARDS.versus_battle;
    const origNarrHash = computeNarrationHash(original);
    const restyled = restyleStoryboard(original, [], 7777);

    expect(computeNarrationHash(restyled)).toBe(origNarrHash);
    expect(restyled.style?.background).not.toBe(original.style?.background);
    expect(restyled.style?.palette).not.toBe(original.style?.palette);
  });

  it('builds compact per-format JSON schemas without unsupported const keywords', () => {
    const schema = buildGeminiStoryboardJsonSchema(['hook_title', 'countdown_item', 'takeaway_cta']);
    const text = JSON.stringify(schema);
    expect(text).not.toContain('"const"');
    expect(text).toContain('countdownItem');
    expect(text).not.toContain('benchmarkBars');
    expect(text).not.toContain('versusSplit');
  });

  it('rotates voices cleanly across all 7 voices via LRU', () => {
    const history: ReelFingerprint[] = [];
    const picked: VoiceName[] = [];
    for (let i = 0; i < 7; i++) {
      const v = pickRotatedVoice(history, 'Puck');
      picked.push(v);
      history.unshift(
        computeReelFingerprint({
          id: `v-${i}`,
          title: `V ${i}`,
          createdAt: new Date(Date.now() + i * 1000).toISOString(),
          voiceName: v,
          storyboard: FORMAT_SAMPLE_STORYBOARDS.news_breakdown,
        }),
      );
    }
    expect(new Set(picked).size).toBe(7);
  });

  it('repairs missing emphasis verbatim, excludes diff on single-mode code_compare, and rejects spammy engagement bait', () => {
    const sb = structuredClone(FORMAT_SAMPLE_STORYBOARDS.hot_take);
    const firstScene = sb.scenes[0];
    if (firstScene?.type === 'hook_title') {
      firstScene.headline = 'Local Agent Loops Just Replaced Cron';
      firstScene.visual = { ...firstScene.visual, emphasis: ['NonexistentWord'] };
      const repaired = repairSceneEmphasis(firstScene);
      expect(repaired?.length).toBeGreaterThan(0);
      expect(
        repaired?.some((tok) =>
          firstScene.headline.toLowerCase().includes(tok.toLowerCase()),
        ),
      ).toBe(true);
    }

    const codeSingle = structuredClone(FORMAT_SAMPLE_STORYBOARDS.deep_dive_demo);
    for (const s of codeSingle.scenes) {
      if (s.type === 'code_compare') {
        s.mode = 'single';
        s.beforeCode = undefined;
      }
    }
    for (let seed = 0; seed < 12; seed++) {
      const planned = planReelVariety({
        pillar: 'coding_practices',
        history: [],
        requestedFormat: 'deep_dive_demo',
        seed,
      });
      const visualed = applyVisualPlan(codeSingle, {
        style: planned.style,
        format: planned.format,
        history: [],
        seed,
      });
      for (const s of visualed.scenes) {
        if (s.type === 'code_compare') {
          expect(s.visual?.layout).not.toBe('diff');
        }
      }
    }

    const spammy = structuredClone(FORMAT_SAMPLE_STORYBOARDS.hot_take);
    spammy.caption = 'Comment GUIDE and DM me for the script.';
    const ctaScene = spammy.scenes.find((s) => s.type === 'takeaway_cta');
    if (ctaScene?.type === 'takeaway_cta') {
      ctaScene.ctaText = 'Comment GUIDE below!';
    }
    const baitRes = validateVarietyRules(spammy, { formatSpec: REEL_FORMATS.hot_take });
    expect(baitRes.ok).toBe(false);
    expect(baitRes.errors.some((e) => e.toLowerCase().includes('engagement-bait'))).toBe(true);
  });
});
