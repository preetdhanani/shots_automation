import { describe, expect, it } from 'vitest';
import {
  buildDeliveryFfmpegArgs,
  detectGeminiAudioInput,
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
