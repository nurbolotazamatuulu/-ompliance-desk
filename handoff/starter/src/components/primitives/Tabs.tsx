import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Tab = {
  id: string;
  label: string;
  badge?: ReactNode;
  alert?: boolean;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
};

export default function Tabs({ tabs, active, onChange, size = 'md' }: Props) {
  const heightClass = size === 'sm' ? 'h-8' : 'h-10';
  return (
    <div role="tablist" className={cn('flex items-end gap-1 border-b border-border', heightClass)}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative inline-flex items-center gap-2 px-3 -mb-px h-full text-sm transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
              isActive
                ? 'text-text font-semibold border-b-2 border-accent'
                : 'text-text-dim hover:text-text border-b-2 border-transparent',
            )}
          >
            <span>{t.label}</span>
            {t.badge && <span>{t.badge}</span>}
            {t.alert && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-pill bg-red"
                aria-label="Требует внимания"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
