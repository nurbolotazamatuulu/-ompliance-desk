import { useMemo } from 'react';
import KPICard from '../../components/compliance/KPICard';
import type { DashboardSummary } from '../../types/api';

type Props = {
  summary: DashboardSummary;
};

/**
 * 4 KPI-карточки Дашборда. Каждая clickable → /clients с пред-фильтром.
 * Tone-логика: spec 00-dashboard.md § «KPI-карточки».
 */
export default function KPIRow({ summary }: Props) {
  // ISO date today для KPI «Новые сегодня» — переход в /clients?from=YYYY-MM-DD.
  const todayIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  return (
    <div className="grid grid-cols-4 gap-3">
      <KPICard
        label="В работе"
        value={summary.in_review_count}
        tone="neutral"
        to="/clients?status=in_review"
      />
      <KPICard
        label="Новые сегодня"
        value={summary.new_today_count}
        tone="blue"
        to={`/clients?from=${encodeURIComponent(todayIso)}`}
      />
      <KPICard
        label="SLA-риск"
        value={summary.sla_at_risk_count}
        tone={summary.sla_at_risk_count > 0 ? 'orange' : 'neutral'}
        to="/clients?sort=sla&dir=asc"
      />
      <KPICard
        label="Critical"
        value={summary.critical_count}
        tone={summary.critical_count > 0 ? 'red' : 'neutral'}
        to="/clients?risk=critical"
      />
    </div>
  );
}
