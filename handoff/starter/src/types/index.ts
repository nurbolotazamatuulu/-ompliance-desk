/**
 * ComplianceDesk · Доменная модель.
 * Источник истины — handoff/spec/data-model.ts.
 *
 * Этот index.ts держит общие примитивы и пользователей/конфиги, а специфичные
 * домены (клиент, документ, санкция, транзакция, УБО, аудит) — в отдельных
 * файлах. Импортируйте всегда через `@/types` (или относительный './types').
 */

// ─── Общие примитивы ─────────────────────────────────────────────────────

export type ID = string;
export type ISODate = string; // "2026-04-28T14:32:11Z"
export type DateOnly = string; // "1985-03-22"
export type CountryCode = string; // ISO-3166-1 alpha-2: "KG", "RU"
export type CurrencyCode = string; // ISO-4217: "KGS", "USD", "USDT"
export type ChainAddress = string; // "0xab12...c4f0" or "tb1q..."

export type Locale = 'ru'; // на старте только русский

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface Address {
  postalCode?: string;
  country: CountryCode;
  region: string;
  city: string;
  street: string;
  building: string;
  apartment?: string;
  raw?: string; // полная строка
}

// ─── Пользователи / Роли ─────────────────────────────────────────────────

export type Role =
  | 'compliance_officer'
  | 'compliance_lead'
  | 'operator'
  | 'admin'
  | 'auditor'
  | 'client';

export interface Permission {
  resource: string; // "clients", "transactions", "admin.users"
  actions: ('view' | 'create' | 'edit' | 'delete' | 'approve' | 'override')[];
}

export interface User {
  id: ID;
  fullName: string;
  email: string;
  phone?: string;
  role: Role;
  permissions: Permission[];
  active: boolean;
  lastLoginAt?: ISODate;
  createdAt: ISODate;
}

// ─── Скоринг — конфигурация ──────────────────────────────────────────────

export interface ScoringRule {
  id: ID;
  code: string; // "C4.5"
  category: 'profile' | 'assets' | 'transactions' | 'control';
  title: string;
  description: string;
  weight: number; // вес в категории
  triggerOverride: boolean; // поднимает до critical
  active: boolean;
}

// ─── Wizard / Онбординг ──────────────────────────────────────────────────

export interface WizardState<TData> {
  step: number;
  totalSteps: number;
  data: Partial<TData>;
  errors: Record<string, string>;
  status: 'editing' | 'submitting' | 'submitted';
}

// ─── Re-exports ──────────────────────────────────────────────────────────

export * from './client';
export * from './document';
export * from './sanction';
export * from './transaction';
export * from './ubo';
export * from './audit';
