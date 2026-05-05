import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../stores/theme';

/**
 * Переключатель тёмной/светлой темы. Источник правды — useThemeStore;
 * сам store пишет в localStorage и проставляет data-theme на <html>.
 */
export default function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = mode === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
      className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-text-dim hover:text-text hover:bg-row-hover transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {isDark ? <Moon size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
    </button>
  );
}
