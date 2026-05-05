/**
 * ApprovalDialog — унифицированный pessimistic mutation dialog с full form.
 *
 * 4 kind'а (discriminated union):
 *   - risk_override         (RISK_OVERRIDE permission)
 *   - regulatory_exemption  (RISK_OVERRIDE permission)
 *   - pep_approval          (PEP_APPROVE permission, более строгий)
 *   - sanction_resolve      (CLIENT_WRITE)
 *
 * Form fields (per Phase E3 plan правка #3):
 *   - scope: 'entire_client' | 'single_category' | 'specific_rule'
 *   - target_value: string (зависит от scope)
 *   - expiration_at?: ISO date (опц., auto-revert override)
 *   - re_review_at: ISO date (required — когда compliance officer пересмотрит)
 *   - justification: min 150 chars + regex против тривиального ввода
 *
 * Permission gate через mapLegacyRole + ROLE_PERMISSIONS_MOCK (Q-frontend-K).
 * Если permission missing — submit disabled + tooltip warning.
 *
 * Audit-write — caller обрабатывает через onSubmit promise; этот компонент
 * только form UX + validation.
 */

import { useMemo, useState } from 'react';
import type { RiskLevel } from '../../types';
import {
  ROLE_PERMISSIONS_MOCK,
  mapLegacyRole,
  type Permission,
} from '../../types/rbac';
import { useCurrentUser } from '../../lib/hooks';
import Button from '../primitives/Button';
import Dialog from '../primitives/Dialog';
import Input from '../primitives/Input';
import RadioGroup from '../primitives/Radio';
import Tooltip from '../primitives/Tooltip';

export type ApprovalKind =
  | 'risk_override'
  | 'regulatory_exemption'
  | 'pep_approval'
  | 'sanction_resolve';

export type ApprovalFormData = {
  scope: 'entire_client' | 'single_category' | 'specific_rule';
  target_value: string;
  expiration_at?: string;
  re_review_at: string;
  justification: string;
};

const KIND_CONFIG: Record<
  ApprovalKind,
  { title: string; subtitle: string; permission: Permission; submitLabel: string; submitVariant: 'danger' | 'primary' }
> = {
  risk_override: {
    title: 'Override решения по риску',
    subtitle: 'Compliance officer override триггера с обоснованием',
    permission: 'RISK_OVERRIDE',
    submitLabel: 'Применить override',
    submitVariant: 'danger',
  },
  regulatory_exemption: {
    title: 'Регуляторное исключение',
    subtitle: 'п.32 Положения о CDD — БВ-анкета не требуется',
    permission: 'RISK_OVERRIDE',
    submitLabel: 'Применить исключение',
    submitVariant: 'danger',
  },
  pep_approval: {
    title: 'Письменное разрешение по ПДЛ',
    subtitle: 'п.18 Анкеты ПДЛ — administrative approval',
    permission: 'PEP_APPROVE',
    submitLabel: 'Подтвердить разрешение',
    submitVariant: 'danger',
  },
  sanction_resolve: {
    title: 'Подтвердить совпадение санкций',
    subtitle: 'Решение по match: истинное / ложное',
    permission: 'CLIENT_WRITE',
    submitLabel: 'Зафиксировать решение',
    submitVariant: 'primary',
  },
};

const SCOPE_OPTIONS: Array<{ value: ApprovalFormData['scope']; label: string }> = [
  { value: 'entire_client', label: 'Весь клиент' },
  { value: 'single_category', label: 'Одна категория (A/B/C/D)' },
  { value: 'specific_rule', label: 'Конкретное правило' },
];

const MIN_JUSTIFICATION = 150;
const NON_TRIVIAL_REGEX = /[а-яёА-ЯЁ]{50,}/u;

export type ApprovalDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ApprovalFormData) => Promise<void> | void;
  kind: ApprovalKind;
  /** Контекст для отображения в subtitle (имя клиента, риск-level и т.д.). */
  context?: { clientName?: string; currentLevel?: RiskLevel };
};

export default function ApprovalDialog({ open, onClose, onSubmit, kind, context }: ApprovalDialogProps) {
  const config = KIND_CONFIG[kind];
  const { data: user } = useCurrentUser();

  const hasPermission = useMemo(() => {
    if (!user) return false;
    const v2 = mapLegacyRole(user.role);
    return ROLE_PERMISSIONS_MOCK[v2].has(config.permission);
  }, [user, config.permission]);

  const [scope, setScope] = useState<ApprovalFormData['scope']>('entire_client');
  const [targetValue, setTargetValue] = useState('');
  const [expirationAt, setExpirationAt] = useState('');
  const [reReviewAt, setReReviewAt] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Validation
  const justifLen = justification.trim().length;
  const justifLenError =
    justifLen > 0 && justifLen < MIN_JUSTIFICATION
      ? `Минимум ${MIN_JUSTIFICATION} символов (сейчас ${justifLen})`
      : undefined;
  const justifContentError =
    justifLen >= MIN_JUSTIFICATION && !NON_TRIVIAL_REGEX.test(justification)
      ? 'Обоснование должно содержать минимум 50 кириллических букв подряд (не "ааааа..." и подобное)'
      : undefined;
  const justifError = justifLenError ?? justifContentError;

  const reReviewError = !reReviewAt ? 'Обязательное поле' : undefined;

  const formValid = !justifError && !reReviewError && justifLen >= MIN_JUSTIFICATION;
  const canSubmit = hasPermission && formValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        scope,
        target_value: targetValue,
        expiration_at: expirationAt || undefined,
        re_review_at: reReviewAt,
        justification: justification.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const submitButton = (
    <Button
      variant={config.submitVariant}
      size="md"
      loading={submitting}
      disabled={!canSubmit}
      onClick={handleSubmit}
    >
      {config.submitLabel}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={config.title}
      subtitle={
        <>
          {config.subtitle}
          {context?.clientName && ` · ${context.clientName}`}
          {context?.currentLevel && ` · текущий: ${context.currentLevel.toUpperCase()}`}
        </>
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          {hasPermission ? (
            submitButton
          ) : (
            <Tooltip content={`Нужна роль с правом ${config.permission}`}>{submitButton}</Tooltip>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!hasPermission && (
          <div role="alert" className="border border-red/35 bg-red-soft px-3 py-2 rounded-sm text-2xs text-red">
            У вашей роли нет права <strong>{config.permission}</strong>. Submit будет недоступен.
          </div>
        )}

        <div>
          <label className="cd-caps text-text-mute mb-1.5 block">Область применения</label>
          <RadioGroup
            value={scope}
            onChange={(v) => setScope(v)}
            options={SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            orientation="vertical"
          />
        </div>

        <Input
          label={
            scope === 'entire_client'
              ? 'Целевое значение (новый risk level)'
              : scope === 'single_category'
              ? 'Категория и значение (e.g. "A: 75")'
              : 'Код правила (e.g. "C4.5")'
          }
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
          placeholder="..."
          monospace
          fullWidth
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Дата авто-отмены (опц.)"
            type="date"
            value={expirationAt}
            onChange={(e) => setExpirationAt(e.target.value)}
            hint="Override снимется автоматически в эту дату"
            fullWidth
          />
          <Input
            label="Дата следующего пересмотра"
            type="date"
            value={reReviewAt}
            onChange={(e) => setReReviewAt(e.target.value)}
            error={reReviewError}
            fullWidth
          />
        </div>

        <div>
          <label className="cd-caps text-text-mute mb-1.5 block">
            Обоснование (мин. {MIN_JUSTIFICATION} символов)
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={6}
            placeholder="Опишите ситуацию, источник информации, факторы которые привели к решению..."
            className="w-full bg-bg border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-focus resize-y"
            aria-invalid={!!justifError || undefined}
          />
          <div className="mt-1 flex items-center justify-between">
            <span className={justifError ? 'text-2xs text-red' : 'text-2xs text-text-mute'}>
              {justifError ?? `${justifLen} / ${MIN_JUSTIFICATION}+`}
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
