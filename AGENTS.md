# Agent Instructions - Post Studio

## Verification Loop Policy

- Every UI or feature change must be verified end-to-end before completion.
- Whenever you add a new view (`apps/dashboard/src/views/*.tsx`), modal, panel, or user-facing workflow, you MUST:
  1. Add or update its E2E check in `scripts/verify/checks/`.
  2. Register it in `scripts/verify/checks/index.ts` and `scripts/verify/manifest.ts`.
  3. Run `npm run verify` (build, typecheck, lint, tests including the coverage drift gate, and browser E2E with screenshots).
  4. Visually inspect the generated screenshots under `artifacts/verification/<run-id>/screenshots/` to confirm there are no layout glitches, broken images, or missing states.
- See `docs/verification-loop.md` for full details.
