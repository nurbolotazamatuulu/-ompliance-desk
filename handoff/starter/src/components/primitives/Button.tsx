import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import Spinner from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
};

// Стилевая база — без теней, uppercase для primary/secondary, mono-разрядка.
const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-[26px] px-2.5 text-2xs gap-1.5',
  md: 'h-[30px] px-3 text-xs gap-2',
  lg: 'h-9 px-4 text-sm gap-2',
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-text-on-accent border border-accent hover:bg-accent-hover ' +
    'uppercase tracking-wide font-semibold focus-visible:ring-1 focus-visible:ring-accent',
  secondary:
    'bg-surface text-text border border-border hover:bg-elev hover:border-border-hi ' +
    'uppercase tracking-wide font-semibold focus-visible:ring-1 focus-visible:ring-accent',
  ghost:
    'bg-transparent text-text-dim border border-transparent hover:bg-row-hover hover:text-text ' +
    'tracking-base focus-visible:ring-1 focus-visible:ring-accent',
  danger:
    'bg-red text-white border border-red hover:opacity-90 ' +
    'uppercase tracking-wide font-semibold focus-visible:ring-1 focus-visible:ring-red',
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconPosition = 'left',
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 12 : 14;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center rounded-sm transition-colors focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClass[size],
        variantClass[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size="xs" aria-label="Загрузка" />
      ) : (
        Icon && iconPosition === 'left' && <Icon size={iconSize} aria-hidden="true" />
      )}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon size={iconSize} aria-hidden="true" />}
    </button>
  );
});

export default Button;
