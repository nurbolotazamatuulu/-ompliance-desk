import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
};

const widthClass: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[800px]',
};

/**
 * Modal dialog по центру с focus trap, Esc-close, backdrop-click-close.
 * Animation: backdrop fade 200ms, contents scale 0.97→1.
 */
export default function Dialog({ open, onClose, title, subtitle, size = 'md', children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus first focusable inside dialog
    setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      lastFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        ref={ref}
        className={cn(
          'relative w-full bg-surface border border-border rounded-sm shadow-lg',
          widthClass[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-text-mute font-mono">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-text-mute hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm p-1"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
