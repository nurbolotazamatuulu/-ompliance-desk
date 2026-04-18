import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen, Plus, X, ExternalLink, Tag, Search,
  ChevronDown, ChevronUp, Globe, Building2, Edit3, Trash2
} from 'lucide-react'
import api from '../api/client'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegDoc {
  id: number
  category: string
  title: string
  short_title?: string
  number?: string
  issued_by?: string
  issued_at?: string
  effective_from?: string
  effective_to?: string
  status: string
  description?: string
  external_url?: string
  notes?: string
  tags: string[]
  is_global: boolean
  company_id?: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONF: Record<string, { label: string; color: string; border: string }> = {
  law:         { label: 'Закон',                color: 'bg-purple-400/20 text-purple-400',   border: 'border-purple-400/30' },
  decree:      { label: 'Постановление',        color: 'bg-blue-400/20 text-blue-400',       border: 'border-blue-400/30' },
  order:       { label: 'Приказ',               color: 'bg-yellow-400/20 text-yellow-400',   border: 'border-yellow-400/30' },
  instruction: { label: 'Инструкция/Положение', color: 'bg-orange-400/20 text-orange-400',   border: 'border-orange-400/30' },
  guideline:   { label: 'Рекомендации FATF',    color: 'bg-green-400/20 text-green-400',     border: 'border-green-400/30' },
  internal:    { label: 'Внутренний документ',  color: 'bg-[#374151] text-[#9ca3af]',        border: 'border-[#374151]' },
}

const STATUS_CONF: Record<string, { label: string; color: string }> = {
  active:     { label: 'Действует',       color: 'bg-green-400/20 text-green-400' },
  draft:      { label: 'Проект',          color: 'bg-blue-400/20 text-blue-400' },
  superseded: { label: 'Утратил силу',    color: 'bg-[#374151] text-[#6b7280]' },
  archived:   { label: 'Архив',           color: 'bg-[#1e2535] text-[#4b5563]' },
}

const CATEGORIES = [
  { key: '', label: 'Все' },
  { key: 'law', label: 'Законы' },
  { key: 'decree', label: 'Постановления' },
  { key: 'order', label: 'Приказы' },
  { key: 'instruction', label: 'Инструкции' },
  { key: 'guideline', label: 'Рекомендации' },
  { key: 'internal', label: 'Внутренние' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Regulations() {
  const [docs, setDocs] = useState<RegDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editDoc, setEditDoc] = useState<RegDoc | null>(null)
  const [editNotes, setEditNotes] = useState<{ id: number; notes: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (category) params.category = category
      if (search) params.search = search
      const res = await api.get('/regulations', { params })
      setDocs(res.data)
    } finally { setLoading(false) }
  }, [category, search])

  useEffect(() => { load() }, [load])

  const saveNotes = async (id: number, notes: string) => {
    await api.put(`/regulations/${id}`, { notes })
    setEditNotes(null)
    load()
  }

  const deleteDoc = async (id: number) => {
    if (!confirm('Удалить документ?')) return
    await api.delete(`/regulations/${id}`)
    load()
  }

  // Group by category for display
  const grouped = CATEGORIES.slice(1).reduce<Record<string, RegDoc[]>>((acc, c) => {
    const items = docs.filter(d => d.category === c.key)
    if (items.length > 0) acc[c.key] = items
    return acc
  }, {})
  const hasGroups = category === '' && search === ''

  const stats = {
    total: docs.length,
    active: docs.filter(d => d.status === 'active').length,
    global: docs.filter(d => d.is_global).length,
    internal: docs.filter(d => !d.is_global).length,
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[#d4a843]" />
          <div>
            <h1 className="text-xl font-bold text-white">Нормативная база</h1>
            <p className="text-xs text-[#6b7280]">НПА, международные стандарты и внутренние документы</p>
          </div>
        </div>
        <button
          onClick={() => { setEditDoc(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить документ
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Всего документов',   value: stats.total,    color: 'text-white',        border: 'border-[#1e2535]' },
          { label: 'Действующих',        value: stats.active,   color: 'text-green-400',    border: 'border-green-400/20' },
          { label: 'НПА (глобальные)',   value: stats.global,   color: 'text-[#d4a843]',    border: 'border-[#d4a843]/20' },
          { label: 'Внутренние',         value: stats.internal, color: 'text-blue-400',     border: 'border-blue-400/20' },
        ].map(s => (
          <div key={s.label} className={clsx('bg-[#0d1017] border rounded-xl p-4', s.border)}>
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-[#111520] border border-[#1e2535] rounded-lg p-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={clsx(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                category === c.key ? 'bg-[#d4a843] text-[#0a0d14]' : 'text-[#6b7280] hover:text-white'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#374151]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, номеру, тегу..."
            className="w-full bg-[#111520] border border-[#1e2535] rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
          />
        </div>
      </div>

      <p className="text-xs text-[#4b5563]">{loading ? 'Загрузка...' : `${docs.length} документов`}</p>

      {/* Document list */}
      {!loading && (
        <div className="space-y-6">
          {hasGroups ? (
            Object.entries(grouped).map(([cat, items]) => {
              const conf = CATEGORY_CONF[cat] ?? CATEGORY_CONF.internal
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={clsx('text-[10px] font-semibold px-2 py-1 rounded-full', conf.color)}>
                      {conf.label}
                    </span>
                    <span className="text-[10px] text-[#4b5563]">{items.length} документов</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(doc => (
                      <DocCard
                        key={doc.id}
                        doc={doc}
                        expanded={expandedId === doc.id}
                        onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                        onEditNotes={() => setEditNotes({ id: doc.id, notes: doc.notes || '' })}
                        onDelete={() => deleteDoc(doc.id)}
                        editNotes={editNotes?.id === doc.id ? editNotes : null}
                        onSaveNotes={saveNotes}
                        onCancelNotes={() => setEditNotes(null)}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="space-y-2">
              {docs.length === 0 ? (
                <div className="text-center py-16 text-[#4b5563]">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Документов не найдено</p>
                </div>
              ) : docs.map(doc => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  expanded={expandedId === doc.id}
                  onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                  onEditNotes={() => setEditNotes({ id: doc.id, notes: doc.notes || '' })}
                  onDelete={() => deleteDoc(doc.id)}
                  editNotes={editNotes?.id === doc.id ? editNotes : null}
                  onSaveNotes={saveNotes}
                  onCancelNotes={() => setEditNotes(null)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <DocFormModal
          doc={editDoc}
          onClose={() => { setShowForm(false); setEditDoc(null) }}
          onSaved={() => { setShowForm(false); setEditDoc(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Document Card ────────────────────────────────────────────────────────────

function DocCard({ doc, expanded, onToggle, onEditNotes, onDelete, editNotes, onSaveNotes, onCancelNotes }: {
  doc: RegDoc
  expanded: boolean
  onToggle: () => void
  onEditNotes: () => void
  onDelete: () => void
  editNotes: { id: number; notes: string } | null
  onSaveNotes: (id: number, notes: string) => void
  onCancelNotes: () => void
}) {
  const catConf = CATEGORY_CONF[doc.category] ?? CATEGORY_CONF.internal
  const statusConf = STATUS_CONF[doc.status] ?? STATUS_CONF.active
  const [localNotes, setLocalNotes] = useState(editNotes?.notes || '')

  useEffect(() => {
    if (editNotes) setLocalNotes(editNotes.notes)
  }, [editNotes])

  return (
    <div className={clsx(
      'bg-[#0d1017] border rounded-xl overflow-hidden transition-colors',
      expanded ? 'border-[#d4a843]/30' : 'border-[#1e2535] hover:border-[#2d3748]'
    )}>
      {/* Card header — always visible */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={onToggle}
      >
        {/* Left: source icon */}
        <div className="mt-0.5 shrink-0">
          {doc.is_global
            ? <Globe className="w-4 h-4 text-[#d4a843]" />
            : <Building2 className="w-4 h-4 text-blue-400" />
          }
        </div>

        {/* Center: title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', catConf.color)}>
              {catConf.label}
            </span>
            <span className={clsx('text-[10px] px-2 py-0.5 rounded-full shrink-0', statusConf.color)}>
              {statusConf.label}
            </span>
            {doc.number && (
              <span className="text-[10px] font-mono text-[#6b7280]">{doc.number}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-white mt-1.5 leading-snug">
            {doc.short_title || doc.title}
          </p>
          {doc.short_title && (
            <p className="text-[11px] text-[#6b7280] mt-0.5 line-clamp-1">{doc.title}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {doc.issued_by && (
              <span className="text-[10px] text-[#4b5563]">{doc.issued_by}</span>
            )}
            {doc.issued_at && (
              <span className="text-[10px] text-[#4b5563]">
                {new Date(doc.issued_at).getFullYear()}
              </span>
            )}
            {doc.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {doc.tags.slice(0, 4).map(t => (
                  <span key={t} className="text-[9px] bg-[#1e2535] text-[#6b7280] px-1.5 py-0.5 rounded">
                    {t}
                  </span>
                ))}
                {doc.tags.length > 4 && (
                  <span className="text-[9px] text-[#4b5563]">+{doc.tags.length - 4}</span>
                )}
              </div>
            )}
            {doc.notes && (
              <span className="text-[10px] bg-[#d4a843]/10 text-[#d4a843] px-1.5 py-0.5 rounded">
                Аннотация
              </span>
            )}
          </div>
        </div>

        {/* Right: actions + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {doc.external_url && (
            <a
              href={doc.external_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[#4b5563] hover:text-[#d4a843] transition-colors"
              title="Открыть источник"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4 text-[#4b5563]" />
            : <ChevronDown className="w-4 h-4 text-[#4b5563]" />
          }
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#1e2535] px-4 py-4 space-y-4">
          {/* Description */}
          {doc.description && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1.5">Краткое содержание</p>
              <p className="text-sm text-[#9ca3af] leading-relaxed">{doc.description}</p>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4 text-xs">
            {doc.issued_at && (
              <div>
                <p className="text-[10px] text-[#4b5563]">Дата издания</p>
                <p className="text-white mt-0.5">{new Date(doc.issued_at).toLocaleDateString('ru-RU')}</p>
              </div>
            )}
            {doc.effective_from && (
              <div>
                <p className="text-[10px] text-[#4b5563]">Вступил в силу</p>
                <p className="text-white mt-0.5">{new Date(doc.effective_from).toLocaleDateString('ru-RU')}</p>
              </div>
            )}
            {doc.effective_to && (
              <div>
                <p className="text-[10px] text-[#4b5563]">Утратил силу</p>
                <p className="text-red-400 mt-0.5">{new Date(doc.effective_to).toLocaleDateString('ru-RU')}</p>
              </div>
            )}
          </div>

          {/* Tags full */}
          {doc.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-3 h-3 text-[#4b5563]" />
              {doc.tags.map(t => (
                <span key={t} className="text-[10px] bg-[#1e2535] text-[#9ca3af] px-2 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Notes section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-[#4b5563]">Аннотация офицера</p>
              {!editNotes && (
                <button
                  onClick={onEditNotes}
                  className="flex items-center gap-1 text-[10px] text-[#4b5563] hover:text-[#d4a843] transition-colors"
                >
                  <Edit3 className="w-3 h-3" />
                  Редактировать
                </button>
              )}
            </div>
            {editNotes ? (
              <div className="space-y-2">
                <textarea
                  value={localNotes}
                  onChange={e => setLocalNotes(e.target.value)}
                  rows={4}
                  placeholder="Ваши аннотации, важные выдержки, ссылки на пункты..."
                  className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onSaveNotes(doc.id, localNotes)}
                    className="px-3 py-1.5 bg-[#d4a843]/20 text-[#d4a843] rounded-md text-xs hover:bg-[#d4a843]/30"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={onCancelNotes}
                    className="px-3 py-1.5 border border-[#1e2535] text-[#6b7280] rounded-md text-xs hover:text-white"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : doc.notes ? (
              <p className="text-sm text-[#9ca3af] whitespace-pre-wrap bg-[#d4a843]/5 border border-[#d4a843]/10 rounded-lg px-3 py-2">
                {doc.notes}
              </p>
            ) : (
              <p className="text-xs text-[#374151] italic">Нет аннотаций</p>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-1">
            {doc.external_url ? (
              <a
                href={doc.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#d4a843] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Открыть официальный источник
              </a>
            ) : <div />}
            {!doc.is_global && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1 text-xs text-[#4b5563] hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Удалить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add Document Modal ───────────────────────────────────────────────────────

function DocFormModal({ doc, onClose, onSaved }: {
  doc: RegDoc | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    category: doc?.category || 'internal',
    title: doc?.title || '',
    short_title: doc?.short_title || '',
    number: doc?.number || '',
    issued_by: doc?.issued_by || '',
    issued_at: doc?.issued_at ? doc.issued_at.slice(0, 10) : '',
    effective_from: doc?.effective_from ? doc.effective_from.slice(0, 10) : '',
    effective_to: doc?.effective_to ? doc.effective_to.slice(0, 10) : '',
    status: doc?.status || 'active',
    description: doc?.description || '',
    external_url: doc?.external_url || '',
    notes: doc?.notes || '',
    tags: doc?.tags.join(', ') || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        issued_at: form.issued_at ? new Date(form.issued_at).toISOString() : null,
        effective_from: form.effective_from ? new Date(form.effective_from).toISOString() : null,
        effective_to: form.effective_to ? new Date(form.effective_to).toISOString() : null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        short_title: form.short_title || null,
        number: form.number || null,
        issued_by: form.issued_by || null,
        description: form.description || null,
        external_url: form.external_url || null,
        notes: form.notes || null,
      }
      if (doc) await api.put(`/regulations/${doc.id}`, payload)
      else await api.post('/regulations', payload)
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ошибка сохранения')
    } finally { setSaving(false) }
  }

  const Field = ({ label, k, type = 'text', placeholder = '' }: { label: string; k: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">{label}</label>
      <input type={type} value={(form as any)[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
        className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[#1e2535]">
          <h2 className="text-white font-semibold">{doc ? 'Редактировать документ' : 'Новый документ'}</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Категория</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50">
                {CATEGORIES.slice(1).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Статус</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50">
                {Object.entries(STATUS_CONF).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Полное название *</label>
            <textarea value={form.title} onChange={e => set('title', e.target.value)} required rows={2}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Сокращённое название" k="short_title" />
            <Field label="Номер документа" k="number" placeholder="№ 606" />
          </div>

          <Field label="Орган / организация" k="issued_by" placeholder="Правительство КР" />

          <div className="grid grid-cols-3 gap-3">
            <Field label="Дата издания" k="issued_at" type="date" />
            <Field label="Вступил в силу" k="effective_from" type="date" />
            <Field label="Утратил силу" k="effective_to" type="date" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Краткое содержание</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 resize-none" />
          </div>

          <Field label="Ссылка на источник" k="external_url" placeholder="https://..." />

          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Теги (через запятую)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)}
              placeholder="ПОД/ФТ, KYC, UBO, FATF"
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Аннотация</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
              placeholder="Важные выдержки, ссылки на пункты..."
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 resize-none" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-[#1e2535] text-[#6b7280] rounded-lg text-sm hover:text-white">
              Отмена
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838] disabled:opacity-50">
              {saving ? 'Сохранение...' : doc ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
