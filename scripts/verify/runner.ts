import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VERIFY_CHECKS } from './checks/index.js';
import type { VerifyCheckResult, VerifyScreenshotRecord } from './checks/types.js';
import { VerifyDriver, type ConsoleErrorRecord, type NetworkErrorRecord } from './driver.js';
import { startVerifyHarness, type VerifyHarness } from './harness.js';
import { VERIFICATION_MANIFEST } from './manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

interface VerificationReportJson {
  runId: string;
  timestamp: string;
  mode: 'isolated' | 'live';
  baseUrl: string;
  ok: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  totalScreenshots: number;
  consoleErrors: ConsoleErrorRecord[];
  networkErrors: NetworkErrorRecord[];
  results: VerifyCheckResult[];
}

function buildMarkdownReport(report: VerificationReportJson): string {
  const lines: string[] = [
    `# Post Studio - E2E Verification Report (${report.runId})`,
    '',
    `- **Status**: ${report.ok ? 'PASS' : 'FAIL'}`,
    `- **Mode**: ${report.mode}`,
    `- **Target URL**: ${report.baseUrl}`,
    `- **Timestamp**: ${report.timestamp}`,
    `- **Checks**: ${report.passedChecks}/${report.totalChecks} passed`,
    `- **Screenshots**: ${report.totalScreenshots}`,
    `- **Console Errors**: ${report.consoleErrors.length}`,
    `- **HTTP 4xx/5xx Errors**: ${report.networkErrors.length}`,
    '',
    '## Check Summary',
    '',
    '| Check | Status | Duration | Assertions | Screenshots |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const r of report.results) {
    lines.push(
      `| \`${r.id}\` - ${r.title} | ${r.status.toUpperCase()} | ${r.durationMs}ms | ${r.assertions.length} | ${r.screenshots.length} |`,
    );
  }

  lines.push('', '## Detailed Results & Screenshots', '');

  for (const r of report.results) {
    lines.push(`### ${r.id} - ${r.title} (${r.status.toUpperCase()})`, '');
    if (r.error) {
      lines.push(`- **Error**: \`${r.error}\``);
    }
    for (const a of r.assertions) {
      lines.push(`- [x] ${a}`);
    }
    if (r.screenshots.length > 0) {
      lines.push('');
      for (const s of r.screenshots) {
        lines.push(`#### ${s.name} - ${s.caption}`, '', `![${s.name}](${s.relativePath})`, '');
      }
    }
  }

  if (report.consoleErrors.length > 0) {
    lines.push('## Console Errors', '');
    for (const err of report.consoleErrors) {
      lines.push(`- \`${err.url}\`: ${err.message}`);
    }
    lines.push('');
  }

  if (report.networkErrors.length > 0) {
    lines.push('## Unexpected HTTP 4xx/5xx Responses', '');
    for (const err of report.networkErrors) {
      lines.push(`- HTTP \`${err.status}\` on \`${err.url}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const liveBaseUrl = process.env.VERIFY_BASE_URL?.trim();
  const liveMode = Boolean(liveBaseUrl);

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactsRoot = path.join(WORKSPACE_ROOT, 'artifacts', 'verification');
  const runDir = path.join(artifactsRoot, runId);
  const shotsDir = path.join(runDir, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });

  // Verify manifest & registered checks stay 1:1 in sync
  const checkIds = new Set(ALL_VERIFY_CHECKS.map((c) => c.id));
  for (const entry of VERIFICATION_MANIFEST) {
    if (!checkIds.has(entry.checkId)) {
      throw new Error(
        `Manifest entry "${entry.checkId}" is not registered in scripts/verify/checks/index.ts`,
      );
    }
  }

  let harness: VerifyHarness | null = null;
  let driver: VerifyDriver | null = null;

  const cleanup = async () => {
    if (driver) {
      await driver.close();
      driver = null;
    }
    if (harness) {
      await harness.close();
      harness = null;
    }
  };

  const onSignal = () => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    if (liveMode && liveBaseUrl) {
      harness = {
        baseUrl: liveBaseUrl.replace(/\/+$/, ''),
        mockLlmBaseUrl: '',
        seededReadyReelId: '',
        seededPublishedReelId: '',
        seededTopicIds: [],
        close: async () => {},
      };
    } else {
      console.log('[verify] Booting isolated ephemeral server & mock LLM harness...');
      harness = await startVerifyHarness(WORKSPACE_ROOT);
    }

    console.log(`[verify] Launching headless Chromium against ${harness.baseUrl}...`);
    driver = await VerifyDriver.launch(harness.baseUrl);

    const results: VerifyCheckResult[] = [];
    for (const check of ALL_VERIFY_CHECKS) {
      const started = Date.now();
      const assertions: string[] = [];
      const screenshots: VerifyScreenshotRecord[] = [];

      console.log(`[verify] Running ${check.id} (${check.title})...`);
      try {
        await check.run({
          driver,
          harness,
          liveMode,
          recordAssertion: (label) => {
            assertions.push(label);
          },
          captureScreenshot: async (name, caption, opts) => {
            const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-');
            const fileName = `${safeName}.png`;
            const filePath = path.join(shotsDir, fileName);
            await driver!.screenshot(filePath, opts);
            screenshots.push({
              name: safeName,
              filePath,
              relativePath: `screenshots/${fileName}`,
              caption,
            });
          },
        });
        results.push({
          id: check.id,
          title: check.title,
          status: 'passed',
          durationMs: Date.now() - started,
          assertions,
          screenshots,
        });
        console.log(
          `[verify]   PASS ${check.id} (${assertions.length} assertions, ${screenshots.length} screenshots, ${Date.now() - started}ms)`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Capture failure screenshot if browser is still alive
        try {
          const failPath = path.join(shotsDir, `${check.id}-FAILURE.png`);
          await driver.screenshot(failPath, { fullPage: false });
          screenshots.push({
            name: `${check.id}-FAILURE`,
            filePath: failPath,
            relativePath: `screenshots/${check.id}-FAILURE.png`,
            caption: `Failure state: ${message}`,
          });
        } catch {
          // Ignore screenshot capture failure on crash
        }
        results.push({
          id: check.id,
          title: check.title,
          status: 'failed',
          durationMs: Date.now() - started,
          assertions,
          screenshots,
          error: message,
        });
        console.error(`[verify]   FAIL ${check.id}: ${message}`);
      }
    }

    const consoleErrors = driver.getConsoleErrors();
    const networkErrors = driver.getNetworkErrors();
    const passedChecks = results.filter((r) => r.status === 'passed').length;
    const failedChecks = results.length - passedChecks;
    const totalScreenshots = results.reduce((sum, r) => sum + r.screenshots.length, 0);
    const ok = failedChecks === 0 && consoleErrors.length === 0 && networkErrors.length === 0;

    const report: VerificationReportJson = {
      runId,
      timestamp: new Date().toISOString(),
      mode: liveMode ? 'live' : 'isolated',
      baseUrl: harness.baseUrl,
      ok,
      totalChecks: results.length,
      passedChecks,
      failedChecks,
      totalScreenshots,
      consoleErrors,
      networkErrors,
      results,
    };

    const md = buildMarkdownReport(report);
    const reportMdPath = path.join(runDir, 'report.md');
    const reportJsonPath = path.join(runDir, 'report.json');
    fs.writeFileSync(reportMdPath, md, 'utf8');
    fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(
      path.join(artifactsRoot, 'latest-report.md'),
      `Latest run: \`${runId}\`\n\n${md}`,
      'utf8',
    );

    console.log('');
    console.log(`[verify] Report written to: ${reportMdPath}`);
    console.log(
      `[verify] Summary: ${passedChecks}/${results.length} checks passed, ${totalScreenshots} screenshots, ${consoleErrors.length} console errors, ${networkErrors.length} HTTP 4xx/5xx errors.`,
    );

    if (!ok) {
      if (consoleErrors.length > 0) {
        console.error('[verify] Console errors detected:', consoleErrors);
      }
      if (networkErrors.length > 0) {
        console.error('[verify] Unexpected HTTP errors detected:', networkErrors);
      }
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
  }
}

void main().catch((err) => {
  console.error('[verify] Fatal runner error:', err);
  process.exit(1);
});
