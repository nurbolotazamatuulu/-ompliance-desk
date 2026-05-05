import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { Tone } from '../../lib/risk';

type Props = {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  /** ARIA-роль: для статусов и уровней риска передавайте `status`. */
  role?: 'status' | undefined;
};

// Тон → классы рамки/фона/текста. Рамка — currentColor с прозрачностью 33%
// (через token border-*-soft недоступно, поэтому inline-стиль ниже).
const toneClass: Record<Tone, { text: string; bg: string; border: string }> = {
  neutral: { text: 'text-text-dim', bg: 'bg-elev', border: 'border-border' },
  green: { text: 'text-green', bg: 'bg-green-soft', border: 'border-green/30' },
  yellow: { text: 'text-yellow', bg: 'bg-yellow-soft', border: 'border-yellow/30' },
  orange: { text: 'text-orange', bg: 'bg-orange-soft', border: 'border-orange/30' },
  red: { text: 'text-red', bg: 'bg-red-soft', border: 'border-red/30' },
  blue: { text: 'text-accent', bg: 'bg-accent-bg', border: 'border-accent-border' },
};

export default function Badge({ tone = 'neutral', dot = false, children, className, role }: Props) {
  const t = toneClass[tone];
  return (
    <span
      role={role}
      className={cn(
        'inline-flex items-center gap-1.5 px-1.5 h-[18px] border rounded-xs',
        'font-mono uppercase tracking-wider text-[10.5px] font-semibold leading-none',
        t.text,
        t.bg,
        t.border,
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('inline-block w-[5px] h-[5px]', tone === 'neutral' ? 'bg-text-dim' : 'bg-current')}
        />
      )}
      {children}
    </span>
  );
}
