import { useState, useEffect } from 'react'
import {
  Users, AlertTriangle, FileText, Shield, Clock,
  ShieldAlert, CheckCircle2, XCircle, ChevronRight,
  TrendingUp, Activity, RefreshCw
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import api from '../api/client'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  category: string
  title: string
  detail: string
  link?: string
  count: number
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALERT_CONF = {
  critical: { color: 'border-red-500/40 bg-red-500/5',   text: 'text-red-400',    dot: 'bg-red-500' },
  warning:  { color: 'border-yellow-500/40 bg-yellow-500/5', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  info:     { color: 'border-blue-500/40 bg-blue-500/5',  text: 'text-blue-400',   dot: 'bg-blue-500' },
}

const RISK_CONF = {
  low:      { label: 'Низкий',      color: 'bg-green-400',   text: 'text-green-400' },
  medium:   { label: 'Средний',     color: 'bg-yellow-400',  text: 'text-yellow-400' },
  high:     { label: 'Высокий',     color: 'bg-orange-400',  text: 'text-orange-400' },
  critical: { label: 'Критический', color: 'bg-red-400',     text: 'text-red-400' },
  unknown:  { label: 'Не определён',color: 'bg-[#374151]',   text: 'text-[#6b7280]' },
}

function expiryColor(days?: number) {
  if (days == null) return 'text-[#6b7280]'
  if (days <= 0)  return 'text-red-400'
  if (days <= 7)  return 'text-red-400'
  if (days <= 30) return 'text-orange-400'
  return 'text-yellow-400'
}

function riskScore(score?: number) {
  if (score == null) return 'text-[#6b7280]'
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-green-400'
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, border, to }: {
  label: string; value: number | string; sub?: string
  icon: any; color: string; border: string; to?: string
}) {
  const inner = (
    <div className={clsx('bg-[#0d1017] border rounded-xl p-5 group transition-colors hover:border-opacity-60', border)}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest text-[#4b5563]">{label}</span>
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-[#6b7280] mt-1">{sub}</p>}
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

// ─── Risk Bar ────────────────────────────────────────────────────────────────

function RiskBar({ dist, total }: { dist: DashboardData['risk_distribution']; total: number }) {
  const items = [
    { key: 'critical' as const, ...RISK_CONF.critical, val: dist.critical },
    { key: 'high'     as const, ...RISK_CONF.high,     val: dist.high },
    { key: 'medium'   as const, ...RISK_CONF.medium,   val: dist.medium },
    { key: 'low'      as const, ...RISK_CONF.low,      val: dist.low },
    { key: 'unknown'  as const, ...RISK_CONF.unknown,  val: dist.unknown },
  ]
  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-3 bg-[#1e2535]">
        {total > 0 && items.filter(i => i.val > 0).map(i => (
          <div
            key={i.key}
            className={clsx('h-full transition-all', i.color)}
            style={{ width: `${(i.val / total) * 100}%` }}
            title={`${i.label}: ${i.val}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {items.map(i => (
          <div key={i.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={clsx('w-2 h-2 rounded-full', i.color)} />
              <span className="text-xs text-[#6b7280]">{i.label}</span>
            </div>
            <span className={clsx('text-xs font-bold', i.text)}>{i.val}</span>
          </div>
        ))}
      </div>
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
    try {
      const res = await api.get('/dashboard')
      setData(res.data)
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { load() }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Доброе утро' : hour < 17 ? 'Добрый день' : 'Добрый вечер'
  const firstName = user?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{greeting}, {firstName}</h1>
          <p className="text-[#6b7280] text-sm mt-0.5">{user?.company_name}</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-xs text-[#4b5563] hover:text-white transition-colors"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Обновить
        </button>
      </div>

      {loading && (
        <div className="text-center py-20 text-[#4b5563]">
          <Activity className="w-8 h-8 mx-auto mb-3 animate-pulse" />
          <p className="text-sm">Загрузка данных...</p>
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Всего клиентов" value={data.clients.total} icon={Users}
              sub={`${data.clients.individual} физ. / ${data.clients.legal} юр.`}
              color="#3b82f6" border="border-[#1e2535]" to="/clients"
            />
            <KpiCard
              label="Высокий / критический риск"
              value={data.clients.high_risk + data.clients.critical}
              icon={ShieldAlert}
              sub={data.clients.critical > 0 ? `${data.clients.critical} критических` : undefined}
              color={data.clients.critical > 0 ? '#ef4444' : '#f97316'}
              border={data.clients.critical > 0 ? 'border-red-500/30' : 'border-orange-500/20'}
              to="/clients"
            />
            <KpiCard
              label="Проблемные документы"
              value={data.documents.expired + data.documents.expiring_7}
              icon={FileText}
              sub={`${data.documents.expired} просрочено · ${data.documents.expiring_7} истекают`}
              color={data.documents.expired > 0 ? '#ef4444' : '#f97316'}
              border={data.documents.expired > 0 ? 'border-red-500/30' : 'border-[#1e2535]'}
              to="/documents"
            />
            <KpiCard
              label="Операции под контролем"
              value={data.transactions.new + data.transactions.reviewing}
              icon={AlertTriangle}
              sub={`${data.transactions.mandatory} обяз. контроль · ${data.transactions.suspicious} с признаками`}
              color={data.transactions.new > 0 ? '#f97316' : '#d4a843'}
              border={data.transactions.new > 0 ? 'border-orange-500/20' : 'border-[#1e2535]'}
              to="/transactions"
            />
          </div>

          {/* Second KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Санкционных проверок" value={data.sanctions.total_checks} icon={Shield}
              sub={data.sanctions.matches > 0 ? `${data.sanctions.matches} совпадений` : 'Совпадений нет'}
              color={data.sanctions.matches > 0 ? '#ef4444' : '#22c55e'}
              border={data.sanctions.matches > 0 ? 'border-red-500/30' : 'border-[#1e2535]'}
              to="/sanctions"
            />
            <KpiCard
              label="На онбординге" value={data.clients.pending} icon={Clock}
              color="#6b7280" border="border-[#1e2535]" to="/clients"
            />
            <KpiCard
              label="Документов missing" value={data.documents.missing} icon={XCircle}
              sub={`${data.documents.requested} запрошены`}
              color="#6b7280" border="border-[#1e2535]" to="/documents"
            />
            <KpiCard
              label="СПО направлено" value={data.transactions.reported} icon={CheckCircle2}
              color="#22c55e" border="border-[#1e2535]" to="/transactions"
            />
          </div>

          {/* Alerts + Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Alerts */}
            <div className="lg:col-span-2 bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-[#d4a843]" />
                <h3 className="text-sm font-semibold text-white">Требует внимания</h3>
                {data.alerts.length > 0 && (
                  <span className="ml-auto text-xs bg-[#d4a843]/20 text-[#d4a843] px-2 py-0.5 rounded-full font-medium">
                    {data.alerts.length}
                  </span>
                )}
              </div>
              {data.alerts.length === 0 ? (
                <div className="text-center py-8 text-[#4b5563]">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500/40" />
                  <p className="text-sm">Нет срочных задач</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.alerts.map((a, i) => {
                    const conf = ALERT_CONF[a.level]
                    const inner = (
                      <div key={i} className={clsx(
                        'flex items-start gap-3 p-3 rounded-lg border',
                        conf.color, a.link && 'cursor-pointer hover:opacity-80 transition-opacity'
                      )}>
                        <div className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', conf.dot)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={clsx('text-xs font-semibold', conf.text)}>{a.title}</p>
                            <span className={clsx('text-xs font-bold shrink-0', conf.text)}>{a.count}</span>
                          </div>
                          <p className="text-[11px] text-[#6b7280] mt-0.5">{a.detail}</p>
                        </div>
                        {a.link && <ChevronRight className="w-4 h-4 text-[#374151] shrink-0 mt-0.5" />}
                      </div>
                    )
                    return a.link ? <Link key={i} to={a.link}>{inner}</Link> : inner
                  })}
                </div>
              )}
            </div>

            {/* Risk distribution */}
            <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#d4a843]" />
                <h3 className="text-sm font-semibold text-white">Распределение риска</h3>
              </div>
              <RiskBar dist={data.risk_distribution} total={data.clients.total} />
              {data.clients.total === 0 && (
                <p className="text-xs text-[#4b5563] text-center mt-4">Нет данных о клиентах</p>
              )}
            </div>
          </div>

          {/* Bottom grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Expiring docs */}
            <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#d4a843]" />
                  <h3 className="text-sm font-semibold text-white">Истекающие документы</h3>
                </div>
                <Link to="/documents" className="text-[10px] text-[#4b5563] hover:text-[#d4a843] transition-colors">
                  Все →
                </Link>
              </div>
              {data.expiring_docs.length === 0 ? (
                <p className="text-xs text-[#4b5563] text-center py-6">Нет истекающих документов</p>
              ) : (
                <div className="space-y-2">
                  {data.expiring_docs.map((d, i) => (
                    <Link key={i} to={`/clients/${d.client_id}?tab=docs`}
                      className="flex items-center justify-between py-2 border-b border-[#111520] last:border-0 hover:opacity-80 transition-opacity group">
                      <div className="min-w-0">
                        <p className="text-xs text-[#d4a843] group-hover:underline truncate">{d.client_name}</p>
                        <p className="text-[10px] text-[#6b7280] truncate">{d.label}</p>
                      </div>
                      <span className={clsx('text-xs font-medium ml-2 shrink-0', expiryColor(d.days_until_expiry))}>
                        {d.days_until_expiry != null
                          ? d.days_until_expiry <= 0 ? 'Истёк' : `${d.days_until_expiry} дн.`
                          : '—'
                        }
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent transactions */}
            <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#d4a843]" />
                  <h3 className="text-sm font-semibold text-white">Подозрительные операции</h3>
                </div>
                <Link to="/transactions" className="text-[10px] text-[#4b5563] hover:text-[#d4a843] transition-colors">
                  Все →
                </Link>
              </div>
              {data.recent_transactions.length === 0 ? (
                <p className="text-xs text-[#4b5563] text-center py-6">Нет операций требующих проверки</p>
              ) : (
                <div className="space-y-2">
                  {data.recent_transactions.map((t, i) => (
                    <Link key={i} to="/transactions"
                      className="flex items-center justify-between py-2 border-b border-[#111520] last:border-0 hover:opacity-80 transition-opacity">
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{t.client_name || '—'}</p>
                        <p className="text-[10px] text-[#6b7280]">
                          {new Date(t.operation_date).toLocaleDateString('ru-RU')}
                          {t.indicators_count > 0 && ` · ${t.indicators_count} признак(а)`}
                        </p>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <p className="text-xs text-white font-medium">{t.amount.toLocaleString('ru-RU')} {t.currency}</p>
                        {t.risk_score != null && (
                          <p className={clsx('text-[10px] font-bold', riskScore(t.risk_score))}>{t.risk_score}%</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sanctions */}
            <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#d4a843]" />
                  <h3 className="text-sm font-semibold text-white">Санкционные проверки</h3>
                </div>
                <Link to="/sanctions" className="text-[10px] text-[#4b5563] hover:text-[#d4a843] transition-colors">
                  Все →
                </Link>
              </div>
              <div className="flex gap-4 mb-4">
                <div>
                  <p className="text-2xl font-bold text-white">{data.sanctions.total_checks}</p>
                  <p className="text-[10px] text-[#4b5563]">Проверок</p>
                </div>
                <div>
                  <p className={clsx('text-2xl font-bold', data.sanctions.matches > 0 ? 'text-red-400' : 'text-green-400')}>
                    {data.sanctions.matches}
                  </p>
                  <p className="text-[10px] text-[#4b5563]">Совпадений</p>
                </div>
                {data.sanctions.possible_matches > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-yellow-400">{data.sanctions.possible_matches}</p>
                    <p className="text-[10px] text-[#4b5563]">Возможных</p>
                  </div>
                )}
              </div>
              {data.recent_sanctions.length === 0 ? (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <p className="text-xs text-green-400">Подтверждённых совпадений нет</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.recent_sanctions.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#111520] last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{s.checked_name}</p>
                        <p className="text-[10px] text-[#6b7280]">{new Date(s.checked_at).toLocaleDateString('ru-RU')}</p>
                      </div>
                      <span className={clsx(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ml-2',
                        s.result === 'match' ? 'bg-red-400/20 text-red-400' : 'bg-yellow-400/20 text-yellow-400'
                      )}>
                        {s.result === 'match' ? 'Совпадение' : 'Возможное'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {data.sanctions.last_check_at && (
                <p className="text-[10px] text-[#374151] mt-3">
                  Последняя проверка: {new Date(data.sanctions.last_check_at).toLocaleDateString('ru-RU')}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
