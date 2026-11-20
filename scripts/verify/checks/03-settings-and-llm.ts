import type { VerifyCheck } from './types.js';

export const checkSettingsAndLlm: VerifyCheck = {
  id: '03-settings-and-llm',
  title: 'Settings, Preferences & Custom LLM Endpoints',
  async run(ctx) {
    await ctx.driver.goto('/settings');
    await ctx.driver.waitForText('Script LLM Endpoints');
    await ctx.driver.waitForText('Google Gemini');
    ctx.recordAssertion('Loaded Settings view and built-in Google Gemini endpoint');
    await ctx.captureScreenshot('04-settings-overview', 'Settings & Health overview');

    if (ctx.liveMode) {
      ctx.recordAssertion('Skipped mutating custom endpoint CRUD in live mode');
      return;
    }

    // Open Add Custom Endpoint form
    await ctx.driver.clickByText('Add Custom Endpoint');
    await ctx.driver.waitForText('Connect OpenAI-Compatible Endpoint');
    ctx.recordAssertion('Opened Add Custom Endpoint inline form');

    // Fill mock OpenAI-compatible server details
    await ctx.driver.fillByPlaceholder('Ollama Local', 'Verify Mock LLM');
    await ctx.driver.fillByPlaceholder('http://127.0.0.1:11434/v1', ctx.harness.mockLlmBaseUrl);
    await ctx.driver.fillByPlaceholder('sk-...', 'sk-verify-secret-key-9876');

    // Fetch Models from mock server
    await ctx.driver.clickByText('Fetch Models');
    await ctx.driver.waitForText('verify-coder-7b');
    ctx.recordAssertion('Fetched models cleanly from mock OpenAI-compatible endpoint');

    // Test Connection against mock server
    await ctx.driver.clickByText('Test Connection');
    await ctx.driver.waitForText('Connected cleanly');
    ctx.recordAssertion('Verified live Test Connection probe against mock endpoint');
    await ctx.captureScreenshot(
      '05-settings-add-endpoint-tested',
      'Custom endpoint form after Fetch Models + Test Connection passed',
    );

    // Save & Activate
    await ctx.driver.clickByText('Save & Activate');
    await ctx.driver.waitForText('Verify Mock LLM');
    await ctx.driver.waitForText('sk-...9876');
    ctx.recordAssertion('Saved custom endpoint and verified API key masking in UI');

    // Switch back to Google Gemini
    await ctx.driver.clickByText('Set Active');
    await ctx.driver.waitForText('Active: Google Gemini');
    ctx.recordAssertion('Switched active Script LLM back to Google Gemini');

    // Delete the test custom endpoint (double-click confirmation flow)
    await ctx.driver.clickByText('Delete');
    await ctx.driver.clickByText('Confirm');
    await ctx.driver.waitForCondition(
      async () => !(await ctx.driver.hasText('Verify Mock LLM')),
      'Verify Mock LLM endpoint removed from list',
    );
    ctx.recordAssertion('Deleted test custom endpoint cleanly');
  },
};
