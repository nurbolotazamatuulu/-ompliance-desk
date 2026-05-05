import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
};

type SingleProps<V extends string> = {
  value: V | null;
  onChange: (v: V | null) => void;
  multiple?: false;
};

type MultiProps<V extends string> = {
  value: V[];
  onChange: (v: V[]) => void;
  multiple: true;
};

type CommonProps<V extends string> = {
  options: SelectOption<V>[];
  placeholder?: string;
  label?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

type Props<V extends string> = CommonProps<V> & (SingleProps<V> | MultiProps<V>);

/**
 * Select primitive: single или multi.
 * Multi-select показывает chip-summary "N выбрано" + чек-лист в popup.
 * Custom popover (не native), потому что multi и для consistency.
 */
function Select<V extends string>(props: Props<V>) {
  const {
    options,
    placeholder = 'Не выбрано',
    label,
    size = 'md',
    fullWidth = false,
    disabled = false,
    ariaLabel,
  } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const heightClass = size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm';

  const summary = (() => {
    if (props.multiple) {
      const v = props.value;
      if (!v.length) return placeholder;
      if (v.length === 1) return options.find((o) => o.value === v[0])?.label ?? placeholder;
      return `${v.length} выбрано`;
    }
    if (!props.value) return placeholder;
    return options.find((o) => o.value === props.value)?.label ?? placeholder;
  })();

  const isPlaceholder = props.multiple ? props.value.length === 0 : !props.value;

  const toggle = (val: V) => {
    if (props.multiple) {
      const set = new Set(props.value);
      if (set.has(val)) set.delete(val);
      else set.add(val);
      props.onChange([...set] as V[]);
    } else {
      props.onChange(val);
      setOpen(false);
    }
  };

  const isSelected = (val: V) =>
    props.multiple ? props.value.includes(val) : props.value === val;

  return (
    <div ref={ref} className={cn('relative', fullWidth && 'w-full')}>
      {label && <div className="cd-caps text-text-mute mb-1">{label}</div>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        className={cn(
          'flex items-center justify-between gap-2 px-2.5 bg-bg border border-border rounded-sm',
          'hover:border-border-hi focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          heightClass,
          fullWidth && 'w-full',
        )}
      >
        <span className={cn('truncate', isPlaceholder && 'text-text-mute')}>{summary}</span>
        <ChevronDown size={14} className="text-text-mute shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-multiselectable={props.multiple}
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-surface border border-border rounded-sm shadow-md py-1"
        >
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={isSelected(o.value)}
              onClick={() => toggle(o.value)}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer',
                'hover:bg-row-hover',
                isSelected(o.value) && 'text-text',
              )}
            >
              <span className="w-3.5 inline-flex items-center justify-center">
                {isSelected(o.value) && <Check size={12} className="text-accent" aria-hidden="true" />}
              </span>
              <span className="flex-1 truncate">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Select;
