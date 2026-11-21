import fs from 'node:fs';
import path from 'node:path';

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9_-]{1,80}$/;

export function assertSafeId(value: string, label = 'id'): string {
  if (!SAFE_SEGMENT_RE.test(value)) {
    throw new Error(`Invalid ${label}: "${value}" contains unsafe characters.`);
  }
  return value;
}

export class LocalAssetStorage {
  readonly dataDir: string;
  readonly reelsDir: string;
  readonly voicePreviewsDir: string;
  readonly musicDir: string;
  readonly sfxDir: string;
  readonly logsDir: string;

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    this.reelsDir = path.join(this.dataDir, 'reels');
    this.voicePreviewsDir = path.join(this.dataDir, 'voice-previews');
    this.musicDir = path.join(this.dataDir, 'music');
    this.sfxDir = path.join(this.dataDir, 'sfx');
    this.logsDir = path.join(this.dataDir, 'logs');
  }

  ensureBaseDirs(): void {
    fs.mkdirSync(this.reelsDir, { recursive: true });
    fs.mkdirSync(this.voicePreviewsDir, { recursive: true });
    fs.mkdirSync(this.musicDir, { recursive: true });
    fs.mkdirSync(this.sfxDir, { recursive: true });
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  getReelDir(reelId: string): string {
    assertSafeId(reelId, 'reelId');
    return path.join(this.reelsDir, reelId);
  }

  ensureReelDir(reelId: string): string {
    const dir = this.getReelDir(reelId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getStagingDir(reelId: string, runId: string): string {
    assertSafeId(reelId, 'reelId');
    assertSafeId(runId, 'runId');
    const dir = path.join(this.getReelDir(reelId), `staging-${runId}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  cleanupStagingDir(stagingDir: string): void {
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  reelFile(reelId: string, filename: string): string {
    if (path.basename(filename) !== filename || filename.includes('..')) {
      throw new Error(`Invalid filename: "${filename}"`);
    }
    return path.join(this.getReelDir(reelId), filename);
  }

  promoteStagedFiles(
    reelId: string,
    stagingDir: string,
    mappings: Array<{ stagedName: string; targetName: string }>,
  ): void {
    const reelDir = this.ensureReelDir(reelId);
    for (const { stagedName, targetName } of mappings) {
      if (path.basename(stagedName) !== stagedName || path.basename(targetName) !== targetName) {
        throw new Error('Invalid staged filename mapping.');
      }
      const src = path.join(stagingDir, stagedName);
      if (!fs.existsSync(src)) {
        throw new Error(`Missing staged output file: ${src}`);
      }
      const dest = path.join(reelDir, targetName);
      const tmpDest = path.join(reelDir, `.promote-${targetName}.tmp`);
      fs.copyFileSync(src, tmpDest);
      fs.renameSync(tmpDest, dest);
    }
  }

  deleteReelDir(reelId: string): void {
    const dir = this.getReelDir(reelId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  getVoicePreviewPath(voiceName: string, modelHash: string): string {
    assertSafeId(voiceName, 'voiceName');
    assertSafeId(modelHash, 'modelHash');
    fs.mkdirSync(this.voicePreviewsDir, { recursive: true });
    return path.join(this.voicePreviewsDir, `${voiceName}-${modelHash}.wav`);
  }

  hasValidFinalVideo(reelId: string): boolean {
    const finalPath = this.reelFile(reelId, 'final.mp4');
    if (!fs.existsSync(finalPath)) return false;
    const stat = fs.statSync(finalPath);
    return stat.size > 10_000;
  }
}
