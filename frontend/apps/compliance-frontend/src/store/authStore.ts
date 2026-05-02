/**
 * Zustand - простое хранилище состояния.
 * Здесь хранится текущий пользователь и токен.
 * Доступно из любого компонента без пробрасывания через пропсы.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CurrentUser {
  id: number
  email: string
  full_name: string
  role: string
  company_id: number
  company_name: string
}

interface AuthState {
  token: string | null
  user: CurrentUser | null
  setAuth: (token: string, user: CurrentUser) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'auth-storage', // Сохраняется в localStorage
    }
  )
)
