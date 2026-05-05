import { RotateCcw } from 'lucide-react';
import type { RiskScore } from '../../types';
import { riskColorClass, riskLabel, riskTone } from '../../lib/risk';
import { formatDate, formatNumber } from '../../lib/format';
import { cn } from '../../lib/cn';
import Badge from '../primitives/Badge';
import Button from '../primitives/Button';
import RiskMeter from './RiskMeter';

type Props = {
  score: RiskScore;
  onRecalculate?: () => void;
  canRecalculate?: boolean;
  /** Раскрытый режим — для вкладки «Скоринг», 4 категории показаны крупнее. */
  expanded?: boolean;
};

const CATEGORY_LABELS: Array<{ key: keyof RiskScore['categories']; letter: string; label: string }> = [
  { key: 'profile', letter: 'A', label: 'Профиль' },
  { key: 'assets', letter: 'B', label: 'Активы' },
  { key: 'transactions', letter: 'C', label: 'Транзакции' },
  { key: 'control', letter: 'D', label: 'Контроль' },
];

const categoryTone = (val: number) => {
  if (val < 25) return 'green' as const;
  if (val < 50) return 'yellow' as const;
  if (val < 75) return 'orange' as const;
  return 'red' as const;
};

/**
 * Шапка карточки клиента: Итоговый риск + 4 категории + Recalculate.
 * Layout grid `160px repeat(4, 1fr) auto` per spec.
 */
export default function RiskScoreCard({ score, onRecalculate, canRecalculate = false, expanded = false }: Props) {
  const tone = riskTone[score.level];
  const colors = riskColorClass[score.level];

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-sm grid items-center px-4 py-3 gap-4',
        'grid-cols-[160px_repeat(4,1fr)_auto]',
      )}
    >
      {/* Total */}
      <div>
        <div className="cd-caps">Итоговый риск</div>
        <div className={cn('mt-1 cd-mono leading-none', expanded ? 'text-4xl' : 'text-3xl', colors.text)}>
          {formatNumber(score.total)}
        </div>
        <div className="mt-2">
          <Badge tone={tone} dot role="status">
            {riskLabel[score.level]}
          </Badge>
        </div>
      </div>

      {/* 4 categories */}
      {CATEGORY_LABELS.map((c) => {
        const val = score.categories[c.key];
        const t = categoryTone(val);
        return (
          <div key={c.key} className={cn(expanded && 'border-l border-border pl-4')}>
            <div className="cd-caps">
              {c.letter} · {c.label}
            </div>
            <div className={cn('mt-1 cd-mono leading-none', expanded ? 'text-2xl' : 'text-lg')}>
              {formatNumber(val)}
            </div>
            <RiskMeter value={val} tone={t} className="mt-2" />
          </div>
        );
      })}

      {/* Recalculate */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={onRecalculate}
          disabled={!canRecalculate}
        >
          Пересчитать
        </Button>
        <span className="cd-caps">Обновлён {formatDate(score.updatedAt)}</span>
      </div>
    </div>
  );
}
