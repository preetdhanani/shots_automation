# Self-Evolving E2E Verification Loop

Post Studio ships with an automated, screenshot-backed end-to-end verification loop that tests the real dashboard and server together.

## Running Verification

- Full verification (build + typecheck + lint + unit/drift tests + browser E2E with screenshots):

```bash
npm run verify
```

- Browser E2E loop only (requires `apps/dashboard/dist` to be built):

```bash
npm run verify:e2e
```

- Non-destructive check against an already-running server:

```bash
VERIFY_BASE_URL=http://127.0.0.1:4310 npm run verify:e2e
```

## What It Checks

- Boots an isolated ephemeral server (`127.0.0.1:0`) with its own temp SQLite database, valid fixture media, and a local mock OpenAI-compatible LLM server.
- Never modifies or pollutes `data/post.db`.
- Launches headless Chromium using Remotion's bundled Chrome Headless Shell (`@remotion/renderer`).
- Fails automatically if any check fails, if any browser `console.error` or uncaught exception occurs, or if any unexpected HTTP `4xx`/`5xx` response is returned.
- Writes timestamped PNG screenshots and a full Markdown + JSON report to `artifacts/verification/<run-id>/` (and updates `artifacts/verification/latest-report.md`).

## How It Evolves With New Features

1. Every dashboard view (`apps/dashboard/src/views/*.tsx`) and component (`apps/dashboard/src/components/*.tsx`) is tracked in `scripts/verify/manifest.ts`.
2. `apps/server/tests/verification-coverage.test.ts` runs during `npm test` and fails automatically if any new view or component is added without being registered in `scripts/verify/manifest.ts` and covered by a check module in `scripts/verify/checks/`.
3. When adding a new feature:
   - Add or update a check module under `scripts/verify/checks/`.
   - Register the check in `scripts/verify/checks/index.ts` and `scripts/verify/manifest.ts`.
   - Run `npm run verify` and visually inspect the generated screenshots in `artifacts/verification/<run-id>/screenshots/`.
