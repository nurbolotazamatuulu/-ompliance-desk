/**
 * TanStack Query wrappers для read-side API.
 *
 * Conventions:
 * - queryKey всегда явно перечисляет params (не объект-spread, чтобы кэш стабильно работал).
 * - useClients имеет split logic placeholderData (Q-frontend-A правка #33):
 *     page-only change   → keepPreviousData (плавная пагинация)
 *     filter/sort change → undefined (skeleton, не stale data)
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import * as api from '../api';
import type { ListClientsParams } from '../../types/api';

export const useClients = (params: ListClientsParams) => {
  // Filter signature — стабильно меняется при любом изменении кроме page.
  const filterSig = JSON.stringify({
    per_page: params.per_page,
    filters: params.filters,
    sort: params.sort,
  });

  // Track previous filterSig — если совпадает, текущее изменение касается только page.
  const prevSigRef = useRef<string>(filterSig);
  const isJustPageChange = prevSigRef.current === filterSig;
  prevSigRef.current = filterSig;

  return useQuery({
    queryKey: ['clients', params.page, params.per_page, params.filters, params.sort],
    queryFn: () => api.listClients(params),
    placeholderData: isJustPageChange ? keepPreviousData : undefined,
  });
};

export const useClient = (id: string | undefined) =>
  useQuery({
    queryKey: ['client', id],
    queryFn: () => api.getClient(id!),
    enabled: !!id,
  });

export const useClientSanctions = (clientId: string | undefined) =>
  useQuery({
    queryKey: ['client', clientId, 'sanctions'],
    queryFn: () => api.listSanctionsForClient(clientId!),
    enabled: !!clientId,
  });

export const useClientTransactions = (clientId: string | undefined) =>
  useQuery({
    queryKey: ['client', clientId, 'transactions'],
    queryFn: () => api.listTransactionsForClient(clientId!),
    enabled: !!clientId,
  });

export const useClientBvs = (clientId: string | undefined) =>
  useQuery({
    queryKey: ['client', clientId, 'bvs'],
    queryFn: () => api.listClientBvs(clientId!),
    enabled: !!clientId,
  });

export const useClientAudit = (clientId: string | undefined) =>
  useQuery({
    queryKey: ['client', clientId, 'audit'],
    queryFn: () => api.listClientAudit(clientId!),
    enabled: !!clientId,
  });

export const useCurrentUser = () =>
  useQuery({
    queryKey: ['current-user'],
    queryFn: api.getCurrentUser,
    staleTime: 5 * 60 * 1000, // 5min — current user редко меняется
  });

export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: api.listUsers,
  });

// ─── Dashboard ──────────────────────────────────────────────────────────

/**
 * Pre-aggregated дашборд-метрики (KPI + risk donut). Server-shaped:
 * один поход к API → готовые числа. См. api.getDashboardSummary +
 * types.DashboardSummary.
 */
export const useDashboardSummary = () =>
  useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: api.getDashboardSummary,
  });

/**
 * Очередь дня для Дашборда — top 12 клиентов отсортированных по SLA asc,
 * с client-side вторичной сортировкой по риску desc.
 *
 * **ЕДИНСТВЕННОЕ явное исключение из глобального `staleTime: Infinity`.**
 * Дашборд горит → нужна live-картина: refetchInterval 60_000 ms.
 * Не копировать pattern в новые features без обоснования.
 */
export const useDashboardQueue = () =>
  useQuery({
    queryKey: ['dashboard', 'queue'],
    queryFn: () =>
      api.listClients({
        page: 1,
        per_page: 12,
        filters: {},
        sort: { field: 'sla', dir: 'asc' },
      }),
    refetchInterval: 60_000,
    select: (page) => {
      // Клиенты без slaDeadline идут в конец; внутри одинаковых SLA-bucket'ов —
      // более рисковые сверху. listClients уже отсортировал по slaDeadline asc,
      // поэтому дополнительно стабильно тащим overdue/no-deadline по краям.
      const items = [...page.items].sort((a, b) => {
        const aHas = a.slaDeadline ? 1 : 0;
        const bHas = b.slaDeadline ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        if (a.slaDeadline && b.slaDeadline && a.slaDeadline !== b.slaDeadline) {
          return a.slaDeadline < b.slaDeadline ? -1 : 1;
        }
        return b.risk.total - a.risk.total;
      });
      return { ...page, items };
    },
  });
