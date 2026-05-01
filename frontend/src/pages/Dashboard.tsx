import { useState, useEffect } from 'react'
import { fmtDate } from '../utils/dates'
import {
  Users, AlertTriangle, FileText, Shield, Clock,
  ShieldAlert, CheckCircle2, XCircle, ChevronRight,
  TrendingUp, Activity, RefreshCw, ArrowUpRight
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../api/client'
import clsx from 'clsx'

interface DashboardData {
  clients: { total: number; individual: number; legal: number; high_risk: number; critical: number; pending: number }
  documents: { expired: number; expiring_7: number; expiring_30: number; missing: number; requested: number; present: number }
  transactions: { total: number; new: number; reviewing: number; reported: number; mandatory: number; suspicious: number }
  sanctions: { total_checks: number; matches: number; possible_matches: number; last_check_at: string | null }
  risk_distribution: { low: number; medium: number; high: number; critical: number; unknown: number }
  alerts: AlertItem[]
  expiring_docs: ExpiringDoc[]
  recent_transactions: RecentTxn[]
  recent_sanctions: RecentSanction[]
  generated_at: string
}

interface AlertItem {
  level: 'critical' | 'warning' | 'info'
  category: string; title: string; detail: string; link?: string; count: number
}

interface ExpiringDoc {
  client_id: number; client_name: string
  document_type: string; label: string
  expires_at?: string; days_until_expiry?: number
}

interface RecentTxn {
  id: number; client_name?: string
  amount: number; currency: string; amount_kgs?: number
  type_label?: string; indicators_count: number
  risk_score?: number; status: string; operation_date: string
}

interface RecentSanction {
  id: number; checked_name: string; result: string
  checked_at: string; client_id?: number
}

// ─── Configs ──────────────────────────────────────────────────────────────────

const ALERT_CONF = {
  critical: { bar: 'bg-red-500',    bg: 'bg-red-500/8 border-red-500/25',     text: 'text-red-400',    icon: 'text-red-500' },
  warning:  { bar: 'bg-yellow-400', bg: 'bg-yellow-500/8 border-yellow-500/25', text: 'text-yellow-400', icon: 'text-yellow-400' },
  info:     { bar: 'bg-blue-400',   bg: 'bg-blue-500/8 border-blue-500/25',    text: 'text-blue-400',   icon: 'text-blue-400' },
}

const RISK_CONF = {
  critical: { label: 'Критический', bar: 'bg-red-500',    text: 'text-red-400' },
  high:     { label: 'Высокий',     bar: 'bg-orange-400', text: 'text-orange-400' },
  medium:   { label: 'Средний',     bar: 'bg-yellow-400', text: 'text-yellow-400' },
  low:      { label: 'Низкий',      bar: 'bg-green-400',  text: 'text-green-400' },
  unknown:  { label: 'Не определён',bar: 'bg-[#2d3748]',  text: 'text-[#6b7280]' },
}

function expiryColor(days?: number) {
  if (days == null) return 'text-[#6b7280]'
  if (days <= 0)  return 'text-red-400'
  if (days <= 7)  return 'text-red-400'
  if (days <= 30) return 'text-orange-400'
  return 'text-yellow-400'
}

function riskColor(score?: number) {
  if (score == null) return 'text-[#6b7280]'
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-green-400'
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, accent, urgent, to }: {
  label: string; value: number | string; sub?: string
  icon: any; accent: string; urgent?: boolean; to?: string
}) {
  const inner = (
    <div className={clsx(
      'relative overflow-hidden bg-[#0d1017] border rounded-xl p-4 transition-all duration-200 group',
      urgent ? 'border-red-500/30 hover:border-red-500/50' : 'border-[#1e2535] hover:border-[#2d3748]'
    )}>
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-[#6b7280] leading-snug max-w-[120px]">{label}</p>
        <div className="p-1.5 rounded-lg shrink-0 ml-2" style={{ backgroundColor: `${accent}18` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-[#4b5563] mt-1 leading-snug">{sub}</p>}
      {to && (
        <ArrowUpRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-[#2d3748] group-hover:text-[#4b5563] transition-colors" />
      )}
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

// ─── Risk Distribution ────────────────────────────────────────────────────────

function RiskBar({ dist, total }: { dist: DashboardData['risk_distribution']; total: number }) {
  const items = [
    { key: 'critical' as const, ...RISK_CONF.critical, val: dist.critical },
    { key: 'high'     as const, ...RISK_CONF.high,     val: dist.high },
    { key: 'medium'   as const, ...RISK_CONF.medium,   val: dist.medium },
    { key: 'low'      as const, ...RISK_CONF.low,      val: dist.low },
    { key: 'unknown'  as const, ...RISK_CONF.unknown,  val: dist.unknown },
  ]
  return (
    <div className="space-y-4">
      <div className="flex rounded-full overflow-hidden h-2 bg-[#1e2535] gap-px">
        {total > 0 && items.filter(i => i.val > 0).map(i => (
          <div key={i.key} className={clsx('h-full transition-all duration-500', i.bar)}
            style={{ width: `${(i.val / total) * 100}%` }} title={`${i.label}: ${i.val}`} />
        ))}
      </div>
      <div className="space-y-2">
        {items.map(i => (
          <div key={i.key} className="flex items-center gap-2">
            <div className={clsx('w-2 h-2 rounded-full shrink-0', i.bar)} />
            <span className="text-xs text-[#6b7280] flex-1">{i.label}</span>
            <span className={clsx('text-xs font-bold tabular-nums', i.text)}>{i.val}</span>
            {total > 0 && (
              <span className="text-[10px] text-[#374151] w-8 text-right tabular-nums">
                {Math.round((i.val / total) * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, to, children }: {
  icon: any; title: string; to: string; children: React.ReactNode
}) {
  return (
    <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#d4a843]" />
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <Link to={to} className="text-xs text-[#4b5563] hover:text-[#d4a843] transition-colors flex items-center gap-1">
          Все <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
      {children}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    try { setData((await api.get('/dashboard')).data) } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Доброе утро' : hour < 17 ? 'Добрый день' : 'Добрый вечер'
  const firstName = user?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="p-6 space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">{greeting}, {firstName}</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">{user?.company_name}</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-[#4b5563] hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-[#1e2535]/50 border border-transparent hover:border-[#1e2535]">
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Обновить
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-[#4b5563]">
          <Activity className="w-8 h-8 mb-3 animate-pulse text-[#d4a843]/40" />
          <p className="text-sm">Загрузка данных...</p>
        </div>
      )}

      {data && (
        <>
          {/* KPI Row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger animate-fade-in">
            <KpiCard label="Всего клиентов" value={data.clients.total} icon={Users}
              sub={`${data.clients.individual} физ. · ${data.clients.legal} юр.`}
              accent="#3b82f6" to="/clients" />
            <KpiCard label="Высокий и критический риск"
              value={data.clients.high_risk + data.clients.critical} icon={ShieldAlert}
              sub={data.clients.critical > 0 ? `${data.clients.critical} критических` : 'Нет критических'}
              accent={data.clients.critical > 0 ? '#ef4444' : '#f97316'}
              urgent={data.clients.critical > 0} to="/clients" />
            <KpiCard label="Проблемные документы"
              value={data.documents.expired + data.documents.expiring_7} icon={FileText}
              sub={`${data.documents.expired} просрочено · ${data.documents.expiring_7} истекают`}
              accent={data.documents.expired > 0 ? '#ef4444' : '#f97316'}
              urgent={data.documents.expired > 0} to="/documents" />
            <KpiCard label="Операции под контролем"
              value={data.transactions.new + data.transactions.reviewing} icon={AlertTriangle}
              sub={`${data.transactions.mandatory} обяз. контроль`}
              accent={data.transactions.new > 0 ? '#f97316' : '#d4a843'}
              urgent={false} to="/transactions" />
          </div>

          {/* KPI Row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger animate-fade-in">
            <KpiCard label="Санкционных проверок" value={data.sanctions.total_checks} icon={Shield}
              sub={data.sanctions.matches > 0 ? `${data.sanctions.matches} совпадений` : 'Совпадений нет'}
              accent={data.sanctions.matches > 0 ? '#ef4444' : '#22c55e'}
              urgent={data.sanctions.matches > 0} to="/sanctions" />
            <KpiCard label="На онбординге" value={data.clients.pending} icon={Clock}
              accent="#6b7280" to="/clients" />
            <KpiCard label="Документов отсутствует" value={data.documents.missing} icon={XCircle}
              sub={`${data.documents.requested} запрошены`} accent="#6b7280" to="/documents" />
            <KpiCard label="СПО направлено" value={data.transactions.reported} icon={CheckCircle2}
              accent="#22c55e" to="/transactions" />
          </div>

          {/* Alerts + Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Alerts */}
            <div className="lg:col-span-2 bg-[#0d1017] border border-[#1e2535] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-[#d4a843]" />
                <h3 className="text-sm font-semibold text-white">Требует внимания</h3>
                {data.alerts.length > 0 && (
                  <span className="ml-auto badge badge-gold">{data.alerts.length}</span>
                )}
              </div>
              {data.alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-[#4b5563]">
                  <CheckCircle2 className="w-8 h-8 mb-2 text-green-500/30" />
                  <p className="text-sm font-medium text-[#6b7280]">Всё под контролем</p>
                  <p className="text-xs mt-0.5">Нет срочных задач</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.alerts.map((a, i) => {
                    const conf = ALERT_CONF[a.level]
                    const inner = (
                      <div className={clsx(
                        'flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-opacity',
                        conf.bg, a.link && 'cursor-pointer hover:opacity-80'
                      )}>
                        <div className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 animate-pulse-dot', conf.bar)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={clsx('text-xs font-semibold', conf.text)}>{a.title}</p>
                            <span className={clsx('text-xs font-bold shrink-0', conf.text)}>{a.count}</span>
                          </div>
                          <p className="text-xs text-[#6b7280] mt-0.5 leading-snug">{a.detail}</p>
                        </div>
                        {a.link && <ChevronRight className="w-3.5 h-3.5 text-[#374151] shrink-0 mt-0.5" />}
                      </div>
                    )
                    return a.link ? <Link key={i} to={a.link}>{inner}</Link> : <div key={i}>{inner}</div>
                  })}
                </div>
              )}
            </div>

            {/* Risk distribution */}
            <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#d4a843]" />
                <h3 className="text-sm font-semibold text-white">Распределение риска</h3>
              </div>
              {data.clients.total === 0
                ? <p className="text-xs text-[#4b5563] text-center py-8">Нет данных о клиентах</p>
                : <RiskBar dist={data.risk_distribution} total={data.clients.total} />
              }
            </div>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Expiring docs */}
            <SectionCard icon={Clock} title="Истекающие документы" to="/documents">
              {data.expiring_docs.length === 0
                ? <p className="text-xs text-[#4b5563] text-center py-4">Нет истекающих документов</p>
                : <div className="divide-y divide-[#111520]">
                    {data.expiring_docs.map((d, i) => (
                      <Link key={i} to={`/clients/${d.client_id}?tab=docs`}
                        className="flex items-center justify-between py-2 hover:opacity-80 transition-opacity group">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#d4a843] group-hover:underline truncate">{d.client_name}</p>
                          <p className="text-[11px] text-[#6b7280] truncate">{d.label}</p>
                        </div>
                        <span className={clsx('text-xs font-semibold ml-3 shrink-0', expiryColor(d.days_until_expiry))}>
                          {d.days_until_expiry != null
                            ? d.days_until_expiry <= 0 ? 'Истёк' : `${d.days_until_expiry} дн.`
                            : '—'}
                        </span>
                      </Link>
                    ))}
                  </div>
              }
            </SectionCard>

            {/* Recent transactions */}
            <SectionCard icon={AlertTriangle} title="Подозрительные операции" to="/transactions">
              {data.recent_transactions.length === 0
                ? <p className="text-xs text-[#4b5563] text-center py-4">Нет операций к проверке</p>
                : <div className="divide-y divide-[#111520]">
                    {data.recent_transactions.map((t, i) => (
                      <Link key={i} to="/transactions"
                        className="flex items-center justify-between py-2 hover:opacity-80 transition-opacity">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{t.client_name || '—'}</p>
                          <p className="text-[11px] text-[#6b7280]">
                            {fmtDate(t.operation_date)}
                            {t.indicators_count > 0 && ` · ${t.indicators_count} признак`}
                          </p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-xs font-medium text-white">{t.amount.toLocaleString('ru-RU')} {t.currency}</p>
                          {t.risk_score != null && (
                            <p className={clsx('text-xs font-bold', riskColor(t.risk_score))}>{t.risk_score}%</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
              }
            </SectionCard>

            {/* Sanctions */}
            <SectionCard icon={Shield} title="Санкционные проверки" to="/sanctions">
              <div className="flex items-center gap-5 pb-3 border-b border-[#1e2535]">
                <div>
                  <p className="text-xl font-bold text-white tabular-nums">{data.sanctions.total_checks}</p>
                  <p className="text-[11px] text-[#6b7280]">Проверок</p>
                </div>
                <div>
                  <p className={clsx('text-xl font-bold tabular-nums', data.sanctions.matches > 0 ? 'text-red-400' : 'text-green-400')}>
                    {data.sanctions.matches}
                  </p>
                  <p className="text-[11px] text-[#6b7280]">Совпадений</p>
                </div>
                {data.sanctions.possible_matches > 0 && (
                  <div>
                    <p className="text-xl font-bold text-yellow-400 tabular-nums">{data.sanctions.possible_matches}</p>
                    <p className="text-[11px] text-[#6b7280]">Возможных</p>
                  </div>
                )}
              </div>
              {data.recent_sanctions.length === 0
                ? <div className="flex items-center gap-2 bg-green-500/8 border border-green-500/20 rounded-lg px-3 py-2 mt-1">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    <p className="text-xs text-green-400 font-medium">Подтверждённых совпадений нет</p>
                  </div>
                : <div className="divide-y divide-[#111520]">
                    {data.recent_sanctions.map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{s.checked_name}</p>
                          <p className="text-[11px] text-[#6b7280]">{fmtDate(s.checked_at)}</p>
                        </div>
                        <span className={clsx('badge ml-3 shrink-0',
                          s.result === 'match' ? 'badge-danger' : 'badge-warning')}>
                          {s.result === 'match' ? 'Совпадение' : 'Возможное'}
                        </span>
                      </div>
                    ))}
                  </div>
              }
              {data.sanctions.last_check_at && (
                <p className="text-[10px] text-[#374151] mt-2">
                  Последняя: {fmtDate(data.sanctions.last_check_at)}
                </p>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
