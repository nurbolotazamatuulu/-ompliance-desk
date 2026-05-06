/**
 * Side-panel #2 (или #1 без override-trigger): шапка с идентификацией.
 *
 * Содержание: type-icon (User/Building) + ФИО/fullName + fileNumber
 * mono + INN mono + ClientStatusBadge + ИП-badge (если pf и
 * is_individual_entrepreneur=true, Q-frontend-B).
 *
 * Read-only, никакой permission-проверки.
 */

import { Building2, User } from 'lucide-react';
import type { Client, PfClient } from '../../../types';
import { formatINN } from '../../../lib/format';
import Badge from '../../../components/primitives/Badge';
import ClientStatusBadge from '../../../components/compliance/ClientStatusBadge';

type Props = { client: Client };

const isPfIE = (c: Client): boolean => {
  if (c.type !== 'pf') return false;
  // Q-frontend-B — поле появится в схеме Phase E2a; сейчас mock через приведение
  const pf = c as PfClient & { is_individual_entrepreneur?: boolean };
  return !!pf.is_individual_entrepreneur;
};

const displayName = (c: Client): string =>
  c.type === 'pf'
    ? [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ')
    : c.shortName;

export default function ClientHeaderCard({ client }: Props) {
  const Icon = client.type === 'pf' ? User : Building2;
  return (
    <div className="bg-surface border border-border rounded-sm p-3">
      <div className="flex items-start gap-2">
        <Icon size={18} className="text-text-dim mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text leading-tight truncate">
            {displayName(client)}
          </div>
          <div className="mt-1 cd-mono text-2xs text-text-dim">{client.fileNumber}</div>
          <div className="cd-mono text-2xs text-text-dim">ИНН {formatINN(client.inn)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={client.type === 'pf' ? 'blue' : 'neutral'}>
          {client.type === 'pf' ? 'ФЛ' : 'ЮЛ'}
        </Badge>
        {isPfIE(client) && <Badge tone="blue">ИП</Badge>}
        <ClientStatusBadge status={client.status} />
      </div>
    </div>
  );
}
