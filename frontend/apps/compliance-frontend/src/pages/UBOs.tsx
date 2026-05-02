import { useState, useEffect, useRef } from 'react'
import { Building2, Plus, Trash2, Edit2, X, ChevronRight, Eye, User, Percent,
  Calendar, Globe, FileText, Link2, Search, SlidersHorizontal, Phone, Mail,
  MapPin, Shield, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Link } from 'react-router-dom'
import api from '../api/client'
import clsx from 'clsx'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from '../components/Toast'
import { useSortable } from '../hooks/useSortable'
import SortTh from '../components/SortTh'
import { fmtDate, toDateInput } from '../utils/dates'

// ─── Критерии признания БВ (PDF «Критерии для признания физического лица...») ──

export const UBO_CRITERIA = [
  { code: 1,  group: 'Контроль через владение долей/акций',
    label: 'Прямое или косвенное владение долей/акциями: ≥25% уставного капитала (ООО) или ≥5% акций с правом голоса (АО)', needsDetails: true, detailsHint: 'Если косвенное — укажите взаимосвязь. Для ООО порог 25%, для АО — 5%' },
  { code: 2,  group: 'Контроль с помощью других средств',
    label: 'Влияние на операции/сделки с денежными средствами на основании договора с клиентом', needsDetails: true, detailsHint: 'Номер и дата договора, срок, предмет, существенные условия' },
  { code: 3,  group: 'Контроль с помощью других средств',
    label: 'Контроль большинства прав голоса в юридическом лице', needsDetails: true, detailsHint: 'Каким образом и через каких лиц' },
  { code: 4,  group: 'Контроль с помощью других средств',
    label: 'Право назначать или освобождать более половины членов правления', needsDetails: true, detailsHint: 'Каким образом, через каких лиц и какие инструменты' },
  { code: 5,  group: 'Контроль с помощью других средств',
    label: 'Права вето или принятия решений, связанные с долей собственности', needsDetails: true, detailsHint: 'Каким образом, через каких лиц и какие инструменты' },
  { code: 6,  group: 'Контроль с помощью других средств',
    label: 'Принятие решений о распределении прибыли или перемещении активов', needsDetails: true, detailsHint: 'Каким образом, через каких лиц и какие инструменты' },
  { code: 7,  group: 'Контроль с помощью других средств',
    label: 'Контроль через соглашения с владельцами (устав, партнёрские соглашения, синдикация и т.п.)', needsDetails: true, detailsHint: 'Через какие договора, с какими лицами, на каких условиях' },
  { code: 8,  group: 'Контроль с помощью других средств',
    label: 'Контроль посредством родственных или семейных отношений', needsDetails: true, detailsHint: 'Через каких родственных лиц и на каких условиях' },
  { code: 9,  group: 'Контроль с помощью других средств',
    label: 'Контроль путём использования формальных или неформальных договорённостей', needsDetails: true, detailsHint: 'Через каких лиц и на каких условиях' },
  { code: 10, group: 'Бенефициары траста',
    label: 'Контроль над юридическим образованием (трастом), включая непосредственный контроль', needsDetails: false },
  { code: 11, group: 'Бенефициары траста',
    label: 'Роль доверителя (лицо, передавшее имущество в траст)', needsDetails: false },
  { code: 12, group: 'Бенефициары траста',
    label: 'Роль доверительного собственника (управляющего) траста', needsDetails: false },
  { code: 13, group: 'Бенефициары траста',
    label: 'Роль попечителя траста или другого юридического образования', needsDetails: false },
  { code: 14, group: 'Бенефициары траста',
    label: 'Роль бенефициара траста или другого юридического образования', needsDetails: false },
  { code: 15, group: 'Иные способы',
    label: 'Контроль иным способом', needsDetails: true, detailsHint: 'Укажите причину и разъяснение клиента' },
  { code: 16, group: 'Контроль через занимаемую позицию',
    label: 'Управление юридическим лицом за счёт позиции в его структуре (стратегические/финансовые решения)', needsDetails: false },
  { code: 17, group: 'Контроль через занимаемую позицию',
    label: 'Иные факторы', needsDetails: true, detailsHint: 'Укажите какие' },
]

function CriteriaCheckboxes({ value, onChange }: {
  value: { code: number; selected: boolean; details: string }[]
  onChange: (v: { code: number; selected: boolean; details: string }[]) => void
}) {
  const getEntry = (code: number) =>
    value.find(e => e.code === code) ?? { code, selected: false, details: '' }

  const toggle = (code: number, checked: boolean) => {
    const exists = value.find(e => e.code === code)
    if (exists) {
      onChange(value.map(e => e.code === code ? { ...e, selected: checked } : e))
    } else {
      onChange([...value, { code, selected: checked, details: '' }])
    }
  }

  const setDetails = (code: number, details: string) => {
    const exists = value.find(e => e.code === code)
    if (exists) {
      onChange(value.map(e => e.code === code ? { ...e, details } : e))
    } else {
      onChange([...value, { code, selected: true, details }])
    }
  }

  let lastGroup = ''
  return (
    <div className="space-y-1">
      {UBO_CRITERIA.map(c => {
        const entry = getEntry(c.code)
        const showGroup = c.group !== lastGroup
        lastGroup = c.group
        return (
          <div key={c.code}>
            {showGroup && (
              <p className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider mt-3 mb-1.5 first:mt-0">{c.group}</p>
            )}
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={entry.selected}
                onChange={e => toggle(c.code, e.target.checked)}
                className="accent-[#d4a843] w-4 h-4 mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-[#d1d5db] group-hover:text-white transition-colors leading-snug">
                <span className="text-[#6b7280] mr-1">{c.code}.</span>{c.label}
              </span>
            </label>
            {entry.selected && c.needsDetails && (
              <div className="ml-6 mt-1.5">
                <textarea
                  value={entry.details}
                  onChange={e => setDetails(c.code, e.target.value)}
                  placeholder={c.detailsHint}
                  rows={2}
                  className="w-full bg-[#0d1017] border border-[#d4a843]/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/60 placeholder-[#374151] resize-none"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export interface UBO {
  id: number
  client_id: number
  client_name: string
  last_name: string
  first_name: string
  middle_name?: string
  date_of_birth?: string
  place_of_birth?: string
  nationality?: string
  country_of_residence?: string
  pin?: string
  doc_type?: string
  doc_series_number?: string
  doc_issued_by?: string
  doc_issued_at?: string
  doc_expires_at?: string
  registration_address?: string
  actual_address?: string
  phone?: string
  email?: string
  ownership_percentage?: number
  control_type?: string
  recognition_basis?: string
  ownership_chain?: string
  is_ultimate: boolean
  is_pep?: boolean
  source_of_funds?: string
  relationship_purpose?: string
  pdl_position?: string
  pdl_appointment_date?: string
  pdl_release_date?: string
  pdl_source_of_funds?: string
  pdl_approval_notes?: string
  pdl_family_members?: any[]
  pdl_close_associates?: any[]
  recognition_criteria?: { code: number; selected: boolean; details: string }[]
  influence_type?: string
  residency_status?: string
  notes?: string
  created_at: string
}

interface Client {
  id: number
  display_name: string
}

export const EMPTY_FORM = {
  client_id: '',
  last_name: '',
  first_name: '',
  middle_name: '',
  date_of_birth: '',
  place_of_birth: '',
  nationality: '',
  country_of_residence: '',
  pin: '',
  doc_type: '',
  doc_series_number: '',
  doc_issued_by: '',
  doc_issued_at: '',
  doc_expires_at: '',
  registration_address: '',
  actual_address: '',
  phone: '',
  email: '',
  ownership_percentage: '',
  control_type: '',
  recognition_basis: '',
  recognition_criteria: [] as { code: number; selected: boolean; details: string }[],
  ownership_chain: '',
  is_ultimate: true,
  is_pep: false,
  source_of_funds: '',
  relationship_purpose: '',
  pdl_position: '',
  pdl_appointment_date: '',
  pdl_release_date: '',
  pdl_source_of_funds: '',
  pdl_approval_notes: '',
  pdl_family_members: [] as any[],
  pdl_close_associates: [] as any[],
  influence_type: '',
  residency_status: '',
  notes: '',
}

export const DOC_TYPES = [
  { value: '', label: '— выбрать —' },
  { value: 'passport', label: 'Паспорт' },
  { value: 'id_card', label: 'Удостоверение личности' },
  { value: 'foreign_passport', label: 'Загранпаспорт' },
  { value: 'residence_permit', label: 'Вид на жительство' },
  { value: 'other', label: 'Иной документ' },
]

export const CONTROL_TYPES = [
  { value: '', label: '— выбрать —' },
  { value: 'direct', label: 'Прямой контроль' },
  { value: 'indirect', label: 'Косвенный контроль' },
  { value: 'mixed', label: 'Смешанный' },
]

// ─── Вспомогательные компоненты формы ────────────────────────────────────────

export function FLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-[#6b7280] mb-1">{children}</label>
}

export function FInput({ value, onChange, type = 'text', placeholder, min, max }: any) {
  return (
    <input
      type={type}
      value={value ?? ''}
      min={min}
      max={max}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
    />
  )
}

export function FSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function FTextarea({ value, onChange, placeholder, rows = 2 }: any) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
    />
  )
}

export function FSep({ title }: { title: string }) {
  return (
    <div className="col-span-2 flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider">{title}</span>
      <div className="flex-1 border-t border-[#1e2535]" />
    </div>
  )
}

// ─── Детальный просмотр УБО ───────────────────────────────────────────────────

export function UBODetailModal({ ubo, onClose, onEdit }: { ubo: UBO; onClose: () => void; onEdit: () => void }) {
  const fullName = [ubo.last_name, ubo.first_name, ubo.middle_name].filter(Boolean).join(' ')

  function Row({ icon: Icon, label, value }: { icon?: any; label: string; value?: string | null }) {
    if (!value) return null
    return (
      <div className="space-y-0.5">
        <p className="text-xs uppercase tracking-wider text-[#4b5563] flex items-center gap-1">
          {Icon && <Icon className="w-3 h-3" />}
          {label}
        </p>
        <p className="text-sm text-white">{value}</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Шапка */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#1e2535] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#d4a843]/10 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-[#d4a843]" />
            </div>
            <div>
              <p className="font-semibold text-white">{fullName}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                  ubo.is_ultimate ? 'bg-[#d4a843]/20 text-[#d4a843]' : 'bg-[#1e2535] text-[#6b7280]')}>
                  {ubo.is_ultimate ? 'Конечный УБО' : 'Промежуточный'}
                </span>
                {ubo.is_pep && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/20 text-red-400">ПДЛ</span>
                )}
                <Link to={`/clients/${ubo.client_id}`} onClick={onClose}
                  className="text-xs text-[#d4a843] hover:underline flex items-center gap-0.5">
                  {ubo.client_name}<ChevronRight className="w-2.5 h-2.5" />
                </Link>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Тело */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Личные данные */}
          <div>
            <p className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider mb-3">Личные данные</p>
            <div className="grid grid-cols-2 gap-3">
              <Row icon={Calendar} label="Дата рождения" value={fmtDate(ubo.date_of_birth)} />
              <Row label="Место рождения" value={ubo.place_of_birth} />
              <Row icon={Globe} label="Гражданство" value={ubo.nationality} />
              <Row label="Страна проживания" value={ubo.country_of_residence} />
              <Row label="ИНН / ПИН" value={ubo.pin} />
            </div>
          </div>

          {/* Документ */}
          {(ubo.doc_type || ubo.doc_series_number) && (
            <div>
              <p className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider mb-3">Документ</p>
              <div className="grid grid-cols-2 gap-3">
                <Row icon={FileText} label="Вид документа" value={DOC_TYPES.find(d => d.value === ubo.doc_type)?.label ?? ubo.doc_type} />
                <Row label="Серия / номер" value={ubo.doc_series_number} />
                <Row label="Кем выдан" value={ubo.doc_issued_by} />
                <Row label="Дата выдачи" value={fmtDate(ubo.doc_issued_at)} />
                <Row label="Срок действия" value={fmtDate(ubo.doc_expires_at)} />
              </div>
            </div>
          )}

          {/* Адреса и контакты */}
          {(ubo.registration_address || ubo.actual_address || ubo.phone || ubo.email) && (
            <div>
              <p className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider mb-3">Адрес и контакты</p>
              <div className="grid grid-cols-1 gap-2">
                <Row icon={MapPin} label="Адрес регистрации" value={ubo.registration_address} />
                <Row label="Фактический адрес" value={ubo.actual_address} />
                <div className="grid grid-cols-2 gap-3">
                  <Row icon={Phone} label="Телефон" value={ubo.phone} />
                  <Row icon={Mail} label="Email" value={ubo.email} />
                </div>
              </div>
            </div>
          )}

          {/* Владение */}
          <div>
            <p className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider mb-3">Владение и контроль</p>
            <div className="grid grid-cols-2 gap-3">
              {ubo.residency_status && <Row label="Статус резидентства" value={ubo.residency_status} />}
              {ubo.influence_type && (
                <div className="col-span-2 space-y-0.5">
                  <p className="text-xs uppercase tracking-wider text-[#4b5563]">Тип влияния БВ</p>
                  <p className="text-sm text-white capitalize">{ubo.influence_type}</p>
                </div>
              )}
              <Row icon={Percent} label="Доля владения" value={ubo.ownership_percentage != null ? `${ubo.ownership_percentage}%` : undefined} />
              <Row label="Характер контроля" value={CONTROL_TYPES.find(c => c.value === ubo.control_type)?.label ?? ubo.control_type} />
              {(ubo.recognition_criteria || []).filter(e => e.selected).length > 0 && (
                <div className="col-span-2 space-y-1">
                  <p className="text-xs uppercase tracking-wider text-[#4b5563]">Критерии признания БВ</p>
                  <div className="space-y-1.5">
                    {(ubo.recognition_criteria || []).filter(e => e.selected).map((e) => {
                      const c = UBO_CRITERIA.find(x => x.code === e.code)
                      return (
                        <div key={e.code}>
                          <p className="text-sm text-white"><span className="text-[#6b7280] mr-1">{e.code}.</span>{c?.label}</p>
                          {e.details && <p className="text-xs text-[#9ca3af] ml-4 mt-0.5">{e.details}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {ubo.recognition_basis && <div className="col-span-2"><Row label="Дополнительные примечания" value={ubo.recognition_basis} /></div>}
              {ubo.ownership_chain && <div className="col-span-2"><Row icon={Link2} label="Цепочка владения" value={ubo.ownership_chain} /></div>}
            </div>
          </div>

          {/* Комплаенс */}
          {(ubo.source_of_funds || ubo.relationship_purpose) && (
            <div>
              <p className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider mb-3">Комплаенс</p>
              <div className="grid grid-cols-1 gap-2">
                <Row label="Источник происхождения средств" value={ubo.source_of_funds} />
                <Row label="Цель деловых отношений" value={ubo.relationship_purpose} />
              </div>
            </div>
          )}

          {ubo.notes && <Row label="Примечания" value={ubo.notes} />}

          <div className="pt-1 border-t border-[#1e2535]">
            <p className="text-xs text-[#4b5563]">Добавлен {fmtDate(ubo.created_at)}</p>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-3 px-6 pb-5 flex-shrink-0">
          <button onClick={() => { onClose(); onEdit() }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#1e2535] text-[#9ca3af] hover:text-white hover:border-[#374151] text-sm font-medium transition-colors">
            <Edit2 className="w-4 h-4" />Редактировать
          </button>
          <button onClick={onClose}
            className="flex-1 bg-[#d4a843]/10 hover:bg-[#d4a843]/20 text-[#d4a843] border border-[#d4a843]/30 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Компоненты для ПДЛ — члены семьи / близкие лица ─────────────────────────

export const PDL_RELATION_TYPES = ['супруг (супруга)', 'дети (в т.ч. усыновлённые)']
export const PDL_ASSOCIATE_TYPES = ['близкие родственники', 'деловые партнёры (совместная собственность)', 'официальные представители']
export const EMPTY_PDL_PERSON = { last_name: '', first_name: '', middle_name: '', gender: '', date_of_birth: '', pin: '', citizenship: '' }
export const GENDER_OPTS = [{ value: '', label: '—' }, { value: 'male', label: 'Мужской' }, { value: 'female', label: 'Женский' }]

export function PDLPersonRow({ value, onChange, onRemove, relationField, relationOptions }: any) {
  const set = (k: string) => (e: any) => onChange({ ...value, [k]: e.target.value })
  const inp = 'w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50'
  return (
    <div className="border border-[#1e2535] rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-xs text-[#6b7280] mb-1">Степень {relationField === 'relation' ? 'родства' : 'связанности'}</label>
          <select value={value[relationField] || ''} onChange={e => onChange({ ...value, [relationField]: e.target.value })} className={inp}>
            <option value="">— выбрать —</option>
            {relationOptions.map((r: string) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={onRemove} className="mt-4 p-1.5 text-[#4b5563] hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[['last_name', 'Фамилия'], ['first_name', 'Имя'], ['middle_name', 'Отчество']].map(([k, l]) => (
          <div key={k}><label className="block text-xs text-[#6b7280] mb-1">{l}</label><input value={value[k] || ''} onChange={set(k)} className={inp} /></div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-[#6b7280] mb-1">Пол</label>
          <select value={value.gender || ''} onChange={set('gender')} className={inp}>
            {GENDER_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div><label className="block text-xs text-[#6b7280] mb-1">Дата рождения</label><input type="date" min="1900-01-01" max="2100-12-31" value={value.date_of_birth || ''} onChange={set('date_of_birth')} className={inp} /></div>
        <div><label className="block text-xs text-[#6b7280] mb-1">ПИН</label><input value={value.pin || ''} onChange={set('pin')} className={inp} /></div>
      </div>
      <div><label className="block text-xs text-[#6b7280] mb-1">Гражданство</label><input value={value.citizenship || ''} onChange={set('citizenship')} className={inp} /></div>
    </div>
  )
}

// ─── Форма УБО (модальное окно) ───────────────────────────────────────────────

export const INFLUENCE_TYPES = [
  { value: '', label: '— выбрать —' },
  { value: 'резидент', label: 'Резидент' },
  { value: 'нерезидент', label: 'Нерезидент' },
]

export const INDIVIDUAL_INFLUENCE_OPTIONS = [
  'родитель',
  'усыновитель',
  'опекун',
  'попечитель',
  'другое',
]

function IndividualInfluenceCheckboxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : []
  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt]
    onChange(next.join(', '))
  }
  return (
    <div className="space-y-1.5">
      {INDIVIDUAL_INFLUENCE_OPTIONS.map(opt => (
        <label key={opt} className="flex items-center gap-2.5 cursor-pointer group select-none">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="accent-[#d4a843] w-4 h-4 flex-shrink-0"
          />
          <span className="text-sm text-[#d1d5db] group-hover:text-white transition-colors capitalize">{opt}</span>
        </label>
      ))}
    </div>
  )
}

export function UBOForm({ form, setForm, clients, editId, saving, onSave, onClose, lockedClientId, clientType }: any) {
  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const addFamily = () => setForm((f: any) => ({ ...f, pdl_family_members: [...(f.pdl_family_members || []), { ...EMPTY_PDL_PERSON, relation: '' }] }))
  const updFamily = (i: number, v: any) => setForm((f: any) => { const a = [...(f.pdl_family_members || [])]; a[i] = v; return { ...f, pdl_family_members: a } })
  const delFamily = (i: number) => setForm((f: any) => ({ ...f, pdl_family_members: (f.pdl_family_members || []).filter((_: any, j: number) => j !== i) }))

  const addAssoc = () => setForm((f: any) => ({ ...f, pdl_close_associates: [...(f.pdl_close_associates || []), { ...EMPTY_PDL_PERSON, relation_type: '' }] }))
  const updAssoc = (i: number, v: any) => setForm((f: any) => { const a = [...(f.pdl_close_associates || [])]; a[i] = v; return { ...f, pdl_close_associates: a } })
  const delAssoc = (i: number) => setForm((f: any) => ({ ...f, pdl_close_associates: (f.pdl_close_associates || []).filter((_: any, j: number) => j !== i) }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Шапка */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535] flex-shrink-0">
          <h2 className="font-semibold text-white">{editId ? 'Редактировать УБО' : 'Добавить УБО'}</h2>
          <button onClick={onClose} className="text-[#4b5563] hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Тело */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">

            {/* Клиент — скрыт если clientId зафиксирован (embedded в карточке) */}
            {!lockedClientId && (
              <>
                <FSep title="Клиент" />
                <div className="col-span-2">
                  <FLabel>Юридическое лицо *</FLabel>
                  <select value={form.client_id} onChange={e => set('client_id')(e.target.value)} disabled={!!editId}
                    className="w-full bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 disabled:opacity-50">
                    <option value="">— выбрать клиента —</option>
                    {(clients || []).map((c: Client) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* ФИО */}
            <FSep title="ФИО" />
            <div>
              <FLabel>Фамилия *</FLabel>
              <FInput value={form.last_name} onChange={set('last_name')} />
            </div>
            <div>
              <FLabel>Имя *</FLabel>
              <FInput value={form.first_name} onChange={set('first_name')} />
            </div>
            <div className="col-span-2">
              <FLabel>Отчество</FLabel>
              <FInput value={form.middle_name} onChange={set('middle_name')} />
            </div>

            {/* Персональные данные */}
            <FSep title="Персональные данные" />
            <div>
              <FLabel>Дата рождения</FLabel>
              <FInput type="date" min="1900-01-01" max="2100-12-31" value={form.date_of_birth} onChange={set('date_of_birth')} />
            </div>
            <div>
              <FLabel>Место рождения</FLabel>
              <FInput value={form.place_of_birth} onChange={set('place_of_birth')} />
            </div>
            <div>
              <FLabel>Гражданство</FLabel>
              <FInput value={form.nationality} onChange={set('nationality')} />
            </div>
            <div>
              <FLabel>Страна проживания</FLabel>
              <FInput value={form.country_of_residence} onChange={set('country_of_residence')} />
            </div>
            <div className="col-span-2">
              <FLabel>ИНН / ПИН</FLabel>
              <FInput value={form.pin} onChange={set('pin')} placeholder="Идентификационный номер" />
            </div>

            {/* Документ */}
            <FSep title="Документ" />
            <div>
              <FLabel>Вид документа</FLabel>
              <FSelect value={form.doc_type} onChange={set('doc_type')} options={DOC_TYPES} />
            </div>
            <div>
              <FLabel>Серия / номер</FLabel>
              <FInput value={form.doc_series_number} onChange={set('doc_series_number')} />
            </div>
            <div className="col-span-2">
              <FLabel>Кем выдан</FLabel>
              <FInput value={form.doc_issued_by} onChange={set('doc_issued_by')} />
            </div>
            <div>
              <FLabel>Дата выдачи</FLabel>
              <FInput type="date" min="1900-01-01" max="2100-12-31" value={form.doc_issued_at} onChange={set('doc_issued_at')} />
            </div>
            <div>
              <FLabel>Срок действия</FLabel>
              <FInput type="date" min="1900-01-01" max="2100-12-31" value={form.doc_expires_at} onChange={set('doc_expires_at')} />
            </div>

            {/* Адрес и контакты */}
            <FSep title="Адрес и контакты" />
            <div className="col-span-2">
              <FLabel>Адрес регистрации</FLabel>
              <FInput value={form.registration_address} onChange={set('registration_address')} />
            </div>
            <div className="col-span-2">
              <FLabel>Фактический адрес</FLabel>
              <FInput value={form.actual_address} onChange={set('actual_address')} />
            </div>
            <div>
              <FLabel>Телефон</FLabel>
              <FInput value={form.phone} onChange={set('phone')} placeholder="+996 700 000000" />
            </div>
            <div>
              <FLabel>Email</FLabel>
              <FInput value={form.email} onChange={set('email')} type="email" />
            </div>

            {/* Статус резидентства / тип влияния */}
            <FSep title="Статус и владение" />
            <div>
              <FLabel>Статус (резидентство)</FLabel>
              <FSelect value={form.residency_status} onChange={set('residency_status')} options={INFLUENCE_TYPES} />
            </div>
            {clientType === 'individual' ? (
              <div className="col-span-2">
                <FLabel>Тип влияния бенефициарного владельца (нужное отметить)</FLabel>
                <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-3 mt-0.5">
                  <IndividualInfluenceCheckboxes value={form.influence_type} onChange={set('influence_type')} />
                </div>
              </div>
            ) : null}
            {clientType !== 'individual' && (
              <>
                <div>
                  <FLabel>Доля владения %</FLabel>
                  <FInput type="number" min="0" max="100" value={form.ownership_percentage} onChange={set('ownership_percentage')} />
                </div>
                <div>
                  <FLabel>Характер контроля</FLabel>
                  <FSelect value={form.control_type} onChange={set('control_type')} options={CONTROL_TYPES} />
                </div>
              </>
            )}
            {clientType !== 'individual' && (
              <>
                <div className="col-span-2">
                  <FLabel>Критерии признания бенефициарным владельцем</FLabel>
                  <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-4">
                    <CriteriaCheckboxes
                      value={form.recognition_criteria}
                      onChange={v => setForm((f: any) => ({ ...f, recognition_criteria: v }))}
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <FLabel>Дополнительные примечания к основанию</FLabel>
                  <FTextarea value={form.recognition_basis} onChange={set('recognition_basis')} rows={2} />
                </div>
                <div className="col-span-2">
                  <FLabel>Цепочка владения</FLabel>
                  <FTextarea value={form.ownership_chain} onChange={set('ownership_chain')} rows={2} placeholder="Опишите структуру владения..." />
                </div>
              </>
            )}
            <div className="col-span-2 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.is_ultimate}
                  onChange={e => set('is_ultimate')(e.target.checked)} className="accent-[#d4a843] w-4 h-4" />
                <span className="text-sm text-[#d1d5db]">Конечный бенефициарный владелец</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!form.is_pep}
                  onChange={e => set('is_pep')(e.target.checked)} className="accent-red-400 w-4 h-4" />
                <span className="text-sm text-[#d1d5db]">Является ПДЛ / ИПДЛ</span>
              </label>
            </div>

            {form.is_pep && <>
              <FSep title="Анкета ПДЛ — Глава 2. Деловой профиль" />
              <div className="col-span-2">
                <FLabel>Занимаемая должность</FLabel>
                <FInput value={form.pdl_position} onChange={set('pdl_position')} />
              </div>
              <div>
                <FLabel>Дата назначения на должность</FLabel>
                <FInput type="date" min="1900-01-01" max="2100-12-31" value={form.pdl_appointment_date} onChange={set('pdl_appointment_date')} />
              </div>
              <div>
                <FLabel>Дата освобождения от должности</FLabel>
                <FInput type="date" min="1900-01-01" max="2100-12-31" value={form.pdl_release_date} onChange={set('pdl_release_date')} />
              </div>
              <div className="col-span-2">
                <FLabel>Источник происхождения денежных средств и имущества (ИПДС)</FLabel>
                <FTextarea value={form.pdl_source_of_funds} onChange={set('pdl_source_of_funds')} rows={3} />
              </div>
              <div className="col-span-2">
                <FLabel>Сведения о письменном разрешении по принятию на обслуживание</FLabel>
                <FTextarea value={form.pdl_approval_notes} onChange={set('pdl_approval_notes')} rows={2} />
              </div>

              {/* Глава 3 — Члены семьи */}
              <div className="col-span-2 border-t border-[#1e2535] pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider">Глава 3. Члены семьи ПДЛ</span>
                  <button type="button" onClick={addFamily} className="flex items-center gap-1 text-xs text-[#d4a843] hover:text-white transition-colors">
                    <Plus className="w-3.5 h-3.5" />Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {(form.pdl_family_members || []).length === 0 && (
                    <p className="text-xs text-[#4b5563] text-center py-2">Члены семьи не добавлены</p>
                  )}
                  {(form.pdl_family_members || []).map((m: any, i: number) => (
                    <PDLPersonRow key={i} value={m} onChange={(v: any) => updFamily(i, v)} onRemove={() => delFamily(i)} relationField="relation" relationOptions={PDL_RELATION_TYPES} />
                  ))}
                </div>
              </div>

              {/* Глава 4 — Близкие лица */}
              <div className="col-span-2 border-t border-[#1e2535] pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider">Глава 4. Близкие лица ПДЛ</span>
                  <button type="button" onClick={addAssoc} className="flex items-center gap-1 text-xs text-[#d4a843] hover:text-white transition-colors">
                    <Plus className="w-3.5 h-3.5" />Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {(form.pdl_close_associates || []).length === 0 && (
                    <p className="text-xs text-[#4b5563] text-center py-2">Близкие лица не добавлены</p>
                  )}
                  {(form.pdl_close_associates || []).map((m: any, i: number) => (
                    <PDLPersonRow key={i} value={m} onChange={(v: any) => updAssoc(i, v)} onRemove={() => delAssoc(i)} relationField="relation_type" relationOptions={PDL_ASSOCIATE_TYPES} />
                  ))}
                </div>
              </div>
            </>}

            {/* Комплаенс */}
            <FSep title="Комплаенс" />
            <div className="col-span-2">
              <FLabel>Источник происхождения средств / имущества</FLabel>
              <FTextarea value={form.source_of_funds} onChange={set('source_of_funds')} rows={2} />
            </div>
            <div className="col-span-2">
              <FLabel>Цель деловых отношений</FLabel>
              <FTextarea value={form.relationship_purpose} onChange={set('relationship_purpose')} rows={2} />
            </div>
            <div className="col-span-2">
              <FLabel>Примечания</FLabel>
              <FTextarea value={form.notes} onChange={set('notes')} rows={2} />
            </div>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-3 px-6 pb-5 flex-shrink-0 border-t border-[#1e2535] pt-4">
          <button onClick={onSave} disabled={saving || (!lockedClientId && !form.client_id) || !form.last_name || !form.first_name}
            className="flex-1 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors">
            {saving ? 'Сохранение...' : editId ? 'Обновить' : 'Добавить'}
          </button>
          <button onClick={onClose}
            className="border border-[#1e2535] text-[#6b7280] hover:text-white px-5 py-2.5 rounded-lg text-sm transition-colors">
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Главная страница ─────────────────────────────────────────────────────────

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
  const [viewUbo, setViewUbo] = useState<UBO | null>(null)

  const [filterType, setFilterType] = useState<'' | 'ultimate' | 'intermediate'>('')
  const [filterNationality, setFilterNationality] = useState('')
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
      const [ubosRes, clientsRes] = await Promise.all([api.get('/ubos'), api.get('/clients')])
      setUbos(ubosRes.data)
      setClients((clientsRes.data as any[]).map((c: any) => ({
        id: c.id,
        display_name: c.display_name || `Клиент #${c.id}`,
      })))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = async () => {
    // Загружаем полные данные клиентов для экспорта
    let clientMap: Record<number, any> = {}
    try {
      const { data } = await api.get('/clients')
      for (const c of data) {
        clientMap[c.id] = c
      }
    } catch { /* используем то что есть */ }

    const fmt = (d: any) => d ? new Date(d).toLocaleDateString('ru-RU') : ''

    const rows = ubos.map(u => {
      const c = clientMap[u.client_id] || {}
      const le = c.legal_entity || {}
      const ind = c.individual || {}
      const selectedCriteria = (u.recognition_criteria || [])
        .filter((e: any) => e.selected)
        .map((e: any) => {
          const crit = UBO_CRITERIA.find(x => x.code === e.code)
          return `${e.code}. ${crit?.label || ''}${e.details ? ` (${e.details})` : ''}`
        })
        .join('; ')

      return {
        // 1–8: Данные юридического лица
        '1. Полное наименование': le.full_name || ind.last_name ? `${ind.last_name || ''} ${ind.first_name || ''} ${ind.middle_name || ''}`.trim() : u.client_name,
        '2. Дата/номер приказа о регистрации': le.registration_order || '',
        '3. Дата первичной гос. регистрации': fmt(le.registration_date),
        '4. Организационно-правовая форма': le.legal_form || '',
        '5. Способ образования': le.formation_method || '',
        '6. Регистрационный номер': le.registration_number || '',
        '7. ИНН': le.inn || ind.pin || '',
        '8. ОКПО': le.okpo || '',
        '9. Юридический адрес': le.legal_address || ind.registration_address || '',
        '10. Сведения об учредителях': '',
        '11. Сведения о руководителе': '',
        '12. Иностранное участие': '',
        '13. Основной вид деятельности': le.main_activity || '',
        // 14: Критерии признания БВ
        '14. Критерии признания БВ': selectedCriteria || u.influence_type || '',
        '15. Доля в уставном капитале (%)': u.ownership_percentage != null ? String(u.ownership_percentage) : '',
        '16. Статус БВ (резидент/нерезидент)': u.influence_type || '',
        // 17–25: Личные данные БВ
        '17. Фамилия': u.last_name,
        '18. Имя': u.first_name,
        '19. Отчество': u.middle_name || '',
        '20. Дата рождения': fmt(u.date_of_birth),
        '21. Место рождения': u.place_of_birth || '',
        '22. Национальность': u.nationality || '',
        '23. Пол': '',
        '24. Гражданство': u.nationality || '',
        '25. Семейное положение': '',
        // 26: Документ
        '26.1. Вид документа': u.doc_type || '',
        '26.2. Серия и номер': u.doc_series_number || '',
        '26.3. Дата выдачи': fmt(u.doc_issued_at),
        '26.4. Дата окончания': fmt(u.doc_expires_at),
        '26.5. Орган, выдавший документ': u.doc_issued_by || '',
        '26.6. Код подразделения': '',
        '26.7. Персональный номер': u.pin || '',
        '27. Адрес регистрации': u.registration_address || '',
        '28. Адрес фактического проживания': u.actual_address || '',
        '29.1. Телефоны': u.phone || '',
        '29.2. Факс': '',
        '29.3. Email': u.email || '',
        '30. Банковские счета': '',
        '31. Является ПДЛ': u.is_pep ? 'Да' : 'Нет',
        '32. Член семьи / близкое лицо ПДЛ': '',
        '33.1. Занимаемая должность': u.pdl_position || '',
        '33.2. Дата назначения': fmt(u.pdl_appointment_date),
        '33.3. Дата освобождения': fmt(u.pdl_release_date),
        // 34–39: Дополнительные данные ЮЛ
        '34. Сокращённое наименование': le.short_name || '',
        '35. Наименование (гос. язык)': le.name_state_lang || '',
        '36. Наименование (офиц. язык)': le.name_official_lang || '',
        '37. Фактический адрес': le.actual_address || ind.actual_address || '',
        '38. Дополнительный вид деятельности': le.additional_activity || '',
        '39. Форма собственности': le.ownership_form || '',
        // 40–42: Результаты проверок
        '40. Санкционные перечни (дата проверки)': '',
        '41. Перечень ПЛПД (дата проверки)': '',
        '42. Перечень осуждённых (дата проверки)': '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    // Ширина столбцов
    ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, 15) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Реестр БВ')
    XLSX.writeFile(wb, `Реестр_БВ_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
    if (!form.client_id || !form.last_name || !form.first_name) return
    setSaving(true)
    try {
      const payload: any = {
        client_id: Number(form.client_id),
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
      await loadData()
    } catch {
      toast('Не удалось сохранить', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/ubos/${id}`)
      setUbos(prev => prev.filter(u => u.id !== id))
      toast('УБО удалён')
    } catch {
      toast('Не удалось удалить', false)
    } finally {
      setDeleteId(null)
    }
  }

  const nationalities = Array.from(new Set(ubos.map(u => u.nationality).filter(Boolean))) as string[]

  const filtered = ubos.filter(u => {
    const q = search.toLowerCase()
    const matchSearch =
      `${u.last_name} ${u.first_name} ${u.middle_name ?? ''}`.toLowerCase().includes(q) ||
      u.client_name.toLowerCase().includes(q) ||
      (u.nationality ?? '').toLowerCase().includes(q) ||
      (u.doc_series_number ?? '').toLowerCase().includes(q) ||
      (u.pin ?? '').toLowerCase().includes(q)
    const matchType = filterType === '' ? true : filterType === 'ultimate' ? u.is_ultimate : !u.is_ultimate
    const matchNationality = filterNationality ? u.nationality === filterNationality : true
    return matchSearch && matchType && matchNationality
  })

  const totalUltimate = ubos.filter(u => u.is_ultimate).length
  const totalPep = ubos.filter(u => u.is_pep).length
  const { sorted: sortedUbos, sortKey, sortDir, toggle } = useSortable(filtered, 'last_name')
  const hasFilters = search || filterType || filterNationality

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="w-5 h-5 text-[#d4a843] flex-shrink-0" />
          <div>
            <h1 className="page-title">Реестр УБО</h1>
            <p className="page-subtitle">{ubos.length} записей</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={clsx('transition-all duration-200 overflow-hidden', searchOpen || search ? 'w-56 opacity-100' : 'w-0 opacity-0')}>
            <div className="relative">
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false) }}
                placeholder="ФИО, клиент, ПИН, документ..."
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
          {nationalities.length > 0 && (
            <div ref={filterRef} className="relative">
              <button onClick={() => setFilterOpen(v => !v)}
                className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                  filterOpen || filterNationality ? 'border-[#d4a843]/40 text-[#d4a843] bg-[#d4a843]/5' : 'border-[#1e2535] text-[#6b7280] hover:text-white hover:border-[#374151]')}>
                <SlidersHorizontal className="w-4 h-4" />
                <span>Фильтры</span>
                {filterNationality && <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[#d4a843] text-[#0a0d14] text-[10px] font-bold px-1">1</span>}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-[#111520] border border-[#1e2535] rounded-xl shadow-2xl z-30 p-3 space-y-2">
                  <div>
                    <label className="block text-xs text-[#4b5563] mb-1">Гражданство</label>
                    <select value={filterNationality} onChange={e => setFilterNationality(e.target.value)}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#d4a843]/50">
                      <option value="">Все</option>
                      {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  {filterNationality && (
                    <button onClick={() => setFilterNationality('')}
                      className="w-full text-xs text-[#6b7280] hover:text-white border border-[#1e2535] hover:border-[#374151] rounded-lg py-1.5 transition-colors">
                      Сбросить
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button onClick={exportToExcel} disabled={ubos.length === 0} className="btn-ghost disabled:opacity-40 flex-shrink-0">
            <Download className="w-4 h-4" />Excel
          </button>
          <button onClick={openCreate} className="btn-primary flex-shrink-0">
            <Plus className="w-4 h-4" />Добавить УБО
          </button>
        </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">

      {hasFilters && (
        <div className="flex flex-wrap gap-1.5">
          {search && <span className="inline-flex items-center gap-1 text-xs bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] px-2 py-1 rounded-full">
            Поиск: {search}<button onClick={() => setSearch('')} className="hover:text-white"><X className="w-3 h-3" /></button>
          </span>}
          {filterNationality && <span className="inline-flex items-center gap-1 text-xs bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] px-2 py-1 rounded-full">
            {filterNationality}<button onClick={() => setFilterNationality('')} className="hover:text-white"><X className="w-3 h-3" /></button>
          </span>}
          {filterType && <span className="inline-flex items-center gap-1 text-xs bg-[#d4a843]/10 border border-[#d4a843]/20 text-[#d4a843] px-2 py-1 rounded-full">
            {filterType === 'ultimate' ? 'Конечные' : 'Промежуточные'}<button onClick={() => setFilterType('')} className="hover:text-white"><X className="w-3 h-3" /></button>
          </span>}
        </div>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="stat-value text-white">{ubos.length}</p>
          <p className="stat-label">Всего УБО</p>
        </div>
        <button onClick={() => setFilterType(filterType === 'ultimate' ? '' : 'ultimate')}
          className={clsx('stat-card text-left transition-colors cursor-pointer',
            filterType === 'ultimate' ? 'border-[#d4a843]/40 bg-[#d4a843]/5' : 'hover:border-[#2e3545]')}>
          <p className="stat-value text-[#d4a843]">{totalUltimate}</p>
          <p className="stat-label">Конечных УБО</p>
        </button>
        <button onClick={() => setFilterType(filterType === 'intermediate' ? '' : 'intermediate')}
          className={clsx('stat-card text-left transition-colors cursor-pointer',
            filterType === 'intermediate' ? 'border-[#d4a843]/40 bg-[#d4a843]/5' : 'hover:border-[#2e3545]')}>
          <p className="stat-value text-[#9ca3af]">{ubos.length - totalUltimate}</p>
          <p className="stat-label">Промежуточных</p>
        </button>
        <div className="stat-card">
          <p className="stat-value text-red-400">{totalPep}</p>
          <p className="stat-label">ПДЛ / ИПДЛ</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#4b5563]">
        <span>{loading ? 'Загрузка...' : `${filtered.length} записей`}</span>
        {filterType && <span className="text-[#d4a843]">· {filterType === 'ultimate' ? 'Конечные УБО' : 'Промежуточные'}</span>}
        {filterNationality && <span className="text-[#d4a843]">· {filterNationality}</span>}
      </div>

      {!loading && filtered.length === 0 ? (
        <div className="text-center py-16 text-[#4b5563]">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-[#9ca3af] font-medium">
            {hasFilters ? 'По выбранным фильтрам ничего не найдено' : 'УБО ещё не добавлены'}
          </p>
          {!hasFilters && (
            <button onClick={openCreate} className="mt-4 text-[#d4a843] text-sm hover:underline">
              + Добавить первого УБО
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2535] bg-[#0d1017]">
                {[
                  { label: 'ФИО',           field: 'last_name' },
                  { label: 'Клиент',        field: 'client_name' },
                  { label: 'Доля %',        field: 'ownership_percentage' },
                  { label: 'Гражданство',   field: 'nationality' },
                  { label: 'Дата рождения', field: 'date_of_birth' },
                  { label: 'Статус',        field: 'influence_type' },
                ].map(h => (
                  <SortTh key={h.field} label={h.label} field={h.field}
                    current={String(sortKey)} dir={sortDir} onSort={toggle} className="px-4 py-3" />
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sortedUbos.map(u => (
                <tr key={u.id} className="border-b border-[#1e2535] last:border-0 hover:bg-[#111520]">
                  <td className="px-4 py-3">
                    <button onClick={() => setViewUbo(u)}
                      className="font-medium text-white hover:text-[#d4a843] transition-colors text-left flex items-center gap-1.5 group">
                      <span>{u.last_name} {u.first_name} {u.middle_name ?? ''}</span>
                      {u.is_pep && <span title="ПДЛ/ИПДЛ"><Shield className="w-3 h-3 text-red-400 flex-shrink-0" /></span>}
                      <Eye className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/clients/${u.client_id}`} className="text-[#d4a843] hover:underline flex items-center gap-1">
                      {u.client_name}<ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#d1d5db]">
                    {u.ownership_percentage != null ? `${u.ownership_percentage}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#d1d5db]">{u.nationality ?? '—'}</td>
                  <td className="px-4 py-3 text-[#6b7280] text-xs">{fmtDate(u.date_of_birth)}</td>
                  <td className="px-4 py-3">
                    {u.influence_type ? (
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                        u.influence_type === 'резидент' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400')}>
                        {u.influence_type}
                      </span>
                    ) : <span className="text-[#374151]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setViewUbo(u)} className="p-1.5 text-[#4b5563] hover:text-[#d4a843] rounded transition-colors" title="Просмотреть">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(u)} className="p-1.5 text-[#4b5563] hover:text-white rounded transition-colors" title="Редактировать">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(u.id)} className="p-1.5 text-[#4b5563] hover:text-red-400 rounded transition-colors" title="Удалить">
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

      {viewUbo && <UBODetailModal ubo={viewUbo} onClose={() => setViewUbo(null)} onEdit={() => openEdit(viewUbo)} />}

      {showForm && (
        <UBOForm
          form={form}
          setForm={setForm}
          clients={clients}
          editId={editId}
          saving={saving}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Удалить УБО"
        message={(() => {
          const u = ubos.find(x => x.id === deleteId)
          return u ? `Удалить ${u.last_name} ${u.first_name}?` : 'Удалить запись?'
        })()}
        onConfirm={() => deleteId !== null && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
      </div>
    </div>
  )
}
