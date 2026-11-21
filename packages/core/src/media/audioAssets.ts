import type { MusicMoodId, SfxId } from '../variety/registry.js';
import { ensureMusicAndSfxLibrary, resolveMusicTrackForMood } from './musicLibrary.js';

export function ensureGeneratedAudioAssets(
  musicDir: string,
  opts: { mood?: MusicMoodId; seed?: number } = {},
): {
  ambientPadPath: string;
  transitionClickPath: string;
  moods: Record<MusicMoodId, string>;
  sfx: Record<SfxId, string>;
} {
  const lib = ensureMusicAndSfxLibrary(musicDir);
  const mood = opts.mood ?? 'dark_pad';
  const chosenMusic = resolveMusicTrackForMood(musicDir, mood, opts.seed ?? 0);

  return {
    ambientPadPath: chosenMusic,
    transitionClickPath: lib.sfx.click,
    moods: lib.moods,
    sfx: lib.sfx,
  };
}
