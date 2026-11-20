import React, { useEffect, useState } from 'react';
import { VOICE_NAMES, VOICE_PROFILES, type VoiceName } from '@post/core/shared';
import { CheckCircle2, Download, KeyRound, Save, Square, Volume2, XCircle } from 'lucide-react';
import { InstagramIcon } from '../components/InstagramIcon.js';
import { LlmEndpointsPanel } from '../components/LlmEndpointsPanel.js';
import {
  apiFetch,
  playVoicePreview,
  stopVoicePreview,
  type AppSettingsDto,
  type GeminiCheckDto,
  type HealthDto,
  type MetaCheckDto,
} from '../api.js';

interface Props {
  health: HealthDto | null;
  geminiCheck: GeminiCheckDto | null;
  metaCheck: MetaCheckDto | null;
  whisperProgress: { downloading: boolean; progressPct: number; error: string | null } | null;
  onVerifyGemini: () => void;
  onVerifyMeta: () => void;
  onDownloadWhisper: () => void;
  onSettingsUpdated: () => void;
  onNotify: (title: string, tone?: 'info' | 'success' | 'error') => void;
}

export const SettingsView: React.FC<Props> = ({
  health,
  geminiCheck,
  metaCheck,
  whisperProgress,
  onVerifyGemini,
  onVerifyMeta,
  onDownloadWhisper,
  onSettingsUpdated,
  onNotify,
}) => {
  const [defaultVoice, setDefaultVoice] = useState<VoiceName>(
    health?.settings.defaultVoice ?? 'Puck',
  );
  const [brandHandle, setBrandHandle] = useState(health?.settings.brandHandle ?? '@ai.dev.reels');
  const [musicEnabled, setMusicEnabled] = useState(health?.settings.musicEnabled ?? true);
  const [musicVolumeDb, setMusicVolumeDb] = useState(health?.settings.musicVolumeDb ?? -22);
  const [saving, setSaving] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);

  useEffect(() => {
    if (!health) return;
    setDefaultVoice(health.settings.defaultVoice);
    setBrandHandle(health.settings.brandHandle);
    setMusicEnabled(health.settings.musicEnabled);
    setMusicVolumeDb(health.settings.musicVolumeDb);
  }, [health]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch<{ settings: AppSettingsDto }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          defaultVoice,
          brandHandle,
          musicEnabled,
          musicVolumeDb,
        }),
      });
      onSettingsUpdated();
      onNotify('Saved studio preferences.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const whisperReady = Boolean(health?.whisper.cliAvailable && health?.whisper.modelAvailable);
  const isDownloading = Boolean(health?.whisper.downloading || whisperProgress?.downloading);
  const dlPct = whisperProgress?.progressPct ?? health?.whisper.progressPct ?? 0;
  const geminiOk = geminiCheck ? geminiCheck.ok : Boolean(health?.geminiConfigured);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Settings & System Health
        </h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          Configure Script LLMs or custom OpenAI-compatible models, download Whisper sync, audition
          voices, and verify Instagram.
        </p>
      </div>

      {/* Health Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LlmEndpointsPanel
          llmState={health?.llm ?? null}
          onLlmStateUpdated={onSettingsUpdated}
          onNotify={onNotify}
        />

        {/* Gemini TTS Card */}
        <div className="rounded-2xl border border-white/10 bg-[#11131B] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Google Gemini TTS (Voiceover)</h2>
            </div>
            {geminiOk ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-amber-400" />
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            {geminiCheck?.message ??
              (health?.geminiConfigured
                ? `Configured for voiceovers (${health.geminiTtsModel}) and built-in Gemini scripts (${health.geminiTextModel}).`
                : 'Add GEMINI_API_KEY inside .env for Gemini TTS voiceovers, then click Verify.')}
          </p>
          <button
            type="button"
            onClick={onVerifyGemini}
            className="mt-4 rounded-xl border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
          >
            Verify Gemini Key (Reloads .env)
          </button>
        </div>

        {/* Whisper + FFmpeg Card */}
        <div className="rounded-2xl border border-white/10 bg-[#11131B] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Local Media & Whisper Metal</h2>
            {whisperReady && health?.ffmpeg.ffmpegOk ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Download className="h-4 w-4 text-cyan-400" />
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            FFmpeg: {health?.ffmpeg.ffmpegOk ? 'Ready' : 'Missing'} · Whisper CLI:{' '}
            {health?.whisper.cliAvailable ? 'Ready' : 'Run brew install whisper-cpp'} · Model:{' '}
            {health?.whisper.modelAvailable ? 'ggml-base.en.bin Ready' : 'Not downloaded'}
          </p>
          {!whisperReady ? (
            <button
              type="button"
              onClick={onDownloadWhisper}
              disabled={!health?.whisper.cliAvailable || isDownloading}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {isDownloading ? `Downloading (${dlPct}%)...` : 'Download Whisper Model (~148 MB)'}
            </button>
          ) : (
            <p className="mt-4 font-mono text-[11px] text-emerald-300">{health?.whisper.cliPath}</p>
          )}
        </div>

        {/* Meta Instagram Card */}
        <div className="rounded-2xl border border-white/10 bg-[#11131B] p-5 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <InstagramIcon className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-zinc-100">
                Instagram Official Meta Graph API ({health?.metaVersion ?? 'v27.0'})
              </h2>
            </div>
            <button
              type="button"
              onClick={onVerifyMeta}
              className="rounded-xl border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
            >
              Verify Instagram Connection (Reloads .env)
            </button>
          </div>

          <p className="mt-2 text-xs text-zinc-300">
            {metaCheck?.message ??
              (health?.metaConfigured
                ? 'Credentials detected in .env. Click Verify Instagram Connection to check account & 24h quota.'
                : 'Follow docs/meta-instagram-setup.md to add META_IG_USER_ID and META_ACCESS_TOKEN to .env.')}
          </p>

          {metaCheck?.ok ? (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-[#151822] p-3 font-mono text-xs text-zinc-300 sm:grid-cols-3">
              <div>Account: @{metaCheck.username ?? metaCheck.igUserId}</div>
              <div>
                Quota:{' '}
                {metaCheck.quotaUsed !== null && metaCheck.quotaTotal !== null
                  ? `${metaCheck.quotaUsed}/${metaCheck.quotaTotal} used (24h)`
                  : 'Available'}
              </div>
              <div>
                Token:{' '}
                {metaCheck.tokenType === 'system_user_or_non_expiring'
                  ? 'Non-expiring System User'
                  : metaCheck.daysRemaining !== null
                    ? `${metaCheck.daysRemaining} days left`
                    : 'Active'}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Voice Audition & Brand Preferences */}
      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-2xl border border-white/10 bg-[#11131B] p-6"
      >
        <h2 className="text-base font-semibold text-zinc-100">Voice Audition & Studio Defaults</h2>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {VOICE_NAMES.map((voice) => {
            const isSelected = defaultVoice === voice;
            const isPlaying = playingVoice === voice;
            return (
              <div
                key={voice}
                onClick={() => setDefaultVoice(voice)}
                className={`cursor-pointer rounded-xl border p-3 transition ${
                  isSelected
                    ? 'border-cyan-400/55 bg-cyan-500/10'
                    : 'border-white/10 bg-[#151822] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-100">{voice}</span>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (isPlaying) {
                        stopVoicePreview();
                        return;
                      }
                      try {
                        await playVoicePreview(voice, setPlayingVoice);
                      } catch (err) {
                        setPlayingVoice(null);
                        onNotify(
                          err instanceof Error ? err.message : 'Preview requires GEMINI_API_KEY',
                          'error',
                        );
                      }
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-cyan-300 hover:bg-white/10"
                    title={`Audition ${voice}`}
                  >
                    {isPlaying ? (
                      <Square className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs font-medium text-cyan-300">
                  {VOICE_PROFILES[voice].tone}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {VOICE_PROFILES[voice].description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Brand Handle / Watermark
            </label>
            <input
              value={brandHandle}
              onChange={(e) => setBrandHandle(e.target.value)}
              placeholder="@yourhandle"
              className="w-full rounded-xl border border-white/10 bg-[#171A24] px-3.5 py-2 text-sm text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#171A24] px-4 py-2.5">
            <div>
              <span className="text-sm font-medium text-zinc-200">
                Subtle Ambient Music ({musicVolumeDb}dB)
              </span>
              <p className="text-xs text-zinc-400">Default for new generated Reels</p>
            </div>
            <input
              type="checkbox"
              checked={musicEnabled}
              onChange={(e) => setMusicEnabled(e.target.checked)}
              className="h-4 w-4 accent-cyan-400"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>
    </div>
  );
};
