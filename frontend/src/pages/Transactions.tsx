import { useState, useEffect, useCallback, useRef } from 'react'
import { fmtDate } from '../utils/dates'
import {
  AlertTriangle, Shield, Clock, CheckCircle2, XCircle,
  ChevronRight, Plus, X, ChevronDown, Search, SlidersHorizontal
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'
import { toast } from '../components/Toast'
import { useSortable } from '../hooks/useSortable'
import SortTh from '../components/SortTh'
import EmptyState from '../components/EmptyState'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TxnItem {
  id: number
  client_id?: number
  client_name?: string
  amount: number
  currency: string
  amount_kgs?: number
  operation_date: string
  type_code?: string
  type_label?: string
  description?: string
  counterparty_name?: string
  counterparty_account?: string
  counterparty_bank?: string
  counterparty_country?: string
  is_mandatory_control: boolean
  auto_indicators: string[]
  manual_indicators: string[]
  all_indicators: string[]
  risk_score?: number
  status: string
  notes?: string
  created_at: string
}

interface Stats {
  total: number; new: number; mandatory: number
  suspicious: number; reviewing: number; reported: number; dismissed: number
}

interface OpType { code: string; label: string }
interface Indicator { code: string; group: string; label: string }
interface Client { id: number; display_name: string }

// ─── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONF: Record<string, { label: string; color: string; icon: any }> = {
  new:       { label: 'Новая',       color: 'bg-[#1e2535] text-[#6b7280]',     icon: Clock },
  reviewing: { label: 'На проверке', color: 'bg-blue-400/20 text-blue-400',    icon: Clock },
  reported:  { label: 'Подано СПО',  color: 'bg-orange-400/20 text-orange-400',icon: CheckCircle2 },
  dismissed: { label: 'Закрыта',     color: 'bg-green-400/20 text-green-400',  icon: XCircle },
}

function riskColor(score?: number) {
  if (score == null) return 'text-[#6b7280]'
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-green-400'
}

const FILTER_TABS = [
  { key: '',           label: 'Все' },
  { key: 'mandatory',  label: 'Обязат. контроль' },
  { key: 'suspicious', label: 'Подозрительные' },
  { key: 'new',        label: 'Новые' },
  { key: 'reviewing',  label: 'На проверке' },
  { key: 'reported',   label: 'Подано СПО' },
  { key: 'dismissed',  label: 'Закрыты' },
]

function fmtAmount(amount: number, currency: string, amountKgs?: number) {
  const main = `${amount.toLocaleString('ru-RU')} ${currency}`
  if (currency !== 'KGS' && amountKgs) {
    return `${main} ≈ ${amountKgs.toLocaleString('ru-RU')} сом`
  }
  return main
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Transactions() {
  const [txns, setTxns] = useState<TxnItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [opTypes, setOpTypes] = useState<OpType[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [clients, setClients] = useState<Client[]>([])

  // Расширенные фильтры (client-side)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [filterClient, setFilterClient] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCurrency, setFilterCurrency] = useState('')
  const [filterRisk, setFilterRisk] = useState('')

  const loadStats = useCallback(async () => {
    try { setStats((await api.get('/transactions/stats')).data) } catch {}
  }, [])

  const loadTxns = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {}
      if (filter === 'mandatory')  params.mandatory = true
      else if (filter === 'suspicious') {} // filtered client-side
      else if (filter && filter !== 'suspicious') params.status = filter
      if (search) params.search = search
      const res = await api.get('/transactions', { params })
      let data: TxnItem[] = res.data
      if (filter === 'suspicious') {
        data = data.filter(t => t.all_indicators.length > 0)
      }
      setTxns(data)
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    loadStats()
    api.get('/transactions/operation-types').then(r => setOpTypes(r.data))
    api.get('/transactions/indicators').then(r => setIndicators(r.data))
    api.get('/clients').then(r => setClients((r.data as any[]).map(c => ({
      id: c.id,
      display_name: c.display_name || `Клиент #${c.id}`
    }))))
  }, [])

  useEffect(() => { loadTxns() }, [loadTxns])

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.put(`/transactions/${id}`, { status })
      const label = STATUS_CONF[status]?.label ?? status
      toast(`Статус изменён: ${label}`)
      loadTxns(); loadStats()
    } catch {
      toast('Не удалось изменить статус', false)
    }
  }

  const indicatorGroups = indicators.reduce<Record<string, Indicator[]>>((acc, i) => {
    if (!acc[i.group]) acc[i.group] = []
    acc[i.group].push(i)
    return acc
  }, {})

  const currencies = Array.from(new Set(txns.map(t => t.currency))).sort()

  const hasAdvancedFilters = filterClient || filterDateFrom || filterDateTo || filterCurrency || filterRisk

  const displayedTxns = txns.filter(t => {
    if (filterClient && String(t.client_id) !== filterClient) return false
    if (filterDateFrom && t.operation_date < filterDateFrom) return false
    if (filterDateTo && t.operation_date > filterDateTo + 'T23:59:59') return false
    if (filterCurrency && t.currency !== filterCurrency) return false
    if (filterRisk) {
      const score = t.risk_score ?? 0
      if (filterRisk === 'critical' && score < 75) return false
      if (filterRisk === 'high' && (score < 50 || score >= 75)) return false
      if (filterRisk === 'medium' && (score < 25 || score >= 50)) return false
      if (filterRisk === 'low' && score >= 25) return false
    }
    return true
  })

  const resetAdvanced = () => {
    setFilterClient(''); setFilterDateFrom(''); setFilterDateTo('')
    setFilterCurrency(''); setFilterRisk('')
  }

  const { sorted: sortedTxns, sortKey: txnSortKey, sortDir: txnSortDir, toggle: toggleTxnSort } = useSortable(displayedTxns, 'operation_date', 'desc')

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="w-5 h-5 text-[#d4a843] flex-shrink-0" />
          <div>
            <h1 className="page-title">Подозрительные операции</h1>
            <p className="page-subtitle">{stats ? `${stats.total} операций` : '...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={clsx('transition-all duration-200 overflow-hidden', searchOpen || search ? 'w-56 opacity-100' : 'w-0 opacity-0')}>
            <div className="relative">
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
                placeholder="Клиент, контрагент, описание..."
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
          <button onClick={() => setShowForm(true)} className="btn-primary flex-shrink-0">
            <Plus className="w-4 h-4" />
            Добавить операцию
          </button>
        </div>
      </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-7 gap-2">
          {[
            { label: 'Всего',         value: stats.total,     color: 'text-white',      accent: '' },
            { label: 'Новых',         value: stats.new,       color: 'text-[#6b7280]',  accent: '' },
            { label: 'Обяз. контроль',value: stats.mandatory, color: 'text-yellow-400', accent: 'border-yellow-400/20' },
            { label: 'Подозрит.',     value: stats.suspicious,color: 'text-orange-400', accent: 'border-orange-400/20' },
            { label: 'На проверке',   value: stats.reviewing, color: 'text-blue-400',   accent: 'border-blue-400/20' },
            { label: 'Подано СПО',    value: stats.reported,  color: 'text-red-400',    accent: 'border-red-400/20' },
            { label: 'Закрыты',       value: stats.dismissed, color: 'text-green-400',  accent: 'border-green-400/20' },
          ].map(s => (
            <div key={s.label} className={clsx('stat-card', s.accent)}>
              <p className={clsx('stat-value', s.color)}>{s.value}</p>
              <p className="stat-label">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + search */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="tabs flex-wrap">
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={clsx('tab', filter === t.key && 'tab-active')}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className={clsx(
                'btn-ghost whitespace-nowrap',
                showAdvanced || hasAdvancedFilters ? 'border-[#d4a843]/40 bg-[#d4a843]/10 text-[#d4a843]' : ''
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Фильтры
              {hasAdvancedFilters && <span className="w-1.5 h-1.5 rounded-full bg-[#d4a843]" />}
            </button>
          </div>
        </div>

        {/* Расширенные фильтры */}
        {showAdvanced && (
          <div className="card p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className="form-label">Клиент</label>
                <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="form-input-sm">
                  <option value="">Все клиенты</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Дата с</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="form-input-sm" />
              </div>
              <div>
                <label className="form-label">Дата по</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="form-input-sm" />
              </div>
              <div>
                <label className="form-label">Валюта</label>
                <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} className="form-input-sm">
                  <option value="">Все</option>
                  {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Уровень риска</label>
                <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="form-input-sm">
                  <option value="">Все</option>
                  <option value="critical">Критический ≥75%</option>
                  <option value="high">Высокий 50–74%</option>
                  <option value="medium">Средний 25–49%</option>
                  <option value="low">Низкий &lt;25%</option>
                </select>
              </div>
            </div>
            {hasAdvancedFilters && (
              <button onClick={resetAdvanced} className="mt-3 text-xs text-[#6b7280] hover:text-white transition-colors">
                Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-[#4b5563]">
        <span>{loading ? 'Загрузка...' : `${displayedTxns.length} записей`}</span>
        {hasAdvancedFilters && <span className="text-[#d4a843]">· Применены фильтры</span>}
      </div>

      {/* Table */}
      {!loading && (
        <div className="card overflow-hidden">
          {displayedTxns.length === 0 ? (
            <EmptyState icon={Shield}
              title={search || filter || hasAdvancedFilters ? 'Операций не найдено' : 'Операций ещё нет'}
              action={!search && !filter && !hasAdvancedFilters ? { label: '+ Добавить первую операцию', onClick: () => setShowForm(true) } : undefined} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2535] bg-[#0d1017]">
                  <SortTh label="Дата"              field="operation_date" current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <SortTh label="Клиент"            field="client_name"    current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <SortTh label="Вид операции"      field="type_code"      current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <SortTh label="Сумма"             field="amount"         current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <SortTh label="Флаги"             field="all_indicators" current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <SortTh label="Риск"              field="risk_score"     current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <SortTh label="Статус"            field="status"         current={String(txnSortKey)} dir={txnSortDir} onSort={toggleTxnSort} className="px-4 py-3" />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedTxns.map(t => {
                  const sc = STATUS_CONF[t.status] ?? STATUS_CONF.new
                  const SIcon = sc.icon
                  const isSuspicious = t.all_indicators.length > 0
                  const rowBg = t.status === 'reported'
                    ? 'bg-orange-500/5'
                    : t.is_mandatory_control ? 'bg-yellow-500/5' : ''
                  const isExpanded = expandedId === t.id
                  return (
                    <>
                      <tr
                        key={t.id}
                        className={clsx('border-b border-[#1e2535] last:border-0 hover:bg-[#111520] cursor-pointer', rowBg)}
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      >
                        <td className="px-4 py-3 text-xs text-[#6b7280] whitespace-nowrap">
                          {fmtDate(t.operation_date)}
                        </td>
                        <td className="px-4 py-3">
                          {t.client_id ? (
                            <Link
                              to={`/clients/${t.client_id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[#d4a843] hover:underline text-xs flex items-center gap-1"
                            >
                              {t.client_name}
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-xs text-[#6b7280]">—</span>
                          )}
                          {t.counterparty_name && (
                            <p className="text-xs text-[#4b5563] mt-0.5">{t.counterparty_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {t.type_code && (
                            <span className="text-xs font-mono text-[#d4a843] bg-[#d4a843]/10 px-1.5 py-0.5 rounded mr-1">
                              {t.type_code}
                            </span>
                          )}
                          <span className="text-xs text-[#d1d5db]">{t.type_label || t.description || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-white font-medium">
                            {t.amount.toLocaleString('ru-RU')} {t.currency}
                          </span>
                          {t.currency !== 'KGS' && t.amount_kgs && (
                            <p className="text-xs text-[#4b5563]">≈ {t.amount_kgs.toLocaleString('ru-RU')} сом</p>
                          )}
                          {t.is_mandatory_control && (
                            <span className="text-xs bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-medium">
                              ОК
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isSuspicious ? (
                            <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full w-fit font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {t.all_indicators.length} признак(а)
                            </span>
                          ) : (
                            <span className="text-xs text-[#4b5563]">—</span>
                          )}
                        </td>
                        <td className={clsx('px-4 py-3 text-xs font-bold', riskColor(t.risk_score))}>
                          {t.risk_score != null ? `${t.risk_score}%` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('flex items-center gap-1.5 text-xs font-medium w-fit px-2 py-0.5 rounded-full', sc.color)}>
                            <SIcon className="w-3 h-3" />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronDown className={clsx('w-4 h-4 text-[#4b5563] transition-transform', isExpanded && 'rotate-180')} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${t.id}-exp`} className="border-b border-[#1e2535] bg-[#0d1017]">
                          <td colSpan={8} className="px-4 py-4">
                            <ExpandedRow txn={t} indicators={indicators} onStatusChange={updateStatus} onRefresh={() => { loadTxns(); loadStats() }} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <AddTransactionModal
          opTypes={opTypes}
          indicatorGroups={indicatorGroups}
          clients={clients}
          onClose={() => setShowForm(false)}
          onSaved={() => { loadTxns(); loadStats(); setShowForm(false) }}
        />
      )}
      </div>
    </div>
  )
}

// ─── Expanded row ──────────────────────────────────────────────────────────────

function ExpandedRow({ txn, indicators, onStatusChange, onRefresh }: {
  txn: TxnItem
  indicators: Indicator[]
  onStatusChange: (id: number, status: string) => void
  onRefresh: () => void
}) {
  const [manualInd, setManualInd] = useState<string[]>(txn.manual_indicators)
  const [notes, setNotes] = useState(txn.notes || '')
  const [saving, setSaving] = useState(false)

  const indicatorMap = Object.fromEntries(indicators.map(i => [i.code, i]))

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/transactions/${txn.id}`, { manual_indicators: manualInd, notes })
      toast('Операция обновлена')
      onRefresh()
    } catch {
      toast('Не удалось сохранить', false)
    } finally { setSaving(false) }
  }

  const toggleInd = (code: string) => {
    setManualInd(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const groupedIndicators = indicators.reduce<Record<string, Indicator[]>>((acc, i) => {
    if (!acc[i.group]) acc[i.group] = []
    acc[i.group].push(i)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-xs">
        {/* Info */}
        <div className="space-y-1 text-[#6b7280]">
          {txn.description && <p><span className="text-[#4b5563]">Описание:</span> {txn.description}</p>}
          {txn.counterparty_name && <p><span className="text-[#4b5563]">Контрагент:</span> {txn.counterparty_name}</p>}
          {txn.counterparty_bank && <p><span className="text-[#4b5563]">Банк:</span> {txn.counterparty_bank}</p>}
          {txn.counterparty_account && <p><span className="text-[#4b5563]">Счёт:</span> <span className="font-mono">{txn.counterparty_account}</span></p>}
          {txn.counterparty_country && <p><span className="text-[#4b5563]">Страна:</span> {txn.counterparty_country}</p>}
        </div>

        {/* Auto-detected indicators */}
        <div>
          <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-2">Автодетектированные признаки</p>
          {txn.auto_indicators.length === 0 ? (
            <p className="text-[#4b5563] text-xs">Нет</p>
          ) : (
            <div className="space-y-1">
              {txn.auto_indicators.map(code => (
                <div key={code} className="flex items-start gap-2">
                  <span className="text-xs font-mono text-[#d4a843] bg-[#d4a843]/10 px-1.5 py-0.5 rounded shrink-0">{code}</span>
                  <span className="text-xs text-[#9ca3af]">{indicatorMap[code]?.label || code}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes + actions */}
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Комментарий..."
            rows={3}
            className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
          />
          <div className="flex gap-2 flex-wrap">
            {txn.status === 'new' && (
              <button onClick={() => onStatusChange(txn.id, 'reviewing')} className="btn-secondary-sm">
                На проверку
              </button>
            )}
            {(txn.status === 'new' || txn.status === 'reviewing') && (
              <>
                <button onClick={() => onStatusChange(txn.id, 'reported')}
                  className="btn-secondary-sm text-orange-400 border-orange-400/20 hover:border-orange-400/40">
                  Подать СПО
                </button>
                <button onClick={() => onStatusChange(txn.id, 'dismissed')}
                  className="btn-secondary-sm text-green-400 border-green-400/20 hover:border-green-400/40">
                  Закрыть
                </button>
              </>
            )}
            <button onClick={save} disabled={saving} className="btn-primary-sm disabled:opacity-50">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>

      {/* Manual indicators */}
      <div>
        <p className="text-xs uppercase tracking-wider text-[#4b5563] mb-2">Признаки (ручная разметка)</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(groupedIndicators).map(([group, items]) => (
            <div key={group}>
              <p className="text-xs text-[#6b7280] font-medium mb-1.5">{group}</p>
              <div className="space-y-1">
                {items.map(ind => (
                  <label key={ind.code} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={manualInd.includes(ind.code)}
                      onChange={() => toggleInd(ind.code)}
                      className="mt-0.5 accent-[#d4a843]"
                    />
                    <span className="text-xs text-[#9ca3af] group-hover:text-white transition-colors">
                      <span className="font-mono text-[#d4a843]/70">{ind.code}</span> {ind.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Add Transaction Modal ─────────────────────────────────────────────────────

function AddTransactionModal({ opTypes, indicatorGroups, clients, onClose, onSaved }: {
  opTypes: OpType[]
  indicatorGroups: Record<string, Indicator[]>
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    client_id: '' as string | number,
    amount: '',
    currency: 'KGS',
    operation_date: new Date().toISOString().slice(0, 16),
    type_code: '',
    description: '',
    counterparty_name: '',
    counterparty_account: '',
    counterparty_bank: '',
    counterparty_country: '',
    notes: '',
  })
  const [manualInd, setManualInd] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/transactions', {
        ...form,
        client_id: form.client_id ? Number(form.client_id) : null,
        amount: Number(form.amount),
        manual_indicators: manualInd,
      })
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ошибка сохранения')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box max-w-2xl">
        <div className="modal-header">
          <h2 className="font-semibold text-white">Новая операция</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="modal-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Клиент</label>
              <select value={form.client_id} onChange={e => set('client_id', e.target.value)} className="form-input">
                <option value="">— Без клиента —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Дата операции</label>
              <input type="datetime-local" value={form.operation_date} onChange={e => set('operation_date', e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Сумма</label>
              <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} required placeholder="0" className="form-input" />
            </div>
            <div>
              <label className="form-label">Валюта</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className="form-input">
                {['KGS','USD','EUR','RUB','USDT','BTC'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Вид операции</label>
            <select value={form.type_code} onChange={e => set('type_code', e.target.value)} className="form-input">
              <option value="">— Не указан —</option>
              {opTypes.map(o => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Описание</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Назначение операции" className="form-input" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Контрагент</label>
              <input value={form.counterparty_name} onChange={e => set('counterparty_name', e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Страна контрагента</label>
              <input value={form.counterparty_country} onChange={e => set('counterparty_country', e.target.value)} placeholder="RU, KZ, US..." className="form-input" />
            </div>
            <div>
              <label className="form-label">Банк контрагента</label>
              <input value={form.counterparty_bank} onChange={e => set('counterparty_bank', e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Счёт / адрес</label>
              <input value={form.counterparty_account} onChange={e => set('counterparty_account', e.target.value)} className="form-input" />
            </div>
          </div>

          <div>
            <p className="form-label mb-2">Признаки подозрительности</p>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              {Object.entries(indicatorGroups).map(([group, items]) => (
                <div key={group}>
                  <p className="text-xs text-[#6b7280] font-medium mb-1">{group}</p>
                  <div className="space-y-1">
                    {items.map(ind => (
                      <label key={ind.code} className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={manualInd.includes(ind.code)}
                          onChange={() => setManualInd(p => p.includes(ind.code) ? p.filter(c => c !== ind.code) : [...p, ind.code])}
                          className="mt-0.5 accent-[#d4a843]" />
                        <span className="text-xs text-[#9ca3af]">
                          <span className="font-mono text-[#d4a843]/70">{ind.code}</span> {ind.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Комментарий</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="form-input resize-none" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">Отмена</button>
          <button type="submit" onClick={submit} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  )
}
