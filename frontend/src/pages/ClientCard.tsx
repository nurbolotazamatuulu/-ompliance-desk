import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Building2, FileText, Shield,
  Users, ChevronDown, ChevronUp, Save, AlertCircle,
  CheckCircle2, Clock, XCircle, PauseCircle, RefreshCw
} from 'lucide-react'
import { clientsApi } from '../api/clients'
import api from '../api/client'
import clsx from 'clsx'
import RiskScoring from '../components/RiskScoring'

// ─── Статусы ──────────────────────────────────────────────────────────────────

const ONBOARDING_STATUSES = [
  { value: 'pending', label: 'Ожидает', icon: Clock, color: 'text-yellow-400' },
  { value: 'in_progress', label: 'В процессе', icon: RefreshCw, color: 'text-blue-400' },
  { value: 'approved', label: 'Одобрен', icon: CheckCircle2, color: 'text-green-400' },
  { value: 'rejected', label: 'Отклонён', icon: XCircle, color: 'text-red-400' },
  { value: 'suspended', label: 'Приостановлен', icon: PauseCircle, color: 'text-orange-400' },
]

const RISK_LEVELS = [
  { value: '', label: 'Не определён' },
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'unacceptable', label: 'Неприемлемый' },
]

// ─── Компоненты формы ─────────────────────────────────────────────────────────

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', disabled }: any) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] disabled:opacity-50"
    />
  )
}

function Select({ value, onChange, options, disabled }: any) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 disabled:opacity-50"
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }: any) {
  return (
    <textarea
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
    />
  )
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[#1e2535] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[#0d1017] text-left"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[#4b5563]" /> : <ChevronDown className="w-4 h-4 text-[#4b5563]" />}
      </button>
      {open && <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>}
    </div>
  )
}

function Checkbox({ label, checked, onChange }: any) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-[#d4a843]"
      />
      <span className="text-sm text-[#9ca3af]">{label}</span>
    </label>
  )
}

// ─── Вкладка ФЛ ───────────────────────────────────────────────────────────────

function IndividualForm({ data, onChange, onSave, saving }: any) {
  const set = (field: string) => (value: any) => onChange({ ...data, [field]: value })

  return (
    <div className="space-y-4">
      {/* Глава 1. Идентификация */}
      <Section title="Глава 1. Идентификационные сведения">
        <Field label="Статус">
          <Select value={data.is_resident ? 'resident' : 'non_resident'} onChange={(v: string) => set('is_resident')(v === 'resident')} options={[
            { value: 'resident', label: 'Резидент' },
            { value: 'non_resident', label: 'Нерезидент' },
          ]} />
        </Field>
        <Field label="Фамилия" required><Input value={data.last_name} onChange={set('last_name')} placeholder="Иванов" /></Field>
        <Field label="Имя" required><Input value={data.first_name} onChange={set('first_name')} placeholder="Иван" /></Field>
        <Field label="Отчество"><Input value={data.middle_name} onChange={set('middle_name')} placeholder="Иванович" /></Field>
        <Field label="Дата рождения"><Input type="date" value={data.date_of_birth?.split('T')[0]} onChange={set('date_of_birth')} /></Field>
        <Field label="Место рождения"><Input value={data.place_of_birth} onChange={set('place_of_birth')} /></Field>
        <Field label="Национальность"><Input value={data.nationality} onChange={set('nationality')} /></Field>
        <Field label="Пол">
          <Select value={data.gender} onChange={set('gender')} options={[
            { value: '', label: 'Не указан' },
            { value: 'male', label: 'Мужской' },
            { value: 'female', label: 'Женский' },
          ]} />
        </Field>
        <Field label="Гражданство"><Input value={data.citizenship} onChange={set('citizenship')} placeholder="Кыргызстан" /></Field>
        <Field label="Семейное положение">
          <Select value={data.marital_status} onChange={set('marital_status')} options={[
            { value: '', label: 'Не указано' },
            { value: 'single', label: 'Холост / Не замужем' },
            { value: 'married', label: 'Женат / Замужем' },
            { value: 'divorced', label: 'Разведён / Разведена' },
            { value: 'widowed', label: 'Вдовец / Вдова' },
          ]} />
        </Field>
        <Field label="ПИН / ИНН"><Input value={data.pin} onChange={set('pin')} placeholder="12345678901234" /></Field>
      </Section>

      {/* Документ */}
      <Section title="Документ, удостоверяющий личность">
        <Field label="Вид документа"><Input value={data.doc_type} onChange={set('doc_type')} placeholder="Паспорт / ID-карта" /></Field>
        <Field label="Серия и номер"><Input value={data.doc_series_number} onChange={set('doc_series_number')} placeholder="AN1234567" /></Field>
        <Field label="Дата выдачи"><Input type="date" value={data.doc_issued_at?.split('T')[0]} onChange={set('doc_issued_at')} /></Field>
        <Field label="Дата окончания"><Input type="date" value={data.doc_expires_at?.split('T')[0]} onChange={set('doc_expires_at')} /></Field>
        <Field label="Кем выдан"><Input value={data.doc_issued_by} onChange={set('doc_issued_by')} /></Field>
        <Field label="Код подразделения"><Input value={data.doc_division_code} onChange={set('doc_division_code')} /></Field>
      </Section>

      {/* Адреса и контакты */}
      <Section title="Адреса и контактные данные">
        <div className="md:col-span-2">
          <Field label="Адрес регистрации"><Textarea value={data.registration_address} onChange={set('registration_address')} placeholder="Страна, область, город, улица, дом, квартира" /></Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Адрес фактического проживания"><Textarea value={data.actual_address} onChange={set('actual_address')} placeholder="Если отличается от адреса регистрации" /></Field>
        </div>
        <Field label="Телефон мобильный"><Input value={data.phone_mobile} onChange={set('phone_mobile')} placeholder="+996 700 000000" /></Field>
        <Field label="Телефон домашний"><Input value={data.phone_home} onChange={set('phone_home')} /></Field>
        <Field label="Телефон рабочий"><Input value={data.phone_work} onChange={set('phone_work')} /></Field>
        <Field label="Email"><Input type="email" value={data.email} onChange={set('email')} /></Field>
      </Section>

      {/* Для иностранцев */}
      <Section title="Для иностранных граждан и лиц без гражданства" defaultOpen={false}>
        <Field label="Тип документа на пребывание">
          <Select value={data.foreign_doc_type} onChange={set('foreign_doc_type')} options={[
            { value: '', label: 'Не применимо' },
            { value: 'residence_permit', label: 'Вид на жительство' },
            { value: 'temp_residence', label: 'Разрешение на временное проживание' },
            { value: 'visa', label: 'Виза' },
          ]} />
        </Field>
        <Field label="Серия и номер документа"><Input value={data.foreign_doc_series_number} onChange={set('foreign_doc_series_number')} /></Field>
        <Field label="Дата начала действия"><Input type="date" value={data.foreign_doc_valid_from?.split('T')[0]} onChange={set('foreign_doc_valid_from')} /></Field>
        <Field label="Дата окончания действия"><Input type="date" value={data.foreign_doc_valid_to?.split('T')[0]} onChange={set('foreign_doc_valid_to')} /></Field>
      </Section>

      {/* Глава 2. Деловой профиль */}
      <Section title="Глава 2. Деловой профиль">
        <div className="md:col-span-2">
          <Field label="Цель и предполагаемый характер деловых отношений">
            <Textarea value={data.business_purpose} onChange={set('business_purpose')} placeholder="Инвестиции, торговля ценными бумагами и виртуальными активами..." rows={4} />
          </Field>
        </div>
        <div className="md:col-span-2 space-y-3">
          <Checkbox label="Является публичным должностным лицом (ПДЛ)" checked={data.is_pdl} onChange={set('is_pdl')} />
          <Checkbox label="Имеется бенефициарный владелец" checked={data.has_ubo} onChange={set('has_ubo')} />
          <Checkbox label="Является индивидуальным предпринимателем" checked={data.is_individual_entrepreneur} onChange={set('is_individual_entrepreneur')} />
        </div>
        <div className="md:col-span-2">
          <Field label="Документы о полномочиях распоряжения средствами">
            <Textarea value={data.authority_documents} onChange={set('authority_documents')} />
          </Field>
        </div>
      </Section>

      {/* ИП */}
      {data.is_individual_entrepreneur && (
        <Section title="Сведения об индивидуальном предпринимателе" defaultOpen={true}>
          <Field label="Дата регистрации ИП"><Input type="date" value={data.ie_registration_date?.split('T')[0]} onChange={set('ie_registration_date')} /></Field>
          <Field label="Регистрационный номер"><Input value={data.ie_registration_number} onChange={set('ie_registration_number')} /></Field>
          <Field label="Регистрирующий орган"><Input value={data.ie_registration_authority} onChange={set('ie_registration_authority')} /></Field>
          <Field label="Место регистрации"><Input value={data.ie_registration_place} onChange={set('ie_registration_place')} /></Field>
          <Field label="Вид патента/лицензии"><Input value={data.ie_patent_type} onChange={set('ie_patent_type')} /></Field>
          <Field label="Номер патента/лицензии"><Input value={data.ie_patent_number} onChange={set('ie_patent_number')} /></Field>
          <Field label="Дата выдачи"><Input type="date" value={data.ie_patent_issued_at?.split('T')[0]} onChange={set('ie_patent_issued_at')} /></Field>
          <Field label="Дата окончания"><Input type="date" value={data.ie_patent_expires_at?.split('T')[0]} onChange={set('ie_patent_expires_at')} /></Field>
          <div className="md:col-span-2">
            <Field label="Виды деятельности"><Textarea value={data.ie_activities} onChange={set('ie_activities')} /></Field>
          </div>
        </Section>
      )}

      {/* Глава 3. Верификация */}
      <Section title="Глава 3. Верификация и уровень риска (заполняется офицером)">
        <Field label="Верификация проведена">
          <Select value={data.verification_status} onChange={set('verification_status')} options={[
            { value: '', label: 'Не указано' },
            { value: 'conducted', label: 'Проведена' },
            { value: 'not_conducted', label: 'Не проведена' },
          ]} />
        </Field>
        <Field label="Дата верификации"><Input type="date" value={data.verification_date?.split('T')[0]} onChange={set('verification_date')} /></Field>
        <Field label="Результат санкционной проверки">
          <Select value={data.sanctions_check_result} onChange={set('sanctions_check_result')} options={[
            { value: '', label: 'Не проверялся' },
            { value: 'clear', label: 'Отсутствует в санкционных перечнях' },
            { value: 'match', label: 'Присутствует в санкционных перечнях' },
          ]} />
        </Field>
        <Field label="Дата санкционной проверки"><Input type="date" value={data.sanctions_check_date?.split('T')[0]} onChange={set('sanctions_check_date')} /></Field>
        <Field label="Результат проверки по перечню осуждённых">
          <Select value={data.criminal_list_check_result} onChange={set('criminal_list_check_result')} options={[
            { value: '', label: 'Не проверялся' },
            { value: 'clear', label: 'Отсутствует' },
            { value: 'match', label: 'Присутствует' },
          ]} />
        </Field>
        <Field label="Дата проверки по перечню"><Input type="date" value={data.criminal_list_check_date?.split('T')[0]} onChange={set('criminal_list_check_date')} /></Field>
        <Field label="Дата очередного обновления"><Input type="date" value={data.next_update_date?.split('T')[0]} onChange={set('next_update_date')} /></Field>
        <Field label="Ответственный сотрудник"><Input value={data.db_entry_officer} onChange={set('db_entry_officer')} /></Field>
        <div className="md:col-span-2">
          <Field label="Обоснование уровня риска">
            <Textarea value={data.risk_justification} onChange={set('risk_justification')} rows={3} />
          </Field>
        </div>
      </Section>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-6 py-3 rounded-lg text-sm uppercase tracking-wider transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  )
}

// ─── Вкладка ЮЛ ───────────────────────────────────────────────────────────────

function LegalForm({ data, onChange, onSave, saving }: any) {
  const set = (field: string) => (value: any) => onChange({ ...data, [field]: value })

  return (
    <div className="space-y-4">
      <Section title="Глава 1. Идентификационные сведения">
        <Field label="Статус">
          <Select value={data.is_resident ? 'resident' : 'non_resident'} onChange={(v: string) => set('is_resident')(v === 'resident')} options={[
            { value: 'resident', label: 'Резидент' },
            { value: 'non_resident', label: 'Нерезидент' },
          ]} />
        </Field>
        <Field label="Полное наименование" required><Input value={data.full_name} onChange={set('full_name')} /></Field>
        <Field label="Сокращённое наименование"><Input value={data.short_name} onChange={set('short_name')} /></Field>
        <Field label="Наименование на иностранном языке"><Input value={data.name_foreign} onChange={set('name_foreign')} /></Field>
        <Field label="Организационно-правовая форма"><Input value={data.legal_form} onChange={set('legal_form')} placeholder="ООО, ОАО, ЗАО..." /></Field>
        <Field label="ИНН (резидент)"><Input value={data.inn_resident} onChange={set('inn_resident')} /></Field>
        <Field label="ИНН / КИО (нерезидент)"><Input value={data.inn_nonresident} onChange={set('inn_nonresident')} /></Field>
        <Field label="Дата государственной регистрации"><Input type="date" value={data.reg_date?.split('T')[0]} onChange={set('reg_date')} /></Field>
        <Field label="Номер государственной регистрации"><Input value={data.reg_number} onChange={set('reg_number')} /></Field>
        <Field label="Наименование регистрирующего органа"><Input value={data.reg_authority} onChange={set('reg_authority')} /></Field>
        <Field label="Регномер Соцфонда КР"><Input value={data.social_fund_reg_number} onChange={set('social_fund_reg_number')} /></Field>
        <Field label="Код ОКПО"><Input value={data.okpo_code} onChange={set('okpo_code')} /></Field>
        <Field label="Вид деятельности"><Input value={data.activity_type} onChange={set('activity_type')} /></Field>
        <Field label="Форма собственности"><Input value={data.ownership_form} onChange={set('ownership_form')} /></Field>
        <Field label="БИК (для коммерческих банков)"><Input value={data.bank_id_code} onChange={set('bank_id_code')} /></Field>
        <div className="md:col-span-2">
          <Field label="Юридический адрес (место регистрации)"><Textarea value={data.legal_address} onChange={set('legal_address')} /></Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Фактический адрес (если отличается)"><Textarea value={data.actual_address} onChange={set('actual_address')} /></Field>
        </div>
        <Field label="Телефон рабочий"><Input value={data.phone_work} onChange={set('phone_work')} /></Field>
        <Field label="Телефон мобильный"><Input value={data.phone_mobile} onChange={set('phone_mobile')} /></Field>
        <Field label="Факс"><Input value={data.fax} onChange={set('fax')} /></Field>
        <Field label="Email"><Input type="email" value={data.email} onChange={set('email')} /></Field>
      </Section>

      <Section title="Глава 2. Уставные документы">
        <div className="md:col-span-2">
          <Field label="Органы управления (структура и персональный состав)">
            <Textarea value={data.authority_documents} onChange={set('authority_documents')} rows={4} placeholder="Наименование органа, ФИО членов, уполномоченные лица..." />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Уставной капитал">
            <Input value={data.authorized_capital} onChange={set('authorized_capital')} placeholder="Размер зарегистрированного и оплаченного капитала" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Филиалы и представительства">
            <Textarea value={data.branches_info} onChange={set('branches_info')} />
          </Field>
        </div>
        <div className="md:col-span-2 space-y-3">
          <Checkbox label="Присутствует по местонахождению на территории КР" checked={data.has_local_presence} onChange={set('has_local_presence')} />
          <Checkbox label="Имеется бенефициарный владелец" checked={data.has_ubo} onChange={set('has_ubo')} />
          <Checkbox label="Имеется ПДЛ в структуре собственности/управления" checked={data.has_pdl_in_structure} onChange={set('has_pdl_in_structure')} />
        </div>
        <Field label="Бенефициарный владелец — статус">
          <Select value={data.ubo_is_resident === true ? 'resident' : data.ubo_is_resident === false ? 'non_resident' : ''} onChange={(v: string) => set('ubo_is_resident')(v === 'resident' ? true : v === 'non_resident' ? false : null)} options={[
            { value: '', label: 'Не указано' },
            { value: 'resident', label: 'Резидент' },
            { value: 'non_resident', label: 'Нерезидент' },
          ]} />
        </Field>
      </Section>

      <Section title="Глава 3. Деловой профиль">
        <Field label="Вид лицензии"><Input value={data.license_type} onChange={set('license_type')} /></Field>
        <Field label="Номер лицензии"><Input value={data.license_number} onChange={set('license_number')} /></Field>
        <Field label="Дата выдачи лицензии"><Input type="date" value={data.license_issued_at?.split('T')[0]} onChange={set('license_issued_at')} /></Field>
        <Field label="Лицензия выдана"><Input value={data.license_issued_by} onChange={set('license_issued_by')} /></Field>
        <Field label="Срок действия лицензии"><Input type="date" value={data.license_expires_at?.split('T')[0]} onChange={set('license_expires_at')} /></Field>
        <div className="md:col-span-2">
          <Field label="Виды лицензируемой деятельности"><Textarea value={data.license_activities} onChange={set('license_activities')} /></Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Основные виды деятельности"><Textarea value={data.main_activities} onChange={set('main_activities')} /></Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Цель и предполагаемый характер деловых отношений">
            <Textarea value={data.business_purpose} onChange={set('business_purpose')} rows={4} />
          </Field>
        </div>
      </Section>

      <Section title="Глава 4. Верификация и уровень риска (заполняется офицером)">
        <Field label="Верификация">
          <Select value={data.verification_status} onChange={set('verification_status')} options={[
            { value: '', label: 'Не указано' },
            { value: 'conducted', label: 'Проведена' },
            { value: 'not_conducted', label: 'Не проведена' },
          ]} />
        </Field>
        <Field label="Дата верификации"><Input type="date" value={data.verification_date?.split('T')[0]} onChange={set('verification_date')} /></Field>
        <Field label="Результат санкционной проверки">
          <Select value={data.sanctions_check_result} onChange={set('sanctions_check_result')} options={[
            { value: '', label: 'Не проверялся' },
            { value: 'clear', label: 'Отсутствует в санкционных перечнях' },
            { value: 'match', label: 'Присутствует в санкционных перечнях' },
          ]} />
        </Field>
        <Field label="Дата санкционной проверки"><Input type="date" value={data.sanctions_check_date?.split('T')[0]} onChange={set('sanctions_check_date')} /></Field>
        <Field label="Дата очередного обновления"><Input type="date" value={data.next_update_date?.split('T')[0]} onChange={set('next_update_date')} /></Field>
        <Field label="Ответственный сотрудник"><Input value={data.db_entry_officer} onChange={set('db_entry_officer')} /></Field>
        <div className="md:col-span-2">
          <Field label="Обоснование уровня риска"><Textarea value={data.risk_justification} onChange={set('risk_justification')} /></Field>
        </div>
      </Section>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-6 py-3 rounded-lg text-sm uppercase tracking-wider transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  )
}

// ─── Вкладка документов ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  missing:   'Отсутствует',
  requested: 'Запрошен',
  present:   'Получен',
  expired:   'Просрочен',
}

const STATUS_COLORS: Record<string, string> = {
  missing:   'text-[#6b7280]',
  requested: 'text-blue-400',
  present:   'text-green-400',
  expired:   'text-red-400',
}

function daysLabel(expires_at?: string): string | null {
  if (!expires_at) return null
  const days = Math.round((new Date(expires_at).getTime() - Date.now()) / 86_400_000)
  if (days < 0)   return `просрочен ${Math.abs(days)} дн.`
  if (days === 0) return 'истекает сегодня!'
  if (days <= 30) return `${days} дн.`
  return null
}

function DocumentsTab({ clientType, clientId }: { clientType: string; clientId: number }) {
  const [docs, setDocs] = useState<any[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/documents/client/${clientId}`).then(r => setDocs(r.data)).catch(console.error)
  }, [clientId])

  const updateField = (docType: string, field: string, value: string) => {
    setDocs(prev => prev.map(d =>
      d.document_type === docType ? { ...d, [field]: value } : d
    ))
  }

  const save = async (doc: any) => {
    setSaving(doc.document_type)
    try {
      const payload: any = {
        document_type: doc.document_type,
        status: doc.status,
        issued_at: doc.issued_at || null,
        expires_at: doc.expires_at || null,
        received_at: doc.received_at || null,
        notes: doc.notes || null,
      }
      const res = await api.post(`/documents/client/${clientId}/upsert`, payload)
      setDocs(prev => prev.map(d =>
        d.document_type === doc.document_type ? { ...d, ...res.data } : d
      ))
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(null)
    }
  }

  const present = docs.filter(d => d.status === 'present').length
  const total   = docs.length

  return (
    <div className="space-y-3">
      {/* Прогресс */}
      <div className="bg-[#111520] border border-[#1e2535] rounded-xl p-4">
        <div className="flex justify-between text-xs text-[#6b7280] mb-2">
          <span>Комплектность КYC-пакета</span>
          <span className="text-[#d4a843] font-semibold">{present} / {total}</span>
        </div>
        <div className="h-2 bg-[#1e2535] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#d4a843] rounded-full transition-all duration-500"
            style={{ width: total > 0 ? `${(present / total) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Список документов */}
      {docs.map(doc => {
        const isOpen = expanded === doc.document_type
        const dl = daysLabel(doc.expires_at)
        return (
          <div
            key={doc.document_type}
            className={clsx(
              'border rounded-xl overflow-hidden transition-colors',
              doc.status === 'expired' ? 'border-red-500/30 bg-red-500/5'
              : doc.status === 'present' ? 'border-green-500/20 bg-[#0d1017]'
              : doc.status === 'requested' ? 'border-blue-500/20 bg-[#0d1017]'
              : 'border-[#1e2535] bg-[#0d1017]'
            )}
          >
            {/* Заголовок строки */}
            <button
              onClick={() => setExpanded(isOpen ? null : doc.document_type)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#111520] transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <span className={clsx('w-2 h-2 rounded-full shrink-0', {
                  'bg-green-400': doc.status === 'present',
                  'bg-blue-400':  doc.status === 'requested',
                  'bg-red-400':   doc.status === 'expired',
                  'bg-[#374151]': doc.status === 'missing',
                })} />
                <span className="text-sm text-white">{doc.label}</span>
                {dl && (
                  <span className="text-[10px] text-orange-400 font-medium">{dl}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={clsx('text-xs font-medium', STATUS_COLORS[doc.status])}>
                  {STATUS_LABELS[doc.status]}
                </span>
                {isOpen
                  ? <ChevronUp className="w-3.5 h-3.5 text-[#4b5563]" />
                  : <ChevronDown className="w-3.5 h-3.5 text-[#4b5563]" />
                }
              </div>
            </button>

            {/* Детали (раскрытые) */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-[#1e2535]">
                {/* Статус */}
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div>
                    <label className="block text-[10px] text-[#6b7280] mb-1 uppercase tracking-wider">Статус</label>
                    <select
                      value={doc.status}
                      onChange={e => updateField(doc.document_type, 'status', e.target.value)}
                      className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#6b7280] mb-1 uppercase tracking-wider">Дата получения</label>
                    <input
                      type="date"
                      value={doc.received_at ? doc.received_at.split('T')[0] : ''}
                      onChange={e => updateField(doc.document_type, 'received_at', e.target.value)}
                      className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                    />
                  </div>
                </div>

                {doc.has_expiry && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-[#6b7280] mb-1 uppercase tracking-wider">Дата выдачи</label>
                      <input
                        type="date"
                        value={doc.issued_at ? doc.issued_at.split('T')[0] : ''}
                        onChange={e => updateField(doc.document_type, 'issued_at', e.target.value)}
                        className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#6b7280] mb-1 uppercase tracking-wider">
                        Действителен до
                        {dl && <span className="ml-1 text-orange-400 normal-case">{dl}</span>}
                      </label>
                      <input
                        type="date"
                        value={doc.expires_at ? doc.expires_at.split('T')[0] : ''}
                        onChange={e => updateField(doc.document_type, 'expires_at', e.target.value)}
                        className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] text-[#6b7280] mb-1 uppercase tracking-wider">Примечания</label>
                  <input
                    value={doc.notes || ''}
                    onChange={e => updateField(doc.document_type, 'notes', e.target.value)}
                    placeholder="Номер документа, примечания..."
                    className="w-full bg-[#0a0d14] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
                  />
                </div>

                <button
                  onClick={() => save(doc)}
                  disabled={saving === doc.document_type}
                  className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving === doc.document_type ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Главная карточка ─────────────────────────────────────────────────────────

const TABS = [
  { key: 'main', label: 'Анкета', icon: FileText },
  { key: 'docs', label: 'Документы', icon: FileText },
  { key: 'risk', label: 'Риск-скоринг', icon: FileText },
]

export default function ClientCard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [formData, setFormData] = useState<any>({})
  const [activeTab, setActiveTab] = useState('main')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusChanging, setStatusChanging] = useState(false)

  useEffect(() => {
    loadClient()
  }, [id])

  const loadClient = async () => {
    try {
      const { data } = await clientsApi.get(Number(id))
      setClient(data)
      setFormData(data.individual || data.legal_entity || {})
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (client.client_type === 'individual') {
        await clientsApi.updateIndividual(Number(id), formData)
      } else {
        await clientsApi.updateLegal(Number(id), formData)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await loadClient()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setStatusChanging(true)
    try {
      await clientsApi.updateStatus(Number(id), newStatus)
      await loadClient()
    } finally {
      setStatusChanging(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-[#4b5563]">Загрузка...</div>
  }

  if (!client) {
    return <div className="flex items-center justify-center h-full text-[#4b5563]">Клиент не найден</div>
  }

  const displayName = client.client_type === 'individual'
    ? [formData.last_name, formData.first_name, formData.middle_name].filter(Boolean).join(' ') || 'Новый клиент'
    : formData.full_name || 'Новое юридическое лицо'

  const currentStatus = ONBOARDING_STATUSES.find(s => s.value === client.onboarding_status)

  return (
    <div className="flex flex-col h-full">
      {/* Шапка */}
      <div className="border-b border-[#1e2535] bg-[#0d1017] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/clients')} className="text-[#4b5563] hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {client.client_type === 'individual'
                ? <User className="w-5 h-5 text-[#d4a843]" />
                : <Building2 className="w-5 h-5 text-[#d4a843]" />
              }
              <div>
                <h1 className="text-base font-bold text-white">{displayName}</h1>
                <p className="text-xs text-[#6b7280]">
                  {client.contract_number && `Договор ${client.contract_number} · `}
                  {client.client_type === 'individual' ? 'Физическое лицо' : 'Юридическое лицо'}
                </p>
              </div>
            </div>
          </div>

          {/* Статус и риск */}
          <div className="flex items-center gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Сохранено
              </div>
            )}
            <select
              value={client.onboarding_status}
              onChange={e => handleStatusChange(e.target.value)}
              disabled={statusChanging}
              className="bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
            >
              {ONBOARDING_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Вкладки */}
        <div className="flex gap-1 mt-4">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-[#d4a843]/10 text-[#d4a843] border border-[#d4a843]/20'
                  : 'text-[#6b7280] hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Содержимое */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'main' && (
          client.client_type === 'individual'
            ? <IndividualForm data={formData} onChange={setFormData} onSave={handleSave} saving={saving} />
            : <LegalForm data={formData} onChange={setFormData} onSave={handleSave} saving={saving} />
        )}
        {activeTab === 'docs' && (
          <DocumentsTab clientType={client.client_type} clientId={Number(id)} />
        )}
        {activeTab === 'risk' && (
          <RiskScoring clientId={Number(id)} clientType={client.client_type} />
        )}
      </div>
    </div>
  )
}
