import { useState, useEffect } from 'react'
import { UserCheck, Plus, Trash2, Edit2, X, Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'

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
  IPEP:      { label: 'ИПДС',           color: 'bg-orange-400/20 text-orange-400' },
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
  const [deleteId, setDeleteId] = useState<number | null>(null)

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
      identified_at: r.identified_at ? r.identified_at.split('T')[0] : '',
      notes: r.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.client_id) return
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
      await loadData()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await api.delete(`/pep/${id}`)
    setDeleteId(null)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  const filtered = records.filter(r => {
    const q = search.toLowerCase()
    const matchSearch =
      r.client_name.toLowerCase().includes(q) ||
      (r.position ?? '').toLowerCase().includes(q) ||
      (r.organization ?? '').toLowerCase().includes(q) ||
      (r.country ?? '').toLowerCase().includes(q)
    const matchType = filterType ? r.pep_type === filterType : true
    return matchSearch && matchType
  })

  const typeCounts = records.reduce((acc, r) => {
    acc[r.pep_type ?? ''] = (acc[r.pep_type ?? ''] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="w-6 h-6 text-[#d4a843]" />
          <div>
            <h1 className="text-xl font-bold text-white">Реестр ИПДС / ПДЛ</h1>
            <p className="text-xs text-[#6b7280]">Иностранные публичные должностные лица и политически значимые персоны</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] text-[#0a0d14] font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить запись
        </button>
      </div>

      {/* Статистика по типам */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(PEP_TYPE_LABELS).map(([type, meta]) => (
          <button
            key={type}
            onClick={() => setFilterType(filterType === type ? '' : type)}
            className={clsx(
              'p-3 rounded-xl border text-left transition-colors',
              filterType === type
                ? 'border-[#d4a843]/40 bg-[#d4a843]/5'
                : 'border-[#1e2535] bg-[#0d1017] hover:border-[#2e3545]'
            )}
          >
            <p className="text-lg font-bold text-white">{typeCounts[type] ?? 0}</p>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', meta.color)}>
              {meta.label}
            </span>
          </button>
        ))}
      </div>

      {/* Поиск */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Поиск по клиенту, должности, организации, стране..."
        className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
      />

      <p className="text-xs text-[#4b5563]">
        {loading ? 'Загрузка...' : `${filtered.length} записей`}
        {filterType && <span className="ml-2 text-[#d4a843]">· Фильтр: {PEP_TYPE_LABELS[filterType]?.label}</span>}
      </p>

      {/* Таблица */}
      {!loading && filtered.length === 0 ? (
        <div className="text-center py-16 text-[#4b5563]">
          <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Записей не найдено</p>
        </div>
      ) : (
        <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2535] text-[10px] uppercase tracking-widest text-[#4b5563]">
                <th className="text-left px-4 py-3">Клиент</th>
                <th className="text-left px-4 py-3">Тип</th>
                <th className="text-left px-4 py-3">Должность / Организация</th>
                <th className="text-left px-4 py-3">Страна</th>
                <th className="text-left px-4 py-3">Источник</th>
                <th className="text-left px-4 py-3">Выявлено</th>
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
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium', meta.color)}>
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#d1d5db]">
                      <p>{r.position ?? '—'}</p>
                      {r.organization && <p className="text-[10px] text-[#6b7280]">{r.organization}</p>}
                    </td>
                    <td className="px-4 py-3 text-[#d1d5db]">{r.country ?? '—'}</td>
                    <td className="px-4 py-3 text-[#6b7280] text-xs">{r.source ?? '—'}</td>
                    <td className="px-4 py-3 text-[#6b7280] text-xs">
                      {r.identified_at
                        ? new Date(r.identified_at).toLocaleDateString('ru-RU')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1.5 text-[#4b5563] hover:text-white rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {deleteId === r.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1.5 text-red-400 hover:text-red-300 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(null)}
                              className="p-1.5 text-[#4b5563] hover:text-white rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteId(r.id)}
                            className="p-1.5 text-[#4b5563] hover:text-red-400 rounded transition-colors"
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
        </div>
      )}

      {/* Модальное окно */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1017] border border-[#1e2535] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
              <h2 className="font-semibold text-white">
                {editId ? 'Редактировать запись' : 'Добавить ИПДС / ПДЛ'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-[#4b5563] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Клиент */}
              <div>
                <label className="block text-xs text-[#6b7280] mb-1">Клиент *</label>
                <select
                  value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  disabled={!!editId}
                  className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 disabled:opacity-50"
                >
                  <option value="">— выбрать клиента —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.display_name}</option>
                  ))}
                </select>
              </div>

              {/* Тип ПДЛ */}
              <div>
                <label className="block text-xs text-[#6b7280] mb-1">Тип *</label>
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

              {/* Должность + Организация */}
              {[
                ['position', 'Должность'],
                ['organization', 'Организация'],
              ].map(([k, lbl]) => (
                <div key={k}>
                  <label className="block text-xs text-[#6b7280] mb-1">{lbl}</label>
                  <input
                    value={(form as any)[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
              ))}

              {/* Страна + Источник */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Страна</label>
                  <input
                    value={form.country}
                    onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Дата выявления</label>
                  <input
                    type="date"
                    value={form.identified_at}
                    onChange={e => setForm(f => ({ ...f, identified_at: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
              </div>

              {/* Источник */}
              <div>
                <label className="block text-xs text-[#6b7280] mb-1">Источник информации</label>
                <input
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  placeholder="Открытые реестры, санкционный скрининг, анкета..."
                  className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
                />
              </div>

              {/* Примечание */}
              <div>
                <label className="block text-xs text-[#6b7280] mb-1">Примечания</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !form.client_id}
                  className="flex-1 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors"
                >
                  {saving ? 'Сохранение...' : editId ? 'Обновить' : 'Добавить'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="border border-[#1e2535] text-[#6b7280] hover:text-white px-5 py-2.5 rounded-lg text-sm transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
