import { useState, useEffect } from 'react'
import { fmtDate, fmtDateTime, toDateInput } from '../utils/dates'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Building2, FileText, Shield,
  Users, ChevronDown, ChevronUp, Save, AlertCircle,
  CheckCircle2, Clock, XCircle, PauseCircle, RefreshCw,
  Search, AlertTriangle, ShieldCheck, ShieldAlert, History,
  Plus, Trash2, Edit2, X, Upload, Download, Paperclip
} from 'lucide-react'
import { clientsApi } from '../api/clients'
import api from '../api/client'
import clsx from 'clsx'
import RiskScoring from '../components/RiskScoring'
import ClientUBOsTab from '../components/ClientUBOsTab'
import { toast } from '../components/Toast'

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
  { value: 'critical', label: 'Неприемлемый' },
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
      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] disabled:opacity-50"
    />
  )
}

function Select({ value, onChange, options, disabled }: any) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 disabled:opacity-50"
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
      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
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
        <Field label="Дата рождения"><Input type="date" value={toDateInput(data.date_of_birth)} min="1900-01-01" max="2100-12-31" onChange={set('date_of_birth')} /></Field>
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
        <Field label="Дата выдачи"><Input type="date" value={toDateInput(data.doc_issued_at)} min="1900-01-01" max="2100-12-31" onChange={set('doc_issued_at')} /></Field>
        <Field label="Дата окончания"><Input type="date" value={toDateInput(data.doc_expires_at)} min="1900-01-01" max="2100-12-31" onChange={set('doc_expires_at')} /></Field>
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
        <Field label="Дата начала действия"><Input type="date" value={toDateInput(data.foreign_doc_valid_from)} min="1900-01-01" max="2100-12-31" onChange={set('foreign_doc_valid_from')} /></Field>
        <Field label="Дата окончания действия"><Input type="date" value={toDateInput(data.foreign_doc_valid_to)} min="1900-01-01" max="2100-12-31" onChange={set('foreign_doc_valid_to')} /></Field>
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
          <Field label="ИНН ИП"><Input value={data.ie_inn} onChange={set('ie_inn')} placeholder="12345678901234" /></Field>
          <Field label="Дата регистрации ИП"><Input type="date" value={toDateInput(data.ie_registration_date)} min="1900-01-01" max="2100-12-31" onChange={set('ie_registration_date')} /></Field>
          <Field label="Регистрационный номер"><Input value={data.ie_registration_number} onChange={set('ie_registration_number')} /></Field>
          <Field label="Регистрирующий орган"><Input value={data.ie_registration_authority} onChange={set('ie_registration_authority')} /></Field>
          <Field label="Место регистрации"><Input value={data.ie_registration_place} onChange={set('ie_registration_place')} /></Field>
          <div className="md:col-span-2">
            <Field label="Виды деятельности"><Textarea value={data.ie_activities} onChange={set('ie_activities')} /></Field>
          </div>
          <Field label="Вид патента/лицензии"><Input value={data.ie_patent_type} onChange={set('ie_patent_type')} /></Field>
          <Field label="Номер патента/лицензии"><Input value={data.ie_patent_number} onChange={set('ie_patent_number')} /></Field>
          <Field label="Дата выдачи патента/лицензии"><Input type="date" value={toDateInput(data.ie_patent_issued_at)} min="1900-01-01" max="2100-12-31" onChange={set('ie_patent_issued_at')} /></Field>
          <Field label="Кем выдан патент/лицензия"><Input value={data.ie_patent_issued_by} onChange={set('ie_patent_issued_by')} /></Field>
          <Field label="Дата окончания патента/лицензии"><Input type="date" value={toDateInput(data.ie_patent_expires_at)} min="1900-01-01" max="2100-12-31" onChange={set('ie_patent_expires_at')} /></Field>
        </Section>
      )}

      {/* Банковский счёт (поля 35–39) */}
      <Section title="Информация о банковском счёте" defaultOpen={false}>
        <Field label="Счёт получателя"><Input value={data.bank1_account} onChange={set('bank1_account')} placeholder="1234567890" /></Field>
        <Field label="Наименование и место нахождения банка"><Input value={data.bank1_name} onChange={set('bank1_name')} placeholder="ОАО «Банк»" /></Field>
        <Field label="Фактический адрес банка"><Input value={data.bank1_location} onChange={set('bank1_location')} /></Field>
        <Field label="ИНН банка"><Input value={data.bank1_inn} onChange={set('bank1_inn')} /></Field>
        <Field label="Корреспондентский счёт банка"><Input value={data.bank1_corr_account} onChange={set('bank1_corr_account')} /></Field>
        <Field label="БИК / SWIFT"><Input value={data.bank1_bic_swift} onChange={set('bank1_bic_swift')} placeholder="044525225 / SABRRUMM" /></Field>
      </Section>

      {/* Глава 3. Верификация */}
      <Section title="Глава 3. Верификация и уровень риска (заполняется офицером)">
        <Field label="Верификация проведена">
          <Select value={data.verification_status} onChange={set('verification_status')} options={[
            { value: '', label: 'Не указано' },
            { value: 'conducted', label: 'Проведена' },
            { value: 'not_conducted', label: 'Не проведена' },
          ]} />
        </Field>
        <Field label="Дата верификации"><Input type="date" value={toDateInput(data.verification_date)} min="1900-01-01" max="2100-12-31" onChange={set('verification_date')} /></Field>
        <Field label="Результат санкционной проверки">
          <Select value={data.sanctions_check_result} onChange={set('sanctions_check_result')} options={[
            { value: '', label: 'Не проверялся' },
            { value: 'clear', label: 'Отсутствует в санкционных перечнях' },
            { value: 'match', label: 'Присутствует в санкционных перечнях' },
          ]} />
        </Field>
        <Field label="Дата санкционной проверки"><Input type="date" value={toDateInput(data.sanctions_check_date)} min="1900-01-01" max="2100-12-31" onChange={set('sanctions_check_date')} /></Field>
        <Field label="Результат проверки по перечню осуждённых">
          <Select value={data.criminal_list_check_result} onChange={set('criminal_list_check_result')} options={[
            { value: '', label: 'Не проверялся' },
            { value: 'clear', label: 'Отсутствует' },
            { value: 'match', label: 'Присутствует' },
          ]} />
        </Field>
        <Field label="Дата проверки по перечню"><Input type="date" value={toDateInput(data.criminal_list_check_date)} min="1900-01-01" max="2100-12-31" onChange={set('criminal_list_check_date')} /></Field>
        <Field label="Дата очередного обновления"><Input type="date" value={toDateInput(data.next_update_date)} min="1900-01-01" max="2100-12-31" onChange={set('next_update_date')} /></Field>
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
        <Field label="LEI (Legal Entity Identifier)"><Input value={data.lei} onChange={set('lei')} placeholder="Если имеется" /></Field>
        <Field label="Дата государственной регистрации"><Input type="date" value={toDateInput(data.reg_date)} min="1900-01-01" max="2100-12-31" onChange={set('reg_date')} /></Field>
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
        {/* Поля 21–24: органы управления */}
        <Field label="21. Наименование органа управления">
          <Input value={data.governing_body_name} onChange={set('governing_body_name')} placeholder="Единоличный исполнительный орган – Директор" />
        </Field>
        <Field label="25. Уставной капитал (зарегистрированный и оплаченный)">
          <Input value={data.authorized_capital} onChange={set('authorized_capital')} placeholder="10 000 сом" />
        </Field>
        <div className="md:col-span-2">
          <Field label="22. ФИО членов органа управления">
            <Textarea value={data.governing_body_members} onChange={set('governing_body_members')} rows={2} placeholder="Иванов Иван Иванович" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="23. Должностные лица с правом подписи (доверенные лица)">
            <Textarea value={data.authorized_signatories} onChange={set('authorized_signatories')} rows={2} placeholder="Петров Пётр Петрович" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="24. Документы, подтверждающие полномочия (решение, устав, доверенность)">
            <Textarea value={data.authority_doc_details} onChange={set('authority_doc_details')} rows={3} placeholder="1) Иванов И.И. — Решение от 30.12.2023, Устав&#10;2) Петров П.П. — Доверенность №1 от 01.01.2024" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="27. Филиалы и представительства">
            <Textarea value={data.branches_info} onChange={set('branches_info')} placeholder="Нет / перечислить если есть" />
          </Field>
        </div>
        <div className="md:col-span-2 space-y-3">
          <Checkbox label="26. Присутствует по местонахождению на территории КР" checked={data.has_local_presence} onChange={set('has_local_presence')} />
          <Checkbox label="28. Имеется бенефициарный владелец" checked={data.has_ubo} onChange={set('has_ubo')} />
          <Checkbox label="29. Имеется ПДЛ в структуре собственности/управления" checked={data.has_pdl_in_structure} onChange={set('has_pdl_in_structure')} />
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
        <Field label="Дата выдачи лицензии"><Input type="date" value={toDateInput(data.license_issued_at)} min="1900-01-01" max="2100-12-31" onChange={set('license_issued_at')} /></Field>
        <Field label="Лицензия выдана"><Input value={data.license_issued_by} onChange={set('license_issued_by')} /></Field>
        <Field label="Срок действия лицензии"><Input type="date" value={toDateInput(data.license_expires_at)} min="1900-01-01" max="2100-12-31" onChange={set('license_expires_at')} /></Field>
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

      {/* Банковские счета (поля 38–47) */}
      <Section title="Информация о банковских счетах" defaultOpen={false}>
        <div className="md:col-span-2">
          <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-3">Счёт № 1</p>
        </div>
        <Field label="Счёт получателя"><Input value={data.bank1_account} onChange={set('bank1_account')} placeholder="1234567890" /></Field>
        <Field label="ИНН банка"><Input value={data.bank1_inn} onChange={set('bank1_inn')} /></Field>
        <div className="md:col-span-2">
          <Field label="Наименование и место нахождения банка"><Input value={data.bank1_name} onChange={set('bank1_name')} placeholder="ОАО «Банк», г. Бишкек" /></Field>
        </div>
        <Field label="Корреспондентский счёт"><Input value={data.bank1_corr_account} onChange={set('bank1_corr_account')} /></Field>
        <Field label="БИК / SWIFT"><Input value={data.bank1_bic_swift} onChange={set('bank1_bic_swift')} /></Field>

        <div className="md:col-span-2 border-t border-[#1e2535] pt-3">
          <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-3">Счёт № 2 (при наличии)</p>
        </div>
        <Field label="Счёт получателя"><Input value={data.bank2_account} onChange={set('bank2_account')} /></Field>
        <Field label="ИНН банка"><Input value={data.bank2_inn} onChange={set('bank2_inn')} /></Field>
        <div className="md:col-span-2">
          <Field label="Наименование и место нахождения банка"><Input value={data.bank2_name} onChange={set('bank2_name')} /></Field>
        </div>
        <Field label="Корреспондентский счёт"><Input value={data.bank2_corr_account} onChange={set('bank2_corr_account')} /></Field>
        <Field label="БИК / SWIFT"><Input value={data.bank2_bic_swift} onChange={set('bank2_bic_swift')} /></Field>
      </Section>

      <Section title="Глава 4. Верификация и уровень риска (заполняется офицером)">
        <Field label="Верификация">
          <Select value={data.verification_status} onChange={set('verification_status')} options={[
            { value: '', label: 'Не указано' },
            { value: 'conducted', label: 'Проведена' },
            { value: 'not_conducted', label: 'Не проведена' },
          ]} />
        </Field>
        <Field label="Дата верификации"><Input type="date" value={toDateInput(data.verification_date)} min="1900-01-01" max="2100-12-31" onChange={set('verification_date')} /></Field>
        <Field label="Результат санкционной проверки">
          <Select value={data.sanctions_check_result} onChange={set('sanctions_check_result')} options={[
            { value: '', label: 'Не проверялся' },
            { value: 'clear', label: 'Отсутствует в санкционных перечнях' },
            { value: 'match', label: 'Присутствует в санкционных перечнях' },
          ]} />
        </Field>
        <Field label="Дата санкционной проверки"><Input type="date" value={toDateInput(data.sanctions_check_date)} min="1900-01-01" max="2100-12-31" onChange={set('sanctions_check_date')} /></Field>
        <Field label="Дата очередного обновления"><Input type="date" value={toDateInput(data.next_update_date)} min="1900-01-01" max="2100-12-31" onChange={set('next_update_date')} /></Field>
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

// ─── Форма персоны (директор / доверитель-ФЛ) ────────────────────────────────

function PersonForm({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const set = (field: string) => (value: any) => onChange({ ...data, [field]: value })
  return (
    <div className="space-y-4">
      <Section title="Идентификационные сведения">
        <Field label="Статус">
          <Select value={data.is_resident ? 'resident' : 'non_resident'} onChange={(v: string) => set('is_resident')(v === 'resident')} options={[
            { value: 'resident', label: 'Резидент' },
            { value: 'non_resident', label: 'Нерезидент' },
          ]} />
        </Field>
        <Field label="Фамилия" required><Input value={data.last_name} onChange={set('last_name')} placeholder="Иванов" /></Field>
        <Field label="Имя" required><Input value={data.first_name} onChange={set('first_name')} placeholder="Иван" /></Field>
        <Field label="Отчество"><Input value={data.middle_name} onChange={set('middle_name')} placeholder="Иванович" /></Field>
        <Field label="Дата рождения"><Input type="date" value={toDateInput(data.date_of_birth)} min="1900-01-01" max="2100-12-31" onChange={set('date_of_birth')} /></Field>
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
        <Field label="ПИН / ИНН"><Input value={data.pin} onChange={set('pin')} /></Field>
      </Section>

      <Section title="Документ, удостоверяющий личность">
        <Field label="Вид документа"><Input value={data.doc_type} onChange={set('doc_type')} placeholder="Паспорт / ID-карта" /></Field>
        <Field label="Серия и номер"><Input value={data.doc_series_number} onChange={set('doc_series_number')} /></Field>
        <Field label="Дата выдачи"><Input type="date" value={toDateInput(data.doc_issued_at)} min="1900-01-01" max="2100-12-31" onChange={set('doc_issued_at')} /></Field>
        <Field label="Дата окончания"><Input type="date" value={toDateInput(data.doc_expires_at)} min="1900-01-01" max="2100-12-31" onChange={set('doc_expires_at')} /></Field>
        <Field label="Кем выдан"><Input value={data.doc_issued_by} onChange={set('doc_issued_by')} /></Field>
        <Field label="Код подразделения"><Input value={data.doc_division_code} onChange={set('doc_division_code')} /></Field>
      </Section>

      <Section title="Адреса и контакты">
        <div className="md:col-span-2">
          <Field label="Адрес регистрации"><Textarea value={data.registration_address} onChange={set('registration_address')} /></Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Адрес фактического проживания"><Textarea value={data.actual_address} onChange={set('actual_address')} /></Field>
        </div>
        <Field label="Телефон мобильный"><Input value={data.phone_mobile} onChange={set('phone_mobile')} placeholder="+996 700 000000" /></Field>
        <Field label="Телефон рабочий"><Input value={data.phone_work} onChange={set('phone_work')} /></Field>
        <Field label="Email"><Input type="email" value={data.email} onChange={set('email')} /></Field>
      </Section>

      <Section title="Для иностранных граждан" defaultOpen={false}>
        <Field label="Тип документа на пребывание">
          <Select value={data.foreign_doc_type} onChange={set('foreign_doc_type')} options={[
            { value: '', label: 'Не применимо' },
            { value: 'residence_permit', label: 'Вид на жительство' },
            { value: 'temp_residence', label: 'Разрешение на временное проживание' },
            { value: 'visa', label: 'Виза' },
          ]} />
        </Field>
        <Field label="Серия и номер"><Input value={data.foreign_doc_series_number} onChange={set('foreign_doc_series_number')} /></Field>
        <Field label="Дата начала действия"><Input type="date" value={toDateInput(data.foreign_doc_valid_from)} min="1900-01-01" max="2100-12-31" onChange={set('foreign_doc_valid_from')} /></Field>
        <Field label="Дата окончания действия"><Input type="date" value={toDateInput(data.foreign_doc_valid_to)} min="1900-01-01" max="2100-12-31" onChange={set('foreign_doc_valid_to')} /></Field>
      </Section>
    </div>
  )
}

// ─── Вкладка директоров ───────────────────────────────────────────────────────

function DirectorsTab({ clientId }: { clientId: number }) {
  const [directors, setDirectors] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)   // null = закрыто, {} = новый, {...} = редактирование
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [clientId])

  const load = () =>
    clientsApi.listDirectors(clientId).then(r => setDirectors(r.data))

  const openNew = () => setEditing({ is_resident: true, position: 'Директор' })
  const openEdit = (d: any) => setEditing({ ...d })
  const close = () => setEditing(null)

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.id) {
        await clientsApi.updateDirector(clientId, editing.id, editing)
      } else {
        await clientsApi.createDirector(clientId, editing)
      }
      await load()
      close()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Удалить директора?')) return
    await clientsApi.deleteDirector(clientId, id)
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">Члены исполнительного органа управления</p>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить директора
        </button>
      </div>

      {directors.length === 0 && (
        <div className="bg-[#111520] border border-[#1e2535] rounded-xl py-12 text-center text-sm text-[#4b5563]">
          Директора не добавлены
        </div>
      )}

      {directors.map(d => (
        <div key={d.id} className="bg-[#111520] border border-[#1e2535] rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">
              {[d.last_name, d.first_name, d.middle_name].filter(Boolean).join(' ') || '—'}
            </p>
            <p className="text-xs text-[#6b7280] mt-0.5">
              {d.position || 'Директор'} · {d.citizenship || '—'} · {d.is_resident ? 'Резидент' : 'Нерезидент'}
              {d.is_pep && <span className="ml-2 text-orange-400">ПДЛ</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openEdit(d)} className="p-1.5 text-[#4b5563] hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => remove(d.id)} className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}

      {/* Модальное окно */}
      {editing !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
              <h2 className="text-base font-bold text-white">{editing.id ? 'Редактировать директора' : 'Новый директор'}</h2>
              <button onClick={close} className="text-[#4b5563] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Должность</label>
                <input value={editing.position || ''} onChange={e => setEditing((p: any) => ({ ...p, position: e.target.value }))}
                  placeholder="Директор / Генеральный директор / Председатель правления"
                  className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
              </div>
              <PersonForm data={editing} onChange={setEditing} />
              <div className="border-t border-[#1e2535] pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!editing.is_pep} onChange={e => setEditing((p: any) => ({ ...p, is_pep: e.target.checked }))} className="w-4 h-4 accent-[#d4a843]" />
                  <span className="text-sm text-[#9ca3af]">Является публичным должностным лицом (ПДЛ)</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-[#1e2535]">
              <button onClick={close} className="flex-1 py-2.5 rounded-lg border border-[#1e2535] text-[#6b7280] hover:text-white text-sm">Отмена</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold text-sm uppercase tracking-wider">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Вкладка доверительных лиц ────────────────────────────────────────────────

const AUTHORITY_TYPES = [
  { value: 'power_of_attorney', label: 'Доверенность' },
  { value: 'trust_management', label: 'Доверительное управление' },
  { value: 'other', label: 'Иное' },
]

function RepresentativesTab({ clientId }: { clientId: number }) {
  const [reps, setReps] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [clientId])

  const load = () =>
    clientsApi.listRepresentatives(clientId).then(r => setReps(r.data))

  const openNew = () => setEditing({ is_legal_entity: false, authority_type: 'trust_management', is_resident: true })
  const openEdit = (r: any) => setEditing({ ...r })
  const close = () => setEditing(null)

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.id) {
        await clientsApi.updateRepresentative(clientId, editing.id, editing)
      } else {
        await clientsApi.createRepresentative(clientId, editing)
      }
      await load()
      close()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Удалить доверительное лицо?')) return
    await clientsApi.deleteRepresentative(clientId, id)
    await load()
  }

  const repName = (r: any) => r.is_legal_entity
    ? r.company_name || '—'
    : [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(' ') || '—'

  const repType = (r: any) => AUTHORITY_TYPES.find(t => t.value === r.authority_type)?.label || r.authority_type

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">Лица, действующие по доверенности или доверительному управлению</p>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {reps.length === 0 && (
        <div className="bg-[#111520] border border-[#1e2535] rounded-xl py-12 text-center text-sm text-[#4b5563]">
          Доверительные лица не добавлены
        </div>
      )}

      {reps.map(r => (
        <div key={r.id} className="bg-[#111520] border border-[#1e2535] rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e2535] text-[#9ca3af]">
                {r.is_legal_entity ? 'ЮЛ' : 'ФЛ'}
              </span>
              <p className="text-sm font-medium text-white">{repName(r)}</p>
            </div>
            <p className="text-xs text-[#6b7280] mt-0.5">
              {repType(r)}
              {r.authority_doc_number && ` · Дов. №${r.authority_doc_number}`}
              {r.authority_doc_expires_at && ` · до ${fmtDate(r.authority_doc_expires_at)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openEdit(r)} className="p-1.5 text-[#4b5563] hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => remove(r.id)} className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}

      {editing !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2535]">
              <h2 className="text-base font-bold text-white">{editing.id ? 'Редактировать' : 'Новое доверительное лицо'}</h2>
              <button onClick={close} className="text-[#4b5563] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Тип доверителя и основание */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Тип лица</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ v: false, l: 'Физическое лицо' }, { v: true, l: 'Юридическое лицо' }].map(({ v, l }) => (
                      <button key={String(v)} onClick={() => setEditing((p: any) => ({ ...p, is_legal_entity: v }))}
                        className={clsx('py-2 text-xs rounded-lg border transition-colors', editing.is_legal_entity === v
                          ? 'border-[#d4a843] bg-[#d4a843]/10 text-[#d4a843]'
                          : 'border-[#1e2535] text-[#6b7280] hover:text-white')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Основание полномочий</label>
                  <select value={editing.authority_type || ''} onChange={e => setEditing((p: any) => ({ ...p, authority_type: e.target.value }))}
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50">
                    {AUTHORITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Данные ЮЛ или ФЛ */}
              {editing.is_legal_entity ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#6b7280] uppercase tracking-wider">Реквизиты организации</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-[#6b7280] mb-1.5">Полное наименование</label>
                      <input value={editing.company_name || ''} onChange={e => setEditing((p: any) => ({ ...p, company_name: e.target.value }))}
                        className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
                    </div>
                    {[
                      { field: 'company_inn', label: 'ИНН / КИО' },
                      { field: 'company_legal_form', label: 'ОПФ (ОсОО / АО / ...)' },
                      { field: 'company_reg_number', label: 'Рег. номер' },
                    ].map(({ field, label }) => (
                      <div key={field}>
                        <label className="block text-xs text-[#6b7280] mb-1.5">{label}</label>
                        <input value={editing[field] || ''} onChange={e => setEditing((p: any) => ({ ...p, [field]: e.target.value }))}
                          className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <PersonForm data={editing} onChange={setEditing} />
              )}

              {/* Реквизиты документа полномочий */}
              <div className="border-t border-[#1e2535] pt-4">
                <p className="text-xs text-[#6b7280] uppercase tracking-wider mb-3">Документ, подтверждающий полномочия</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#6b7280] mb-1.5">Номер документа</label>
                    <input value={editing.authority_doc_number || ''} onChange={e => setEditing((p: any) => ({ ...p, authority_doc_number: e.target.value }))}
                      placeholder="№ доверенности / договора"
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b7280] mb-1.5">Нотариус</label>
                    <input value={editing.authority_doc_notary || ''} onChange={e => setEditing((p: any) => ({ ...p, authority_doc_notary: e.target.value }))}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b7280] mb-1.5">Дата выдачи</label>
                    <input type="date" value={toDateInput(editing.authority_doc_date)} min="1900-01-01" max="2100-12-31"
                      onChange={e => setEditing((p: any) => ({ ...p, authority_doc_date: e.target.value }))}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b7280] mb-1.5">Срок действия</label>
                    <input type="date" value={toDateInput(editing.authority_doc_expires_at)} min="1900-01-01" max="2100-12-31"
                      onChange={e => setEditing((p: any) => ({ ...p, authority_doc_expires_at: e.target.value }))}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-[#6b7280] mb-1.5">Объём полномочий</label>
                    <textarea value={editing.authority_scope || ''} onChange={e => setEditing((p: any) => ({ ...p, authority_scope: e.target.value }))} rows={2}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50 resize-none" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-[#1e2535]">
              <button onClick={close} className="flex-1 py-2.5 rounded-lg border border-[#1e2535] text-[#6b7280] hover:text-white text-sm">Отмена</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold text-sm uppercase tracking-wider">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
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

// ─── Анкета ПДЛ ──────────────────────────────────────────────────────────────

const RELATION_TYPES = ['супруг (супруга)', 'дети (в т.ч. усыновлённые)']
const ASSOCIATE_TYPES = ['близкие родственники', 'деловые партнёры (совместная собственность)', 'официальные представители']
const GENDER_OPTS = [{ value: '', label: '—' }, { value: 'male', label: 'Мужской' }, { value: 'female', label: 'Женский' }]

const EMPTY_PERSON = { last_name: '', first_name: '', middle_name: '', gender: '', date_of_birth: '', pin: '', citizenship: '' }

function PersonRowForm({ value, onChange, onRemove, relationField, relationOptions }: any) {
  const set = (k: string) => (e: any) => onChange({ ...value, [k]: e.target.value })
  const inp = 'w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#d4a843]/50'
  return (
    <div className="border border-[#1e2535] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-3">
          <label className="block text-xs text-[#6b7280] mb-1">Степень {relationField === 'relation' ? 'родства' : 'связанности'}</label>
          <select value={value.relation || value.relation_type || ''} onChange={e => onChange({ ...value, [relationField]: e.target.value })} className={inp}>
            <option value="">— выбрать —</option>
            {relationOptions.map((r: string) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={onRemove} className="mt-4 p-1.5 text-[#4b5563] hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
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

function PEPQuestionnaireTab({ clientId, individual }: { clientId: number; individual: any }) {
  const [q, setQ] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get(`/clients/${clientId}/pep-questionnaire`).then(r => setQ(r.data)).catch(console.error)
  }, [clientId])

  if (!q) return <div className="text-[#4b5563] text-sm p-6">Загрузка...</div>

  const set = (k: string) => (v: any) => setQ((prev: any) => ({ ...prev, [k]: v }))

  const addFamily = () => setQ((p: any) => ({ ...p, family_members: [...(p.family_members || []), { ...EMPTY_PERSON, relation: '' }] }))
  const updFamily = (i: number, v: any) => setQ((p: any) => { const a = [...p.family_members]; a[i] = v; return { ...p, family_members: a } })
  const delFamily = (i: number) => setQ((p: any) => ({ ...p, family_members: p.family_members.filter((_: any, j: number) => j !== i) }))

  const addAssoc = () => setQ((p: any) => ({ ...p, close_associates: [...(p.close_associates || []), { ...EMPTY_PERSON, relation_type: '' }] }))
  const updAssoc = (i: number, v: any) => setQ((p: any) => { const a = [...p.close_associates]; a[i] = v; return { ...p, close_associates: a } })
  const delAssoc = (i: number) => setQ((p: any) => ({ ...p, close_associates: p.close_associates.filter((_: any, j: number) => j !== i) }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch(`/clients/${clientId}/pep-questionnaire`, q)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      toast('Анкета ПДЛ сохранена')
    } catch { toast('Ошибка сохранения', false) }
    finally { setSaving(false) }
  }

  const inp = 'w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#d4a843]/50'
  const ta = inp + ' resize-none'
  const ro = 'w-full bg-[#111827] border border-[#2d3748] rounded-lg px-3 py-2.5 text-[#9ca3af] text-sm cursor-default select-none'

  function SepH({ title }: { title: string }) {
    return (
      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-semibold text-[#d4a843] uppercase tracking-wider">{title}</span>
        <div className="flex-1 border-t border-[#1e2535]" />
      </div>
    )
  }

  const fullName = [individual?.last_name, individual?.first_name, individual?.middle_name].filter(Boolean).join(' ')

  return (
    <div className="space-y-4">
      {/* Вид анкеты */}
      <div className="flex items-center gap-4 p-4 bg-[#0d1017] border border-[#1e2535] rounded-xl">
        <span className="text-sm text-[#6b7280]">Вид анкеты:</span>
        {[{ v: true, l: 'Первичная' }, { v: false, l: 'Обновлённая' }].map(({ v, l }) => (
          <label key={l} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="is_primary" checked={q.is_primary === v} onChange={() => set('is_primary')(v)} className="accent-[#d4a843]" />
            <span className="text-sm text-white">{l}</span>
          </label>
        ))}
      </div>

      {/* Глава 1 — из анкеты ФЛ (только чтение) */}
      <Section title="Глава 1. Идентификационные сведения (из анкеты ФЛ)" defaultOpen={true}>
        {[
          ['Статус', individual?.is_resident ? 'Резидент' : 'Нерезидент'],
          ['ФИО', fullName],
          ['Дата рождения', individual?.date_of_birth ? fmtDate(individual.date_of_birth) : '—'],
          ['Место рождения', individual?.place_of_birth],
          ['Национальность', individual?.nationality],
          ['Пол', individual?.gender === 'male' ? 'Мужской' : individual?.gender === 'female' ? 'Женский' : '—'],
          ['Гражданство', individual?.citizenship],
          ['Семейное положение', individual?.marital_status],
          ['Вид документа', individual?.doc_type],
          ['Серия и номер', individual?.doc_series_number],
          ['Дата выдачи', individual?.doc_issued_at ? fmtDate(individual.doc_issued_at) : '—'],
          ['Срок действия', individual?.doc_expires_at ? fmtDate(individual.doc_expires_at) : '—'],
          ['Орган выдачи', individual?.doc_issued_by],
          ['Код подразделения', individual?.doc_division_code],
          ['ПИН', individual?.pin],
          ['Номер банк. счёта', individual?.bank1_account],
          ['Адрес регистрации', individual?.registration_address],
          ['Адрес фактического проживания', individual?.actual_address],
        ].map(([label, val]) => (
          <div key={label}>
            <label className="block text-xs text-[#6b7280] uppercase tracking-wider mb-1">{label}</label>
            <div className={ro}>{val || '—'}</div>
          </div>
        ))}
      </Section>

      {/* Глава 2 — Деловой профиль */}
      <Section title="Глава 2. Сведения о деловом профиле ПДЛ" defaultOpen={true}>
        <div className="md:col-span-2"><SepH title="Занимаемая должность" /></div>
        <div className="md:col-span-2">
          <label className="block text-xs text-[#6b7280] mb-1">Наименование должности</label>
          <input value={q.position || ''} onChange={e => set('position')(e.target.value)} className={inp} />
        </div>
        <div>
          <label className="block text-xs text-[#6b7280] mb-1">Дата назначения</label>
          <input type="date" min="1900-01-01" max="2100-12-31" value={q.appointment_date ? q.appointment_date.substring(0,10) : ''} onChange={e => set('appointment_date')(e.target.value || null)} className={inp} />
        </div>
        <div>
          <label className="block text-xs text-[#6b7280] mb-1">Дата освобождения от должности</label>
          <input type="date" min="1900-01-01" max="2100-12-31" value={q.release_date ? q.release_date.substring(0,10) : ''} onChange={e => set('release_date')(e.target.value || null)} className={inp} />
        </div>
        <div className="md:col-span-2"><SepH title="Источник происхождения средств (ИПДС)" /></div>
        <div className="md:col-span-2">
          <label className="block text-xs text-[#6b7280] mb-1">Сведения об источнике происхождения денежных средств и имущества</label>
          <textarea value={q.source_of_funds || ''} onChange={e => set('source_of_funds')(e.target.value)} rows={3} className={ta} />
        </div>
        <div className="md:col-span-2"><SepH title="Письменное разрешение" /></div>
        <div className="md:col-span-2">
          <label className="block text-xs text-[#6b7280] mb-1">Сведения о письменном разрешении по принятию на обслуживание ПДЛ</label>
          <textarea value={q.approval_notes || ''} onChange={e => set('approval_notes')(e.target.value)} rows={2} className={ta} />
        </div>
      </Section>

      {/* Глава 3 — Члены семьи */}
      <div className="border border-[#1e2535] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0d1017]">
          <span className="text-sm font-semibold text-white">Глава 3. Члены семьи ПДЛ</span>
          <button onClick={addFamily} className="flex items-center gap-1.5 text-xs text-[#d4a843] hover:text-white transition-colors">
            <Plus className="w-3.5 h-3.5" />Добавить
          </button>
        </div>
        <div className="p-4 space-y-3">
          {(q.family_members || []).length === 0 && <p className="text-xs text-[#4b5563] text-center py-2">Члены семьи не добавлены</p>}
          {(q.family_members || []).map((m: any, i: number) => (
            <PersonRowForm key={i} value={m} onChange={(v: any) => updFamily(i, v)} onRemove={() => delFamily(i)} relationField="relation" relationOptions={RELATION_TYPES} />
          ))}
        </div>
      </div>

      {/* Глава 4 — Близкие лица */}
      <div className="border border-[#1e2535] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0d1017]">
          <span className="text-sm font-semibold text-white">Глава 4. Близкие лица ПДЛ</span>
          <button onClick={addAssoc} className="flex items-center gap-1.5 text-xs text-[#d4a843] hover:text-white transition-colors">
            <Plus className="w-3.5 h-3.5" />Добавить
          </button>
        </div>
        <div className="p-4 space-y-3">
          {(q.close_associates || []).length === 0 && <p className="text-xs text-[#4b5563] text-center py-2">Близкие лица не добавлены</p>}
          {(q.close_associates || []).map((m: any, i: number) => (
            <PersonRowForm key={i} value={m} onChange={(v: any) => updAssoc(i, v)} onRemove={() => delAssoc(i)} relationField="relation_type" relationOptions={ASSOCIATE_TYPES} />
          ))}
        </div>
      </div>

      {/* Кнопка сохранить */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-6 py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors">
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить анкету ПДЛ'}
        </button>
        {saved && <span className="text-green-400 text-sm">Сохранено</span>}
      </div>
    </div>
  )
}

function DocumentsTab({ clientType, clientId }: { clientType: string; clientId: number }) {
  const [docs, setDocs] = useState<any[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
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

  const handleUpload = async (docType: string, file: File) => {
    setUploading(docType)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(`/documents/client/${clientId}/upload/${docType}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setDocs(prev => prev.map(d => d.document_type === docType ? { ...d, ...res.data } : d))
      toast('Файл загружен')
    } catch {
      toast('Ошибка загрузки файла', false)
    } finally {
      setUploading(null)
    }
  }

  const handleDeleteFile = async (docType: string) => {
    try {
      await api.delete(`/documents/client/${clientId}/file/${docType}`)
      setDocs(prev => prev.map(d => d.document_type === docType ? { ...d, file_name: null } : d))
      toast('Файл удалён')
    } catch {
      toast('Не удалось удалить файл', false)
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
                  <span className="text-xs text-orange-400 font-medium">{dl}</span>
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
                    <label className="block text-xs text-[#6b7280] mb-1 uppercase tracking-wider">Статус</label>
                    <select
                      value={doc.status}
                      onChange={e => updateField(doc.document_type, 'status', e.target.value)}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#6b7280] mb-1 uppercase tracking-wider">Дата получения</label>
                    <input
                      type="date"
                      value={toDateInput(doc.received_at)} min="1900-01-01" max="2100-12-31"
                      onChange={e => updateField(doc.document_type, 'received_at', e.target.value)}
                      className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                    />
                  </div>
                </div>

                {doc.has_expiry && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#6b7280] mb-1 uppercase tracking-wider">Дата выдачи</label>
                      <input
                        type="date"
                        value={toDateInput(doc.issued_at)} min="1900-01-01" max="2100-12-31"
                        onChange={e => updateField(doc.document_type, 'issued_at', e.target.value)}
                        className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#6b7280] mb-1 uppercase tracking-wider">
                        Действителен до
                        {dl && <span className="ml-1 text-orange-400 normal-case">{dl}</span>}
                      </label>
                      <input
                        type="date"
                        value={toDateInput(doc.expires_at)} min="1900-01-01" max="2100-12-31"
                        onChange={e => updateField(doc.document_type, 'expires_at', e.target.value)}
                        className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[#6b7280] mb-1 uppercase tracking-wider">Примечания</label>
                  <input
                    value={doc.notes || ''}
                    onChange={e => updateField(doc.document_type, 'notes', e.target.value)}
                    placeholder="Номер документа, примечания..."
                    className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
                  />
                </div>

                {/* Файл */}
                <div>
                  <label className="block text-xs text-[#6b7280] mb-1.5 uppercase tracking-wider">Файл</label>
                  {doc.file_name ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 flex-1 bg-[#111520] border border-[#1e2535] rounded-lg px-3 py-2 text-sm">
                        <Paperclip className="w-3.5 h-3.5 text-[#d4a843] flex-shrink-0" />
                        <span className="text-white truncate">{doc.file_name}</span>
                      </div>
                      <a
                        href={`/api/documents/client/${clientId}/file/${doc.document_type}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-[#4b5563] hover:text-[#d4a843] border border-[#1e2535] rounded-lg transition-colors"
                        title="Скачать"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteFile(doc.document_type)}
                        className="p-2 text-[#4b5563] hover:text-red-400 border border-[#1e2535] rounded-lg transition-colors"
                        title="Удалить файл"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className={clsx(
                      'flex items-center gap-2 cursor-pointer border border-dashed border-[#1e2535] rounded-lg px-4 py-2.5 text-sm transition-colors',
                      uploading === doc.document_type ? 'opacity-50 pointer-events-none' : 'hover:border-[#d4a843]/40 hover:text-[#d4a843] text-[#4b5563]'
                    )}>
                      <Upload className="w-4 h-4 flex-shrink-0" />
                      <span>{uploading === doc.document_type ? 'Загрузка...' : 'Прикрепить PDF'}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) handleUpload(doc.document_type, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => save(doc)}
                    disabled={saving === doc.document_type}
                    className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wider transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving === doc.document_type ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  {doc.file_name && (
                    <label className={clsx(
                      'flex items-center gap-1.5 cursor-pointer border border-[#1e2535] rounded-lg px-3 py-2 text-xs text-[#6b7280] transition-colors',
                      uploading === doc.document_type ? 'opacity-50 pointer-events-none' : 'hover:border-[#374151] hover:text-white'
                    )}>
                      <Upload className="w-3.5 h-3.5" />
                      Заменить
                      <input type="file" className="hidden" accept=".pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(doc.document_type, f); e.target.value = '' }} />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Вкладка санкционной проверки ────────────────────────────────────────────

const TIER_CONF = {
  confirmed: { label: 'Подтверждено', badge: 'bg-red-500/20 text-red-400 border border-red-500/30', dot: 'bg-red-500' },
  probable:  { label: 'Вероятное',    badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/30', dot: 'bg-orange-400' },
  possible:  { label: 'Возможное',    badge: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', dot: 'bg-yellow-400' },
}

const LIST_NAMES: Record<string, string> = {
  GSFR_KG_1: 'ГСФР КР — ПФТ', GSFR_KG_2: 'ГСФР КР — ПЛПД ФЛ',
  GSFR_KG_3: 'ГСФР КР — ПЛПД ЮЛ', GSFR_KG_4: 'ГСФР КР — Сводный',
  UN: 'ООН', OFAC: 'США — OFAC', EU: 'ЕС', UK: 'Великобритания',
}

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  client: 'Клиент',
  ubo: 'УБО / БВ',
  director: 'Директор',
  signatory: 'Доверенное лицо',
  pep_family: 'Родственник ПДЛ',
  pep_associate: 'Близкое лицо ПДЛ',
}

function SanctionsTab({
  clientId, clientName, clientType, onResultSaved,
}: {
  clientId: number
  clientName: string
  clientType: 'individual' | 'legal'
  onResultSaved: (result: string, date: string) => void
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [expandedSubject, setExpandedSubject] = useState<number | null>(null)

  const loadHistory = async () => {
    try {
      const h = await api.get('/sanctions/history', { params: { client_id: clientId, limit: 20 } })
      setHistory(h.data.items || h.data)
    } catch {}
  }

  useEffect(() => {
    loadHistory().finally(() => setLoadingHistory(false))
  }, [clientId])

  const runCheck = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await api.post(`/sanctions/rescreening/client/${clientId}`)
      setResult(res.data)
      await loadHistory()
    } catch (e: any) {
      toast(e.response?.data?.detail || 'Ошибка проверки', false)
    } finally {
      setRunning(false)
    }
  }

  const saveToCard = () => {
    const today = new Date().toISOString().split('T')[0]
    onResultSaved(result.result === 'clear' ? 'clear' : 'match', today)
    toast('Результат сохранён в анкету')
  }

  const resultColor = result
    ? result.result === 'clear'    ? 'border-green-500/30 bg-green-500/5'
    : result.result === 'match'    ? 'border-red-500/30 bg-red-500/5'
    :                                'border-yellow-500/30 bg-yellow-500/5'
    : ''

  const resultIcon = result
    ? result.result === 'clear'  ? <ShieldCheck className="w-5 h-5 text-green-400" />
    : result.result === 'match'  ? <ShieldAlert className="w-5 h-5 text-red-400" />
    :                              <AlertTriangle className="w-5 h-5 text-yellow-400" />
    : null

  // Group history by screening run (same minute = same run)
  const historyRuns: { runKey: string; checkedAt: string; subjects: any[] }[] = []
  for (const h of history) {
    const runKey = h.checked_at?.slice(0, 16) ?? ''
    const existing = historyRuns.find(r => r.runKey === runKey)
    if (existing) {
      existing.subjects.push(h)
    } else {
      historyRuns.push({ runKey, checkedAt: h.checked_at, subjects: [h] })
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Кнопка запуска ── */}
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-[#d4a843]" />
              Комплексная санкционная проверка
            </h3>
            <p className="text-xs text-[#6b7280]">
              {clientType === 'legal'
                ? 'Проверяет: наименование ЮЛ, все УБО, директора, доверенные лица, родственников и близких лиц ПДЛ'
                : 'Проверяет: ФИО клиента, все БВ, родственников и близких лиц ПДЛ'}
            </p>
          </div>
          <button
            onClick={runCheck}
            disabled={running}
            className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-5 py-2.5 rounded-lg text-sm uppercase tracking-wider transition-colors whitespace-nowrap flex-shrink-0"
          >
            <Search className={clsx('w-4 h-4', running && 'animate-pulse')} />
            {running ? 'Проверка...' : 'Запустить проверку'}
          </button>
        </div>
      </div>

      {/* ── Результат последней проверки ── */}
      {result && (
        <div className={clsx('border rounded-xl p-5 space-y-4', resultColor)}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {resultIcon}
              <div>
                <p className="font-semibold text-white">
                  {result.result === 'clear'         ? 'Совпадений не найдено'
                   : result.result === 'match'       ? 'Подтверждённое совпадение'
                   :                                   'Возможное совпадение — требует проверки'}
                </p>
                <p className="text-xs text-[#6b7280]">
                  Проверено {result.total_subjects} субъект{result.total_subjects === 1 ? '' : result.total_subjects < 5 ? 'а' : 'ов'} · {result.lists_checked?.length ?? 0} списков
                </p>
              </div>
            </div>
            <button
              onClick={saveToCard}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#d4a843]/30 bg-[#d4a843]/10 text-[#d4a843] text-xs font-medium hover:bg-[#d4a843]/20 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Сохранить в анкету
            </button>
          </div>

          {/* Субъекты */}
          {result.subjects?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-[#6b7280] uppercase tracking-wider font-semibold">Результаты по субъектам</p>
              {result.subjects.map((s: any, i: number) => {
                const isHit = s.result !== 'clear'
                const isOpen = expandedSubject === i
                return (
                  <div key={i} className={clsx('border rounded-lg overflow-hidden', {
                    'border-red-500/30 bg-red-500/5':    s.result === 'match',
                    'border-yellow-500/30 bg-yellow-500/5': s.result === 'possible_match',
                    'border-[#1e2535] bg-[#0d1017]':     s.result === 'clear',
                  })}>
                    <button
                      onClick={() => isHit && setExpandedSubject(isOpen ? null : i)}
                      className={clsx('w-full flex items-center gap-3 px-3 py-2.5 text-left', isHit && 'hover:bg-white/5 transition-colors')}
                    >
                      <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', {
                        'bg-red-500': s.result === 'match',
                        'bg-yellow-400': s.result === 'possible_match',
                        'bg-green-500': s.result === 'clear',
                      })} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-[#6b7280] mr-2">{SUBJECT_TYPE_LABELS[s.subject_type] || s.subject_type}</span>
                        <span className="text-sm text-white">{s.subject_name.replace(/^[^:]+:\s*/, '')}</span>
                      </div>
                      <span className={clsx('text-xs font-medium flex-shrink-0', {
                        'text-red-400':    s.result === 'match',
                        'text-yellow-400': s.result === 'possible_match',
                        'text-green-400':  s.result === 'clear',
                      })}>
                        {s.result === 'clear' ? 'Чисто' : s.result === 'match' ? 'Совпадение' : 'Возможное'}
                      </span>
                      {isHit && (isOpen
                        ? <ChevronUp className="w-3.5 h-3.5 text-[#4b5563] flex-shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-[#4b5563] flex-shrink-0" />
                      )}
                    </button>
                    {isOpen && s.matches?.length > 0 && (
                      <div className="border-t border-[#1e2535] px-3 pb-3 pt-2 space-y-2">
                        {s.matches.slice(0, 5).map((m: any, j: number) => {
                          const tier = TIER_CONF[m.match_tier as keyof typeof TIER_CONF] || TIER_CONF.possible
                          return (
                            <div key={j} className="bg-[#0a0e18] border border-[#1e2535] rounded-lg p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', tier.badge)}>{tier.label}</span>
                                    <span className="text-xs text-[#6b7280]">{LIST_NAMES[m.list_code] || m.list_code}</span>
                                    {m.dob_match && <span className="text-xs bg-green-400/20 text-green-400 px-1.5 py-0.5 rounded">ДР совпадает</span>}
                                  </div>
                                  <p className="text-sm text-white font-medium">{m.primary_name}</p>
                                  {m.aliases?.length > 0 && <p className="text-xs text-[#6b7280] mt-0.5">{m.aliases.slice(0, 3).join(' · ')}</p>}
                                  {m.date_of_birth && <p className="text-xs text-[#4b5563] mt-0.5">ДР: {fmtDate(m.date_of_birth)}</p>}
                                </div>
                                <span className="text-sm font-bold text-white shrink-0">{m.score}%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── История проверок ── */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <History className="w-4 h-4 text-[#4b5563]" />
          История проверок
        </h3>
        {loadingHistory ? (
          <p className="text-xs text-[#4b5563]">Загрузка...</p>
        ) : historyRuns.length === 0 ? (
          <p className="text-xs text-[#4b5563]">Проверок ещё не проводилось</p>
        ) : (
          <div className="space-y-2">
            {historyRuns.map((run, ri) => {
              const worst = run.subjects.reduce((acc, s) => {
                if (s.result === 'match') return 'match'
                if (s.result === 'possible_match' && acc === 'clear') return 'possible_match'
                return acc
              }, 'clear')
              const hits = run.subjects.filter(s => s.result !== 'clear')
              return (
                <div key={ri} className="bg-[#0d1017] border border-[#1e2535] rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#4b5563]">{fmtDateTime(run.checkedAt)}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">
                        {run.subjects.length} субъект{run.subjects.length === 1 ? '' : run.subjects.length < 5 ? 'а' : 'ов'}
                        {hits.length > 0 && <span className="ml-1 text-yellow-400">· {hits.length} с совпадениями</span>}
                      </p>
                    </div>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', {
                      'bg-green-400/20 text-green-400':   worst === 'clear',
                      'bg-red-400/20 text-red-400':       worst === 'match',
                      'bg-yellow-400/20 text-yellow-400': worst === 'possible_match',
                    })}>
                      {worst === 'clear' ? 'Чисто' : worst === 'match' ? 'Совпадение' : 'Возможное'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Главная карточка ─────────────────────────────────────────────────────────

const TABS_INDIVIDUAL_BASE = [
  { key: 'main',      label: 'Анкета ФЛ',             icon: FileText },
  { key: 'ubos',      label: 'Бенефициары (БВ)',       icon: Users },
  { key: 'docs',      label: 'Документы',             icon: FileText },
  { key: 'sanctions', label: 'Санкционная проверка',  icon: Shield },
  { key: 'risk',      label: 'Риск-скоринг',          icon: FileText },
]
const TAB_PDL = { key: 'pdl', label: 'Анкета ПДЛ', icon: Shield }

const TABS_LEGAL = [
  { key: 'main',            label: 'Анкета ЮЛ',             icon: FileText },
  { key: 'director',        label: 'Директора',              icon: User },
  { key: 'representatives', label: 'Доверительные лица',     icon: Users },
  { key: 'ubos',            label: 'УБО',                    icon: Users },
  { key: 'docs',            label: 'Документы',              icon: FileText },
  { key: 'sanctions',       label: 'Санкционная проверка',   icon: Shield },
  { key: 'risk',            label: 'Риск-скоринг',           icon: FileText },
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
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      toast(detail ? `Ошибка: ${detail}` : 'Не удалось сохранить', false)
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

  const handleSanctionsResultSaved = async (result: string, date: string) => {
    const updated = { ...formData, sanctions_check_result: result, sanctions_check_date: date }
    setFormData(updated)
    setSaving(true)
    try {
      if (client.client_type === 'individual') {
        await clientsApi.updateIndividual(Number(id), updated)
      } else {
        await clientsApi.updateLegal(Number(id), updated)
      }
    } catch {}
    setSaving(false)
  }

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
        <div className="flex flex-wrap gap-1 mt-4">
          {(client.client_type === 'legal'
            ? TABS_LEGAL
            : Boolean(formData.is_pdl)
              ? [...TABS_INDIVIDUAL_BASE, TAB_PDL]
              : TABS_INDIVIDUAL_BASE
          ).map(tab => (
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
        {activeTab === 'director' && (
          <DirectorsTab clientId={Number(id)} />
        )}
        {activeTab === 'representatives' && (
          <RepresentativesTab clientId={Number(id)} />
        )}
        {activeTab === 'pdl' && (
          <PEPQuestionnaireTab clientId={Number(id)} individual={formData} />
        )}
        {activeTab === 'ubos' && (
          <ClientUBOsTab clientId={Number(id)} clientType={client.client_type} />
        )}
        {activeTab === 'docs' && (
          <DocumentsTab clientType={client.client_type} clientId={Number(id)} />
        )}
        {activeTab === 'sanctions' && (
          <SanctionsTab
            clientId={Number(id)}
            clientName={displayName}
            clientType={client.client_type as 'individual' | 'legal'}
            onResultSaved={handleSanctionsResultSaved}
          />
        )}
        {activeTab === 'risk' && (
          <RiskScoring clientId={Number(id)} clientType={client.client_type} />
        )}
      </div>
    </div>
  )
}
