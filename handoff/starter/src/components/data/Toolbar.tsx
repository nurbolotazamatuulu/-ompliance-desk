import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Props = {
  /** Slot для search Input — обычно `<Input leadingIcon={Search} />`. */
  search?: ReactNode;
  /** Slot для select-фильтров — массив `<Select />` блоков. */
  filters?: ReactNode;
  /** Slot для actions справа (кнопки, чекбоксы). */
  actions?: ReactNode;
  /** Текст-счётчик результатов («НАЙДЕНО 17»). cd-caps mono. */
  counter?: string;
  className?: string;
};

/**
 * Sticky toolbar над DataTable. Слот-driven: caller передаёт свои inputs.
 * Высота 44px per components.md spec.
 */
export default function Toolbar({ search, filters, actions, counter, className }: Props) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 h-11 border-b border-border bg-surface sticky top-0 z-10',
        className,
      )}
    >
      {search && <div className="w-72 shrink-0">{search}</div>}
      {filters && <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">{filters}</div>}
      {counter && <span className="cd-caps text-text-mute shrink-0 ml-2">{counter}</span>}
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
