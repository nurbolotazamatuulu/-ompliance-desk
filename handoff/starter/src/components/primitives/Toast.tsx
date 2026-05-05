import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUIStore, type ToastTone } from '../../stores/ui';
import { cn } from '../../lib/cn';

const toneClass: Record<ToastTone, { bar: string; icon: typeof Info }> = {
  info: { bar: 'bg-accent', icon: Info },
  success: { bar: 'bg-green', icon: CheckCircle2 },
  warning: { bar: 'bg-yellow', icon: AlertTriangle },
  error: { bar: 'bg-red', icon: XCircle },
};

/**
 * Глобальный toast renderer. Подключается ОДИН раз в App.tsx.
 * Читает useUIStore.toasts (max 5 одновременно — store обрезает overflow).
 * Auto-dismiss настраивается store.pushToast({ ttl: <ms> }) — default 5s.
 */
export default function ToastViewport() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80"
    >
      {toasts.map((t) => {
        const tone = toneClass[t.tone];
        const Icon = tone.icon;
        return (
          <div
            key={t.id}
            role="status"
            className="relative flex items-start gap-2.5 bg-surface border border-border rounded-sm shadow-md overflow-hidden"
          >
            <span className={cn('absolute left-0 top-0 bottom-0 w-1', tone.bar)} aria-hidden="true" />
            <Icon size={14} className="mt-3 ml-3 text-text-dim shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0 py-2.5 pr-2">
              <div className="text-sm text-text">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-2xs text-text-mute">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть уведомление"
              className="m-2 text-text-mute hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm p-0.5"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
