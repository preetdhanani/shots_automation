import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BACKGROUND_IDS,
  BROLL_SAMPLE_STORYBOARD,
  CAPTION_STYLE_IDS,
  DEFAULT_REEL_STYLE,
  FORMAT_SAMPLE_STORYBOARDS,
  REEL_FORMAT_IDS,
  SCENE_LAYOUTS,
  SCENE_SHORT_LABELS,
  SCENE_TYPES,
  TRANSITION_IDS,
  TYPOGRAPHY_IDS,
  type CaptionToken,
  type ReelAssetRef,
  type ReelScene,
  type ReelStoryboard,
  type ReelStyle,
  type SceneTiming,
  type SceneType,
} from '@post/core';
import {
  renderVerificationStills,
  VIDEO_FPS,
  type ReelCompositionProps,
  type VerificationStillJob,
} from '@post/video';
import type { VerifyCheck } from './types.js';

/** Extracts a 16x16 grayscale luminance buffer (256 bytes) using FFmpeg. */
function decodeGray16x16(imagePath: string, cropFilter?: string): Uint8Array {
  const vf = cropFilter
    ? `${cropFilter},scale=16:16:flags=area,format=gray`
    : 'scale=16:16:flags=area,format=gray';
  const buf = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      imagePath,
      '-vf',
      vf,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      'pipe:1',
    ],
    { maxBuffer: 1024 * 1024 },
  );
  if (buf.byteLength < 256) {
    throw new Error(`Unexpected grayscale decode size (${buf.byteLength}) for ${imagePath}`);
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, 256);
}

function luminanceStdDev(gray: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i]!;
  const mean = sum / gray.length;
  let sq = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i]! - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / gray.length);
}

function visualDifference(
  a: Uint8Array,
  b: Uint8Array,
): { hammingBits: number; meanAbsDiff: number } {
  let sumA = 0;
  let sumB = 0;
  let absSum = 0;
  for (let i = 0; i < 256; i++) {
    sumA += a[i]!;
    sumB += b[i]!;
    absSum += Math.abs(a[i]! - b[i]!);
  }
  const meanA = sumA / 256;
  const meanB = sumB / 256;
  let hammingBits = 0;
  for (let i = 0; i < 256; i++) {
    if (a[i]! >= meanA !== b[i]! >= meanB) hammingBits++;
  }
  return { hammingBits, meanAbsDiff: absSum / 256 };
}

function buildContactSheet(
  imagePaths: string[],
  outPath: string,
  cols: number,
  workDir: string,
): void {
  if (imagePaths.length === 0) return;
  const rows = Math.ceil(imagePaths.length / cols);
  const seqDir = path.join(workDir, `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(seqDir, { recursive: true });
  imagePaths.forEach((src, idx) => {
    const dst = path.join(seqDir, `img-${String(idx + 1).padStart(3, '0')}.jpg`);
    fs.copyFileSync(src, dst);
  });

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-i',
      path.join(seqDir, 'img-%03d.jpg'),
      '-vf',
      `scale=324:576,tile=${cols}x${rows}:padding=10:margin=12:color=0x0b0d14`,
      '-frames:v',
      '1',
      outPath,
    ],
    { stdio: 'ignore' },
  );
}

function makeSingleSceneProps(
  scene: ReelScene,
  opts: {
    pillar?: ReelStoryboard['pillar'];
    style?: ReelStyle;
    assets?: Record<string, ReelAssetRef>;
    withActiveCaption?: boolean;
  } = {},
): ReelCompositionProps {
  const frames = 120;
  const durationMs = (frames / VIDEO_FPS) * 1000;
  const storyboard: ReelStoryboard = {
    title: 'Verification Still',
    pillar: opts.pillar ?? 'ai_news',
    format: 'news_breakdown',
    style: opts.style ?? { ...DEFAULT_REEL_STYLE },
    assets: opts.assets,
    caption: 'Verification still caption text.',
    hashtags: ['#ai', '#verify', '#dev'],
    sources: [{ title: 'Verify', url: 'https://example.com' }],
    scenes: [scene],
  };

  const sceneTimings: SceneTiming[] = [
    {
      sceneId: scene.id,
      sceneType: scene.type,
      label: SCENE_SHORT_LABELS[scene.type],
      startMs: 0,
      endMs: durationMs,
      startFrame: 0,
      durationInFrames: frames,
    },
  ];

  const captions: CaptionToken[] = opts.withActiveCaption
    ? [
        { text: 'Verify', startMs: 0, endMs: 450 },
        { text: ' every', startMs: 450, endMs: 900 },
        { text: ' layout', startMs: 900, endMs: 1400 },
        { text: ' automatically', startMs: 1400, endMs: 2200 },
      ]
    : [];

  return {
    storyboard,
    captions,
    sceneTimings,
    audioDurationMs: durationMs,
    brandHandle: '',
    fps: VIDEO_FPS,
  };
}

function makeTwoSceneTransitionProps(secondScene: ReelScene): ReelCompositionProps {
  const hookScene = findSampleSceneOfType('hook_title');
  const s1Frames = 60;
  const s2Frames = 90;
  const s1Ms = (s1Frames / VIDEO_FPS) * 1000;
  const totalMs = ((s1Frames + s2Frames) / VIDEO_FPS) * 1000;
  const storyboard: ReelStoryboard = {
    title: 'Transition Verification',
    pillar: 'ai_news',
    format: 'news_breakdown',
    style: { ...DEFAULT_REEL_STYLE },
    caption: 'Transition verification storyboard.',
    hashtags: ['#ai', '#verify', '#dev'],
    sources: [{ title: 'Verify', url: 'https://example.com' }],
    scenes: [
      {
        ...hookScene,
        id: 'tr-s1',
        visual: { layout: 'stacked', transition: 'fade', camera: 'none' },
      },
      {
        ...secondScene,
        id: 'tr-s2',
      },
    ],
  };

  return {
    storyboard,
    captions: [],
    sceneTimings: [
      {
        sceneId: 'tr-s1',
        sceneType: hookScene.type,
        label: SCENE_SHORT_LABELS[hookScene.type],
        startMs: 0,
        endMs: s1Ms,
        startFrame: 0,
        durationInFrames: s1Frames,
      },
      {
        sceneId: 'tr-s2',
        sceneType: secondScene.type,
        label: SCENE_SHORT_LABELS[secondScene.type],
        startMs: s1Ms,
        endMs: totalMs,
        startFrame: s1Frames,
        durationInFrames: s2Frames,
      },
    ],
    audioDurationMs: totalMs,
    brandHandle: '',
    fps: VIDEO_FPS,
  };
}

function findSampleSceneOfType(sceneType: SceneType): ReelScene {
  if (sceneType === 'ai_media_clip') {
    const found = BROLL_SAMPLE_STORYBOARD.scenes.find((s) => s.type === 'ai_media_clip');
    if (found) return structuredClone(found);
  }
  for (const formatId of REEL_FORMAT_IDS) {
    const found = FORMAT_SAMPLE_STORYBOARDS[formatId].scenes.find((s) => s.type === sceneType);
    if (found) return structuredClone(found);
  }
  throw new Error(`No sample scene found for type "${sceneType}"`);
}

function makeFixtureAssets(assetDir: string): Record<string, ReelAssetRef> {
  fs.mkdirSync(assetDir, { recursive: true });
  const imgFile = 'verify-source.jpg';
  const vidFile = 'verify-broll.mp4';

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1080x720:duration=0.1',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      path.join(assetDir, imgFile),
    ],
    { stdio: 'ignore' },
  );

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=540x960:rate=30:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      path.join(assetDir, vidFile),
    ],
    { stdio: 'ignore' },
  );

  return {
    source: { kind: 'image', file: imgFile, width: 1080, height: 720 },
    broll: { kind: 'video', file: vidFile, durationMs: 2000 },
  };
}

export const checkRemotionVisualVariety: VerifyCheck = {
  id: '08-remotion-visual-variety',
  title: 'Real Remotion Still Renders: All 16 Scenes x Layouts, Backgrounds, Transitions, Captions, Typographies & Formats',
  async run(ctx) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-remotion-verify-'));
    const stillsDir = path.join(workDir, 'stills');
    const assetDir = path.join(workDir, 'assets');
    fs.mkdirSync(stillsDir, { recursive: true });

    try {
      const sharedAssets = makeFixtureAssets(assetDir);
      const cacheDirAbs = path.join(ctx.workspaceRoot, '.cache');

      const jobs: VerificationStillJob[] = [];
      const sceneLayoutPaths = new Map<SceneType, Array<{ layout: string; path: string }>>();
      const bgPaths: Array<{ id: string; path: string }> = [];
      const transitionPaths: Array<{ id: string; path: string }> = [];
      const captionPaths: Array<{ id: string; path: string }> = [];
      const typographyPaths: Array<{ id: string; path: string }> = [];
      const formatPaths: Array<{ id: string; path: string }> = [];
      const frame0CoverPaths: Array<{ id: string; path: string }> = [];
      const motionGroups: Array<{
        label: string;
        f10: string;
        f42: string;
        f84: string;
      }> = [];

      // 1. Every scene type x every layout (including real image/video assets for source_spotlight & ai_media_clip)
      for (const sceneType of SCENE_TYPES) {
        const layouts = SCENE_LAYOUTS[sceneType] as readonly string[];
        const list: Array<{ layout: string; path: string }> = [];
        for (const layout of layouts) {
          const baseScene = findSampleSceneOfType(sceneType);
          const sceneCopy: ReelScene = {
            ...baseScene,
            visual: {
              ...(baseScene.visual ?? {}),
              layout,
              transition: 'fade',
              camera: 'none',
            },
          };

          let assets: Record<string, ReelAssetRef> | undefined;
          if (sceneCopy.type === 'source_spotlight') {
            sceneCopy.imageAsset = 'source';
            assets = { source: sharedAssets.source! };
          } else if (sceneCopy.type === 'ai_media_clip') {
            sceneCopy.videoAsset = 'broll';
            assets = { broll: sharedAssets.broll! };
          }

          const outPath = path.join(stillsDir, `scene-${sceneType}-${layout}.jpg`);
          jobs.push({
            id: `scene:${sceneType}:${layout}`,
            outputPath: outPath,
            frame: 42,
            props: makeSingleSceneProps(sceneCopy, { assets }),
          });
          list.push({ layout, path: outPath });
        }
        sceneLayoutPaths.set(sceneType, list);
      }

      // Also render fallback states (missing assets) for source_spotlight and ai_media_clip
      const sourceFallbackPath = path.join(stillsDir, 'fallback-source-spotlight.jpg');
      {
        const s = findSampleSceneOfType('source_spotlight');
        if (s.type === 'source_spotlight') delete s.imageAsset;
        jobs.push({
          id: 'fallback:source_spotlight',
          outputPath: sourceFallbackPath,
          frame: 42,
          props: makeSingleSceneProps(s),
        });
      }
      const brollFallbackPath = path.join(stillsDir, 'fallback-ai-media-clip.jpg');
      {
        const s = findSampleSceneOfType('ai_media_clip');
        if (s.type === 'ai_media_clip') delete s.videoAsset;
        jobs.push({
          id: 'fallback:ai_media_clip',
          outputPath: brollFallbackPath,
          frame: 42,
          props: makeSingleSceneProps(s),
        });
      }

      // 2. All 6 backgrounds
      const hookBase = findSampleSceneOfType('hook_title');
      for (const bg of BACKGROUND_IDS) {
        const outPath = path.join(stillsDir, `bg-${bg}.jpg`);
        jobs.push({
          id: `bg:${bg}`,
          outputPath: outPath,
          frame: 42,
          props: makeSingleSceneProps(
            { ...hookBase, visual: { layout: 'stacked', transition: 'fade', camera: 'none' } },
            { style: { ...DEFAULT_REEL_STYLE, background: bg }, pillar: 'harnesses' },
          ),
        });
        bgPaths.push({ id: bg, path: outPath });
      }

      // 3. All 8 transitions captured on Scene 2 mid-enter frame (63 = 3 frames into Scene 2 where isFirst=false)
      const trTargetScene = findSampleSceneOfType('countdown_item');
      for (const tr of TRANSITION_IDS) {
        const outPath = path.join(stillsDir, `tr-${tr}.jpg`);
        jobs.push({
          id: `tr:${tr}`,
          outputPath: outPath,
          frame: 63,
          props: makeTwoSceneTransitionProps({
            ...trTargetScene,
            visual: { layout: 'badge_side', transition: tr, camera: 'none' },
          }),
        });
        transitionPaths.push({ id: tr, path: outPath });
      }

      // 4. All 4 caption styles + editorial_serif/bold_pop contrast check at active word frame 33
      for (const cap of CAPTION_STYLE_IDS) {
        const outPath = path.join(stillsDir, `cap-${cap}.jpg`);
        jobs.push({
          id: `cap:${cap}`,
          outputPath: outPath,
          frame: 33,
          props: makeSingleSceneProps(
            { ...hookBase, visual: { layout: 'stacked', transition: 'fade', camera: 'none' } },
            {
              style: { ...DEFAULT_REEL_STYLE, captionStyle: cap },
              withActiveCaption: true,
            },
          ),
        });
        captionPaths.push({ id: cap, path: outPath });
      }

      const serifBoldPopPath = path.join(stillsDir, 'cap-serif-bold-pop.jpg');
      jobs.push({
        id: 'cap:serif-bold-pop',
        outputPath: serifBoldPopPath,
        frame: 33,
        props: makeSingleSceneProps(
          { ...hookBase, visual: { layout: 'stacked', transition: 'fade', camera: 'none' } },
          {
            style: { ...DEFAULT_REEL_STYLE, typography: 'editorial_serif', captionStyle: 'bold_pop' },
            withActiveCaption: true,
          },
        ),
      });

      // 5. All 4 typographies
      for (const typo of TYPOGRAPHY_IDS) {
        const outPath = path.join(stillsDir, `typo-${typo}.jpg`);
        jobs.push({
          id: `typo:${typo}`,
          outputPath: outPath,
          frame: 42,
          props: makeSingleSceneProps(
            { ...hookBase, visual: { layout: 'impact_center', transition: 'fade', camera: 'none' } },
            { style: { ...DEFAULT_REEL_STYLE, typography: typo } },
          ),
        });
        typographyPaths.push({ id: typo, path: outPath });
      }

      // 6. Mid-scene frame for all 8 format sample storyboards
      for (const formatId of REEL_FORMAT_IDS) {
        const sb = structuredClone(FORMAT_SAMPLE_STORYBOARDS[formatId]);
        const framesPerScene = 90;
        const msPerScene = (framesPerScene / VIDEO_FPS) * 1000;
        // Attach fixture image for source_spotlight inside news_breakdown
        let assets: Record<string, ReelAssetRef> | undefined;
        sb.scenes = sb.scenes.map((s) => {
          if (s.type === 'source_spotlight') {
            assets = { source: sharedAssets.source! };
            return { ...s, imageAsset: 'source' };
          }
          return s;
        });
        if (assets) sb.assets = assets;

        const sceneTimings: SceneTiming[] = sb.scenes.map((s, idx) => ({
          sceneId: s.id,
          sceneType: s.type,
          label: SCENE_SHORT_LABELS[s.type],
          startMs: idx * msPerScene,
          endMs: (idx + 1) * msPerScene,
          startFrame: idx * framesPerScene,
          durationInFrames: framesPerScene,
        }));

        const outPath = path.join(stillsDir, `format-${formatId}.jpg`);
        jobs.push({
          id: `format:${formatId}`,
          outputPath: outPath,
          // Capture mid-point of Scene 2 (signature middle scene of each format)
          frame: framesPerScene + 45,
          props: {
            storyboard: sb,
            captions: [
              { text: 'Verify', startMs: msPerScene + 1100, endMs: msPerScene + 1450 },
              { text: ' every', startMs: msPerScene + 1450, endMs: msPerScene + 1850 },
              { text: ' format', startMs: msPerScene + 1850, endMs: msPerScene + 2300 },
            ],
            sceneTimings,
            audioDurationMs: sb.scenes.length * msPerScene,
            brandHandle: '',
            fps: VIDEO_FPS,
          },
        });
        formatPaths.push({ id: formatId, path: outPath });
      }

      // 7. Frame 0 Cover Stills (settled layout & caption-free at frame 0)
      const openerTypes: SceneType[] = [
        'hook_title',
        'versus_split',
        'benchmark_bars',
        'big_stat',
        'myth_fact',
      ];
      for (const opType of openerTypes) {
        const opScene = findSampleSceneOfType(opType);
        const outPath = path.join(stillsDir, `cover-f0-${opType}.jpg`);
        jobs.push({
          id: `cover-f0:${opType}`,
          outputPath: outPath,
          frame: 0,
          props: makeSingleSceneProps(opScene, { withActiveCaption: true }),
        });
        frame0CoverPaths.push({ id: opType, path: outPath });
      }
      const coverHookNoCapPath = path.join(stillsDir, 'cover-f0-hook-no-cap.jpg');
      jobs.push({
        id: 'cover-f0:hook-no-cap',
        outputPath: coverHookNoCapPath,
        frame: 0,
        props: makeSingleSceneProps(findSampleSceneOfType('hook_title'), {
          withActiveCaption: false,
        }),
      });

      // 8. Multi-frame intra-scene motion verification (frames 10, 42, 84)
      const baseCodeScene = findSampleSceneOfType('code_compare');
      const codeFocusScene: ReelScene =
        baseCodeScene.type === 'code_compare'
          ? {
              ...baseCodeScene,
              mode: 'before_after',
              beforeCode: baseCodeScene.beforeCode ?? 'const slow = items.map(fn);',
              visual: { layout: 'focus', transition: 'fade', camera: 'none' },
            }
          : baseCodeScene;
      const motionTargets: Array<{ label: string; scene: ReelScene }> = [
        { label: 'code_focus', scene: codeFocusScene },
        { label: 'benchmark_bars', scene: findSampleSceneOfType('benchmark_bars') },
        { label: 'line_chart', scene: findSampleSceneOfType('line_chart') },
        { label: 'checklist_steps', scene: findSampleSceneOfType('checklist_steps') },
      ];
      for (const target of motionTargets) {
        const f10 = path.join(stillsDir, `motion-${target.label}-10.jpg`);
        const f42 = path.join(stillsDir, `motion-${target.label}-42.jpg`);
        const f84 = path.join(stillsDir, `motion-${target.label}-84.jpg`);
        const props = makeSingleSceneProps(target.scene);
        jobs.push({ id: `motion:${target.label}:10`, outputPath: f10, frame: 10, props });
        jobs.push({ id: `motion:${target.label}:42`, outputPath: f42, frame: 42, props });
        jobs.push({ id: `motion:${target.label}:84`, outputPath: f84, frame: 84, props });
        motionGroups.push({ label: target.label, f10, f42, f84 });
      }

      // 9. Opening settle (isFirst camera=none frame 0 vs frame 14) & closing dissolve (isLast frame 42 vs frame 88)
      const baseHook = findSampleSceneOfType('hook_title');
      const openHookScene: ReelScene = {
        ...baseHook,
        visual: { ...(baseHook.visual ?? {}), camera: 'none', transition: 'fade' },
      };
      const openF0 = path.join(stillsDir, 'opening-f0.jpg');
      const openF14 = path.join(stillsDir, 'opening-f14.jpg');
      const openProps = makeSingleSceneProps(openHookScene);
      jobs.push({ id: 'open:f0', outputPath: openF0, frame: 0, props: openProps });
      jobs.push({ id: 'open:f14', outputPath: openF14, frame: 14, props: openProps });

      const baseTakeaway = findSampleSceneOfType('takeaway_cta');
      const closeTakeawayScene: ReelScene = {
        ...baseTakeaway,
        visual: { ...(baseTakeaway.visual ?? {}), camera: 'none', transition: 'fade' },
      };
      const closeF42 = path.join(stillsDir, 'closing-f42.jpg');
      const closeF118 = path.join(stillsDir, 'closing-f118.jpg');
      const closeProps = makeSingleSceneProps(closeTakeawayScene);
      jobs.push({ id: 'closing:takeaway-mid', outputPath: closeF42, frame: 42, props: closeProps });
      jobs.push({ id: 'closing:takeaway-end', outputPath: closeF118, frame: 118, props: closeProps });

      await renderVerificationStills({
        cacheDirAbs,
        jobs,
        assetDir,
        sharedAssets,
        scale: 0.5,
        imageFormat: 'jpeg',
      });
      ctx.recordAssertion(`Rendered ${jobs.length} real Remotion stills with 1 reused Chrome instance`);

      // Automated pixel assertions: non-blank check on every still (exempt closing dissolve final frame)
      const decodedCache = new Map<string, Uint8Array>();
      const getGray = (p: string): Uint8Array => {
        let g = decodedCache.get(p);
        if (!g) {
          g = decodeGray16x16(p);
          decodedCache.set(p, g);
        }
        return g;
      };

      for (const job of jobs) {
        if (!fs.existsSync(job.outputPath)) {
          throw new Error(`Missing rendered still for ${job.id}: ${job.outputPath}`);
        }
        if (job.id === 'closing:takeaway-end') continue;
        const std = luminanceStdDev(getGray(job.outputPath));
        const minStd = job.id.startsWith('tr:') ? 4 : 5;
        if (std < minStd) {
          throw new Error(
            `Rendered still ${job.id} looks blank/flat (stdDev=${std.toFixed(2)}, min=${minStd})`,
          );
        }
      }
      ctx.recordAssertion(`Verified all ${jobs.length} stills are non-blank (luminance stdDev >= 8)`);

      // Distinctness check: layout variants of the same scene type must differ visually
      for (const [sceneType, list] of sceneLayoutPaths.entries()) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const diff = visualDifference(getGray(list[i]!.path), getGray(list[j]!.path));
            if (diff.hammingBits < 2 && diff.meanAbsDiff < 2.0) {
              throw new Error(
                `Layouts "${list[i]!.layout}" and "${list[j]!.layout}" of scene "${sceneType}" look visually identical (hamming=${diff.hammingBits}, mad=${diff.meanAbsDiff.toFixed(2)})`,
              );
            }
          }
        }
      }
      ctx.recordAssertion('Verified layout variants of all 16 scene types are visually distinct');

      // Asset vs fallback distinctness for source_spotlight & ai_media_clip
      const srcAssetPath = sceneLayoutPaths.get('source_spotlight')![0]!.path;
      const srcDiff = visualDifference(getGray(srcAssetPath), getGray(sourceFallbackPath));
      if (srcDiff.meanAbsDiff < 3.0) {
        throw new Error('source_spotlight with real image asset did not differ from fallback');
      }
      const brollAssetPath = sceneLayoutPaths.get('ai_media_clip')![0]!.path;
      const brollDiff = visualDifference(getGray(brollAssetPath), getGray(brollFallbackPath));
      if (brollDiff.meanAbsDiff < 3.0) {
        throw new Error('ai_media_clip with real MP4 asset did not differ from fallback');
      }
      ctx.recordAssertion('Verified source_spotlight <Img> and ai_media_clip <OffthreadVideo> render real assets and fallbacks');

      // Distinctness across backgrounds & caption styles
      let distinctBgPairs = 0;
      for (let i = 1; i < bgPaths.length; i++) {
        const diff = visualDifference(getGray(bgPaths[0]!.path), getGray(bgPaths[i]!.path));
        if (diff.hammingBits >= 2 || diff.meanAbsDiff >= 1.5) distinctBgPairs++;
      }
      if (distinctBgPairs < bgPaths.length - 1) {
        throw new Error(`Expected all backgrounds to differ from dot_grid (got ${distinctBgPairs})`);
      }

      // Compare caption region specifically (y=70%..88%) so the caption strip isn't diluted by background pixels
      const capCrop = 'crop=iw:ih*0.18:0:ih*0.70';
      const baseCapGray = decodeGray16x16(captionPaths[0]!.path, capCrop);
      let distinctCapPairs = 0;
      for (let i = 1; i < captionPaths.length; i++) {
        const diff = visualDifference(baseCapGray, decodeGray16x16(captionPaths[i]!.path, capCrop));
        if (diff.hammingBits >= 2 || diff.meanAbsDiff >= 1.5) distinctCapPairs++;
      }
      if (distinctCapPairs < captionPaths.length - 1) {
        throw new Error(`Expected all caption styles to differ from glass_box (got ${distinctCapPairs})`);
      }
      ctx.recordAssertion('Verified backgrounds and caption styles render visibly distinct pixels');

      // Scene 2 mid-enter transitions must visually differentiate from fade
      const fadeGray = getGray(transitionPaths.find((t) => t.id === 'fade')!.path);
      let distinctTransitionCount = 0;
      for (const tr of transitionPaths) {
        if (tr.id === 'fade') continue;
        const diff = visualDifference(fadeGray, getGray(tr.path));
        if (diff.hammingBits >= 2 || diff.meanAbsDiff >= 0.8) distinctTransitionCount++;
      }
      if (distinctTransitionCount < 5) {
        throw new Error(`Expected Scene 2 transitions to differ visibly from fade (got ${distinctTransitionCount})`);
      }

      // Frame 0 covers must be non-blank/settled AND caption-free in bottom caption zone
      for (const cov of frame0CoverPaths) {
        const std = luminanceStdDev(getGray(cov.path));
        if (std < 8) {
          throw new Error(`Frame 0 cover ${cov.id} looks unsettled/blank (stdDev=${std.toFixed(2)})`);
        }
      }
      const f0HookGrayCap = decodeGray16x16(frame0CoverPaths[0]!.path, capCrop);
      const f0HookGrayNoCap = decodeGray16x16(coverHookNoCapPath, capCrop);
      const f0CapDiff = visualDifference(f0HookGrayCap, f0HookGrayNoCap);
      if (f0CapDiff.meanAbsDiff >= 0.5) {
        throw new Error(
          `Expected Frame 0 cover to hide captions (caption zone diff mad=${f0CapDiff.meanAbsDiff.toFixed(2)})`,
        );
      }

      // Multi-frame intra-scene motion must produce visual change across frames 10 -> 42 -> 84
      for (const mg of motionGroups) {
        const d1 = visualDifference(getGray(mg.f10), getGray(mg.f42));
        const d2 = visualDifference(getGray(mg.f42), getGray(mg.f84));
        if ((d1.hammingBits < 2 && d1.meanAbsDiff < 0.35) || (d2.hammingBits < 2 && d2.meanAbsDiff < 0.35)) {
          throw new Error(
            `Insufficient mid-scene motion for ${mg.label}: d1=(${d1.hammingBits},${d1.meanAbsDiff.toFixed(2)}), d2=(${d2.hammingBits},${d2.meanAbsDiff.toFixed(2)})`,
          );
        }
      }
      // Opening settle check (frame 0 -> frame 14 with camera=none)
      const openDiff = visualDifference(getGray(openF0), getGray(openF14));
      if (openDiff.meanAbsDiff < 0.25) {
        throw new Error(
          `Expected smooth opening settle motion between frame 0 and frame 14 (mad=${openDiff.meanAbsDiff.toFixed(2)})`,
        );
      }

      // Closing dissolve check (isLast takeaway_cta frame 42 -> frame 118 must dissolve visibly)
      const closeMidStd = luminanceStdDev(getGray(closeF42));
      const closeEndStd = luminanceStdDev(getGray(closeF118));
      const closeDiff = visualDifference(getGray(closeF42), getGray(closeF118));
      if (closeEndStd >= closeMidStd || closeDiff.meanAbsDiff < 1.5) {
        throw new Error(
          `Expected smooth closing dissolve on isLast frame 118 (midStd=${closeMidStd.toFixed(2)}, endStd=${closeEndStd.toFixed(2)}, mad=${closeDiff.meanAbsDiff.toFixed(2)})`,
        );
      }

      ctx.recordAssertion(
        'Verified Scene 2 transitions, opening settle, closing dissolve, settled caption-free Frame 0 covers, and multi-frame intra-scene motion',
      );

      // Assemble visual contact sheets and attach them to the verification report
      const allSceneImgs = [
        ...Array.from(sceneLayoutPaths.values()).flatMap((l) => l.map((x) => x.path)),
        sourceFallbackPath,
        brollFallbackPath,
      ];
      const half = Math.ceil(allSceneImgs.length / 2);

      const sheet1 = path.join(workDir, '17-remotion-scenes-sheet-1.png');
      const sheet2 = path.join(workDir, '18-remotion-scenes-sheet-2.png');
      const sheet3 = path.join(workDir, '19-remotion-styles-sheet.png');
      const sheet4 = path.join(workDir, '20-remotion-formats-sheet.png');
      const sheet5 = path.join(workDir, '21-remotion-frame0-covers.png');

      buildContactSheet(allSceneImgs.slice(0, half), sheet1, 6, workDir);
      buildContactSheet(allSceneImgs.slice(half), sheet2, 6, workDir);
      buildContactSheet(
        [
          ...bgPaths.map((x) => x.path),
          ...captionPaths.map((x) => x.path),
          serifBoldPopPath,
          ...typographyPaths.map((x) => x.path),
          ...transitionPaths.map((x) => x.path),
        ],
        sheet3,
        6,
        workDir,
      );
      buildContactSheet(formatPaths.map((x) => x.path), sheet4, 4, workDir);
      buildContactSheet(frame0CoverPaths.map((x) => x.path), sheet5, 5, workDir);

      ctx.attachImage(
        '17-remotion-scenes-sheet-1',
        sheet1,
        'Contact sheet 1: Scene types & layout variants (part 1)',
      );
      ctx.attachImage(
        '18-remotion-scenes-sheet-2',
        sheet2,
        'Contact sheet 2: Scene types & layout variants (part 2 + fallbacks)',
      );
      ctx.attachImage(
        '19-remotion-styles-sheet',
        sheet3,
        'Contact sheet 3: Backgrounds, Captions (incl. serif+bold_pop), Typographies, Scene 2 Transitions',
      );
      ctx.attachImage(
        '20-remotion-formats-sheet',
        sheet4,
        'Contact sheet 4: All 8 Format Sample Storyboards (signature middle scenes)',
      );
      ctx.attachImage(
        '21-remotion-frame0-covers',
        sheet5,
        'Contact sheet 5: Frame 0 caption-free settled cover frames across opener-eligible scenes',
      );
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  },
};
