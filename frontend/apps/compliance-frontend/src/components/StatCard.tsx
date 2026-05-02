import clsx from 'clsx'

interface Props {
  label: string
  value: number | string
  color?: string
  border?: string
  onClick?: () => void
  active?: boolean
}

export default function StatCard({ label, value, color = 'text-white', border = 'border-[#1e2535]', onClick, active }: Props) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'bg-[#0d1017] border rounded-xl p-4 text-left transition-colors',
        border,
        onClick && 'hover:border-[#d4a843]/40 cursor-pointer',
        active && 'border-[#d4a843]/60 bg-[#d4a843]/5',
      )}
    >
      <p className={clsx('text-2xl font-bold', color)}>{value}</p>
      <p className="text-xs text-[#6b7280] mt-0.5">{label}</p>
    </Tag>
  )
}
