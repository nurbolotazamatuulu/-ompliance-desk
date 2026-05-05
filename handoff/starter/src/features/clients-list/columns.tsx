import type { Client, PfClient } from '../../types';
import type { Column, RowTone } from '../../components/data/DataTable';
import { formatINN, formatDate, formatNumber, formatRelative } from '../../lib/format';
import { riskColorClass, riskTone } from '../../lib/risk';
import Badge from '../../components/primitives/Badge';
import ClientStatusBadge from '../../components/compliance/ClientStatusBadge';
import { CURRENT_USER, USERS } from '../../mocks/users';

const findOfficerName = (officerId: string | undefined): string => {
  if (!officerId) return '—';
  const u = USERS.find((x) => x.id === officerId);
  return u?.fullName ?? officerId;
};

const isPfIE = (c: Client): boolean => {
  if (c.type !== 'pf') return false;
  const pf = c as PfClient & { is_individual_entrepreneur?: boolean };
  return !!pf.is_individual_entrepreneur;
};

/** rowTone fn: подсветка строки фоном по уровню риска или SLA. */
export const clientRowTone = (c: Client): RowTone => {
  if (c.risk.level === 'critical') return 'red';
  if (c.risk.level === 'high') return 'orange';
  return undefined;
};

export const clientsColumns: Column<Client>[] = [
  {
    id: 'fileNumber',
    header: '№ Дела',
    cell: (c) => <span className="cd-mono text-2xs">{c.fileNumber}</span>,
    sortable: true,
    width: 130,
  },
  {
    id: 'name',
    header: 'Клиент',
    cell: (c) => (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-text truncate">
          {c.type === 'pf' ? `${c.lastName} ${c.firstName}` : c.shortName}
        </span>
      </div>
    ),
    sortable: true,
  },
  {
    id: 'type',
    header: 'Тип',
    cell: (c) => (
      <div className="flex items-center gap-1.5">
        <Badge tone={c.type === 'pf' ? 'blue' : 'neutral'}>
          {c.type === 'pf' ? 'ФЛ' : 'ЮЛ'}
        </Badge>
        {isPfIE(c) && <Badge tone="blue">ИП</Badge>}
      </div>
    ),
    width: 100,
  },
  {
    id: 'inn',
    header: 'ИНН',
    cell: (c) => <span className="cd-mono text-2xs text-text-dim">{formatINN(c.inn)}</span>,
    width: 160,
  },
  {
    id: 'risk',
    header: 'Риск',
    cell: (c) => {
      const colors = riskColorClass[c.risk.level];
      return (
        <div className="flex items-center gap-2 justify-end">
          <span className={`cd-mono text-sm ${colors.text}`}>{formatNumber(c.risk.total)}</span>
          <Badge tone={riskTone[c.risk.level]} dot>
            {c.risk.level === 'low'
              ? 'НИЗ'
              : c.risk.level === 'medium'
              ? 'СРЕД'
              : c.risk.level === 'high'
              ? 'ВЫС'
              : 'КРИТ'}
          </Badge>
        </div>
      );
    },
    sortable: true,
    align: 'right',
    width: 130,
  },
  {
    id: 'status',
    header: 'Статус',
    cell: (c) => <ClientStatusBadge status={c.status} />,
    sortable: true,
    width: 160,
  },
  {
    id: 'officer',
    header: 'Офицер',
    cell: (c) => (
      <span className="text-2xs text-text-dim truncate">
        {findOfficerName(c.assignedOfficerId ?? CURRENT_USER.id)}
      </span>
    ),
    width: 140,
  },
  {
    id: 'sla',
    header: 'SLA',
    cell: (c) =>
      c.slaDeadline ? (
        <span className="cd-mono text-2xs text-text-dim">{formatRelative(c.slaDeadline)}</span>
      ) : (
        <span className="text-2xs text-text-ghost">—</span>
      ),
    sortable: true,
    width: 110,
    align: 'right',
  },
  {
    id: 'createdAt',
    header: 'Создан',
    cell: (c) => <span className="cd-mono text-2xs text-text-dim">{formatDate(c.createdAt)}</span>,
    sortable: true,
    width: 100,
    align: 'right',
  },
  {
    id: 'actions',
    header: '',
    cell: () => <span className="cd-caps text-text-ghost">…</span>,
    width: 40,
    align: 'center',
  },
];
