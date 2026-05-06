/**
 * Side-panel: счётчики санкционных совпадений по клиенту.
 *
 * SanctionMatchStatus имеет 5 значений:
 *   open    = new + in_review                      (нерешённые, требуют внимания)
 *   matched = true_match                           (подтверждено true)
 *   cleared = false_positive + discharged          (закрыты)
 *
 * Empty state — "Совпадений нет" с green dot. Loading state — skeleton.
 */

import { Shield } from 'lucide-react';
import type { SanctionMatch } from '../../../types';
import Skeleton from '../../../components/primitives/Skeleton';

type Props = {
  matches: SanctionMatch[] | undefined;
  isLoading: boolean;
};

export default function SanctionsSummaryCard({ matches, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-sm p-3">
        <div className="flex items-center gap-2 text-text-dim">
          <Shield size={14} aria-hidden="true" />
          <span className="cd-caps">Санкции</span>
        </div>
        <Skeleton className="h-12 mt-3" />
      </div>
    );
  }

  const list = matches ?? [];
  const openCount = list.filter((m) => m.status === 'new' || m.status === 'in_review').length;
  const matchedCount = list.filter((m) => m.status === 'true_match').length;
  const clearedCount = list.filter(
    (m) => m.status === 'false_positive' || m.status === 'discharged',
  ).length;
  const total = list.length;

  return (
    <div className="bg-surface border border-border rounded-sm p-3">
      <div className="flex items-center gap-2 text-text-dim">
        <Shield size={14} aria-hidden="true" />
        <span className="cd-caps">Санкции</span>
      </div>

      {total === 0 ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text">
          <span className="inline-block w-1.5 h-1.5 rounded-pill bg-green" aria-hidden="true" />
          Совпадений нет
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Открытые" value={openCount} tone={openCount > 0 ? 'red' : 'neutral'} />
          <Stat label="Истинные" value={matchedCount} tone={matchedCount > 0 ? 'orange' : 'neutral'} />
          <Stat label="Закрытые" value={clearedCount} tone="neutral" />
        </div>
      )}
    </div>
  );
}

type StatProps = { label: string; value: number; tone: 'red' | 'orange' | 'neutral' };

function Stat({ label, value, tone }: StatProps) {
  const colorClass =
    tone === 'red' ? 'text-red' : tone === 'orange' ? 'text-orange' : 'text-text';
  return (
    <div>
      <div className={`cd-mono text-lg leading-none ${colorClass}`}>{value}</div>
      <div className="cd-caps mt-1">{label}</div>
    </div>
  );
}
