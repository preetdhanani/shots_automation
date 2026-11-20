import type { ContentPillar } from '../schemas/storyboard.js';

export interface RssFeedSource {
  id: string;
  name: string;
  url: string;
  defaultPillar: ContentPillar;
  weight: number;
}

export interface GithubRepoSource {
  id: string;
  owner: string;
  repo: string;
  name: string;
  defaultPillar: ContentPillar;
  weight: number;
}

export const RSS_SOURCES: RssFeedSource[] = [
  {
    id: 'openai-news',
    name: 'OpenAI News',
    url: 'https://openai.com/news/rss.xml',
    defaultPillar: 'ai_news',
    weight: 22,
  },
  {
    id: 'google-ai-blog',
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    defaultPillar: 'ai_news',
    weight: 22,
  },
  {
    id: 'huggingface-blog',
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    defaultPillar: 'benchmarks',
    weight: 20,
  },
  {
    id: 'vercel-blog',
    name: 'Vercel Blog',
    url: 'https://vercel.com/atom',
    defaultPillar: 'harnesses',
    weight: 18,
  },
  {
    id: 'simon-willison',
    name: 'Simon Willison',
    url: 'https://simonwillison.net/atom/everything/',
    defaultPillar: 'vibe_coding',
    weight: 20,
  },
  {
    id: 'latent-space',
    name: 'Latent Space',
    url: 'https://www.latent.space/feed',
    defaultPillar: 'harnesses',
    weight: 18,
  },
  {
    id: 'addy-osmani',
    name: 'Addy Osmani',
    url: 'https://addyosmani.com/rss.xml',
    defaultPillar: 'coding_practices',
    weight: 18,
  },
];

export const GITHUB_RELEASE_SOURCES: GithubRepoSource[] = [
  {
    id: 'claude-code',
    owner: 'anthropics',
    repo: 'claude-code',
    name: 'Claude Code Releases',
    defaultPillar: 'harnesses',
    weight: 22,
  },
  {
    id: 'openai-codex',
    owner: 'openai',
    repo: 'codex',
    name: 'OpenAI Codex CLI Releases',
    defaultPillar: 'harnesses',
    weight: 22,
  },
  {
    id: 'cline',
    owner: 'cline',
    repo: 'cline',
    name: 'Cline Releases',
    defaultPillar: 'harnesses',
    weight: 18,
  },
  {
    id: 'aider',
    owner: 'Aider-AI',
    repo: 'aider',
    name: 'Aider Releases',
    defaultPillar: 'coding_practices',
    weight: 17,
  },
  {
    id: 'mcp-ts-sdk',
    owner: 'modelcontextprotocol',
    repo: 'typescript-sdk',
    name: 'MCP TypeScript SDK',
    defaultPillar: 'harnesses',
    weight: 17,
  },
];

export const AI_DEV_KEYWORDS = [
  'ai',
  'llm',
  'model',
  'gemini',
  'claude',
  'openai',
  'gpt',
  'anthropic',
  'deepseek',
  'qwen',
  'llama',
  'benchmark',
  'swe-bench',
  'coding',
  'agent',
  'harness',
  'mcp',
  'cursor',
  'codex',
  'vibe',
  'eval',
  'inference',
  'reasoning',
  'token',
];
