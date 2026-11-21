import type { VerifyCheck } from './types.js';

export const checkDiscoverAndModals: VerifyCheck = {
  id: '02-discover-and-modals',
  title: 'Discover Feed, Feed Cleaner, Topic Generate Modal & Custom Reel Modal',
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

    // Verify Clean Feed modal & interval-based cleanup
    if (ctx.liveMode) {
      const canOpenClean = await ctx.driver.evaluate(() => {
        const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
          (b.textContent ?? '').includes('Clean Feed'),
        );
        return Boolean(btn && !btn.disabled);
      });
      if (canOpenClean) {
        await ctx.driver.clickByText('Clean Feed');
        await ctx.driver.waitForText('Clean Discover Feed');
        await ctx.driver.waitForText('Last 3 days');
        await ctx.driver.waitForText('Last week');
        await ctx.driver.waitForText('Last month');
        await ctx.captureScreenshot('03b-clean-feed-modal', 'Clean Discover Feed modal', {
          fullPage: false,
        });
        await ctx.driver.clickByText('Cancel');
        await ctx.driver.waitForDomIdle(250);
        ctx.recordAssertion('Verified Clean Discover Feed modal in live mode');
      }
      return;
    }

    await ctx.driver.waitForText('Legacy Prompt Engineering Guide for Early Chatbots');
    await ctx.driver.waitForText('Archive: Early Transformer Attention Paper Walkthrough');

    await ctx.driver.clickByText('Clean Feed');
    await ctx.driver.waitForText('Clean Discover Feed');
    await ctx.driver.waitForText('Remove 2 Older Topics');
    ctx.recordAssertion('Opened Clean Discover Feed modal with default Last week preview (3 stay, 2 remove)');

    await ctx.captureScreenshot('03b-clean-feed-modal', 'Clean Discover Feed modal with interval selector', {
      fullPage: false,
    });

    // Toggle intervals and verify dynamic keep/remove previews
    await ctx.driver.clickByText('Last 3 days', { selector: 'label' });
    await ctx.driver.waitForText('Remove 3 Older Topics');
    ctx.recordAssertion('Switched interval to Last 3 days (2 stay, 3 remove)');

    await ctx.driver.clickByText('Last month', { selector: 'label' });
    await ctx.driver.waitForText('Remove 1 Older Topic');
    ctx.recordAssertion('Switched interval to Last month (4 stay, 1 remove)');

    // Return to Last week and run clean
    await ctx.driver.clickByText('Last week', { selector: 'label' });
    await ctx.driver.waitForText('Remove 2 Older Topics');
    await ctx.driver.clickByText('Remove 2 Older Topics');

    await ctx.driver.waitForText('Cleaned 2 older topics.');
    await ctx.driver.waitForCondition(
      async () => {
        const text = await ctx.driver.getBodyText();
        return (
          text.includes('Frostbite: AI-Designed CPU Architecture') &&
          !text.includes('Legacy Prompt Engineering Guide for Early Chatbots') &&
          !text.includes('Archive: Early Transformer Attention Paper Walkthrough')
        );
      },
      'Older topics removed and recent topics kept in Discover feed',
    );
    ctx.recordAssertion('Cleaned 2 older topics while keeping 3 recent topics');

    await ctx.captureScreenshot(
      '03c-discover-after-clean',
      'Discover feed after Last week clean with Undo toast',
      { fullPage: false },
    );

    // Undo and verify restored
    await ctx.driver.clickByText('Undo');
    await ctx.driver.waitForCondition(
      async () => {
        const text = await ctx.driver.getBodyText();
        return (
          text.includes('Legacy Prompt Engineering Guide for Early Chatbots') &&
          text.includes('Archive: Early Transformer Attention Paper Walkthrough')
        );
      },
      'Cleaned topics restored via Undo',
    );
    ctx.recordAssertion('Restored cleaned topics cleanly via Undo toast');
  },
};
