import { cn } from '../../lib/cn';
import type { Tone } from '../../lib/risk';

const toneBgClass: Record<Tone, string> = {
  neutral: 'bg-text-mute',
  green: 'bg-green',
  yellow: 'bg-yellow',
  orange: 'bg-orange',
  red: 'bg-red',
  blue: 'bg-accent',
};

type Props = {
  /** 0..100. */
  value: number;
  tone?: Tone;
  className?: string;
};

/**
 * Тонкая 2px полоса для категорий риска. Используется в RiskScoreCard и Дашборде.
 */
export default function RiskMeter({ value, tone = 'neutral', className }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-0.5 bg-elev rounded-pill overflow-hidden', className)}
    >
      <div className={cn('absolute inset-y-0 left-0', toneBgClass[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
