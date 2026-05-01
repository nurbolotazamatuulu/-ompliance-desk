import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Удалить', onConfirm, onCancel, danger = true
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-[#111520] border border-[#1e2535] rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-[#1e2535]">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${danger ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
              <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-yellow-400'}`} />
            </div>
            <h3 id="confirm-title" className="text-white font-semibold">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-[#4b5563] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-[#9ca3af] text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#1e2535] text-[#9ca3af] hover:text-white hover:border-[#374151] text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
              danger
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                : 'bg-[#d4a843]/20 text-[#d4a843] hover:bg-[#d4a843]/30 border border-[#d4a843]/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
