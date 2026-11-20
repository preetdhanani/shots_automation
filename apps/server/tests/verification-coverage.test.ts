import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_VERIFY_CHECKS } from '../../../scripts/verify/checks/index.js';
import { EXEMPT_COMPONENTS, VERIFICATION_MANIFEST } from '../../../scripts/verify/manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');

describe('E2E Verification Loop Coverage & Evolution Gate', () => {
  it('covers every dashboard view file in scripts/verify/manifest.ts', () => {
    const viewsDir = path.join(WORKSPACE_ROOT, 'apps', 'dashboard', 'src', 'views');
    const actualViews = fs
      .readdirSync(viewsDir)
      .filter((name) => name.endsWith('.tsx'))
      .sort();

    const coveredViews = new Set(VERIFICATION_MANIFEST.flatMap((entry) => entry.views));
    const missingViews = actualViews.filter((view) => !coveredViews.has(view));

    expect(
      missingViews,
      `New view(s) missing from scripts/verify/manifest.ts: ${missingViews.join(', ')}. Add an E2E verification check in scripts/verify/checks/ and register it in manifest.ts.`,
    ).toEqual([]);
  });

  it('covers every non-exempt dashboard component in scripts/verify/manifest.ts', () => {
    const componentsDir = path.join(WORKSPACE_ROOT, 'apps', 'dashboard', 'src', 'components');
    const actualComponents = fs
      .readdirSync(componentsDir)
      .filter((name) => name.endsWith('.tsx'))
      .sort();

    const covered = new Set([
      ...VERIFICATION_MANIFEST.flatMap((entry) => entry.components),
      ...EXEMPT_COMPONENTS,
    ]);
    const missingComponents = actualComponents.filter((comp) => !covered.has(comp));

    expect(
      missingComponents,
      `New component(s) missing from scripts/verify/manifest.ts: ${missingComponents.join(', ')}. Register them in VERIFICATION_MANIFEST (with E2E coverage) or EXEMPT_COMPONENTS if purely primitive.`,
    ).toEqual([]);
  });

  it('ensures every manifest entry maps to an existing check file and registered check', () => {
    const checksDir = path.join(WORKSPACE_ROOT, 'scripts', 'verify', 'checks');
    const registeredIds = new Set(ALL_VERIFY_CHECKS.map((check) => check.id));

    for (const entry of VERIFICATION_MANIFEST) {
      const checkFilePath = path.join(checksDir, entry.checkFile);
      expect(
        fs.existsSync(checkFilePath),
        `Manifest entry "${entry.checkId}" references missing check file: ${checkFilePath}`,
      ).toBe(true);
      expect(
        registeredIds.has(entry.checkId),
        `Manifest entry "${entry.checkId}" is not exported in scripts/verify/checks/index.ts`,
      ).toBe(true);
    }
  });
});
