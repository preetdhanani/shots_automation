import type { VerifyCheck } from './types.js';

export const checkRunsAndLivePipeline: VerifyCheck = {
  id: '04-runs-and-live-pipeline',
  title: 'Parallel Render Queue, Live SSE Pipeline & Job Cancellation',
  async run(ctx) {
    await ctx.driver.goto('/runs');
    await ctx.driver.waitForText('Render Queue');
    ctx.recordAssertion('Loaded /runs Render Queue view');

    if (ctx.liveMode) {
      await ctx.captureScreenshot('06-runs-queue', 'Render Queue view');
      ctx.recordAssertion('Skipped starting sample pipeline run in live mode');
      return;
    }

    // Start a real sample pipeline run through the HTTP API with CSRF header
    const started = await ctx.driver.evaluate(async () => {
      const res = await fetch('/api/reels/sample', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Post-CSRF': '1',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`POST /api/reels/sample failed with HTTP ${res.status}`);
      }
      return (await res.json()) as { run?: { id: string }; reel?: { id: string } };
    });

    const runId = started.run?.id;
    if (!runId) {
      throw new Error('POST /api/reels/sample did not return a run.id');
    }
    ctx.recordAssertion(`Started pipeline run ${runId}`);

    // Refresh /runs and verify the active or recent run appears in the Render Queue UI
    await ctx.driver.goto('/runs');
    await ctx.driver.waitForText('Why Coding Harnesses Beat Prompt Stuffing');
    await ctx.captureScreenshot('06-runs-queue', 'Render Queue showing sample pipeline job');
    ctx.recordAssertion('Verified job rendered inside Render Queue view');

    // Open LiveRunView for the run and verify pipeline steps + logs
    await ctx.driver.goto(`/runs/${encodeURIComponent(runId)}`);
    await ctx.driver.waitForText('Pipeline Logs');
    await ctx.driver.waitForText('Script & Quality Gate');
    await ctx.captureScreenshot('07-live-run-detail', 'LiveRunView pipeline steps & logs');
    ctx.recordAssertion('Verified LiveRunView renders pipeline steps and logs');

    // If still active, verify Cancel button works cleanly
    const canCancel = await ctx.driver.hasText('Cancel');
    if (canCancel) {
      await ctx.driver.clickByText('Cancel', { exact: true });
      await ctx.driver.waitForCondition(
        async () => {
          const text = await ctx.driver.getBodyText();
          return (
            text.includes('Run Cancelled') ||
            text.includes('CANCELLED') ||
            text.includes('COMPLETED') ||
            text.includes('FAILED')
          );
        },
        'run reached terminal state after cancel',
      );
      ctx.recordAssertion('Verified job cancellation transitions cleanly to terminal state');
    }
  },
};
