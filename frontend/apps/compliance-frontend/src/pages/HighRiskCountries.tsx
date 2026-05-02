import { useState, useEffect, useRef } from 'react'
import { fmtDate, fmtDateTime } from '../utils/dates'
import {
  ShieldAlert, Plus, Pencil, CheckCircle2, XCircle, X,
  Upload, Search, ChevronDown, ChevronUp,
  FileText, AlertTriangle, Eye, EyeOff, Clock
} from 'lucide-react'
import api from '../api/client'
import clsx from 'clsx'
import { useSortable } from '../hooks/useSortable'
import SortTh from '../components/SortTh'

const COL = 'grid-cols-[2fr_2fr_2fr_140px_72px]'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface HRC {
  id: number
  name_ru: string
  name_en: string
  basis: string | null
  measures: string[]
  order_ref: string | null
  is_active: boolean
}

interface AuditEntry {
  id: number
  action: string
  country_name_ru: string | null
  old_value: Record<string, any> | null
  new_value: Record<string, any> | null
  changed_by_name: string
  changed_at: string
  notes: string | null
  pdf_filename: string | null
}

// ─── Справочник мер ───────────────────────────────────────────────────────────

const MEASURE_LABELS: Record<string, string> = {
  '1':   'Уведомление ОФРД',
  '1.1': 'Усиленная проверка (EDD)',
  '2':   'Отказ в деловых отношениях',
  '3':   'Отказ в корр. отношениях',
  '4':   'Усиленный надзор филиалов',
  '5':   'Отказ в лицензировании',
  '6':   'Отказ лицензировать учредителя',
}

// Упорядоченный список для отображения (1, 1.1, 2, 3, 4, 5, 6)
const MEASURE_ORDER = ['1', '1.1', '2', '3', '4', '5', '6']

const MEASURE_COLORS: Record<string, string> = {
  '1':   'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
  '1.1': 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  '2':   'bg-red-500/10 text-red-400 border-red-500/20',
  '3':   'bg-red-500/10 text-red-400 border-red-500/20',
  '4':   'bg-purple-400/10 text-purple-400 border-purple-400/20',
  '5':   'bg-red-500/10 text-red-400 border-red-500/20',
  '6':   'bg-red-500/10 text-red-400 border-red-500/20',
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  added:        { label: 'Добавлена',     color: 'text-green-400' },
  updated:      { label: 'Изменена',      color: 'text-blue-400' },
  deactivated:  { label: 'Исключена',     color: 'text-red-400' },
  reactivated:  { label: 'Восстановлена', color: 'text-yellow-400' },
  pdf_uploaded: { label: 'Загружен PDF',  color: 'text-[#d4a843]' },
}

const ALL_MEASURES = ['1', '1.1', '2', '3', '4', '5', '6']

// ─── Форма добавления / редактирования ────────────────────────────────────────

function CountryModal({
  initial, onClose, onSaved,
}: {
  initial?: HRC | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nameRu, setNameRu] = useState(initial?.name_ru ?? '')
  const [nameEn, setNameEn] = useState(initial?.name_en ?? '')
  const [basis, setBasis] = useState(initial?.basis ?? '')
  const [measures, setMeasures] = useState<string[]>(initial?.measures ?? ['1.1'])
  const [orderRef, setOrderRef] = useState(initial?.order_ref ?? 'Приказ ГСФР № 78-ө/п от 20.06.2025')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleMeasure = (m: string) =>
    setMeasures(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const save = async () => {
    if (!nameRu.trim() || !nameEn.trim() || measures.length === 0) {
      setError('Заполните название (RU, EN) и выберите хотя бы одну меру')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = { name_ru: nameRu, name_en: nameEn, basis, measures, order_ref: orderRef }
      if (initial) {
        await api.patch(`/high-risk-countries/${initial.id}`, payload)
      } else {
        await api.post('/high-risk-countries', payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка сохранения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-base font-bold text-white">
          {initial ? 'Редактировать страну' : 'Добавить страну'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">Название (кириллица)</label>
            <input value={nameRu} onChange={e => setNameRu(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
              placeholder="Республика Мали" />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">Название (латиница)</label>
            <input value={nameEn} onChange={e => setNameEn(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
              placeholder="Republic of Mali" />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">Основание</label>
            <input value={basis} onChange={e => setBasis(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
              placeholder="список ФАТФ" />
          </div>
          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">Реквизиты приказа</label>
            <input value={orderRef} onChange={e => setOrderRef(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
          </div>

          <div>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-2">Применяемые меры</label>
            <div className="space-y-1.5">
              {ALL_MEASURES.map(m => (
                <button key={m} onClick={() => toggleMeasure(m)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-xs transition-colors',
                    measures.includes(m)
                      ? 'border-[#d4a843]/40 bg-[#d4a843]/5 text-white'
                      : 'border-[#1e2535] text-[#6b7280] hover:border-[#374151]'
                  )}>
                  <span className={clsx(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    measures.includes(m) ? 'border-[#d4a843] bg-[#d4a843]' : 'border-[#374151]'
                  )}>
                    {measures.includes(m) && <CheckCircle2 className="w-3 h-3 text-[#0a0d14]" />}
                  </span>
                  <span className="font-mono text-[#d4a843] w-5">{m}</span>
                  <span>{MEASURE_LABELS[m]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[#1e2535] text-[#6b7280] hover:text-white text-sm transition-colors">
            Отмена
          </button>
          <button onClick={save} disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold text-sm uppercase tracking-wider transition-colors">
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Модалка загрузки PDF ──────────────────────────────────────────────────────

function UploadPdfModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [orderRef, setOrderRef] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async () => {
    if (!file || !orderRef.trim()) {
      setError('Выберите PDF и укажите реквизиты приказа')
      return
    }
    setLoading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('order_ref', orderRef)
      fd.append('notes', notes)
      await api.post('/high-risk-countries/upload-pdf', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onUploaded()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-bold text-white">Загрузить PDF-приказ</h2>

        <div
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
            file ? 'border-[#d4a843]/50 bg-[#d4a843]/5' : 'border-[#1e2535] hover:border-[#374151]'
          )}>
          <FileText className={clsx('w-8 h-8 mx-auto mb-2', file ? 'text-[#d4a843]' : 'text-[#374151]')} />
          <p className="text-sm text-[#9ca3af]">
            {file ? file.name : 'Нажмите для выбора PDF'}
          </p>
          {file && <p className="text-xs text-[#4b5563] mt-1">{(file.size / 1024).toFixed(0)} KB</p>}
          <input ref={inputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
        </div>

        <div>
          <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">Реквизиты приказа</label>
          <input value={orderRef} onChange={e => setOrderRef(e.target.value)}
            className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
            placeholder="Приказ ГСФР № 78-ө/п от 20.06.2025" />
        </div>

        <div>
          <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">Примечание</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 resize-none"
            placeholder="Что изменилось в новой редакции..." />
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[#1e2535] text-[#6b7280] hover:text-white text-sm transition-colors">
            Отмена
          </button>
          <button onClick={upload} disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold text-sm uppercase tracking-wider transition-colors">
            {loading ? 'Загрузка...' : 'Загрузить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Строка журнала ────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const info = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'text-[#6b7280]' }

  return (
    <div className="border-b border-[#1e2535] last:border-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#1e2535]/30 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-xs font-semibold', info.color)}>{info.label}</span>
            {entry.country_name_ru && (
              <span className="text-xs text-white">{entry.country_name_ru}</span>
            )}
            {entry.pdf_filename && (
              <span className="text-xs text-[#9ca3af] truncate">{entry.pdf_filename}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-[#4b5563]">{entry.changed_by_name}</span>
            <span className="text-xs text-[#374151]">·</span>
            <span className="text-xs text-[#4b5563]">
              {fmtDateTime(entry.changed_at)}
            </span>
          </div>
          {entry.notes && (
            <p className="text-xs text-[#6b7280] mt-0.5 truncate">{entry.notes}</p>
          )}
        </div>
        {(entry.old_value || entry.new_value || entry.pdf_filename) && (
          open ? <ChevronUp className="w-3.5 h-3.5 text-[#374151] flex-shrink-0 mt-0.5" />
               : <ChevronDown className="w-3.5 h-3.5 text-[#374151] flex-shrink-0 mt-0.5" />
        )}
      </button>

      {open && (entry.old_value || entry.new_value) && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-3">
          {entry.old_value && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-400 font-semibold mb-1">Было</p>
              <pre className="text-xs text-[#9ca3af] whitespace-pre-wrap">
                {JSON.stringify(entry.old_value, null, 2)}
              </pre>
            </div>
          )}
          {entry.new_value && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
              <p className="text-xs text-green-400 font-semibold mb-1">Стало</p>
              <pre className="text-xs text-[#9ca3af] whitespace-pre-wrap">
                {JSON.stringify(entry.new_value, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {open && entry.pdf_filename && (
        <div className="px-4 pb-3">
          <a href={`/api/high-risk-countries/pdf/${entry.pdf_filename}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#d4a843] hover:text-[#e0b84d] transition-colors">
            <FileText className="w-3.5 h-3.5" />
            Открыть PDF
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Основная страница ────────────────────────────────────────────────────────

export default function HighRiskCountries() {
  const [countries, setCountries] = useState<HRC[]>([])
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'list' | 'history'>('list')
  const [editCountry, setEditCountry] = useState<HRC | null | undefined>(undefined)
  const [showUpload, setShowUpload] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [cRes, hRes] = await Promise.all([
        api.get('/high-risk-countries', { params: { include_inactive: showInactive } }),
        api.get('/high-risk-countries/history'),
      ])
      setCountries(cRes.data)
      setHistory(hRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [showInactive])

  const filtered = countries.filter(c =>
    !search ||
    c.name_ru.toLowerCase().includes(search.toLowerCase()) ||
    c.name_en.toLowerCase().includes(search.toLowerCase()) ||
    (c.basis ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const { sorted, sortKey, sortDir, toggle: sortToggle } = useSortable(filtered, 'name_ru')

  const toggle = async (c: HRC) => {
    await api.patch(`/high-risk-countries/${c.id}`, { is_active: !c.is_active })
    load()
  }

  const latestPdf = history.find(h => h.action === 'pdf_uploaded')

  return (
    <div className="p-6 space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-red-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Перечень высокорисковых стран</h1>
            <p className="text-xs text-[#6b7280] mt-0.5">
              Приказ ГСФР № 78-ө/п · {countries.filter(c => c.is_active).length} стран
              {latestPdf && (
                <span> · Обновлён {fmtDate(history.find(h => h.action === 'pdf_uploaded')!.changed_at)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={clsx('transition-all duration-200 overflow-hidden', searchOpen || search ? 'w-56 opacity-100' : 'w-0 opacity-0')}>
            <div className="relative">
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
                placeholder="Название или основание..."
                className="w-full bg-[#111520] border border-[#1e2535] rounded-lg pl-3 pr-8 py-2 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]" />
              {search && (
                <button onClick={() => { setSearch(''); setSearchOpen(false) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <button onClick={() => { setSearchOpen(v => !v); if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 50) }}
            className={clsx('p-2 rounded-lg border transition-colors', searchOpen || search ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5' : 'border-[#1e2535] text-[#4b5563] hover:text-white hover:border-[#374151]')}>
            <Search className="w-4 h-4" />
          </button>
          <button onClick={() => setShowInactive(v => !v)}
            className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
              showInactive ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5' : 'border-[#1e2535] text-[#6b7280] hover:text-white hover:border-[#374151]')}>
            {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Исключённые
          </button>
          <button onClick={() => setShowUpload(true)} className="btn-secondary">
            <Upload className="w-4 h-4" />
            Загрузить PDF
          </button>
          <button onClick={() => setEditCountry(null)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Добавить страну
          </button>
        </div>
      </div>

      {/* Меры — расшифровка */}
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Применяемые меры (Постановление КР № 606)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {MEASURE_ORDER.map(code => { const label = MEASURE_LABELS[code]; return (
            <div key={code} className="flex items-center gap-2">
              <span className={clsx('text-xs font-mono px-1.5 py-0.5 rounded border', MEASURE_COLORS[code])}>{code}</span>
              <span className="text-xs text-[#9ca3af]">{label}</span>
            </div>
          )})}

        </div>
      </div>

      {/* Табы */}
      <div className="flex gap-1 border-b border-[#1e2535]">
        {([['list', 'Перечень стран'], ['history', 'История изменений']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === key
                ? 'border-[#d4a843] text-[#d4a843]'
                : 'border-transparent text-[#6b7280] hover:text-white'
            )}>
            {label}
            {key === 'history' && history.length > 0 && (
              <span className="ml-1.5 text-xs bg-[#1e2535] text-[#9ca3af] px-1.5 py-0.5 rounded-full">{history.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* Таблица */}
          <div className="bg-[#111520] border border-[#1e2535] rounded-xl overflow-hidden">
            <div className={`grid ${COL} gap-4 px-5 py-3 border-b border-[#1e2535] bg-[#0d1017]`}>
              <SortTh as="div" label="Страна (RU)" field="name_ru" current={String(sortKey)} dir={sortDir} onSort={sortToggle} />
              <SortTh as="div" label="Страна (EN)" field="name_en" current={String(sortKey)} dir={sortDir} onSort={sortToggle} />
              <SortTh as="div" label="Основание"   field="basis"   current={String(sortKey)} dir={sortDir} onSort={sortToggle} />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#4b5563]">Меры</span>
              <span />
            </div>

            {loading ? (
              <div className="py-12 text-center text-[#4b5563] text-sm">Загрузка...</div>
            ) : sorted.length === 0 ? (
              <div className="py-12 text-center text-[#4b5563] text-sm">Ничего не найдено</div>
            ) : (
              sorted.map(c => (
                <div key={c.id}
                  className={clsx(
                    `grid ${COL} gap-4 px-5 py-3.5 border-b border-[#1e2535] last:border-0 items-center`,
                    !c.is_active && 'opacity-40'
                  )}>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{c.name_ru}</p>
                  </div>
                  <p className="text-sm text-[#9ca3af] truncate">{c.name_en}</p>
                  <p className="text-xs text-[#6b7280] leading-relaxed">{c.basis ?? '—'}</p>
                  <div className="flex flex-wrap gap-1">
                    {c.measures.map(m => (
                      <span key={m} className={clsx('text-xs font-mono px-1.5 py-0.5 rounded border', MEASURE_COLORS[m] ?? 'bg-[#1e2535] text-[#6b7280] border-[#1e2535]')}>
                        {m}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditCountry(c)}
                      className="p-1.5 rounded text-[#4b5563] hover:text-white hover:bg-[#1e2535] transition-colors" title="Редактировать">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggle(c)}
                      className={clsx(
                        'p-1.5 rounded transition-colors',
                        c.is_active
                          ? 'text-[#4b5563] hover:text-red-400 hover:bg-red-500/10'
                          : 'text-[#4b5563] hover:text-green-400 hover:bg-green-500/10'
                      )} title={c.is_active ? 'Исключить из перечня' : 'Восстановить'}>
                      {c.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="bg-[#111520] border border-[#1e2535] rounded-xl overflow-hidden">
          {history.length === 0 ? (
            <div className="py-12 text-center">
              <Clock className="w-8 h-8 text-[#374151] mx-auto mb-3" />
              <p className="text-sm text-[#4b5563]">История изменений пуста</p>
            </div>
          ) : (
            history.map(entry => <AuditRow key={entry.id} entry={entry} />)
          )}
        </div>
      )}

      {/* Модалки */}
      {editCountry !== undefined && (
        <CountryModal
          initial={editCountry}
          onClose={() => setEditCountry(undefined)}
          onSaved={() => { setEditCountry(undefined); load() }}
        />
      )}
      {showUpload && (
        <UploadPdfModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); load() }}
        />
      )}
    </div>
  )
}
