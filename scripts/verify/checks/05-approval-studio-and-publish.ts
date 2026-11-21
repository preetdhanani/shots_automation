import { CHANNEL_OUTRO_NARRATION } from '@post/core';
import type { VerifyCheck } from './types.js';

export const checkApprovalStudioAndPublish: VerifyCheck = {
  id: '05-approval-studio-and-publish',
  title: 'Approval Studio, 9:16 Preview, 6-Scene Editor (with Outro) & Publish Modal',
  async run(ctx) {
    const targetPath = ctx.harness.seededReadyReelId
      ? `/review/${encodeURIComponent(ctx.harness.seededReadyReelId)}`
      : '/review';

    await ctx.driver.goto(targetPath);
    await ctx.driver.waitForText('Approve & Publish');
    await ctx.driver.waitForText('IG HUD');
    ctx.recordAssertion('Loaded Approval Studio with ready reel');

    // Verify PhonePreview video element and IG HUD Safe Zone toggle
    const hasVideo = await ctx.driver.evaluate(() => Boolean(document.querySelector('video')));
    if (!hasVideo) {
      throw new Error('Expected <video> element inside PhonePreview');
    }
    if (await ctx.driver.hasText('IG HUD On')) {
      await ctx.driver.clickByText('IG HUD On');
      await ctx.driver.waitForText('IG HUD Off');
      await ctx.driver.clickByText('IG HUD Off');
      await ctx.driver.waitForText('IG HUD On');
    }
    ctx.recordAssertion('Verified 9:16 PhonePreview video element & IG Safe Zone toggle');
    await ctx.captureScreenshot('08-approval-studio', 'Approval Studio with 9:16 PhonePreview');

    // Switch to Storyboard & Voice tab and expand Scene 06 (Channel Outro)
    await ctx.driver.clickByText('Storyboard & Voice');
    await ctx.driver.waitForText('06');
    await ctx.driver.clickByText('06');
    await ctx.driver.waitForDomIdle(250);
    const outroCheck = await ctx.driver.evaluateWithArg((expectedNarration: string) => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
      const areas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
      const hasBadge = inputs.some((el) => el.value === 'FOLLOW FOR MORE');
      const hasNarration = areas.some((el) => el.value.includes(expectedNarration));
      return { hasBadge, hasNarration };
    }, CHANNEL_OUTRO_NARRATION);
    if (!outroCheck.hasBadge || !outroCheck.hasNarration) {
      throw new Error(
        `Expected Scene 6 channel outro fields inside VisualSceneEditor (badge=${outroCheck.hasBadge}, narration=${outroCheck.hasNarration})`,
      );
    }
    ctx.recordAssertion('Verified VisualSceneEditor displays Scene 6 Channel Outro narration');
    await ctx.captureScreenshot(
      '09-scene-editor-outro',
      'VisualSceneEditor showing 6 scenes including Channel Outro',
    );

    // Switch back to Approve & Publish tab, edit caption, save draft, and open PublishModal
    await ctx.driver.clickByText('Approve & Publish');
    await ctx.driver.waitForDomIdle(250);

    if (!ctx.liveMode) {
      await ctx.driver.fillFirstTextareaIn(
        'main',
        'Big prompts alone hit a ceiling. Verified draft edit from E2E loop.',
      );
      await ctx.driver.waitForText('Save Draft');
      await ctx.driver.clickByText('Save Draft');
      await ctx.driver.waitForText('Saved draft changes.');
      ctx.recordAssertion('Verified caption edit & Save Draft persistence');
    }

    const hasDryRunBtn = await ctx.driver.hasText('Dry-Run / Inspect Publish');
    if (hasDryRunBtn) {
      await ctx.driver.clickByText('Dry-Run / Inspect Publish');
    } else {
      await ctx.driver.clickByText('Approve & Publish to Instagram');
    }
    await ctx.driver.waitForText('Confirm Instagram Publish');
    ctx.recordAssertion('Opened PublishModal cleanly');
    await ctx.captureScreenshot('10-publish-modal', 'Instagram Publish confirmation modal', {
      fullPage: false,
    });

    await ctx.driver.clickByText('Cancel');
    await ctx.driver.waitForDomIdle(200);
  },
};
