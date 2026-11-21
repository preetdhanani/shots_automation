import fs from 'node:fs';
import path from 'node:path';
import type { CaptionToken, SceneTiming } from '../schemas/media.js';
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

/** Soft analog-style waveshaper and seamless loop boundary crossfade (~25ms). */
function polishSeamlessLoop(left: Float32Array, right: Float32Array): void {
  const frames = left.length;
  for (let i = 0; i < frames; i++) {
    left[i] = Math.tanh(left[i]! * 1.15) * 0.88;
    right[i] = Math.tanh(right[i]! * 1.15) * 0.88;
  }
  const xfade = Math.min(Math.floor(SAMPLE_RATE * 0.025), Math.floor(frames / 8));
  for (let i = 0; i < xfade; i++) {
    const t = i / xfade;
    const wA = Math.sin((t * Math.PI) / 2);
    const wB = Math.cos((t * Math.PI) / 2);
    const tailIdx = frames - xfade + i;
    const mixL = left[i]! * wA + left[tailIdx]! * wB;
    const mixR = right[i]! * wA + right[tailIdx]! * wB;
    left[i] = mixL;
    right[i] = mixR;
    left[tailIdx] = left[tailIdx]! * wA + left[i]! * wB;
    right[tailIdx] = right[tailIdx]! * wA + right[i]! * wB;
  }
}

/** Rich detuned supersaw-like / warm harmonic pad layer */
function warmDetunedVoice(freq: number, t: number, spread = 0.0022): number {
  const f1 = freq * (1 - spread);
  const f2 = freq;
  const f3 = freq * (1 + spread);
  const fund =
    Math.sin(2 * Math.PI * f1 * t) +
    Math.sin(2 * Math.PI * f2 * t) +
    Math.sin(2 * Math.PI * f3 * t);
  const harm2 = 0.24 * Math.sin(4 * Math.PI * f2 * t);
  const harm3 = 0.08 * Math.sin(6 * Math.PI * f2 * t);
  return fund / 3 + harm2 + harm3;
}

function generateDarkPad(filePath: string): void {
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const chords = [
    [73.42, 146.83, 220.0, 261.63, 329.63], // Dm9
    [65.41, 130.81, 196.0, 246.94, 311.13], // Cm9/add
    [58.27, 116.54, 174.61, 220.0, 261.63], // Bbmaj9
    [55.0, 110.0, 164.81, 207.65, 261.63], // Am/add
  ];
  const barDur = 3;
  let lpL = 0;
  let lpR = 0;
  const noise = makeNoiseRng(1401);

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const barIdx = Math.floor(t / barDur) % chords.length;
    const barPhase = t % barDur;
    const swell = Math.min(1, barPhase / 0.28) * Math.min(1, (barDur - barPhase) / 0.18 + 0.35);
    const notes = chords[barIdx]!;

    let sumL = 0;
    let sumR = 0;
    for (let n = 0; n < notes.length; n++) {
      const freq = notes[n]!;
      const pan = 0.25 + ((n % 3) * 0.25);
      const v = warmDetunedVoice(freq, t, n === 0 ? 0.0008 : 0.0026);
      const amp = n === 0 ? 0.28 : 0.14 / (1 + n * 0.18);
      sumL += v * amp * (1 - pan * 0.45);
      sumR += v * amp * (0.55 + pan * 0.45);
    }

    // Subtle soft sub pulse on half notes (every 1.5s)
    const subPhase = t % 1.5;
    const subEnv = Math.exp(-subPhase * 4.5);
    const subPulse = Math.sin(2 * Math.PI * notes[0]! * t) * subEnv * 0.14;

    const air = noise() * 0.008;
    const rawL = sumL * swell + subPulse + air;
    const rawR = sumR * swell + subPulse - air;

    // Warm resonant low-pass sweep
    const cutoff = 0.12 + 0.08 * Math.sin((2 * Math.PI * t) / 6);
    lpL += (rawL - lpL) * cutoff;
    lpR += (rawR - lpR) * cutoff;
    left[i] = lpL * 0.92;
    right[i] = lpR * 0.92;
  }
  polishSeamlessLoop(left, right);
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateUpbeatPulse(filePath: string): void {
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(11802);
  const beatDur = 0.5; // 120 BPM (24 beats in 12s)
  const bassNotes = [110, 110, 130.81, 146.83, 164.81, 146.83, 130.81, 98];
  const chords = [
    [220.0, 261.63, 329.63],
    [261.63, 329.63, 392.0],
    [293.66, 349.23, 440.0],
    [196.0, 246.94, 293.66],
  ];
  let lpHat = 0;

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const beatIdx = Math.floor(t / beatDur);
    const beatPhase = t - beatIdx * beatDur;

    // Punchy four-on-the-floor kick
    const kickEnv = Math.exp(-beatPhase * 24);
    const kickFreq = 48 + 96 * Math.exp(-beatPhase * 42);
    const kick = Math.sin(2 * Math.PI * kickFreq * beatPhase) * kickEnv * 0.34;

    // Crisp off-beat shaker/hat + 16th ghost groove
    const eighthPhase = t % 0.25;
    const hatAccent = (t % beatDur) >= beatDur * 0.45 ? 1.0 : 0.35;
    const rawNoise = noise();
    lpHat += (rawNoise - lpHat) * 0.35;
    const hpHat = rawNoise - lpHat;
    const hat = hpHat * Math.exp(-eighthPhase * 55) * 0.1 * hatAccent;

    // Tight clap/snare transient on beats 2 & 4
    const clapPhase = beatIdx % 2 === 1 ? beatPhase : 1;
    const clap = rawNoise * Math.exp(-clapPhase * 28) * 0.12;

    // Driving sidechained octave bass
    const sidechainDuck = Math.min(1, beatPhase / 0.11);
    const bassFreq = bassNotes[beatIdx % bassNotes.length]!;
    const bass =
      (Math.sin(2 * Math.PI * bassFreq * t) + 0.32 * Math.sin(4 * Math.PI * bassFreq * t)) *
      0.22 *
      (0.35 + 0.65 * sidechainDuck);

    // Syncopated chord stab
    const chord = chords[Math.floor(t / 3) % chords.length]!;
    const arpNote = chord[Math.floor(t / 0.25) % chord.length]!;
    const arpPhase = t % 0.25;
    const arp = warmDetunedVoice(arpNote, t, 0.002) * Math.exp(-arpPhase * 12) * 0.14;
    const pan = 0.5 + 0.35 * Math.sin(beatIdx * 1.4);

    left[i] = (kick + bass + clap * 0.9 + hat * 0.8 + arp * (1 - pan * 0.4)) * 0.78;
    right[i] = (kick + bass + clap * 1.05 + hat * 1.15 + arp * (0.6 + pan * 0.4)) * 0.78;
  }
  polishSeamlessLoop(left, right);
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateLofiChill(filePath: string): void {
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(8204);
  const chords = [
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 349.23], // G6/7
    [164.81, 196.0, 246.94, 293.66], // Em7
  ];
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const barIdx = Math.floor(t / 3) % chords.length;
    const barPhase = t % 3;
    const chordEnv = Math.min(1, barPhase / 0.06) * Math.exp(-barPhase * 0.42);
    const notes = chords[barIdx]!;

    let rhodesL = 0;
    let rhodesR = 0;
    for (let n = 0; n < notes.length; n++) {
      const f = notes[n]!;
      const vibrato = 1 + 0.0022 * Math.sin(2 * Math.PI * 3.2 * t + n);
      const tone =
        Math.sin(2 * Math.PI * f * vibrato * t) +
        0.22 * Math.sin(4 * Math.PI * f * vibrato * t) * Math.exp(-barPhase * 1.8) +
        0.07 * Math.sin(6 * Math.PI * f * vibrato * t) * Math.exp(-barPhase * 4);
      const pan = n % 2 === 0 ? 0.3 : 0.7;
      rhodesL += tone * (1 - pan * 0.4) * 0.14;
      rhodesR += tone * (0.6 + pan * 0.4) * 0.14;
    }

    // Warm root bass
    const bassFreq = notes[0]! * 0.5;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * chordEnv * 0.18;

    // Soft boom-bap groove at 80 BPM (0.75s/beat)
    const beatPhase = t % 0.75;
    const softKick =
      Math.sin(2 * Math.PI * (46 + 44 * Math.exp(-beatPhase * 24)) * beatPhase) *
      Math.exp(-beatPhase * 15) *
      0.24;
    const rimPhase = (t + 0.375) % 0.75;
    const softRim = noise() * Math.exp(-rimPhase * 42) * 0.045;
    const hiss = noise() * 0.008;

    const rawL = rhodesL * chordEnv + bass + softKick + softRim * 0.8 + hiss;
    const rawR = rhodesR * chordEnv + bass + softKick + softRim * 1.1 + hiss;
    lpL += (rawL - lpL) * 0.24;
    lpR += (rawR - lpR) * 0.24;
    left[i] = lpL * 0.85;
    right[i] = lpR * 0.85;
  }
  polishSeamlessLoop(left, right);
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateTensionBuild(filePath: string): void {
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(9104);
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const pulse8th = t % 0.25;
    const arpEnv = Math.min(1, pulse8th / 0.008) * Math.exp(-pulse8th * 12);
    const arpNotes = [146.83, 220.0, 233.08, 293.66, 233.08, 220.0, 174.61, 220.0];
    const arpFreq = arpNotes[Math.floor(t / 0.25) % arpNotes.length]!;

    const sub = Math.sin(2 * Math.PI * 73.42 * t) * 0.26; // D2 anchor
    const ostinato = warmDetunedVoice(arpFreq, t, 0.0024) * arpEnv * 0.22;
    const pad =
      (Math.sin(2 * Math.PI * 146.83 * t) * 0.14 +
        Math.sin(2 * Math.PI * 220.0 * t) * 0.11 +
        Math.sin(2 * Math.PI * 311.13 * t) * 0.07) *
      (0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 6));

    // Tight cinema pulse kick every 0.5s
    const kickPhase = t % 0.5;
    const kick =
      Math.sin(2 * Math.PI * (45 + 65 * Math.exp(-kickPhase * 32)) * kickPhase) *
      Math.exp(-kickPhase * 18) *
      0.24;
    const tick = noise() * Math.exp(-pulse8th * 70) * 0.04;

    const rawL = sub + pad + kick + ostinato * 1.05 + tick * 0.85;
    const rawR = sub + pad + kick + ostinato * 0.85 + tick * 1.15;
    const cutoff = 0.16 + 0.16 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / durationSec));
    lpL += (rawL - lpL) * cutoff;
    lpR += (rawR - lpR) * cutoff;
    left[i] = lpL * 0.86;
    right[i] = lpR * 0.86;
  }
  polishSeamlessLoop(left, right);
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateBrightSynth(filePath: string): void {
  const durationSec = 12;
  const frames = SAMPLE_RATE * durationSec;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const arp = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 440.0];
  const chords = [
    [130.81, 196.0, 261.63], // C
    [146.83, 220.0, 293.66], // Dm
    [164.81, 246.94, 329.63], // Em
    [174.61, 261.63, 349.23], // F
  ];
  const stepDur = 0.1875; // crisp 16th groove
  const noise = makeNoiseRng(4408);

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const stepIdx = Math.floor(t / stepDur);
    const stepPhase = t - stepIdx * stepDur;
    const note = arp[stepIdx % arp.length]!;
    const env = Math.min(1, stepPhase / 0.008) * Math.exp(-stepPhase * 11);

    const lead = warmDetunedVoice(note, t, 0.002) * env * 0.2;
    const chord = chords[Math.floor(t / 3) % chords.length]!;
    const pad =
      (warmDetunedVoice(chord[0]!, t, 0.0015) * 0.14 +
        warmDetunedVoice(chord[1]!, t, 0.002) * 0.1 +
        warmDetunedVoice(chord[2]!, t, 0.0022) * 0.08) *
      (0.8 + 0.2 * Math.sin((2 * Math.PI * t) / 4));

    const hat = noise() * Math.exp(-(t % 0.25) * 60) * 0.04;
    const pan = 0.5 + 0.35 * Math.sin(stepIdx * 1.1);

    left[i] = (pad + lead * (1 - pan * 0.45) + hat * 0.8) * 0.82;
    right[i] = (pad + lead * (0.55 + pan * 0.45) + hat * 1.15) * 0.82;
  }
  polishSeamlessLoop(left, right);
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateClickSfx(filePath: string): void {
  const frames = Math.floor(SAMPLE_RATE * 0.05);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 105) * Math.min(1, t / 0.0015);
    const freq = 980 - 540 * (t / 0.05);
    const body = Math.sin(2 * Math.PI * freq * t) + 0.28 * Math.sin(2 * Math.PI * freq * 2.1 * t);
    const sample = body * env * 0.28;
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
  const noise = makeNoiseRng(5502);
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    const env = Math.sin(Math.PI * p) * Math.sin(Math.PI * p);
    const cutoff = 0.03 + 0.26 * Math.sin(Math.PI * p);
    const nL = noise();
    const nR = noise();
    lpL += (nL - lpL) * cutoff;
    lpR += (nR - lpR) * cutoff;
    left[i] = lpL * env * 0.42;
    right[i] = lpR * env * 0.42;
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
    const env = Math.min(1, t / 0.0035) * Math.exp(-t * 38);
    const freq = 240 + 540 * Math.exp(-p * 6.5);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.38;
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
  const noise = makeNoiseRng(9904);
  let phase = 0;

  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    const env = Math.pow(p, 1.8) * (p > 0.92 ? (1 - p) / 0.08 : 1);
    const freq = 180 + 820 * p * p;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const tone = (Math.sin(phase) + 0.25 * Math.sin(phase * 2)) * 0.22;
    const air = noise() * 0.14 * p;
    left[i] = (tone + air) * env * 0.42;
    right[i] = (tone - air * 0.6) * env * 0.42;
  }
  writeStereoWav16Bit(filePath, SAMPLE_RATE, left, right);
}

function generateGlitchSfx(filePath: string): void {
  const durationSec = 0.16;
  const frames = Math.floor(SAMPLE_RATE * durationSec);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const noise = makeNoiseRng(7708);

  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const slice = Math.floor(t / 0.02);
    const gate = slice % 2 === 0 ? 1 : 0.25;
    const env = Math.exp(-t * 15) * gate;
    const freq = slice % 3 === 0 ? 1180 : slice % 3 === 1 ? 420 : 860;
    const sq = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.18;
    const grit = noise() * 0.2;
    left[i] = (sq + grit) * env * 0.4;
    right[i] = (sq * 0.7 - grit) * env * 0.4;
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

function listAudioFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && AUDIO_EXT_RE.test(e.name))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function findCustomSfxFile(sfxId: SfxId, searchRoots: readonly string[]): string | null {
  for (const root of searchRoots) {
    if (!root || !fs.existsSync(root)) continue;
    const files = listAudioFiles(root);
    const directMatch = files.find(
      (f) => path.basename(f, path.extname(f)).toLowerCase() === sfxId,
    );
    if (directMatch) return directMatch;

    const subFiles = listAudioFiles(path.join(root, sfxId));
    if (subFiles.length > 0) return subFiles[0]!;
  }
  return null;
}

export function ensureMusicAndSfxLibrary(
  musicDir: string,
  sfxDir?: string,
): GeneratedAudioLibrary {
  const moodsDir = path.join(musicDir, 'generated', 'moods');
  const genSfxDir = path.join(musicDir, 'generated', 'sfx');

  const moods = {} as Record<MusicMoodId, string>;
  for (const mood of MUSIC_MOOD_IDS) {
    const filePath = path.join(moodsDir, `${mood}-v2.wav`);
    if (!fs.existsSync(filePath)) {
      MOOD_GENERATORS[mood](filePath);
    }
    moods[mood] = filePath;
  }

  const effectiveSfxDir = sfxDir ?? path.resolve(musicDir, '..', 'sfx');
  const customSfxRoots = [effectiveSfxDir, path.join(musicDir, 'sfx')];

  const sfx = {} as Record<SfxId, string>;
  for (const id of SFX_IDS) {
    const generatedPath = path.join(genSfxDir, `${id}-v2.wav`);
    if (!fs.existsSync(generatedPath)) {
      SFX_GENERATORS[id](generatedPath);
    }
    sfx[id] = findCustomSfxFile(id, customSfxRoots) ?? generatedPath;
  }

  return { moods, sfx };
}

/**
 * Resolves the music file for a given mood & seed:
 * 1. User-supplied files inside `data/music/<mood>/` (picked by seed)
 * 2. User-supplied files inside `data/music/` root (backward-compatible fallback pool)
 * 3. Procedurally generated mood loop in `data/music/generated/moods/<mood>-v2.wav`
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

function findMatchingWordOffsetMs(
  captions: readonly CaptionToken[],
  startMs: number,
  endMs: number,
  keywords: readonly string[],
): number | null {
  if (captions.length === 0 || keywords.length === 0) return null;
  const kwSet = new Set(keywords.map((k) => k.toLowerCase()));
  for (const tok of captions) {
    if (tok.startMs < startMs + 200 || tok.startMs > endMs - 200) continue;
    const clean = tok.text.trim().toLowerCase().replace(/[^a-z0-9+$%]/g, '');
    if (clean && kwSet.has(clean)) {
      return tok.startMs;
    }
  }
  return null;
}

/**
 * Builds transition SFX cues mapped from each scene's `visual.transition`, plus
 * a subtle riser leading into the takeaway scene, plus subtle mid-scene foley cues
 * synced to visual beats & Whisper keywords.
 */
export function buildSfxCuesForStoryboard(
  storyboard: ReelStoryboard,
  sceneTimings: readonly SceneTiming[],
  sfxPaths: Record<SfxId, string>,
  captions: readonly CaptionToken[] = [],
): AudioSfxCue[] {
  const cues: AudioSfxCue[] = [];
  const totalDurationMs =
    sceneTimings.length > 0 ? sceneTimings[sceneTimings.length - 1]!.endMs : 0;

  // 0. Subtle opening breath accent synced with opening visual settle (keeps >=550ms clear of scene 2)
  const scene2StartMs = sceneTimings[1]?.startMs;
  if (
    totalDurationMs > 1000 &&
    sfxPaths.pop &&
    (scene2StartMs === undefined || scene2StartMs >= 585)
  ) {
    cues.push({
      path: sfxPaths.pop,
      offsetMs: 35,
      volumeDb: -21,
    });
  }

  // 1. Primary scene transitions + takeaway riser (always preserved verbatim)
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

  // 2. Mid-scene subtle foley cues (550ms min spacing from all cues, max 2/scene, max 14 total)
  const MAX_TOTAL_CUES = 14;
  const MIN_FOLEY_GAP_MS = 550;

  const canPlaceFoley = (offsetMs: number): boolean => {
    if (cues.length >= MAX_TOTAL_CUES) return false;
    if (offsetMs <= 220 || offsetMs >= totalDurationMs - 220) return false;
    return cues.every((existing) => Math.abs(existing.offsetMs - offsetMs) >= MIN_FOLEY_GAP_MS);
  };

  for (let i = 0; i < sceneTimings.length; i++) {
    if (cues.length >= MAX_TOTAL_CUES) break;
    const timing = sceneTimings[i]!;
    const scene = storyboard.scenes[i];
    if (!scene || isChannelOutroScene(scene)) continue;

    const dur = timing.endMs - timing.startMs;
    if (dur < 1900) continue;

    const candidates: Array<{ sfxId: SfxId; offsetMs: number; volumeDb: number }> = [];

    if (scene.type === 'code_compare' && scene.mode === 'before_after') {
      const pivotMs =
        findMatchingWordOffsetMs(captions, timing.startMs, timing.endMs, [
          'instead',
          'after',
          'better',
          'fix',
          'now',
          'switch',
          'replace',
        ]) ?? Math.round(timing.startMs + dur * 0.42);
      candidates.push({ sfxId: 'whoosh', offsetMs: pivotMs, volumeDb: -20 });
    } else if (scene.type === 'myth_fact') {
      const factMs =
        findMatchingWordOffsetMs(captions, timing.startMs, timing.endMs, [
          'reality',
          'actually',
          'fact',
          'instead',
          'but',
        ]) ?? Math.round(timing.startMs + dur * 0.48);
      candidates.push({
        sfxId: 'glitch',
        offsetMs: Math.round(timing.startMs + dur * 0.34),
        volumeDb: -20,
      });
      candidates.push({ sfxId: 'pop', offsetMs: factMs, volumeDb: -19 });
    } else if (scene.type === 'versus_split') {
      candidates.push({
        sfxId: 'click',
        offsetMs: Math.round(timing.startMs + dur * 0.48),
        volumeDb: -20,
      });
    } else if (
      scene.type === 'checklist_steps' ||
      scene.type === 'timeline' ||
      scene.type === 'benchmark_bars' ||
      scene.type === 'news_quote_card'
    ) {
      if (dur >= 2400) {
        candidates.push({
          sfxId: 'click',
          offsetMs: Math.round(timing.startMs + dur * 0.35),
          volumeDb: -20,
        });
        candidates.push({
          sfxId: 'pop',
          offsetMs: Math.round(timing.startMs + dur * 0.68),
          volumeDb: -20,
        });
      }
    } else if (scene.type === 'big_stat' || (scene.type === 'hook_title' && scene.highlightStat)) {
      const empWords = (scene.visual?.emphasis ?? []).flatMap((p) => p.split(/\s+/));
      const popMs =
        findMatchingWordOffsetMs(captions, timing.startMs, timing.endMs, empWords) ??
        Math.round(timing.startMs + dur * 0.42);
      candidates.push({ sfxId: 'pop', offsetMs: popMs, volumeDb: -20 });
    }

    let placedForScene = 0;
    for (const cand of candidates) {
      if (placedForScene >= 2 || cues.length >= MAX_TOTAL_CUES) break;
      const p = sfxPaths[cand.sfxId];
      if (!p) continue;
      if (canPlaceFoley(cand.offsetMs)) {
        cues.push({ path: p, offsetMs: cand.offsetMs, volumeDb: cand.volumeDb });
        placedForScene++;
      }
    }
  }

  return cues.sort((a, b) => a.offsetMs - b.offsetMs);
}
