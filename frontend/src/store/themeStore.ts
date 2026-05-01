import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        document.documentElement.setAttribute('data-theme', next)
      },
      setTheme: (t) => {
        set({ theme: t })
        document.documentElement.setAttribute('data-theme', t)
      },
    }),
    { name: 'cd-theme' }
  )
)

// Apply saved theme on initial load
export function initTheme() {
  const saved = localStorage.getItem('cd-theme')
  const theme = saved ? (JSON.parse(saved)?.state?.theme ?? 'dark') : 'dark'
  document.documentElement.setAttribute('data-theme', theme)
}
