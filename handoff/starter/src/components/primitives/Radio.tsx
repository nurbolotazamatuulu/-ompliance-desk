import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type RadioProps = {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  disabled?: boolean;
  name?: string;
  value?: string;
};

export function Radio({ checked, onChange, label, disabled = false, name, value }: RadioProps) {
  return (
    <label className={cn('inline-flex items-start gap-2.5', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        data-name={name}
        data-value={value}
        className={cn(
          'inline-flex items-center justify-center w-4 h-4 rounded-pill border transition-colors mt-0.5 shrink-0',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          checked ? 'border-accent' : 'border-border-hi',
        )}
      >
        {checked && <span className="w-2 h-2 rounded-pill bg-accent" aria-hidden="true" />}
      </button>
      <span className="text-sm text-text select-none">{label}</span>
    </label>
  );
}

type RadioGroupProps<V extends string> = {
  value: V | null;
  onChange: (v: V) => void;
  options: { value: V; label: ReactNode; disabled?: boolean }[];
  name?: string;
  orientation?: 'vertical' | 'horizontal';
};

export function RadioGroup<V extends string>({
  value,
  onChange,
  options,
  name,
  orientation = 'vertical',
}: RadioGroupProps<V>) {
  return (
    <div
      role="radiogroup"
      className={cn('flex gap-3', orientation === 'vertical' ? 'flex-col' : 'flex-row')}
    >
      {options.map((o) => (
        <Radio
          key={o.value}
          name={name}
          value={o.value}
          checked={value === o.value}
          onChange={() => onChange(o.value)}
          label={o.label}
          disabled={o.disabled}
        />
      ))}
    </div>
  );
}

export default RadioGroup;
