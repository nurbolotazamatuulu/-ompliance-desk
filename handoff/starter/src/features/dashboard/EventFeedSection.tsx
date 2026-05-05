import { useMemo, useState } from 'react';
import { ArrowRight, FileText, Flag, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type Tab } from '../../components/primitives/Tabs';
import Tooltip from '../../components/primitives/Tooltip';
import Badge from '../../components/primitives/Badge';
import Button from '../../components/primitives/Button';
import KYTFlag from '../../components/compliance/KYTFlag';
import { useQuery } from '@tanstack/react-query';
import * as api from '../../lib/api';
import { sanctionListLabel } from '../../lib/risk';
import { formatNumber, formatRelative } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { SanctionMatch, Transaction } from '../../types';

type TabId = 'sanctions' | 'kyt' | 'docs';

const FEED_LIMIT = 8;

/**
 * Лента событий Дашборда — 3 локальных таба (без URL routing per spec).
 * - Санкции (default): listSanctions(per_page: 8).
 * - KYT-флаги: транзакции с flags.length > 0, top 8 свежих.
 * - Документы: disabled, tooltip «Этап 7». Реализация — модуль 7.
 */
export default function EventFeedSection() {
  const [active, setActive] = useState<TabId>('sanctions');

  const tabs: Tab[] = useMemo(
    () => [
      { id: 'sanctions', label: 'Санкции' },
      { id: 'kyt', label: 'KYT-флаги' },
      // Документы — placeholder Tab; click игнорируется, tooltip над лейблом.
      // Disabled state визуально: text-text-mute + cursor-not-allowed (см. ниже).
      { id: 'docs', label: 'Документы' },
    ],
    [],
  );

  const handleTabChange = (id: string) => {
    if (id === 'docs') return; // disabled — игнорируем клик
    setActive(id as TabId);
  };

  return (
    <div className="bg-surface border border-border rounded-sm">
      <div className="px-4 pt-2 flex items-center justify-between gap-2">
        {/* Custom Tabs render с tooltip-обёрткой для disabled tab «Документы» */}
        <DashboardEventTabs tabs={tabs} active={active} onChange={handleTabChange} />
      </div>
      <div className="p-3">
        {active === 'sanctions' && <SanctionsFeed />}
        {active === 'kyt' && <KytFeed />}
      </div>
    </div>
  );
}

// ─── Custom tabs с tooltip над «Документы» ────────────────────────────────

type TabsProps = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

function DashboardEventTabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex items-end gap-1 border-b border-border h-10 flex-1 -mx-4 px-4">
      {tabs.map((t) => {
        const isActive = t.id === active;
        const isDisabled = t.id === 'docs';
        const button = (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled || undefined}
            onClick={() => !isDisabled && onChange(t.id)}
            className={cn(
              'relative inline-flex items-center gap-2 px-3 -mb-px h-full text-sm transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
              isDisabled && 'cursor-not-allowed text-text-ghost border-b-2 border-transparent',
              !isDisabled && isActive && 'text-text font-semibold border-b-2 border-accent',
              !isDisabled &&
                !isActive &&
                'text-text-dim hover:text-text border-b-2 border-transparent cursor-pointer',
            )}
          >
            <span>{t.label}</span>
          </button>
        );
        if (isDisabled) {
          return (
            <Tooltip key={t.id} content="Этап 7 — документ-трекер">
              {button}
            </Tooltip>
          );
        }
        return button;
      })}
    </div>
  );
}

// ─── Sanctions feed ───────────────────────────────────────────────────────

function SanctionsFeed() {
  const query = useQuery({
    queryKey: ['dashboard', 'feed', 'sanctions'],
    queryFn: () => api.listSanctions({ page: 1, per_page: FEED_LIMIT }),
  });

  if (query.isError) return <FeedError onRetry={() => query.refetch()} />;
  if (query.isLoading) return <FeedSkeleton />;
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  if (items.length === 0) return <FeedEmpty text="Свежих совпадений нет" />;

  return (
    <div className="flex flex-col gap-2">
      {items.map((m) => (
        <SanctionFeedRow key={m.id} match={m} />
      ))}
      <Link
        to="/sanctions"
        className="cd-caps text-accent hover:text-accent-hover px-2 py-2 inline-flex items-center gap-1 self-start focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-xs"
      >
        Показать все {total}
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function SanctionFeedRow({ match }: { match: SanctionMatch }) {
  const pct = formatNumber(match.similarity * 100, 0);
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xs hover:bg-row-hover">
      <ShieldAlert size={16} className="text-orange shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-text truncate">
          Совпадение в <Badge tone="blue">{sanctionListLabel[match.list]}</Badge> — Сходство {pct}%
        </div>
        <div className="cd-mono text-text-mute truncate">
          {match.matchedValue} · {formatRelative(match.detectedAt)}
        </div>
      </div>
      <Link
        to={match.clientId ? `/clients/${match.clientId}/sanctions` : '/sanctions'}
        className="text-sm text-accent hover:text-accent-hover px-2 shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-xs"
      >
        Открыть
      </Link>
    </div>
  );
}

// ─── KYT feed ─────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<Transaction['flags'][number]['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function KytFeed() {
  const query = useQuery({
    queryKey: ['dashboard', 'feed', 'kyt'],
    queryFn: () => api.listTransactions({ page: 1, per_page: 50 }),
    select: (page) => {
      const flagged = page.items.filter((t) => t.flags.length > 0);
      return flagged.slice(0, FEED_LIMIT);
    },
  });

  if (query.isError) return <FeedError onRetry={() => query.refetch()} />;
  if (query.isLoading) return <FeedSkeleton />;
  const items = query.data ?? [];
  if (items.length === 0) return <FeedEmpty text="KYT-флагов нет" />;

  return (
    <div className="flex flex-col gap-2">
      {items.map((t) => {
        const top = [...t.flags].sort(
          (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
        )[0];
        return (
          <div key={t.id} className="flex items-center gap-3 px-2 py-2 rounded-xs hover:bg-row-hover">
            <Flag size={16} className="text-red shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-text truncate inline-flex items-center gap-2">
                <KYTFlag code={top.code} />
                <span className="text-text-mute">·</span>
                <span className="cd-mono">
                  {t.amount} {t.asset}
                </span>
              </div>
              <div className="cd-mono text-text-mute truncate">
                {t.counterpartyName ?? t.counterpartyAddress ?? '—'} · {formatRelative(t.initiatedAt)}
              </div>
            </div>
            <Link
              to={`/clients/${t.clientId}/transactions`}
              className="text-sm text-accent hover:text-accent-hover px-2 shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-xs"
            >
              Открыть
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared per-section states ────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-2 py-2">
          <div className="h-3 bg-elev animate-pulse rounded-sm w-3/4" />
          <div className="h-2.5 bg-elev animate-pulse rounded-sm w-1/2 mt-1.5" />
        </div>
      ))}
    </div>
  );
}

function FeedEmpty({ text }: { text: string }) {
  return (
    <div className="py-6 text-center inline-flex items-center justify-center w-full gap-2 text-text-mute text-sm">
      <FileText size={14} aria-hidden="true" />
      {text}
    </div>
  );
}

function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-text-mute mb-3">Не удалось загрузить ленту</p>
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}
