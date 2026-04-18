import { useState, useEffect } from 'react'
import { Banknote, Plus, Check, X, Trash2, Edit2, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface SOFDoc {
  id: number
  client_id: number
  doc_type: string
  doc_type_label: string
  description?: string
  document_number?: string
  document_date?: string
  amount: number
  currency: string
  period_from?: string
  period_to?: string
  status: 'submitted' | 'verified' | 'rejected'
  verified_at?: string
  notes?: string
  created_at: string
}

interface DocType {
  value: string
  label: string
}

interface Client {
  id: number
  display_name: string
}

interface ClientCoverage {
  client_id: number
  client_name: string
  total_verified_kgs: number
  by_currency: Record<string, number>
  by_type: Record<string, number>
  doc_count: number
  doc_count_verified: number
}

// ─── Конфиг ───────────────────────────────────────────────────────────────────

const STATUS_CONF = {
  submitted: { label: 'На проверке', color: 'bg-yellow-400/20 text-yellow-400' },
  verified:  { label: 'Верифицирован', color: 'bg-green-400/20 text-green-400' },
  rejected:  { label: 'Отклонён', color: 'bg-red-400/20 text-red-400' },
}

const CURRENCIES = ['KGS', 'USD', 'EUR', 'RUB', 'USDT', 'BTC']

function fmt(n: number, cur: string) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' ' + cur
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ru-RU')
}

// ─── Компонент карточки клиента (покрытие) ────────────────────────────────────

function CoverageCard({ cov }: { cov: ClientCoverage }) {
  const kgs = cov.total_verified_kgs
  const hasDocs = cov.doc_count > 0
  const pctVerified = cov.doc_count > 0 ? Math.round((cov.doc_count_verified / cov.doc_count) * 100) : 0

  return (
    <Link
      to={`/clients/${cov.client_id}`}
      className="block bg-[#0d1017] border border-[#1e2535] hover:border-[#2e3545] rounded-xl p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="font-medium text-white text-sm truncate">{cov.client_name}</p>
        <ChevronRight className="w-4 h-4 text-[#4b5563] shrink-0 mt-0.5" />
      </div>

      <div className="space-y-2">
        {/* Покрытие */}
        <div>
          <div className="flex justify-between text-[10px] text-[#6b7280] mb-1">
            <span>Верифицировано документов</span>
            <span className="text-[#d4a843]">{cov.doc_count_verified} / {cov.doc_count}</span>
          </div>
          <div className="h-1.5 bg-[#1e2535] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#d4a843] transition-all"
              style={{ width: `${pctVerified}%` }}
            />
          </div>
        </div>

        {/* Суммы по валютам */}
        {hasDocs && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(cov.by_currency).map(([cur, amt]) => (
              <span key={cur} className="text-[10px] bg-[#1e2535] text-[#d1d5db] px-2 py-0.5 rounded">
                {fmt(amt, cur)}
              </span>
            ))}
          </div>
        )}
        {!hasDocs && (
          <p className="text-[10px] text-[#4b5563]">Нет документов ИПДС</p>
        )}
      </div>
    </Link>
  )
}

// ─── Форма добавления документа ───────────────────────────────────────────────

const EMPTY_FORM = {
  client_id: '',
  doc_type: 'bank_statement',
  description: '',
  document_number: '',
  document_date: '',
  amount: '',
  currency: 'KGS',
  period_from: '',
  period_to: '',
  notes: '',
}

function DocForm({
  clients, docTypes, initial, onSave, onClose, saving,
}: {
  clients: Client[]
  docTypes: DocType[]
  initial: typeof EMPTY_FORM & { id?: number }
  onSave: (f: any) => void
  onClose: () => void
  saving: boolean
}) {
  const [f, setF] = useState(initial)
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
          <h2 className="font-semibold text-white">
            {initial.id ? 'Редактировать документ ИПДС' : 'Добавить документ ИПДС'}
          </h2>
          <button onClick={onClose} className="text-[#4b5563] hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Клиент */}
          {!initial.id && (
            <div>
              <label className="block text-xs text-[#6b7280] mb-1">Клиент *</label>
              <select
                value={f.client_id}
                onChange={e => set('client_id', e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
              >
                <option value="">— выбрать клиента —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </div>
          )}

          {/* Тип документа */}
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Тип документа *</label>
            <select
              value={f.doc_type}
              onChange={e => set('doc_type', e.target.value)}
              className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
            >
              {docTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Описание источника */}
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Описание источника средств</label>
            <textarea
              value={f.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="Напр.: зарплата по трудовому договору №123 в ООО «Альфа», период янв–дек 2024"
              className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
            />
          </div>

          {/* Номер документа + дата */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6b7280] mb-1">Номер / реквизиты</label>
              <input
                value={f.document_number}
                onChange={e => set('document_number', e.target.value)}
                placeholder="№ справки, договора..."
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1">Дата документа</label>
              <input
                type="date"
                value={f.document_date}
                onChange={e => set('document_date', e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
              />
            </div>
          </div>

          {/* Сумма + валюта */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-[#6b7280] mb-1">Сумма покрытия *</label>
              <input
                type="number"
                min="0"
                value={f.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0"
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1">Валюта</label>
              <select
                value={f.currency}
                onChange={e => set('currency', e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Период покрытия */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6b7280] mb-1">Период: начало</label>
              <input
                type="date"
                value={f.period_from}
                onChange={e => set('period_from', e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-[#6b7280] mb-1">Период: конец</label>
              <input
                type="date"
                value={f.period_to}
                onChange={e => set('period_to', e.target.value)}
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
              />
            </div>
          </div>

          {/* Примечания */}
          <div>
            <label className="block text-xs text-[#6b7280] mb-1">Примечания</label>
            <textarea
              value={f.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onSave(f)}
              disabled={saving || (!initial.id && !f.client_id) || !f.amount}
              className="flex-1 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors"
            >
              {saving ? 'Сохранение...' : initial.id ? 'Обновить' : 'Добавить'}
            </button>
            <button
              onClick={onClose}
              className="border border-[#1e2535] text-[#6b7280] hover:text-white px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Главная страница ─────────────────────────────────────────────────────────

export default function IPDS() {
  const [view, setView] = useState<'overview' | 'list'>('overview')
  const [clients, setClients] = useState<Client[]>([])
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [coverages, setCoverages] = useState<ClientCoverage[]>([])
  const [docs, setDocs] = useState<SOFDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editDoc, setEditDoc] = useState<SOFDoc | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [typesRes, clientsRes] = await Promise.all([
        api.get('/sof/doc-types'),
        api.get('/clients'),
      ])
      setDocTypes(typesRes.data)
      const cls: Client[] = (clientsRes.data as any[]).map((c: any) => ({
        id: c.id,
        display_name: c.display_name || `Клиент #${c.id}`,
      }))
      setClients(cls)

      // Загружаем документы по каждому клиенту
      const allDocs: SOFDoc[] = []
      const covs: ClientCoverage[] = []
      await Promise.all(cls.map(async c => {
        try {
          const [docsRes, covRes] = await Promise.all([
            api.get(`/sof/client/${c.id}`),
            api.get(`/sof/client/${c.id}/coverage`),
          ])
          for (const d of docsRes.data as SOFDoc[]) allDocs.push(d)
          covs.push({ ...covRes.data, client_name: c.display_name })
        } catch { /* ignore */ }
      }))
      setDocs(allDocs)
      setCoverages(covs.sort((a, b) => b.doc_count - a.doc_count))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (f: any) => {
    setSaving(true)
    try {
      const payload = {
        doc_type: f.doc_type,
        description: f.description || null,
        document_number: f.document_number || null,
        document_date: f.document_date || null,
        amount: Number(f.amount),
        currency: f.currency,
        period_from: f.period_from || null,
        period_to: f.period_to || null,
        notes: f.notes || null,
        client_id: Number(f.client_id),
      }
      if (editDoc) {
        await api.put(`/sof/${editDoc.id}`, payload)
      } else {
        await api.post(`/sof/client/${payload.client_id}`, payload)
      }
      setShowForm(false)
      setEditDoc(null)
      await loadAll()
    } finally {
      setSaving(false)
    }
  }

  const handleVerify = async (id: number) => {
    await api.patch(`/sof/${id}/verify`)
    await loadAll()
  }

  const handleReject = async (id: number) => {
    await api.patch(`/sof/${id}/reject`)
    await loadAll()
  }

  const handleDelete = async (id: number) => {
    await api.delete(`/sof/${id}`)
    setDeleteId(null)
    setDocs(p => p.filter(d => d.id !== id))
    setCoverages(prev => prev.map(c => ({
      ...c,
      doc_count: Math.max(0, c.doc_count - 1),
    })))
  }

  const filteredDocs = docs.filter(d => {
    const q = search.toLowerCase()
    const cl = clients.find(c => c.id === d.client_id)?.display_name ?? ''
    return (
      cl.toLowerCase().includes(q) ||
      d.doc_type_label.toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q) ||
      (d.document_number ?? '').toLowerCase().includes(q)
    )
  })

  const filteredCovs = coverages.filter(c =>
    c.client_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalDocs = docs.length
  const totalVerified = docs.filter(d => d.status === 'verified').length
  const needsVerification = docs.filter(d => d.status === 'submitted').length
  const clientsWithDocs = new Set(docs.map(d => d.client_id)).size

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Banknote className="w-6 h-6 text-[#d4a843]" />
          <div>
            <h1 className="text-xl font-bold text-white">ИПДС — Источники средств</h1>
            <p className="text-xs text-[#6b7280]">Учёт документов происхождения денежных средств и покрытие операций</p>
          </div>
        </div>
        <button
          onClick={() => { setEditDoc(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] text-[#0a0d14] font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить документ
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Всего документов', value: totalDocs, color: 'text-white' },
          { label: 'Верифицировано', value: totalVerified, color: 'text-green-400' },
          { label: 'Ожидают проверки', value: needsVerification, color: 'text-yellow-400' },
          { label: 'Клиентов с ИПДС', value: clientsWithDocs, color: 'text-[#d4a843]' },
        ].map(s => (
          <div key={s.label} className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-4">
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Переключатель + поиск */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-[#111520] border border-[#1e2535] rounded-lg p-1">
          {(['overview', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                'px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === v ? 'bg-[#d4a843] text-[#0a0d14]' : 'text-[#6b7280] hover:text-white'
              )}
            >
              {v === 'overview' ? 'По клиентам' : 'Все документы'}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="flex-1 bg-[#111520] border border-[#1e2535] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
        />
      </div>

      {loading ? (
        <p className="text-[#4b5563] text-sm">Загрузка...</p>
      ) : view === 'overview' ? (
        /* ── Обзор по клиентам ── */
        <div>
          {filteredCovs.filter(c => c.doc_count > 0).length === 0 ? (
            <div className="text-center py-16 text-[#4b5563]">
              <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Нет документов ИПДС</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCovs.filter(c => c.doc_count > 0).map(c => (
                <CoverageCard key={c.client_id} cov={c} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Список всех документов ── */
        <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
          {filteredDocs.length === 0 ? (
            <div className="text-center py-16 text-[#4b5563]">
              <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Документов не найдено</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2535] text-[10px] uppercase tracking-widest text-[#4b5563]">
                  <th className="text-left px-4 py-3">Клиент</th>
                  <th className="text-left px-4 py-3">Тип документа</th>
                  <th className="text-left px-4 py-3">Описание</th>
                  <th className="text-right px-4 py-3">Сумма</th>
                  <th className="text-left px-4 py-3">Период</th>
                  <th className="text-left px-4 py-3">Статус</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(d => {
                  const cl = clients.find(c => c.id === d.client_id)
                  const sc = STATUS_CONF[d.status]
                  return (
                    <tr key={d.id} className="border-b border-[#1e2535] last:border-0 hover:bg-[#111520]">
                      <td className="px-4 py-3">
                        <Link
                          to={`/clients/${d.client_id}`}
                          className="text-[#d4a843] hover:underline flex items-center gap-1 text-xs"
                        >
                          {cl?.display_name ?? `#${d.client_id}`}
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#d1d5db] text-xs">{d.doc_type_label}</td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs max-w-[200px] truncate">
                        {d.description || (d.document_number ? `№ ${d.document_number}` : '—')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#d1d5db] text-xs">
                        {fmt(d.amount, d.currency)}
                      </td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">
                        {d.period_from || d.period_to
                          ? `${fmtDate(d.period_from)} — ${fmtDate(d.period_to)}`
                          : fmtDate(d.document_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', sc.color)}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {d.status === 'submitted' && (
                            <>
                              <button
                                onClick={() => handleVerify(d.id)}
                                title="Верифицировать"
                                className="p-1.5 text-[#4b5563] hover:text-green-400 transition-colors rounded"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(d.id)}
                                title="Отклонить"
                                className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors rounded"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => { setEditDoc(d); setShowForm(true) }}
                            className="p-1.5 text-[#4b5563] hover:text-white transition-colors rounded"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {deleteId === d.id ? (
                            <>
                              <button onClick={() => handleDelete(d.id)} className="p-1.5 text-red-400 hover:text-red-300 rounded">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteId(null)} className="p-1.5 text-[#4b5563] hover:text-white rounded">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDeleteId(d.id)}
                              className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Форма */}
      {showForm && (
        <DocForm
          clients={clients}
          docTypes={docTypes}
          initial={editDoc ? {
            id: editDoc.id,
            client_id: String(editDoc.client_id),
            doc_type: editDoc.doc_type,
            description: editDoc.description ?? '',
            document_number: editDoc.document_number ?? '',
            document_date: editDoc.document_date ? editDoc.document_date.split('T')[0] : '',
            amount: String(editDoc.amount),
            currency: editDoc.currency,
            period_from: editDoc.period_from ? editDoc.period_from.split('T')[0] : '',
            period_to: editDoc.period_to ? editDoc.period_to.split('T')[0] : '',
            notes: editDoc.notes ?? '',
          } : { ...EMPTY_FORM }}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditDoc(null) }}
          saving={saving}
        />
      )}
    </div>
  )
}
