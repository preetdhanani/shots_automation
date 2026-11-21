import React, { useState } from 'react';
import {
  CAMERA_MOVE_IDS,
  CAMERA_MOVE_LABELS,
  countWords,
  DEFAULT_CAMERA_MOVE,
  DEFAULT_TRANSITION,
  LAYOUT_LABELS,
  resolveLayout,
  SCENE_LAYOUTS,
  SCENE_TYPE_LABELS,
  SOCIAL_PLATFORMS,
  TRANSITION_IDS,
  TRANSITION_LABELS,
  type AiMediaClipScene,
  type BenchmarkBarsScene,
  type BigStatScene,
  type CameraMoveId,
  type ChecklistStepsScene,
  type CodeCompareScene,
  type CountdownItemScene,
  type HookTitleScene,
  type LineChartScene,
  type MythFactScene,
  type NewsQuoteCardScene,
  type ReelScene,
  type ReelStoryboard,
  type SceneVisual,
  type SocialPostScene,
  type SourceSpotlightScene,
  type TakeawayCtaScene,
  type TerminalDemoScene,
  type TimelineScene,
  type TransitionId,
  type VersusSplitScene,
} from '@post/core/shared';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

interface Props {
  storyboard: ReelStoryboard;
  onChange: (next: ReelStoryboard) => void;
}

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-[#171A24] px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none';

function sceneTypeTitle(scene: ReelScene): string {
  return SCENE_TYPE_LABELS[scene.type];
}

export const VisualSceneEditor: React.FC<Props> = ({ storyboard, onChange }) => {
  const [openIndex, setOpenIndex] = useState<number>(0);
  const [showRawJson, setShowRawJson] = useState(false);

  const updateScene = (idx: number, nextScene: ReelScene) => {
    const scenes = storyboard.scenes.map((s, i) => (i === idx ? nextScene : s));
    onChange({ ...storyboard, scenes });
  };

  return (
    <div className="space-y-3">
      {storyboard.scenes.map((scene, idx) => {
        const isOpen = openIndex === idx;
        const words = countWords(scene.narration);

        return (
          <div
            key={scene.id}
            className="overflow-hidden rounded-xl border border-white/10 bg-[#12151E]"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : idx)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                )}
                <span className="font-mono text-xs text-cyan-300">0{idx + 1}</span>
                <span className="truncate text-sm font-semibold text-zinc-100">
                  {sceneTypeTitle(scene)}
                </span>
              </div>
              <span
                className={`font-mono text-[11px] ${
                  words < 6 ? 'text-amber-300' : 'text-zinc-400'
                }`}
              >
                {words} words
              </span>
            </button>

            {isOpen ? (
              <div className="space-y-3.5 border-t border-white/10 p-4">
                {/* Per-scene Visual Look controls */}
                <SceneVisualControls
                  scene={scene}
                  onChange={(visual) => updateScene(idx, { ...scene, visual })}
                />

                {/* Narration field */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300">
                      Spoken Narration (changing triggers Voice + Video regen)
                    </label>
                    <span className="font-mono text-[11px] text-zinc-400">
                      ~{Math.max(1, Math.round(words / 2.65))}s · min 6 words
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={scene.narration}
                    onChange={(e) =>
                      updateScene(idx, { ...scene, narration: e.target.value })
                    }
                    className={INPUT_CLS}
                  />
                </div>

                {/* Scene-specific structured editors */}
                {scene.type === 'hook_title' ? (
                  <HookFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'benchmark_bars' ? (
                  <BenchmarkFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'code_compare' ? (
                  <CodeFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'terminal_demo' ? (
                  <TerminalFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'news_quote_card' ? (
                  <NewsCardFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'takeaway_cta' ? (
                  <TakeawayFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'big_stat' ? (
                  <BigStatFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'versus_split' ? (
                  <VersusSplitFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'checklist_steps' ? (
                  <ChecklistStepsFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'timeline' ? (
                  <TimelineFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'social_post' ? (
                  <SocialPostFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'line_chart' ? (
                  <LineChartFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'countdown_item' ? (
                  <CountdownItemFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'myth_fact' ? (
                  <MythFactFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'source_spotlight' ? (
                  <SourceSpotlightFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}

                {scene.type === 'ai_media_clip' ? (
                  <AiMediaClipFields
                    scene={scene}
                    onChange={(next) => updateScene(idx, next)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Optional collapsed Raw JSON debug inspector */}
      <div className="rounded-xl border border-white/10 bg-[#0D1017]">
        <button
          type="button"
          onClick={() => setShowRawJson((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
        >
          <span>Raw Storyboard JSON (Debug Inspector)</span>
          <span>{showRawJson ? 'Hide' : 'Show'}</span>
        </button>
        {showRawJson ? (
          <pre className="max-h-64 overflow-auto border-t border-white/10 p-3 font-mono text-[11px] text-zinc-300">
            {JSON.stringify(storyboard, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
};

const HookFields: React.FC<{ scene: HookTitleScene; onChange: (s: HookTitleScene) => void }> = ({
  scene,
  onChange,
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Badge</label>
      <input
        className={INPUT_CLS}
        value={scene.badge}
        onChange={(e) => onChange({ ...scene, badge: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Highlight Stat (optional)</label>
      <input
        className={INPUT_CLS}
        value={scene.highlightStat ?? ''}
        onChange={(e) => onChange({ ...scene, highlightStat: e.target.value || undefined })}
      />
    </div>
    <div className="sm:col-span-2">
      <label className="mb-1 block text-xs text-zinc-400">Headline</label>
      <input
        className={INPUT_CLS}
        value={scene.headline}
        onChange={(e) => onChange({ ...scene, headline: e.target.value })}
      />
    </div>
    <div className="sm:col-span-2">
      <label className="mb-1 block text-xs text-zinc-400">Subheadline</label>
      <input
        className={INPUT_CLS}
        value={scene.subheadline}
        onChange={(e) => onChange({ ...scene, subheadline: e.target.value })}
      />
    </div>
  </div>
);

const BenchmarkFields: React.FC<{
  scene: BenchmarkBarsScene;
  onChange: (s: BenchmarkBarsScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-zinc-400">Chart Title</label>
        <input
          className={INPUT_CLS}
          value={scene.title}
          onChange={(e) => onChange({ ...scene, title: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Metric Unit</label>
        <input
          className={INPUT_CLS}
          value={scene.metricUnit}
          onChange={(e) => onChange({ ...scene, metricUnit: e.target.value })}
        />
      </div>
    </div>

    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-300">Bars (2-5 items)</label>
        {scene.bars.length < 5 ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...scene,
                bars: [...scene.bars, { label: 'New Model', value: 50 }],
              })
            }
            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-cyan-300 hover:bg-white/10"
          >
            <Plus className="h-3 w-3" /> Add Bar
          </button>
        ) : null}
      </div>

      {scene.bars.map((bar, bIdx) => (
        <div key={bIdx} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#171A24] p-2">
          <input
            className="min-w-[120px] flex-1 rounded border border-white/10 bg-[#10131C] px-2.5 py-1 text-xs text-zinc-100"
            value={bar.label}
            maxLength={26}
            onChange={(e) => {
              const bars = scene.bars.map((b, i) => (i === bIdx ? { ...b, label: e.target.value } : b));
              onChange({ ...scene, bars });
            }}
          />
          <input
            type="number"
            step="0.1"
            className="w-20 rounded border border-white/10 bg-[#10131C] px-2 py-1 font-mono text-xs text-zinc-100"
            value={bar.value}
            onChange={(e) => {
              const val = Number.parseFloat(e.target.value) || 0;
              const bars = scene.bars.map((b, i) => (i === bIdx ? { ...b, value: val } : b));
              onChange({ ...scene, bars });
            }}
          />
          <label className="flex items-center gap-1 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(bar.isWinner)}
              onChange={(e) => {
                const bars = scene.bars.map((b, i) =>
                  i === bIdx ? { ...b, isWinner: e.target.checked } : b,
                );
                onChange({ ...scene, bars });
              }}
              className="accent-emerald-400"
            />
            Winner
          </label>
          {scene.bars.length > 2 ? (
            <button
              type="button"
              onClick={() =>
                onChange({ ...scene, bars: scene.bars.filter((_, i) => i !== bIdx) })
              }
              className="rounded p-1 text-zinc-500 hover:text-red-400"
              aria-label="Remove bar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);

const CodeFields: React.FC<{ scene: CodeCompareScene; onChange: (s: CodeCompareScene) => void }> = ({
  scene,
  onChange,
}) => {
  const maxLineLen = (code: string) =>
    Math.max(0, ...code.split('\n').map((l) => l.length));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Title</label>
          <input
            className={INPUT_CLS}
            value={scene.title}
            onChange={(e) => onChange({ ...scene, title: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Filename</label>
          <input
            className={INPUT_CLS}
            value={scene.filename}
            onChange={(e) => onChange({ ...scene, filename: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Mode</label>
          <select
            className={INPUT_CLS}
            value={scene.mode}
            onChange={(e) =>
              onChange({ ...scene, mode: e.target.value as CodeCompareScene['mode'] })
            }
          >
            <option value="single">Single Code Panel</option>
            <option value="before_after">Before vs After Diff</option>
          </select>
        </div>
      </div>

      {scene.mode === 'before_after' ? (
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
            <span className="text-zinc-300">Before Code</span>
            <span
              className={
                maxLineLen(scene.beforeCode ?? '') > 38 ? 'text-red-400' : 'text-zinc-400'
              }
            >
              Max line: {maxLineLen(scene.beforeCode ?? '')}/38 chars
            </span>
          </div>
          <textarea
            rows={4}
            value={scene.beforeCode ?? ''}
            onChange={(e) => onChange({ ...scene, beforeCode: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-[#0D1017] p-2.5 font-mono text-xs text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
          />
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
          <span className="text-zinc-300">
            {scene.mode === 'before_after' ? 'After Code' : 'Code Snippet'}
          </span>
          <span
            className={maxLineLen(scene.afterCode) > 38 ? 'text-red-400' : 'text-zinc-400'}
          >
            Max line: {maxLineLen(scene.afterCode)}/38 chars · {scene.afterCode.split('\n').length}/12 lines
          </span>
        </div>
        <textarea
          rows={5}
          value={scene.afterCode}
          onChange={(e) => onChange({ ...scene, afterCode: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-[#0D1017] p-2.5 font-mono text-xs text-zinc-100 focus:border-cyan-400/60 focus:outline-none"
        />
      </div>
    </div>
  );
};

const TerminalFields: React.FC<{
  scene: TerminalDemoScene;
  onChange: (s: TerminalDemoScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Title</label>
        <input
          className={INPUT_CLS}
          value={scene.title}
          onChange={(e) => onChange({ ...scene, title: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Command</label>
        <input
          className={`${INPUT_CLS} font-mono`}
          value={scene.command}
          onChange={(e) => onChange({ ...scene, command: e.target.value })}
        />
      </div>
    </div>

    <div className="space-y-2">
      <label className="block text-xs font-medium text-zinc-300">Terminal Output Lines</label>
      {scene.outputLines.map((line, lIdx) => (
        <div key={lIdx} className="flex items-center gap-2">
          <input
            className="flex-1 rounded-lg border border-white/10 bg-[#0D1017] px-2.5 py-1.5 font-mono text-xs text-zinc-100"
            value={line.text}
            onChange={(e) => {
              const outputLines = scene.outputLines.map((o, i) =>
                i === lIdx ? { ...o, text: e.target.value } : o,
              );
              onChange({ ...scene, outputLines });
            }}
          />
          <select
            className="rounded-lg border border-white/10 bg-[#171A24] px-2 py-1.5 text-xs text-zinc-200"
            value={line.tone}
            onChange={(e) => {
              const outputLines = scene.outputLines.map((o, i) =>
                i === lIdx
                  ? { ...o, tone: e.target.value as TerminalDemoScene['outputLines'][number]['tone'] }
                  : o,
              );
              onChange({ ...scene, outputLines });
            }}
          >
            <option value="neutral">neutral</option>
            <option value="success">success</option>
            <option value="warn">warn</option>
            <option value="accent">accent</option>
          </select>
        </div>
      ))}
    </div>
  </div>
);

const NewsCardFields: React.FC<{
  scene: NewsQuoteCardScene;
  onChange: (s: NewsQuoteCardScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Source Label</label>
        <input
          className={INPUT_CLS}
          value={scene.sourceLabel}
          onChange={(e) => onChange({ ...scene, sourceLabel: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Date Badge</label>
        <input
          className={INPUT_CLS}
          value={scene.dateLabel}
          onChange={(e) => onChange({ ...scene, dateLabel: e.target.value })}
        />
      </div>
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Headline</label>
      <input
        className={INPUT_CLS}
        value={scene.headline}
        onChange={(e) => onChange({ ...scene, headline: e.target.value })}
      />
    </div>
    <div className="space-y-2">
      <label className="block text-xs text-zinc-400">Key Bullets</label>
      {scene.bullets.map((b, bIdx) => (
        <input
          key={bIdx}
          className={INPUT_CLS}
          value={b}
          onChange={(e) => {
            const bullets = scene.bullets.map((x, i) => (i === bIdx ? e.target.value : x));
            onChange({ ...scene, bullets });
          }}
        />
      ))}
    </div>
  </div>
);

const TakeawayFields: React.FC<{
  scene: TakeawayCtaScene;
  onChange: (s: TakeawayCtaScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Badge</label>
        <input
          className={INPUT_CLS}
          value={scene.badge}
          onChange={(e) => onChange({ ...scene, badge: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">CTA Text</label>
        <input
          className={INPUT_CLS}
          value={scene.ctaText}
          onChange={(e) => onChange({ ...scene, ctaText: e.target.value })}
        />
      </div>
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Headline</label>
      <input
        className={INPUT_CLS}
        value={scene.headline}
        onChange={(e) => onChange({ ...scene, headline: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Takeaway</label>
      <textarea
        rows={2}
        className={INPUT_CLS}
        value={scene.takeaway}
        onChange={(e) => onChange({ ...scene, takeaway: e.target.value })}
      />
    </div>
  </div>
);

const SceneVisualControls: React.FC<{
  scene: ReelScene;
  onChange: (next: SceneVisual) => void;
}> = ({ scene, onChange }) => {
  const layouts = SCENE_LAYOUTS[scene.type] as readonly string[];
  const currentVisual: SceneVisual = scene.visual ?? {};
  const layoutVal = resolveLayout(scene.type, currentVisual.layout);
  const transitionVal = currentVisual.transition ?? DEFAULT_TRANSITION;
  const cameraVal = currentVisual.camera ?? DEFAULT_CAMERA_MOVE;

  return (
    <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-white/8 bg-[#0E1119] p-3 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">Scene Layout</label>
        <select
          aria-label="Scene Layout"
          className={INPUT_CLS}
          value={layoutVal}
          onChange={(e) => onChange({ ...currentVisual, layout: e.target.value })}
        >
          {layouts.map((id) => (
            <option key={id} value={id}>
              {LAYOUT_LABELS[id] ?? id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">Transition</label>
        <select
          aria-label="Scene Transition"
          className={INPUT_CLS}
          value={transitionVal}
          onChange={(e) =>
            onChange({ ...currentVisual, transition: e.target.value as TransitionId })
          }
        >
          {TRANSITION_IDS.map((id) => (
            <option key={id} value={id}>
              {TRANSITION_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-zinc-400">Camera Move</label>
        <select
          aria-label="Scene Camera Move"
          className={INPUT_CLS}
          value={cameraVal}
          onChange={(e) =>
            onChange({ ...currentVisual, camera: e.target.value as CameraMoveId })
          }
        >
          {CAMERA_MOVE_IDS.map((id) => (
            <option key={id} value={id}>
              {CAMERA_MOVE_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

const BigStatFields: React.FC<{
  scene: BigStatScene;
  onChange: (s: BigStatScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Stat Value</label>
        <input
          className={INPUT_CLS}
          value={scene.value}
          onChange={(e) => onChange({ ...scene, value: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Trend</label>
        <select
          className={INPUT_CLS}
          value={scene.trend ?? 'neutral'}
          onChange={(e) =>
            onChange({ ...scene, trend: e.target.value as 'up' | 'down' | 'neutral' })
          }
        >
          <option value="up">Up</option>
          <option value="down">Down</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Source Label</label>
        <input
          className={INPUT_CLS}
          value={scene.sourceLabel ?? ''}
          onChange={(e) =>
            onChange({ ...scene, sourceLabel: e.target.value.trim() || undefined })
          }
        />
      </div>
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Label</label>
      <input
        className={INPUT_CLS}
        value={scene.label}
        onChange={(e) => onChange({ ...scene, label: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Context</label>
      <textarea
        rows={2}
        className={INPUT_CLS}
        value={scene.context}
        onChange={(e) => onChange({ ...scene, context: e.target.value })}
      />
    </div>
  </div>
);

const VersusSplitFields: React.FC<{
  scene: VersusSplitScene;
  onChange: (s: VersusSplitScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Title</label>
        <input
          className={INPUT_CLS}
          value={scene.title}
          onChange={(e) => onChange({ ...scene, title: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Winner</label>
        <select
          className={INPUT_CLS}
          value={scene.winner ?? 'tie'}
          onChange={(e) =>
            onChange({ ...scene, winner: e.target.value as 'left' | 'right' | 'tie' })
          }
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="tie">Tie</option>
        </select>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(['left', 'right'] as const).map((sideKey) => {
        const side = scene[sideKey];
        return (
          <div key={sideKey} className="space-y-2 rounded-lg border border-white/8 bg-[#0E1119] p-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                className={INPUT_CLS}
                placeholder="Side Name"
                value={side.name}
                onChange={(e) =>
                  onChange({ ...scene, [sideKey]: { ...side, name: e.target.value } })
                }
              />
              <input
                className={INPUT_CLS}
                placeholder="Score (opt)"
                value={side.score ?? ''}
                onChange={(e) =>
                  onChange({
                    ...scene,
                    [sideKey]: { ...side, score: e.target.value.trim() || undefined },
                  })
                }
              />
            </div>
            {side.points.map((pt, pIdx) => (
              <input
                key={pIdx}
                className={INPUT_CLS}
                value={pt}
                onChange={(e) => {
                  const points = side.points.map((x, i) => (i === pIdx ? e.target.value : x));
                  onChange({ ...scene, [sideKey]: { ...side, points } });
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Verdict (optional)</label>
      <input
        className={INPUT_CLS}
        value={scene.verdict ?? ''}
        onChange={(e) => onChange({ ...scene, verdict: e.target.value.trim() || undefined })}
      />
    </div>
  </div>
);

const ChecklistStepsFields: React.FC<{
  scene: ChecklistStepsScene;
  onChange: (s: ChecklistStepsScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Title</label>
        <input
          className={INPUT_CLS}
          value={scene.title}
          onChange={(e) => onChange({ ...scene, title: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Mode</label>
        <select
          className={INPUT_CLS}
          value={scene.mode}
          onChange={(e) =>
            onChange({ ...scene, mode: e.target.value as 'steps' | 'checklist' })
          }
        >
          <option value="steps">Numbered Steps</option>
          <option value="checklist">Checklist</option>
        </select>
      </div>
    </div>
    <div className="space-y-2">
      {scene.items.map((item, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className={INPUT_CLS}
            value={item.text}
            placeholder="Step text"
            onChange={(e) => {
              const items = scene.items.map((x, idx) =>
                idx === i ? { ...x, text: e.target.value } : x,
              );
              onChange({ ...scene, items });
            }}
          />
          <input
            className={INPUT_CLS}
            value={item.detail ?? ''}
            placeholder="Detail (optional)"
            onChange={(e) => {
              const items = scene.items.map((x, idx) =>
                idx === i ? { ...x, detail: e.target.value.trim() || undefined } : x,
              );
              onChange({ ...scene, items });
            }}
          />
        </div>
      ))}
    </div>
  </div>
);

const TimelineFields: React.FC<{
  scene: TimelineScene;
  onChange: (s: TimelineScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Title</label>
      <input
        className={INPUT_CLS}
        value={scene.title}
        onChange={(e) => onChange({ ...scene, title: e.target.value })}
      />
    </div>
    <div className="space-y-2">
      {scene.events.map((ev, i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          <input
            className={INPUT_CLS}
            value={ev.label}
            placeholder="Date / Stage"
            onChange={(e) => {
              const events = scene.events.map((x, idx) =>
                idx === i ? { ...x, label: e.target.value } : x,
              );
              onChange({ ...scene, events });
            }}
          />
          <input
            className={`${INPUT_CLS} col-span-2`}
            value={ev.text}
            placeholder="Milestone"
            onChange={(e) => {
              const events = scene.events.map((x, idx) =>
                idx === i ? { ...x, text: e.target.value } : x,
              );
              onChange({ ...scene, events });
            }}
          />
        </div>
      ))}
    </div>
  </div>
);

const SocialPostFields: React.FC<{
  scene: SocialPostScene;
  onChange: (s: SocialPostScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Author</label>
        <input
          className={INPUT_CLS}
          value={scene.authorName}
          onChange={(e) => onChange({ ...scene, authorName: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Handle</label>
        <input
          className={INPUT_CLS}
          value={scene.authorHandle ?? ''}
          onChange={(e) =>
            onChange({ ...scene, authorHandle: e.target.value.trim() || undefined })
          }
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Platform</label>
        <select
          className={INPUT_CLS}
          value={scene.platform}
          onChange={(e) =>
            onChange({
              ...scene,
              platform: e.target.value as SocialPostScene['platform'],
            })
          }
        >
          {SOCIAL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Quoted Post Text</label>
      <textarea
        rows={2}
        className={INPUT_CLS}
        value={scene.postText}
        onChange={(e) => onChange({ ...scene, postText: e.target.value })}
      />
    </div>
  </div>
);

const LineChartFields: React.FC<{
  scene: LineChartScene;
  onChange: (s: LineChartScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-zinc-400">Title</label>
        <input
          className={INPUT_CLS}
          value={scene.title}
          onChange={(e) => onChange({ ...scene, title: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Unit</label>
        <input
          className={INPUT_CLS}
          value={scene.metricUnit}
          onChange={(e) => onChange({ ...scene, metricUnit: e.target.value })}
        />
      </div>
    </div>
    <div className="space-y-2">
      {scene.points.map((pt, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <input
            className={INPUT_CLS}
            value={pt.label}
            onChange={(e) => {
              const points = scene.points.map((x, idx) =>
                idx === i ? { ...x, label: e.target.value } : x,
              );
              onChange({ ...scene, points });
            }}
          />
          <input
            type="number"
            step="any"
            className={INPUT_CLS}
            value={pt.value}
            onChange={(e) => {
              const val = Number.parseFloat(e.target.value);
              const points = scene.points.map((x, idx) =>
                idx === i ? { ...x, value: Number.isFinite(val) ? val : 0 } : x,
              );
              onChange({ ...scene, points });
            }}
          />
        </div>
      ))}
    </div>
  </div>
);

const CountdownItemFields: React.FC<{
  scene: CountdownItemScene;
  onChange: (s: CountdownItemScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Rank</label>
        <input
          type="number"
          min={1}
          max={10}
          className={INPUT_CLS}
          value={scene.rank}
          onChange={(e) => {
            const val = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(val) && val >= 1 && val <= 10) {
              onChange({ ...scene, rank: val });
            }
          }}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Tag (optional)</label>
        <input
          className={INPUT_CLS}
          value={scene.tag ?? ''}
          onChange={(e) => onChange({ ...scene, tag: e.target.value.trim() || undefined })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Title</label>
        <input
          className={INPUT_CLS}
          value={scene.title}
          onChange={(e) => onChange({ ...scene, title: e.target.value })}
        />
      </div>
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Detail</label>
      <textarea
        rows={2}
        className={INPUT_CLS}
        value={scene.detail}
        onChange={(e) => onChange({ ...scene, detail: e.target.value })}
      />
    </div>
  </div>
);

const MythFactFields: React.FC<{
  scene: MythFactScene;
  onChange: (s: MythFactScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Myth</label>
      <input
        className={INPUT_CLS}
        value={scene.myth}
        onChange={(e) => onChange({ ...scene, myth: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Fact / Reality</label>
      <textarea
        rows={2}
        className={INPUT_CLS}
        value={scene.fact}
        onChange={(e) => onChange({ ...scene, fact: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Source Label (optional)</label>
      <input
        className={INPUT_CLS}
        value={scene.sourceLabel ?? ''}
        onChange={(e) =>
          onChange({ ...scene, sourceLabel: e.target.value.trim() || undefined })
        }
      />
    </div>
  </div>
);

const SourceSpotlightFields: React.FC<{
  scene: SourceSpotlightScene;
  onChange: (s: SourceSpotlightScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Source Domain</label>
        <input
          className={INPUT_CLS}
          value={scene.domain}
          onChange={(e) => onChange({ ...scene, domain: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-400">Attached Image Asset</label>
        <input
          className={`${INPUT_CLS} opacity-65`}
          readOnly
          value={scene.imageAsset ? `Asset: ${scene.imageAsset}` : 'Editorial fallback (no image)'}
        />
      </div>
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Headline</label>
      <input
        className={INPUT_CLS}
        value={scene.headline}
        onChange={(e) => onChange({ ...scene, headline: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Caption (optional)</label>
      <input
        className={INPUT_CLS}
        value={scene.caption ?? ''}
        onChange={(e) => onChange({ ...scene, caption: e.target.value.trim() || undefined })}
      />
    </div>
  </div>
);

const AiMediaClipFields: React.FC<{
  scene: AiMediaClipScene;
  onChange: (s: AiMediaClipScene) => void;
}> = ({ scene, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Overlay Caption Text</label>
      <input
        className={INPUT_CLS}
        value={scene.captionText}
        onChange={(e) => onChange({ ...scene, captionText: e.target.value })}
      />
    </div>
    <div>
      <label className="mb-1 block text-xs text-zinc-400">Veo Visual Prompt</label>
      <textarea
        rows={2}
        className={INPUT_CLS}
        value={scene.prompt}
        onChange={(e) => onChange({ ...scene, prompt: e.target.value })}
      />
    </div>
  </div>
);
