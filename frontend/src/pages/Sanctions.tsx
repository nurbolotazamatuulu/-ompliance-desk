import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Upload, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, ShieldAlert, Download, Play,
  Calendar, Clock, Filter, ArrowUpDown, X, Users2,
  LayoutList, Layers, ShieldCheck, ShieldX, MessageSquare,
} from 'lucide-react'
import api from '../api/client'
import { format, formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import clsx from 'clsx'
import * as XLSX from 'xlsx'

// ─── Справочники ──────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  confirmed: {
    label: 'Подтверждено', short: '≥92%',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/30',
    card: 'border-red-500/40 bg-red-500/5',
    dot: 'bg-red-500',
  },
  probable: {
    label: 'Вероятное', short: '78–91%',
    badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    card: 'border-orange-500/40 bg-orange-500/5',
    dot: 'bg-orange-400',
  },
  possible: {
    label: 'Возможное', short: '60–77%',
    badge: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    card: 'border-yellow-500/40 bg-yellow-500/5',
    dot: 'bg-yellow-400',
  },
}

const RESULT_CONFIG = {
  clear: {
    label: 'Чисто', color: 'text-green-400', dot: 'bg-green-500',
    bg: 'bg-green-400/10 border-green-400/20', icon: CheckCircle2,
    rowBg: '',
  },
  possible_match: {
    label: 'Возможное', color: 'text-yellow-400', dot: 'bg-yellow-400',
    bg: 'bg-yellow-400/10 border-yellow-400/20', icon: AlertTriangle,
    rowBg: 'bg-yellow-500/3',
  },
  match: {
    label: 'Совпадение', color: 'text-red-400', dot: 'bg-red-500',
    bg: 'bg-red-400/10 border-red-400/20', icon: XCircle,
    rowBg: 'bg-red-500/5',
  },
}

const LIST_NAMES: Record<string, string> = {
  GSFR_KG_1: 'ГСФР — ПФТ',
  GSFR_KG_2: 'ГСФР — ПЛПД ФЛ',
  GSFR_KG_3: 'ГСФР — ПЛПД ЮЛ',
  GSFR_KG_4: 'ГСФР — Сводный',
  UN: 'ООН',
  OFAC: 'OFAC (США)',
  EU: 'ЕС',
  UK: 'Великобритания',
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const SCHEDULE_KEY = 'sanctions_schedule_v1'
const PAGE_SIZE = 50

interface Schedule {
  enabled: boolean
  weekday: number
  hour: number
  minute: number
  lastRunAt: string | null
}

const DEFAULT_SCHEDULE: Schedule = { enabled: false, weekday: 0, hour: 9, minute: 0, lastRunAt: null }

// ─── Деталь совпадения (развёрнутая строка) ──────────────────────────────────

function MatchDetailCard({ code, matches, listName }: { code: string; matches: any[]; listName: string }) {
  const best = matches.reduce((a: any, b: any) => (a.score > b.score ? a : b))
  const tier = TIER_CONFIG[best.match_tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.possible
  return (
    <div className={clsx('border rounded-xl p-3 space-y-2', tier.card)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-white truncate">{listName}</p>
        <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0', tier.badge)}>
          {best.score}%
        </span>
      </div>
      <div className="space-y-1 text-xs">
        <p className="text-white font-medium">{best.primary_name}</p>
        {best.date_of_birth && (
          <p className="text-[#6b7280]">
            Дата рождения:{' '}
            <span className={best.dob_match ? 'text-red-400 font-semibold' : 'text-[#9ca3af]'}>
              {best.date_of_birth}{best.dob_match && ' ✓ совпадает'}
            </span>
          </p>
        )}
        {best.nationality && (
          <p className="text-[#6b7280]">Гражданство: <span className="text-[#9ca3af]">{best.nationality}</span></p>
        )}
        {best.country && (
          <p className="text-[#6b7280]">Страна: <span className="text-[#9ca3af]">{best.country}</span></p>
        )}
        {best.aliases?.length > 0 && (
          <p className="text-[#6b7280] truncate">
            Псевдонимы: <span className="text-[#9ca3af]">{best.aliases.slice(0, 3).join(', ')}</span>
          </p>
        )}
        <p className="text-[#6b7280]">
          Тип: <span className="text-[#9ca3af]">{best.entity_type === 'individual' ? 'Физическое лицо' : 'Организация'}</span>
        </p>
        {matches.length > 1 && (
          <p className="text-[#4b5563]">+{matches.length - 1} других совпадений в этом списке</p>
        )}
      </div>
    </div>
  )
}

function OfficerDecisionPanel({ row, onDecisionSaved }: { row: any; onDecisionSaved: () => void }) {
  const [decision, setDecision] = useState<'confirmed' | 'false_positive' | null>(row.officer_decision || null)
  const [notes, setNotes] = useState<string>(row.officer_notes || '')
  const [saving, setSaving] = useState(false)
  const [showNotes, setShowNotes] = useState(!!row.officer_notes)
  const [notesSaved, setNotesSaved] = useState(false)

  // Sync local state when row data updates after reload
  useEffect(() => {
    setDecision(row.officer_decision || null)
    setNotes(row.officer_notes || '')
    setShowNotes(!!row.officer_notes)
  }, [row.officer_decision, row.officer_notes, row.check_id])

  const patch = async (d: string | null, n: string | null) => {
    await api.patch(`/sanctions/checks/${row.check_id}/decision`, { decision: d, notes: n })
  }

  const saveDecision = async (d: 'confirmed' | 'false_positive') => {
    if (!row.check_id) return
    setSaving(true)
    try {
      await patch(d, notes)
      setDecision(d)
      onDecisionSaved()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const saveNotes = async () => {
    if (!row.check_id) return
    setSaving(true)
    try {
      await patch(decision, notes)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
      onDecisionSaved()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const reset = async () => {
    if (!row.check_id) return
    setSaving(true)
    try {
      await patch(null, null)
      setDecision(null)
      setNotes('')
      setShowNotes(false)
      onDecisionSaved()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  if (!row.check_id) return null

  return (
    <div className="mt-4 border border-[#1e2535] rounded-xl p-3 bg-[#0d1017]">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[#6b7280] uppercase tracking-wider font-semibold">Решение офицера</p>
        {decision && (
          <div className={clsx(
            'flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border',
            decision === 'confirmed'
              ? 'text-red-400 border-red-500/30 bg-red-500/10'
              : 'text-green-400 border-green-500/30 bg-green-500/10'
          )}>
            {decision === 'confirmed' ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            {decision === 'confirmed' ? 'Совпадение подтверждено' : 'Ложное срабатывание'}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => saveDecision('confirmed')}
          disabled={saving || decision === 'confirmed'}
          className={clsx(
            'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors',
            decision === 'confirmed'
              ? 'bg-red-500/20 border-red-500/40 text-red-400 cursor-default'
              : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          )}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Подтвердить совпадение
        </button>

        <button
          onClick={() => saveDecision('false_positive')}
          disabled={saving || decision === 'false_positive'}
          className={clsx(
            'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors',
            decision === 'false_positive'
              ? 'bg-green-500/20 border-green-500/40 text-green-400 cursor-default'
              : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
          )}
        >
          <ShieldX className="w-3.5 h-3.5" />
          Ложное срабатывание
        </button>

        <button
          onClick={() => setShowNotes(v => !v)}
          className="flex items-center gap-1 text-xs text-[#6b7280] hover:text-white transition-colors px-2 py-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {notes ? 'Изменить комментарий' : 'Комментарий'}
        </button>

        {decision && (
          <button onClick={reset} disabled={saving} className="text-xs text-[#4b5563] hover:text-white transition-colors ml-auto">
            Сбросить
          </button>
        )}
      </div>

      {showNotes && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Добавьте комментарий к решению..."
            rows={2}
            className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-xs text-white placeholder-[#4b5563] resize-none focus:outline-none focus:border-[#3b82f6]"
          />
          <button
            onClick={saveNotes}
            disabled={saving}
            className="text-xs px-3 py-1 bg-[#3b82f6]/20 border border-[#3b82f6]/30 text-[#3b82f6] rounded-lg hover:bg-[#3b82f6]/30 transition-colors"
          >
            {notesSaved ? 'Сохранено ✓' : 'Сохранить комментарий'}
          </button>
        </div>
      )}

      {row.officer_decided_at && (
        <p className="text-[10px] text-[#4b5563] mt-2">
          Решение принято: {format(new Date(row.officer_decided_at), 'dd.MM.yyyy HH:mm')}
        </p>
      )}
    </div>
  )
}

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  client: 'Клиент',
  ubo: 'УБО / Бенефициарный владелец',
  director: 'Директор',
  signatory: 'Доверенное лицо',
  pep_family: 'Родственник ПДЛ',
  pep_associate: 'Близкое лицо ПДЛ',
}

function SubjectHitCard({ subject, listNamesMap }: { subject: any; listNamesMap: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const rc = RESULT_CONFIG[subject.result as keyof typeof RESULT_CONFIG] || RESULT_CONFIG.possible_match
  const byList: Record<string, any[]> = {}
  for (const m of (subject.matches || [])) {
    const lc = m.list_code || 'unknown'
    if (!byList[lc]) byList[lc] = []
    byList[lc].push(m)
  }
  const bestMatch = (subject.matches || []).reduce((a: any, b: any) => (!a || b.score > a.score ? b : a), null)
  return (
    <div className={clsx('border rounded-xl overflow-hidden', rc.bg)}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', rc.dot)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{subject.subject_name}</p>
          <p className="text-[10px] text-[#6b7280] mt-0.5">{SUBJECT_TYPE_LABELS[subject.subject_type] || subject.subject_type}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={clsx('text-xs font-medium', rc.color)}>{rc.label}</span>
          {bestMatch && (
            <span className="text-[10px] text-[#6b7280]">{bestMatch.score}%</span>
          )}
          {open ? <ChevronUp className="w-3 h-3 text-[#4b5563]" /> : <ChevronDown className="w-3 h-3 text-[#4b5563]" />}
        </div>
      </button>
      {open && Object.keys(byList).length > 0 && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(byList).map(([code, ms]) => (
            <MatchDetailCard key={code} code={code} matches={ms} listName={listNamesMap[code] || LIST_NAMES[code] || code} />
          ))}
        </div>
      )}
    </div>
  )
}

function ExpandedRow({ row, listNamesMap, onDecisionSaved }: { row: any; listNamesMap: Record<string, string>; onDecisionSaved: () => void }) {
  const matches: any[] = row.matches || []
  const subjects: any[] = row.subjects || []

  if (matches.length === 0 && subjects.length === 0) {
    return (
      <tr>
        <td colSpan={99} className="px-4 py-4 sanctions-expanded-row border-b border-[#1e2535]">
          <p className="text-xs text-[#4b5563]">Совпадений не найдено — запись прошла проверку по всем спискам</p>
          <OfficerDecisionPanel row={row} onDecisionSaved={onDecisionSaved} />
        </td>
      </tr>
    )
  }

  const byList: Record<string, any[]> = {}
  for (const m of matches) {
    const lc = m.list_code || 'unknown'
    if (!byList[lc]) byList[lc] = []
    byList[lc].push(m)
  }

  return (
    <tr>
      <td colSpan={99} className="px-4 py-4 sanctions-expanded-row border-b border-[#1e2535]">

        {/* ── Subjects with hits ── */}
        {subjects.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-2">
              Субъекты с совпадениями — {subjects.length}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {subjects.map((s: any, i: number) => (
                <SubjectHitCard key={i} subject={s} listNamesMap={listNamesMap} />
              ))}
            </div>
          </div>
        )}

        {/* ── Matches by list (overall) ── */}
        {Object.keys(byList).length > 0 && (
          <>
            <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-3">
              Совпадения по спискам — {matches.length} найдено
            </p>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {Object.entries(byList).map(([code, ms]) => (
                <MatchDetailCard
                  key={code}
                  code={code}
                  matches={ms}
                  listName={listNamesMap[code] || LIST_NAMES[code] || code}
                />
              ))}
            </div>
          </>
        )}

        <OfficerDecisionPanel row={row} onDecisionSaved={onDecisionSaved} />
      </td>
    </tr>
  )
}

// ─── Таблица результатов ──────────────────────────────────────────────────────

type GroupBy = 'result' | 'type' | 'none'
type SortBy = 'name' | 'score' | 'date'

function bestScore(row: any): number {
  const vals = Object.values(row.per_list) as any[]
  if (!vals.length) return 0
  return Math.max(...vals.map((v: any) => v.score))
}

function ResultsTable({
  results,
  loading,
  onDecisionSaved,
}: {
  results: any | null
  loading: boolean
  onDecisionSaved: () => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('result')
  const [sortBy, setSortBy] = useState<SortBy>('score')
  const [filterResult, setFilterResult] = useState<string>('all')
  const [filterList, setFilterList] = useState<string>('all')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [search, filterResult, filterList, groupBy])

  if (loading) return <div className="py-20 text-center text-[#4b5563] text-sm">Загрузка...</div>
  if (!results || !results.clients.length) {
    return (
      <div className="py-20 text-center">
        <ShieldAlert className="w-10 h-10 text-[#1e2535] mx-auto mb-3" />
        <p className="text-[#4b5563] text-sm">Пересмотр ещё не запускался</p>
        <p className="text-xs text-[#374151] mt-1">Нажмите «Запустить пересмотр» для проверки всех клиентов</p>
      </div>
    )
  }

  const { list_codes, list_names, clients } = results
  const listNamesMap: Record<string, string> = list_names || {}

  // Filter
  let filtered = clients.filter((r: any) => {
    if (filterResult !== 'all' && r.result !== filterResult) return false
    if (filterList !== 'all' && !r.per_list[filterList]) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (!r.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Sort
  filtered = [...filtered].sort((a: any, b: any) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'ru')
    if (sortBy === 'score') return bestScore(b) - bestScore(a)
    if (sortBy === 'date') {
      if (!a.checked_at) return 1
      if (!b.checked_at) return -1
      return new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime()
    }
    return 0
  })

  // Group
  const RESULT_ORDER = ['match', 'possible_match', 'clear']
  const groups: { key: string; label: string; rows: any[] }[] = []
  if (groupBy === 'result') {
    for (const key of RESULT_ORDER) {
      const rows = filtered.filter((r: any) => r.result === key)
      if (rows.length) groups.push({ key, label: RESULT_CONFIG[key as keyof typeof RESULT_CONFIG]?.label || key, rows })
    }
  } else if (groupBy === 'type') {
    const fl = filtered.filter((r: any) => r.client_type === 'individual')
    const ul = filtered.filter((r: any) => r.client_type === 'legal')
    if (fl.length) groups.push({ key: 'individual', label: 'Физические лица', rows: fl })
    if (ul.length) groups.push({ key: 'legal', label: 'Юридические лица', rows: ul })
  } else {
    groups.push({ key: 'all', label: '', rows: filtered })
  }

  const allRows = groups.flatMap(g => g.rows)
  const totalPages = Math.ceil(allRows.length / PAGE_SIZE)
  const pagedRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const countByResult = (key: string) => clients.filter((r: any) => r.result === key).length

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4b5563]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени..."
            className="w-full pl-9 pr-3 py-2 bg-[#111520] border border-[#1e2535] rounded-lg text-sm text-white placeholder-[#374151] focus:outline-none focus:border-[#d4a843]/40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter by result */}
        <div className="flex gap-1">
          {[
            { v: 'all', label: `Все (${clients.length})`, cls: 'text-white' },
            { v: 'match', label: `Совпадения (${countByResult('match')})`, cls: 'text-red-400' },
            { v: 'possible_match', label: `Возможные (${countByResult('possible_match')})`, cls: 'text-yellow-400' },
            { v: 'clear', label: `Чисто (${countByResult('clear')})`, cls: 'text-green-400' },
          ].map(f => (
            <button
              key={f.v}
              onClick={() => setFilterResult(f.v)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap',
                filterResult === f.v
                  ? 'border-[#d4a843]/40 bg-[#d4a843]/10 text-[#d4a843]'
                  : `border-[#1e2535] ${f.cls} hover:border-[#2d3748] bg-[#111520]`
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filter by list */}
        <select
          value={filterList}
          onChange={e => setFilterList(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#1e2535] bg-[#111520] text-[#9ca3af] focus:outline-none focus:border-[#d4a843]/40"
        >
          <option value="all">Все списки</option>
          {list_codes.map((c: string) => (
            <option key={c} value={c}>{LIST_NAMES[c] || listNamesMap[c] || c}</option>
          ))}
        </select>

        {/* Group */}
        <div className="flex rounded-lg overflow-hidden border border-[#1e2535]">
          {[
            { v: 'result', icon: Layers, tip: 'По результату' },
            { v: 'type', icon: Users2, tip: 'По типу клиента' },
            { v: 'none', icon: LayoutList, tip: 'Без группировки' },
          ].map(g => (
            <button
              key={g.v}
              onClick={() => setGroupBy(g.v as GroupBy)}
              title={g.tip}
              className={clsx(
                'p-2 transition-colors',
                groupBy === g.v ? 'bg-[#d4a843]/10 text-[#d4a843]' : 'bg-[#111520] text-[#4b5563] hover:text-white'
              )}
            >
              <g.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#1e2535] bg-[#111520] text-[#9ca3af] focus:outline-none focus:border-[#d4a843]/40"
        >
          <option value="score">По % совпадения</option>
          <option value="name">По имени (А–Я)</option>
          <option value="date">По дате проверки</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#111520] border border-[#1e2535] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2535] text-xs text-[#374151] uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-semibold">Клиент</th>
                {list_codes.map((code: string) => (
                  <th key={code} className="px-3 py-3 text-center font-semibold whitespace-nowrap">
                    {LIST_NAMES[code] || listNamesMap[code] || code}
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-semibold">Итог</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Дата проверки</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let rowIdx = 0
                const elements: JSX.Element[] = []
                for (const group of groups) {
                  const groupRows = group.rows.filter(r => pagedRows.includes(r))
                  if (groupRows.length === 0) continue
                  if (groupBy !== 'none') {
                    const rc = RESULT_CONFIG[group.key as keyof typeof RESULT_CONFIG]
                    elements.push(
                      <tr key={`group-${group.key}`}>
                        <td colSpan={99} className="px-4 py-2 sanctions-group-header border-b border-[#1e2535]">
                          <div className="flex items-center gap-2">
                            {rc && <span className={clsx('w-2 h-2 rounded-full', rc.dot)} />}
                            <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
                              {group.label} · {group.rows.length}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  for (const row of groupRows) {
                    rowIdx++
                    const rc = RESULT_CONFIG[row.result as keyof typeof RESULT_CONFIG]
                    const isOpen = expanded === row.client_id
                    const hasHits = row.result !== 'clear'
                    elements.push(
                      <tr
                        key={`row-${row.client_id}`}
                        onClick={() => setExpanded(isOpen ? null : row.client_id)}
                        className={clsx(
                          'border-b border-[#1e2535] transition-colors cursor-pointer select-none',
                          rc?.rowBg,
                          isOpen ? 'sanctions-row-open' : 'hover:bg-[#0d1017]'
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', rc?.dot || 'bg-gray-500')} />
                            <div className="min-w-0">
                              <p className="text-white font-medium truncate">{row.name}</p>
                              <p className="text-xs text-[#4b5563]">
                                {row.client_type === 'individual' ? 'ФЛ' : 'ЮЛ'} · #{row.client_id}
                              </p>
                            </div>
                            {hasHits && (
                              isOpen
                                ? <ChevronUp className="w-3.5 h-3.5 text-[#4b5563] flex-shrink-0 ml-auto" />
                                : <ChevronDown className="w-3.5 h-3.5 text-[#4b5563] flex-shrink-0 ml-auto" />
                            )}
                          </div>
                        </td>
                        {list_codes.map((code: string) => {
                          const info = row.per_list[code]
                          if (!info) return (
                            <td key={code} className="px-3 py-3 text-center">
                              <span className="text-[#1e2535] text-xs">—</span>
                            </td>
                          )
                          const t = TIER_CONFIG[info.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.possible
                          return (
                            <td key={code} className="px-3 py-3 text-center">
                              <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded border', t.badge)}>
                                {info.score}%
                              </span>
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center">
                          <span className={clsx('text-xs font-medium', rc?.color)}>
                            {rc?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b7280] whitespace-nowrap">
                          {row.checked_at
                            ? format(new Date(row.checked_at), 'dd.MM.yyyy HH:mm')
                            : <span className="text-[#374151]">—</span>
                          }
                        </td>
                      </tr>
                    )
                    if (isOpen) {
                      elements.push(<ExpandedRow key={`exp-${row.client_id}`} row={row} listNamesMap={{ ...listNamesMap, ...LIST_NAMES }} onDecisionSaved={onDecisionSaved} />)
                    }
                  }
                }
                return elements
              })()}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-[#4b5563] text-sm">Нет результатов</div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#1e2535]">
            <span className="text-xs text-[#6b7280]">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} из {filtered.length}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs rounded border border-[#1e2535] text-[#6b7280] hover:text-white disabled:opacity-30 transition-colors"
              >
                ← Назад
              </button>
              <span className="px-3 py-1 text-xs text-[#9ca3af]">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs rounded border border-[#1e2535] text-[#6b7280] hover:text-white disabled:opacity-30 transition-colors"
              >
                Вперёд →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
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
    } catch {
      setMessage('✗ Ошибка обновления')
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
          className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white border border-[#1e2535] px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', updating && 'animate-spin')} />
          Обновить OFAC / EU / UK
        </button>
      </div>
      {message && (
        <div className={clsx('text-xs px-3 py-2 rounded-lg', message.startsWith('✓') ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400')}>
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
                  ? `${list.entry_count.toLocaleString()} записей · ${list.last_updated ? format(new Date(list.last_updated), 'dd.MM.yyyy HH:mm') : '—'}`
                  : 'Не загружен'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {list.entry_count > 0 && (
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">Активен</span>
              )}
              {!list.auto_update && (
                <label className="cursor-pointer">
                  <input type="file" accept=".xml,.csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(list.code, f); e.target.value = '' }} />
                  <span className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white border border-[#1e2535] px-3 py-1.5 rounded-lg transition-colors">
                    {uploading === list.code ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Загрузить
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

// ─── Основная страница ────────────────────────────────────────────────────────

export default function Sanctions() {
  // Lists + stats
  const [lists, setLists] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'screening' | 'lists'>('screening')

  // Mass screening
  const [results, setResults] = useState<any | null>(null)
  const [loadingResults, setLoadingResults] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<any>(null)

  // Schedule (localStorage)
  const [schedule, setSchedule] = useState<Schedule>(() => {
    try { return { ...DEFAULT_SCHEDULE, ...JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}') } } catch { return DEFAULT_SCHEDULE }
  })
  const [showSchedule, setShowSchedule] = useState(false)

  // Single check
  const [showSingleCheck, setShowSingleCheck] = useState(false)
  const [singleName, setSingleName] = useState('')
  const [singleDob, setSingleDob] = useState('')
  const [singleSearching, setSingleSearching] = useState(false)
  const [singleResult, setSingleResult] = useState<any>(null)

  const saveSchedule = (s: Schedule) => {
    setSchedule(s)
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(s))
  }

  const totalEntries = lists.reduce((sum, l) => sum + (l.entry_count || 0), 0)

  const loadLists = async () => {
    try {
      const [listsRes, statsRes] = await Promise.all([
        api.get('/sanctions/lists'),
        api.get('/sanctions/stats'),
      ])
      setLists(listsRes.data)
      setStats(statsRes.data)
    } catch (e) { console.error(e) }
  }

  const loadResults = async () => {
    setLoadingResults(true)
    try {
      const { data } = await api.get('/sanctions/rescreening/results')
      setResults(data)
    } catch (e) { console.error(e) } finally { setLoadingResults(false) }
  }

  const runRescreening = useCallback(async (auto = false) => {
    if (running) return
    setRunning(true)
    setRunResult(null)
    try {
      const { data } = await api.post('/sanctions/rescreening')
      setRunResult(data)
      const now = new Date().toISOString()
      saveSchedule({ ...schedule, lastRunAt: now })
      await loadResults()
    } catch (e: any) {
      setRunResult({ error: e.response?.data?.detail || 'Ошибка' })
    } finally {
      setRunning(false) }
  }, [running, schedule])

  // Auto-schedule check on mount
  useEffect(() => {
    loadLists()
    loadResults()
  }, [])

  useEffect(() => {
    if (!schedule.enabled || running) return
    const now = new Date()
    const jsDay = now.getDay() // 0=Sun…6=Sat
    const moDay = jsDay === 0 ? 6 : jsDay - 1 // convert to Mon=0
    if (moDay !== schedule.weekday) return
    if (now.getHours() < schedule.hour) return
    const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null
    const sixDays = 6 * 24 * 60 * 60 * 1000
    if (lastRun && now.getTime() - lastRun.getTime() < sixDays) return
    runRescreening(true)
  }, [schedule])

  const exportToExcel = () => {
    if (!results) return
    const { list_codes, list_names, clients } = results
    const lnMap = { ...LIST_NAMES, ...list_names }
    const headers = ['№', 'Клиент', 'Тип', ...list_codes.map((c: string) => lnMap[c] || c), 'Итог', 'Дата проверки']
    const rows = clients.map((r: any, i: number) => {
      const row: any = { '№': i + 1, 'Клиент': r.name, 'Тип': r.client_type === 'individual' ? 'ФЛ' : 'ЮЛ' }
      list_codes.forEach((c: string) => {
        const info = r.per_list[c]
        row[lnMap[c] || c] = info ? `${info.score}% (${TIER_CONFIG[info.tier as keyof typeof TIER_CONFIG]?.label || info.tier})` : '—'
      })
      row['Итог'] = RESULT_CONFIG[r.result as keyof typeof RESULT_CONFIG]?.label || r.result
      row['Дата проверки'] = r.checked_at ? format(new Date(r.checked_at), 'dd.MM.yyyy HH:mm') : '—'
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
    ws['!cols'] = headers.map((h: string) => ({ wch: Math.max(h.length + 2, 14) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Санкционный скрининг')
    XLSX.writeFile(wb, `sanctions_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const handleSingleCheck = async () => {
    if (!singleName.trim()) return
    setSingleSearching(true)
    setSingleResult(null)
    try {
      const { data } = await api.post('/sanctions/screen', { name: singleName.trim(), date_of_birth: singleDob || undefined })
      setSingleResult(data)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка')
    } finally { setSingleSearching(false) }
  }

  const nextRunLabel = () => {
    if (!schedule.enabled) return null
    const wd = WEEKDAYS[schedule.weekday]
    const hh = String(schedule.hour).padStart(2, '0')
    const mm = String(schedule.minute).padStart(2, '0')
    return `${wd} в ${hh}:${mm}`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-[#d4a843] flex-shrink-0" />
            <div>
              <h1 className="page-title">Санкционный скрининг</h1>
              <p className="page-subtitle">
                {totalEntries > 0
                  ? `${totalEntries.toLocaleString()} записей · ${stats?.total_checks || 0} проверок`
                  : 'Загрузите санкционные списки'}
                {schedule.enabled && nextRunLabel() && (
                  <span className="ml-2 text-[#d4a843]">· Авто: {nextRunLabel()}</span>
                )}
              </p>
            </div>
          </div>
          <div className="tabs">
            {['screening', 'lists'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={clsx('tab', activeTab === t && 'tab-active')}>
                {t === 'screening' ? 'Скрининг' : 'Списки'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-5">

      {activeTab === 'lists' && <ListsManager lists={lists} onRefresh={loadLists} />}

      {activeTab === 'screening' && (
        <div className="space-y-5">
          {/* ── Top row: params (left 2/3) + controls (right 1/3) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Single check form */}
            <div className="lg:col-span-2">
              <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Параметры проверки</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Имя / Наименование *</label>
                    <input
                      value={singleName} onChange={e => setSingleName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSingleCheck()}
                      placeholder="Иванов Иван Иванович или Ivan Ivanov"
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Дата рождения (необязательно)</label>
                    <input type="date" value={singleDob} onChange={e => setSingleDob(e.target.value)}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d4a843]/50"
                    />
                  </div>
                </div>
                <div className="bg-[#0d1017] rounded-lg p-3 space-y-1.5">
                  <p className="text-xs text-[#4b5563] uppercase tracking-wider font-semibold mb-2">Уровни совпадений</p>
                  {[
                    { tier: 'confirmed', range: '≥ 92%', desc: 'Блокировка / немедленный эскалейт' },
                    { tier: 'probable', range: '78–91%', desc: 'Требует проверки офицером' },
                    { tier: 'possible', range: '60–77%', desc: 'Обратить внимание' },
                  ].map(({ tier, range, desc }) => {
                    const t = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
                    return (
                      <div key={tier} className="flex items-center gap-2">
                        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', t.dot)} />
                        <span className={clsx('text-xs font-medium w-16',
                          t.badge.includes('red') ? 'text-red-400' : t.badge.includes('orange') ? 'text-orange-400' : 'text-yellow-400'
                        )}>{range}</span>
                        <span className="text-xs text-[#6b7280]">{desc}</span>
                      </div>
                    )
                  })}
                </div>
                <button onClick={handleSingleCheck}
                  disabled={singleSearching || !singleName.trim() || totalEntries === 0}
                  className="btn-primary disabled:opacity-50">
                  <Search className="w-4 h-4" />
                  {singleSearching ? 'Проверка...' : 'Проверить'}
                </button>
                {totalEntries === 0 && (
                  <p className="text-xs text-yellow-400">Нет загруженных списков — перейдите во вкладку «Списки».</p>
                )}

                {/* Inline single check result */}
                {singleResult && (() => {
                  const rc = RESULT_CONFIG[singleResult.result as keyof typeof RESULT_CONFIG]
                  return (
                    <div className="space-y-2 pt-1">
                      <div className={clsx('border rounded-xl p-3 flex items-center gap-2', rc?.bg)}>
                        {rc && <rc.icon className={clsx('w-4 h-4 flex-shrink-0', rc.color)} />}
                        <div>
                          <p className={clsx('font-semibold text-sm', rc?.color)}>{rc?.label}</p>
                          <p className="text-xs text-[#6b7280] mt-0.5">
                            Проверено по: {singleResult.lists_checked?.map((c: string) => LIST_NAMES[c] || c).join(', ')}
                          </p>
                        </div>
                      </div>
                      {singleResult.matches?.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {singleResult.matches.slice(0, 4).map((m: any, i: number) => {
                            const t = TIER_CONFIG[m.match_tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.possible
                            return (
                              <div key={i} className={clsx('border rounded-lg p-3 text-xs space-y-1', t.card)}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-white font-medium truncate">{m.primary_name}</span>
                                  <span className={clsx('px-1.5 py-0.5 rounded border font-bold flex-shrink-0', t.badge)}>{m.score}%</span>
                                </div>
                                <p className="text-[#6b7280]">{LIST_NAMES[m.list_code] || m.list_code}</p>
                                {m.date_of_birth && (
                                  <p className="text-[#6b7280]">ДР: <span className={m.dob_match ? 'text-red-400 font-semibold' : 'text-[#9ca3af]'}>{m.date_of_birth}{m.dob_match && ' ✓'}</span></p>
                                )}
                                {m.nationality && <p className="text-[#6b7280]">Гражданство: <span className="text-[#9ca3af]">{m.nationality}</span></p>}
                                {m.aliases?.length > 0 && <p className="text-[#6b7280] truncate">Псевд.: <span className="text-[#9ca3af]">{m.aliases.slice(0, 2).join(', ')}</span></p>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Right control panel (1/3) */}
            <div className="space-y-4">
            {/* Run controls */}
            <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users2 className="w-4 h-4 text-[#d4a843]" />
                  <span className="text-sm font-semibold text-white">Пересмотр</span>
                </div>
                {results && results.clients.length > 0 && (
                  <button onClick={exportToExcel}
                    className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-white border border-[#1e2535] px-2.5 py-1.5 rounded-lg transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Excel
                  </button>
                )}
              </div>

              {schedule.lastRunAt && (
                <p className="text-xs text-[#4b5563]">
                  Последний: {format(new Date(schedule.lastRunAt), 'dd.MM.yyyy HH:mm')}
                </p>
              )}
              {schedule.enabled && nextRunLabel() && (
                <p className="text-xs text-[#d4a843]">Следующий: {nextRunLabel()}</p>
              )}

              <button onClick={() => runRescreening(false)} disabled={running}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] hover:bg-[#d4a843]/20 text-sm font-medium transition-colors disabled:opacity-50">
                <Play className={clsx('w-4 h-4', running && 'animate-pulse')} />
                {running ? 'Проверка...' : 'Запустить пересмотр'}
              </button>
            </div>

            {/* Schedule */}
            <div className="bg-[#111520] border border-[#1e2535] rounded-xl overflow-hidden">
              <button
                onClick={() => setShowSchedule(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a2030] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#6b7280]" />
                  <span className="text-sm font-semibold text-white">Расписание</span>
                  {schedule.enabled && (
                    <span className="text-xs bg-green-400/10 text-green-400 px-1.5 py-0.5 rounded">Вкл</span>
                  )}
                </div>
                {showSchedule ? <ChevronUp className="w-4 h-4 text-[#4b5563]" /> : <ChevronDown className="w-4 h-4 text-[#4b5563]" />}
              </button>

              {showSchedule && (
                <div className="px-4 pb-4 space-y-3 border-t border-[#1e2535]">
                  <p className="text-xs text-[#6b7280] pt-3">
                    Автоматический пересмотр при открытии системы в указанное время
                  </p>

                  {/* Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={schedule.enabled}
                        onChange={e => saveSchedule({ ...schedule, enabled: e.target.checked })} />
                      <div className={clsx('w-9 h-5 rounded-full transition-colors', schedule.enabled ? 'bg-[#d4a843]' : 'bg-[#1e2535]')} />
                      <div className={clsx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', schedule.enabled && 'translate-x-4')} />
                    </div>
                    <span className="text-sm text-[#9ca3af]">{schedule.enabled ? 'Включено' : 'Выключено'}</span>
                  </label>

                  {/* Day of week */}
                  <div>
                    <p className="text-xs text-[#6b7280] mb-2">День недели</p>
                    <div className="flex gap-1 flex-wrap">
                      {WEEKDAYS.map((d, i) => (
                        <button key={i} onClick={() => saveSchedule({ ...schedule, weekday: i })}
                          className={clsx(
                            'w-8 h-8 text-xs rounded font-medium transition-colors',
                            schedule.weekday === i
                              ? 'bg-[#d4a843] text-[#0a0d14]'
                              : 'bg-[#0d1017] text-[#6b7280] hover:text-white border border-[#1e2535]'
                          )}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time */}
                  <div>
                    <p className="text-xs text-[#6b7280] mb-2">Время</p>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={23} value={schedule.hour}
                        onChange={e => saveSchedule({ ...schedule, hour: Number(e.target.value) })}
                        className="w-16 bg-[#0d1017] border border-[#1e2535] rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-[#d4a843]/50" />
                      <span className="text-[#6b7280]">:</span>
                      <input type="number" min={0} max={59} step={5} value={schedule.minute}
                        onChange={e => saveSchedule({ ...schedule, minute: Number(e.target.value) })}
                        className="w-16 bg-[#0d1017] border border-[#1e2535] rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-[#d4a843]/50" />
                    </div>
                  </div>

                  <p className="text-xs text-[#374151]">
                    * Запускается автоматически при открытии системы, если прошло более 6 дней с последнего пересмотра
                  </p>
                </div>
              )}
            </div>

            {/* Счётчики последнего пересмотра */}
            {(() => {
              const all = results?.clients || []
              const hasData = all.length > 0
              const nMatch = all.filter((r: any) => r.result === 'match').length
              const nPoss = all.filter((r: any) => r.result === 'possible_match').length
              const nClear = all.filter((r: any) => r.result === 'clear').length
              return (
                <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-4 space-y-3">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wider font-semibold">Счётчик проверок</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Всего', value: hasData ? all.length : '—', cls: 'text-white', bg: 'bg-[#0d1017]' },
                      { label: 'Чисто', value: hasData ? nClear : '—', cls: 'text-green-400', bg: 'bg-green-500/5' },
                      { label: 'Возможных', value: hasData ? nPoss : '—', cls: 'text-yellow-400', bg: 'bg-yellow-500/5' },
                      { label: 'Совпадений', value: hasData ? nMatch : '—', cls: 'text-red-400', bg: hasData && nMatch > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-[#0d1017]' },
                    ].map(item => (
                      <div key={item.label} className={clsx('rounded-lg p-2.5 text-center', item.bg)}>
                        <p className={clsx('text-xl font-bold', item.cls)}>{item.value}</p>
                        <p className="text-xs text-[#6b7280] mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  {schedule.lastRunAt ? (
                    <p className="text-xs text-[#4b5563] text-center">
                      Дата: {format(new Date(schedule.lastRunAt), 'dd.MM.yyyy HH:mm')}
                    </p>
                  ) : (
                    <p className="text-xs text-[#374151] text-center">Пересмотр ещё не запускался</p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Run result stats (full width, shown after rescreening) ── */}
        {runResult && !runResult.error && (
          <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-4">
            <div className="flex flex-wrap gap-6 items-center">
              <p className="text-xs text-[#6b7280] font-semibold uppercase tracking-wider">Результат пересмотра</p>
              {[
                { label: 'Всего', value: runResult.total, cls: 'text-white' },
                { label: 'Чисто', value: runResult.clear, cls: 'text-green-400' },
                { label: 'Возможных', value: (runResult.possible || 0) + (runResult.probable || 0), cls: 'text-yellow-400' },
                { label: 'Совпадений', value: runResult.confirmed, cls: 'text-red-400' },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className={clsx('text-2xl font-bold', item.cls)}>{item.value}</p>
                  <p className="text-xs text-[#6b7280]">{item.label}</p>
                </div>
              ))}
              {runResult.new_hits > 0 && (
                <div className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <p className="text-red-400 text-sm font-semibold">{runResult.new_hits} новых совпадений</p>
                </div>
              )}
            </div>
          </div>
        )}
        {runResult?.error && (
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{runResult.error}</div>
        )}

        {/* ── Full-width results table ── */}
        <ResultsTable results={results} loading={loadingResults} onDecisionSaved={loadResults} />
      </div>
      )}
      </div>
    </div>
  )
}
