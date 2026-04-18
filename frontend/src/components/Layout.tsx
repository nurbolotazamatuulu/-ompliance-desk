import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  Users, Search, FileText, BarChart3,
  Bell, Settings, LogOut, ChevronLeft, ChevronRight,
  BookOpen, AlertTriangle, Building2, UserCheck,
  CreditCard, Banknote, User, ChevronRight as ChevronR,
  Shield, RefreshCw
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../api/client'
import clsx from 'clsx'

const NAV_ITEMS = [
  { label: 'Дашборд', icon: BarChart3, path: '/dashboard' },
  {
    group: 'КЛИЕНТЫ',
    items: [
      { label: 'Реестр клиентов', icon: Users, path: '/clients' },
      { label: 'Бенефициары (УБО)', icon: Building2, path: '/ubos' },
      { label: 'ИПДС', icon: Banknote, path: '/sof' },
      { label: 'ПДЛ', icon: UserCheck, path: '/pep' },
    ]
  },
  {
    group: 'ПРОВЕРКИ',
    items: [
      { label: 'Санкционный скрининг', icon: Search, path: '/sanctions' },
      { label: 'Sumsub', icon: CreditCard, path: '/sumsub' },
    ]
  },
  {
    group: 'КОНТРОЛЬ',
    items: [
      { label: 'Документы и дедлайны', icon: FileText, path: '/documents' },
      { label: 'Подозрительные операции', icon: AlertTriangle, path: '/transactions' },
      { label: 'Отчёты', icon: Bell, path: '/reports' },
    ]
  },
  {
    group: 'БАЗА ЗНАНИЙ',
    items: [
      { label: 'Нормативная база', icon: BookOpen, path: '/regulations' },
    ]
  },
]

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Супер-админ',
  company_admin: 'Администратор',
  compliance_officer: 'Комплаенс-офицер',
  manager: 'Руководитель',
  read_only: 'Только чтение',
}

// ─── Alert types (from /api/dashboard) ───────────────────────────────────────

interface AlertItem {
  level: 'critical' | 'warning' | 'info'
  category: string
  title: string
  detail: string
  link?: string
  count: number
}

const ALERT_ICON: Record<string, any> = {
  client: Users, document: FileText, transaction: AlertTriangle,
  sanctions: Shield,
}

const ALERT_STYLE = {
  critical: { dot: 'bg-red-500',    text: 'text-red-400',    bg: 'hover:bg-red-500/5' },
  warning:  { dot: 'bg-yellow-400', text: 'text-yellow-400', bg: 'hover:bg-yellow-500/5' },
  info:     { dot: 'bg-blue-400',   text: 'text-blue-400',   bg: 'hover:bg-blue-500/5' },
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  // Load alerts from dashboard
  useEffect(() => {
    api.get('/dashboard').then(r => setAlerts(r.data.alerts || [])).catch(() => {})
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const criticalCount = alerts.filter(a => a.level === 'critical').length
  const badgeCount = alerts.filter(a => a.level !== 'info').length

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-[#0a0d14] overflow-hidden">

      {/* Сайдбар */}
      <aside className={clsx(
        'flex flex-col border-r border-[#1e2535] bg-[#0d1017] transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}>

        {/* Логотип */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-[#1e2535]">
          {!collapsed && (
            <span className="text-sm font-bold text-white tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              COMPLIANCE<span className="text-[#d4a843]">DESK</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[#4b5563] hover:text-white transition-colors p-1 rounded"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {NAV_ITEMS.map((item, idx) => {
            if ('path' in item) {
              return (
                <NavItem key={idx} icon={item.icon} label={item.label!} path={item.path!} collapsed={collapsed} />
              )
            }
            return (
              <div key={idx} className="pt-4">
                {!collapsed && (
                  <p className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest px-3 mb-1">
                    {item.group}
                  </p>
                )}
                {item.items.map((sub, subIdx) => (
                  <NavItem key={subIdx} icon={sub.icon} label={sub.label} path={sub.path} collapsed={collapsed} />
                ))}
              </div>
            )
          })}
        </nav>

        {/* Нижняя часть: настройки */}
        <div className="border-t border-[#1e2535] p-2 space-y-1">
          {!collapsed && (
            <p className="text-[10px] text-[#374151] truncate px-2 py-1">{user?.company_name}</p>
          )}
          <button
            onClick={() => navigate('/settings')}
            title="Настройки"
            className="w-full flex items-center justify-center p-2 rounded-lg text-[#4b5563] hover:text-white hover:bg-[#1e2535] transition-colors"
          >
            <Settings className="w-4 h-4 shrink-0" />
          </button>
          <button
            onClick={handleLogout}
            title="Выйти"
            className="w-full flex items-center justify-center p-2 rounded-lg text-[#4b5563] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Хедер */}
        <header className="h-16 border-b border-[#1e2535] flex items-center justify-between px-6 bg-[#0d1017]">
          <div />
          <div className="flex items-center gap-2">

            {/* ── Колокольчик ── */}
            <div ref={bellRef} className="relative">
              <button
                onClick={() => { setBellOpen(o => !o); setAvatarOpen(false) }}
                className={clsx(
                  'relative p-2 rounded-lg transition-colors',
                  bellOpen ? 'text-white bg-[#1e2535]' : 'text-[#4b5563] hover:text-white hover:bg-[#1e2535]'
                )}
              >
                <Bell className="w-5 h-5" />
                {badgeCount > 0 && (
                  <span className={clsx(
                    'absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-0.5',
                    criticalCount > 0 ? 'bg-red-500 text-white' : 'bg-[#d4a843] text-[#0a0d14]'
                  )}>
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-[#111520] border border-[#1e2535] rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2535]">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#d4a843]" />
                      <span className="text-sm font-semibold text-white">Уведомления</span>
                      {badgeCount > 0 && (
                        <span className="text-[10px] bg-[#d4a843]/20 text-[#d4a843] px-1.5 py-0.5 rounded-full font-medium">
                          {badgeCount}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => api.get('/dashboard').then(r => setAlerts(r.data.alerts || []))}
                      className="text-[#4b5563] hover:text-white transition-colors"
                      title="Обновить"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Alerts list */}
                  <div className="max-h-80 overflow-y-auto">
                    {alerts.length === 0 ? (
                      <div className="py-10 text-center text-[#4b5563]">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Нет уведомлений</p>
                      </div>
                    ) : (
                      alerts.map((a, i) => {
                        const style = ALERT_STYLE[a.level]
                        const Icon = ALERT_ICON[a.category] || AlertTriangle
                        const inner = (
                          <div className={clsx(
                            'flex items-start gap-3 px-4 py-3 border-b border-[#0d1017] last:border-0 transition-colors cursor-pointer',
                            style.bg
                          )}>
                            <div className="mt-0.5 shrink-0 relative">
                              <Icon className="w-4 h-4 text-[#374151]" />
                              <span className={clsx('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full', style.dot)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className={clsx('text-xs font-semibold leading-snug', style.text)}>{a.title}</p>
                                <span className={clsx('text-[10px] font-bold shrink-0 mt-0.5', style.text)}>{a.count}</span>
                              </div>
                              <p className="text-[10px] text-[#4b5563] mt-0.5 leading-snug">{a.detail}</p>
                            </div>
                            {a.link && <ChevronR className="w-3.5 h-3.5 text-[#374151] shrink-0 mt-0.5" />}
                          </div>
                        )
                        return a.link
                          ? <Link key={i} to={a.link} onClick={() => setBellOpen(false)}>{inner}</Link>
                          : <div key={i}>{inner}</div>
                      })
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2.5 border-t border-[#1e2535]">
                    <Link
                      to="/dashboard"
                      onClick={() => setBellOpen(false)}
                      className="text-[10px] text-[#d4a843] hover:underline"
                    >
                      Перейти на дашборд →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* ── Аватар / меню пользователя ── */}
            <div ref={avatarRef} className="relative">
              <button
                onClick={() => { setAvatarOpen(o => !o); setBellOpen(false) }}
                className={clsx(
                  'flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg transition-colors',
                  avatarOpen ? 'bg-[#1e2535]' : 'hover:bg-[#1e2535]'
                )}
              >
                <div className="w-7 h-7 rounded-md bg-[#d4a843]/20 border border-[#d4a843]/30 flex items-center justify-center shrink-0">
                  <span className="text-[#d4a843] text-xs font-bold">
                    {user?.full_name?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                {!collapsed && (
                  <span className="text-xs text-[#9ca3af] hidden sm:block max-w-[100px] truncate">
                    {user?.full_name?.split(' ')[0]}
                  </span>
                )}
              </button>

              {avatarOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#111520] border border-[#1e2535] rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-[#1e2535]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#d4a843]/20 border border-[#d4a843]/30 flex items-center justify-center shrink-0">
                        <span className="text-[#d4a843] text-sm font-bold">
                          {user?.full_name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
                        <p className="text-[10px] text-[#d4a843] mt-0.5">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
                        <p className="text-[10px] text-[#4b5563] truncate">{user?.company_name}</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <Link
                      to="/settings"
                      onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#9ca3af] hover:text-white hover:bg-[#1e2535] transition-colors"
                    >
                      <User className="w-4 h-4" />
                      Мой профиль
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#9ca3af] hover:text-white hover:bg-[#1e2535] transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Настройки
                    </Link>
                  </div>

                  <div className="border-t border-[#1e2535] py-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Выйти
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Страница */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavItem({ icon: Icon, label, path, collapsed }: {
  icon: any, label: string, path: string, collapsed: boolean
}) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) => clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
        isActive
          ? 'bg-[#d4a843]/10 text-[#d4a843] border border-[#d4a843]/20'
          : 'text-[#6b7280] hover:text-white hover:bg-[#1e2535]'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}
