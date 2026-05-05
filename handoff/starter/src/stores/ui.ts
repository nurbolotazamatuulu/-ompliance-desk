/**
 * Zustand-стор глобального UI: тосты, открытая модалка, бургер-меню sidebar
 * на мобильном.
 *
 * Не путать с локальным состоянием формы — тут только то, что должно жить
 * между компонентами разных уровней.
 */

import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** автоматически снять через ms; 0 = не снимать */
  ttl?: number;
}

interface UIState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;

  sidebarOpenMobile: boolean;
  setSidebarOpenMobile: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = Math.random().toString(36).slice(2, 9);
    const ttl = toast.ttl ?? (toast.tone === 'error' ? 10000 : 5000);
    set({ toasts: [...get().toasts, { ...toast, id, ttl }] });
    if (ttl > 0) {
      setTimeout(() => get().dismissToast(id), ttl);
    }
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  sidebarOpenMobile: false,
  setSidebarOpenMobile: (open) => set({ sidebarOpenMobile: open }),
}));
