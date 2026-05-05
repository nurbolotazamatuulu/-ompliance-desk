import GenericFilterBar from '../../components/data/FilterBar';
import { clientStatusLabel, riskLabel } from '../../lib/risk';
import { USERS } from '../../mocks/users';
import type { ClientsToolbarParams } from './Toolbar';

const PERIOD_LABEL: Record<string, string> = {
  today: 'Сегодня',
  week: 'За 7 дней',
  month: 'За 30 дней',
};

type Props = {
  params: ClientsToolbarParams;
  onChange: (next: Partial<ClientsToolbarParams>) => void;
  /** Reset all filters обнуляет все поля кроме сортировки/page. */
  onResetAll: () => void;
};

export default function ClientsListFilterBar({ params, onChange, onResetAll }: Props) {
  const chips: { id: string; label: string; onRemove: () => void }[] = [];

  if (params.q) {
    chips.push({ id: 'q', label: `Поиск: ${params.q}`, onRemove: () => onChange({ q: '' }) });
  }
  for (const t of params.type) {
    chips.push({
      id: `type-${t}`,
      label: `Тип: ${t === 'pf' ? 'ФЛ' : 'ЮЛ'}`,
      onRemove: () => onChange({ type: params.type.filter((x) => x !== t) }),
    });
  }
  for (const s of params.status) {
    chips.push({
      id: `status-${s}`,
      label: `Статус: ${clientStatusLabel[s]}`,
      onRemove: () => onChange({ status: params.status.filter((x) => x !== s) }),
    });
  }
  for (const r of params.risk) {
    chips.push({
      id: `risk-${r}`,
      label: `Риск: ${riskLabel[r]}`,
      onRemove: () => onChange({ risk: params.risk.filter((x) => x !== r) }),
    });
  }
  for (const o of params.officer) {
    const u = USERS.find((x) => x.id === o);
    chips.push({
      id: `officer-${o}`,
      label: `Офицер: ${u?.fullName ?? o}`,
      onRemove: () => onChange({ officer: params.officer.filter((x) => x !== o) }),
    });
  }
  if (params.period) {
    const lbl = PERIOD_LABEL[params.period] ?? params.period;
    chips.push({
      id: 'period',
      label: `Период: ${lbl}`,
      onRemove: () => onChange({ period: null }),
    });
  }
  if (params.is_ie) {
    chips.push({
      id: 'is_ie',
      label: 'Только ИП',
      onRemove: () => onChange({ is_ie: false }),
    });
  }

  return <GenericFilterBar chips={chips} onResetAll={chips.length >= 2 ? onResetAll : undefined} />;
}
