interface TtsPronunciationRule {
  pattern: RegExp;
  spoken: string;
  key: string;
  alignmentTokens: readonly string[];
}

const PRONUNCIATION_RULES: readonly TtsPronunciationRule[] = [
  { pattern: /\bPyPI\b/gi, spoken: 'Pie P I', key: 'pypi', alignmentTokens: ['pie', 'p', 'i'] },
  { pattern: /\bkubectl\b/gi, spoken: 'kube control', key: 'kubectl', alignmentTokens: ['kube', 'control'] },
  { pattern: /\bnginx\b/gi, spoken: 'engine X', key: 'nginx', alignmentTokens: ['engine', 'x'] },
  { pattern: /\bgRPC\b/gi, spoken: 'G R P C', key: 'grpc', alignmentTokens: ['g', 'r', 'p', 'c'] },
  { pattern: /\bSQLite\b/gi, spoken: 'sequel lite', key: 'sqlite', alignmentTokens: ['sequel', 'lite'] },
  { pattern: /\bPostgreSQL\b/gi, spoken: 'postgres Q L', key: 'postgresql', alignmentTokens: ['postgres', 'q', 'l'] },
  { pattern: /\bGraphQL\b/gi, spoken: 'graph Q L', key: 'graphql', alignmentTokens: ['graph', 'q', 'l'] },
  { pattern: /\bOAuth\b/gi, spoken: 'oh auth', key: 'oauth', alignmentTokens: ['oh', 'auth'] },
  { pattern: /\bWASM\b/gi, spoken: 'W A S M', key: 'wasm', alignmentTokens: ['w', 'a', 's', 'm'] },
  { pattern: /\btmux\b/gi, spoken: 'T mux', key: 'tmux', alignmentTokens: ['t', 'mux'] },
  { pattern: /\bpnpm\b/gi, spoken: 'P N P M', key: 'pnpm', alignmentTokens: ['p', 'n', 'p', 'm'] },
  { pattern: /\bFastAPI\b/gi, spoken: 'Fast A P I', key: 'fastapi', alignmentTokens: ['fast', 'a', 'p', 'i'] },
  { pattern: /\bNumPy\b/gi, spoken: 'num pie', key: 'numpy', alignmentTokens: ['num', 'pie'] },
  { pattern: /\bSciPy\b/gi, spoken: 'sigh pie', key: 'scipy', alignmentTokens: ['sigh', 'pie'] },
  { pattern: /\bPyYAML\b/gi, spoken: 'pie yammel', key: 'pyyaml', alignmentTokens: ['pie', 'yammel'] },
  { pattern: /\bdotenv\b/gi, spoken: 'dot env', key: 'dotenv', alignmentTokens: ['dot', 'env'] },
  { pattern: /\bstdio\b/gi, spoken: 'standard I O', key: 'stdio', alignmentTokens: ['standard', 'i', 'o'] },
  { pattern: /\bstdout\b/gi, spoken: 'standard out', key: 'stdout', alignmentTokens: ['standard', 'out'] },
  { pattern: /\bstderr\b/gi, spoken: 'standard error', key: 'stderr', alignmentTokens: ['standard', 'error'] },
];

const ALIGNMENT_EXPANSION_MAP = new Map<string, readonly string[]>([
  ...PRONUNCIATION_RULES.map((r) => [r.key, r.alignmentTokens] as const),
  // Whisper shorthand / fused tokens that can appear on the ASR side for multi-letter acronyms
  ['py', ['pie']],
  ['sci', ['sigh']],
  ['api', ['a', 'p', 'i']],
  ['ql', ['q', 'l']],
  ['io', ['i', 'o']],
  ['postgres', ['postgres']],
]);

/**
 * Rewrites ambiguous technical acronyms into natural spoken phonetics for TTS ONLY.
 * Storyboard titles, on-screen badges, and captions keep the original spelling.
 */
export function normalizeTextForTts(text: string): string {
  let out = text;
  for (const rule of PRONUNCIATION_RULES) {
    out = out.replace(rule.pattern, rule.spoken);
  }
  return out;
}

/**
 * Expands known technical tokens (or Whisper phonetic sub-tokens) into canonical
 * alignment tokens so 1-to-N script-to-Whisper alignment matches accurately.
 */
export function expandPronunciationForAlignment(normToken: string): string[] | null {
  const expanded = ALIGNMENT_EXPANSION_MAP.get(normToken);
  return expanded ? [...expanded] : null;
}
