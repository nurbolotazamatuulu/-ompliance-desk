import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Filter, Users, Building2,
  ChevronRight, AlertCircle, CheckCircle2,
  Clock, XCircle, PauseCircle, RefreshCw
} from 'lucide-react'
import { clientsApi } from '../api/clients'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import clsx from 'clsx'

// ─── Справочники ──────────────────────────────────────────────────────────────

const ONBOARDING_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  pending:     { label: 'Ожидает',       color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
  in_progress: { label: 'В процессе',    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',       icon: RefreshCw },
  approved:    { label: 'Одобрен',       color: 'text-green-400 bg-green-400/10 border-green-400/20',    icon: CheckCircle2 },
  rejected:    { label: 'Отклонён',      color: 'text-red-400 bg-red-400/10 border-red-400/20',          icon: XCircle },
  suspended:   { label: 'Приостановлен', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', icon: PauseCircle },
}

const RISK_LEVEL: Record<string, { label: string; color: string }> = {
  low:          { label: 'Низкий',         color: 'text-green-400' },
  medium:       { label: 'Средний',        color: 'text-yellow-400' },
  high:         { label: 'Высокий',        color: 'text-orange-400' },
  unacceptable: { label: 'Неприемлемый',   color: 'text-red-400' },
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-white mb-5">Новый клиент</h2>

        {/* Тип клиента */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { value: 'individual', label: 'Физическое лицо', icon: Users },
            { value: 'legal', label: 'Юридическое лицо', icon: Building2 },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setClientType(value as any)}
              className={clsx(
                'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
                clientType === value
                  ? 'border-[#d4a843] bg-[#d4a843]/10 text-[#d4a843]'
                  : 'border-[#1e2535] text-[#6b7280] hover:border-[#2d3748] hover:text-white'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium text-center">{label}</span>
            </button>
          ))}
        </div>

        {/* Поля */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">
              Номер договора
            </label>
            <input
              value={contractNumber}
              onChange={e => setContractNumber(e.target.value)}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
              placeholder="Например: 2024-001"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">
              Дата договора
            </label>
            <input
              type="date"
              value={contractDate}
              onChange={e => setContractDate(e.target.value)}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">
              Код менеджера (4 цифры)
            </label>
            <input
              value={managerCode}
              onChange={e => setManagerCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
              placeholder="0000"
              maxLength={4}
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[#1e2535] text-[#6b7280] hover:text-white text-sm transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold text-sm uppercase tracking-wider transition-colors"
          >
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
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  // Фильтры
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRisk, setFilterRisk] = useState('')

  const loadClients = async () => {
    setLoading(true)
    try {
      const { data } = await clientsApi.list({
        search: search || undefined,
        client_type: filterType || undefined,
        status: filterStatus || undefined,
        risk_level: filterRisk || undefined,
      })
      setClients(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClients() }, [search, filterType, filterStatus, filterRisk])

  const handleCreated = (id: number) => {
    setShowCreate(false)
    navigate(`/clients/${id}`)
  }

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Реестр клиентов</h1>
          <p className="text-[#6b7280] text-sm mt-0.5">{clients.length} записей</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] text-[#0a0d14] font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить клиента
        </button>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3">
        {/* Поиск */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4b5563]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или номеру договора..."
            className="w-full bg-[#111520] border border-[#1e2535] rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
          />
        </div>

        {/* Тип */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
        >
          <option value="">Все типы</option>
          <option value="individual">Физические лица</option>
          <option value="legal">Юридические лица</option>
        </select>

        {/* Статус */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
        >
          <option value="">Все статусы</option>
          {Object.entries(ONBOARDING_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Риск */}
        <select
          value={filterRisk}
          onChange={e => setFilterRisk(e.target.value)}
          className="bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
        >
          <option value="">Все уровни риска</option>
          {Object.entries(RISK_LEVEL).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Таблица */}
      <div className="bg-[#111520] border border-[#1e2535] rounded-xl overflow-hidden">
        {/* Заголовки */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_40px] gap-4 px-5 py-3 border-b border-[#1e2535] bg-[#0d1017]">
          {['Клиент', 'Тип', 'Договор', 'Менеджер', 'Статус', 'Риск'].map(h => (
            <span key={h} className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-widest">{h}</span>
          ))}
          <span />
        </div>

        {/* Строки */}
        {loading ? (
          <div className="py-16 text-center text-[#4b5563] text-sm">Загрузка...</div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-8 h-8 text-[#1e2535] mx-auto mb-3" />
            <p className="text-[#4b5563] text-sm">Клиентов нет. Добавьте первого.</p>
          </div>
        ) : (
          clients.map(client => {
            const statusInfo = ONBOARDING_STATUS[client.onboarding_status]
            const StatusIcon = statusInfo?.icon
            const riskInfo = client.risk_level ? RISK_LEVEL[client.risk_level] : null

            return (
              <button
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_40px] gap-4 px-5 py-4 border-b border-[#1e2535] last:border-0 hover:bg-[#1e2535]/30 transition-colors text-left"
              >
                {/* Имя */}
                <div>
                  <p className="text-sm font-medium text-white truncate">{client.display_name || '—'}</p>
                  {client.country && <p className="text-xs text-[#6b7280] mt-0.5">{client.country}</p>}
                </div>

                {/* Тип */}
                <div className="flex items-center">
                  {client.client_type === 'individual'
                    ? <span className="flex items-center gap-1 text-xs text-[#6b7280]"><Users className="w-3.5 h-3.5" /> ФЛ</span>
                    : <span className="flex items-center gap-1 text-xs text-[#6b7280]"><Building2 className="w-3.5 h-3.5" /> ЮЛ</span>
                  }
                </div>

                {/* Договор */}
                <div className="flex items-center">
                  <span className="text-sm text-[#9ca3af]">{client.contract_number || '—'}</span>
                </div>

                {/* Менеджер */}
                <div className="flex items-center">
                  <span className="text-sm text-[#9ca3af]">{client.manager_code || '—'}</span>
                </div>

                {/* Статус */}
                <div className="flex items-center">
                  {statusInfo && (
                    <span className={clsx('flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border', statusInfo.color)}>
                      <StatusIcon className="w-3 h-3" />
                      {statusInfo.label}
                    </span>
                  )}
                </div>

                {/* Риск */}
                <div className="flex items-center">
                  {riskInfo
                    ? <span className={clsx('text-sm font-medium', riskInfo.color)}>{riskInfo.label}</span>
                    : <span className="text-sm text-[#374151]">—</span>
                  }
                </div>

                <div className="flex items-center justify-end">
                  <ChevronRight className="w-4 h-4 text-[#374151]" />
                </div>
              </button>
            )
          })
        )}
      </div>

      {showCreate && (
        <CreateClientModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
