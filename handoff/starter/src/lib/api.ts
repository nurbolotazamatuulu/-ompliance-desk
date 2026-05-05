/**
 * Fake-API c искусственными задержками 300–800мс.
 * Имитирует реальный бэк, чтобы UI получал loading-состояния и обработку ошибок.
 *
 * Stage 2 Phase A: list-функции переведены на server-shaped contract
 * (Page<T> envelope), mock-internals делают filter → sort → slice
 * по in-memory CLIENTS массиву. Migration на real server-side
 * pagination — переписать только internals; компоненты не трогаются.
 * См. Q-frontend-A.
 *
 * Все методы — single-source-of-truth для данных. Компоненты не должны
 * импортировать `mocks/*` напрямую.
 */

import type {
  AuditEvent,
  BeneficialOwner,
  Client,
  ClientStatus,
  PfClient,
  SanctionMatch,
  Transaction,
  User,
} from '../types';
import type { ListClientsParams, Page, SortSpec } from '../types/api';
import { CLIENTS } from '../mocks/clients';
import { SANCTIONS } from '../mocks/sanctions';
import { TRANSACTIONS } from '../mocks/transactions';
import { CURRENT_USER, USERS } from '../mocks/users';
import type { ClientFilters } from '../types/api';

const delay = (ms?: number): Promise<void> => {
  const t = ms ?? 300 + Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, t));
};

// ─── Filter / sort helpers (in-memory) ──────────────────────────────────

const matchesFilters = (c: Client, filters: ClientFilters): boolean => {
  if (filters.type?.length && !filters.type.includes(c.type)) return false;
  if (filters.status?.length && !filters.status.includes(c.status)) return false;
  if (filters.risk?.length && !filters.risk.includes(c.risk.level)) return false;
  if (filters.officer?.length) {
    if (!c.assignedOfficerId || !filters.officer.includes(c.assignedOfficerId)) return false;
  }
  if (filters.is_ie) {
    // Q-frontend-B — «Только ИП». Stage 2 mock: schema поле появится в Phase E2a.
    // Сейчас фильтр работает на флаге, который мокается per-row при генерации
    // (см. mocks/clients.ts — TODO Phase E2a добавить is_individual_entrepreneur).
    if (c.type !== 'pf') return false;
    const pf = c as PfClient & { is_individual_entrepreneur?: boolean };
    if (!pf.is_individual_entrepreneur) return false;
  }
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const haystack =
      c.type === 'pf'
        ? `${c.lastName} ${c.firstName} ${c.middleName ?? ''} ${c.inn} ${c.fileNumber}`
        : `${c.fullName} ${c.shortName} ${c.inn} ${c.fileNumber}`;
    if (!haystack.toLowerCase().includes(q)) return false;
  }
  if (filters.from && c.createdAt < filters.from) return false;
  if (filters.to && c.createdAt > filters.to) return false;
  return true;
};

const sortClientsBy = (items: Client[], sort: SortSpec): Client[] => {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    switch (sort.field) {
      case 'risk':
        av = a.risk.total;
        bv = b.risk.total;
        break;
      case 'fileNumber':
        av = a.fileNumber;
        bv = b.fileNumber;
        break;
      case 'name':
        av = a.type === 'pf' ? `${a.lastName} ${a.firstName}` : a.fullName;
        bv = b.type === 'pf' ? `${b.lastName} ${b.firstName}` : b.fullName;
        break;
      case 'status':
        av = a.status;
        bv = b.status;
        break;
      case 'sla':
        av = a.slaDeadline ?? '';
        bv = b.slaDeadline ?? '';
        break;
      case 'createdAt':
      default:
        av = a.createdAt;
        bv = b.createdAt;
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
};

// ─── Clients ────────────────────────────────────────────────────────────

export const listClients = async (params: ListClientsParams): Promise<Page<Client>> => {
  await delay();
  const filtered = CLIENTS.filter((c) => matchesFilters(c, params.filters));
  const sorted = sortClientsBy(filtered, params.sort);
  const start = (params.page - 1) * params.per_page;
  const items = sorted.slice(start, start + params.per_page);
  return {
    items,
    total: filtered.length,
    page: params.page,
    per_page: params.per_page,
  };
};

export const getClient = async (id: string): Promise<Client | undefined> => {
  await delay();
  return CLIENTS.find((c) => c.id === id);
};

// ─── Sanctions ──────────────────────────────────────────────────────────

export const listSanctions = async (params: {
  page: number;
  per_page: number;
}): Promise<Page<SanctionMatch>> => {
  await delay();
  const start = (params.page - 1) * params.per_page;
  const items = SANCTIONS.slice(start, start + params.per_page);
  return {
    items,
    total: SANCTIONS.length,
    page: params.page,
    per_page: params.per_page,
  };
};

export const listSanctionsForClient = async (clientId: string): Promise<SanctionMatch[]> => {
  await delay();
  return SANCTIONS.filter((s) => s.clientId === clientId);
};

// ─── Transactions ───────────────────────────────────────────────────────

export const listTransactions = async (params: {
  page: number;
  per_page: number;
}): Promise<Page<Transaction>> => {
  await delay();
  const start = (params.page - 1) * params.per_page;
  const items = TRANSACTIONS.slice(start, start + params.per_page);
  return {
    items,
    total: TRANSACTIONS.length,
    page: params.page,
    per_page: params.per_page,
  };
};

export const listTransactionsForClient = async (clientId: string): Promise<Transaction[]> => {
  await delay();
  return TRANSACTIONS.filter((t) => t.clientId === clientId);
};

// ─── BVs (Q-frontend-D) ─────────────────────────────────────────────────

/**
 * Бенефициарные владельцы клиента. Stage 2 mock — пустой массив;
 * полная mock data + edit/create через drawer — Phase E2c.
 */
export const listClientBvs = async (_clientId: string): Promise<BeneficialOwner[]> => {
  await delay();
  return [];
};

// ─── Audit (per-client history tab placeholder) ─────────────────────────

export const listClientAudit = async (_clientId: string): Promise<AuditEvent[]> => {
  await delay();
  return [];
};

// ─── Users ──────────────────────────────────────────────────────────────

export const listUsers = async (): Promise<User[]> => {
  await delay();
  return USERS;
};

export const getCurrentUser = async (): Promise<User> => {
  await delay(200);
  return CURRENT_USER;
};

// ─── Mutations (Stage 2 stubs — mock в memory, real persistence Phase 2) ─

export const updateClientStatus = async (params: {
  clientId: string;
  status: ClientStatus;
  reason: string;
}): Promise<Client> => {
  await delay();
  const c = CLIENTS.find((x) => x.id === params.clientId);
  if (!c) throw new Error(`Client not found: ${params.clientId}`);
  // Mock side effect — обновляем in-memory массив (TS 'as any' для безопасности read-only типов).
  (c as { status: ClientStatus }).status = params.status;
  return c;
};

export const assignOfficer = async (params: {
  clientId: string;
  officerId: string | null;
}): Promise<Client> => {
  await delay();
  const c = CLIENTS.find((x) => x.id === params.clientId);
  if (!c) throw new Error(`Client not found: ${params.clientId}`);
  (c as { assignedOfficerId?: string }).assignedOfficerId = params.officerId ?? undefined;
  return c;
};

export const resolveSanctionMatch = async (params: {
  matchId: string;
  resolution: 'true_match' | 'false_positive';
  justification?: string;
}): Promise<SanctionMatch> => {
  await delay();
  const m = SANCTIONS.find((x) => x.id === params.matchId);
  if (!m) throw new Error(`Sanction match not found: ${params.matchId}`);
  (m as { status: SanctionMatch['status'] }).status = params.resolution;
  return m;
};

export const upsertBv = async (params: {
  clientId: string;
  bv: BeneficialOwner;
}): Promise<BeneficialOwner> => {
  await delay();
  // Stage 2 stub — full BV CRUD в Phase E2c.
  return params.bv;
};
