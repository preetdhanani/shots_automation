import React from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'error';
  undoLabel?: string;
  onUndo?: () => void;
}

export const ToastStack: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5"
    >
      {toasts.map((t) => {
        const borderClass =
          t.tone === 'error'
            ? 'border-red-500/40 bg-[#181214]'
            : t.tone === 'success'
              ? 'border-emerald-500/35 bg-[#111815]'
              : 'border-white/12 bg-[#141720]';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl ${borderClass}`}
          >
            <div className="mt-0.5 shrink-0">
              {t.tone === 'error' ? (
                <XCircle className="h-4 w-4 text-red-400" />
              ) : t.tone === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Info className="h-4 w-4 text-cyan-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-xs text-zinc-400">{t.description}</p>
              ) : null}
              {t.onUndo ? (
                <button
                  type="button"
                  onClick={() => {
                    t.onUndo?.();
                    onDismiss(t.id);
                  }}
                  className="mt-2 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-cyan-300 transition hover:bg-white/15"
                >
                  {t.undoLabel ?? 'Undo'}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
              aria-label="Close notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
