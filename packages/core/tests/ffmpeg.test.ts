import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDeliveryFfmpegArgs,
  concatVoiceSegmentsWithPause,
  detectGeminiAudioInput,
  getAudioDurationMs,
  prepareNormalizedVoicePair,
  verifyInstagramReelSpec,
} from '@post/core';

describe('FFmpeg Audio Detection, Delivery Args, & Instagram Spec Validator', () => {
  it('detects RIFF WAV vs raw PCM mimeType rate cleanly', () => {
    const riff = Buffer.from('RIFF1234WAVE', 'ascii');
    expect(detectGeminiAudioInput(riff, 'audio/l16;rate=24000')).toEqual({ kind: 'container' });

    const rawPcm = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(detectGeminiAudioInput(rawPcm, 'audio/L16;codec=pcm;rate=24000')).toEqual({
      kind: 'pcm',
      sampleRate: 24000,
      channels: 1,
    });
    expect(detectGeminiAudioInput(rawPcm, 'audio/pcm')).toEqual({
      kind: 'pcm',
      sampleRate: 24000,
      channels: 1,
    });
  });

  it('builds closed-GOP H.264 + 48kHz AAC-LC FFmpeg arguments', () => {
    const args = buildDeliveryFfmpegArgs({
      rawVideoPath: '/tmp/raw.mp4',
      voice48kPath: '/tmp/voice.wav',
      outputMp4Path: '/tmp/out.mp4',
      durationSec: 40,
      musicEnabled: false,
    });
    expect(args).toContain('+cgop');
    expect(args).toContain('open-gop=0:keyint=60:min-keyint=60:scenecut=0');
    expect(args).toContain('48000');
    expect(args).toContain('+faststart');

    const tmpMusicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-ffmpeg-args-'));
    try {
      const dummyMusic = path.join(tmpMusicDir, 'music.wav');
      const dummySfx = path.join(tmpMusicDir, 'pop.wav');
      fs.writeFileSync(dummyMusic, Buffer.alloc(64));
      fs.writeFileSync(dummySfx, Buffer.alloc(64));
      const musicArgs = buildDeliveryFfmpegArgs({
        rawVideoPath: '/tmp/raw.mp4',
        voice48kPath: '/tmp/voice.wav',
        outputMp4Path: '/tmp/out.mp4',
        durationSec: 40,
        musicEnabled: true,
        musicPath: dummyMusic,
        sfxCues: [{ path: dummySfx, offsetMs: 35, volumeDb: -21 }],
      });
      const filterComplex = musicArgs.join(' ');
      expect(filterComplex).toContain('volume=-17dB');
      expect(filterComplex).toContain('afade=t=in:st=0:d=0.28,afade=t=out:st=39.45:d=0.50');
      expect(filterComplex).toContain('adelay=35|35');
      expect(filterComplex).toContain('sidechaincompress=threshold=0.02:ratio=3.5:attack=15:release=220:makeup=1');
      expect(filterComplex).toContain('alimiter=limit=0.95:level=false,afade=t=in:st=0:d=0.02,afade=t=out:st=39.940:d=0.06[aout]');
    } finally {
      fs.rmSync(tmpMusicDir, { recursive: true, force: true });
    }
  });

  it('normalizes voice with loudnorm-first and alimiter level=false keeping peak <= -1.0 dB', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-voice-norm-'));
    try {
      const rawWav = path.join(tmpDir, 'raw.wav');
      const trimmed = path.join(tmpDir, 'trimmed.wav');
      const out48 = path.join(tmpDir, 'voice-48k.wav');
      const out16 = path.join(tmpDir, 'voice-16k.wav');

      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=220:sample_rate=24000:duration=2.5',
          '-filter:a',
          'volume=-8dB',
          '-c:a',
          'pcm_s16le',
          rawWav,
        ],
        { stdio: 'ignore' },
      );

      const rawBytes = fs.readFileSync(rawWav);
      const { durationMs } = await prepareNormalizedVoicePair({
        rawAudioPath: rawWav,
        rawBytes,
        mimeType: 'audio/wav',
        trimmedMasterPath: trimmed,
        output48kPath: out48,
        output16kPath: out16,
      });

      expect(durationMs).toBeGreaterThan(1500);
      expect(fs.existsSync(`${trimmed}.norm.wav`)).toBe(false);
      expect(fs.existsSync(out48)).toBe(true);
      expect(fs.existsSync(out16)).toBe(true);

      const probe = spawnSync(
        'ffmpeg',
        ['-i', out48, '-af', 'volumedetect', '-f', 'null', '-'],
        { encoding: 'utf8' },
      );
      const match = /max_volume:\s*([-\d.]+)\s*dB/.exec(probe.stderr || '');
      expect(match).not.toBeNull();
      expect(Number.parseFloat(match![1]!)).toBeLessThanOrEqual(-1.0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('concatenates main and outro voice segments with explicit silence pause and tail pad', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-voice-concat-'));
    try {
      const mainWav = path.join(tmpDir, 'main-48k.wav');
      const outroWav = path.join(tmpDir, 'outro-48k.wav');
      const out48 = path.join(tmpDir, 'joined-48k.wav');
      const out16 = path.join(tmpDir, 'joined-16k.wav');

      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=330:sample_rate=48000:duration=0.8',
          '-ac',
          '2',
          '-c:a',
          'pcm_s16le',
          mainWav,
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
          'sine=frequency=440:sample_rate=48000:duration=0.6',
          '-ac',
          '2',
          '-c:a',
          'pcm_s16le',
          outroWav,
        ],
        { stdio: 'ignore' },
      );

      const { durationMs } = await concatVoiceSegmentsWithPause({
        mainVoice48kPath: mainWav,
        outroVoice48kPath: outroWav,
        pauseMs: 450,
        tailPadMs: 220,
        output48kPath: out48,
        output16kPath: out16,
      });

      const expectedMs = 800 + 450 + 600 + 220;
      expect(durationMs).toBeGreaterThanOrEqual(expectedMs - 80);
      expect(durationMs).toBeLessThanOrEqual(expectedMs + 80);
      expect(fs.existsSync(out16)).toBe(true);
      const dur16 = await getAudioDurationMs(out16);
      expect(Math.abs(dur16 - durationMs)).toBeLessThanOrEqual(40);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates Instagram Reels MP4 constraints accurately', () => {
    const ok = verifyInstagramReelSpec({
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 38.5,
      fileSizeBytes: 12_000_000,
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      audioSampleRate: 48000,
      audioChannels: 2,
      bitrateKbps: 2500,
    });
    expect(ok.ok).toBe(true);

    const bad = verifyInstagramReelSpec({
      width: 720,
      height: 1280,
      fps: 60,
      durationSec: 2,
      fileSizeBytes: 5000,
      videoCodec: 'hevc',
      pixelFormat: 'yuv444p',
      audioCodec: 'mp3',
      audioSampleRate: 44100,
      audioChannels: 1,
      bitrateKbps: 30000,
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(7);
  });
});
