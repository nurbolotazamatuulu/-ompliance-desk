import { NavLink } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  History,
  LayoutDashboard,
  Network,
  Scale,
  Settings,
  ShieldAlert,
  Users,
  UserSearch,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/clients', label: 'Клиенты', icon: Users },
  { to: '/sanctions', label: 'Санкции', icon: ShieldAlert },
  { to: '/transactions', label: 'Транзакции', icon: ArrowLeftRight },
  { to: '/ipds', label: 'ИПДС', icon: UserSearch },
  { to: '/ubo', label: 'УБО', icon: Network },
  { to: '/documents', label: 'Документы', icon: FileText },
  { to: '/reports', label: 'Отчёты', icon: BarChart3 },
  { to: '/regulations', label: 'Регуляторика', icon: Scale },
];

const ADMIN: NavItem[] = [
  { to: '/admin/users', label: 'Админка', icon: Settings },
  { to: '/admin/audit', label: 'Аудит-лог', icon: History },
];

/**
 * Боковое меню — 180px ширина (свёрнутое — 56px, реализуется в Stage 5).
 * На мобильном выезжает по бургеру (см. useUIStore.sidebarOpenMobile,
 * подключение в Stage 5).
 */
export default function Sidebar() {
  return (
    <aside className="w-[180px] shrink-0 bg-surface border-r border-border flex flex-col">
      {/* Лого / брендинг */}
      <div className="h-[52px] px-4 flex items-center border-b border-border">
        <span className="cd-caps text-accent">◆ COMPLIANCE / KG</span>
      </div>

      {/* Основная навигация */}
      <nav className="flex-1 overflow-y-auto py-2 flex flex-col gap-0.5" aria-label="Главное меню">
        {NAV.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}

        <div className="my-3 mx-3 h-px bg-border" />

        {ADMIN.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      {/* Подвал — версия и статус. */}
      <div className="border-t border-border p-3 cd-caps text-text-mute">
        <div>complianceDesk · v0.1</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-pill bg-green" aria-hidden="true" />
          <span>online</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'mx-1 px-2.5 py-1.5 flex items-center gap-2.5 text-sm rounded-sm transition-colors',
          isActive
            ? 'bg-accent-bg-hi text-text border-l-2 border-l-accent pl-[8px]'
            : 'text-text-dim hover:bg-row-hover hover:text-text',
        )
      }
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}
