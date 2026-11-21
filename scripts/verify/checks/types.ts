import type { VerifyDriver } from '../driver.js';
import type { VerifyHarness } from '../harness.js';

export interface VerifyScreenshotRecord {
  name: string;
  filePath: string;
  relativePath: string;
  caption: string;
}

export interface VerifyCheckContext {
  driver: VerifyDriver;
  harness: VerifyHarness;
  liveMode: boolean;
  workspaceRoot: string;
  shotsDir: string;
  recordAssertion: (label: string) => void;
  captureScreenshot: (name: string, caption: string, opts?: { fullPage?: boolean }) => Promise<void>;
  attachImage: (name: string, sourceFilePath: string, caption: string) => void;
}

export interface VerifyCheck {
  id: string;
  title: string;
  run: (ctx: VerifyCheckContext) => Promise<void>;
}

export interface VerifyCheckResult {
  id: string;
  title: string;
  status: 'passed' | 'failed';
  durationMs: number;
  assertions: string[];
  screenshots: VerifyScreenshotRecord[];
  error?: string;
}
