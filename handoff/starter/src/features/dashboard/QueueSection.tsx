import { useMemo } from 'react';
import { CircleCheck, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DataTable, { type Column, type RowTone } from '../../components/data/DataTable';
import Badge from '../../components/primitives/Badge';
import Button from '../../components/primitives/Button';
import EmptyState from '../../components/layout/EmptyState';
import ClientStatusBadge from '../../components/compliance/ClientStatusBadge';
import { riskLabel, riskTone } from '../../lib/risk';
import { formatNumber } from '../../lib/format';
import { cn } from '../../lib/cn';
import { SLA_AT_RISK_HOURS } from '../../lib/api';
import type { Client, User } from '../../types';

type Props = {
  rows: Client[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** userMap собран в DashboardPage один раз (Map<id, User>) — пробрасывается, чтобы не делать .find() per row. */
  userMap: Map<string, User>;
};

const SLA_RED_HOURS = 4;

/** Вычисляет часы до slaDeadline. Возвращает null если deadline нет. */
const slaHoursLeft = (c: Client): number | null => {
  if (!c.slaDeadline) return null;
  const ms = new Date(c.slaDeadline).getTime() - Date.now();
  return ms / (60 * 60 * 1000);
};

/**
 * SLA-ячейка: «2д 4ч» mono + цвет per spec (<12ч orange, <4ч red).
 * Просроченные («-1ч») показываются красным с минусом.
 */
const formatSlaLeft = (hours: number | null): string => {
  if (hours === null) return '—';
  const sign = hours < 0 ? '-' : '';
  const abs = Math.abs(hours);
  const days = Math.floor(abs / 24);
  const hrs = Math.floor(abs % 24);
  if (days > 0) return `${sign}${days}д ${hrs}ч`;
  return `${sign}${hrs}ч`;
};

const slaToneClass = (hours: number | null): string => {
  if (hours === null) return 'text-text-mute';
  if (hours < SLA_RED_HOURS) return 'text-red';
  if (hours < SLA_AT_RISK_HOURS) return 'text-orange';
  return 'text-text-dim';
};

export default function QueueSection({ rows, loading, error, onRetry, userMap }: Props) {
  const navigate = useNavigate();

  const columns: Column<Client>[] = useMemo(
    () => [
      {
        id: 'fileNumber',
        header: '№',
        width: 110,
        cell: (r) => <span className="cd-mono text-text-dim">{r.fileNumber}</span>,
      },
      {
        id: 'name',
        header: 'Клиент',
        cell: (r) => (
          <span className="text-text">
            {r.type === 'pf' ? `${r.lastName} ${r.firstName}` : r.shortName}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Тип',
        width: 60,
        cell: (r) => (
          <Badge tone="neutral">{r.type === 'pf' ? 'ФЛ' : 'ЮЛ'}</Badge>
        ),
      },
      {
        id: 'risk',
        header: 'Риск',
        width: 130,
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            <Badge tone={riskTone[r.risk.level]} dot>
              {riskLabel[r.risk.level]}
            </Badge>
            <span className="cd-mono text-text-dim">{formatNumber(r.risk.total, 0)}</span>
          </span>
        ),
      },
      {
        id: 'sla',
        header: 'SLA',
        width: 90,
        cell: (r) => {
          const left = slaHoursLeft(r);
          return <span className={cn('cd-mono', slaToneClass(left))}>{formatSlaLeft(left)}</span>;
        },
      },
      {
        id: 'status',
        header: 'Статус',
        width: 160,
        cell: (r) => <ClientStatusBadge status={r.status} />,
      },
      {
        id: 'officer',
        header: 'Назначен',
        width: 160,
        cell: (r) => {
          const u = r.assignedOfficerId ? userMap.get(r.assignedOfficerId) : undefined;
          return <span className="text-text-dim">{u?.fullName ?? '—'}</span>;
        },
      },
      {
        id: 'triggers',
        header: 'Триггеры',
        width: 100,
        cell: (r) => {
          // Stage 2: триггеры = override-trigger (если есть). KYT/санкции counters
          // подключатся в Stage 3 через отдельный per-client summary endpoint.
          if (r.risk.overrideTrigger) {
            return <Badge tone="red">{r.risk.overrideTrigger.code}</Badge>;
          }
          return <span className="text-text-mute">—</span>;
        },
      },
    ],
    [userMap],
  );

  const rowTone = (c: Client): RowTone => {
    // Critical всегда побеждает SLA-orange — это spec invariant.
    if (c.risk.level === 'critical') return 'red';
    const hours = slaHoursLeft(c);
    if (hours !== null && hours < SLA_RED_HOURS) return 'orange';
    return undefined;
  };

  if (error) {
    return (
      <div className="border border-border rounded-sm bg-surface p-6 text-center">
        <p className="text-sm text-text-mute mb-3">Не удалось загрузить очередь</p>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <DataTable<Client>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      onRowClick={(r) => navigate(`/clients/${r.id}`)}
      rowTone={rowTone}
      density="compact"
      empty={
        <EmptyState
          icon={CircleCheck}
          title="Очередь пуста"
          description="Все заявки разобраны — отдыхай."
        />
      }
    />
  );
}
