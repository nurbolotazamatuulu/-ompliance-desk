/**
 * Side-panel: SLA-дедлайн + tone + placeholder для истории нарушений.
 *
 * Logic:
 *   нет slaDeadline    → tone neutral, "Дедлайн не задан"
 *   просрочен          → tone red, "просрочен на N"
 *   < SLA_AT_RISK_HOURS → tone red, "через N"
 *   12-48ч             → tone orange, "через N"
 *   > 48ч              → tone green, "через N"
 *
 * SLA_AT_RISK_HOURS = 12ч — placeholder из Q-frontend-O. Reuse constant
 * из api.ts чтобы при confirm с АФГ + ГСФР reg правка была в одном месте.
 *
 * История нарушений — Stage 2 placeholder (1-line stub в UI).
 */

import { Clock } from 'lucide-react';
import { SLA_AT_RISK_HOURS } from '../../../lib/api';
import { formatDateTime, formatRelative } from '../../../lib/format';
import { cn } from '../../../lib/cn';

type Props = { slaDeadline: string | undefined };

type Tone = 'red' | 'orange' | 'green' | 'neutral';

const toneClass: Record<Tone, string> = {
  red: 'text-red',
  orange: 'text-orange',
  green: 'text-green',
  neutral: 'text-text-dim',
};

const dotClass: Record<Tone, string> = {
  red: 'bg-red',
  orange: 'bg-orange',
  green: 'bg-green',
  neutral: 'bg-text-ghost',
};

export default function SLABreakdownCard({ slaDeadline }: Props) {
  let tone: Tone = 'neutral';
  let label = 'Дедлайн не задан';

  if (slaDeadline) {
    const diffH = (new Date(slaDeadline).getTime() - Date.now()) / (1000 * 60 * 60);
    if (diffH < 0) tone = 'red';
    else if (diffH < SLA_AT_RISK_HOURS) tone = 'red';
    else if (diffH < 48) tone = 'orange';
    else tone = 'green';
    label = formatRelative(slaDeadline);
  }

  return (
    <div className="bg-surface border border-border rounded-sm p-3">
      <div className="flex items-center gap-2 text-text-dim">
        <Clock size={14} aria-hidden="true" />
        <span className="cd-caps">SLA</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn('inline-block w-1.5 h-1.5 rounded-pill', dotClass[tone])}
          aria-hidden="true"
        />
        <span className={cn('text-sm', toneClass[tone])}>{label}</span>
      </div>
      {slaDeadline && (
        <div className="mt-1 cd-mono text-2xs text-text-dim">{formatDateTime(slaDeadline)}</div>
      )}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="cd-caps text-text-ghost">История нарушений (в разработке)</div>
      </div>
    </div>
  );
}
