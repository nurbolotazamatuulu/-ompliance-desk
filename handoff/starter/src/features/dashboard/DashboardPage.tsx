/**
 * Дашборд офицера комплаенс (Stage 2 Phase D).
 *
 * Архитектура:
 * - useDashboardSummary — pre-aggregated KPI + risk donut counts
 *   (server-shaped contract; mock агрегирует in-memory).
 * - useDashboardQueue — top 12 клиентов sorted SLA asc + risk desc tiebreak,
 *   refetchInterval 60_000 (единственное явное исключение из глобального
 *   staleTime: Infinity — спец требует live-картину «горящего»).
 * - userMap useMemo один раз → пробрасывается в QueueSection как prop;
 *   QueueSection не делает .find() per row.
 * - EventFeedSection — 3 локальных таб (Санкции / KYT-флаги / Документы);
 *   Документы — disabled state + tooltip «Этап 7».
 *
 * Permission: Phase 2+ — gate по DASHBOARD_VIEW. Stage 2: open.
 */

import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import RiskDistribution from '../../components/compliance/RiskDistribution';
import Button from '../../components/primitives/Button';
import {
  useCurrentUser,
  useDashboardQueue,
  useDashboardSummary,
  useUsers,
} from '../../lib/hooks';
import type { User } from '../../types';
import KPIRow from './KPIRow';
import QueueSection from './QueueSection';
import EventFeedSection from './EventFeedSection';

const greeting = (hour: number, firstName: string): string => {
  // Пороги <06/<12/<18/≥18 (фикс) — см. plan Phase D § «доп правки».
  if (hour < 6) return `Доброй ночи, ${firstName}`;
  if (hour < 12) return `Доброе утро, ${firstName}`;
  if (hour < 18) return `Добрый день, ${firstName}`;
  return `Добрый вечер, ${firstName}`;
};

const formatToday = (d: Date): string => {
  const months = [
    'ЯНВАРЯ',
    'ФЕВРАЛЯ',
    'МАРТА',
    'АПРЕЛЯ',
    'МАЯ',
    'ИЮНЯ',
    'ИЮЛЯ',
    'АВГУСТА',
    'СЕНТЯБРЯ',
    'ОКТЯБРЯ',
    'НОЯБРЯ',
    'ДЕКАБРЯ',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

// Захардкоженные часы смены — placeholder. Phase 2+ вернёт график смен
// per-user. См. Q-frontend-P.
const HARDCODED_SHIFT = '08:00–20:00'; // TODO Q-frontend-P

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const summaryQ = useDashboardSummary();
  const queueQ = useDashboardQueue();
  const { data: users } = useUsers();

  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    if (users) for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const now = new Date();
  // user.fullName формат «Имя Фамилия» — берём первое слово.
  const firstName = user?.fullName.split(' ')[0] ?? '';
  const greetingText = greeting(now.getHours(), firstName);
  const subtitleText = `${formatToday(now)} · СМЕНА ${HARDCODED_SHIFT}`;

  const summary = summaryQ.data;
  const queueRows = queueQ.data?.items ?? [];

  return (
    <div className="flex flex-col">
      <PageHeader
        breadcrumb="Сегодня"
        title={greetingText || 'Дашборд'}
        subtitle={subtitleText}
      />

      <div className="px-6 py-4 flex flex-col gap-4">
        {/* KPI row */}
        {summaryQ.isError ? (
          <SectionError text="Не удалось загрузить KPI" onRetry={() => summaryQ.refetch()} />
        ) : summaryQ.isLoading || !summary ? (
          <KpiRowSkeleton />
        ) : (
          <KPIRow summary={summary} />
        )}

        {/* Queue */}
        <section aria-label="Очередь дня">
          <h2 className="cd-caps mb-2">Очередь дня</h2>
          <QueueSection
            rows={queueRows}
            loading={queueQ.isLoading}
            error={queueQ.isError}
            onRetry={() => queueQ.refetch()}
            userMap={userMap}
          />
        </section>

        {/* Event feed + Risk distribution side-by-side */}
        <div className="grid grid-cols-[2fr_1fr] gap-4">
          <section aria-label="Лента событий">
            <h2 className="cd-caps mb-2">Лента событий</h2>
            <EventFeedSection />
          </section>
          <section aria-label="Распределение риска">
            <h2 className="cd-caps mb-2">Распределение риска</h2>
            {summaryQ.isError ? (
              <SectionError text="Не загрузилось" onRetry={() => summaryQ.refetch()} />
            ) : summaryQ.isLoading || !summary ? (
              <RiskDistSkeleton />
            ) : (
              <RiskDistribution counts={summary.risk_distribution} basePath="/clients" />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Local skeletons ──────────────────────────────────────────────────────

function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-sm pl-4 pr-3 py-3 h-[88px]">
          <div className="h-2.5 bg-elev animate-pulse rounded-sm w-1/3" />
          <div className="h-7 bg-elev animate-pulse rounded-sm w-1/2 mt-2" />
          <div className="h-2 bg-elev animate-pulse rounded-sm w-1/4 mt-3" />
        </div>
      ))}
    </div>
  );
}

function RiskDistSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-sm p-4 flex items-center gap-6 h-[172px]">
      <div className="w-[140px] h-[140px] bg-elev animate-pulse rounded-pill shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 bg-elev animate-pulse rounded-sm" />
        ))}
      </div>
    </div>
  );
}

function SectionError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="border border-border rounded-sm bg-surface p-6 text-center">
      <p className="text-sm text-text-mute mb-3">{text}</p>
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}
