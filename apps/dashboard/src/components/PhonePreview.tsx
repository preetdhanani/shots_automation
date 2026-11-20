import React, { useEffect, useState } from 'react';
import type { SceneTiming, VideoSpecReport } from '@post/core/shared';
import {
  Bookmark,
  CheckCircle2,
  Eye,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Repeat,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ReelDto } from '../api.js';

interface Props {
  reel: ReelDto;
  sceneTimings: SceneTiming[];
  brandHandle: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  safeZoneOpen: boolean;
  onToggleSafeZone: () => void;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const whole = Math.floor(sec);
  const mins = Math.floor(whole / 60);
  const rem = whole % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const PhonePreview: React.FC<Props> = ({
  reel,
  sceneTimings,
  brandHandle,
  videoRef,
  safeZoneOpen,
  onToggleSafeZone,
}) => {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((reel.audioDurationMs ?? 30_000) / 1000);
  const [hoveredScene, setHoveredScene] = useState<string | null>(null);

  const videoUrl = `/api/reels/${reel.id}/video?v=${encodeURIComponent(reel.updatedAt)}`;
  const coverUrl = `/api/reels/${reel.id}/cover?v=${encodeURIComponent(reel.updatedAt)}`;

  let spec: VideoSpecReport | null = null;
  if (reel.ffprobeJson) {
    try {
      spec = JSON.parse(reel.ffprobeJson) as VideoSpecReport;
    } catch {
      spec = null;
    }
  }

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration((reel.audioDurationMs ?? 30_000) / 1000);
  }, [reel.id, reel.updatedAt, reel.audioDurationMs]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play();
    } else {
      vid.pause();
    }
  };

  const seekToSec = (sec: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(duration || 1, sec));
    setCurrentTime(vid.currentTime);
  };

  const currentMs = currentTime * 1000;
  const activeScene =
    sceneTimings.find((s) => currentMs >= s.startMs && currentMs < s.endMs) ??
    sceneTimings[0] ??
    null;
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-2.5">
      {/* Top quick bar above phone */}
      <div className="flex w-full items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#141720] px-2.5 py-1 font-mono text-[11px] text-zinc-300">
          {activeScene ? `Scene: ${activeScene.label}` : '9:16 Preview'}
        </span>

        <button
          type="button"
          onClick={onToggleSafeZone}
          title="Toggle Instagram Safe-Zone Overlay (S)"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            safeZoneOpen
              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
              : 'border-white/10 bg-[#141720] text-zinc-300 hover:bg-white/10'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          IG HUD {safeZoneOpen ? 'On' : 'Off'}
        </button>
      </div>

      {/* Laptop-safe dynamic 9:16 phone frame */}
      <div
        className="relative overflow-hidden rounded-[26px] border-2 border-white/15 bg-black shadow-[0_24px_60px_rgba(0,0,0,0.75)]"
        style={{
          height: 'min(calc(100dvh - 250px), 620px)',
          aspectRatio: '9 / 16',
        }}
      >
        {reel.videoPath ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={reel.coverPath ? coverUrl : undefined}
            muted={muted}
            loop={loop}
            playsInline
            preload="metadata"
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            className="h-full w-full cursor-pointer object-contain bg-black"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-xs text-zinc-400">
            Video not rendered yet.
          </div>
        )}

        {/* Realistic Instagram Reels HUD Overlay (percentage mapped to 1080x1920 safe zones) */}
        {safeZoneOpen ? (
          <div className="pointer-events-none absolute inset-0 select-none">
            {/* Top IG header zone (~0..6.2% = 120px) */}
            <div className="flex h-[6.2%] items-center justify-between border-b border-dashed border-cyan-400/45 bg-gradient-to-b from-black/75 to-transparent px-3.5 text-[10px] font-semibold text-white/85">
              <span>Reels</span>
              <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
                Top HUD Zone
              </span>
            </div>

            {/* Right IG action rail (~13.9% width = 150px / 1080px) */}
            <div className="absolute right-0 bottom-[20%] flex w-[13.9%] flex-col items-center justify-end gap-3 border-l border-dashed border-rose-400/45 bg-rose-500/5 py-3 text-white/85">
              <Heart className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <Send className="h-4 w-4" />
              <Bookmark className="h-4 w-4" />
            </div>

            {/* Bottom IG caption/bar hazard zone (~19.8% = 380px / 1920px) */}
            <div className="absolute right-0 bottom-0 left-0 flex h-[19.8%] flex-col justify-end border-t border-dashed border-amber-400/55 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 text-left">
              <span className="mb-1 inline-block w-fit rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] text-amber-200">
                IG Bottom Safe Margin (380px)
              </span>
              <p className="text-[11px] font-semibold text-white/90">
                {brandHandle || '@yourhandle'}
              </p>
              <p className="truncate text-[10px] text-white/70">{reel.caption}</p>
            </div>
          </div>
        ) : null}

        {/* Play overlay indicator when paused */}
        {reel.videoPath && !playing ? (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play video"
            className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/60 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-black/75"
          >
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </button>
        ) : null}
      </div>

      {/* Compact Timeline Scrubber with Scene Notch Ticks */}
      <div className="w-full max-w-[330px] space-y-1.5">
        <div
          className="relative h-6 cursor-pointer pt-2"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seekToSec(ratio * duration);
          }}
        >
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-cyan-400"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {duration > 0
            ? sceneTimings.map((scene) => {
                const leftPct = Math.min(98, Math.max(0, (scene.startMs / 1000 / duration) * 100));
                return (
                  <button
                    key={scene.sceneId}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekToSec(scene.startMs / 1000);
                    }}
                    onMouseEnter={() => setHoveredScene(`${scene.label} (${formatSec(scene.startMs / 1000)})`)}
                    onMouseLeave={() => setHoveredScene(null)}
                    aria-label={`Jump to ${scene.label}`}
                    style={{ left: `${leftPct}%` }}
                    className="absolute top-1.5 h-2.5 w-1 -translate-x-1/2 rounded-full bg-white/75 transition hover:scale-125 hover:bg-cyan-300"
                  />
                );
              })
            : null}
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="rounded-lg border border-white/10 bg-[#141720] p-1.5 text-zinc-200 transition hover:bg-white/10"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="rounded-lg border border-white/10 bg-[#141720] p-1.5 text-zinc-200 transition hover:bg-white/10"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setLoop((l) => !l)}
              title="Toggle Loop"
              className={`rounded-lg border p-1.5 transition ${
                loop
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/10 bg-[#141720] text-zinc-400'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="font-mono text-[11px] text-zinc-400">
            {hoveredScene ?? `${formatSec(currentTime)} / ${formatSec(duration)}`}
          </span>
        </div>
      </div>

      {/* Meta Spec Status Pill */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#11131B] px-3 py-1.5 font-mono text-[11px] text-zinc-300">
        {spec?.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : null}
        <span>
          {spec ? `${spec.width}x${spec.height} · ${Math.round(spec.fps)}fps · ${spec.videoCodec.toUpperCase()}` : '1080x1920'}
        </span>
        <span className="text-zinc-600">·</span>
        <span className={reel.alignmentMode === 'whisper' ? 'text-emerald-300' : 'text-amber-300'}>
          {reel.alignmentMode === 'whisper' ? 'Whisper Sync' : 'Estimated Sync'}
        </span>
      </div>
    </div>
  );
};
