import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
};

const sideClass: Record<NonNullable<Props['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1',
};

/**
 * Простой tooltip на hover/focus. Без портала (inline absolute), достаточно
 * для labels на icon-buttons и helper-текста. Для сложных popover'ов — Dialog.
 */
export default function Tooltip({ content, children, side = 'top', className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-30 px-2 py-1 bg-elev-2 border border-border-hi rounded-sm shadow-md',
            'text-2xs whitespace-nowrap pointer-events-none',
            sideClass[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
