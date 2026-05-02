import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Users, Building2, RotateCcw, Trash2, X, AlertTriangle } from 'lucide-react'
import { clientsApi } from '../api/clients'
import clsx from 'clsx'
import { fmtDate } from '../utils/dates'
import { toast } from '../components/Toast'

interface ArchivedClient {
  id: number
  client_type: string
  display_name: string
  contract_number: string | null
  archived_at: string
  archived_by_name: string | null
  archive_reason: string | null
}

export default function ArchivePage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ArchivedClient[]>([])
  const [loading, setLoading] = useState(true)
  const [restoreTarget, setRestoreTarget] = useState<ArchivedClient | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ArchivedClient | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await clientsApi.listArchived()
      setClients(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    setWorking(true)
    try {
      await clientsApi.restore(restoreTarget.id)
      setClients(prev => prev.filter(c => c.id !== restoreTarget.id))
      toast(`«${restoreTarget.display_name}» восстановлен`)
    } catch {
      toast('Ошибка восстановления', false)
    } finally {
      setWorking(false)
      setRestoreTarget(null)
    }
  }

  const handleDeletePermanent = async () => {
    if (!deleteTarget) return
    setWorking(true)
    try {
      await clientsApi.deletePermanent(deleteTarget.id)
      setClients(prev => prev.filter(c => c.id !== deleteTarget.id))
      toast(`«${deleteTarget.display_name}» удалён безвозвратно`)
    } catch {
      toast('Ошибка удаления', false)
    } finally {
      setWorking(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <Archive className="w-6 h-6 text-[#d4a843]" />
        <div>
          <h1 className="text-xl font-bold text-white">Архив клиентов</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">{clients.length} записей · данные сохранены, клиенты скрыты из реестра</p>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-[#111520] border border-[#1e2535] rounded-xl overflow-hidden">

        {/* Шапка */}
        <div className="grid grid-cols-[60px_2fr_1fr_1fr_1fr_120px] gap-3 px-5 py-3 border-b border-[#1e2535] bg-[#0d1017]">
          {['ТИП', 'КЛИЕНТ', 'ДОГОВОР', 'ДАТА АРХИВАЦИИ', 'ПРИЧИНА', ''].map(h => (
            <span key={h} className="text-xs font-semibold text-[#374151] uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-[#4b5563] text-sm">Загрузка...</div>
        ) : clients.length === 0 ? (
          <div className="py-20 text-center">
            <Archive className="w-10 h-10 text-[#1e2535] mx-auto mb-3" />
            <p className="text-[#4b5563] text-sm">Архив пуст</p>
            <p className="text-[#374151] text-xs mt-1">Перемещённые в архив клиенты отображаются здесь</p>
          </div>
        ) : (
          clients.map(client => (
            <div key={client.id}
              className="grid grid-cols-[60px_2fr_1fr_1fr_1fr_120px] gap-3 px-5 py-3 border-b border-[#1e2535] last:border-0 hover:bg-[#1e2535]/20 transition-colors items-center">

              <div>
                {client.client_type === 'individual'
                  ? <span className="flex items-center gap-1 text-xs text-[#6b7280]"><Users className="w-3.5 h-3.5" /> ФЛ</span>
                  : <span className="flex items-center gap-1 text-xs text-[#6b7280]"><Building2 className="w-3.5 h-3.5" /> ЮЛ</span>
                }
              </div>

              <div>
                <button onClick={() => navigate(`/clients/${client.id}`)}
                  className="text-sm font-medium text-[#9ca3af] hover:text-[#d4a843] transition-colors text-left">
                  {client.display_name}
                </button>
                {client.archived_by_name && (
                  <p className="text-xs text-[#4b5563] mt-0.5">Архивировал: {client.archived_by_name}</p>
                )}
              </div>

              <div className="text-sm text-[#6b7280]">{client.contract_number || '—'}</div>

              <div className="text-sm text-[#6b7280]">{fmtDate(client.archived_at)}</div>

              <div className="text-sm text-[#6b7280] truncate" title={client.archive_reason || ''}>
                {client.archive_reason || <span className="text-[#374151]">—</span>}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setRestoreTarget(client)}
                  title="Восстановить"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-green-400 border border-green-400/20 hover:bg-green-400/10 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Вернуть
                </button>
                <button
                  onClick={() => setDeleteTarget(client)}
                  title="Удалить навсегда"
                  className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Диалог восстановления */}
      {restoreTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setRestoreTarget(null)}>
          <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-start justify-between p-5 border-b border-[#1e2535]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <RotateCcw className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="text-white font-semibold">Восстановить клиента?</h3>
              </div>
              <button onClick={() => setRestoreTarget(null)} className="text-[#4b5563] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-[#9ca3af] text-sm">
                <span className="text-white font-medium">«{restoreTarget.display_name}»</span> вернётся в реестр клиентов как активный. Все данные сохранены.
              </p>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setRestoreTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#1e2535] text-[#9ca3af] hover:text-white text-sm font-medium transition-colors">
                Отмена
              </button>
              <button onClick={handleRestore} disabled={working}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 text-sm font-bold transition-colors disabled:opacity-50">
                {working ? 'Восстановление...' : 'Восстановить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Диалог безвозвратного удаления */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-start justify-between p-5 border-b border-[#1e2535]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-white font-semibold">Удалить безвозвратно?</h3>
              </div>
              <button onClick={() => setDeleteTarget(null)} className="text-[#4b5563] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-[#9ca3af] text-sm leading-relaxed">
                <span className="text-white font-medium">«{deleteTarget.display_name}»</span> и все связанные данные — УБО, ПДЛ, документы, проверки — будут уничтожены. Это действие <span className="text-red-400 font-medium">необратимо</span>.
              </p>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#1e2535] text-[#9ca3af] hover:text-white text-sm font-medium transition-colors">
                Отмена
              </button>
              <button onClick={handleDeletePermanent} disabled={working}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-bold transition-colors disabled:opacity-50">
                {working ? 'Удаление...' : 'Удалить навсегда'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
