import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  label: string
  field: string
  current: string
  dir: 'asc' | 'desc'
  onSort: (f: any) => void
  className?: string
  /** Render as div instead of th (for grid-based tables) */
  as?: 'th' | 'div'
}

export default function SortTh({ label, field, current, dir, onSort, className, as: Tag = 'th' }: Props) {
  const active = current === field
  return (
    <Tag className={clsx('text-left', className)}>
      <button
        onClick={() => onSort(field)}
        className={clsx(
          'flex items-center gap-1 group transition-colors',
          'text-xs font-semibold uppercase tracking-wider',
          active ? 'text-[#d4a843]' : 'text-[#4b5563] hover:text-[#9ca3af]'
        )}
      >
        {label}
        <span className="opacity-60 group-hover:opacity-100 transition-opacity">
          {active
            ? dir === 'asc'
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            : <ChevronsUpDown className="w-3 h-3" />
          }
        </span>
      </button>
    </Tag>
  )
}
