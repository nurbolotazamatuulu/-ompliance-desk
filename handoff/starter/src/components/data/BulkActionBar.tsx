import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import Button from '../primitives/Button';

type Props = {
  /** Кол-во выбранных строк. */
  count: number;
  /** Сбросить выбор. */
  onClear: () => void;
  /** Slot для actions — обычно несколько `<Button variant="secondary" />`. */
  actions: ReactNode;
  /** Hard cap. При count > maxBatch — actions disabled с tooltip-warning. */
  maxBatch?: number;
};

/**
 * Sticky bottom bar при selection ≥ 1. Высота 56px.
 * Spec: при count > 1000 actions disabled с tooltip "Слишком большая партия".
 */
export default function BulkActionBar({ count, onClear, actions, maxBatch = 1000 }: Props) {
  if (count === 0) return null;
  const overCap = count > maxBatch;
  return (
    <div
      role="region"
      aria-label="Действия с выбранными"
      className="sticky bottom-0 z-20 flex items-center gap-3 h-14 px-4 bg-surface border-t border-border-hi shadow-lg"
    >
      <span className="cd-caps">
        {count} выбрано{overCap && ' (макс ' + maxBatch + ')'}
      </span>
      <div className="flex-1 flex items-center gap-2">{actions}</div>
      <Button
        variant="ghost"
        size="sm"
        icon={X}
        onClick={onClear}
        aria-label="Снять выделение"
      >
        Очистить
      </Button>
    </div>
  );
}
