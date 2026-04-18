import { useState, useEffect } from 'react'
import {
  Search, Upload, RefreshCw, CheckCircle2,
  AlertTriangle, XCircle, Clock, FileText,
  ChevronDown, ChevronUp, Info
} from 'lucide-react'
import api from '../api/client'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import clsx from 'clsx'

// ─── Справочники ──────────────────────────────────────────────────────────────

const RESULT_CONFIG = {
  clear: { label: 'Совпадений не найдено', color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', icon: CheckCircle2 },
  possible_match: { label: 'Возможное совпадение', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', icon: AlertTriangle },
  match: { label: 'Совпадение найдено', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', icon: XCircle },
}

const LIST_NAMES: Record<string, string> = {
  GSFR_KG_1: 'ГСФР КР — ПФТ',
  GSFR_KG_2: 'ГСФР КР — ПЛПД ФЛ',
  GSFR_KG_3: 'ГСФР КР — ПЛПД ЮЛ',
  GSFR_KG_4: 'ГСФР КР — Сводный санкционный перечень КР',
  UN: 'ООН',
  OFAC: 'США — OFAC',
  EU: 'ЕС',
  UK: 'Великобритания',
}

// ─── Компонент управления списками ────────────────────────────────────────────

function ListsManager({ lists, onRefresh }: { lists: any[]; onRefresh: () => void }) {
  const [uploading, setUploading] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async (listCode: string, file: File) => {
    setUploading(listCode)
    setMessage('')
    const form = new FormData()
    form.append('file', file)
    form.append('list_code', listCode)
    try {
      const { data } = await api.post('/sanctions/lists/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setMessage(`✓ ${LIST_NAMES[listCode]}: загружено ${data.count} записей`)
      onRefresh()
    } catch (e: any) {
      setMessage(`✗ Ошибка: ${e.response?.data?.detail || 'Не удалось загрузить'}`)
    } finally {
      setUploading(null)
    }
  }

  const handleAutoUpdate = async () => {
    setUpdating(true)
    setMessage('')
    try {
      await api.post('/sanctions/lists/update-auto')
      setMessage('✓ Обновление запущено. Обновите страницу через минуту.')
      setTimeout(() => onRefresh(), 5000)
    } catch (e: any) {
      setMessage(`✗ Ошибка обновления`)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Санкционные списки</h3>
        <button
          onClick={handleAutoUpdate}
          disabled={updating}
          className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white border border-[#1e2535] hover:border-[#2d3748] px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', updating && 'animate-spin')} />
          Обновить OFAC / EU / UK
        </button>
      </div>

      {message && (
        <div className={clsx(
          'text-xs px-3 py-2 rounded-lg',
          message.startsWith('✓') ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
        )}>
          {message}
        </div>
      )}

      <div className="space-y-2">
        {lists.map(list => (
          <div key={list.code} className="flex items-center justify-between py-2.5 border-b border-[#1e2535] last:border-0">
            <div>
              <p className="text-sm text-white">{list.name}</p>
              <p className="text-xs text-[#4b5563] mt-0.5">
                {list.entry_count > 0
                  ? `${list.entry_count.toLocaleString()} записей · обновлён ${list.last_updated ? format(new Date(list.last_updated), 'dd.MM.yyyy HH:mm') : '—'}`
                  : 'Не загружен'
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {list.entry_count > 0 && (
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">Активен</span>
              )}
              {!list.auto_update && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".xml,.csv"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(list.code, file)
                      e.target.value = ''
                    }}
                  />
                  <span className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white border border-[#1e2535] hover:border-[#2d3748] px-3 py-1.5 rounded-lg transition-colors">
                    {uploading === list.code
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Upload className="w-3.5 h-3.5" />
                    }
                    Загрузить XML
                  </span>
                </label>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Карточка результата ──────────────────────────────────────────────────────

function MatchCard({ match }: { match: any }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={clsx(
      'border rounded-xl overflow-hidden',
      match.match_level === 'match' ? 'border-red-500/30 bg-red-500/5' : 'border-yellow-500/30 bg-yellow-500/5'
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={clsx(
            'text-xs font-bold px-2 py-0.5 rounded',
            match.match_level === 'match' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
          )}>
            {match.score}%
          </span>
          <div>
            <p className="text-sm font-medium text-white">{match.primary_name}</p>
            <p className="text-xs text-[#6b7280]">{LIST_NAMES[match.list_code] || match.list_code}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#4b5563]" /> : <ChevronDown className="w-4 h-4 text-[#4b5563]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-[#1e2535]">
          {match.date_of_birth && (
            <div className="flex gap-2 text-xs mt-3">
              <span className="text-[#4b5563]">Дата рождения:</span>
              <span className={clsx('text-white', match.dob_match && 'text-red-400 font-medium')}>
                {match.date_of_birth} {match.dob_match && '✓ совпадает'}
              </span>
            </div>
          )}
          {match.nationality && (
            <div className="flex gap-2 text-xs">
              <span className="text-[#4b5563]">Гражданство:</span>
              <span className="text-white">{match.nationality}</span>
            </div>
          )}
          {match.country && (
            <div className="flex gap-2 text-xs">
              <span className="text-[#4b5563]">Страна:</span>
              <span className="text-white">{match.country}</span>
            </div>
          )}
          {match.aliases?.length > 0 && (
            <div className="text-xs">
              <span className="text-[#4b5563]">Псевдонимы: </span>
              <span className="text-[#9ca3af]">{match.aliases.slice(0, 5).join(', ')}</span>
            </div>
          )}
          <div className="text-xs">
            <span className="text-[#4b5563]">Тип: </span>
            <span className="text-[#9ca3af]">{match.entity_type === 'individual' ? 'Физическое лицо' : 'Организация'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── История проверок ─────────────────────────────────────────────────────────

function History({ history }: { history: any[] }) {
  const RESULT_COLORS: Record<string, string> = {
    clear: 'text-green-400',
    possible_match: 'text-yellow-400',
    match: 'text-red-400',
  }
  const RESULT_LABELS: Record<string, string> = {
    clear: 'Чисто',
    possible_match: 'Возможное совпадение',
    match: 'Совпадение',
  }

  return (
    <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">История проверок</h3>
      {history.length === 0 ? (
        <p className="text-[#4b5563] text-sm">Проверок ещё не было</p>
      ) : (
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className="flex items-center justify-between py-2 border-b border-[#1e2535] last:border-0">
              <div>
                <p className="text-sm text-white">{h.checked_name}</p>
                <p className="text-xs text-[#4b5563]">
                  {format(new Date(h.checked_at), 'dd.MM.yyyy HH:mm')}
                  {h.matches_count > 0 && ` · ${h.matches_count} совп.`}
                </p>
              </div>
              <span className={clsx('text-xs font-medium', RESULT_COLORS[h.result])}>
                {RESULT_LABELS[h.result]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Основная страница ────────────────────────────────────────────────────────

export default function Sanctions() {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [lists, setLists] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'search' | 'lists'>('search')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [listsRes, historyRes, statsRes] = await Promise.all([
        api.get('/sanctions/lists'),
        api.get('/sanctions/history?limit=20'),
        api.get('/sanctions/stats'),
      ])
      setLists(listsRes.data)
      setHistory(historyRes.data)
      setStats(statsRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSearch = async () => {
    if (!name.trim()) return
    setSearching(true)
    setResult(null)
    try {
      const { data } = await api.post('/sanctions/screen', {
        name: name.trim(),
        date_of_birth: dob || undefined,
      })
      setResult(data)
      loadData() // Обновляем историю
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка поиска')
    } finally {
      setSearching(false)
    }
  }

  const totalEntries = lists.reduce((sum, l) => sum + (l.entry_count || 0), 0)
  const resultConfig = result ? RESULT_CONFIG[result.result as keyof typeof RESULT_CONFIG] : null

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Санкционный скрининг</h1>
          <p className="text-[#6b7280] text-sm mt-0.5">
            {totalEntries > 0
              ? `${totalEntries.toLocaleString()} записей в базе · ${stats?.total_checks || 0} проверок проведено`
              : 'Загрузите санкционные списки для начала работы'
            }
          </p>
        </div>
        <div className="flex gap-2">
          {['search', 'lists'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-[#d4a843]/10 text-[#d4a843] border border-[#d4a843]/20'
                  : 'text-[#6b7280] hover:text-white border border-[#1e2535]'
              )}
            >
              {tab === 'search' ? 'Проверка' : 'Списки'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'lists' && (
        <ListsManager lists={lists} onRefresh={loadData} />
      )}

      {activeTab === 'search' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Форма поиска */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">Параметры проверки</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">
                    Имя / Наименование *
                  </label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Иванов Иван Иванович или Ivan Ivanov"
                    className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">
                    Дата рождения (необязательно)
                  </label>
                  <input
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#4b5563]">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Поиск ведётся с учётом транслитерации и похожих написаний. Порог совпадения: 75%</span>
              </div>

              <button
                onClick={handleSearch}
                disabled={searching || !name.trim() || totalEntries === 0}
                className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 disabled:cursor-not-allowed text-[#0a0d14] font-bold px-6 py-3 rounded-lg text-sm uppercase tracking-wider transition-colors"
              >
                <Search className="w-4 h-4" />
                {searching ? 'Проверка...' : 'Проверить'}
              </button>

              {totalEntries === 0 && (
                <p className="text-xs text-yellow-400">
                  Нет загруженных списков. Перейдите во вкладку "Списки" и загрузите файлы.
                </p>
              )}
            </div>

            {/* Результат */}
            {result && resultConfig && (
              <div className="space-y-3">
                <div className={clsx('border rounded-xl p-4 flex items-center gap-3', resultConfig.bg)}>
                  <resultConfig.icon className={clsx('w-5 h-5 flex-shrink-0', resultConfig.color)} />
                  <div>
                    <p className={clsx('font-semibold', resultConfig.color)}>{resultConfig.label}</p>
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      Проверено по: {result.lists_checked.map((c: string) => LIST_NAMES[c] || c).join(', ')}
                    </p>
                  </div>
                </div>

                {result.matches.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[#6b7280] uppercase tracking-wider">
                      Найдено совпадений: {result.matches.length}
                    </p>
                    {result.matches.map((match: any, i: number) => (
                      <MatchCard key={i} match={match} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* История */}
          <div>
            <History history={history} />
          </div>
        </div>
      )}
    </div>
  )
}
