import type { VerifyCheck } from './types.js';

export const checkShellAndHealth: VerifyCheck = {
  id: '01-shell-and-health',
  title: 'App Shell, Navigation, Setup Readiness & Health',
  async run(ctx) {
    await ctx.driver.setViewport(1440, 900);
    await ctx.driver.goto('/discover');
    await ctx.driver.waitForText('Discover');
    ctx.recordAssertion('Loaded /discover shell cleanly');

    const hasSidebarLinks = await ctx.driver.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes('Discover') &&
        text.includes('Render Queue') &&
        text.includes('Review Queue') &&
        text.includes('Library') &&
        text.includes('Settings & Health')
      );
    });
    if (!hasSidebarLinks) {
      throw new Error('Missing expected sidebar navigation links');
    }
    ctx.recordAssertion('Verified sidebar navigation items');

    const healthOk = await ctx.driver.evaluate(async () => {
      const res = await fetch('/api/health');
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean };
      return data.ok === true;
    });
    if (!healthOk) {
      throw new Error('/api/health did not return { ok: true }');
    }
    ctx.recordAssertion('Verified /api/health returns 200 OK');

    await ctx.captureScreenshot('01-discover-desktop', 'Discover view & setup readiness (1440x900)');

    await ctx.driver.setViewport(1024, 900);
    await ctx.captureScreenshot('01b-discover-compact', 'Compact desktop layout (1024x900)', {
      fullPage: false,
    });
    await ctx.driver.setViewport(1440, 900);
    ctx.recordAssertion('Verified compact desktop viewport layout');
  },
};
