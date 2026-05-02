import { useState, useRef } from 'react'
import { fmtDate } from '../utils/dates'
import { useAuthStore } from '../store/authStore'
import {
  BarChart2, Users, AlertTriangle, FileText, Shield,
  Download, Play, ChevronRight, X, CheckCircle2
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = 'clients' | 'transactions' | 'documents' | 'sanctions' | 'summary'

interface ReportDef {
  key: ReportType
  title: string
  description: string
  icon: any
  color: string
  border: string
  filters: FilterDef[]
}

interface FilterDef {
  key: string
  label: string
  type: 'date' | 'select'
  options?: { value: string; label: string }[]
}

// ─── Report definitions ───────────────────────────────────────────────────────

const REPORTS: ReportDef[] = [
  {
    key: 'clients',
    title: 'Реестр клиентов',
    description: 'Список клиентов с уровнями риска, статусами онбординга и идентификационными данными.',
    icon: Users,
    color: '#3b82f6',
    border: 'border-blue-400/30',
    filters: [
      { key: 'date_from', label: 'Добавлен с', type: 'date' },
      { key: 'date_to',   label: 'Добавлен по', type: 'date' },
      { key: 'client_type', label: 'Тип клиента', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'individual', label: 'Физлицо' },
        { value: 'legal', label: 'Юрлицо' },
      ]},
      { key: 'risk_level', label: 'Уровень риска', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'low', label: 'Низкий' },
        { value: 'medium', label: 'Средний' },
        { value: 'high', label: 'Высокий' },
        { value: 'critical', label: 'Критический' },
      ]},
      { key: 'onboarding_status', label: 'Статус', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'pending', label: 'Ожидает' },
        { value: 'in_progress', label: 'В процессе' },
        { value: 'approved', label: 'Одобрен' },
        { value: 'rejected', label: 'Отклонён' },
      ]},
    ],
  },
  {
    key: 'transactions',
    title: 'Подозрительные операции и СПО',
    description: 'Операции с признаками ПОД/ФТ, операции обязательного контроля, направленные сообщения в ГСФР.',
    icon: AlertTriangle,
    color: '#f97316',
    border: 'border-orange-400/30',
    filters: [
      { key: 'date_from', label: 'Дата с', type: 'date' },
      { key: 'date_to',   label: 'Дата по', type: 'date' },
      { key: 'status', label: 'Статус', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'new', label: 'Новые' },
        { value: 'reviewing', label: 'На проверке' },
        { value: 'reported', label: 'Подано СПО' },
        { value: 'dismissed', label: 'Закрыты' },
      ]},
      { key: 'mandatory', label: 'Обяз. контроль', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'true', label: 'Только ОК' },
        { value: 'false', label: 'Без ОК' },
      ]},
    ],
  },
  {
    key: 'documents',
    title: 'Контроль документов',
    description: 'Просроченные, отсутствующие и истекающие документы клиентов по обязательному перечню.',
    icon: FileText,
    color: '#ef4444',
    border: 'border-red-400/30',
    filters: [
      { key: 'status', label: 'Статус', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'expired', label: 'Просрочены' },
        { value: 'missing', label: 'Отсутствуют' },
        { value: 'requested', label: 'Запрошены' },
        { value: 'present', label: 'Получены' },
      ]},
      { key: 'expiring_days', label: 'Истекают через (дней)', type: 'select', options: [
        { value: '', label: 'Не ограничивать' },
        { value: '7', label: '7 дней' },
        { value: '30', label: '30 дней' },
        { value: '90', label: '90 дней' },
      ]},
      { key: 'client_type', label: 'Тип клиента', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'individual', label: 'Физлицо' },
        { value: 'legal', label: 'Юрлицо' },
      ]},
    ],
  },
  {
    key: 'sanctions',
    title: 'Санкционные проверки',
    description: 'История проверок по санкционным спискам: OFAC, EU, UN, UK OFSI, ГСФР КР.',
    icon: Shield,
    color: '#8b5cf6',
    border: 'border-purple-400/30',
    filters: [
      { key: 'date_from', label: 'Дата с', type: 'date' },
      { key: 'date_to',   label: 'Дата по', type: 'date' },
      { key: 'result', label: 'Результат', type: 'select', options: [
        { value: '', label: 'Все' },
        { value: 'clear', label: 'Чисто' },
        { value: 'possible_match', label: 'Возможное совпадение' },
        { value: 'match', label: 'Совпадение' },
      ]},
    ],
  },
  {
    key: 'summary',
    title: 'Сводный отчёт для ГСФР',
    description: 'Агрегированная статистика за период: клиенты, операции, документы, санкции. Для квартальной отчётности.',
    icon: BarChart2,
    color: '#d4a843',
    border: 'border-[#d4a843]/30',
    filters: [
      { key: 'date_from', label: 'Период с', type: 'date' },
      { key: 'date_to',   label: 'Период по', type: 'date' },
    ],
  },
]

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: Record<ReportType, { key: string; label: string; render?: (v: any, row: any) => any }[]> = {
  clients: [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Клиент' },
    { key: 'doc_id', label: 'ИНН / Паспорт' },
    { key: 'client_type', label: 'Тип' },
    { key: 'risk_level', label: 'Риск', render: (v) => v
      ? <span className={clsx('text-xs font-medium', {
          'text-green-400': v === 'Низкий', 'text-yellow-400': v === 'Средний',
          'text-orange-400': v === 'Высокий', 'text-red-400': v === 'Критический',
        })}>{v}</span>
      : <span className="text-[#4b5563]">—</span>
    },
    { key: 'risk_score', label: 'Балл', render: (v) => v != null ? `${v}%` : '—' },
    { key: 'onboarding_status', label: 'Статус' },
    { key: 'created_at', label: 'Добавлен', render: (v) => fmtDate(v) },
  ],
  transactions: [
    { key: 'operation_date', label: 'Дата', render: (v) => fmtDate(v) },
    { key: 'client_name', label: 'Клиент', render: (v, row) => v
      ? <Link to={`/clients/${row.id}`} className="text-[#d4a843] hover:underline">{v}</Link>
      : '—'
    },
    { key: 'amount', label: 'Сумма', render: (v, row) => `${v.toLocaleString('ru-RU')} ${row.currency}` },
    { key: 'amount_kgs', label: 'Сумма KGS', render: (v) => v ? `${v.toLocaleString('ru-RU')}` : '—' },
    { key: 'type_label', label: 'Вид операции', render: (v, row) => (
      <span>
        {row.type_code && <span className="font-mono text-xs text-[#d4a843] mr-1">{row.type_code}</span>}
        {v || '—'}
      </span>
    )},
    { key: 'counterparty_name', label: 'Контрагент', render: (v) => v || '—' },
    { key: 'counterparty_country', label: 'Страна', render: (v) => v || '—' },
    { key: 'indicators', label: 'Признаки', render: (v) => v?.length > 0
      ? <span className="text-orange-400 text-xs">{v.length} признак(а)</span>
      : <span className="text-[#4b5563]">—</span>
    },
    { key: 'risk_score', label: 'Риск', render: (v) => v != null
      ? <span className={clsx('font-bold text-xs', v >= 75 ? 'text-red-400' : v >= 50 ? 'text-orange-400' : v >= 25 ? 'text-yellow-400' : 'text-green-400')}>{v}%</span>
      : '—'
    },
    { key: 'status', label: 'Статус' },
  ],
  documents: [
    { key: 'client_name', label: 'Клиент' },
    { key: 'client_type', label: 'Тип' },
    { key: 'label', label: 'Документ' },
    { key: 'status', label: 'Статус', render: (v) => {
      const conf: Record<string, string> = {
        expired: 'text-red-400', missing: 'text-[#6b7280]',
        requested: 'text-blue-400', present: 'text-green-400',
      }
      const labels: Record<string, string> = {
        expired: 'Просрочен', missing: 'Отсутствует', requested: 'Запрошен', present: 'Получен',
      }
      return <span className={clsx('text-xs', conf[v] || '')}>{labels[v] || v}</span>
    }},
    { key: 'received_at', label: 'Получен', render: (v) => fmtDate(v) },
    { key: 'expires_at', label: 'Действителен до', render: (v) => fmtDate(v) },
    { key: 'days_until_expiry', label: 'Осталось дней', render: (v) => {
      if (v == null) return '—'
      if (v <= 0) return <span className="text-red-400 font-medium">Истёк</span>
      if (v <= 7) return <span className="text-red-400 font-medium">{v} дн.</span>
      if (v <= 30) return <span className="text-orange-400">{v} дн.</span>
      return <span className="text-[#6b7280]">{v} дн.</span>
    }},
  ],
  sanctions: [
    { key: 'checked_at', label: 'Дата', render: (v) => fmtDate(v) },
    { key: 'checked_name', label: 'Проверяемое имя' },
    { key: 'result', label: 'Результат', render: (v) => {
      const conf: Record<string, string> = {
        clear: 'text-green-400', match: 'text-red-400', possible_match: 'text-yellow-400',
      }
      const labels: Record<string, string> = { clear: 'Чисто', match: 'Совпадение', possible_match: 'Возможное' }
      return <span className={clsx('font-medium text-xs', conf[v] || '')}>{labels[v] || v}</span>
    }},
    { key: 'lists_checked', label: 'Списки', render: (v) => v?.join(', ') || '—' },
  ],
  summary: [],
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Reports() {
  const token = useAuthStore(s => s.token)
  const [selected, setSelected] = useState<ReportType | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [data, setData] = useState<any[] | null>(null)
  const [summary, setSummary] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const def = REPORTS.find(r => r.key === selected)

  const setFilter = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }))

  const generate = async () => {
    if (!selected) return
    setLoading(true); setError(''); setData(null); setSummary(null)
    try {
      const params: Record<string, string> = {}
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
      if (selected === 'summary') {
        const res = await api.get('/reports/summary', { params })
        setSummary(res.data)
      } else {
        const res = await api.get(`/reports/${selected}`, { params })
        setData(res.data)
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка загрузки')
    } finally { setLoading(false) }
  }

  const downloadCsv = () => {
    if (!selected || selected === 'summary') return
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const url = `/api/reports/${selected}/csv?${params.toString()}`
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `report_${selected}_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
      })
  }

  const selectReport = (key: ReportType) => {
    setSelected(key); setFilters({}); setData(null); setSummary(null); setError('')
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="w-6 h-6 text-[#d4a843]" />
        <div>
          <h1 className="text-xl font-bold text-white">Отчёты</h1>
          <p className="text-xs text-[#6b7280]">Формирование и экспорт отчётов для регулятора и внутреннего контроля</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: report selector */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-3">Вид отчёта</p>
          {REPORTS.map(r => {
            const Icon = r.icon
            const isActive = selected === r.key
            return (
              <button
                key={r.key}
                onClick={() => selectReport(r.key)}
                className={clsx(
                  'w-full text-left p-4 rounded-xl border transition-all',
                  isActive
                    ? `bg-[#0d1017] ${r.border} shadow-lg`
                    : 'bg-[#0d1017] border-[#1e2535] hover:border-[#2d3748]'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${r.color}15` }}>
                    <Icon className="w-4 h-4" style={{ color: r.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-semibold', isActive ? 'text-white' : 'text-[#9ca3af]')}>
                      {r.title}
                    </p>
                    <p className="text-xs text-[#4b5563] mt-0.5 line-clamp-2">{r.description}</p>
                  </div>
                  <ChevronRight className={clsx('w-4 h-4 shrink-0', isActive ? 'text-[#d4a843]' : 'text-[#1e2535]')} />
                </div>
              </button>
            )
          })}
        </div>

        {/* Right: filters + results */}
        <div className="lg:col-span-2 space-y-4">
          {!selected && (
            <div className="flex items-center justify-center h-64 text-[#374151] bg-[#0d1017] border border-[#1e2535] rounded-xl">
              <div className="text-center">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Выберите вид отчёта</p>
              </div>
            </div>
          )}

          {def && (
            <>
              {/* Filter panel */}
              <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{def.title}</p>
                  <p className="text-xs text-[#4b5563]">{def.description.slice(0, 60)}...</p>
                </div>

                {def.filters.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {def.filters.map(f => (
                      <div key={f.key}>
                        <label className="text-xs uppercase tracking-wider text-[#4b5563] mb-1 block">
                          {f.label}
                        </label>
                        {f.type === 'date' ? (
                          <input
                            type="date"
                            value={filters[f.key] || ''}
                            onChange={e => setFilter(f.key, e.target.value)}
                            className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50"
                          />
                        ) : (
                          <select
                            value={filters[f.key] || ''}
                            onChange={e => setFilter(f.key, e.target.value)}
                            className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50"
                          >
                            {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#e0b84d] disabled:opacity-50 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    {loading ? 'Формирование...' : 'Сформировать'}
                  </button>
                  {(data || summary) && selected !== 'summary' && (
                    <button
                      onClick={downloadCsv}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Скачать CSV
                    </button>
                  )}
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
              </div>

              {/* Summary report */}
              {summary && <SummaryView data={summary} />}

              {/* Table results */}
              {data && selected && selected !== 'summary' && (
                <ResultTable
                  data={data}
                  columns={COLUMNS[selected as ReportType]}
                  reportKey={selected as ReportType}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Summary view ─────────────────────────────────────────────────────────────

function SummaryView({ data }: { data: any }) {
  return (
    <div className="bg-[#0d1017] border border-[#d4a843]/20 rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Сводный отчёт</p>
        <p className="text-xs text-[#4b5563]">{data.period_from} — {data.period_to}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Clients */}
        <div className="bg-[#111520] rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-3 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> Клиенты
          </p>
          <div className="space-y-1.5">
            <Row label="Всего активных" value={data.clients_total} />
            <Row label="Добавлено за период" value={data.clients_new} highlight />
            {Object.entries(data.clients_by_risk as Record<string, number>).map(([k, v]) => (
              <Row key={k} label={k} value={v} />
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-[#111520] rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Операции
          </p>
          <div className="space-y-1.5">
            <Row label="Всего за период" value={data.transactions_total} />
            <Row label="Обязательный контроль (≥600k)" value={data.transactions_mandatory} highlight={data.transactions_mandatory > 0} />
            <Row label="С признаками ПОД/ФТ" value={data.transactions_suspicious} highlight={data.transactions_suspicious > 0} />
            <Row label="Направлено СПО" value={data.transactions_reported} highlight={data.transactions_reported > 0} />
          </div>
        </div>

        {/* Documents */}
        <div className="bg-[#111520] rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-3 flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Документы
          </p>
          <div className="space-y-1.5">
            <Row label="Просрочено" value={data.documents_expired} highlight={data.documents_expired > 0} warn />
            <Row label="Отсутствуют" value={data.documents_missing} />
          </div>
        </div>

        {/* Sanctions */}
        <div className="bg-[#111520] rounded-lg p-4">
          <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-3 flex items-center gap-1.5">
            <Shield className="w-3 h-3" /> Санкции
          </p>
          <div className="space-y-1.5">
            <Row label="Проверок за период" value={data.sanctions_checks} />
            <Row label="Совпадений / возможных" value={data.sanctions_matches} highlight={data.sanctions_matches > 0} warn />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <p className="text-xs text-green-400">
          Отчёт сформирован {fmtDate(new Date())} — готов для направления в ГСФР
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, highlight = false, warn = false }: {
  label: string; value: number; highlight?: boolean; warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#6b7280]">{label}</span>
      <span className={clsx('text-xs font-bold',
        warn && value > 0 ? 'text-red-400' :
        highlight && value > 0 ? 'text-[#d4a843]' : 'text-white'
      )}>
        {value}
      </span>
    </div>
  )
}

// ─── Result table ─────────────────────────────────────────────────────────────

function ResultTable({ data, columns, reportKey }: {
  data: any[]
  columns: { key: string; label: string; render?: (v: any, row: any) => any }[]
  reportKey: ReportType
}) {
  if (data.length === 0) {
    return (
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl py-12 text-center text-[#4b5563]">
        <p className="text-sm">Данных не найдено по заданным фильтрам</p>
      </div>
    )
  }

  return (
    <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2535]">
        <p className="text-xs text-[#6b7280]">{data.length} записей</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2535] text-xs uppercase tracking-wider text-[#4b5563]">
              {columns.map(c => (
                <th key={c.key} className="text-left px-4 py-3 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-[#111520] last:border-0 hover:bg-[#111520]">
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-2.5 text-xs text-[#d1d5db] whitespace-nowrap">
                    {col.render
                      ? col.render(row[col.key], row)
                      : row[col.key] != null ? String(row[col.key]) : '—'
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
