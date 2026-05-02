import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import clsx from 'clsx'

interface ToastItem {
  id: number
  message: string
  ok: boolean
}

let _addToast: ((msg: string, ok?: boolean) => void) | null = null

export function toast(message: string, ok = true) {
  _addToast?.(message, ok)
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])
  let counter = 0

  useEffect(() => {
    _addToast = (message: string, ok = true) => {
      const id = ++counter
      setItems(prev => [...prev, { id, message, ok }])
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 3500)
    }
    return () => { _addToast = null }
  }, [])

  const remove = (id: number) => setItems(prev => prev.filter(t => t.id !== id))

  if (!items.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {items.map(t => (
        <div
          key={t.id}
          className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl',
            'animate-in slide-in-from-right-5 duration-200',
            t.ok
              ? 'bg-[#111520] border-green-500/30'
              : 'bg-[#111520] border-red-500/30'
          )}
        >
          {t.ok
            ? <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          }
          <p className="text-sm text-white flex-1">{t.message}</p>
          <button
            onClick={() => remove(t.id)}
            className="text-[#4b5563] hover:text-white transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
