export interface VerificationFeatureEntry {
  checkId: string;
  checkFile: string;
  title: string;
  routes: string[];
  views: string[];
  components: string[];
}

/**
 * Single source of truth mapping every dashboard view and major component to its
 * automated E2E verification check.
 *
 * Enforced by `apps/server/tests/verification-coverage.test.ts` during `npm test`:
 * whenever you add a new view or component, register it here and add/update the
 * corresponding check in `scripts/verify/checks/`.
 */
export const VERIFICATION_MANIFEST: readonly VerificationFeatureEntry[] = [
  {
    checkId: '01-shell-and-health',
    checkFile: '01-shell-and-health.ts',
    title: 'App Shell, Navigation, Setup Readiness & Health',
    routes: ['/discover'],
    views: [],
    components: ['SetupReadinessStrip.tsx'],
  },
  {
    checkId: '02-discover-and-modals',
    checkFile: '02-discover-and-modals.ts',
    title: 'Discover Feed, Topic Generate Modal & Custom Reel Modal',
    routes: ['/discover'],
    views: ['DiscoverView.tsx'],
    components: ['CustomReelModal.tsx'],
  },
  {
    checkId: '03-settings-and-llm',
    checkFile: '03-settings-and-llm.ts',
    title: 'Settings, Preferences & Custom LLM Endpoints',
    routes: ['/settings'],
    views: ['SettingsView.tsx'],
    components: ['LlmEndpointsPanel.tsx'],
  },
  {
    checkId: '04-runs-and-live-pipeline',
    checkFile: '04-runs-and-live-pipeline.ts',
    title: 'Parallel Render Queue, Live SSE Pipeline & Job Cancellation',
    routes: ['/runs', '/runs/:id'],
    views: ['RunsView.tsx', 'LiveRunView.tsx'],
    components: [],
  },
  {
    checkId: '05-approval-studio-and-publish',
    checkFile: '05-approval-studio-and-publish.ts',
    title: 'Approval Studio, 9:16 Preview, 6-Scene Editor (with Outro) & Publish Modal',
    routes: ['/review', '/review/:id'],
    views: ['ApprovalStudioView.tsx'],
    components: ['PhonePreview.tsx', 'VisualSceneEditor.tsx', 'PublishModal.tsx'],
  },
  {
    checkId: '06-library',
    checkFile: '06-library.ts',
    title: 'Library Archive, Media Covers & Inspect Navigation',
    routes: ['/library'],
    views: ['LibraryView.tsx'],
    components: [],
  },
  {
    checkId: '07-video-variety',
    checkFile: '07-video-variety.ts',
    title: 'Video Variety Engine, Anti-Repeat Planner, Variety Panel, Restyle & Formats UI',
    routes: ['/review/:id', '/discover', '/settings'],
    views: [],
    components: ['VarietyPanel.tsx'],
  },
  {
    checkId: '08-remotion-visual-variety',
    checkFile: '08-remotion-visual-variety.ts',
    title: 'Real Remotion Still Renders: All 16 Scenes x Layouts, Backgrounds, Transitions, Captions, Typographies & Formats',
    routes: [],
    views: [],
    components: [],
  },
];

/**
 * Small presentational primitives that are rendered across views and do not
 * require their own standalone feature entry.
 */
export const EXEMPT_COMPONENTS: readonly string[] = [
  'InstagramIcon.tsx',
  'PillarBadge.tsx',
  'Toast.tsx',
];
