import type { ReelStoryboard } from '../schemas/storyboard.js';

export const SAMPLE_DEMO_STORYBOARD: ReelStoryboard = {
  title: 'Why Coding Harnesses Beat Prompt Stuffing',
  pillar: 'harnesses',
  caption:
    'Big prompts alone hit a ceiling. Wrapping your coding model in a deterministic verification harness lifts real repo scores overnight.\n\nTry adding a fast typecheck plus targeted unit test hook before your agent finishes any edit.',
  hashtags: [
    '#aicoding',
    '#codingagents',
    '#devtools',
    '#vibecoding',
    '#softwareengineering',
    '#llm',
  ],
  sources: [
    {
      title: 'SWE-bench Agent Harness Research',
      url: 'https://www.swebench.com/',
    },
  ],
  scenes: [
    {
      id: 'scene-1',
      type: 'hook_title',
      narration:
        'Stop stuffing giant prompts into your coding agent when the real speed unlock is the harness around it.',
      badge: 'AI HARNESSES',
      headline: 'Your Prompt Is Not The Bottleneck',
      subheadline: 'Deterministic verify loops beat prompt engineering on real repositories.',
      highlightStat: '+18.4% SWE-bench lift',
    },
    {
      id: 'scene-2',
      type: 'benchmark_bars',
      narration:
        'Keeping the exact same model and adding automated lint plus test feedback jumps resolution scores by over eighteen percent.',
      title: 'Same Model, Smarter Harness',
      subtitle: 'SWE-bench Verified pass rate by loop setup',
      metricUnit: '%',
      sourceLabel: 'Agent Eval Suite',
      bars: [
        { label: 'Single Shot Prompt', value: 49.2, note: 'No checks' },
        { label: 'Typecheck Gate', value: 58.6 },
        { label: 'Full Test Harness', value: 67.6, isWinner: true, note: '+18.4%' },
      ],
    },
    {
      id: 'scene-3',
      type: 'code_compare',
      narration:
        'Instead of writing polite instructions hoping code compiles, wire a concrete command hook that runs automatically.',
      title: 'Replace Hope With A Hook',
      language: 'json',
      filename: 'AGENTS.md / verify.json',
      mode: 'before_after',
      beforeLabel: 'Vague Prompt',
      beforeCode: '// "Please verify your edits\n//  and make sure tests pass."',
      afterLabel: 'Verified Hook',
      afterCode: '{\n  "afterEdit": [\n    "npm run typecheck",\n    "npm test -- --run"\n  ]\n}',
      highlightLines: [2, 3, 4],
    },
    {
      id: 'scene-4',
      type: 'terminal_demo',
      narration:
        'Every edit triggers fast checks in milliseconds so the agent catches broken imports before you even review.',
      title: 'Automated Verification Gate',
      windowTitle: 'zsh - post-agent',
      command: 'npm run verify:agent',
      outputLines: [
        { text: '[ok] tsc --noEmit passed (0 errors)', tone: 'success' },
        { text: '[ok] 42 unit tests green in 1.2s', tone: 'success' },
        { text: '[ready] diff clean for review', tone: 'accent' },
      ],
    },
    {
      id: 'scene-5',
      type: 'takeaway_cta',
      narration:
        'Treat your AI coding workflow like continuous integration and save this tip for your next project.',
      badge: 'PRO RULE',
      headline: 'Verify Every Edit Automatically',
      takeaway:
        'Tight fast test loops let cheaper models outperform brute force prompting.',
      ctaText: 'Save & follow for daily AI dev tips',
    },
  ],
};
