/**
 * Phase E1 — каркас карточки клиента.
 *
 * Layout (опция A после reconfirm):
 *   PageHeader (breadcrumb / title / INN+Создан)
 *   RiskScoreCard горизонтально (Phase B компонент, expanded=false)
 *   Grid 2 col [1fr_360px]:
 *     left  — TabsBar (sticky) + <Outlet /> (8 placeholder tabs в E1)
 *     right — sticky side-panels stack:
 *               OverrideTriggerPanel (conditional: client.risk.overrideTrigger)
 *               ClientHeaderCard
 *               SanctionsSummaryCard
 *               SLABreakdownCard
 *               AssignmentCard
 *
 * Permission gate: CLIENT_READ — full-page NoRightsState если нет.
 * CLIENT_WRITE — gates [Изменить] кнопку в AssignmentCard (через
 * Tooltip + disabled).
 */

import { useMemo } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import RiskScoreCard from '../../components/compliance/RiskScoreCard';
import NoRightsState from '../../components/states/NoRightsState';
import {
  useClient,
  useClientSanctions,
  useCurrentUser,
  useUsers,
} from '../../lib/hooks';
import { ROLE_PERMISSIONS_MOCK, mapLegacyRole } from '../../types/rbac';
import { formatDate, formatINN } from '../../lib/format';
import type { Client } from '../../types';
import TabsBar, { type ClientCardTabId } from './TabsBar';
import ClientHeaderCard from './side-panels/ClientHeaderCard';
import SanctionsSummaryCard from './side-panels/SanctionsSummaryCard';
import SLABreakdownCard from './side-panels/SLABreakdownCard';
import AssignmentCard from './side-panels/AssignmentCard';
import OverrideTriggerPanel from './side-panels/OverrideTriggerPanel';
import LoadingState from './states/LoadingState';
import ErrorState from './states/ErrorState';
import NotFoundState from './states/NotFoundState';

const displayName = (c: Client): string =>
  c.type === 'pf'
    ? [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ')
    : c.fullName;

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>();

  const { data: currentUser } = useCurrentUser();
  const clientQuery = useClient(id);
  const sanctionsQuery = useClientSanctions(id);
  const { data: users } = useUsers();

  const hasReadPerm = useMemo(() => {
    if (!currentUser) return true; // optimistic — не блокируем UI до загрузки user
    return ROLE_PERMISSIONS_MOCK[mapLegacyRole(currentUser.role)].has('CLIENT_READ');
  }, [currentUser]);

  // Вкладки с alert-индикатором (нерешённые санкции).
  const alertTabs = useMemo<Set<ClientCardTabId>>(() => {
    const s = new Set<ClientCardTabId>();
    const list = sanctionsQuery.data ?? [];
    if (list.some((m) => m.status === 'new' || m.status === 'in_review')) {
      s.add('sanctions');
    }
    return s;
  }, [sanctionsQuery.data]);

  // ── Permission gate ─────────────────────────────────────────────────
  if (!hasReadPerm) return <NoRightsState resource="карточке клиента" />;

  // ── Loading / error / not-found ─────────────────────────────────────
  if (clientQuery.isLoading || clientQuery.isPending) return <LoadingState />;
  if (clientQuery.isError) return <ErrorState onRetry={() => clientQuery.refetch()} />;
  if (!clientQuery.data) return <NotFoundState />;

  const client = clientQuery.data;
  const officer = users?.find((u) => u.id === client.assignedOfficerId);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <PageHeader
        breadcrumb={`Клиенты / ${client.fileNumber}`}
        title={displayName(client)}
        subtitle={
          <>
            ИНН {formatINN(client.inn)} · Создан {formatDate(client.createdAt)}
          </>
        }
      />

      <div className="px-4 pt-3">
        <RiskScoreCard score={client.risk} expanded={false} />
      </div>

      <div className="px-4 py-3 grid gap-4 grid-cols-1 lg:grid-cols-[1fr_360px]">
        <main className="min-w-0">
          <TabsBar alertTabs={alertTabs} />
          <div className="pt-4">
            <Outlet />
          </div>
        </main>

        <aside className="lg:sticky lg:top-3 lg:self-start space-y-3">
          {client.risk.overrideTrigger && (
            <OverrideTriggerPanel trigger={client.risk.overrideTrigger} />
          )}
          <ClientHeaderCard client={client} />
          <SanctionsSummaryCard
            matches={sanctionsQuery.data}
            isLoading={sanctionsQuery.isLoading || sanctionsQuery.isPending}
          />
          <SLABreakdownCard slaDeadline={client.slaDeadline} />
          <AssignmentCard client={client} officer={officer} currentUser={currentUser} />
        </aside>
      </div>
    </div>
  );
}
