/**
 * Реестр клиентов (Stage 2 Phase C).
 *
 * Архитектура:
 * - URL state via nuqs (clientsListSearchParams) — single source of truth.
 * - Server-shaped API contract (Page<Client>) — listClients params.
 * - useClients с placeholderData split (page change → keepPreviousData;
 *   filter/sort change → undefined для skeleton).
 * - DataTable virtualization активируется автоматически при rows > 200.
 *
 * Permission: CLIENT_READ.
 */

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryStates } from 'nuqs';
import PageHeader from '../../components/layout/PageHeader';
import DataTable, { type SortState } from '../../components/data/DataTable';
import Button from '../../components/primitives/Button';
import { useClients, useCurrentUser } from '../../lib/hooks';
import { clientsListSearchParams } from '../../lib/url';
import { PAGE_SIZE, type ClientFilters, type ListClientsParams } from '../../types/api';
import type { Client } from '../../types';
import {
  ROLE_PERMISSIONS_MOCK,
  mapLegacyRole,
} from '../../types/rbac';
import ClientsListToolbar, { type ClientsToolbarParams } from './Toolbar';
import ClientsListFilterBar from './FilterBar';
import ClientsListBulkActionBar from './BulkActionBar';
import { clientRowTone, clientsColumns } from './columns';
import LoadingState from './states/LoadingState';
import EmptyClientsState from './states/EmptyClientsState';
import EmptyResultsState from './states/EmptyResultsState';
import ErrorState from './states/ErrorState';
import NoRightsState from '../../components/states/NoRightsState';
import { useState } from 'react';

const periodToFilters = (period: string | null): { from: string; to: string } => {
  if (!period) return { from: '', to: '' };
  const now = new Date();
  const to = now.toISOString();
  const offsets: Record<string, number> = { today: 1, week: 7, month: 30 };
  const days = offsets[period] ?? 0;
  if (!days) return { from: '', to: '' };
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: fromDate.toISOString(), to };
};

export default function ClientsListPage() {
  const navigate = useNavigate();

  // ── Permission gate ─────────────────────────────────────────────────
  const { data: user } = useCurrentUser();
  const hasReadPerm = useMemo(() => {
    if (!user) return true; // optimistic: пока user не загружен — не блокируем UI
    return ROLE_PERMISSIONS_MOCK[mapLegacyRole(user.role)].has('CLIENT_READ');
  }, [user]);

  // ── URL state ───────────────────────────────────────────────────────
  const [urlParams, setUrlParams] = useQueryStates(clientsListSearchParams);

  // Toolbar combines URL state + period (which is не в основной filter set, только UI shortcut).
  const [period, setPeriod] = useState<string | null>(null);

  const toolbarParams: ClientsToolbarParams = {
    q: urlParams.q,
    type: urlParams.type,
    status: urlParams.status,
    risk: urlParams.risk,
    officer: urlParams.officer,
    period,
    is_ie: urlParams.is_ie,
  };

  const updateToolbar = (next: Partial<ClientsToolbarParams>) => {
    if ('period' in next) {
      setPeriod(next.period ?? null);
      const r = periodToFilters(next.period ?? null);
      setUrlParams({ from: r.from, to: r.to, page: 1 });
      return;
    }
    // Любое изменение фильтра сбрасывает page на 1
    setUrlParams({ ...next, page: 1 });
  };

  const resetAllFilters = () => {
    setUrlParams({
      q: '',
      type: [],
      status: [],
      risk: [],
      officer: [],
      from: '',
      to: '',
      is_ie: false,
      page: 1,
    });
    setPeriod(null);
  };

  const hasAnyFilter = useMemo(
    () =>
      !!urlParams.q ||
      urlParams.type.length > 0 ||
      urlParams.status.length > 0 ||
      urlParams.risk.length > 0 ||
      urlParams.officer.length > 0 ||
      !!urlParams.from ||
      !!urlParams.to ||
      urlParams.is_ie,
    [urlParams],
  );

  // ── Build API params ────────────────────────────────────────────────
  const filters: ClientFilters = {
    q: urlParams.q || undefined,
    type: urlParams.type.length ? urlParams.type : undefined,
    status: urlParams.status.length ? urlParams.status : undefined,
    risk: urlParams.risk.length ? urlParams.risk : undefined,
    officer: urlParams.officer.length ? urlParams.officer : undefined,
    is_ie: urlParams.is_ie || undefined,
    from: urlParams.from || undefined,
    to: urlParams.to || undefined,
  };

  const apiParams: ListClientsParams = {
    page: urlParams.page,
    per_page: PAGE_SIZE,
    filters,
    sort: { field: urlParams.sort, dir: urlParams.dir },
  };

  // ── Data fetch ──────────────────────────────────────────────────────
  const query = useClients(apiParams);

  // ── Selection (для BulkActionBar) ───────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Sorting ─────────────────────────────────────────────────────────
  const sortState: SortState = urlParams.sort
    ? { field: urlParams.sort, dir: urlParams.dir }
    : null;

  const handleSortChange = (s: SortState) => {
    if (s) {
      setUrlParams({ sort: s.field, dir: s.dir, page: 1 });
    } else {
      setUrlParams({ sort: 'createdAt', dir: 'desc', page: 1 });
    }
  };

  // ── Permission denied — full-page lock ──────────────────────────────
  if (!hasReadPerm) return <NoRightsState resource="реестру клиентов" />;

  // ── Render ──────────────────────────────────────────────────────────
  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  const isLoading = query.isLoading || query.isPending;
  const isError = query.isError;

  // Three terminal states (only when not loading):
  const showEmptyClients = !isLoading && !isError && total === 0 && !hasAnyFilter;
  const showEmptyResults = !isLoading && !isError && total === 0 && hasAnyFilter;
  const showError = isError;

  const counterText = isLoading
    ? 'Загрузка...'
    : `НАЙДЕНО ${total.toLocaleString('ru-RU')}`;

  return (
    <div className="flex flex-col">
      <PageHeader
        breadcrumb="Реестр"
        title="Клиенты"
        subtitle={total > 0 ? `Всего ${total.toLocaleString('ru-RU')}` : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/onboarding/le/new/1')}>
            Создать клиента
          </Button>
        }
      />

      <ClientsListToolbar params={toolbarParams} onChange={updateToolbar} counter={counterText} />
      <ClientsListFilterBar params={toolbarParams} onChange={updateToolbar} onResetAll={resetAllFilters} />

      <div className="px-4 pt-3 pb-2 flex-1">
        {showError && <ErrorState onRetry={() => query.refetch()} />}
        {showEmptyClients && <EmptyClientsState onCreate={() => navigate('/onboarding/le/new/1')} />}
        {showEmptyResults && <EmptyResultsState onResetFilters={resetAllFilters} />}
        {!showError && !showEmptyClients && !showEmptyResults && (
          <>
            {isLoading ? (
              <LoadingState />
            ) : (
              <DataTable<Client>
                columns={clientsColumns}
                rows={items}
                rowKey={(r) => r.id}
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onRowClick={(r) => navigate(`/clients/${r.id}`)}
                rowTone={clientRowTone}
                density="compact"
                sort={sortState}
                onSortChange={handleSortChange}
              />
            )}
          </>
        )}
      </div>

      <ClientsListBulkActionBar
        selectedIds={selectedIds}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
