import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Search, Users, Building2,
  ChevronRight, AlertCircle, BookUser,
  Clock, XCircle, PauseCircle, RefreshCw, CheckCircle2,
  ShieldAlert, SlidersHorizontal, X, Trash2, Archive
} from 'lucide-react'
import { clientsApi } from '../api/clients'
import clsx from 'clsx'
import { useSortable } from '../hooks/useSortable'
import EmptyState from '../components/EmptyState'
import SortTh from '../components/SortTh'
import { fmtDate } from '../utils/dates'

// ─── Справочники ──────────────────────────────────────────────────────────────

const ONBOARDING_STATUS: Record<string, { label: string; badge: string; icon: any }> = {
  new:                 { label: 'Новый',              badge: 'badge-neutral', icon: Clock },
  pending:             { label: 'Ожидает',            badge: 'badge-warning', icon: Clock },
  in_progress:         { label: 'В процессе',         badge: 'badge-info',    icon: RefreshCw },
  documents_requested: { label: 'Запрос документов',  badge: 'badge-info',    icon: RefreshCw },
  under_review:        { label: 'На проверке',        badge: 'badge-warning', icon: RefreshCw },
  approved:            { label: 'Активен',            badge: 'badge-success', icon: CheckCircle2 },
  rejected:            { label: 'Отказ',              badge: 'badge-danger',  icon: XCircle },
  suspended:           { label: 'Приостановлен',      badge: 'badge-orange',  icon: PauseCircle },
}

const RISK_LEVEL: Record<string, { label: string; badge: string }> = {
  low:      { label: 'Низкий',       badge: 'badge-risk-low' },
  medium:   { label: 'Средний',      badge: 'badge-risk-medium' },
  high:     { label: 'Высокий',      badge: 'badge-risk-high' },
  critical: { label: 'Неприемлемый', badge: 'badge-risk-critical' },
}

// ─── Модальное окно создания клиента ──────────────────────────────────────────

function CreateClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [clientType, setClientType] = useState<'individual' | 'legal'>('individual')
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [managerCode, setManagerCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    setError('')
    setLoading(true)
    try {
      const { data } = await clientsApi.create({
        client_type: clientType,
        contract_number: contractNumber || undefined,
        contract_date: contractDate || undefined,
        manager_code: managerCode || undefined,
      })
      onCreated(data.id)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка создания')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay animate-scale-in">
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="text-base font-bold text-white">Новый клиент</h2>
        </div>

        <div className="modal-body">
          {/* Тип клиента */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'individual', label: 'Физическое лицо', icon: Users },
              { value: 'legal', label: 'Юридическое лицо', icon: Building2 },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setClientType(value as any)}
                className={clsx(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-150 text-sm font-medium',
                  clientType === value
                    ? 'border-[#d4a843]/50 bg-[#d4a843]/10 text-[#d4a843]'
                    : 'border-[#1e2535] text-[#6b7280] hover:border-[#2d3748] hover:text-white hover:bg-[#1e2535]/40'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="form-label">Номер договора</label>
            <input value={contractNumber} onChange={e => setContractNumber(e.target.value)}
              className="form-input" placeholder="Например: 2024-001" />
          </div>
          <div>
            <label className="form-label">Дата договора</label>
            <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="form-label">Код менеджера (4 цифры)</label>
            <input value={managerCode}
              onChange={e => setManagerCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="form-input" placeholder="0000" maxLength={4} />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary">Отмена</button>
          <button onClick={handleCreate} disabled={loading} className="btn-primary">
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Основная страница ────────────────────────────────────────────────────────

export default function Clients() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  // Поиск
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Фильтры — инициализация из URL params (для deep-link из дашборда)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [filterType, setFilterType] = useState(searchParams.get('type') || '')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '')
  const [filterRisk, setFilterRisk] = useState(searchParams.get('risk') || '')
  const [filterResident, setFilterResident] = useState('')
  const [filterManager, setFilterManager] = useState('')
  const [filterHRC, setFilterHRC] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')

  const { sorted: sortedClients, sortKey, sortDir, toggle } = useSortable(clients, 'display_name')

  const managerCodes = useMemo(() =>
    [...new Set(clients.map(c => c.manager_code).filter(Boolean))].sort(),
    [clients]
  )

  // Активные фильтры для чипов
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string }[] = []
    if (filterType) chips.push({ key: 'type', label: filterType === 'individual' ? 'ФЛ' : 'ЮЛ' })
    if (filterResident !== '') chips.push({ key: 'resident', label: filterResident === 'true' ? 'Резидент' : 'Нерезидент' })
    if (filterHRC === 'true') chips.push({ key: 'hrc', label: 'Высокорисковая страна' })
    if (filterManager) chips.push({ key: 'manager', label: `Менеджер ${filterManager}` })
    if (filterStatus) chips.push({ key: 'status', label: ONBOARDING_STATUS[filterStatus]?.label })
    if (filterRisk) chips.push({ key: 'risk', label: RISK_LEVEL[filterRisk]?.label })
    if (filterDateFrom) chips.push({ key: 'dateFrom', label: `Договор с ${filterDateFrom}` })
    return chips
  }, [filterType, filterResident, filterHRC, filterManager, filterStatus, filterRisk, filterDateFrom])

  const removeChip = (key: string) => {
    if (key === 'type') setFilterType('')
    if (key === 'resident') setFilterResident('')
    if (key === 'hrc') setFilterHRC('')
    if (key === 'manager') setFilterManager('')
    if (key === 'status') setFilterStatus('')
    if (key === 'risk') setFilterRisk('')
    if (key === 'dateFrom') setFilterDateFrom('')
  }

  const resetAll = () => {
    setFilterType(''); setFilterResident(''); setFilterHRC('')
    setFilterManager(''); setFilterStatus(''); setFilterRisk('')
    setFilterDateFrom('')
  }

  // Закрытие дропдауна по клику снаружи
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadClients = async () => {
    setLoading(true)
    try {
      const { data } = await clientsApi.list({
        search: search || undefined,
        client_type: filterType || undefined,
        status: filterStatus || undefined,
        risk_level: filterRisk || undefined,
        is_resident: filterResident === '' ? undefined : filterResident === 'true',
        manager_code: filterManager || undefined,
        is_high_risk_country: filterHRC === '' ? undefined : filterHRC === 'true',
        contract_date_from: filterDateFrom || undefined,
      })
      setClients(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClients()
  }, [search, filterType, filterStatus, filterRisk, filterResident, filterManager, filterHRC, filterDateFrom])

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiveCount, setArchiveCount] = useState(0)

  useEffect(() => {
    clientsApi.listArchived().then(r => setArchiveCount(r.data.length)).catch(() => {})
  }, [])

  const handleCreated = (id: number) => {
    setShowCreate(false)
    navigate(`/clients/${id}`)
  }

  const handleArchive = async () => {
    if (!deleteTarget) return
    try {
      await clientsApi.archive(deleteTarget.id, archiveReason.trim() || undefined)
      setClients(prev => prev.filter(c => c.id !== deleteTarget.id))
    } catch (e) {
      console.error(e)
    } finally {
      setDeleteTarget(null)
      setArchiveReason('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <BookUser className="w-5 h-5 text-[#d4a843]" />
          <div>
            <h1 className="page-title">Реестр клиентов</h1>
            <p className="page-subtitle">{clients.length} клиентов</p>
          </div>
        </div>

        {/* Поиск + Фильтры + Кнопка — правая часть заголовка */}
        <div className="flex items-center gap-2">
          {/* Поиск — разворачивается влево при клике */}
          <div className={clsx(
            'transition-all duration-200 overflow-hidden',
            searchOpen || search ? 'w-56 opacity-100' : 'w-0 opacity-0'
          )}>
            <div className="relative">
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
                placeholder="Имя или номер договора..."
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg pl-3 pr-8 py-2 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
              />
              {search && (
                <button onClick={() => { setSearch(''); setSearchOpen(false) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Иконка поиска */}
          <button
            onClick={() => { setSearchOpen(v => !v); if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 50) }}
            className={clsx(
              'p-2 rounded-lg border transition-colors flex-shrink-0',
              searchOpen || search
                ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5'
                : 'border-[#1e2535] text-[#4b5563] hover:text-white hover:border-[#374151]'
            )}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Кнопка фильтров с бейджем */}
          <div ref={filterRef} className="relative flex-shrink-0">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
              filterOpen || activeFilters.length > 0
                ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5'
                : 'border-[#1e2535] text-[#6b7280] hover:text-white hover:border-[#374151]'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Фильтры</span>
            {activeFilters.length > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#d4a843] text-[#0a0d14] text-[10px] font-bold px-1">
                {activeFilters.length}
              </span>
            )}
          </button>

          {/* Дропдаун фильтров */}
          {filterOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-[#111520] border border-[#1e2535] rounded-xl shadow-2xl z-30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1">Тип</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                    <option value="">Все</option>
                    <option value="individual">ФЛ</option>
                    <option value="legal">ЮЛ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1">Резидентство</label>
                  <select value={filterResident} onChange={e => setFilterResident(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                    <option value="">Все</option>
                    <option value="true">Резидент</option>
                    <option value="false">Нерезидент</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1">Статус</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                    <option value="">Все</option>
                    {Object.entries(ONBOARDING_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1">Риск</label>
                  <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                    <option value="">Все</option>
                    {Object.entries(RISK_LEVEL).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1">Менеджер</label>
                  <select value={filterManager} onChange={e => setFilterManager(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                    <option value="">Все</option>
                    {managerCodes.map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#4b5563] mb-1">Страна</label>
                  <select value={filterHRC} onChange={e => setFilterHRC(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                    <option value="">Все</option>
                    <option value="true">ВРС</option>
                    <option value="false">Прочие</option>
                  </select>
                </div>
              </div>

              {/* Дата договора */}
              <div>
                <label className="block text-xs text-[#4b5563] mb-1">Договор от</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50" />
              </div>

              {activeFilters.length > 0 && (
                <button onClick={resetAll}
                  className="w-full text-xs text-[#6b7280] hover:text-white border border-[#1e2535] hover:border-[#374151] rounded-lg py-1.5 transition-colors">
                  Сбросить всё
                </button>
              )}
            </div>
          )}
        </div>

          <button
            onClick={() => navigate('/archive')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1e2535] text-[#6b7280] hover:text-white hover:border-[#374151] text-sm transition-colors flex-shrink-0"
          >
            <Archive className="w-4 h-4" />
            <span className="hidden sm:block">Архив</span>
            {archiveCount > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-orange-400/20 text-orange-400">
                {archiveCount}
              </span>
            )}
          </button>
          <button
            className="btn-primary flex items-center gap-2 flex-shrink-0"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-4 h-4" />
            Добавить клиента
          </button>
        </div>
      </div>

      {/* Активные фильтры + таблица */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeFilters.map(f => (
            <span key={f.key} className="badge badge-gold">
              {f.label}
              <button onClick={() => removeChip(f.key)} className="hover:text-white transition-colors ml-0.5">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Таблица */}
      <div className="card overflow-hidden">
        {/* Заголовки */}
        <div className="grid grid-cols-[70px_1fr_1fr_2fr_1fr_80px_1fr_80px_40px] gap-3 px-4 py-2.5 border-b border-[#1e2535] bg-[#080c13]">
          {[
            { label: 'Тип',           field: 'client_type' },
            { label: '№ Договора',    field: 'contract_number' },
            { label: 'Дата договора', field: 'contract_date' },
            { label: 'Клиент',        field: 'display_name' },
            { label: 'Страна',        field: 'country' },
            { label: 'Менеджер',      field: 'manager_code' },
            { label: 'Статус',        field: 'onboarding_status' },
            { label: 'Риск',          field: 'risk_level' },
          ].map(h => (
            <SortTh key={h.field} as="div" label={h.label} field={h.field}
              current={String(sortKey)} dir={sortDir} onSort={toggle} />
          ))}
          <span />
        </div>

        {/* Строки */}
        {loading ? (
          <div className="py-16 text-center text-[#4b5563] text-sm">Загрузка...</div>
        ) : clients.length === 0 ? (
          <EmptyState icon={Users} title="Клиентов нет" action={{ label: '+ Добавить первого клиента', onClick: () => setShowCreate(true) }} />
        ) : (
          sortedClients.map(client => {
            const statusInfo = ONBOARDING_STATUS[client.onboarding_status]
            const StatusIcon = statusInfo?.icon
            const riskInfo = client.risk_level ? RISK_LEVEL[client.risk_level] : null

            return (
              <div
                key={client.id}
                className="group grid grid-cols-[70px_1fr_1fr_2fr_1fr_80px_1fr_80px_40px] gap-3 px-4 py-2.5 border-b border-[#1e2535] last:border-0 hover:bg-[#1a1f2e] transition-colors duration-100 cursor-pointer"
                onClick={() => navigate(`/clients/${client.id}`)}
              >
                {/* Тип */}
                <div className="flex flex-col justify-center gap-0.5">
                  <span className="flex items-center gap-1 text-xs text-[#6b7280]">
                    {client.client_type === 'individual'
                      ? <><Users className="w-3 h-3" /> ФЛ</>
                      : <><Building2 className="w-3 h-3" /> ЮЛ</>}
                  </span>
                  {client.is_resident === false && (
                    <span className="text-[10px] text-orange-400/70">нерез.</span>
                  )}
                </div>

                {/* № Договора */}
                <div className="flex items-center min-w-0">
                  <span className="text-sm text-[#9ca3af] truncate">{client.contract_number || '—'}</span>
                </div>

                {/* Дата договора */}
                <div className="flex items-center">
                  <span className="text-sm text-[#6b7280]">{fmtDate(client.contract_date)}</span>
                </div>

                {/* Наименование клиента */}
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate group-hover:text-[#d4a843] transition-colors">{client.display_name || '—'}</p>
                  {client.is_high_risk_country && (
                    <span title="Высокорисковая страна" className="shrink-0">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    </span>
                  )}
                </div>

                {/* Страна */}
                <div className="flex items-center min-w-0">
                  <span className="text-sm text-[#6b7280] truncate">{client.country || '—'}</span>
                </div>

                {/* Менеджер */}
                <div className="flex items-center">
                  <span className="text-xs text-[#6b7280]">{client.manager_code || '—'}</span>
                </div>

                {/* Статус */}
                <div className="flex items-center">
                  {statusInfo
                    ? <span className={statusInfo.badge}><StatusIcon className="w-3 h-3" />{statusInfo.label}</span>
                    : <span className="text-xs text-[#374151]">—</span>}
                </div>

                {/* Риск */}
                <div className="flex items-center">
                  {riskInfo
                    ? <span className={riskInfo.badge}>{riskInfo.label}</span>
                    : <span className="text-xs text-[#374151]">—</span>}
                </div>

                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget({ id: client.id, name: client.display_name || `Клиент #${client.id}` }) }}
                    className="opacity-0 group-hover:opacity-100 btn-icon w-6 h-6 hover:text-red-400"
                    title="В архив"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-[#2d3748] group-hover:text-[#4b5563] transition-colors" />
                </div>
              </div>
            )
          })
        )}
      </div>

      </div>{/* /page-body */}

      {showCreate && (
        <CreateClientModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {deleteTarget && (
        <div className="modal-overlay animate-scale-in" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal-box max-w-sm">
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <Archive className="w-4 h-4 text-orange-400" />
                </div>
                <h3 className="text-white font-semibold text-sm">Переместить в архив?</h3>
              </div>
              <button onClick={() => setDeleteTarget(null)} className="btn-icon">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-[#9ca3af] text-sm leading-relaxed">
                <span className="text-white font-medium">«{deleteTarget.name}»</span> будет перемещён в архив. Данные сохранятся — клиента можно восстановить позже.
              </p>
              <div>
                <label className="form-label">Причина архивации</label>
                <input
                  autoFocus
                  value={archiveReason}
                  onChange={e => setArchiveReason(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleArchive()}
                  placeholder="Завершение договора, отказ клиента..."
                  className="form-input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setDeleteTarget(null); setArchiveReason('') }} className="btn-secondary">
                Отмена
              </button>
              <button onClick={handleArchive} className="btn-danger">
                <Archive className="w-3.5 h-3.5" />В архив
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
