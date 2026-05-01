import clsx from 'clsx'

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'orange' | 'info' | 'purple' | 'gold' | 'neutral'
  children: React.ReactNode
  dot?: boolean
  className?: string
}

export function Badge({ variant = 'neutral', dot, children, className }: BadgeProps) {
  return (
    <span className={clsx(`badge-${variant}`, className)}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', {
        'bg-green-400':  variant === 'success',
        'bg-yellow-400': variant === 'warning',
        'bg-red-400':    variant === 'danger',
        'bg-orange-400': variant === 'orange',
        'bg-blue-400':   variant === 'info',
        'bg-purple-400': variant === 'purple',
        'bg-[#d4a843]':  variant === 'gold',
        'bg-[#4b5563]':  variant === 'neutral',
      })} />}
      {children}
    </span>
  )
}

// Convenience: risk level badge
export function RiskBadge({ level }: { level: string | null }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    low:      { variant: 'success',  label: 'Низкий' },
    medium:   { variant: 'warning',  label: 'Средний' },
    high:     { variant: 'orange',   label: 'Высокий' },
    critical: { variant: 'danger',   label: 'Неприемлемый' },
  }
  const cfg = level ? map[level] : null
  if (!cfg) return <Badge variant="neutral" dot>Не определён</Badge>
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
}

// Convenience: client status badge
export function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    new:                 { variant: 'neutral',  label: 'Новый' },
    documents_requested: { variant: 'info',     label: 'Запрос документов' },
    under_review:        { variant: 'warning',  label: 'На проверке' },
    approved:            { variant: 'success',  label: 'Активен' },
    rejected:            { variant: 'danger',   label: 'Отказ' },
    suspended:           { variant: 'orange',   label: 'Приостановлен' },
  }
  const cfg = status ? map[status] : null
  if (!cfg) return <Badge variant="neutral">{status || '—'}</Badge>
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>
}
