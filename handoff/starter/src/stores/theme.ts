/**
 * Zustand-стор темы. Источник истины для атрибута data-theme на <html>.
 *
 * Тема восстанавливается из localStorage до рендера в main.tsx, поэтому
 * первичное значение store берётся отсюда же — нет рассинхрона с DOM.
 */

import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'cd:theme';

const readInitial = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' ? 'light' : 'dark';
};

const applyToDocument = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
};

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readInitial(),
  setMode: (mode) => {
    applyToDocument(mode);
    localStorage.setItem(THEME_KEY, mode);
    set({ mode });
  },
  toggle: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    get().setMode(next);
  },
}));
