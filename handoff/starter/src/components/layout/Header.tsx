import { Bell } from 'lucide-react';
import { CURRENT_USER } from '../../mocks/users';
import ThemeToggle from '../theme/ThemeToggle';

/**
 * Глобальный header страницы — 52px sticky.
 * Слева: брендинг приложения и subtitle. Справа: уведомления, тема, аватар.
 *
 * Page-specific PageHeader (с breadcrumbs и action-bar) живёт отдельно
 * под этим header'ом — см. components/layout/PageHeader.tsx.
 */
export default function Header() {
  return (
    <header className="h-[52px] shrink-0 sticky top-0 z-10 border-b border-border bg-surface flex items-center justify-between px-4">
      <div className="flex items-baseline gap-3">
        <span className="cd-caps">complianceDesk · v0.1</span>
        <span className="cd-caps text-text-ghost">VASP / Кыргызстан</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Уведомления"
          className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-text-dim hover:text-text hover:bg-row-hover transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <Bell size={14} aria-hidden="true" />
        </button>
        <ThemeToggle />
        <div className="ml-2 flex items-center gap-2 pl-2 border-l border-border">
          <div
            aria-hidden="true"
            className="h-7 w-7 rounded-pill bg-elev-2 border border-border-hi flex items-center justify-center text-2xs font-mono text-text-dim"
          >
            {initials(CURRENT_USER.fullName)}
          </div>
          <div className="hidden md:flex flex-col leading-tight">
            <span className="text-xs text-text">{CURRENT_USER.fullName}</span>
            <span className="cd-caps">{CURRENT_USER.role}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};
