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
      const hasNarration = areas.some((el) => el.value === expectedNarration);
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

    await ctx.driver.clickByText('Run Dry-Run Check');
    await ctx.driver.waitForText('valid 1080x1920 H.264/AAC MP4');
    ctx.recordAssertion('Ran Dry-Run Check inside PublishModal and verified 1080x1920 spec report');
    await ctx.captureScreenshot('10-publish-modal', 'Instagram Publish confirmation modal', {
      fullPage: false,
    });

    await ctx.driver.clickByText('Cancel');
    await ctx.driver.waitForDomIdle(200);

    // Verify 429 publish spacing guardrail + UI override checkbox on temporary non-sample fixtures
    if (!ctx.liveMode && ctx.harness.createTempSpacingFixtures) {
      const { candidateId, cleanup } = ctx.harness.createTempSpacingFixtures();
      try {
        const res429 = await fetch(`${ctx.harness.baseUrl}/api/reels/${encodeURIComponent(candidateId)}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Post-CSRF': '1',
            Origin: ctx.harness.baseUrl,
          },
          body: JSON.stringify({ dryRun: false }),
        });
        if (res429.status !== 429) {
          throw new Error(`Expected HTTP 429 publish spacing guardrail, got ${res429.status}`);
        }
        ctx.recordAssertion('Verified POST /api/reels/:id/publish returns HTTP 429 inside spacing window');

        await ctx.driver.goto(`/review/${encodeURIComponent(candidateId)}`);
        await ctx.driver.waitForText('Approve & Publish to Instagram');
        await ctx.driver.clickByText('Approve & Publish to Instagram');
        await ctx.driver.waitForText('Override spacing guardrail and publish anyway');

        const disabledInitially = await ctx.driver.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const btns = Array.from(dialog?.querySelectorAll('button') ?? []);
          const confirmBtn = btns.find((b) => b.textContent?.includes('Confirm & Publish Now'));
          return Boolean(confirmBtn && (confirmBtn as HTMLButtonElement).disabled);
        });
        if (!disabledInitially) {
          throw new Error('Expected Confirm & Publish Now button to be disabled until spacing override is checked');
        }

        await ctx.driver.evaluate(() => {
          const checkbox = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]');
          checkbox?.click();
        });
        await ctx.driver.waitForDomIdle(150);

        const enabledAfterOverride = await ctx.driver.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const btns = Array.from(dialog?.querySelectorAll('button') ?? []);
          const confirmBtn = btns.find((b) => b.textContent?.includes('Confirm & Publish Now'));
          return Boolean(confirmBtn && !(confirmBtn as HTMLButtonElement).disabled);
        });
        if (!enabledAfterOverride) {
          throw new Error('Expected Confirm & Publish Now button to enable after checking spacing override');
        }
        ctx.recordAssertion('Verified PublishModal spacing guardrail banner & override toggle cleanly');
        await ctx.captureScreenshot(
          '10b-publish-spacing-guardrail',
          'PublishModal displaying spacing guardrail warning and override toggle',
          { fullPage: false },
        );

        await ctx.driver.clickByText('Cancel');
        await ctx.driver.waitForDomIdle(200);
      } finally {
        cleanup();
      }
    }
  },
};
