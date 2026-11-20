import type { VerifyCheck } from './types.js';

export const checkDiscoverAndModals: VerifyCheck = {
  id: '02-discover-and-modals',
  title: 'Discover Feed, Topic Generate Modal & Custom Reel Modal',
  async run(ctx) {
    await ctx.driver.goto('/discover');
    await ctx.driver.waitForText('Frostbite: AI-Designed CPU Architecture');
    ctx.recordAssertion('Rendered seeded Discover topic cards');

    // Open topic Generate Reel modal and verify Voice + LLM selectors
    await ctx.driver.clickByText('Generate Reel');
    await ctx.driver.waitForText('Configure & Generate Reel');
    await ctx.driver.waitForText('Script LLM Endpoint');
    ctx.recordAssertion('Opened Configure & Generate Reel modal from topic card');
    await ctx.captureScreenshot(
      '02-discover-generate-modal',
      'Topic Generate Reel modal with Voice & Script LLM selection',
      { fullPage: false },
    );

    // Close modal
    await ctx.driver.clickByText('Cancel');
    await ctx.driver.waitForDomIdle(250);

    // Open New Custom Reel modal
    await ctx.driver.clickByText('New Custom Reel');
    await ctx.driver.waitForText('Create Custom Reel');
    ctx.recordAssertion('Opened Create Custom Reel modal');
    await ctx.captureScreenshot('03-custom-reel-modal', 'Create Custom Reel modal', {
      fullPage: false,
    });

    // Close modal
    await ctx.driver.clickByText('Cancel');
    await ctx.driver.waitForDomIdle(250);
  },
};
