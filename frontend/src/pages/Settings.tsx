import { useState, useEffect } from 'react'
import {
  Settings2, Building2, Users, User, Save, Plus,
  Trash2, Eye, EyeOff, ExternalLink, Shield,
  CheckCircle2, AlertCircle, ChevronDown, Download
} from 'lucide-react'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: number; name: string; legal_form?: string; inn?: string
  reg_number?: string; legal_address?: string; actual_address?: string
  phone?: string; email?: string; website?: string; activity_types?: string
  license_number?: string; license_issued_by?: string
  license_issued_at?: string; license_expires_at?: string
  license_status?: string; gsfr_reg_number?: string; gsfr_reg_date?: string
  aml_officer_name?: string; aml_officer_position?: string
  aml_officer_phone?: string; aml_officer_email?: string
  max_clients?: number; created_at?: string
}

interface UserItem {
  id: number; email: string; full_name: string
  role: string; is_active: boolean
  last_login_at?: string; created_at?: string
}

const ROLES: Record<string, string> = {
  company_admin:       'Администратор',
  compliance_officer:  'Офицер комплаенс',
  manager:             'Менеджер',
  read_only:           'Только чтение',
}

const TABS = [
  { key: 'company', label: 'Компания',     icon: Building2 },
  { key: 'users',   label: 'Пользователи', icon: Users },
  { key: 'profile', label: 'Мой профиль',  icon: User },
]

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={clsx(
      'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border',
      ok ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
    )}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  )
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const show = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }
  return { toast, show }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState('company')
  const { toast, show } = useToast()
  const token = useAuthStore(s => s.token)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-[#d4a843]" />
        <div>
          <h1 className="text-xl font-bold text-white">Настройки</h1>
          <p className="text-xs text-[#6b7280]">Управление компанией, пользователями и профилем</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#111520] border border-[#1e2535] rounded-lg p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                tab === t.key ? 'bg-[#d4a843] text-[#0a0d14]' : 'text-[#6b7280] hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'company' && <CompanyTab show={show} token={token} />}
      {tab === 'users'   && <UsersTab show={show} />}
      {tab === 'profile' && <ProfileTab show={show} />}

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  )
}

// ─── Company Tab ──────────────────────────────────────────────────────────────

function CompanyTab({ show, token }: { show: (msg: string, ok?: boolean) => void; token: string | null }) {
  const [company, setCompany] = useState<Company | null>(null)
  const [form, setForm] = useState<Partial<Company>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/company').then(r => {
      setCompany(r.data)
      setForm(r.data)
    })
  }, [])

  const set = (k: keyof Company, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const payload: any = { ...form }
      // Convert date strings to ISO
      ;['license_issued_at', 'license_expires_at', 'gsfr_reg_date'].forEach(k => {
        if (payload[k] && !payload[k].includes('T')) {
          payload[k] = new Date(payload[k]).toISOString()
        }
      })
      const res = await api.put('/settings/company', payload)
      setCompany(res.data); setForm(res.data)
      show('Данные компании сохранены')
    } catch (e: any) {
      show(e?.response?.data?.detail || 'Ошибка сохранения', false)
    } finally { setSaving(false) }
  }

  const openExtract = () => {
    fetch('/api/settings/company/extract', {
      headers: { Authorization: `Bearer ${token || ''}` }
    })
      .then(r => r.text())
      .then(html => {
        const win = window.open('', '_blank')
        if (win) { win.document.write(html); win.document.close() }
      })
  }

  const F = ({ label, k, type = 'text', placeholder = '', full = false }: {
    label: string; k: keyof Company; type?: string; placeholder?: string; full?: boolean
  }) => (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={(form[k] as string) || ''}
          onChange={e => set(k, e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151] resize-none"
        />
      ) : (
        <input
          type={type}
          value={(form[k] as string) || ''}
          onChange={e => set(k, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]"
        />
      )}
    </div>
  )

  if (!company) return <div className="text-[#4b5563] text-sm">Загрузка...</div>

  const licExpires = company.license_expires_at ? new Date(company.license_expires_at) : null
  const daysLeft = licExpires ? Math.ceil((licExpires.getTime() - Date.now()) / 86400000) : null

  return (
    <div className="space-y-5">

      {/* License status banner */}
      {daysLeft !== null && daysLeft <= 90 && (
        <div className={clsx(
          'flex items-center gap-3 p-4 rounded-xl border',
          daysLeft <= 30 ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'
        )}>
          <AlertCircle className={clsx('w-5 h-5 shrink-0', daysLeft <= 30 ? 'text-red-400' : 'text-yellow-400')} />
          <p className={clsx('text-sm font-medium', daysLeft <= 30 ? 'text-red-400' : 'text-yellow-400')}>
            {daysLeft <= 0
              ? 'Лицензия истекла!'
              : `До истечения лицензии осталось ${daysLeft} дн. — ${licExpires?.toLocaleDateString('ru-RU')}`
            }
          </p>
        </div>
      )}

      {/* Sections */}
      <Section title="Общие сведения о компании" icon={Building2}>
        <div className="grid grid-cols-2 gap-4">
          <F label="Полное наименование *" k="name" placeholder="ОсОО «Название»" full />
          <F label="Организационно-правовая форма" k="legal_form" placeholder="ОсОО, АО, ИП..." />
          <F label="ИНН" k="inn" placeholder="12345678901234" />
          <F label="Рег. номер (ЕГРПО)" k="reg_number" placeholder="№ 123-456-ЮЛ" />
          <F label="Юридический адрес" k="legal_address" type="textarea" placeholder="г. Бишкек..." full />
          <F label="Фактический адрес" k="actual_address" type="textarea" placeholder="если отличается" full />
          <F label="Телефон" k="phone" placeholder="+996 (312) 000-000" />
          <F label="Email" k="email" type="email" placeholder="info@company.kg" />
          <F label="Сайт" k="website" placeholder="https://company.kg" />
          <F label="Виды деятельности" k="activity_types" type="textarea" placeholder="Обмен, перевод виртуальных активов..." full />
        </div>
      </Section>

      <Section title="Лицензия ГСФР" icon={Shield}>
        <div className="grid grid-cols-2 gap-4">
          <F label="Номер лицензии" k="license_number" placeholder="ГСФР-ПУВА-2024-001" />
          <F label="Орган, выдавший лицензию" k="license_issued_by" placeholder="ГСФР при Правительстве КР" />
          <F label="Дата выдачи" k="license_issued_at" type="date" />
          <F label="Действительна до" k="license_expires_at" type="date" />
          <F label="Рег. номер в реестре ГСФР" k="gsfr_reg_number" placeholder="ГСФР-2024-0123" />
          <F label="Дата регистрации в ГСФР" k="gsfr_reg_date" type="date" />
        </div>
      </Section>

      <Section title="Ответственный сотрудник по ПОД/ФТ" icon={User}>
        <div className="grid grid-cols-2 gap-4">
          <F label="ФИО" k="aml_officer_name" placeholder="Иванов Иван Иванович" full />
          <F label="Должность" k="aml_officer_position" placeholder="Комплаенс-офицер" />
          <F label="Телефон" k="aml_officer_phone" placeholder="+996 (700) 000-000" />
          <F label="Email" k="aml_officer_email" type="email" placeholder="officer@company.kg" />
        </div>
      </Section>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838] disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button
          onClick={openExtract}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1e2535] border border-[#2d3748] text-white rounded-lg text-sm font-medium hover:bg-[#2d3748] transition-colors"
        >
          <Download className="w-4 h-4" />
          Выписка о компании
        </button>
      </div>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ show }: { show: (msg: string, ok?: boolean) => void }) {
  const [users, setUsers] = useState<UserItem[]>([])
  const { user: me } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<UserItem | null>(null)

  const load = () => api.get('/settings/users').then(r => setUsers(r.data))
  useEffect(() => { load() }, [])

  const toggle = async (u: UserItem) => {
    try {
      await api.put(`/settings/users/${u.id}`, { is_active: !u.is_active })
      show(u.is_active ? 'Пользователь деактивирован' : 'Пользователь активирован')
      load()
    } catch (e: any) { show(e?.response?.data?.detail || 'Ошибка', false) }
  }

  const remove = async (u: UserItem) => {
    if (!confirm(`Удалить пользователя ${u.full_name}?`)) return
    try {
      await api.delete(`/settings/users/${u.id}`)
      show('Пользователь удалён'); load()
    } catch (e: any) { show(e?.response?.data?.detail || 'Ошибка', false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6b7280]">{users.length} пользователей в системе</p>
        <button
          onClick={() => { setEditUser(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838]"
        >
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2535] text-[10px] uppercase tracking-widest text-[#4b5563]">
              <th className="text-left px-4 py-3">Пользователь</th>
              <th className="text-left px-4 py-3">Роль</th>
              <th className="text-left px-4 py-3">Последний вход</th>
              <th className="text-left px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-[#111520] last:border-0 hover:bg-[#111520]">
                <td className="px-4 py-3">
                  <p className="text-white text-sm font-medium">{u.full_name}</p>
                  <p className="text-[10px] text-[#4b5563] mt-0.5">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-[#1e2535] text-[#9ca3af] px-2 py-0.5 rounded">
                    {ROLES[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#6b7280]">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('ru-RU') : 'Не входил'}
                </td>
                <td className="px-4 py-3">
                  <span className={clsx(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full',
                    u.is_active ? 'bg-green-400/20 text-green-400' : 'bg-[#1e2535] text-[#4b5563]'
                  )}>
                    {u.is_active ? 'Активен' : 'Деактивирован'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => { setEditUser(u); setShowForm(true) }}
                      className="text-[10px] text-[#4b5563] hover:text-[#d4a843] transition-colors"
                    >
                      Изменить
                    </button>
                    {u.id !== me?.id && (
                      <>
                        <button
                          onClick={() => toggle(u)}
                          className="text-[10px] text-[#4b5563] hover:text-white transition-colors"
                        >
                          {u.is_active ? 'Деактив.' : 'Активир.'}
                        </button>
                        <button
                          onClick={() => remove(u)}
                          className="text-[10px] text-[#4b5563] hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <UserFormModal
          user={editUser}
          onClose={() => { setShowForm(false); setEditUser(null) }}
          onSaved={() => { setShowForm(false); setEditUser(null); load(); show('Пользователь сохранён') }}
          onError={(msg) => show(msg, false)}
        />
      )}
    </div>
  )
}

// ─── User form modal ──────────────────────────────────────────────────────────

function UserFormModal({ user, onClose, onSaved, onError }: {
  user: UserItem | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    email: user?.email || '',
    full_name: user?.full_name || '',
    role: user?.role || 'compliance_officer',
    password: '',
    is_active: user?.is_active ?? true,
  })
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      if (user) {
        const payload: any = { full_name: form.full_name, role: form.role, is_active: form.is_active }
        await api.put(`/settings/users/${user.id}`, payload)
      } else {
        await api.post('/settings/users', form)
      }
      onSaved()
    } catch (e: any) {
      onError(e?.response?.data?.detail || 'Ошибка'); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[#1e2535]">
          <h2 className="text-white font-semibold">{user ? 'Редактировать пользователя' : 'Новый пользователь'}</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">ФИО</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
          </div>
          {!user && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required
                className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Роль</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50">
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {!user && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Пароль</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => set('password', e.target.value)} required minLength={8}
                  placeholder="Минимум 8 символов"
                  className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#d4a843]/50 placeholder-[#374151]" />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-[#1e2535] text-[#6b7280] rounded-lg text-sm hover:text-white">
              Отмена
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838] disabled:opacity-50">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ show }: { show: (msg: string, ok?: boolean) => void }) {
  const { user, setAuth, token } = useAuthStore()
  const [profile, setProfile] = useState({ full_name: user?.full_name || '', email: user?.email || '' })
  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setSavingProfile(true)
    try {
      const res = await api.put('/settings/profile', profile)
      if (token && user) {
        setAuth(token, { ...user, full_name: res.data.full_name, email: res.data.email })
      }
      show('Профиль обновлён')
    } catch (e: any) { show(e?.response?.data?.detail || 'Ошибка', false) }
    finally { setSavingProfile(false) }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.new_password !== pwd.confirm) { show('Пароли не совпадают', false); return }
    if (pwd.new_password.length < 8) { show('Пароль должен быть не менее 8 символов', false); return }
    setSavingPwd(true)
    try {
      await api.put('/settings/password', { current_password: pwd.current_password, new_password: pwd.new_password })
      setPwd({ current_password: '', new_password: '', confirm: '' })
      show('Пароль изменён')
    } catch (e: any) { show(e?.response?.data?.detail || 'Ошибка', false) }
    finally { setSavingPwd(false) }
  }

  const PwdInput = ({ label, k, show: showIt, onToggle }: { label: string; k: keyof typeof pwd; show: boolean; onToggle: () => void }) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">{label}</label>
      <div className="relative">
        <input type={showIt ? 'text' : 'password'} value={pwd[k]}
          onChange={e => setPwd(p => ({ ...p, [k]: e.target.value }))}
          className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4b5563] hover:text-white">
          {showIt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-3xl">
      {/* Profile info */}
      <Section title="Личные данные" icon={User}>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">ФИО</label>
            <input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Email</label>
            <input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
              className="w-full bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#d4a843]/50" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#4b5563] mb-1 block">Роль</label>
            <p className="text-sm text-white bg-[#0d1017] border border-[#1e2535] rounded-lg px-3 py-2">
              {ROLES[user?.role || ''] || user?.role}
            </p>
          </div>
          <button type="submit" disabled={savingProfile}
            className="flex items-center gap-2 px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838] disabled:opacity-50">
            <Save className="w-4 h-4" />
            {savingProfile ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      </Section>

      {/* Password */}
      <Section title="Смена пароля" icon={Shield}>
        <form onSubmit={savePassword} className="space-y-4">
          <PwdInput label="Текущий пароль" k="current_password" show={showCur} onToggle={() => setShowCur(v => !v)} />
          <PwdInput label="Новый пароль" k="new_password" show={showNew} onToggle={() => setShowNew(v => !v)} />
          <PwdInput label="Повторите новый пароль" k="confirm" show={showNew} onToggle={() => setShowNew(v => !v)} />
          {pwd.new_password && pwd.confirm && pwd.new_password !== pwd.confirm && (
            <p className="text-xs text-red-400">Пароли не совпадают</p>
          )}
          <button type="submit" disabled={savingPwd}
            className="flex items-center gap-2 px-4 py-2 bg-[#d4a843] text-[#0a0d14] rounded-lg text-sm font-semibold hover:bg-[#c49838] disabled:opacity-50">
            <Save className="w-4 h-4" />
            {savingPwd ? 'Изменение...' : 'Изменить пароль'}
          </button>
        </form>
      </Section>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string; icon: any; children: React.ReactNode
}) {
  return (
    <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1e2535]">
        <Icon className="w-4 h-4 text-[#d4a843]" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}
