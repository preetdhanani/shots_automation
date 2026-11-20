import fs from 'node:fs';
import path from 'node:path';

function writeStereoWav16Bit(filePath: string, sampleRate: number, samplesL: Float32Array, samplesR: Float32Array): void {
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

  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

export function ensureGeneratedAudioAssets(musicDir: string): {
  ambientPadPath: string;
  transitionClickPath: string;
} {
  const generatedDir = path.join(musicDir, 'generated');
  const ambientPadPath = path.join(generatedDir, 'ambient-dark-pad.wav');
  const transitionClickPath = path.join(generatedDir, 'transition-click.wav');

  const sampleRate = 48000;

  if (!fs.existsSync(ambientPadPath)) {
    // 12-second seamless loopable warm ambient pad (D minor 9 chord harmonics)
    const durationSec = 12;
    const frames = sampleRate * durationSec;
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);

    // Frequencies chosen with integer cycles over 12 seconds for click-free loop boundaries
    const voices = [
      { freq: 146.75, amp: 0.24, pan: 0.45 },
      { freq: 220.0, amp: 0.18, pan: 0.55 },
      { freq: 261.6667, amp: 0.14, pan: 0.35 },
      { freq: 329.6667, amp: 0.11, pan: 0.65 },
      { freq: 440.0, amp: 0.06, pan: 0.5 },
    ];

    for (let i = 0; i < frames; i++) {
      const t = i / sampleRate;
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

    writeStereoWav16Bit(ambientPadPath, sampleRate, left, right);
  }

  if (!fs.existsSync(transitionClickPath)) {
    // 45ms crisp soft UI transition click
    const frames = Math.floor(sampleRate * 0.045);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);

    for (let i = 0; i < frames; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 110) * Math.min(1, t / 0.002);
      const freq = 920 - 520 * (t / 0.045);
      const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.35;
      left[i] = sample;
      right[i] = sample;
    }

    writeStereoWav16Bit(transitionClickPath, sampleRate, left, right);
  }

  // Prefer user-dropped royalty-free audio file in data/music/ if present
  let chosenMusic = ambientPadPath;
  if (fs.existsSync(musicDir)) {
    const entries = fs
      .readdirSync(musicDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(e.name))
      .map((e) => path.join(musicDir, e.name))
      .sort();
    if (entries[0]) {
      chosenMusic = entries[0];
    }
  }

  return {
    ambientPadPath: chosenMusic,
    transitionClickPath,
  };
}
