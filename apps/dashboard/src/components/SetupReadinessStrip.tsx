import React from 'react';
import { CheckCircle2, Cpu, Download, KeyRound, Play, Sparkles, Wifi } from 'lucide-react';
import type { HealthDto, WhisperStatusDto } from '../api.js';

interface Props {
  health: HealthDto | null;
  whisperProgress: { downloading: boolean; progressPct: number; error: string | null } | null;
  onDownloadWhisper: () => void;
  onVerifyGemini: () => void;
  onGenerateSample: () => void;
  onOpenSettings: () => void;
  checkingGemini: boolean;
  startingSample: boolean;
}

export const SetupReadinessStrip: React.FC<Props> = ({
  health,
  whisperProgress,
  onDownloadWhisper,
  onVerifyGemini,
  onGenerateSample,
  onOpenSettings,
  checkingGemini,
  startingSample,
}) => {
  if (!health) return null;

  const whisper: WhisperStatusDto = health.whisper;
  const whisperReady = whisper.cliAvailable && whisper.modelAvailable;
  const isDownloading = whisper.downloading || Boolean(whisperProgress?.downloading);
  const pct = whisperProgress?.progressPct ?? whisper.progressPct ?? 0;

  const activeEndpoint = health.llm?.activeEndpoint ?? null;
  const scriptLlmReady = Boolean(health.llm?.scriptLlmReady ?? health.geminiConfigured);
  const ttsReady = Boolean(health.llm?.ttsReady ?? health.geminiConfigured);
  const usingCustomScriptLlm = activeEndpoint?.provider === 'openai_compatible';

  if (scriptLlmReady && ttsReady && whisperReady && health.metaConfigured) {
    return null;
  }

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-[#11131B] p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Studio Setup Checklist</h2>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Test the full video pipeline offline right now with the sample demo, or connect your
            keys in{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
            >
              Settings
            </button>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Whisper model readiness */}
          {whisperReady ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Whisper Ready
            </span>
          ) : (
            <button
              type="button"
              onClick={onDownloadWhisper}
              disabled={!whisper.cliAvailable || isDownloading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {isDownloading
                ? `Downloading Whisper (${pct}%)...`
                : whisper.cliAvailable
                  ? 'Download Whisper Model (~148 MB)'
                  : 'Install whisper-cpp via Brew'}
            </button>
          )}

          {/* Script LLM status (shown separately when using OpenAI-compatible endpoint) */}
          {usingCustomScriptLlm && activeEndpoint ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                scriptLlmReady
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              Script: {activeEndpoint.name}
            </button>
          ) : null}

          {/* Gemini Key / TTS status */}
          <button
            type="button"
            onClick={onVerifyGemini}
            disabled={checkingGemini}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              ttsReady
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-amber-500/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {checkingGemini
              ? 'Checking Gemini...'
              : ttsReady
                ? usingCustomScriptLlm
                  ? 'TTS: Gemini Ready'
                  : 'Gemini Key Set (Verify)'
                : usingCustomScriptLlm
                  ? 'TTS: Add GEMINI_API_KEY'
                  : 'Add GEMINI_API_KEY in .env'}
          </button>

          {/* Meta status */}
          <button
            type="button"
            onClick={onOpenSettings}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              health.metaConfigured
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            <Wifi className="h-3.5 w-3.5" />
            {health.metaConfigured ? 'Instagram Connected' : 'Setup Instagram'}
          </button>

          {/* Sample Demo CTA */}
          <button
            type="button"
            onClick={onGenerateSample}
            disabled={startingSample}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {startingSample ? 'Starting Demo...' : 'Generate Sample Demo Reel'}
          </button>
        </div>
      </div>

      {isDownloading ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-200"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
};
