/**
 * URL state parsers via nuqs (Q1 — URL = single source of truth).
 *
 * Conventions:
 * - Repeated keys для multi-value фильтров (status, type, risk, officer):
 *   `?status=in_review&status=awaiting_docs`. Стандарт URLSearchParams.
 * - Default values НЕ в URL: nuqs auto-strip при значении совпадающем с default.
 * - per_page — НЕ в URL, hardcoded const PAGE_SIZE = 50 (см. types/api.ts).
 */

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from 'nuqs';
import type { ClientStatus, ClientType, RiskLevel } from '../types';

const CLIENT_TYPE_VALUES: ClientType[] = ['pf', 'le'];

const CLIENT_STATUS_VALUES: ClientStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'awaiting_docs',
  'approved',
  'rejected',
  'suspended',
  'closed',
];

const RISK_LEVEL_VALUES: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

const SORT_DIR_VALUES: ('asc' | 'desc')[] = ['asc', 'desc'];

/**
 * nuqs parsers для Реестра клиентов.
 *
 * Использование:
 *   import { useQueryStates } from 'nuqs';
 *   import { clientsListSearchParams } from '@/lib/url';
 *   const [params, setParams] = useQueryStates(clientsListSearchParams);
 */
export const clientsListSearchParams = {
  q: parseAsString.withDefault(''),
  type: parseAsArrayOf(parseAsStringEnum(CLIENT_TYPE_VALUES)).withDefault([]),
  status: parseAsArrayOf(parseAsStringEnum<ClientStatus>(CLIENT_STATUS_VALUES)).withDefault([]),
  risk: parseAsArrayOf(parseAsStringEnum<RiskLevel>(RISK_LEVEL_VALUES)).withDefault([]),
  officer: parseAsArrayOf(parseAsString).withDefault([]),
  is_ie: parseAsBoolean.withDefault(false), // Q-frontend-B — «Только ИП»
  from: parseAsString.withDefault(''),
  to: parseAsString.withDefault(''),
  sort: parseAsString.withDefault('createdAt'),
  dir: parseAsStringEnum(SORT_DIR_VALUES).withDefault('desc'),
  page: parseAsInteger.withDefault(1),
};
