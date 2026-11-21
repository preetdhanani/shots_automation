import fs from 'node:fs';
import path from 'node:path';
import type { VideoSpecReport } from '../schemas/media.js';
import type { AudioSfxCue } from './musicLibrary.js';
import { runSubprocess } from './subprocess.js';

export type DetectedAudioInput =
  | { kind: 'container' }
  | { kind: 'pcm'; sampleRate: number; channels: number };

export function detectGeminiAudioInput(bytes: Buffer, mimeType?: string): DetectedAudioInput {
  if (bytes.byteLength >= 4) {
    const head = bytes.subarray(0, 4).toString('ascii');
    if (head === 'RIFF' || head === 'OggS' || head === 'fLaC' || head.startsWith('ID3')) {
      return { kind: 'container' };
    }
    if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
      return { kind: 'container' };
    }
  }

  const lower = (mimeType ?? '').toLowerCase();
  if (lower.includes('l16') || lower.includes('pcm') || lower === '') {
    const rateMatch = lower.match(/rate=(\d+)/);
    const channelsMatch = lower.match(/channels=(\d+)/);
    return {
      kind: 'pcm',
      sampleRate: rateMatch ? Number.parseInt(rateMatch[1]!, 10) : 24000,
      channels: channelsMatch ? Number.parseInt(channelsMatch[1]!, 10) : 1,
    };
  }

  return { kind: 'container' };
}

export async function checkFfmpegAvailability(): Promise<{
  ffmpegOk: boolean;
  ffprobeOk: boolean;
  ffmpegVersion: string | null;
}> {
  try {
    const [ff, fp] = await Promise.all([
      runSubprocess('ffmpeg', ['-version'], { timeoutMs: 5000 }),
      runSubprocess('ffprobe', ['-version'], { timeoutMs: 5000 }),
    ]);
    const firstLine = ff.stdout.split('\n')[0]?.trim() ?? 'ffmpeg available';
    return {
      ffmpegOk: ff.code === 0,
      ffprobeOk: fp.code === 0,
      ffmpegVersion: firstLine,
    };
  } catch {
    return { ffmpegOk: false, ffprobeOk: false, ffmpegVersion: null };
  }
}

export async function getAudioDurationMs(audioPath: string, signal?: AbortSignal): Promise<number> {
  const res = await runSubprocess(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath],
    { signal, timeoutMs: 15_000 },
  );
  const parsed = JSON.parse(res.stdout) as { format?: { duration?: string } };
  const sec = Number.parseFloat(parsed.format?.duration ?? '0');
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Invalid audio duration probed from ${audioPath}`);
  }
  return Math.round(sec * 1000);
}

interface LoudnormStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

function parseLoudnormStats(stderr: string): LoudnormStats | null {
  const matches = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/g);
  if (!matches || matches.length === 0) return null;
  try {
    const stats = JSON.parse(matches[matches.length - 1]!) as LoudnormStats;
    const vals = [
      stats.input_i,
      stats.input_tp,
      stats.input_lra,
      stats.input_thresh,
      stats.target_offset,
    ];
    if (vals.some((v) => !v || v.includes('inf') || Number.isNaN(Number.parseFloat(v)))) {
      return null;
    }
    return stats;
  } catch {
    return null;
  }
}

export async function prepareNormalizedVoicePair(opts: {
  rawAudioPath: string;
  rawBytes: Buffer;
  mimeType?: string;
  trimmedMasterPath: string;
  output48kPath: string;
  output16kPath: string;
  headDelayMs?: number;
  tailPadSec?: number;
  signal?: AbortSignal;
}): Promise<{ durationMs: number }> {
  const headDelayMs = Math.max(0, Math.round(opts.headDelayMs ?? 220));
  const tailPadSec = Math.max(0, opts.tailPadSec ?? 0.65);
  const detected = detectGeminiAudioInput(opts.rawBytes, opts.mimeType);
  const inputArgs =
    detected.kind === 'pcm'
      ? ['-f', 's16le', '-ar', String(detected.sampleRate), '-ac', String(detected.channels), '-i', opts.rawAudioPath]
      : ['-i', opts.rawAudioPath];

  const normalizedTempPath = `${opts.trimmedMasterPath}.norm.wav`;

  try {
    // Step 1: Two-pass loudnorm FIRST so silence-threshold detection is calibrated to -14 LUFS speech
    const pass1 = await runSubprocess(
      'ffmpeg',
      [
        '-y',
        ...inputArgs,
        '-af',
        'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
        '-f',
        'null',
        '-',
      ],
      { signal: opts.signal, timeoutMs: 60_000 },
    );

    const stats = parseLoudnormStats(pass1.stderr);
    const loudnormFilter = stats
      ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
      : 'loudnorm=I=-14:TP=-1.5:LRA=11';

    await runSubprocess(
      'ffmpeg',
      [
        '-y',
        ...inputArgs,
        '-af',
        loudnormFilter,
        '-ar',
        '48000',
        '-ac',
        '2',
        '-c:a',
        'pcm_s16le',
        normalizedTempPath,
      ],
      { signal: opts.signal, timeoutMs: 60_000 },
    );

    // Step 2: Trim leading/trailing silence, tighten internal pauses > 220ms down to 110ms,
    // apply subtle 1.05x pacing, head/tail breathing room, and transparent true-peak limiting (level=false)
    await runSubprocess(
      'ffmpeg',
      [
        '-y',
        '-i',
        normalizedTempPath,
        '-af',
        `silenceremove=start_periods=1:start_duration=0.04:start_threshold=-40dB:stop_periods=-1:stop_duration=0.22:stop_threshold=-40dB:stop_silence=0.11,areverse,silenceremove=start_periods=1:start_duration=0.04:start_threshold=-40dB,areverse,atempo=1.05,adelay=${headDelayMs}|${headDelayMs},apad=pad_dur=${tailPadSec.toFixed(2)},alimiter=limit=0.84:level=false`,
        '-ar',
        '48000',
        '-ac',
        '2',
        '-c:a',
        'pcm_s16le',
        opts.trimmedMasterPath,
      ],
      { signal: opts.signal, timeoutMs: 60_000 },
    );

    fs.copyFileSync(opts.trimmedMasterPath, opts.output48kPath);

    // Step 3: Derive 16kHz mono WAV from output48kPath so timestamps match voice-48k.wav sample-for-sample
    await runSubprocess(
      'ffmpeg',
      [
        '-y',
        '-i',
        opts.output48kPath,
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        opts.output16kPath,
      ],
      { signal: opts.signal, timeoutMs: 60_000 },
    );

    const durationMs = await getAudioDurationMs(opts.output48kPath, opts.signal);
    return { durationMs };
  } finally {
    if (fs.existsSync(normalizedTempPath)) {
      fs.rmSync(normalizedTempPath, { force: true });
    }
  }
}

export async function concatVoiceSegmentsWithPause(opts: {
  mainVoice48kPath: string;
  outroVoice48kPath: string;
  pauseMs: number;
  tailPadMs?: number;
  output48kPath: string;
  output16kPath: string;
  signal?: AbortSignal;
}): Promise<{ durationMs: number }> {
  const pauseMs = Math.max(0, Math.round(opts.pauseMs));
  const tailPadMs = Math.max(0, Math.round(opts.tailPadMs ?? 0));
  const filterParts: string[] = [
    '[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a0]',
    '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a1]',
  ];

  let concatInput: string;
  if (pauseMs > 0) {
    filterParts.push(
      `anullsrc=r=48000:cl=stereo,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${(pauseMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS[gap]`,
    );
    concatInput = '[a0][gap][a1]concat=n=3:v=0:a=1';
  } else {
    concatInput = '[a0][a1]concat=n=2:v=0:a=1';
  }

  const tailFilter = tailPadMs > 0 ? `,apad=pad_dur=${(tailPadMs / 1000).toFixed(3)}` : '';
  filterParts.push(`${concatInput}${tailFilter}[aout]`);

  await runSubprocess(
    'ffmpeg',
    [
      '-y',
      '-i',
      opts.mainVoice48kPath,
      '-i',
      opts.outroVoice48kPath,
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[aout]',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      opts.output48kPath,
    ],
    { signal: opts.signal, timeoutMs: 60_000 },
  );

  // Derive 16kHz mono WAV from output48kPath so timestamps match sample-for-sample
  await runSubprocess(
    'ffmpeg',
    [
      '-y',
      '-i',
      opts.output48kPath,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      opts.output16kPath,
    ],
    { signal: opts.signal, timeoutMs: 60_000 },
  );

  const durationMs = await getAudioDurationMs(opts.output48kPath, opts.signal);
  return { durationMs };
}

export interface DeliveryEncodeOptions {
  rawVideoPath: string;
  voice48kPath: string;
  outputMp4Path: string;
  durationSec: number;
  musicEnabled: boolean;
  musicPath?: string;
  musicVolumeDb?: number;
  sfxCues?: AudioSfxCue[];
  transitionClickPath?: string;
  transitionOffsetsMs?: number[];
  signal?: AbortSignal;
}

export function buildDeliveryFfmpegArgs(opts: DeliveryEncodeOptions): string[] {
  const args: string[] = ['-y', '-i', opts.rawVideoPath, '-i', opts.voice48kPath];

  const hasMusic = Boolean(opts.musicEnabled && opts.musicPath && fs.existsSync(opts.musicPath));
  const filterParts: string[] = [];
  const mixLabels: string[] = [];
  let nextInputIdx = 2;

  if (hasMusic && opts.musicPath) {
    filterParts.push(
      '[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[voice_mix][voice_sc]',
    );
    mixLabels.push('[voice_mix]');

    args.push('-stream_loop', '-1', '-i', opts.musicPath);
    const volDb = opts.musicVolumeDb ?? -17;
    const fadeStart = Math.max(0.2, opts.durationSec - 0.55).toFixed(2);
    filterParts.push(
      `[${nextInputIdx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volDb}dB,atrim=0:${opts.durationSec.toFixed(3)},afade=t=in:st=0:d=0.28,afade=t=out:st=${fadeStart}:d=0.50[bgm_raw]`,
    );
    filterParts.push(
      '[bgm_raw][voice_sc]sidechaincompress=threshold=0.02:ratio=3.5:attack=15:release=220:makeup=1[bgm]',
    );
    mixLabels.push('[bgm]');
    nextInputIdx++;
  } else {
    filterParts.push('[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[voice]');
    mixLabels.push('[voice]');
  }

  // Prefer explicit sfxCues, falling back to legacy transitionClickPath + transitionOffsetsMs
  const resolvedCues: AudioSfxCue[] =
    opts.sfxCues && opts.sfxCues.length > 0
      ? opts.sfxCues
      : opts.transitionClickPath && opts.transitionOffsetsMs
        ? opts.transitionOffsetsMs.map((offsetMs) => ({
            path: opts.transitionClickPath!,
            offsetMs,
            volumeDb: -16,
          }))
        : [];

  const maxOffsetMs = opts.durationSec * 1000 - 120;
  for (const cue of resolvedCues) {
    if (cue.offsetMs < 0 || cue.offsetMs >= maxOffsetMs) continue;
    if (!fs.existsSync(cue.path)) continue;
    args.push('-i', cue.path);
    const label = `sfx_${nextInputIdx}`;
    const cueVol = cue.volumeDb ?? -16;
    const delay = Math.round(cue.offsetMs);
    filterParts.push(
      `[${nextInputIdx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${cueVol}dB,adelay=${delay}|${delay}[${label}]`,
    );
    mixLabels.push(`[${label}]`);
    nextInputIdx++;
  }

  const masterFadeOutStart = Math.max(0.05, opts.durationSec - 0.06).toFixed(3);
  if (mixLabels.length === 1) {
    filterParts.push(
      `${mixLabels[0]}afade=t=in:st=0:d=0.02,afade=t=out:st=${masterFadeOutStart}:d=0.06[aout]`,
    );
  } else {
    filterParts.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=first:normalize=0,alimiter=limit=0.95:level=false,afade=t=in:st=0:d=0.02,afade=t=out:st=${masterFadeOutStart}:d=0.06[aout]`,
    );
  }

  args.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-vf',
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '19',
    '-profile:v',
    'high',
    '-level:v',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-flags',
    '+cgop',
    '-x264-params',
    'open-gop=0:keyint=60:min-keyint=60:scenecut=0',
    '-maxrate',
    '12M',
    '-bufsize',
    '24M',
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-shortest',
    opts.outputMp4Path,
  );

  return args;
}

export async function encodeDeliveryReel(opts: DeliveryEncodeOptions): Promise<void> {
  const tmpOut = `${opts.outputMp4Path}.tmp.mp4`;
  const args = buildDeliveryFfmpegArgs({ ...opts, outputMp4Path: tmpOut });
  try {
    await runSubprocess('ffmpeg', args, { signal: opts.signal, timeoutMs: 240_000 });
    fs.renameSync(tmpOut, opts.outputMp4Path);
  } finally {
    if (fs.existsSync(tmpOut)) {
      fs.rmSync(tmpOut, { force: true });
    }
  }
}

export async function extractCoverFrame(
  videoPath: string,
  coverJpgPath: string,
  offsetSec = 0,
  signal?: AbortSignal,
): Promise<void> {
  const tmpOut = `${coverJpgPath}.tmp.jpg`;
  fs.mkdirSync(path.dirname(coverJpgPath), { recursive: true });
  try {
    await runSubprocess(
      'ffmpeg',
      ['-y', '-ss', offsetSec.toFixed(2), '-i', videoPath, '-frames:v', '1', '-q:v', '2', tmpOut],
      { signal, timeoutMs: 30_000 },
    );
    fs.renameSync(tmpOut, coverJpgPath);
  } finally {
    if (fs.existsSync(tmpOut)) {
      fs.rmSync(tmpOut, { force: true });
    }
  }
}

function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0;
  const parts = raw.split('/');
  if (parts.length === 2) {
    const num = Number.parseFloat(parts[0]!);
    const den = Number.parseFloat(parts[1]!);
    if (den > 0 && Number.isFinite(num / den)) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function verifyInstagramReelSpec(report: Omit<VideoSpecReport, 'ok' | 'errors'>): VideoSpecReport {
  const errors: string[] = [];

  if (report.width !== 1080 || report.height !== 1920) {
    errors.push(`Resolution must be 1080x1920, got ${report.width}x${report.height}.`);
  }
  if (report.fps < 29 || report.fps > 31) {
    errors.push(`Frame rate must be ~30fps (29-31), got ${report.fps}.`);
  }
  if (report.videoCodec !== 'h264') {
    errors.push(`Video codec must be h264, got ${report.videoCodec}.`);
  }
  if (report.pixelFormat !== 'yuv420p') {
    errors.push(`Pixel format must be yuv420p, got ${report.pixelFormat}.`);
  }
  if (report.audioCodec !== 'aac') {
    errors.push(`Audio codec must be aac, got ${report.audioCodec}.`);
  }
  if (report.audioSampleRate !== 48000) {
    errors.push(`Audio sample rate must be 48000 Hz, got ${report.audioSampleRate}.`);
  }
  if (report.audioChannels !== 2) {
    errors.push(`Audio channels must be 2 (stereo), got ${report.audioChannels}.`);
  }
  if (report.durationSec < 3 || report.durationSec > 90) {
    errors.push(`Reel duration must be 3-90 seconds, got ${report.durationSec.toFixed(1)}s.`);
  }
  if (report.fileSizeBytes <= 10_000 || report.fileSizeBytes > 100 * 1024 * 1024) {
    errors.push(`File size out of Meta bounds: ${report.fileSizeBytes} bytes.`);
  }
  if (report.bitrateKbps > 25_000) {
    errors.push(`Bitrate ${report.bitrateKbps} kbps exceeds 25,000 kbps Reels limit.`);
  }

  return {
    ...report,
    ok: errors.length === 0,
    errors,
  };
}

export async function probeVideo(videoPath: string, signal?: AbortSignal): Promise<VideoSpecReport> {
  const stat = fs.statSync(videoPath);
  const res = await runSubprocess(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', videoPath],
    { signal, timeoutMs: 20_000 },
  );

  const parsed = JSON.parse(res.stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      sample_rate?: string;
      channels?: number;
    }>;
  };

  const vStream = parsed.streams?.find((s) => s.codec_type === 'video');
  const aStream = parsed.streams?.find((s) => s.codec_type === 'audio');
  const durationSec = Number.parseFloat(parsed.format?.duration ?? '0') || 0;
  const bitrateBps = Number.parseFloat(parsed.format?.bit_rate ?? '0') || 0;

  return verifyInstagramReelSpec({
    width: vStream?.width ?? 0,
    height: vStream?.height ?? 0,
    fps: parseFrameRate(vStream?.avg_frame_rate || vStream?.r_frame_rate),
    durationSec: Math.round(durationSec * 100) / 100,
    fileSizeBytes: stat.size,
    videoCodec: vStream?.codec_name ?? 'unknown',
    pixelFormat: vStream?.pix_fmt ?? 'unknown',
    audioCodec: aStream?.codec_name ?? 'none',
    audioSampleRate: Number.parseInt(aStream?.sample_rate ?? '0', 10) || 0,
    audioChannels: aStream?.channels ?? 0,
    bitrateKbps: Math.round(bitrateBps / 1000),
  });
}
