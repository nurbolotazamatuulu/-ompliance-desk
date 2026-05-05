import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export type AccordionSection = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Опциональный indicator справа от title (e.g., status bullet, completion %). */
  indicator?: ReactNode;
  content: ReactNode;
};

type Props = {
  sections: AccordionSection[];
  /** ids секций которые открыты initially. */
  defaultOpen?: string[];
  /** Если true — только одна секция может быть открыта одновременно. */
  exclusive?: boolean;
};

export default function Accordion({ sections, defaultOpen = [], exclusive = false }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(exclusive ? [] : prev);
      if (prev.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {sections.map((s) => {
        const isOpen = open.has(s.id);
        return (
          <div key={s.id} className="border border-border rounded-sm bg-surface">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(s.id)}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-4 py-3 text-left',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                'hover:bg-row-hover transition-colors',
              )}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-text truncate">{s.title}</span>
                {s.subtitle && <span className="cd-caps text-text-mute mt-0.5">{s.subtitle}</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {s.indicator}
                <ChevronDown
                  size={14}
                  className={cn('text-text-mute transition-transform', isOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              </div>
            </button>
            {isOpen && <div className="px-4 py-3 border-t border-border">{s.content}</div>}
          </div>
        );
      })}
    </div>
  );
}
