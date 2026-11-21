import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDeliveryFfmpegArgs,
  buildSfxCuesForStoryboard,
  encodeDeliveryReel,
  ensureMusicAndSfxLibrary,
  extractSocialImageUrl,
  fetchSourceVisual,
  FORMAT_SAMPLE_STORYBOARDS,
  generateVeoBrollClip,
  loadEnv,
  MUSIC_MOOD_IDS,
  probeVideo,
  resolveMusicTrackForMood,
  SFX_IDS,
  type SceneTiming,
  type VeoClientLike,
} from '@post/core';

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Audio Variety Library, Ducking Mix, Source Visuals & Veo B-Roll', () => {
  it('generates 5 distinct valid mood WAV loops and 5 SFX WAV files', () => {
    const musicDir = makeTmpDir('post-music-');
    const lib = ensureMusicAndSfxLibrary(musicDir);

    const hashes = new Set<string>();
    for (const mood of MUSIC_MOOD_IDS) {
      const p = lib.moods[mood];
      expect(fs.existsSync(p)).toBe(true);
      const buf = fs.readFileSync(p);
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE');
      // 12 seconds * 48000 * 4 bytes + 44 header
      expect(buf.byteLength).toBe(12 * 48000 * 4 + 44);
      hashes.add(createHash('sha256').update(buf).digest('hex'));
    }
    expect(hashes.size).toBe(MUSIC_MOOD_IDS.length);

    for (const sfxId of SFX_IDS) {
      const p = lib.sfx[sfxId];
      expect(fs.existsSync(p)).toBe(true);
      const buf = fs.readFileSync(p);
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    }

    // User drop-in under data/music/<mood>/ overrides generated mood track
    const moodCustomDir = path.join(musicDir, 'upbeat_pulse');
    fs.mkdirSync(moodCustomDir, { recursive: true });
    const customFile = path.join(moodCustomDir, 'custom-track.wav');
    fs.copyFileSync(lib.moods.upbeat_pulse, customFile);
    expect(resolveMusicTrackForMood(musicDir, 'upbeat_pulse', 0)).toBe(customFile);

    // User drop-in under data/sfx/pop.wav overrides generated SFX file
    const sfxDir = path.join(path.dirname(musicDir), 'sfx');
    fs.mkdirSync(sfxDir, { recursive: true });
    const customPop = path.join(sfxDir, 'pop.wav');
    fs.copyFileSync(lib.sfx.pop, customPop);
    const customLib = ensureMusicAndSfxLibrary(musicDir, sfxDir);
    expect(customLib.sfx.pop).toBe(customPop);
  });

  it('places mid-scene foley cues within cap (<=14 total) and respects 550ms minimum spacing', () => {
    const workDir = makeTmpDir('post-foley-');
    const lib = ensureMusicAndSfxLibrary(path.join(workDir, 'music'), path.join(workDir, 'sfx'));
    const sb = FORMAT_SAMPLE_STORYBOARDS.myth_vs_fact;
    const timings: SceneTiming[] = sb.scenes.map((s, idx) => ({
      sceneId: s.id,
      sceneType: s.type,
      label: s.type,
      startMs: idx * 3200,
      endMs: (idx + 1) * 3200,
      startFrame: idx * 96,
      durationInFrames: 96,
    }));

    const cues = buildSfxCuesForStoryboard(sb, timings, lib.sfx, [
      { text: 'actually', startMs: timings[1]!.startMs + 1400, endMs: timings[1]!.startMs + 1700 },
    ]);
    expect(cues[0]!.offsetMs).toBe(35);
    expect(cues.length).toBeLessThanOrEqual(14);
    expect(cues.length).toBeGreaterThan(sb.scenes.length);

    // Every pair of cues >= 550ms apart EXCEPT takeaway riser (130ms -> 820ms before scene start)
    const nonRiserCues = cues.filter((c) => c.path !== lib.sfx.riser);
    for (let i = 1; i < nonRiserCues.length; i++) {
      expect(nonRiserCues[i]!.offsetMs - nonRiserCues[i - 1]!.offsetMs).toBeGreaterThanOrEqual(550);
    }
  });

  it('builds transition SFX cues + takeaway riser and encodes spec-valid MP4 with ducking and without music', async () => {
    const workDir = makeTmpDir('post-mix-');
    const musicDir = path.join(workDir, 'music');
    const lib = ensureMusicAndSfxLibrary(musicDir);

    const sb = FORMAT_SAMPLE_STORYBOARDS.hot_take;
    const timings: SceneTiming[] = sb.scenes.map((s, idx) => ({
      sceneId: s.id,
      sceneType: s.type,
      label: s.type,
      startMs: idx * 800,
      endMs: (idx + 1) * 800,
      startFrame: idx * 24,
      durationInFrames: 24,
    }));

    const cues = buildSfxCuesForStoryboard(sb, timings, lib.sfx);
    expect(cues.length).toBeGreaterThanOrEqual(4);
    expect(cues.some((c) => c.path === lib.sfx.riser)).toBe(true);

    // Create 4.8s raw video & non-silent 48kHz stereo voice WAV
    const rawVideo = path.join(workDir, 'raw.mp4');
    const voiceWav = path.join(workDir, 'voice-48k.wav');
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x11131b:s=1080x1920:r=30:d=4.8',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        rawVideo,
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
        'sine=frequency=220:sample_rate=48000:duration=4.8',
        '-ac',
        '2',
        '-c:a',
        'pcm_s16le',
        voiceWav,
      ],
      { stdio: 'ignore' },
    );

    // 1. With mood music + sidechaincompress ducking + sfxCues
    const outWithMusic = path.join(workDir, 'final-music.mp4');
    const argsWithMusic = buildDeliveryFfmpegArgs({
      rawVideoPath: rawVideo,
      voice48kPath: voiceWav,
      outputMp4Path: outWithMusic,
      durationSec: 4.8,
      musicEnabled: true,
      musicPath: lib.moods.tension_build,
      musicVolumeDb: -22,
      sfxCues: cues,
    });
    expect(argsWithMusic.join(' ')).toContain('sidechaincompress');
    expect(argsWithMusic.join(' ')).toContain('asplit=2[voice_mix][voice_sc]');

    await encodeDeliveryReel({
      rawVideoPath: rawVideo,
      voice48kPath: voiceWav,
      outputMp4Path: outWithMusic,
      durationSec: 4.8,
      musicEnabled: true,
      musicPath: lib.moods.tension_build,
      musicVolumeDb: -22,
      sfxCues: cues,
    });
    const probeMusic = await probeVideo(outWithMusic);
    expect(probeMusic.ok, probeMusic.errors.join('; ')).toBe(true);

    // 2. Without music (must NOT emit unconnected voice_sc)
    const outNoMusic = path.join(workDir, 'final-nomusic.mp4');
    const argsNoMusic = buildDeliveryFfmpegArgs({
      rawVideoPath: rawVideo,
      voice48kPath: voiceWav,
      outputMp4Path: outNoMusic,
      durationSec: 4.8,
      musicEnabled: false,
      sfxCues: cues,
    });
    expect(argsNoMusic.join(' ')).not.toContain('sidechaincompress');
    expect(argsNoMusic.join(' ')).not.toContain('voice_sc');

    await encodeDeliveryReel({
      rawVideoPath: rawVideo,
      voice48kPath: voiceWav,
      outputMp4Path: outNoMusic,
      durationSec: 4.8,
      musicEnabled: false,
      sfxCues: cues,
    });
    const probeNoMusic = await probeVideo(outNoMusic);
    expect(probeNoMusic.ok, probeNoMusic.errors.join('; ')).toBe(true);
  });

  it('extracts and normalizes og:image / twitter:image safely and returns null on missing or SVG images', async () => {
    expect(
      extractSocialImageUrl(
        '<html><head><meta property="og:image" content="/img/hero.png"></head></html>',
        'https://example.com/posts/1',
      ),
    ).toBe('https://example.com/img/hero.png');

    expect(
      extractSocialImageUrl(
        '<html><head><meta name="twitter:image" content="https://cdn.example.com/card.jpg"></head></html>',
        'https://example.com/posts/1',
      ),
    ).toBe('https://cdn.example.com/card.jpg');

    const workDir = makeTmpDir('post-srcvis-');
    // Generate a tiny real JPEG buffer to serve via mocked fetchImpl
    const sampleJpgPath = path.join(workDir, 'input.jpg');
    execFileSync(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'color=c=0x22d3ee:s=1600x900:d=0.1', '-frames:v', '1', sampleJpgPath],
      { stdio: 'ignore' },
    );
    const sampleJpgBytes = fs.readFileSync(sampleJpgPath);

    const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

    const asset = await fetchSourceVisual({
      url: 'https://example.com/launch',
      outDir: workDir,
      lookupImpl: publicLookup,
      fetchImpl: (async (input: string | URL | Request) => {
        const url = String(input);
        if (url === 'https://example.com/launch') {
          return new Response(
            '<html><head><meta property="og:image" content="/assets/banner.jpg"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response(sampleJpgBytes, {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        });
      }) as typeof fetch,
    });

    expect(asset).not.toBeNull();
    expect(asset?.kind).toBe('image');
    expect(asset?.file).toBe('source-visual.jpg');
    expect(asset?.width).toBe(1080);

    // SVG must be rejected cleanly -> returns null
    const svgRes = await fetchSourceVisual({
      url: 'https://example.com/svg-page',
      outDir: workDir,
      lookupImpl: publicLookup,
      fetchImpl: (async (input: string | URL | Request) => {
        if (String(input).endsWith('/svg-page')) {
          return new Response(
            '<html><head><meta property="og:image" content="https://example.com/logo.svg"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        }
        return new Response('<svg></svg>', {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        });
      }) as typeof fetch,
    });
    expect(svgRes).toBeNull();

    // Missing og:image returns null
    const missingRes = await fetchSourceVisual({
      url: 'https://example.com/plain',
      outDir: workDir,
      lookupImpl: publicLookup,
      fetchImpl: (async () =>
        new Response('<html><body>No meta tags</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })) as typeof fetch,
    });
    expect(missingRes).toBeNull();
  });

  it('handles Veo B-roll generation success and graceful error fallback via mocked client', async () => {
    const workDir = makeTmpDir('post-broll-');
    const env = loadEnv({ DATA_DIR: workDir, GEMINI_API_KEY: 'test-key' });

    // Create a valid 2-second MP4 fixture to return via files.download mock
    const fixtureMp4 = path.join(workDir, 'fixture-broll.mp4');
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x1e293b:s=360x640:r=30:d=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        fixtureMp4,
      ],
      { stdio: 'ignore' },
    );

    let pollCount = 0;
    const okClient: VeoClientLike = {
      models: {
        generateVideos: async () => ({ name: 'op-1', done: false }) as never,
      },
      operations: {
        getVideosOperation: async () => {
          pollCount++;
          return {
            name: 'op-1',
            done: true,
            response: { generatedVideos: [{ video: { uri: 'https://example.com/v.mp4' } }] },
          } as never;
        },
      },
      files: {
        download: async ({ downloadPath }) => {
          fs.copyFileSync(fixtureMp4, downloadPath);
        },
      },
    };

    const okRes = await generateVeoBrollClip({
      env,
      sceneId: 'Scene 2!',
      prompt: 'Dark server rack glowing cyan',
      outDir: workDir,
      pollIntervalMs: 5,
      client: okClient,
    });
    expect(pollCount).toBe(1);
    expect(okRes.asset).not.toBeNull();
    expect(okRes.asset?.file).toBe('broll-scene-2-.mp4');
    expect(okRes.asset?.durationMs).toBeGreaterThanOrEqual(1500);

    // Error fallback never throws
    const failClient: VeoClientLike = {
      models: {
        generateVideos: async () => {
          throw new Error('Quota exceeded');
        },
      },
      operations: {
        getVideosOperation: async () => ({ done: true }) as never,
      },
      files: {
        download: async () => {},
      },
    };
    const failRes = await generateVeoBrollClip({
      env,
      sceneId: 'scene-3',
      prompt: 'Glowing chip',
      outDir: workDir,
      client: failClient,
    });
    expect(failRes.asset).toBeNull();
    expect(failRes.warning).toContain('Quota exceeded');
  });
});
