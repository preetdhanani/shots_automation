import { createChannelOutroScene, type ReelStoryboard } from '../schemas/storyboard.js';
import type { ReelFormatId } from './registry.js';

/**
 * Complete, editorial-valid sample storyboards for all 8 formats.
 * Browser-safe (zero Node imports) so Remotion Studio, unit tests, and the E2E
 * verification harness share one source of truth covering every scene type.
 */
export const FORMAT_SAMPLE_STORYBOARDS: Record<ReelFormatId, ReelStoryboard> = {
  news_breakdown: {
    title: 'Frostbite: AI-Designed RISC-V Core Verified in Silicon',
    pillar: 'ai_news',
    format: 'news_breakdown',
    hookStyle: 'bold_claim',
    style: {
      seed: 101,
      background: 'mesh_gradient',
      typography: 'grotesk',
      captionStyle: 'glass_box',
      palette: 'pillar',
      musicMood: 'dark_pad',
    },
    caption:
      'An agent harness just designed, simulated, and formally verified a brand-new RISC-V CPU core with 22% higher IPC.',
    hashtags: ['#ainews', '#chips', '#riscv', '#devtools', '#agents'],
    sources: [{ title: 'Hacker News', url: 'https://news.ycombinator.com/item?id=990001' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'An autonomous coding harness just designed and formally verified a brand new processor core with twenty two percent higher speed.',
        badge: 'BREAKING SILICON',
        headline: 'AI Just Verified a Real CPU',
        subheadline: 'Formal silicon proofs plus twenty two percent higher IPC on RISC-V.',
        highlightStat: '+22% IPC',
        visual: { layout: 'stacked', transition: 'zoom_punch', camera: 'push_in', emphasis: ['CPU', '+22%'] },
      },
      {
        id: 'scene-2',
        type: 'source_spotlight',
        narration:
          'Instead of hand writing every pipeline stage, researchers wired simulation and formal checks straight into the agent loop.',
        headline: 'Frostbite RISC-V Core Passes Formal Verification',
        domain: 'news.ycombinator.com',
        caption: 'Open hardware synthesis report and formal proof artifacts',
        visual: { layout: 'browser_frame', transition: 'slide_left', camera: 'drift_right', emphasis: ['Formal'] },
      },
      {
        id: 'scene-3',
        type: 'timeline',
        narration:
          'Over four automated milestones the harness drafted RTL, ran cycle sims, patched hazards, and cleared tape-out checks.',
        title: 'From Prompt to Verified Core',
        events: [
          { label: 'Stage 01', text: 'Drafted 5-stage RISC-V RTL pipeline' },
          { label: 'Stage 02', text: 'Ran 10M cycle fuzz & trace tests' },
          { label: 'Stage 03', text: 'Auto-fixed branch predictor hazards' },
          { label: 'Stage 04', text: 'Passed formal equivalence proofs' },
        ],
        visual: { layout: 'vertical', transition: 'wipe', camera: 'push_in', emphasis: ['Verified'] },
      },
      {
        id: 'scene-4',
        type: 'social_post',
        narration:
          'Here is the exact takeaway from the research summary: automated verification turns raw generation into dependable engineering.',
        authorName: 'Silicon Harness Lab',
        authorHandle: '@frostbite_lab',
        platform: 'hn',
        postText:
          'Researchers used an automated agent harness to design, simulate, and formally verify a new RISC-V core with 22% higher IPC.',
        contextLabel: 'Research Summary',
        visual: { layout: 'card', transition: 'slide_up', camera: 'pull_out', emphasis: ['22%'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Pair every code agent with formal tests or fast compilers if you want production reliability at hardware scale.',
        badge: 'ENGINEERING RULE',
        headline: 'Verify Like Silicon Teams',
        takeaway: 'Tight deterministic verifiers turn probabilistic models into trustworthy builders.',
        ctaText: 'Save this architecture pattern',
        visual: { layout: 'card', transition: 'fade', camera: 'none', emphasis: ['Verify'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },

  hot_take: {
    title: 'Bigger Context Windows Cannot Fix Sloppy Prompts',
    pillar: 'vibe_coding',
    format: 'hot_take',
    hookStyle: 'contrarian',
    style: {
      seed: 202,
      background: 'scanlines',
      typography: 'condensed_caps',
      captionStyle: 'bold_pop',
      palette: 'complement',
      musicMood: 'tension_build',
    },
    caption:
      'Dumping 200k tokens into a prompt makes coding agents slower and worse. Small scoped diffs win every time.',
    hashtags: ['#vibecoding', '#aicoding', '#devtools', '#softwareengineering', '#agents'],
    sources: [{ title: 'Dev Engineering', url: 'https://example.com/vibe-coding-tips' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Stop stuffing your entire repository into one giant prompt because bigger context windows are quietly ruining your code quality.',
        badge: 'HOT TAKE',
        headline: 'Giant Prompts Break AI Coding',
        subheadline: 'Why small verified diffs crush brute-force context dumping.',
        highlightStat: '3x cleaner',
        visual: { layout: 'impact_center', transition: 'glitch', camera: 'push_in', emphasis: ['Break', 'AI'] },
      },
      {
        id: 'scene-2',
        type: 'myth_fact',
        narration:
          'Everyone thinks pasting every file makes the model smarter, yet noisy files dilute attention and trigger subtle regressions.',
        myth: 'Pasting the whole repo gives the model full awareness.',
        fact: 'Scoped diffs plus targeted tests cut regressions dramatically.',
        sourceLabel: 'Senior Agent Workflows',
        visual: { layout: 'flip', transition: 'whip_pan', camera: 'drift_left', emphasis: ['Scoped'] },
      },
      {
        id: 'scene-3',
        type: 'big_stat',
        narration:
          'Teams that cap tasks to tight single-file edits see up to three times fewer broken pull requests during daily coding.',
        value: '3.2x',
        label: 'Fewer Rollbacks With Tight Diffs',
        context: 'Small commits let automated typechecks and tests catch drift in seconds.',
        sourceLabel: 'Agent Harness Field Study',
        trend: 'up',
        visual: { layout: 'center', transition: 'zoom_punch', camera: 'pull_out', emphasis: ['3.2x'] },
      },
      {
        id: 'scene-4',
        type: 'code_compare',
        narration:
          'Compare a vague mega prompt against a strict scoped task with one verification command wired at the end.',
        title: 'Scope Every Agent Task',
        language: 'ts',
        filename: 'task.config.ts',
        mode: 'before_after',
        beforeLabel: 'Context Dump',
        beforeCode: '// "Refactor the whole app"\n// 45 files, 0 checks',
        afterLabel: 'Scoped Diff',
        afterCode: 'export const task = {\n  files: ["auth.ts"],\n  verify: "npm test",\n};',
        highlightLines: [2, 3],
        visual: { layout: 'diff', transition: 'slide_left', camera: 'none', emphasis: ['verify'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Cut your next AI coding prompt in half, list exact target files, and demand a green test command before accepting.',
        badge: 'VIBE RULE',
        headline: 'Keep Every Diff Small',
        takeaway: 'Tight scope plus instant checks beats a million-token context dump every day.',
        ctaText: 'Try scoped diffs today',
        visual: { layout: 'centered', transition: 'fade', camera: 'push_in', emphasis: ['Small'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },

  top3_countdown: {
    title: 'Top 3 Harness Habits Used by Elite AI Engineers',
    pillar: 'coding_practices',
    format: 'top3_countdown',
    hookStyle: 'curiosity_gap',
    style: {
      seed: 303,
      background: 'aurora',
      typography: 'rounded_soft',
      captionStyle: 'karaoke_block',
      palette: 'mono_neon',
      musicMood: 'upbeat_pulse',
    },
    caption:
      'Three simple habits separate reliable AI-assisted repos from messy generated prototypes.',
    hashtags: ['#codingtips', '#aicoding', '#harnesses', '#devtips', '#cleanarchitecture'],
    sources: [{ title: 'Dev Engineering', url: 'https://example.com/top3-harness-habits' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Top engineers do not prompt harder than you; they rely on three simple harness habits that keep every commit rock solid.',
        badge: 'TOP 3 HABITS',
        headline: '3 Habits for Clean AI Code',
        subheadline: 'Ranked from quick win to game changer for everyday dev work.',
        highlightStat: '3 -> 1',
        visual: { layout: 'stat_hero', transition: 'zoom_punch', camera: 'push_in', emphasis: ['3', 'Clean'] },
      },
      {
        id: 'scene-2',
        type: 'countdown_item',
        rank: 3,
        narration:
          'Number three: write a one page repository guide explaining build commands, architecture boundaries, and forbidden shortcuts.',
        title: 'Pin Repo Rules in AGENTS.md',
        detail: 'Give every coding agent clear boundaries, commands, and style expectations up front.',
        tag: 'QUICK WIN',
        visual: { layout: 'giant_number', transition: 'slide_up', camera: 'drift_right', emphasis: ['AGENTS.md'] },
      },
      {
        id: 'scene-3',
        type: 'countdown_item',
        rank: 2,
        narration:
          'Number two: keep unit tests running under two seconds so agents can re-run feedback loops after every single edit.',
        title: 'Sub-2-Second Feedback Loops',
        detail: 'Fast local checks catch broken types and edge cases before drift compounds.',
        tag: 'HIGH LEVERAGE',
        visual: { layout: 'badge_side', transition: 'whip_pan', camera: 'drift_left', emphasis: ['Sub-2-Second'] },
      },
      {
        id: 'scene-4',
        type: 'countdown_item',
        rank: 1,
        narration:
          'Number one: enforce an end to end screenshot verification gate so UI regressions fail loudly before anything ships.',
        title: 'Visual E2E Verification Gate',
        detail: 'Boot the real app, click through every screen, and fail on console or layout errors.',
        tag: 'GAME CHANGER',
        visual: { layout: 'giant_number', transition: 'iris', camera: 'push_in', emphasis: ['Visual', 'E2E'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Start with habit number three tonight by adding a crisp AGENTS guide and one fast verify script to your repository.',
        badge: 'SHIP CLEANER',
        headline: 'Build the Harness First',
        takeaway: 'Great rules, fast tests, and visual E2E checks multiply every model upgrade.',
        ctaText: 'Bookmark these 3 habits',
        visual: { layout: 'card', transition: 'fade', camera: 'none', emphasis: ['Harness'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },

  myth_vs_fact: {
    title: 'AI Coding Myths Slowing Down Engineering Teams',
    pillar: 'coding_practices',
    format: 'myth_vs_fact',
    hookStyle: 'question',
    style: {
      seed: 404,
      background: 'blueprint',
      typography: 'editorial_serif',
      captionStyle: 'underline_sweep',
      palette: 'pillar',
      musicMood: 'lofi_chill',
    },
    caption:
      'Two stubborn AI coding myths that waste hours every sprint - and what high-output teams do instead.',
    hashtags: ['#codingpractices', '#ai', '#softwareengineering', '#testing', '#devtools'],
    sources: [{ title: 'Engineering Study', url: 'https://example.com/ai-coding-myths' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Are you still trusting these two popular AI coding myths that quietly double your debugging time every single week?',
        badge: 'MYTH VS FACT',
        headline: '2 AI Myths Costing You Hours',
        subheadline: 'What actually holds up in real production codebases.',
        visual: { layout: 'stacked', transition: 'wipe', camera: 'push_in', emphasis: ['2', 'Myths'] },
      },
      {
        id: 'scene-2',
        type: 'myth_fact',
        narration:
          'Myth one says the largest flagship model always wins, yet a faster model inside a strict test loop regularly beats it.',
        myth: 'Always use the biggest model for every coding task.',
        fact: 'Fast models with strict lint and test harnesses beat raw frontier prompts.',
        sourceLabel: 'Harness Eval 2026',
        visual: { layout: 'flip', transition: 'glitch', camera: 'drift_right', emphasis: ['Fast'] },
      },
      {
        id: 'scene-3',
        type: 'myth_fact',
        narration:
          'Myth two claims AI code needs fewer tests, when in reality tests are the exact specification that keeps agents accurate.',
        myth: 'AI writes code fast so you can skip writing tests.',
        fact: 'Tests act as the executable spec that keeps agent edits on target.',
        sourceLabel: 'Production Teams',
        visual: { layout: 'stacked', transition: 'slide_left', camera: 'pull_out', emphasis: ['spec'] },
      },
      {
        id: 'scene-4',
        type: 'big_stat',
        narration:
          'Adding automated type and test gates lifts first pass success by eighteen point four percent across every benchmarked model.',
        value: '+18.4%',
        label: 'Pass@1 Gain From Verification Loops',
        context: 'Measured across twelve coding models running the exact same repo tasks.',
        sourceLabel: 'SWE-bench Study',
        trend: 'up',
        visual: { layout: 'split_context', transition: 'zoom_punch', camera: 'push_in', emphasis: ['+18.4%'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Invest in your verification loop before upgrading to a pricier model tier and watch your shipping speed climb.',
        badge: 'REALITY CHECK',
        headline: 'Tests Are Your Best Prompt',
        takeaway: 'Executable checks guide coding agents far better than paragraphs of prose.',
        ctaText: 'Share with your team',
        visual: { layout: 'centered', transition: 'fade', camera: 'none', emphasis: ['Tests'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },

  versus_battle: {
    title: 'Bare Prompting vs Automated Verification Harness',
    pillar: 'benchmarks',
    format: 'versus_battle',
    hookStyle: 'question',
    style: {
      seed: 505,
      background: 'spotlight_noise',
      typography: 'condensed_caps',
      captionStyle: 'bold_pop',
      palette: 'complement',
      musicMood: 'bright_synth',
    },
    caption:
      'Same coding model, two completely different setups. Here is how a verification harness stacks up head-to-head.',
    hashtags: ['#benchmarks', '#swebench', '#aiagents', '#coding', '#devtools'],
    sources: [{ title: 'SWE-bench Blog', url: 'https://www.swebench.com/verify-study' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Which wins on real repositories: a giant ten times larger prompt window or a tight automated verification harness?',
        badge: 'HEAD TO HEAD',
        headline: 'Big Prompt vs Tight Harness',
        subheadline: 'Same model, real benchmark tasks, clear winner.',
        highlightStat: '67.6% vs 49.2%',
        visual: { layout: 'impact_center', transition: 'whip_pan', camera: 'push_in', emphasis: ['Tight', 'Harness'] },
      },
      {
        id: 'scene-2',
        type: 'versus_split',
        narration:
          'Bare prompting dumps context and hopes the build stays green, while a harness runs typechecks and tests on every single edit.',
        title: 'Prompt Loop vs Verify Loop',
        left: {
          name: 'Bare Prompting',
          score: '49.2%',
          points: ['No compile feedback', 'Silent type regressions', 'High token waste'],
        },
        right: {
          name: 'Verify Harness',
          score: '67.6%',
          points: ['Runs tsc every edit', 'Catches failing tests', 'Clean ready diffs'],
        },
        winner: 'right',
        verdict: 'Verification loops win by +18.4 points with the exact same model.',
        visual: { layout: 'vertical', transition: 'slide_left', camera: 'drift_right', emphasis: ['67.6%'] },
      },
      {
        id: 'scene-3',
        type: 'benchmark_bars',
        narration:
          'Look at the progression: adding lint and type hooks jumps resolution to fifty eight percent, and full tests hit sixty seven point six.',
        title: 'SWE-bench Verified Resolution',
        subtitle: 'Identical base model across all three loops',
        metricUnit: '%',
        sourceLabel: 'SWE-bench Study',
        bars: [
          { label: 'Bare Prompt Loop', value: 49.2, note: 'Baseline' },
          { label: 'Lint + Type Hook', value: 58.6 },
          { label: 'Full Test Harness', value: 67.6, isWinner: true, note: '+18.4%' },
        ],
        visual: { layout: 'columns', transition: 'zoom_punch', camera: 'pull_out', emphasis: ['67.6'] },
      },
      {
        id: 'scene-4',
        type: 'takeaway_cta',
        narration:
          'Stop paying for bigger context dumps and wire typecheck plus unit tests into your agent loop right now.',
        badge: 'VERDICT',
        headline: 'Pick Loops Over Mega Prompts',
        takeaway: 'Automated checks unlock flagship-level reliability from fast affordable models.',
        ctaText: 'Save this benchmark',
        visual: { layout: 'card', transition: 'fade', camera: 'none', emphasis: ['Loops'] },
      },
      createChannelOutroScene('scene-5'),
    ],
  },

  step_tutorial: {
    title: 'Wire a 4-Step Verification Gate in 5 Minutes',
    pillar: 'harnesses',
    format: 'step_tutorial',
    hookStyle: 'pain_point',
    style: {
      seed: 606,
      background: 'dot_grid',
      typography: 'rounded_soft',
      captionStyle: 'glass_box',
      palette: 'pillar',
      musicMood: 'lofi_chill',
    },
    caption:
      'Tired of AI edits that look right until you open the browser? Follow these 4 steps to lock down your workflow.',
    hashtags: ['#harnesses', '#tutorial', '#typescript', '#aicoding', '#devtools'],
    sources: [{ title: 'Post Studio Docs', url: 'https://example.com/verify-loop' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Tired of approving AI pull requests that compile locally yet explode the moment you click a button in production?',
        badge: '4-STEP RECIPE',
        headline: 'Lock Down AI Edits in 4 Steps',
        subheadline: 'One command that catches types, lint, tests, and real browser bugs.',
        visual: { layout: 'stacked', transition: 'slide_up', camera: 'push_in', emphasis: ['4', 'Steps'] },
      },
      {
        id: 'scene-2',
        type: 'checklist_steps',
        narration:
          'Follow four fast steps: build workspace packages, run strict typecheck, execute unit tests, and drive headless browser checks.',
        title: 'Your Single Verify Pipeline',
        mode: 'steps',
        items: [
          { text: 'Build all packages cleanly', detail: 'Catch broken workspace exports early' },
          { text: 'Run strict TypeScript checks', detail: 'Zero implicit any or stale props' },
          { text: 'Execute unit & drift tests', detail: 'Enforce coverage on every new view' },
          { text: 'Capture headless UI screenshots', detail: 'Fail on console or HTTP errors' },
        ],
        visual: { layout: 'cards', transition: 'slide_left', camera: 'drift_right', emphasis: ['Verify'] },
      },
      {
        id: 'scene-3',
        type: 'terminal_demo',
        narration:
          'Expose the whole pipeline under one npm run verify command so any agent or engineer executes the exact same gate.',
        title: 'One Command Before Done',
        windowTitle: 'zsh - post-studio',
        command: 'npm run verify',
        outputLines: [
          { text: '[ok] tsc --noEmit passed (0 errors)', tone: 'success' },
          { text: '[ok] 48 unit & drift tests green', tone: 'success' },
          { text: '[ok] E2E screenshots saved, 0 errors', tone: 'accent' },
        ],
        visual: { layout: 'retro_fullscreen', transition: 'iris', camera: 'push_in', emphasis: ['verify'] },
      },
      {
        id: 'scene-4',
        type: 'code_compare',
        narration:
          'Drop this single script line into package json so every coding session ends with real proof instead of guesses.',
        title: 'Add the Verify Script',
        language: 'json',
        filename: 'package.json',
        mode: 'single',
        afterLabel: 'package.json',
        afterCode: '{\n  "scripts": {\n    "verify": "tsc && vitest && e2e"\n  }\n}',
        highlightLines: [3],
        visual: { layout: 'focus', transition: 'wipe', camera: 'none', emphasis: ['verify'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Add npm run verify to your repo today and instruct every coding agent never to finish until it passes.',
        badge: 'TRY TODAY',
        headline: 'One Command, Zero Guesswork',
        takeaway: 'A single verify command turns every AI edit into a tested release candidate.',
        ctaText: 'Save this 4-step recipe',
        visual: { layout: 'card', transition: 'fade', camera: 'none', emphasis: ['verify'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },

  deep_dive_demo: {
    title: 'Manifest Drift Gates Stop Untested Screens Cold',
    pillar: 'harnesses',
    format: 'deep_dive_demo',
    hookStyle: 'bold_claim',
    style: {
      seed: 707,
      background: 'blueprint',
      typography: 'grotesk',
      captionStyle: 'underline_sweep',
      palette: 'mono_neon',
      musicMood: 'dark_pad',
    },
    caption:
      'Make your E2E test suite evolve automatically whenever someone adds a new UI view or component.',
    hashtags: ['#testing', '#harnesses', '#typescript', '#vitest', '#devtools'],
    sources: [{ title: 'Post Verification Guide', url: 'https://example.com/manifest-drift' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Most end to end test suites rot within a month unless your test runner automatically rejects unregistered new screens.',
        badge: 'DEEP DIVE',
        headline: 'Tests That Force Coverage',
        subheadline: 'How a 20-line drift gate stops untested UI from ever merging.',
        highlightStat: '100% view map',
        visual: { layout: 'stat_hero', transition: 'slide_left', camera: 'push_in', emphasis: ['100%', 'Coverage'] },
      },
      {
        id: 'scene-2',
        type: 'code_compare',
        narration:
          'Instead of hoping teammates remember tests, scan the views folder during vitest and assert every file appears in your manifest.',
        title: 'Manifest Coverage Drift Test',
        language: 'ts',
        filename: 'coverage.test.ts',
        mode: 'before_after',
        beforeLabel: 'Manual Hope',
        beforeCode: '// please add an E2E test\n// when adding new views',
        afterLabel: 'Enforced Gate',
        afterCode: 'const missing = views.filter(\n  (v) => !covered.has(v)\n);\nexpect(missing).toEqual([]);',
        highlightLines: [4],
        visual: { layout: 'stacked', transition: 'wipe', camera: 'drift_left', emphasis: ['missing'] },
      },
      {
        id: 'scene-3',
        type: 'terminal_demo',
        narration:
          'The instant an agent adds a new panel without an end to end check, vitest flags the exact missing component name.',
        title: 'Instant Drift Feedback',
        windowTitle: 'zsh - vitest',
        command: 'npm test',
        outputLines: [
          { text: '[fail] Missing in manifest: VarietyPanel.tsx', tone: 'warn' },
          { text: '[fix]  Registered check 07-video-variety', tone: 'accent' },
          { text: '[ok]   All 14 views & panels covered', tone: 'success' },
        ],
        visual: { layout: 'window', transition: 'slide_up', camera: 'push_in', emphasis: ['VarietyPanel'] },
      },
      {
        id: 'scene-4',
        type: 'benchmark_bars',
        narration:
          'With drift enforcement plus automated browser runs, UI regression catch rates jump from forty two percent to ninety six percent.',
        title: 'UI Regression Catch Rate',
        metricUnit: '%',
        sourceLabel: 'Internal E2E Metrics',
        bars: [
          { label: 'Manual Spot Check', value: 42 },
          { label: 'Unit Tests Only', value: 68 },
          { label: 'Drift + Visual E2E', value: 96, isWinner: true, note: 'Winner' },
        ],
        visual: { layout: 'ranked_cards', transition: 'zoom_punch', camera: 'pull_out', emphasis: ['96'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Pair your verification script with a coverage drift test so every future feature ships verified by default.',
        badge: 'HARNESS PATTERN',
        headline: 'Automate Coverage Drift',
        takeaway: 'Let your test suite remind both humans and agents to cover new screens.',
        ctaText: 'Copy this drift pattern',
        visual: { layout: 'centered', transition: 'fade', camera: 'none', emphasis: ['Drift'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },

  stat_shock: {
    title: '60% Cost Drop in Frontier Coding Token Prices',
    pillar: 'benchmarks',
    format: 'stat_shock',
    hookStyle: 'shocking_number',
    style: {
      seed: 808,
      background: 'mesh_gradient',
      typography: 'editorial_serif',
      captionStyle: 'karaoke_block',
      palette: 'pillar',
      musicMood: 'tension_build',
    },
    caption:
      'Inference costs for high-accuracy coding loops dropped 60% in 12 months while verification pass rates kept climbing.',
    hashtags: ['#benchmarks', '#ai', '#inference', '#llm', '#devtools'],
    sources: [{ title: 'AI Pricing Tracker', url: 'https://example.com/coding-token-costs' }],
    scenes: [
      {
        id: 'scene-1',
        type: 'hook_title',
        narration:
          'Sixty percent cheaper tokens in twelve months completely flips the math on running multi-step verification agents on every pull request.',
        badge: 'STAT SHOCK',
        headline: '60% Cheaper Coding Tokens',
        subheadline: 'Multi-pass verification agents now cost pennies per feature.',
        highlightStat: '-60% / 12mo',
        visual: { layout: 'stat_hero', transition: 'zoom_punch', camera: 'push_in', emphasis: ['60%', 'Cheaper'] },
      },
      {
        id: 'scene-2',
        type: 'big_stat',
        narration:
          'Running a full plan, edit, and verify agent pass now averages twelve cents instead of thirty cents a year ago.',
        value: '$0.12',
        label: 'Average Cost Per Verified PR',
        context: 'Down from $0.30 last year while median SWE-bench scores climbed.',
        sourceLabel: 'AI Pricing Tracker',
        trend: 'down',
        visual: { layout: 'center', transition: 'iris', camera: 'pull_out', emphasis: ['$0.12'] },
      },
      {
        id: 'scene-3',
        type: 'line_chart',
        narration:
          'Watch the quarterly drop in cost per million cached coding tokens from two dollars forty down to ninety five cents.',
        title: 'Cached Coding Token Cost',
        metricUnit: '$',
        sourceLabel: 'AI Pricing Tracker',
        points: [
          { label: 'Q1', value: 2.4 },
          { label: 'Q2', value: 1.9 },
          { label: 'Q3', value: 1.45 },
          { label: 'Q4', value: 1.15 },
          { label: 'Now', value: 0.95 },
        ],
        highlightIndex: 4,
        visual: { layout: 'area', transition: 'wipe', camera: 'drift_right', emphasis: ['0.95'] },
      },
      {
        id: 'scene-4',
        type: 'news_quote_card',
        narration:
          'Three engineering shifts follow immediately: always-on PR review bots, parallel test sharding, and cheap multi-model cross-checks.',
        sourceLabel: 'AI Pricing Tracker',
        dateLabel: 'Nov 2026',
        headline: 'What Sub-Dollar Cached Tokens Unlock',
        bullets: [
          'Run independent plan reviewers before writing code',
          'Parallelize refactor and test agents per branch',
          'Re-run verification loops without blowing budgets',
        ],
        visual: { layout: 'breaking_ticker', transition: 'slide_left', camera: 'none', emphasis: ['Sub-Dollar'] },
      },
      {
        id: 'scene-5',
        type: 'takeaway_cta',
        narration:
          'Stop rationing agent verification passes and spend the extra pennies on automated checks that save hours of debugging.',
        badge: 'SMART BUDGET',
        headline: 'Spend Pennies, Save Hours',
        takeaway: 'Cheaper inference makes multi-step verification the highest-ROI habit in dev.',
        ctaText: 'Audit your agent token spend',
        visual: { layout: 'card', transition: 'fade', camera: 'none', emphasis: ['Pennies'] },
      },
      createChannelOutroScene('scene-6'),
    ],
  },
};

/**
 * Sample storyboard including an `ai_media_clip` scene for B-roll unit tests and
 * Remotion still verification.
 */
export const BROLL_SAMPLE_STORYBOARD: ReelStoryboard = {
  title: 'Visual AI B-Roll Scene Verification Sample',
  pillar: 'ai_news',
  format: 'news_breakdown',
  hookStyle: 'curiosity_gap',
  style: {
    seed: 909,
    background: 'aurora',
    typography: 'grotesk',
    captionStyle: 'glass_box',
    palette: 'pillar',
    musicMood: 'dark_pad',
  },
  caption: 'Testing opt-in AI B-roll rendering and graceful visual fallback.',
  hashtags: ['#ai', '#broll', '#remotion', '#devtools'],
  sources: [{ title: 'Post Studio', url: 'https://example.com/broll' }],
  scenes: [
    {
      id: 'scene-1',
      type: 'hook_title',
      narration:
        'Motion B-roll clips can elevate high-impact AI news reels when paired with crisp overlaid typography.',
      badge: 'AI B-ROLL',
      headline: 'Cinematic AI Motion Clips',
      subheadline: 'Opt-in Veo video scenes with automatic fallback safety.',
      visual: { layout: 'stacked', transition: 'zoom_punch', camera: 'push_in' },
    },
    {
      id: 'scene-2',
      type: 'ai_media_clip',
      narration:
        'When a Veo clip is ready it loops seamlessly behind your caption; if offline or disabled an animated fallback takes over.',
      prompt: 'Futuristic dark server room with cyan data pulses, vertical 9:16 macro cinematography',
      captionText: 'Opt-in 9:16 Veo B-roll clip with crisp caption overlay',
      durationHintSec: 6,
      visual: { layout: 'full_bleed', transition: 'iris', camera: 'push_in' },
    },
    {
      id: 'scene-3',
      type: 'news_quote_card',
      narration:
        'Keeping AI video opt-in protects your budget while letting flagship announcements stand out visually.',
      sourceLabel: 'Studio Pipeline',
      dateLabel: '2026',
      headline: 'Budget-Safe AI Media Clips',
      bullets: [
        'Disabled by default until enabled in Settings',
        'Graceful fallback ensures reels never fail on timeouts',
      ],
      visual: { layout: 'pull_quote', transition: 'slide_left', camera: 'none' },
    },
    {
      id: 'scene-4',
      type: 'takeaway_cta',
      narration:
        'Enable AI B-roll selectively for big launch reels and keep everyday coding tips fast and zero-cost.',
      badge: 'PRO TIP',
      headline: 'Use B-Roll Selectively',
      takeaway: 'Reserve generated video clips for headline stories that need extra visual punch.',
      ctaText: 'Configure in Settings',
      visual: { layout: 'card', transition: 'fade', camera: 'none' },
    },
    createChannelOutroScene('scene-5'),
  ],
};
