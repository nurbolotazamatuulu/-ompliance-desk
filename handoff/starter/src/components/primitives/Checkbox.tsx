import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';

type Props = {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  ariaLabel,
}: Props) {
  return (
    <label className={cn('inline-flex items-center gap-2.5', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'inline-flex items-center justify-center w-4 h-4 rounded-xs border transition-colors shrink-0',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          checked || indeterminate
            ? 'bg-accent border-accent text-text-on-accent'
            : 'bg-bg border-border-hi',
        )}
      >
        {indeterminate ? (
          <Minus size={10} aria-hidden="true" />
        ) : checked ? (
          <Check size={10} aria-hidden="true" strokeWidth={3} />
        ) : null}
      </button>
      {label && <span className="text-sm text-text select-none">{label}</span>}
    </label>
  );
}
