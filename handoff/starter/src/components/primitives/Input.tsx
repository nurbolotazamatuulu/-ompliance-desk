import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: 'sm' | 'md';
  monospace?: boolean;
  fullWidth?: boolean;
};

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  {
    label,
    hint,
    error,
    leadingIcon: Leading,
    trailingIcon: Trailing,
    prefix,
    suffix,
    size = 'md',
    monospace = false,
    fullWidth = false,
    className,
    id,
    ...rest
  },
  ref,
) {
  const inputId = id ?? `in-${Math.random().toString(36).slice(2, 9)}`;
  const heightClass = size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm';
  const errorState = !!error;

  return (
    <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={inputId} className="cd-caps text-text-mute">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center bg-bg border rounded-sm transition-colors',
          'focus-within:border-accent focus-within:ring-1 focus-within:ring-focus',
          heightClass,
          errorState ? 'border-red/60' : 'border-border',
        )}
      >
        {Leading && <Leading size={14} className="ml-2.5 text-text-mute" aria-hidden="true" />}
        {prefix && (
          <span className="pl-2.5 pr-1.5 text-text-mute font-mono text-2xs">{prefix}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'flex-1 min-w-0 bg-transparent border-none outline-none px-2.5',
            'placeholder:text-text-ghost',
            (Leading || prefix) && 'pl-1',
            (Trailing || suffix) && 'pr-1',
            monospace && 'font-mono',
            className,
          )}
          aria-invalid={errorState || undefined}
          aria-describedby={
            error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined
          }
          {...rest}
        />
        {suffix && (
          <span className="pr-2.5 pl-1.5 text-text-mute font-mono text-2xs">{suffix}</span>
        )}
        {Trailing && <Trailing size={14} className="mr-2.5 text-text-mute" aria-hidden="true" />}
      </div>
      {error ? (
        <span id={`${inputId}-err`} className="text-2xs text-red">
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="text-2xs text-text-mute">
          {hint}
        </span>
      ) : null}
    </div>
  );
});

export default Input;
