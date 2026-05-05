/**
 * Server-shaped API contract (Stage 2 Phase A).
 *
 * Реестр клиентов работает client-side в Stage 2 (mock slices in-memory),
 * но контракт типов уже как у real backend pagination. Migration на real
 * server-side pagination — переписать только internals в lib/api.ts;
 * компоненты не трогаются. См. Q-frontend-A.
 */

import type { ClientStatus, ClientType, RiskLevel } from './client';

// ─── Filter shapes ──────────────────────────────────────────────────────

export interface ClientFilters {
  q?: string; // free-text search (fileNumber, inn, name)
  type?: ClientType[];
  status?: ClientStatus[];
  risk?: RiskLevel[];
  officer?: string[]; // user IDs
  is_ie?: boolean; // Q-frontend-B — «Только ИП» toggle
  from?: string; // ISO date — createdAt >=
  to?: string; // ISO date — createdAt <=
}

export type SortDir = 'asc' | 'desc';

export interface SortSpec {
  field: string; // 'createdAt' | 'risk' | 'fileNumber' | 'name' | 'status' | 'sla' (см. lib/api.ts sortClients)
  dir: SortDir;
}

// ─── Pagination envelope ────────────────────────────────────────────────

export interface Page<T> {
  items: T[];
  total: number; // total matching filters (not just current page)
  page: number; // 1-based
  per_page: number;
}

// ─── List call params ───────────────────────────────────────────────────

export interface ListClientsParams {
  page: number;
  per_page: number;
  filters: ClientFilters;
  sort: SortSpec;
}

/** Hardcoded для Stage 2; Phase 2+ — может уйти в URL для UX-customization. */
export const PAGE_SIZE = 50;

// ─── Dashboard summary (server-shaped) ──────────────────────────────────

/**
 * Pre-aggregated counts для KPI-строки и donut'а Дашборда.
 *
 * Контракт уже как у real backend (один endpoint → готовые числа), даже
 * когда mock внутри агрегирует in-memory. Когда придёт Phase 2 backend
 * (`GET /api/dashboard/summary`) — переписать только internals
 * `getDashboardSummary` в lib/api.ts; компоненты не трогаются.
 */
export interface DashboardSummary {
  in_review_count: number;
  new_today_count: number;
  sla_at_risk_count: number;
  critical_count: number;
  risk_distribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}
