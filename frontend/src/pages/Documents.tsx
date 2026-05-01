import { useState, useEffect, useRef } from 'react'
import { FileText, AlertTriangle, Clock, CheckCircle2, XCircle, ChevronRight, Search, X } from 'lucide-react'
import { fmtDate } from '../utils/dates'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'
import { useSortable } from '../hooks/useSortable'
import StatCard from '../components/StatCard'
import SortTh from '../components/SortTh'
import EmptyState from '../components/EmptyState'

interface DocItem {
  id: number | null
  client_id: number
  client_name: string
  client_type: string
  document_type: string
  label: string
  has_expiry: boolean
  status: string
  issued_at?: string
  expires_at?: string
  received_at?: string
  days_until_expiry?: number | null
  notes?: string
  updated_at?: string
}

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const STATUS_CONF: Record<string, { label: string; color: string; icon: any }> = {
  present:   { label: 'Получен',    color: 'bg-green-400/20 text-green-400',  icon: CheckCircle2 },
  requested: { label: 'Запрошен',   color: 'bg-blue-400/20 text-blue-400',    icon: Clock },
  expired:   { label: 'Просрочен',  color: 'bg-red-400/20 text-red-400',      icon: XCircle },
  missing:   { label: 'Отсутствует',color: 'bg-[#1e2535] text-[#6b7280]',    icon: AlertTriangle },
}

function expiryColor(days: number | null | undefined): string {
  if (days == null) return ''
  if (days < 0)   return 'text-red-400'
  if (days <= 7)  return 'text-red-400'
  if (days <= 30) return 'text-orange-400'
  if (days <= 90) return 'text-yellow-400'
  return 'text-green-400'
}

function expiryLabel(days: number | null | undefined, expires_at?: string): string {
  if (!expires_at) return '—'
  const d = fmtDate(expires_at)
  if (days == null) return d
  if (days < 0)    return `Просрочен ${Math.abs(days)} дн.`
  if (days === 0)  return 'Истекает сегодня!'
  if (days <= 30)  return `${d} (${days} дн.)`
  return d
}

const FILTER_TABS = [
  { key: '',          label: 'Все' },
  { key: 'missing',   label: 'Отсутствуют' },
  { key: 'requested', label: 'Запрошены' },
  { key: 'expired',   label: 'Просрочены' },
  { key: 'expiring',  label: 'Истекают (30 дн.)' },
  { key: 'present',   label: 'Получены' },
]

export default function Documents() {
  const [docs, setDocs]       = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')
  const [search, setSearch]   = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadDocs(filter) }, [filter])

  const loadDocs = async (f: string) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (f === 'expiring')        params.expiring_days = '30'
      else if (f)                  params.status = f
      const res = await api.get('/documents', { params })
      setDocs(res.data)
    } finally {
      setLoading(false)
    }
  }

  const preFiltered = docs.filter(d => {
    const q = search.toLowerCase()
    return (
      d.client_name.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q)
    )
  })

  const { sorted: filtered, sortKey, sortDir, toggle } = useSortable(preFiltered, 'client_name')

  // Статистика (всегда по всем, без фильтра статуса)
  const stats = {
    missing:   docs.filter(d => d.status === 'missing').length,
    requested: docs.filter(d => d.status === 'requested').length,
    expired:   docs.filter(d => d.status === 'expired').length,
    expiring:  docs.filter(d => d.days_until_expiry != null && d.days_until_expiry >= 0 && d.days_until_expiry <= 30).length,
    present:   docs.filter(d => d.status === 'present').length,
  }

  return (
    <div className="flex flex-col h-full">

      <div className="page-header">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-[#d4a843] flex-shrink-0" />
            <div>
              <h1 className="page-title">Документы и дедлайны</h1>
              <p className="page-subtitle">{loading ? '...' : `${filtered.length} записей`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={clsx('transition-all duration-200 overflow-hidden', searchOpen || search ? 'w-56 opacity-100' : 'w-0 opacity-0')}>
              <div className="relative">
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                  onBlur={() => { if (!search) setSearchOpen(false) }}
                  placeholder="Клиент или документ..."
                  className="form-input-sm pl-3 pr-8" />
                {search && (
                  <button onClick={() => { setSearch(''); setSearchOpen(false) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => { setSearchOpen(v => !v); if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 50) }}
              className={clsx('btn-icon', searchOpen || search ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5' : '')}>
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Статистика */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Отсутствуют"     value={stats.missing}   color="text-[#6b7280]"    border="border-[#1e2535]" />
        <StatCard label="Запрошены"       value={stats.requested} color="text-blue-400"      border="border-blue-400/20" />
        <StatCard label="Истекают 30 дн." value={stats.expiring}  color="text-orange-400"    border="border-orange-400/20" />
        <StatCard label="Просрочены"      value={stats.expired}   color="text-red-400"       border="border-red-400/20" />
        <StatCard label="Получены"        value={stats.present}   color="text-green-400"     border="border-green-400/20" />
      </div>

      <div className="tabs w-fit">
        {FILTER_TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)} className={clsx('tab', filter === t.key && 'tab-active')}>
            {t.label}
          </button>
        ))}
      </div>

      {!loading && (
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={FileText} title="Документов не найдено" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2535] bg-[#0d1017]">
                  <SortTh label="Клиент"           field="client_name"      current={String(sortKey)} dir={sortDir} onSort={toggle} className="px-4 py-3" />
                  <SortTh label="Документ"         field="label"            current={String(sortKey)} dir={sortDir} onSort={toggle} className="px-4 py-3" />
                  <SortTh label="Статус"           field="status"           current={String(sortKey)} dir={sortDir} onSort={toggle} className="px-4 py-3" />
                  <SortTh label="Получен"          field="received_at"      current={String(sortKey)} dir={sortDir} onSort={toggle} className="px-4 py-3" />
                  <SortTh label="Действителен до"  field="days_until_expiry" current={String(sortKey)} dir={sortDir} onSort={toggle} className="px-4 py-3" />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => {
                  const sc = STATUS_CONF[d.status] ?? STATUS_CONF.missing
                  const StatusIcon = sc.icon
                  const rowBg = d.status === 'expired'
                    ? 'bg-red-500/5'
                    : (d.days_until_expiry != null && d.days_until_expiry >= 0 && d.days_until_expiry <= 7)
                    ? 'bg-orange-500/5'
                    : ''
                  return (
                    <tr key={`${d.client_id}-${d.document_type}-${i}`}
                      className={clsx('border-b border-[#1e2535] last:border-0 hover:bg-[#111520]', rowBg)}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/clients/${d.client_id}`}
                          className="text-[#d4a843] hover:underline text-xs flex items-center gap-1"
                        >
                          {d.client_name}
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                        <p className="text-xs text-[#4b5563] mt-0.5">
                          {d.client_type === 'individual' ? 'Физлицо' : 'Юрлицо'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#d1d5db] text-xs">{d.label}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('flex items-center gap-1.5 text-xs font-medium w-fit px-2 py-0.5 rounded-full', sc.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">
                        {fmtDate(d.received_at)}
                      </td>
                      <td className={clsx('px-4 py-3 text-xs font-medium', expiryColor(d.days_until_expiry))}>
                        {d.has_expiry ? expiryLabel(d.days_until_expiry, d.expires_at) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/clients/${d.client_id}?tab=docs`}
                          className="text-xs text-[#4b5563] hover:text-[#d4a843] transition-colors"
                        >
                          Открыть →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
