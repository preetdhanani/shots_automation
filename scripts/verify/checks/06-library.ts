import type { VerifyCheck } from './types.js';

export const checkLibrary: VerifyCheck = {
  id: '06-library',
  title: 'Library Archive, Media Covers & Inspect Navigation',
  async run(ctx) {
    await ctx.driver.goto('/library');
    await ctx.driver.waitForText('Library');
    ctx.recordAssertion('Loaded /library archive view');

    if (!ctx.liveMode) {
      await ctx.driver.waitForText('Published Benchmark Comparison Reel');
      const coverLoaded = await ctx.driver.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
        return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
      });
      if (!coverLoaded) {
        throw new Error('Expected Library cover <img> to load cleanly with naturalWidth > 0');
      }
      ctx.recordAssertion('Verified published reel card & cover image loaded cleanly');
    }

    await ctx.captureScreenshot('11-library', 'Library archive view');

    if (await ctx.driver.hasText('Inspect')) {
      await ctx.driver.clickByText('Inspect');
      await ctx.driver.waitForCondition(
        async () => ctx.driver.url().includes('/review/'),
        'navigated to /review/:id from Library Inspect button',
      );
      ctx.recordAssertion('Verified Inspect button navigates from Library to Approval Studio');
    }
  },
};
