import { useState, useEffect, useMemo } from 'react'
import { fmtDate } from '../utils/dates'
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX, Save, RotateCcw,
  AlertTriangle, ChevronDown, ChevronUp, CheckSquare, Square,
} from 'lucide-react'
import api from '../api/client'
import clsx from 'clsx'

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const BLOCK_MAX = { A: 25.0, B: 30.0, C: 20.0, D: 25.0 }
const R_MAX = 25.0
const A3_PEP_BONUS = 10
const NET_SATURATION = 22.0

const BLOCK_META: Record<string, { label: string; color: string }> = {
  A: { label: 'A. Профиль участника',    color: '#6366f1' },
  B: { label: 'B. Активы и операции',    color: '#f59e0b' },
  C: { label: 'C. Транзакционный риск',  color: '#ef4444' },
  D: { label: 'D. Комплаенс и контроль', color: '#10b981' },
}

const RISK_CONF = {
  low:      { label: 'Низкий',      color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/30',   badge: 'bg-green-400/20 text-green-400',   bar: '#4ade80', Icon: ShieldCheck },
  medium:   { label: 'Средний',     color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', badge: 'bg-yellow-400/20 text-yellow-400', bar: '#facc15', Icon: Shield },
  high:     { label: 'Высокий',     color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30', badge: 'bg-orange-400/20 text-orange-400', bar: '#fb923c', Icon: ShieldAlert },
  critical: { label: 'Критический', color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/30',       badge: 'bg-red-400/20 text-red-400',       bar: '#f87171', Icon: ShieldX },
}

const CAT_META: Record<string, string> = {
  client:  'Факторы клиента',
  product: 'Продукты, операции и услуги',
  country: 'Страновые и географические факторы',
}

// ─── Локальный расчёт (зеркало бэкенда) ──────────────────────────────────────

function calcScore61p(highSel: string[], lowSel: string[], criteria: any) {
  const allHigh: Record<string, any> = {}
  const allLow:  Record<string, any> = {}
  for (const cat of Object.values(criteria) as any[]) {
    for (const c of cat.high) allHigh[c.id] = c
    for (const c of cat.low)  allLow[c.id]  = c
  }
  const highScore = highSel.reduce((s, id) => s + (allHigh[id]?.weight ?? 0), 0)
  const lowScore  = lowSel.reduce((s, id)  => s + (allLow[id]?.weight  ?? 0), 0)
  const net = highScore - lowScore * 0.5
  const overrides = highSel.filter(id => allHigh[id]?.override)
  const r = overrides.length > 0 ? 100 : net <= 0 ? 0 : Math.min(net / NET_SATURATION * 100, 100)
  return { score: Math.round(r * 10) / 10, overrides }
}

function calcScoreVasp(scores: Record<string, number>, a3Pep: boolean, criteria: any) {
  if (!criteria || !Object.keys(scores).length) return null
  const a3Max: number = criteria.A?.find((c: any) => c.id === 'A3')?.max ?? 25

  const avg = (ids: string[]) => {
    const vals = ids.map(id => {
      let v = scores[id] ?? 0
      if (id === 'A3' && a3Pep) v = Math.min(v + A3_PEP_BONUS, a3Max)
      return v
    })
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const aAvg = avg(['A1', 'A2', 'A3', 'A4'])
  const bAvg = avg(['B1', 'B2', 'B3', 'B4'])
  const cAvg = avg(['C1', 'C2', 'C3', 'C4', 'C5'])
  const dAvg = avg(['D1', 'D2', 'D3', 'D4'])
  let r = Math.min(((aAvg + bAvg + cAvg + dAvg) / 4) / R_MAX * 100, 100)

  const overrides: string[] = []
  for (const blockCriteria of Object.values(criteria) as any[][]) {
    for (const c of blockCriteria) {
      const sel = scores[c.id] ?? -1
      for (const opt of c.options) {
        if (opt.value === sel && opt.override && !overrides.includes(opt.override))
          overrides.push(opt.override)
      }
    }
  }
  if (overrides.length) r = 100

  return {
    score: Math.round(r * 10) / 10,
    overrides,
    blockA: Math.round(Math.min(aAvg / BLOCK_MAX.A * 100, 100) * 10) / 10,
    blockB: Math.round(Math.min(bAvg / BLOCK_MAX.B * 100, 100) * 10) / 10,
    blockC: Math.round(Math.min(cAvg / BLOCK_MAX.C * 100, 100) * 10) / 10,
    blockD: Math.round(Math.min(dAvg / BLOCK_MAX.D * 100, 100) * 10) / 10,
  }
}

function toLevel(score: number): keyof typeof RISK_CONF {
  if (score <= 25) return 'low'
  if (score <= 50) return 'medium'
  if (score <= 75) return 'high'
  return 'critical'
}

// ─── Суб-компоненты ───────────────────────────────────────────────────────────

function ScorePill({ score, label, small }: { score: number; label: string; small?: boolean }) {
  const lvl = toLevel(score)
  const c = RISK_CONF[lvl]
  return (
    <div className={clsx('flex items-center gap-2 rounded-lg border px-3 py-1.5', c.bg)}>
      <c.Icon className={clsx(small ? 'w-3.5 h-3.5' : 'w-4 h-4', c.color)} />
      <div>
        <span className={clsx('font-bold tabular-nums', small ? 'text-sm' : 'text-base', c.color)}>
          {score.toFixed(0)}
        </span>
        <span className={clsx('text-xs ml-1', c.color)}>{c.label}</span>
        {label && <span className="text-xs text-[#4b5563] ml-1">· {label}</span>}
      </div>
    </div>
  )
}

function BlockBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs text-[#6b7280] mb-1">
        <span>{label}</span>
        <span style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-[#1e2535] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function CheckRow({ item, checked, type, onChange }: {
  item: any; checked: boolean; type: 'high' | 'low'; onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className={clsx(
        'w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-colors border',
        checked
          ? type === 'high'
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-green-500/10 border-green-500/20'
          : 'bg-transparent border-transparent hover:bg-[#1e2535]/60'
      )}
    >
      <span className="mt-0.5 shrink-0">
        {checked
          ? <CheckSquare className={clsx('w-3.5 h-3.5', type === 'high' ? 'text-red-400' : 'text-green-400')} />
          : <Square className="w-3.5 h-3.5 text-[#374151]" />
        }
      </span>
      <span className="text-xs text-[#d1d5db] leading-relaxed flex-1">{item.text}</span>
      <span className={clsx('text-xs font-bold shrink-0 mt-0.5', type === 'high' ? 'text-red-400' : 'text-green-400')}>
        {type === 'high' ? `+${item.weight}` : `-${(item.weight * 0.5).toFixed(1)}`}
      </span>
      {item.override && (
        <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
      )}
    </button>
  )
}

function SectionHeader({ title, subtitle, score, open, onToggle }: {
  title: string; subtitle: string; score: number | null; open: boolean; onToggle: () => void
}) {
  const lvl = score != null ? toLevel(score) : null
  const c = lvl ? RISK_CONF[lvl] : null
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-[#111520] transition-colors rounded-t-xl"
    >
      <div className="flex items-center gap-3 text-left">
        <div>
          <p className="font-semibold text-white text-sm">{title}</p>
          <p className="text-xs text-[#4b5563] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {score != null && c && (
          <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-lg', c.badge)}>
            {score.toFixed(0)} / 100 · {c.label}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-[#4b5563]" /> : <ChevronDown className="w-4 h-4 text-[#4b5563]" />}
      </div>
    </button>
  )
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export default function RiskScoring({ clientId, clientType }: {
  clientId: number
  clientType: string
}) {
  const isLegal = clientType === 'legal'

  const [criteria, setCriteria] = useState<any>(null)
  // 61/п state
  const [highSel, setHighSel] = useState<string[]>([])
  const [lowSel,  setLowSel]  = useState<string[]>([])
  const [cat61p, setCat61p] = useState<'client' | 'product' | 'country'>('client')
  // VASP state
  const [vaspScores, setVaspScores] = useState<Record<string, number>>({})
  const [a3Pep, setA3Pep] = useState(false)
  const [activeBlock, setActiveBlock] = useState<'A'|'B'|'C'|'D'>('A')
  // UI
  const [open61p, setOpen61p] = useState(true)
  const [openVasp, setOpenVasp] = useState(isLegal)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedState, setSavedState] = useState<any>(null)

  useEffect(() => { loadData() }, [clientId])

  const loadData = async () => {
    const [cRes, rRes] = await Promise.all([
      api.get('/risk/criteria'),
      api.get(`/risk/client/${clientId}`),
    ])
    const c = cRes.data
    setCriteria(c)
    const r = rRes.data
    setSavedState(r)
    setHighSel(r.high_selected ?? [])
    setLowSel(r.low_selected ?? [])

    if (r.scores && Object.keys(r.scores).length > 0) {
      setVaspScores(r.scores)
      setA3Pep(r.a3_pep ?? false)
    } else if (c.criteria_vasp) {
      const init: Record<string, number> = {}
      for (const block of Object.values(c.criteria_vasp) as any[][])
        for (const cr of block) init[cr.id] = cr.options[0]?.value ?? 0
      setVaspScores(init)
    }
  }

  const toggleHigh = (id: string) => {
    setHighSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    setSaved(false)
  }
  const toggleLow = (id: string) => {
    setLowSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    setSaved(false)
  }

  // Живой расчёт
  const calc = useMemo(() => {
    if (!criteria) return null
    const r61p = calcScore61p(highSel, lowSel, criteria.criteria_61p)
    const rVasp = isLegal ? calcScoreVasp(vaspScores, a3Pep, criteria.criteria_vasp) : null
    const finalScore = rVasp ? Math.max(r61p.score, rVasp.score) : r61p.score
    const hasOverride = r61p.overrides.length > 0 || (rVasp?.overrides.length ?? 0) > 0
    return { r61p, rVasp, finalScore: hasOverride ? 100 : finalScore, hasOverride }
  }, [highSel, lowSel, vaspScores, a3Pep, criteria, isLegal])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await api.post(`/risk/client/${clientId}`, {
        high_selected: highSel,
        low_selected: lowSel,
        scores: vaspScores,
        a3_pep: a3Pep,
      })
      setSavedState(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setHighSel([])
    setLowSel([])
    if (criteria?.criteria_vasp) {
      const init: Record<string, number> = {}
      for (const block of Object.values(criteria.criteria_vasp) as any[][])
        for (const cr of block) init[cr.id] = cr.options[0]?.value ?? 0
      setVaspScores(init)
    }
    setA3Pep(false)
    setSaved(false)
  }

  if (!criteria || !calc) return <div className="p-6 text-[#4b5563]">Загрузка...</div>

  const finalLvl = toLevel(calc.finalScore)
  const fc = RISK_CONF[finalLvl]
  const FinalIcon = fc.Icon

  return (
    <div className="p-5 space-y-4">

      {/* ─── Итоговая карточка ─────────────────────────────────────── */}
      <div className={clsx('border rounded-xl p-4', fc.bg)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <FinalIcon className={clsx('w-7 h-7 shrink-0', fc.color)} />
            <div>
              <p className={clsx('text-lg font-bold', fc.color)}>
                {fc.label} риск
                {calc.hasOverride && <span className="ml-2 text-xs font-normal text-red-400">OVERRIDE</span>}
              </p>
              <p className="text-xs text-[#6b7280] mt-0.5">
                Итоговый балл:&nbsp;
                <span className={clsx('font-semibold', fc.color)}>{calc.finalScore.toFixed(0)}</span>
                {' / 100'}
              </p>
              {savedState?.scored_at && (
                <p className="text-xs text-[#4b5563] mt-0.5">
                  Последняя оценка: {fmtDate(savedState.scored_at)}
                </p>
              )}
            </div>
          </div>
          <p className={clsx('text-4xl font-black tabular-nums shrink-0', fc.color)}>
            {calc.finalScore.toFixed(0)}
          </p>
        </div>

        {/* Мини-шкалы двух моделей */}
        <div className="mt-4 flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[140px]">
            <p className="text-xs text-[#6b7280] mb-1">61/п базовая оценка</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-[#1e2535] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(calc.r61p.score, 100)}%`, backgroundColor: RISK_CONF[toLevel(calc.r61p.score)].bar }} />
              </div>
              <span className={clsx('text-xs font-bold w-8 text-right', RISK_CONF[toLevel(calc.r61p.score)].color)}>
                {calc.r61p.score.toFixed(0)}
              </span>
            </div>
          </div>
          {calc.rVasp && (
            <div className="flex-1 min-w-[140px]">
              <p className="text-xs text-[#6b7280] mb-1">VASP расширенная оценка</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[#1e2535] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(calc.rVasp.score, 100)}%`, backgroundColor: RISK_CONF[toLevel(calc.rVasp.score)].bar }} />
                </div>
                <span className={clsx('text-xs font-bold w-8 text-right', RISK_CONF[toLevel(calc.rVasp.score)].color)}>
                  {calc.rVasp.score.toFixed(0)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Override-предупреждения */}
        {(calc.r61p.overrides.length > 0 || (calc.rVasp?.overrides.length ?? 0) > 0) && (
          <div className="mt-3 pt-3 border-t border-red-500/20 space-y-0.5">
            <p className="text-xs text-red-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Авто-триггеры КРИТИЧЕСКОГО уровня:
            </p>
            {calc.r61p.overrides.map(id => (
              <p key={id} className="text-xs text-red-300/70 pl-4">· {id} (61/п)</p>
            ))}
            {calc.rVasp?.overrides.map(id => (
              <p key={id} className="text-xs text-red-300/70 pl-4">· {id} (VASP)</p>
            ))}
          </div>
        )}
      </div>

      {/* ─── Секция 1: Приказ 61/п ────────────────────────────────── */}
      <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
        <SectionHeader
          title="Базовая оценка риска"
          subtitle="Приказ ГСФР 61/п — применяется ко всем клиентам"
          score={calc.r61p.score}
          open={open61p}
          onToggle={() => setOpen61p(v => !v)}
        />

        {open61p && (
          <div className="px-4 pb-4 space-y-4">
            {/* Вкладки категорий */}
            <div className="flex gap-1.5">
              {(['client', 'product', 'country'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCat61p(cat)}
                  className={clsx(
                    'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    cat61p === cat
                      ? 'bg-[#d4a843]/10 border-[#d4a843]/30 text-[#d4a843]'
                      : 'border-[#1e2535] text-[#6b7280] hover:text-white'
                  )}
                >
                  {cat === 'client' ? 'Клиент' : cat === 'product' ? 'Продукт' : 'Страна'}
                </button>
              ))}
            </div>

            {/* Факторы высокого риска */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400/70 mb-2">
                Факторы повышенного риска
              </p>
              <div className="space-y-1">
                {criteria.criteria_61p[cat61p].high.map((item: any) => (
                  <CheckRow
                    key={item.id}
                    item={item}
                    checked={highSel.includes(item.id)}
                    type="high"
                    onChange={() => { toggleHigh(item.id) }}
                  />
                ))}
              </div>
            </div>

            {/* Снижающие факторы */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-green-400/70 mb-2">
                Снижающие факторы
              </p>
              <div className="space-y-1">
                {criteria.criteria_61p[cat61p].low.map((item: any) => (
                  <CheckRow
                    key={item.id}
                    item={item}
                    checked={lowSel.includes(item.id)}
                    type="low"
                    onChange={() => { toggleLow(item.id) }}
                  />
                ))}
              </div>
            </div>

            {/* Итог 61/п */}
            <div className="pt-2 border-t border-[#1e2535] flex items-center justify-between text-xs text-[#6b7280]">
              <span>
                Выбрано: <span className="text-red-400">{highSel.length} повышающих</span>
                {' · '}
                <span className="text-green-400">{lowSel.length} снижающих</span>
              </span>
              <ScorePill score={calc.r61p.score} label="61/п" small />
            </div>
          </div>
        )}
      </div>

      {/* ─── Секция 2: VASP 4-блочная (только юрлица) ──────────────── */}
      {isLegal && (
        <div className="bg-[#0d1017] border border-[#1e2535] rounded-xl overflow-hidden">
          <SectionHeader
            title="Расширенная оценка VASP/ПУВА"
            subtitle="4-блочная модель PDF ГСФР — блоки A, B, C, D"
            score={calc.rVasp?.score ?? null}
            open={openVasp}
            onToggle={() => setOpenVasp(v => !v)}
          />

          {openVasp && (
            <div className="px-4 pb-4 space-y-4">
              {/* Блочные бары */}
              {calc.rVasp && (
                <div className="flex gap-4 pt-1">
                  {(['A', 'B', 'C', 'D'] as const).map(k => (
                    <BlockBar
                      key={k}
                      label={k}
                      pct={(calc.rVasp as any)[`block${k}`] ?? 0}
                      color={BLOCK_META[k].color}
                    />
                  ))}
                </div>
              )}

              {/* Вкладки блоков */}
              <div className="flex gap-1.5">
                {(['A', 'B', 'C', 'D'] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setActiveBlock(k)}
                    className={clsx(
                      'flex-1 py-1.5 px-1 rounded-lg text-xs font-medium border transition-colors truncate',
                      activeBlock === k ? 'text-white' : 'border-[#1e2535] text-[#6b7280] hover:text-white'
                    )}
                    style={activeBlock === k ? {
                      backgroundColor: BLOCK_META[k].color + '20',
                      borderColor: BLOCK_META[k].color + '50',
                      color: BLOCK_META[k].color,
                    } : undefined}
                  >
                    <span className="hidden sm:inline">{BLOCK_META[k].label}</span>
                    <span className="sm:hidden">{k}</span>
                  </button>
                ))}
              </div>

              {/* Критерии активного блока */}
              <div className="space-y-2.5">
                {criteria.criteria_vasp[activeBlock].map((cr: any) => {
                  const selVal = vaspScores[cr.id] ?? cr.options[0]?.value ?? 0
                  const selOpt = cr.options.find((o: any) => o.value === selVal)
                  const isOv = !!selOpt?.override
                  return (
                    <div key={cr.id} className={clsx(
                      'rounded-lg border p-3',
                      isOv ? 'bg-red-500/5 border-red-500/30' : 'bg-[#111520] border-[#1e2535]'
                    )}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-white">{cr.label}</p>
                        <span className="text-xs text-[#4b5563] shrink-0">max {cr.max}</span>
                      </div>
                      <div className="relative">
                        <select
                          value={selVal}
                          onChange={e => {
                            setVaspScores(p => ({ ...p, [cr.id]: Number(e.target.value) }))
                            setSaved(false)
                          }}
                          className={clsx(
                            'w-full appearance-none bg-[#0d1017] rounded-lg px-3 py-2 pr-8 text-xs border text-[#d1d5db] focus:outline-none focus:border-[#d4a843]/50',
                            isOv ? 'border-red-500/40' : 'border-[#1e2535]'
                          )}
                        >
                          {cr.options.map((opt: any) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4b5563] pointer-events-none" />
                      </div>
                      {isOv && (
                        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Авто-триггер КРИТИЧЕСКОГО уровня
                        </p>
                      )}
                      {cr.addon_pep && (
                        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                          <input type="checkbox" checked={a3Pep}
                            onChange={e => { setA3Pep(e.target.checked); setSaved(false) }}
                            className="accent-[#d4a843] w-3.5 h-3.5" />
                          <span className="text-xs text-[#d4a843]">
                            UBO является ПДЛ/PEP (+{A3_PEP_BONUS} к A3)
                          </span>
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Зоны — легенда */}
              <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
                {(['low','medium','high','critical'] as const).map(lvl => {
                  const zones = { low:'0–25', medium:'26–50', high:'51–75', critical:'76–100' }
                  const c = RISK_CONF[lvl]
                  const active = calc.rVasp && toLevel(calc.rVasp.score) === lvl
                  return (
                    <div key={lvl} className={clsx(
                      'rounded-lg py-1.5 px-1 border text-xs',
                      active ? c.bg : 'bg-transparent border-[#1e2535]'
                    )}>
                      <p className={clsx('font-semibold', active ? c.color : 'text-[#4b5563]')}>
                        {c.label}
                      </p>
                      <p className="text-xs text-[#374151]">{zones[lvl]}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Кнопки ───────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#d4a843] hover:bg-[#e0b84d] disabled:opacity-50 text-[#0a0d14] font-bold px-6 py-3 rounded-lg text-sm uppercase tracking-wider transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : saved ? 'Сохранено ✓' : 'Сохранить оценку'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 border border-[#1e2535] text-[#6b7280] hover:text-white px-4 py-3 rounded-lg text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Сбросить
        </button>
      </div>
    </div>
  )
}
