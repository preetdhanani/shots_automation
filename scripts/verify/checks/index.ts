import { checkShellAndHealth } from './01-shell-and-health.js';
import { checkDiscoverAndModals } from './02-discover-and-modals.js';
import { checkSettingsAndLlm } from './03-settings-and-llm.js';
import { checkRunsAndLivePipeline } from './04-runs-and-live-pipeline.js';
import { checkApprovalStudioAndPublish } from './05-approval-studio-and-publish.js';
import { checkLibrary } from './06-library.js';
import type { VerifyCheck } from './types.js';

export const ALL_VERIFY_CHECKS: readonly VerifyCheck[] = [
  checkShellAndHealth,
  checkDiscoverAndModals,
  checkSettingsAndLlm,
  checkRunsAndLivePipeline,
  checkApprovalStudioAndPublish,
  checkLibrary,
];
