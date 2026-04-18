import { useState, useEffect } from 'react'
import { Building2, Plus, Trash2, Edit2, X, Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'

interface UBO {
  id: number
  client_id: number
  client_name: string
  last_name: string
  first_name: string
  middle_name?: string
  date_of_birth?: string
  nationality?: string
  passport_number?: string
  ownership_percentage?: number
  ownership_chain?: string
  is_ultimate: boolean
  notes?: string
  created_at: string
}

interface Client {
  id: number
  display_name: string
}

const EMPTY_FORM = {
  client_id: '',
  last_name: '',
  first_name: '',
  middle_name: '',
  date_of_birth: '',
  nationality: '',
  passport_number: '',
  ownership_percentage: '',
  ownership_chain: '',
  is_ultimate: true,
  notes: '',
}

export default function UBOs() {
  const [ubos, setUbos] = useState<UBO[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [ubosRes, clientsRes] = await Promise.all([
        api.get('/ubos'),
        api.get('/clients'),
      ])
      setUbos(ubosRes.data)

      // Извлекаем имена клиентов из списка
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

  const openEdit = (u: UBO) => {
    setEditId(u.id)
    setForm({
      client_id: String(u.client_id),
      last_name: u.last_name,
      first_name: u.first_name,
      middle_name: u.middle_name ?? '',
      date_of_birth: u.date_of_birth ? u.date_of_birth.split('T')[0] : '',
      nationality: u.nationality ?? '',
      passport_number: u.passport_number ?? '',
      ownership_percentage: u.ownership_percentage != null ? String(u.ownership_percentage) : '',
      ownership_chain: u.ownership_chain ?? '',
      is_ultimate: u.is_ultimate,
      notes: u.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.client_id || !form.last_name || !form.first_name) return
    setSaving(true)
    try {
      const payload: any = {
        client_id: Number(form.client_id),
        last_name: form.last_name,
        first_name: form.first_name,
        middle_name: form.middle_name || null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality || null,
        passport_number: form.passport_number || null,
        ownership_percentage: form.ownership_percentage ? Number(form.ownership_percentage) : null,
        ownership_chain: form.ownership_chain || null,
        is_ultimate: form.is_ultimate,
        notes: form.notes || null,
      }
      if (editId) {
        await api.put(`/ubos/${editId}`, payload)
      } else {
        await api.post('/ubos', payload)
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
    await api.delete(`/ubos/${id}`)
    setDeleteId(null)
    setUbos(prev => prev.filter(u => u.id !== id))
  }

  const filtered = ubos.filter(u => {
    const q = search.toLowerCase()
    return (
      `${u.last_name} ${u.first_name} ${u.middle_name ?? ''}`.toLowerCase().includes(q) ||
      u.client_name.toLowerCase().includes(q) ||
      (u.nationality ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-[#d4a843]" />
          <div>
            <h1 className="text-xl font-bold text-white">Реестр УБО</h1>
            <p className="text-xs text-[#6b7280]">Бенефициарные владельцы юридических лиц</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] text-[#0a0d14] font-bold px-4 py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить УБО
        </button>
      </div>

      {/* Поиск */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Поиск по ФИО, клиенту, гражданству..."
        className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
      />

      {/* Счётчик */}
      <p className="text-xs text-[#4b5563]">
        {loading ? 'Загрузка...' : `${filtered.length} записей`}
      </p>

      {/* Таблица */}
      {!loading && filtered.length === 0 ? (
        <div className="text-center py-16 text-[#4b5563]">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Записей не найдено</p>
        </div>
      ) : (
        <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2535] text-[10px] uppercase tracking-widest text-[#4b5563]">
                <th className="text-left px-4 py-3">ФИО</th>
                <th className="text-left px-4 py-3">Клиент</th>
                <th className="text-left px-4 py-3">Доля %</th>
                <th className="text-left px-4 py-3">Гражданство</th>
                <th className="text-left px-4 py-3">Тип</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-[#1e2535] last:border-0 hover:bg-[#111520]">
                  <td className="px-4 py-3 font-medium text-white">
                    {u.last_name} {u.first_name} {u.middle_name ?? ''}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/clients/${u.client_id}`}
                      className="text-[#d4a843] hover:underline flex items-center gap-1"
                    >
                      {u.client_name}
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#d1d5db]">
                    {u.ownership_percentage != null ? `${u.ownership_percentage}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#d1d5db]">{u.nationality ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      u.is_ultimate
                        ? 'bg-[#d4a843]/20 text-[#d4a843]'
                        : 'bg-[#1e2535] text-[#6b7280]'
                    )}>
                      {u.is_ultimate ? 'Конечный УБО' : 'Промежуточный'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-[#4b5563] hover:text-white rounded transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {deleteId === u.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(u.id)}
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
                          onClick={() => setDeleteId(u.id)}
                          className="p-1.5 text-[#4b5563] hover:text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модальное окно формы */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1017] border border-[#1e2535] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
              <h2 className="font-semibold text-white">
                {editId ? 'Редактировать УБО' : 'Добавить УБО'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-[#4b5563] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Клиент */}
              <div>
                <label className="block text-xs text-[#6b7280] mb-1">Клиент (юрлицо) *</label>
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

              {/* ФИО */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['last_name', 'Фамилия *'],
                  ['first_name', 'Имя *'],
                  ['middle_name', 'Отчество'],
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
              </div>

              {/* Дата рождения + Гражданство */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Дата рождения</label>
                  <input
                    type="date"
                    value={form.date_of_birth}
                    onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Гражданство</label>
                  <input
                    value={form.nationality}
                    onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
              </div>

              {/* Паспорт + Доля */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Номер паспорта</label>
                  <input
                    value={form.passport_number}
                    onChange={e => setForm(f => ({ ...f, passport_number: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1">Доля владения %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.ownership_percentage}
                    onChange={e => setForm(f => ({ ...f, ownership_percentage: e.target.value }))}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
              </div>

              {/* Цепочка владения */}
              <div>
                <label className="block text-xs text-[#6b7280] mb-1">Цепочка владения</label>
                <textarea
                  value={form.ownership_chain}
                  onChange={e => setForm(f => ({ ...f, ownership_chain: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 resize-none"
                />
              </div>

              {/* Конечный УБО */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_ultimate}
                  onChange={e => setForm(f => ({ ...f, is_ultimate: e.target.checked }))}
                  className="accent-[#d4a843] w-4 h-4"
                />
                <span className="text-sm text-[#d1d5db]">Конечный бенефициарный владелец</span>
              </label>

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
                  disabled={saving || !form.client_id || !form.last_name || !form.first_name}
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
