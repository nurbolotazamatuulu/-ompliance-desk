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
