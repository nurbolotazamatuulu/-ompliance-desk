/**
 * Маппинги уровня риска и статуса клиента на UI-токены.
 * Один источник истины для всех мест, где нужны цвета/лейблы.
 */

import type { ClientStatus, KYTFlagCode, RiskLevel, SanctionList } from '../types';

export type Tone = 'neutral' | 'green' | 'yellow' | 'orange' | 'red' | 'blue';

// ─── Уровень риска ──────────────────────────────────────────────────────

export const riskLabel: Record<RiskLevel, string> = {
  low: 'НИЗКИЙ',
  medium: 'СРЕДНИЙ',
  high: 'ВЫСОКИЙ',
  critical: 'КРИТИЧЕСКИЙ',
};

export const riskTone: Record<RiskLevel, Tone> = {
  low: 'green',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
};

/** Классы CSS-токенов для рамки-полосы и текста по уровню риска. */
export const riskColorClass: Record<RiskLevel, { text: string; bg: string; border: string }> = {
  low: { text: 'text-green', bg: 'bg-green-soft', border: 'border-green/30' },
  medium: { text: 'text-yellow', bg: 'bg-yellow-soft', border: 'border-yellow/30' },
  high: { text: 'text-orange', bg: 'bg-orange-soft', border: 'border-orange/30' },
  critical: { text: 'text-red', bg: 'bg-red-soft', border: 'border-red/30' },
};

// ─── Статус клиента ─────────────────────────────────────────────────────

export const clientStatusLabel: Record<ClientStatus, string> = {
  draft: 'ЧЕРНОВИК',
  submitted: 'ПОДАН',
  in_review: 'НА ПРОВЕРКЕ',
  awaiting_docs: 'ОЖИДАЕТ ДОКУМЕНТОВ',
  approved: 'ОДОБРЕН',
  rejected: 'ОТКАЗ',
  suspended: 'ПРИОСТАНОВЛЕН',
  closed: 'ЗАКРЫТ',
};

export const clientStatusTone: Record<ClientStatus, Tone> = {
  draft: 'neutral',
  submitted: 'blue',
  in_review: 'yellow',
  awaiting_docs: 'orange',
  approved: 'green',
  rejected: 'red',
  suspended: 'orange',
  closed: 'neutral',
};

// ─── KYT-флаги ──────────────────────────────────────────────────────────

export const kytFlagLabel: Record<KYTFlagCode, string> = {
  sanctioned_address: 'САНКЦ. АДРЕС',
  mixer: 'МИКШЕР',
  darknet_market: 'DARKNET',
  high_risk_jurisdiction: 'ВЫСОКОРИСК. ЮРИСД.',
  structuring: 'ДРОБЛЕНИЕ',
  velocity: 'VELOCITY',
  amount_threshold: 'ПОРОГ. СУММА',
  new_counterparty: 'НОВЫЙ КОНТРАГЕНТ',
  pep_counterparty: 'PEP',
};

export const kytFlagTone: Record<KYTFlagCode, Tone> = {
  sanctioned_address: 'red',
  mixer: 'red',
  darknet_market: 'red',
  high_risk_jurisdiction: 'orange',
  structuring: 'orange',
  velocity: 'orange',
  amount_threshold: 'yellow',
  new_counterparty: 'yellow',
  pep_counterparty: 'orange',
};

// ─── Санкционные списки ─────────────────────────────────────────────────

export const sanctionListLabel: Record<SanctionList, string> = {
  KG_GSFR: 'ГСФР КР',
  OFAC_SDN: 'OFAC SDN',
  EU_CFSP: 'EU CFSP',
  UN_SC: 'UN SC',
  UK_OFSI: 'UK OFSI',
  INTERPOL: 'INTERPOL',
  INTERNAL: 'СТОП-ЛИСТ',
};
