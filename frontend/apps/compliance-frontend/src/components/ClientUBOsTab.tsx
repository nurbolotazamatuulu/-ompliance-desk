import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Eye, Shield, X, AlertTriangle } from 'lucide-react'
import api from '../api/client'
import clsx from 'clsx'
import { fmtDate, toDateInput } from '../utils/dates'
import { toast } from './Toast'
import {
  UBO, EMPTY_FORM, INFLUENCE_TYPES,
  UBOForm, UBODetailModal,
} from '../pages/UBOs'

export default function ClientUBOsTab({ clientId, clientType }: { clientId: number; clientType: 'individual' | 'legal' }) {
  const [ubos, setUbos] = useState<UBO[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, client_id: String(clientId) })
  const [saving, setSaving] = useState(false)
  const [viewUbo, setViewUbo] = useState<UBO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UBO | null>(null)

  useEffect(() => { load() }, [clientId])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/ubos', { params: { client_id: clientId } })
      setUbos(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, client_id: String(clientId) })
    setShowForm(true)
  }

  const openEdit = (u: UBO) => {
    setEditId(u.id)
    setForm({
      client_id: String(u.client_id),
      last_name: u.last_name,
      first_name: u.first_name,
      middle_name: u.middle_name ?? '',
      date_of_birth: toDateInput(u.date_of_birth),
      place_of_birth: u.place_of_birth ?? '',
      nationality: u.nationality ?? '',
      country_of_residence: u.country_of_residence ?? '',
      pin: u.pin ?? '',
      doc_type: u.doc_type ?? '',
      doc_series_number: u.doc_series_number ?? '',
      doc_issued_by: u.doc_issued_by ?? '',
      doc_issued_at: toDateInput(u.doc_issued_at),
      doc_expires_at: toDateInput(u.doc_expires_at),
      registration_address: u.registration_address ?? '',
      actual_address: u.actual_address ?? '',
      phone: u.phone ?? '',
      email: u.email ?? '',
      ownership_percentage: u.ownership_percentage != null ? String(u.ownership_percentage) : '',
      control_type: u.control_type ?? '',
      recognition_basis: u.recognition_basis ?? '',
      recognition_criteria: (u.recognition_criteria as any) ?? [],
      ownership_chain: u.ownership_chain ?? '',
      is_ultimate: u.is_ultimate,
      is_pep: !!u.is_pep,
      source_of_funds: u.source_of_funds ?? '',
      relationship_purpose: u.relationship_purpose ?? '',
      pdl_position: u.pdl_position ?? '',
      pdl_appointment_date: toDateInput(u.pdl_appointment_date),
      pdl_release_date: toDateInput(u.pdl_release_date),
      pdl_source_of_funds: u.pdl_source_of_funds ?? '',
      pdl_approval_notes: u.pdl_approval_notes ?? '',
      pdl_family_members: (u.pdl_family_members as any) ?? [],
      pdl_close_associates: (u.pdl_close_associates as any) ?? [],
      influence_type: u.influence_type ?? '',
      residency_status: u.residency_status ?? '',
      notes: u.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.last_name || !form.first_name) return
    setSaving(true)
    try {
      const payload: any = {
        client_id: clientId,
        last_name: form.last_name,
        first_name: form.first_name,
        middle_name: form.middle_name || null,
        date_of_birth: form.date_of_birth || null,
        place_of_birth: form.place_of_birth || null,
        nationality: form.nationality || null,
        country_of_residence: form.country_of_residence || null,
        pin: form.pin || null,
        doc_type: form.doc_type || null,
        doc_series_number: form.doc_series_number || null,
        doc_issued_by: form.doc_issued_by || null,
        doc_issued_at: form.doc_issued_at || null,
        doc_expires_at: form.doc_expires_at || null,
        registration_address: form.registration_address || null,
        actual_address: form.actual_address || null,
        phone: form.phone || null,
        email: form.email || null,
        ownership_percentage: form.ownership_percentage ? Number(form.ownership_percentage) : null,
        control_type: form.control_type || null,
        recognition_basis: form.recognition_basis || null,
        recognition_criteria: form.recognition_criteria || [],
        ownership_chain: form.ownership_chain || null,
        is_ultimate: form.is_ultimate,
        is_pep: form.is_pep,
        source_of_funds: form.source_of_funds || null,
        relationship_purpose: form.relationship_purpose || null,
        pdl_position: form.pdl_position || null,
        pdl_appointment_date: form.pdl_appointment_date || null,
        pdl_release_date: form.pdl_release_date || null,
        pdl_source_of_funds: form.pdl_source_of_funds || null,
        pdl_approval_notes: form.pdl_approval_notes || null,
        pdl_family_members: form.pdl_family_members || [],
        pdl_close_associates: form.pdl_close_associates || [],
        influence_type: form.influence_type || null,
        residency_status: form.residency_status || null,
        notes: form.notes || null,
      }
      if (editId) {
        await api.put(`/ubos/${editId}`, payload)
        toast('УБО обновлён')
      } else {
        await api.post('/ubos', payload)
        toast('УБО добавлен')
      }
      setShowForm(false)
      await load()
    } catch {
      toast('Не удалось сохранить', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/ubos/${deleteTarget.id}`)
      setUbos(prev => prev.filter(u => u.id !== deleteTarget.id))
      toast('УБО удалён')
    } catch {
      toast('Не удалось удалить', false)
    } finally {
      setDeleteTarget(null)
    }
  }

  const totalUltimate = ubos.filter(u => u.is_ultimate).length
  const totalPep = ubos.filter(u => u.is_pep).length

  return (
    <div className="space-y-4">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Бенефициарные владельцы</h2>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {ubos.length} записей · {totalUltimate} конечных · {totalPep > 0 && <span className="text-red-400">{totalPep} ПДЛ</span>}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] text-sm font-medium hover:bg-[#d4a843]/20 transition-colors">
          <Plus className="w-4 h-4" />Добавить УБО
        </button>
      </div>

      {/* Таблица */}
      {loading ? (
        <div className="py-16 text-center text-[#4b5563] text-sm">Загрузка...</div>
      ) : ubos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[#4b5563] text-sm">УБО не добавлены</p>
          <button onClick={openCreate} className="mt-3 text-[#d4a843] text-sm hover:underline">
            + Добавить первого УБО
          </button>
        </div>
      ) : (
        <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2535] text-xs text-[#374151] uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-semibold">ФИО</th>
                {clientType !== 'individual' && <th className="px-4 py-3 text-left font-semibold">Доля %</th>}
                <th className="px-4 py-3 text-left font-semibold">{clientType === 'individual' ? 'Тип влияния' : 'Статус'}</th>
                <th className="px-4 py-3 text-left font-semibold">Гражданство</th>
                <th className="px-4 py-3 text-left font-semibold">Дата рождения</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ubos.map(u => (
                <tr key={u.id} className="border-b border-[#1e2535] last:border-0 hover:bg-[#111520] transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => setViewUbo(u)}
                      className="font-medium text-white hover:text-[#d4a843] transition-colors text-left flex items-center gap-1.5 group">
                      <span>{u.last_name} {u.first_name} {u.middle_name ?? ''}</span>
                      {u.is_pep && <span title="ПДЛ/ИПДЛ"><Shield className="w-3 h-3 text-red-400 flex-shrink-0" /></span>}
                      <Eye className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </button>
                  </td>
                  {clientType !== 'individual' && (
                    <td className="px-4 py-3 text-[#9ca3af]">
                      {u.ownership_percentage != null ? `${u.ownership_percentage}%` : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {u.residency_status && (
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium self-start',
                          u.residency_status === 'резидент' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400')}>
                          {u.residency_status}
                        </span>
                      )}
                      {clientType === 'individual' && u.influence_type && (
                        <span className="text-xs text-[#9ca3af] capitalize">{u.influence_type}</span>
                      )}
                      {!u.residency_status && !(clientType === 'individual' && u.influence_type) && (
                        <span className="text-[#374151]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#9ca3af]">{u.nationality || '—'}</td>
                  <td className="px-4 py-3 text-[#9ca3af]">{fmtDate(u.date_of_birth) || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                        u.is_ultimate ? 'bg-[#d4a843]/20 text-[#d4a843]' : 'bg-[#1e2535] text-[#6b7280]')}>
                        {u.is_ultimate ? 'Конечный' : 'Промежуточный'}
                      </span>
                      {u.is_pep && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-400">ПДЛ</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(u)}
                        className="p-1.5 text-[#4b5563] hover:text-[#d4a843] transition-colors rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(u)}
                        className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Форма добавления/редактирования */}
      {showForm && (
        <UBOForm
          form={form}
          setForm={setForm}
          clients={[]}
          editId={editId}
          saving={saving}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
          lockedClientId={clientId}
          clientType={clientType}
        />
      )}

      {/* Просмотр деталей */}
      {viewUbo && (
        <UBODetailModal
          ubo={viewUbo}
          onClose={() => setViewUbo(null)}
          onEdit={() => { setViewUbo(null); openEdit(viewUbo) }}
        />
      )}

      {/* Диалог удаления */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-start justify-between p-5 border-b border-[#1e2535]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-white font-semibold">Удалить УБО?</h3>
              </div>
              <button onClick={() => setDeleteTarget(null)} className="text-[#4b5563] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-[#9ca3af] text-sm">
                <span className="text-white font-medium">«{deleteTarget.last_name} {deleteTarget.first_name}»</span> будет удалён из реестра УБО. Это действие необратимо.
              </p>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#1e2535] text-[#9ca3af] hover:text-white text-sm font-medium transition-colors">
                Отмена
              </button>
              <button onClick={handleDelete}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-bold transition-colors">
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
