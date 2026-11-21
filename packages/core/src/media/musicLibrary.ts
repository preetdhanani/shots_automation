import fs from 'node:fs';
import path from 'node:path';
import type { SceneTiming } from '../schemas/media.js';
import { isChannelOutroScene, type ReelStoryboard } from '../schemas/storyboard.js';
import {
  DEFAULT_TRANSITION,
  MUSIC_MOOD_IDS,
  SFX_IDS,
  TRANSITION_SFX,
  type MusicMoodId,
  type SfxId,
} from '../variety/registry.js';

const SAMPLE_RATE = 48000;
const AUDIO_EXT_RE = /\.(wav|mp3|m4a|aac|flac|ogg)$/i;

export interface AudioSfxCue {
  path: string;
  offsetMs: number;
  volumeDb?: number;
}

export interface GeneratedAudioLibrary {
  moods: Record<MusicMoodId, string>;
  sfx: Record<SfxId, string>;
}

function writeStereoWav16Bit(
  filePath: string,
  sampleRate: number,
  samplesL: Float32Array,
  samplesR: Float32Array,
): void {
  const numFrames = samplesL.length;
  const dataBytes = numFrames * 4;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // Stereo
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, samplesL[i] ?? 0));
    const r = Math.max(-1, Math.min(1, samplesR[i] ?? 0));
    buffer.writeInt16LE(Math.round(l * 32767), offset);
    buffer.writeInt16LE(Math.round(r * 32767), offset + 2);
    offset += 4;
  }

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

/** Deterministic PRNG for procedural noise in hi-hats / whooshes / glitch SFX. */
function makeNoiseRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function generateDarkPad(filePath: string): void {
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const voices = [
    { freq: 146.75, amp: 0.24, pan: 0.45 },
    { freq: 220.0, amp: 0.18, pan: 0.55 },
    { freq: 261.6667, amp: 0.14, pan: 0.35 },
    { freq: 329.6667, amp: 0.11, pan: 0.65 },
    { freq: 440.0, amp: 0.06, pan: 0.5 },
  ];
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const slowBreath = 0.72 + 0.28 * Math.sin((2 * Math.PI * t) / 6);
    let sumL = 0;
    let sumR = 0;
    for (const v of voices) {
      const wave = Math.sin(2 * Math.PI * v.freq * t);
      sumL += wave * v.amp * (1 - v.pan * 0.4);
      sumR += wave * v.amp * (0.6 + v.pan * 0.4);
    }
    left[i] = sumL * slowBreath * 0.5;
    right[i] = sumR * slowBreath * 0.5;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateUpbeatPulse(filePath: string): void {
  // 118 BPM ~ 8 bars = 16.27s; pick integer 12s at 120 BPM (24 beats) for seamless looping
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(11801);
  const beatDur = 0.5; // 120 BPM
  const bassNotes = [110, 110, 130.81, 146.83, 164.81, 146.83, 130.81, 98];

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const beatIdx = Math.floor(t / beatDur);
    const beatPhase = t - beatIdx * beatDur;

    // Punchy sine kick on every beat
    const kickEnv = Math.exp(-beatPhase * 22);
    const kickFreq = 52 + 88 * Math.exp(-beatPhase * 38);
    const kick = Math.sin(2 * Math.PI * kickFreq * beatPhase) * kickEnv * 0.34;

    // Crisp off-beat hi-hat
    const hatPhase = (t + beatDur * 0.5) % beatDur;
    const hatEnv = Math.exp(-hatPhase * 65);
    const hat = noise() * hatEnv * 0.08;

    // Driving octave bass
    const bassFreq = bassNotes[beatIdx % bassNotes.length]!;
    const bassEnv = Math.exp(-beatPhase * 6) * 0.24;
    const bass =
      (Math.sin(2 * Math.PI * bassFreq * t) + 0.35 * Math.sin(4 * Math.PI * bassFreq * t)) *
      bassEnv;

    // Pluck chord shimmer
    const chord =
      Math.sin(2 * Math.PI * bassFreq * 3 * t) * Math.exp(-((t % 0.25) * 14)) * 0.09;

    left[i] = (kick + bass + hat * 0.8 + chord * 1.1) * 0.75;
    right[i] = (kick + bass + hat * 1.15 + chord * 0.85) * 0.75;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateLofiChill(filePath: string): void {
  // Warm swung rhodes-style chords + gentle vinyl crackle at ~80 BPM (12s = 16 beats)
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(8202);
  const chords = [
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 349.23], // G6/7
    [164.81, 196.0, 246.94, 293.66], // Em7
  ];

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const barIdx = Math.floor(t / 3) % chords.length;
    const barPhase = t % 3;
    const chordEnv = Math.min(1, barPhase / 0.08) * Math.exp(-barPhase * 0.45);
    const notes = chords[barIdx]!;

    let rhodesL = 0;
    let rhodesR = 0;
    for (let n = 0; n < notes.length; n++) {
      const f = notes[n]!;
      const vibrato = 1 + 0.002 * Math.sin(2 * Math.PI * 3.5 * t + n);
      const tone =
        Math.sin(2 * Math.PI * f * vibrato * t) +
        0.18 * Math.sin(4 * Math.PI * f * vibrato * t) * Math.exp(-barPhase * 2);
      const pan = n % 2 === 0 ? 0.35 : 0.65;
      rhodesL += tone * (1 - pan * 0.4) * 0.14;
      rhodesR += tone * (0.6 + pan * 0.4) * 0.14;
    }

    // Soft swung kick every 0.75s
    const beatPhase = t % 0.75;
    const softKick = Math.sin(2 * Math.PI * (48 + 45 * Math.exp(-beatPhase * 25)) * beatPhase) *
      Math.exp(-beatPhase * 16) *
      0.22;

    // Gentle lo-fi tape floor
    const hiss = noise() * 0.012;

    left[i] = (rhodesL * chordEnv + softKick + hiss) * 0.75;
    right[i] = (rhodesR * chordEnv + softKick + hiss) * 0.75;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateTensionBuild(filePath: string): void {
  // Dark pulsing sub-synth with slow rising harmonic filter over 12s
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const pulse = 0.55 + 0.45 * Math.sin(2 * Math.PI * 2 * t); // 120 BPM eighth pulse
    const rise = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / durationSec));

    const sub = Math.sin(2 * Math.PI * 73.42 * t) * 0.28; // D2
    const fifth = Math.sin(2 * Math.PI * 110.0 * t) * 0.18 * pulse;
    const minorSecond = Math.sin(2 * Math.PI * 155.56 * t) * 0.08 * rise; // Eb3 tension
    const highShimmer = Math.sin(2 * Math.PI * 293.66 * t) * 0.1 * rise * pulse;

    left[i] = (sub + fifth * 0.9 + minorSecond * 1.15 + highShimmer * 0.85) * 0.72;
    right[i] = (sub + fifth * 1.1 + minorSecond * 0.85 + highShimmer * 1.15) * 0.72;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateBrightSynth(filePath: string): void {
  // Crisp major arpeggio synth loop at 120 BPM (12s seamless)
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const arp = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 440.0];
  const stepDur = 0.1875; // 16th-ish crisp groove

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const stepIdx = Math.floor(t / stepDur);
    const stepPhase = t - stepIdx * stepDur;
    const note = arp[stepIdx % arp.length]!;
    const env = Math.min(1, stepPhase / 0.008) * Math.exp(-stepPhase * 11);

    const lead =
      (Math.sin(2 * Math.PI * note * t) + 0.3 * Math.sin(4 * Math.PI * note * t)) * env * 0.22;
    const pad =
      (Math.sin(2 * Math.PI * 130.81 * t) * 0.16 +
        Math.sin(2 * Math.PI * 196.0 * t) * 0.12) *
      (0.8 + 0.2 * Math.sin((2 * Math.PI * t) / 4));
    const pan = 0.5 + 0.35 * Math.sin(stepIdx * 1.1);

    left[i] = (pad + lead * (1 - pan * 0.45)) * 0.78;
    right[i] = (pad + lead * (0.55 + pan * 0.45)) * 0.78;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateClickSfx(filePath: string): void {
  const frames = Math.floor(SAMPLE_RATE * 0.045);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 110) * Math.min(1, t / 0.002);
    const freq = 920 - 520 * (t / 0.045);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.35;
    left[i] = sample;
    right[i] = sample;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateWhooshSfx(filePath: string): void {
  const durationSec = 0.24;
  const frames = Math.floor(SAMPLE_RATE * durationSec);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(5501);
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    const env = Math.sin(Math.PI * p) * Math.sin(Math.PI * p);
    const cutoff = 0.04 + 0.28 * Math.sin(Math.PI * p);
    const nL = noise();
    const nR = noise();
    lpL += (nL - lpL) * cutoff;
    lpR += (nR - lpR) * cutoff;
    left[i] = lpL * env * 0.45;
    right[i] = lpR * env * 0.45;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generatePopSfx(filePath: string): void {
  const durationSec = 0.095;
  const frames = Math.floor(SAMPLE_RATE * durationSec);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const p = t / durationSec;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 36);
    const freq = 260 + 520 * Math.exp(-p * 6);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.42;
    left[i] = sample;
    right[i] = sample;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateRiserSfx(filePath: string): void {
  const durationSec = 0.65;
  const frames = Math.floor(SAMPLE_RATE * durationSec);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(9903);
  let phase = 0;

  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    const env = Math.pow(p, 1.8) * (p > 0.92 ? (1 - p) / 0.08 : 1);
    const freq = 180 + 780 * p * p;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const tone = Math.sin(phase) * 0.26;
    const air = noise() * 0.14 * p;
    left[i] = (tone + air) * env * 0.45;
    right[i] = (tone - air * 0.6) * env * 0.45;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateGlitchSfx(filePath: string): void {
  const durationSec = 0.16;
  const frames = Math.floor(SAMPLE_RATE * durationSec);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(7707);

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const slice = Math.floor(t / 0.022);
    const gate = slice % 2 === 0 ? 1 : 0.25;
    const env = Math.exp(-t * 14) * gate;
    const freq = slice % 3 === 0 ? 1240 : slice % 3 === 1 ? 420 : 880;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.2;
    const grit = noise() * 0.22;
    left[i] = (sq + grit) * env * 0.42;
    right[i] = (sq * 0.7 - grit) * env * 0.42;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

const MOOD_GENERATORS: Record<MusicMoodId, (filePath: string) => void> = {
  dark_pad: generateDarkPad,
  upbeat_pulse: generateUpbeatPulse,
  lofi_chill: generateLofiChill,
  tension_build: generateTensionBuild,
  bright_synth: generateBrightSynth,
};

const SFX_GENERATORS: Record<SfxId, (filePath: string) => void> = {
  click: generateClickSfx,
  whoosh: generateWhooshSfx,
  pop: generatePopSfx,
  riser: generateRiserSfx,
  glitch: generateGlitchSfx,
};

export const RISER_DURATION_MS = 650;

export function ensureMusicAndSfxLibrary(musicDir: string): GeneratedAudioLibrary {
  const moodsDir = path.join(musicDir, 'generated', 'moods');
  const sfxDir = path.join(musicDir, 'generated', 'sfx');

  const moods = {} as Record<MusicMoodId, string>;
  for (const mood of MUSIC_MOOD_IDS) {
    const filePath = path.join(moodsDir, `${mood}-v1.wav`);
    if (!fs.existsSync(filePath)) {
      MOOD_GENERATORS[mood](filePath);
    }
    moods[mood] = filePath;
  }

  const sfx = {} as Record<SfxId, string>;
  for (const id of SFX_IDS) {
    const filePath = path.join(sfxDir, `${id}-v1.wav`);
    if (!fs.existsSync(filePath)) {
      SFX_GENERATORS[id](filePath);
    }
    sfx[id] = filePath;
  }

  return { moods, sfx };
}

function listAudioFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && AUDIO_EXT_RE.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/**
 * Resolves the music file for a given mood & seed:
 * 1. User-supplied files inside `data/music/<mood>/` (picked by seed)
 * 2. User-supplied files inside `data/music/` root (backward-compatible fallback pool)
 * 3. Procedurally generated mood loop in `data/music/generated/moods/<mood>-v1.wav`
 */
export function resolveMusicTrackForMood(
  musicDir: string,
  mood: MusicMoodId,
  seed = 0,
): string {
  const lib = ensureMusicAndSfxLibrary(musicDir);
  const moodUserTracks = listAudioFiles(path.join(musicDir, mood));
  if (moodUserTracks.length > 0) {
    const idx = Math.abs(Math.trunc(seed)) % moodUserTracks.length;
    return moodUserTracks[idx]!;
  }

  const rootUserTracks = listAudioFiles(musicDir);
  if (rootUserTracks.length > 0) {
    const idx = Math.abs(Math.trunc(seed)) % rootUserTracks.length;
    return rootUserTracks[idx]!;
  }

  return lib.moods[mood];
}

/**
 * Builds transition SFX cues mapped from each scene's `visual.transition` plus
 * an optional subtle riser leading into the takeaway scene.
 */
export function buildSfxCuesForStoryboard(
  storyboard: ReelStoryboard,
  sceneTimings: readonly SceneTiming[],
  sfxPaths: Record<SfxId, string>,
): AudioSfxCue[] {
  const cues: AudioSfxCue[] = [];
  const totalDurationMs =
    sceneTimings.length > 0 ? sceneTimings[sceneTimings.length - 1]!.endMs : 0;

  for (let i = 1; i < sceneTimings.length; i++) {
    const timing = sceneTimings[i]!;
    const scene = storyboard.scenes[i];
    const transition = scene?.visual?.transition ?? DEFAULT_TRANSITION;
    const sfxId = TRANSITION_SFX[transition] ?? 'click';
    const sfxPath = sfxPaths[sfxId];

    if (sfxPath && timing.startMs > 150 && timing.startMs < totalDurationMs - 150) {
      cues.push({
        path: sfxPath,
        offsetMs: timing.startMs,
        volumeDb: sfxId === 'whoosh' ? -15 : -16,
      });
    }

    // Add a subtle riser ending right at the main takeaway_cta scene (not the auto outro)
    if (scene && scene.type === 'takeaway_cta' && !isChannelOutroScene(scene)) {
      const riserStartMs = timing.startMs - RISER_DURATION_MS;
      if (riserStartMs > 250 && riserStartMs < totalDurationMs - RISER_DURATION_MS - 100) {
        cues.push({
          path: sfxPaths.riser,
          offsetMs: riserStartMs,
          volumeDb: -18,
        });
      }
    }
  }

  return cues;
}
