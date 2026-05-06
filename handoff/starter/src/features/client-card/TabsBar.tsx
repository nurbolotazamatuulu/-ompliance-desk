/**
 * Sticky-bar с вкладками карточки клиента.
 *
 * Active tab определяется по последнему сегменту URL (matches one of
 * 8 known tab IDs). onChange → navigate(`/clients/:id/${tabId}`).
 *
 * Phase B Tabs primitive используется как есть; этот компонент —
 * router-glue + sticky positioning + alert-индикатор для табов с
 * нерешёнными сигналами (нерешённые санкции в Phase E1).
 */

import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Tabs, { type Tab } from '../../components/primitives/Tabs';

export type ClientCardTabId =
  | 'anketa'
  | 'scoring'
  | 'sanctions'
  | 'bv'
  | 'documents'
  | 'ubo'
  | 'transactions'
  | 'history';

const TAB_ORDER: { id: ClientCardTabId; label: string }[] = [
  { id: 'anketa', label: 'Анкета' },
  { id: 'scoring', label: 'Скоринг' },
  { id: 'sanctions', label: 'Санкции' },
  { id: 'bv', label: 'БВ' },
  { id: 'documents', label: 'Документы' },
  { id: 'ubo', label: 'УБО' },
  { id: 'transactions', label: 'Транзакции' },
  { id: 'history', label: 'История' },
];

type Props = {
  /** ID вкладок, которые должны показывать red-dot alert. */
  alertTabs?: Set<ClientCardTabId>;
};

export default function TabsBar({ alertTabs }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id: string }>();

  // Определяем active tab по последнему сегменту pathname.
  const lastSegment = location.pathname.split('/').filter(Boolean).pop() ?? '';
  const isKnown = (TAB_ORDER as { id: string }[]).some((t) => t.id === lastSegment);
  const active: ClientCardTabId = isKnown ? (lastSegment as ClientCardTabId) : 'anketa';

  const tabs: Tab[] = TAB_ORDER.map((t) => ({
    id: t.id,
    label: t.label,
    alert: alertTabs?.has(t.id) ?? false,
  }));

  const handleChange = (id: string) => {
    if (!params.id) return;
    navigate(`/clients/${params.id}/${id}`);
  };

  return (
    <div className="sticky top-0 z-10 bg-bg border-b border-border px-4">
      <Tabs tabs={tabs} active={active} onChange={handleChange} />
    </div>
  );
}
