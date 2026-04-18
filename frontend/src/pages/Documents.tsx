import { useState, useEffect } from 'react'
import { FileText, AlertTriangle, Clock, CheckCircle2, XCircle, ChevronRight, Filter } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'

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
  const d = new Date(expires_at).toLocaleDateString('ru-RU')
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

  const filtered = docs.filter(d => {
    const q = search.toLowerCase()
    return (
      d.client_name.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q)
    )
  })

  // Статистика (всегда по всем, без фильтра статуса)
  const stats = {
    missing:   docs.filter(d => d.status === 'missing').length,
    requested: docs.filter(d => d.status === 'requested').length,
    expired:   docs.filter(d => d.status === 'expired').length,
    expiring:  docs.filter(d => d.days_until_expiry != null && d.days_until_expiry >= 0 && d.days_until_expiry <= 30).length,
    present:   docs.filter(d => d.status === 'present').length,
  }

  return (
    <div className="p-6 space-y-5">

      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-[#d4a843]" />
        <div>
          <h1 className="text-xl font-bold text-white">Документы и дедлайны</h1>
          <p className="text-xs text-[#6b7280]">Контроль обязательных документов по всем клиентам</p>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Отсутствуют',     value: stats.missing,   color: 'text-[#6b7280]',    border: 'border-[#1e2535]' },
          { label: 'Запрошены',       value: stats.requested, color: 'text-blue-400',      border: 'border-blue-400/20' },
          { label: 'Истекают 30 дн.', value: stats.expiring,  color: 'text-orange-400',    border: 'border-orange-400/20' },
          { label: 'Просрочены',      value: stats.expired,   color: 'text-red-400',       border: 'border-red-400/20' },
          { label: 'Получены',        value: stats.present,   color: 'text-green-400',     border: 'border-green-400/20' },
        ].map(s => (
          <div key={s.label} className={clsx('bg-[#0d1017] border rounded-xl p-4', s.border)}>
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Фильтры + поиск */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-[#111520] border border-[#1e2535] rounded-lg p-1 flex-wrap">
          {FILTER_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                filter === t.key
                  ? 'bg-[#d4a843] text-[#0a0d14]'
                  : 'text-[#6b7280] hover:text-white'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по клиенту или документу..."
          className="flex-1 bg-[#111520] border border-[#1e2535] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
        />
      </div>

      <p className="text-xs text-[#4b5563]">
        {loading ? 'Загрузка...' : `${filtered.length} записей`}
      </p>

      {/* Таблица */}
      {!loading && (
        <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-[#4b5563]">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Документов не найдено</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2535] text-[10px] uppercase tracking-widest text-[#4b5563]">
                  <th className="text-left px-4 py-3">Клиент</th>
                  <th className="text-left px-4 py-3">Документ</th>
                  <th className="text-left px-4 py-3">Статус</th>
                  <th className="text-left px-4 py-3">Получен</th>
                  <th className="text-left px-4 py-3">Действителен до</th>
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
                        <p className="text-[10px] text-[#4b5563] mt-0.5">
                          {d.client_type === 'individual' ? 'Физлицо' : 'Юрлицо'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[#d1d5db] text-xs">{d.label}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('flex items-center gap-1.5 text-[10px] font-medium w-fit px-2 py-0.5 rounded-full', sc.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">
                        {d.received_at ? new Date(d.received_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className={clsx('px-4 py-3 text-xs font-medium', expiryColor(d.days_until_expiry))}>
                        {d.has_expiry ? expiryLabel(d.days_until_expiry, d.expires_at) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/clients/${d.client_id}?tab=docs`}
                          className="text-[10px] text-[#4b5563] hover:text-[#d4a843] transition-colors"
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
  )
}
