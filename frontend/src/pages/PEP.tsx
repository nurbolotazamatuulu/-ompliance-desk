import { useState, useEffect, useRef } from 'react'
import { UserCheck, Plus, Trash2, Edit2, X, ChevronRight, ShieldAlert, Search, SlidersHorizontal } from 'lucide-react'
import { fmtDate, toDateInput } from '../utils/dates'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from '../components/Toast'
import { useSortable } from '../hooks/useSortable'
import SortTh from '../components/SortTh'
import StatCard from '../components/StatCard'

interface PEPRecord {
  id: number
  client_id: number
  client_name: string
  pep_type?: string
  position?: string
  organization?: string
  country?: string
  source?: string
  identified_at?: string
  notes?: string
  created_at: string
}

interface Client {
  id: number
  display_name: string
}

const PEP_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  PEP:       { label: 'ПДЛ',            color: 'bg-red-400/20 text-red-400' },
  IPEP:      { label: 'ИПДЛ',           color: 'bg-orange-400/20 text-orange-400' },
  FAMILY:    { label: 'Родственник ПДЛ', color: 'bg-yellow-400/20 text-yellow-400' },
  ASSOCIATE: { label: 'Связанное лицо',  color: 'bg-purple-400/20 text-purple-400' },
}

const EMPTY_FORM = {
  client_id: '',
  pep_type: 'PEP',
  position: '',
  organization: '',
  country: '',
  source: '',
  identified_at: '',
  notes: '',
}

export default function PEP() {
  const [records, setRecords] = useState<PEPRecord[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [pepRes, clientsRes] = await Promise.all([
        api.get('/pep'),
        api.get('/clients'),
      ])
      setRecords(pepRes.data)
      const cl: Client[] = (clientsRes.data as any[]).map((c: any) => ({
        id: c.id,
        display_name: c.display_name || `Клиент #${c.id}`,
      }))
      setClients(cl)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  const openEdit = (r: PEPRecord) => {
    setEditId(r.id)
    setForm({
      client_id: String(r.client_id),
      pep_type: r.pep_type ?? 'PEP',
      position: r.position ?? '',
      organization: r.organization ?? '',
      country: r.country ?? '',
      source: r.source ?? '',
      identified_at: toDateInput(r.identified_at),
      notes: r.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.client_id || !form.pep_type) return
    setSaving(true)
    try {
      const payload: any = {
        client_id: Number(form.client_id),
        pep_type: form.pep_type,
        position: form.position || null,
        organization: form.organization || null,
        country: form.country || null,
        source: form.source || null,
        identified_at: form.identified_at || null,
        notes: form.notes || null,
      }
      if (editId) {
        await api.put(`/pep/${editId}`, payload)
      } else {
        await api.post('/pep', payload)
      }
      setShowForm(false)
      toast(editId ? 'Запись обновлена' : 'ПДЛ добавлен')
      await loadData()
    } catch {
      toast('Не удалось сохранить', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/pep/${id}`)
      setRecords(prev => prev.filter(r => r.id !== id))
      toast('Запись удалена')
    } catch {
      toast('Не удалось удалить', false)
    } finally {
      setDeleteId(null)
    }
  }

  const countries = Array.from(new Set(records.map(r => r.country).filter(Boolean))) as string[]

  const preFiltered = records.filter(r => {
    const q = search.toLowerCase()
    const matchSearch =
      r.client_name.toLowerCase().includes(q) ||
      (r.position ?? '').toLowerCase().includes(q) ||
      (r.organization ?? '').toLowerCase().includes(q) ||
      (r.country ?? '').toLowerCase().includes(q)
    const matchType = filterType ? r.pep_type === filterType : true
    const matchCountry = filterCountry ? r.country === filterCountry : true
    return matchSearch && matchType && matchCountry
  })

  const { sorted: filtered, sortKey, sortDir, toggle } = useSortable(preFiltered, 'client_name')

  const typeCounts = records.reduce((acc, r) => {
    acc[r.pep_type ?? ''] = (acc[r.pep_type ?? ''] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <UserCheck className="w-5 h-5 text-[#d4a843] flex-shrink-0" />
          <div>
            <h1 className="page-title">Реестр ИПДЛ / ПДЛ</h1>
            <p className="page-subtitle">{records.length} записей</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={clsx('transition-all duration-200 overflow-hidden', searchOpen || search ? 'w-56 opacity-100' : 'w-0 opacity-0')}>
            <div className="relative">
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
                placeholder="Клиент, должность, организация..."
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
          {countries.length > 0 && (
            <div ref={filterRef} className="relative">
              <button onClick={() => setFilterOpen(v => !v)}
                className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                  filterOpen || filterCountry ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5' : 'border-[#1e2535] text-[#6b7280] hover:text-white hover:border-[#374151]')}>
                <SlidersHorizontal className="w-4 h-4" />
                <span>Фильтры</span>
                {filterCountry && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#d4a843] text-[#0a0d14] text-[10px] font-bold px-1">1</span>
                )}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#111520] border border-[#1e2535] rounded-xl shadow-2xl z-30 p-3 space-y-2">
                  <div>
                    <label className="block text-xs text-[#4b5563] mb-1">Страна</label>
                    <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                      <option value="">Все</option>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {filterCountry && (
                    <button onClick={() => setFilterCountry('')}
                      className="w-full text-xs text-[#6b7280] hover:text-white border border-[#1e2535] hover:border-[#374151] rounded-lg py-1.5 transition-colors">
                      Сбросить
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button onClick={openCreate} className="btn-primary flex-shrink-0">
            <Plus className="w-4 h-4" />
            Добавить запись
          </button>
        </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
      {(search || filterType || filterCountry) && (
        <div className="flex flex-wrap gap-1.5">
          {search && <span className="inline-flex items-center gap-1 text-xs bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] px-2 py-1 rounded-full">
            Поиск: {search}<button onClick={() => setSearch('')} className="hover:text-white"><X className="w-3 h-3" /></button>
          </span>}
          {filterType && <span className="inline-flex items-center gap-1 text-xs bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] px-2 py-1 rounded-full">
            {PEP_TYPE_LABELS[filterType]?.label}<button onClick={() => setFilterType('')} className="hover:text-white"><X className="w-3 h-3" /></button>
          </span>}
          {filterCountry && <span className="inline-flex items-center gap-1 text-xs bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] px-2 py-1 rounded-full">
            {filterCountry}<button onClick={() => setFilterCountry('')} className="hover:text-white"><X className="w-3 h-3" /></button>
          </span>}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {Object.entries(PEP_TYPE_LABELS).map(([type, meta]) => (
          <button key={type} onClick={() => setFilterType(filterType === type ? '' : type)}
            className={clsx('stat-card text-left cursor-pointer transition-colors',
              filterType === type ? 'border-[#d4a843]/40 bg-[#d4a843]/5' : 'hover:border-[#2e3545]')}>
            <p className="stat-value text-white">{typeCounts[type] ?? 0}</p>
            <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block', meta.color)}>
              {meta.label}
            </span>
          </button>
        ))}
      </div>


      {!loading && filtered.length === 0 ? (
        <div className="text-center py-16 text-[#4b5563]">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-[#9ca3af] font-medium">{search || filterType ? 'Записей не найдено' : 'Реестр ПДЛ пуст'}</p>
          {!search && !filterType && (
            <button
              onClick={openCreate}
              className="mt-3 text-[#d4a843] hover:underline text-sm"
            >
              + Добавить первую запись
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2535] bg-[#0d1017]">
                {[
                  { label: 'Клиент',     field: 'client_name' },
                  { label: 'Тип',        field: 'pep_type' },
                  { label: 'Должность',  field: 'position' },
                  { label: 'Страна',     field: 'country' },
                  { label: 'Источник',   field: 'source' },
                  { label: 'Выявлено',   field: 'identified_at' },
                ].map(h => (
                  <SortTh key={h.field} label={h.label} field={h.field}
                    current={String(sortKey)} dir={sortDir} onSort={toggle}
                    className="px-4 py-3" />
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const meta = PEP_TYPE_LABELS[r.pep_type ?? '']
                return (
                  <tr key={r.id} className="border-b border-[#1e2535] last:border-0 hover:bg-[#111520]">
                    <td className="px-4 py-3">
                      <Link
                        to={`/clients/${r.client_id}`}
                        className="text-[#d4a843] hover:underline flex items-center gap-1 font-medium"
                      >
                        {r.client_name}
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {meta && (
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', meta.color)}>
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#d1d5db]">
                      <p>{r.position ?? '—'}</p>
                      {r.organization && <p className="text-xs text-[#6b7280]">{r.organization}</p>}
                    </td>
                    <td className="px-4 py-3 text-[#d1d5db]">{r.country ?? '—'}</td>
                    <td className="px-4 py-3 text-[#6b7280] text-xs">{r.source ?? '—'}</td>
                    <td className="px-4 py-3 text-[#6b7280] text-xs">
                      {fmtDate(r.identified_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1.5 text-[#4b5563] hover:text-white rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="p-1.5 text-[#4b5563] hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Удалить запись"
        message={`Удалить запись ПДЛ для клиента «${records.find(r => r.id === deleteId)?.client_name ?? ''}»? Это действие необратимо.`}
        onConfirm={() => deleteId !== null && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box max-w-lg">
            <div className="modal-header">
              <h2 className="font-semibold text-white">
                {editId ? 'Редактировать запись' : 'Добавить ПДЛ / ИПДЛ'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-[#4b5563] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="form-label">Клиент *</label>
                <select
                  value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  disabled={!!editId}
                  className="form-input disabled:opacity-50"
                >
                  <option value="">— выбрать клиента —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.display_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Тип *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PEP_TYPE_LABELS).map(([type, meta]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, pep_type: type }))}
                      className={clsx(
                        'py-2 px-3 rounded-lg text-xs font-medium border transition-colors text-left',
                        form.pep_type === type
                          ? meta.color + ' border-current'
                          : 'border-[#1e2535] text-[#6b7280] hover:text-white'
                      )}
                    >
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              {[['position', 'Должность'], ['organization', 'Организация']].map(([k, lbl]) => (
                <div key={k}>
                  <label className="form-label">{lbl}</label>
                  <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="form-input" />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Страна</label>
                  <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Дата выявления</label>
                  <input type="date" min="1900-01-01" max="2100-12-31" value={form.identified_at}
                    onChange={e => setForm(f => ({ ...f, identified_at: e.target.value }))} className="form-input" />
                </div>
              </div>

              <div>
                <label className="form-label">Источник информации</label>
                <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  placeholder="Открытые реестры, санкционный скрининг, анкета..." className="form-input" />
              </div>

              <div>
                <label className="form-label">Примечания</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="form-input resize-none" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
              <button onClick={handleSave} disabled={saving || !form.client_id} className="btn-primary disabled:opacity-50">
                {saving ? 'Сохранение...' : editId ? 'Обновить' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
