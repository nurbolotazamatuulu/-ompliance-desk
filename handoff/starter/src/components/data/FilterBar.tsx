import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  chips: FilterChip[];
  onResetAll?: () => void;
  className?: string;
};

/**
 * Chip-список активных фильтров. Каждый chip — X для снятия одного,
 * «Сбросить все» появляется при ≥2.
 */
export default function FilterBar({ chips, onResetAll, className }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap px-4 py-2 bg-surface border-b border-border', className)}>
      {chips.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-sm bg-accent-bg border border-accent-border text-2xs text-text"
        >
          <span>{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Убрать фильтр: ${c.label}`}
            className="text-text-mute hover:text-text"
          >
            <X size={10} aria-hidden="true" />
          </button>
        </span>
      ))}
      {chips.length >= 2 && onResetAll && (
        <button
          type="button"
          onClick={onResetAll}
          className="cd-caps text-text-mute hover:text-text ml-1"
        >
          Сбросить все
        </button>
      )}
    </div>
  );
}
