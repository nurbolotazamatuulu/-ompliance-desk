/**
 * Unified design tokens for ComplianceDesk.
 * Single source of truth for status/risk colors and labels.
 * Import from here instead of defining inline per-page.
 */

// ─── Risk levels ──────────────────────────────────────────────────────────────

export const RISK_BADGE: Record<string, string> = {
  low:      'badge-risk-low',
  medium:   'badge-risk-medium',
  high:     'badge-risk-high',
  critical: 'badge-risk-critical',
}

export const RISK_LABEL: Record<string, string> = {
  low:      'Низкий',
  medium:   'Средний',
  high:     'Высокий',
  critical: 'Неприемлемый',
}

export const RISK_DOT: Record<string, string> = {
  low:      'bg-green-500',
  medium:   'bg-yellow-400',
  high:     'bg-orange-400',
  critical: 'bg-red-500',
}

// ─── Onboarding statuses ──────────────────────────────────────────────────────

export const STATUS_BADGE: Record<string, string> = {
  new:                 'badge-neutral',
  documents_requested: 'badge-info',
  under_review:        'badge-warning',
  approved:            'badge-success',
  rejected:            'badge-danger',
  suspended:           'badge-orange',
}

export const STATUS_LABEL: Record<string, string> = {
  new:                 'Новый',
  documents_requested: 'Запрос документов',
  under_review:        'На проверке',
  approved:            'Активен',
  rejected:            'Отказ',
  suspended:           'Приостановлен',
}

// ─── Sanctions match tiers ────────────────────────────────────────────────────

export const TIER_BADGE: Record<string, string> = {
  confirmed: 'badge-danger',
  probable:  'badge-orange',
  possible:  'badge-warning',
}

export const TIER_LABEL: Record<string, string> = {
  confirmed: 'Подтверждено ≥92%',
  probable:  'Вероятное 78–91%',
  possible:  'Возможное 60–77%',
}

export const SANCTIONS_RESULT_BADGE: Record<string, string> = {
  match:          'badge-danger',
  possible_match: 'badge-warning',
  clear:          'badge-success',
}

export const SANCTIONS_RESULT_LABEL: Record<string, string> = {
  match:          'Совпадение',
  possible_match: 'Возможное',
  clear:          'Чисто',
}

// ─── Document statuses ────────────────────────────────────────────────────────

export const DOC_STATUS_BADGE: Record<string, string> = {
  present:   'badge-success',
  missing:   'badge-neutral',
  requested: 'badge-info',
  expired:   'badge-danger',
}

export const DOC_STATUS_LABEL: Record<string, string> = {
  present:   'Получен',
  missing:   'Отсутствует',
  requested: 'Запрошен',
  expired:   'Просрочен',
}

// ─── Client types ─────────────────────────────────────────────────────────────

export const CLIENT_TYPE_LABEL: Record<string, string> = {
  individual: 'Физическое лицо',
  legal:      'Юридическое лицо',
}

export const CLIENT_TYPE_BADGE: Record<string, string> = {
  individual: 'badge-info',
  legal:      'badge-purple',
}

// ─── Transaction statuses ─────────────────────────────────────────────────────

export const TX_STATUS_BADGE: Record<string, string> = {
  new:        'badge-neutral',
  reviewing:  'badge-info',
  reported:   'badge-orange',
  dismissed:  'badge-success',
}

export const TX_STATUS_LABEL: Record<string, string> = {
  new:        'Новая',
  reviewing:  'На проверке',
  reported:   'Сообщено',
  dismissed:  'Отклонена',
}

// ─── Officer decisions (sanctions) ───────────────────────────────────────────

export const OFFICER_DECISION_BADGE: Record<string, string> = {
  confirmed:      'badge-danger',
  false_positive: 'badge-success',
}

export const OFFICER_DECISION_LABEL: Record<string, string> = {
  confirmed:      'Подтверждено офицером',
  false_positive: 'Ложное срабатывание',
}

// ─── PEP types ────────────────────────────────────────────────────────────────

export const PEP_TYPE_BADGE: Record<string, string> = {
  PEP:       'badge-danger',
  IPEP:      'badge-orange',
  FAMILY:    'badge-warning',
  ASSOCIATE: 'badge-purple',
}

export const PEP_TYPE_LABEL: Record<string, string> = {
  PEP:       'ПДЛ',
  IPEP:      'ИПДС',
  FAMILY:    'Член семьи',
  ASSOCIATE: 'Близкое лицо',
}

// ─── Helper: expiry color ─────────────────────────────────────────────────────

export function expiryBadge(daysLeft: number | null): string {
  if (daysLeft === null) return 'badge-neutral'
  if (daysLeft < 0)   return 'badge-danger'
  if (daysLeft <= 7)  return 'badge-danger'
  if (daysLeft <= 30) return 'badge-orange'
  if (daysLeft <= 90) return 'badge-warning'
  return 'badge-success'
}

export function riskScoreBadge(score: number | null): string {
  if (score === null) return 'badge-neutral'
  if (score <= 25)  return 'badge-risk-low'
  if (score <= 50)  return 'badge-risk-medium'
  if (score <= 75)  return 'badge-risk-high'
  return 'badge-risk-critical'
}
