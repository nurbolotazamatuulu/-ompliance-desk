import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { ClientStatus, ClientType, RiskLevel } from '../../types';
import GenericToolbar from '../../components/data/Toolbar';
import Input from '../../components/primitives/Input';
import Select from '../../components/primitives/Select';
import Checkbox from '../../components/primitives/Checkbox';
import { USERS } from '../../mocks/users';
import { clientStatusLabel, riskLabel } from '../../lib/risk';

const TYPE_OPTIONS = [
  { value: 'pf' as ClientType, label: 'Физическое лицо' },
  { value: 'le' as ClientType, label: 'Юридическое лицо' },
];

const STATUS_OPTIONS: Array<{ value: ClientStatus; label: string }> = (
  ['draft', 'submitted', 'in_review', 'awaiting_docs', 'approved', 'rejected', 'suspended', 'closed'] as ClientStatus[]
).map((s) => ({ value: s, label: clientStatusLabel[s] }));

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string }> = (
  ['low', 'medium', 'high', 'critical'] as RiskLevel[]
).map((r) => ({ value: r, label: riskLabel[r] }));

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'За 7 дней' },
  { value: 'month', label: 'За 30 дней' },
];

const officerOptions = () =>
  USERS.filter((u) => ['compliance_officer', 'compliance_lead'].includes(u.role)).map((u) => ({
    value: u.id,
    label: u.fullName,
  }));

export type ClientsToolbarParams = {
  q: string;
  type: ClientType[];
  status: ClientStatus[];
  risk: RiskLevel[];
  officer: string[];
  period: string | null;
  is_ie: boolean;
};

type Props = {
  /** Текущие значения из URL state. */
  params: ClientsToolbarParams;
  /** Update partial — caller обновляет через useQueryStates setter. */
  onChange: (next: Partial<ClientsToolbarParams>) => void;
  /** Counter справа (НАЙДЕНО N). */
  counter: string;
};

/**
 * Toolbar реестра клиентов.
 *
 * Search — debounced 250ms через локальный state перед commit в URL.
 * Filters/checkbox — изменения немедленно отражаются в URL (через onChange).
 */
export default function ClientsListToolbar({ params, onChange, counter }: Props) {
  // Local search state для debounce — синхронизуется в URL через 250ms.
  const [searchLocal, setSearchLocal] = useState(params.q);

  // Sync local → URL
  useEffect(() => {
    if (searchLocal === params.q) return;
    const t = setTimeout(() => onChange({ q: searchLocal }), 250);
    return () => clearTimeout(t);
  }, [searchLocal, params.q, onChange]);

  // Sync external URL → local (например, browser back/forward)
  useEffect(() => {
    setSearchLocal(params.q);
  }, [params.q]);

  return (
    <GenericToolbar
      search={
        <Input
          placeholder="Поиск: ИНН, ФИО, № дела"
          leadingIcon={Search}
          value={searchLocal}
          onChange={(e) => setSearchLocal(e.target.value)}
          fullWidth
          aria-label="Поиск клиентов"
        />
      }
      filters={
        <>
          <Select
            label="Тип"
            options={TYPE_OPTIONS}
            value={params.type}
            onChange={(v) => onChange({ type: v })}
            multiple
            placeholder="Все"
          />
          <Select
            label="Статус"
            options={STATUS_OPTIONS}
            value={params.status}
            onChange={(v) => onChange({ status: v })}
            multiple
            placeholder="Все"
          />
          <Select
            label="Риск"
            options={RISK_OPTIONS}
            value={params.risk}
            onChange={(v) => onChange({ risk: v })}
            multiple
            placeholder="Все"
          />
          <Select
            label="Офицер"
            options={officerOptions()}
            value={params.officer}
            onChange={(v) => onChange({ officer: v })}
            multiple
            placeholder="Все"
          />
          <Select
            label="Период"
            options={PERIOD_OPTIONS}
            value={params.period}
            onChange={(v) => onChange({ period: v })}
            placeholder="Все"
          />
          <div className="flex items-center gap-2 pl-2 border-l border-border h-8">
            <Checkbox
              checked={params.is_ie}
              onChange={(v) => onChange({ is_ie: v })}
              label="Только ИП"
            />
          </div>
        </>
      }
      counter={counter}
    />
  );
}
