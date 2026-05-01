import { type LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#1e2535]/60 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#374151]" />
      </div>
      <p className="text-sm font-medium text-[#9ca3af]">{title}</p>
      {description && <p className="text-xs text-[#4b5563] mt-1 max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-sm text-[#d4a843] hover:text-[#e0b84d] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
