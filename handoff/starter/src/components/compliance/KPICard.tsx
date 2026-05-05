import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { Tone } from '../../lib/risk';

const toneBarClass: Record<Tone, string> = {
  neutral: 'bg-text-ghost',
  green: 'bg-green',
  yellow: 'bg-yellow',
  orange: 'bg-orange',
  red: 'bg-red',
  blue: 'bg-accent',
};

const toneTextClass: Record<Tone, string> = {
  neutral: 'text-text',
  green: 'text-green',
  yellow: 'text-yellow',
  orange: 'text-orange',
  red: 'text-red',
  blue: 'text-accent',
};

type Props = {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  tone?: Tone;
  /** Если задан — клик ведёт по этой ссылке (Дашборд → Реестр с фильтром). */
  to?: string;
};

/**
 * KPI-карточка для Дашборда. Лейбл (cd-caps) + значение (3xl mono в цвет
 * tone) + дельта (text-xs mono) + 2px-полоса слева в цвет tone.
 */
export default function KPICard({ label, value, delta, tone = 'neutral', to }: Props) {
  const inner = (
    <div className="relative bg-surface border border-border rounded-sm pl-4 pr-3 py-3 hover:bg-elev transition-colors h-full">
      <span
        className={cn('absolute left-0 top-0 bottom-0 w-0.5', toneBarClass[tone])}
        aria-hidden="true"
      />
      <div className="cd-caps">{label}</div>
      <div className={cn('mt-1 text-3xl cd-mono leading-none', toneTextClass[tone])}>{value}</div>
      {delta && <div className="mt-2 text-2xs cd-mono text-text-mute">{delta}</div>}
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm">
        {inner}
      </Link>
    );
  }
  return inner;
}
