# AI News & Dev Reels Studio

A local-first macOS studio and CLI pipeline that discovers high-signal AI news, model benchmarks, agent harnesses, coding practices, and developer vibe-coding tips, generates crisp 9:16 Remotion motion-graphics Reels with Google Gemini TTS voiceovers and local Whisper word-level captions, and publishes to Instagram via the official Meta Graph API after human approval.

## Features

- Multi-source developer discovery across official AI lab feeds, Hacker News, GitHub Releases, and custom prompt/URL inputs.
- Selectable Script LLM endpoints supporting built-in Google Gemini as well as custom OpenAI-compatible servers (Ollama, LM Studio, OpenRouter, OpenAI, Groq, vLLM) via Studio Settings or `.env`.
- Structured 5-scene vertical Reel storyboards (`hook_title`, `benchmark_bars`, `code_compare`, `terminal_demo`, `news_quote_card`, `takeaway_cta`) validated by an automated editorial quality gate.
- Natural English voiceovers powered by Google Gemini TTS (`gemini-3.8-flash-tts`) with two-pass FFmpeg loudness normalization.
- Fast offline word-level caption alignment using local Homebrew `whisper-cli` with Metal GPU acceleration and a 1-to-N Script-to-Whisper aligner so technical terms stay spelled accurately.
- Programmatic `1080x1920` 30fps Remotion motion graphics rendered cleanly inside Instagram Reels safe zones and normalized by FFmpeg to strict Meta specifications.
- Smooth 4-stage Approval Studio UI with live 6-step pipeline progress, interactive phone preview, Instagram HUD safe-zone overlay, visual scene editor, and Meta Resumable Upload publishing.

## Quick Start

1. Install dependencies and copy `.env.example`:

```bash
npm install
cp .env.example .env
```

2. Add your `GEMINI_API_KEY` from Google AI Studio inside `.env` (used for Gemini TTS voiceovers and built-in Gemini scripts, or connect a custom OpenAI-compatible Script LLM inside Settings & Health).
3. Launch the Studio UI:

```bash
npm run dev
```

4. Open `http://localhost:5173` in your browser (`http://127.0.0.1:4310` when running production `npm run build && npm start`).
5. Click **Download Whisper Model** in the setup strip to enable offline word-level caption sync, and click **Generate Sample Demo Reel** to test the full render and review studio right away.

## Custom OpenAI-Compatible LLMs

Open **Settings & Health** -> **Script LLM Endpoints** -> **Add Custom Endpoint** to connect local models (Ollama or LM Studio) or hosted providers (OpenRouter, OpenAI, Groq, vLLM).
Click **Fetch Models** to populate discovered model IDs from `/models` and click **Test Connection** before saving.
Saved custom API keys stay inside your local SQLite database and are never returned to the browser.
You can also set `LLM_PROVIDER=openai_compatible`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL`, and `OPENAI_COMPAT_API_KEY` inside `.env`.

## Instagram Publishing Setup

Follow [docs/meta-instagram-setup.md](docs/meta-instagram-setup.md) to link your Instagram Business or Creator account and configure your Meta Business System User Token.

## Useful CLI Commands

```bash
npm run reel -- fetch
npm run reel -- generate --prompt "Claude Code hooks vs manual checks"
npm run reel -- generate --prompt "Claude Code hooks" --llm <endpointId>
npm run reel -- draft-daily
npm run reel -- llm:check
npm run reel -- setup:whisper
npm run reel -- meta:check
npm run reel -- meta:exchange-token <SHORT_LIVED_TOKEN>
npm run reel -- schedule:install
npm run reel -- schedule:remove
npm run studio
```
