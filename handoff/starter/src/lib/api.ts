/**
 * Fake-API c искусственными задержками 300–800мс.
 * Имитирует реальный бэк, чтобы UI получал loading-состояния и обработку ошибок.
 *
 * Все методы — single-source-of-truth для данных. Компоненты не должны
 * импортировать `mocks/*` напрямую.
 */

import type { Client, SanctionMatch, Transaction, User } from '../types';
import { CLIENTS } from '../mocks/clients';
import { SANCTIONS } from '../mocks/sanctions';
import { TRANSACTIONS } from '../mocks/transactions';
import { CURRENT_USER, USERS } from '../mocks/users';

const delay = (ms?: number): Promise<void> => {
  const t = ms ?? 300 + Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, t));
};

// ─── Clients ────────────────────────────────────────────────────────────

export const listClients = async (): Promise<Client[]> => {
  await delay();
  return CLIENTS;
};

export const getClient = async (id: string): Promise<Client | undefined> => {
  await delay();
  return CLIENTS.find((c) => c.id === id);
};

// ─── Sanctions ──────────────────────────────────────────────────────────

export const listSanctions = async (): Promise<SanctionMatch[]> => {
  await delay();
  return SANCTIONS;
};

export const listSanctionsForClient = async (clientId: string): Promise<SanctionMatch[]> => {
  await delay();
  return SANCTIONS.filter((s) => s.clientId === clientId);
};

// ─── Transactions ───────────────────────────────────────────────────────

export const listTransactions = async (): Promise<Transaction[]> => {
  await delay();
  return TRANSACTIONS;
};

export const listTransactionsForClient = async (clientId: string): Promise<Transaction[]> => {
  await delay();
  return TRANSACTIONS.filter((t) => t.clientId === clientId);
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
