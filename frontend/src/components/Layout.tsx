import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  Users, Search, FileText, BarChart3,
  Bell, Settings, LogOut, ChevronLeft, ChevronRight,
  BookOpen, AlertTriangle, Building2, UserCheck,
  CreditCard, Banknote, User, ChevronRight as ChevronR,
  Shield, RefreshCw, Sun, Moon, ShieldAlert, Archive, X, Command
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
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
      { label: 'Архив', icon: Archive, path: '/archive', badge: true },
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
      { label: 'Высокорисковые страны', icon: ShieldAlert, path: '/high-risk-countries' },
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
  const { theme, toggle: toggleTheme } = useThemeStore()
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

  const [archiveCount, setArchiveCount] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get('/clients/archived').then(r => setArchiveCount(r.data.length)).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [searchOpen])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const { data } = await api.get('/clients', { params: { search: searchQuery } })
        setSearchResults(data.slice(0, 8))
      } catch { setSearchResults([]) }
      finally { setSearchLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  const openSearch = () => { setSearchOpen(true); setSearchQuery(''); setSearchResults([]) }
  const closeSearch = () => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }

  const goToClient = (id: number) => {
    navigate(`/clients/${id}`)
    closeSearch()
  }

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
        'flex flex-col border-r border-[#1e2535] bg-[#0d1017] transition-all duration-300 shrink-0',
        collapsed ? 'w-[52px]' : 'w-56'
      )}>

        {/* Логотип */}
        <div className={clsx(
          'flex items-center h-14 border-b border-[#1e2535] px-3 shrink-0',
          collapsed ? 'justify-center' : 'justify-between'
        )}>
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight select-none" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="text-white">COMPLIANCE</span><span className="text-[#d4a843]">DESK</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
            className="p-1.5 rounded-lg text-[#4b5563] hover:text-white hover:bg-[#1e2535]/60 transition-all duration-150"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map((item, idx) => {
            if ('path' in item) {
              return <NavItem key={idx} icon={item.icon} label={item.label!} path={item.path!} collapsed={collapsed} />
            }
            return (
              <div key={idx} className="pt-3">
                {!collapsed && (
                  <p className="text-[10px] font-bold text-[#2d3748] uppercase tracking-widest px-3 mb-1.5">
                    {item.group}
                  </p>
                )}
                {collapsed && idx > 0 && <div className="border-t border-[#1e2535]/50 mx-2 mb-1" />}
                <div className="space-y-0.5">
                  {item.items.map((sub, subIdx) => (
                    <NavItem key={subIdx} icon={sub.icon} label={sub.label} path={sub.path} collapsed={collapsed}
                      badge={'badge' in sub && sub.badge && archiveCount > 0 ? archiveCount : undefined} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Нижняя часть */}
        <div className="border-t border-[#1e2535] p-2 space-y-0.5 shrink-0">
          {!collapsed && (
            <p className="text-[10px] text-[#2d3748] truncate px-3 py-1.5 font-medium">{user?.company_name}</p>
          )}
          <button
            onClick={() => navigate('/settings')}
            title="Настройки"
            className={clsx(
              'w-full flex items-center rounded-lg text-[#6b7280] hover:text-white hover:bg-[#1e2535]/60 transition-all duration-150 py-2',
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="text-sm truncate font-medium">Настройки</span>}
          </button>
          <button
            onClick={handleLogout}
            title="Выйти"
            className={clsx(
              'w-full flex items-center rounded-lg text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 py-2',
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="text-sm truncate font-medium">Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Основной контент */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Глобальный поиск — модальное окно */}
        {searchOpen && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center pt-[15vh] px-4"
            onClick={e => e.target === e.currentTarget && closeSearch()}>
            <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2535]">
                <Search className="w-4 h-4 text-[#4b5563] shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск клиентов по имени, договору, ПИН..."
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-[#374151]"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-[#4b5563] hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-[#374151] border border-[#1e2535] rounded px-1.5 py-0.5">
                  ESC
                </kbd>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {searchLoading ? (
                  <div className="py-8 text-center text-xs text-[#4b5563]">Поиск...</div>
                ) : searchQuery && searchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#4b5563]">Ничего не найдено</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((c: any) => (
                    <button key={c.id} onClick={() => goToClient(c.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1e2535] transition-colors text-left border-b border-[#0d1017] last:border-0">
                      <div className="w-7 h-7 rounded-lg bg-[#1e2535] flex items-center justify-center shrink-0">
                        {c.client_type === 'individual'
                          ? <User className="w-3.5 h-3.5 text-[#6b7280]" />
                          : <Building2 className="w-3.5 h-3.5 text-[#6b7280]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{c.display_name}</p>
                        <p className="text-xs text-[#4b5563] truncate">
                          {c.contract_number ? `Договор ${c.contract_number} · ` : ''}
                          {c.client_type === 'individual' ? 'Физическое лицо' : 'Юридическое лицо'}
                        </p>
                      </div>
                      <ChevronR className="w-4 h-4 text-[#374151] shrink-0" />
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-[#374151]">Начните вводить для поиска</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Хедер */}
        <header className="h-14 border-b border-[#1e2535] flex items-center justify-between px-4 bg-[#0d1017] shrink-0">
          {/* Глобальный поиск — кнопка */}
          <button onClick={openSearch}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-[#1e2535] text-[#4b5563] hover:text-white hover:border-[#2d3748] hover:bg-[#1e2535]/40 transition-all duration-150 text-sm">
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:block text-xs">Поиск клиентов</span>
            <span className="hidden md:flex items-center gap-0.5 text-[10px] text-[#2d3748] border border-[#1e2535] rounded px-1.5 py-0.5 ml-1 font-mono">
              <Command className="w-2.5 h-2.5" />K
            </span>
          </button>
          <div className="flex items-center gap-2">

            {/* ── Переключатель темы ── */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              className="p-2 rounded-lg text-[#4b5563] hover:text-white hover:bg-[#1e2535] transition-colors"
            >
              {theme === 'dark'
                ? <Sun className="w-5 h-5" />
                : <Moon className="w-5 h-5" />
              }
            </button>

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
                        <span className="text-xs bg-[#d4a843]/20 text-[#d4a843] px-1.5 py-0.5 rounded-full font-medium">
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
                                <span className={clsx('text-xs font-bold shrink-0 mt-0.5', style.text)}>{a.count}</span>
                              </div>
                              <p className="text-xs text-[#4b5563] mt-0.5 leading-snug">{a.detail}</p>
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
                      className="text-xs text-[#d4a843] hover:underline"
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
                        <p className="text-xs text-[#d4a843] mt-0.5">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
                        <p className="text-xs text-[#4b5563] truncate">{user?.company_name}</p>
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
        <div className="flex-1 overflow-auto bg-[#0a0d14]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavItem({ icon: Icon, label, path, collapsed, badge }: {
  icon: any, label: string, path: string, collapsed: boolean, badge?: number
}) {
  return (
    <NavLink
      to={path}
      title={collapsed ? label : undefined}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-[#d4a843]/10 text-[#d4a843] border border-[#d4a843]/20 shadow-sm'
          : 'text-[#6b7280] hover:text-white hover:bg-[#1e2535]/60 border border-transparent'
      )}
    >
      <div className="relative shrink-0">
        <Icon className="w-4 h-4" />
        {collapsed && badge ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 bg-orange-400 rounded-full text-[8px] font-bold text-[#0a0d14] flex items-center justify-center px-0.5">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </div>
      {!collapsed && <span className="truncate flex-1 leading-none">{label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto shrink-0 min-w-[18px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full bg-orange-400/20 text-orange-400 px-1">
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}
