import React, { useState } from 'react';
import { LLM_ENDPOINT_PRESETS, type LlmEndpointPreset } from '@post/core/shared';
import {
  Check,
  CheckCircle2,
  Cpu,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  apiFetch,
  type LlmCheckDto,
  type LlmEndpointDto,
  type LlmModelsDto,
  type LlmStateDto,
} from '../api.js';

interface Props {
  llmState: LlmStateDto | null;
  onLlmStateUpdated: () => void;
  onNotify: (title: string, tone?: 'info' | 'success' | 'error') => void;
}

function sourceBadgeLabel(source: LlmEndpointDto['source']): string {
  switch (source) {
    case 'builtin':
      return 'Built-in';
    case 'env':
      return '.env';
    case 'custom':
      return 'Custom';
  }
}

export const LlmEndpointsPanel: React.FC<Props> = ({ llmState, onLlmStateUpdated, onNotify }) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ollama');

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [modelPlaceholder, setModelPlaceholder] = useState('qwen2.5:14b');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [existingKeyHint, setExistingKeyHint] = useState<string | null>(null);

  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingDraft, setTestingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftCheck, setDraftCheck] = useState<LlmCheckDto | null>(null);

  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [cardChecks, setCardChecks] = useState<Record<string, LlmCheckDto>>({});

  const applyPreset = (preset: LlmEndpointPreset) => {
    setSelectedPresetId(preset.id);
    if (!editingEndpointId) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
    } else if (preset.baseUrl) {
      setBaseUrl(preset.baseUrl);
    }
    setModelPlaceholder(preset.placeholderModel);
    setFetchedModels([]);
    setDraftCheck(null);
  };

  const openAddForm = () => {
    const defaultPreset = LLM_ENDPOINT_PRESETS[0]!;
    setEditingEndpointId(null);
    setSelectedPresetId(defaultPreset.id);
    setName(defaultPreset.name);
    setBaseUrl(defaultPreset.baseUrl);
    setModel('');
    setModelPlaceholder(defaultPreset.placeholderModel);
    setApiKey('');
    setShowApiKey(false);
    setClearApiKey(false);
    setHasExistingKey(false);
    setExistingKeyHint(null);
    setFetchedModels([]);
    setDraftCheck(null);
    setConfirmDeleteId(null);
    setFormOpen(true);
  };

  const openEditForm = (ep: LlmEndpointDto, overrideModel?: string) => {
    setEditingEndpointId(ep.id);
    setSelectedPresetId('custom');
    setName(ep.name);
    setBaseUrl(ep.baseUrl);
    setModel(overrideModel ?? ep.model);
    setModelPlaceholder('model-id');
    setApiKey('');
    setShowApiKey(false);
    setClearApiKey(false);
    setHasExistingKey(ep.hasApiKey);
    setExistingKeyHint(ep.apiKeyHint);
    setFetchedModels([]);
    setDraftCheck(null);
    setConfirmDeleteId(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingEndpointId(null);
    setDraftCheck(null);
  };

  const handleSelectEndpoint = async (endpointId: string) => {
    setSelectingId(endpointId);
    setConfirmDeleteId(null);
    try {
      const res = await apiFetch<LlmStateDto>('/api/llm/select', {
        method: 'POST',
        body: JSON.stringify({ endpointId }),
      });
      onLlmStateUpdated();
      onNotify(`Active Script LLM set to ${res.activeEndpoint.name}.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to switch LLM endpoint', 'error');
    } finally {
      setSelectingId(null);
    }
  };

  const handleTestCard = async (ep: LlmEndpointDto) => {
    setTestingId(ep.id);
    setConfirmDeleteId(null);
    try {
      const res = await apiFetch<LlmCheckDto>('/api/llm/check', {
        method: 'POST',
        body: JSON.stringify({ endpointId: ep.id }),
      });
      setCardChecks((prev) => ({ ...prev, [ep.id]: res }));
      onLlmStateUpdated();
      onNotify(res.message, res.ok ? 'success' : 'error');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Connection test failed', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteEndpoint = async (ep: LlmEndpointDto) => {
    if (confirmDeleteId !== ep.id) {
      setConfirmDeleteId(ep.id);
      return;
    }
    setDeletingId(ep.id);
    try {
      await apiFetch(`/api/llm/endpoints/${encodeURIComponent(ep.id)}`, {
        method: 'DELETE',
      });
      setConfirmDeleteId(null);
      if (editingEndpointId === ep.id) {
        closeForm();
      }
      onLlmStateUpdated();
      onNotify(`Deleted custom endpoint "${ep.name}".`, 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      onNotify('Enter a Base URL first before fetching models.', 'error');
      return;
    }
    setFetchingModels(true);
    try {
      const res = await apiFetch<LlmModelsDto>('/api/llm/models', {
        method: 'POST',
        body: JSON.stringify({
          endpointId: editingEndpointId ?? undefined,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          clearApiKey: editingEndpointId ? clearApiKey : undefined,
        }),
      });
      setFetchedModels(res.models);
      if (res.ok && res.models.length > 0) {
        if (!model.trim()) {
          setModel(res.models[0]!);
        }
        onNotify(res.message, 'success');
      } else {
        onNotify(res.message, res.ok ? 'info' : 'error');
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to fetch models', 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestDraft = async () => {
    if (!baseUrl.trim()) {
      onNotify('Enter a Base URL before testing.', 'error');
      return;
    }
    setTestingDraft(true);
    try {
      const res = await apiFetch<LlmCheckDto>('/api/llm/check', {
        method: 'POST',
        body: JSON.stringify({
          endpointId: editingEndpointId ?? undefined,
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKey: apiKey.trim() || undefined,
          clearApiKey: editingEndpointId ? clearApiKey : undefined,
        }),
      });
      setDraftCheck(res);
      if (res.availableModels && res.availableModels.length > 0) {
        setFetchedModels(res.availableModels);
      }
      onNotify(res.message, res.ok ? 'success' : 'error');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection test failed';
      setDraftCheck({
        configured: false,
        ok: false,
        provider: 'openai_compatible',
        endpointId: editingEndpointId ?? 'draft',
        name: name.trim() || 'Custom Endpoint',
        model: model.trim(),
        baseUrl: baseUrl.trim(),
        message: msg,
      });
      onNotify(msg, 'error');
    } finally {
      setTestingDraft(false);
    }
  };

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim() || !model.trim()) {
      onNotify('Name, Base URL, and Model ID are required.', 'error');
      return;
    }

    setSavingDraft(true);
    try {
      if (editingEndpointId) {
        await apiFetch(`/api/llm/endpoints/${encodeURIComponent(editingEndpointId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            baseUrl: baseUrl.trim(),
            model: model.trim(),
            apiKey: clearApiKey ? undefined : apiKey.trim() || undefined,
            clearApiKey,
          }),
        });
        onNotify(`Updated endpoint "${name.trim()}".`, 'success');
      } else {
        await apiFetch('/api/llm/endpoints', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            baseUrl: baseUrl.trim(),
            model: model.trim(),
            apiKey: apiKey.trim() || undefined,
            setActive: true,
          }),
        });
        onNotify(`Added and activated "${name.trim()}".`, 'success');
      }
      closeForm();
      onLlmStateUpdated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save endpoint', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const endpoints = llmState?.endpoints ?? [];
  const activeEndpoint = llmState?.activeEndpoint ?? null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#11131B] p-5 md:col-span-2">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Script LLM Endpoints</h2>
            {activeEndpoint ? (
              <span className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[11px] text-cyan-200">
                Active: {activeEndpoint.name} ({activeEndpoint.model || 'unset'})
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Select Google Gemini or any OpenAI-compatible model (Ollama, LM Studio, OpenRouter,
            OpenAI, Groq, vLLM) for writing scripts and scenes. Voiceover synthesis uses Google
            Gemini TTS.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-300"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Custom Endpoint
        </button>
      </div>

      {/* Add / Edit Inline Form */}
      {formOpen ? (
        <form
          onSubmit={handleSaveDraft}
          className="mt-4 space-y-4 rounded-2xl border border-cyan-400/30 bg-[#151822] p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              {editingEndpointId
                ? 'Edit Custom OpenAI-Compatible Endpoint'
                : 'Connect OpenAI-Compatible Endpoint'}
            </h3>
            <span className="text-[11px] text-zinc-400">
              API keys stay stored locally on this Mac and are never sent back to the browser.
            </span>
          </div>

          {/* Preset Quick Chips */}
          <div className="flex flex-wrap gap-1.5">
            {LLM_ENDPOINT_PRESETS.map((preset) => {
              const selected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    selected
                      ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                      : 'border-white/10 bg-[#11131B] text-zinc-300 hover:border-white/25'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">Display Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ollama Local"
                maxLength={80}
                className="w-full rounded-xl border border-white/10 bg-[#0D0F15] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Base URL (OpenAI /v1)
              </label>
              <input
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setDraftCheck(null);
                }}
                placeholder="http://127.0.0.1:11434/v1"
                maxLength={500}
                className="w-full rounded-xl border border-white/10 bg-[#0D0F15] px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">Model ID</label>
              <div className="flex gap-2">
                <input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setDraftCheck(null);
                  }}
                  placeholder={modelPlaceholder}
                  maxLength={160}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0D0F15] px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={fetchingModels}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                  Fetch Models
                </button>
              </div>
              {fetchedModels.length > 0 ? (
                <select
                  aria-label="Discovered models"
                  value={fetchedModels.includes(model) ? model : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setModel(e.target.value);
                      setDraftCheck(null);
                    }
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D0F15] px-3 py-1.5 font-mono text-xs text-cyan-200 focus:border-cyan-400/60 focus:outline-none"
                >
                  <option value="">Pick from {fetchedModels.length} discovered model(s)...</option>
                  {fetchedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  API Key (optional for Ollama/LM Studio)
                </label>
                {hasExistingKey ? (
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={clearApiKey}
                      onChange={(e) => {
                        setClearApiKey(e.target.checked);
                        setDraftCheck(null);
                      }}
                      className="h-3.5 w-3.5 accent-amber-400"
                    />
                    Clear saved key
                  </label>
                ) : null}
              </div>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  disabled={clearApiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setDraftCheck(null);
                  }}
                  placeholder={
                    clearApiKey
                      ? 'Saved key will be removed on save'
                      : hasExistingKey
                        ? `Saved (${existingKeyHint}) - leave blank to keep`
                        : 'sk-... (leave blank if local server)'
                  }
                  maxLength={500}
                  className="w-full rounded-xl border border-white/10 bg-[#0D0F15] py-2 pl-3 pr-9 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2.5 text-zinc-400 hover:text-zinc-200"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {draftCheck ? (
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${
                draftCheck.ok
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
              }`}
            >
              {draftCheck.message}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleTestDraft}
              disabled={testingDraft}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-60"
            >
              {testingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {testingDraft ? 'Testing...' : 'Test Connection'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-white/10 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingDraft}
                className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-300 disabled:opacity-60"
              >
                {savingDraft ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {editingEndpointId ? 'Save Changes' : 'Save & Activate'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Endpoint Cards */}
      <div className="mt-4 space-y-2.5">
        {endpoints.map((ep) => {
          const isActive = llmState?.activeEndpointId === ep.id;
          const cardCheck = cardChecks[ep.id];
          const okState = cardCheck ? cardCheck.ok : ep.configured;

          return (
            <div
              key={ep.id}
              className={`rounded-xl border p-3.5 transition ${
                isActive ? 'border-cyan-400/50 bg-cyan-500/8' : 'border-white/10 bg-[#151822]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {okState ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <span className="text-sm font-semibold text-zinc-100">{ep.name}</span>
                  <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                    {ep.provider === 'gemini' ? 'Gemini' : 'OpenAI-Compatible'}
                  </span>
                  <span className="rounded-md border border-white/10 bg-[#0D0F15] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    {sourceBadgeLabel(ep.source)}
                  </span>
                  {isActive ? (
                    <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                      Active
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {!isActive ? (
                    <button
                      type="button"
                      onClick={() => handleSelectEndpoint(ep.id)}
                      disabled={selectingId === ep.id}
                      className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      {selectingId === ep.id ? 'Activating...' : 'Set Active'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleTestCard(ep)}
                    disabled={testingId === ep.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                  >
                    {testingId === ep.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {testingId === ep.id ? 'Testing...' : 'Test'}
                  </button>

                  {ep.editable ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditForm(ep)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/10"
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEndpoint(ep)}
                        disabled={deletingId === ep.id}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                          confirmDeleteId === ep.id
                            ? 'border-red-500/50 bg-red-500/20 text-red-200 hover:bg-red-500/30'
                            : 'border-white/10 bg-white/5 text-zinc-400 hover:text-red-300'
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
                        {confirmDeleteId === ep.id ? 'Confirm Delete' : 'Delete'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400">
                <span>
                  Model: <strong className="text-zinc-200">{ep.model || 'Not configured'}</strong>
                </span>
                <span className="truncate max-w-md" title={ep.baseUrl}>
                  URL: <span className="text-zinc-300">{ep.baseUrl}</span>
                </span>
                <span>
                  Key:{' '}
                  <span className="text-zinc-300">
                    {ep.hasApiKey
                      ? (ep.apiKeyHint ?? 'Configured')
                      : ep.provider === 'gemini'
                        ? 'Missing GEMINI_API_KEY'
                        : 'No Key (Local)'}
                  </span>
                </span>
              </div>

              {cardCheck ? (
                <div
                  className={`mt-2.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                    cardCheck.ok
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  <p>{cardCheck.message}</p>
                  {!cardCheck.ok &&
                  ep.editable &&
                  cardCheck.availableModels &&
                  cardCheck.availableModels.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-zinc-300">Try available model:</span>
                      {cardCheck.availableModels.slice(0, 8).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => openEditForm(ep, m)}
                          className="rounded border border-white/15 bg-[#0D0F15] px-2 py-0.5 font-mono text-[10px] text-cyan-200 hover:border-cyan-400/50"
                        >
                          {m}
                        </button>
                      ))}
                      {cardCheck.availableModels.length > 8 ? (
                        <span className="text-[10px] text-zinc-400">
                          +{cardCheck.availableModels.length - 8} more in Edit
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
