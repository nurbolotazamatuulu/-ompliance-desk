import { cn } from '../../lib/cn';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function Switch({ checked, onChange, label, disabled = false, ariaLabel }: Props) {
  return (
    <label className={cn('inline-flex items-center gap-2.5', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex w-9 h-5 rounded-pill border transition-colors shrink-0',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          checked ? 'bg-accent border-accent' : 'bg-elev border-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-pill bg-surface shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
          aria-hidden="true"
        />
      </button>
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  );
}
