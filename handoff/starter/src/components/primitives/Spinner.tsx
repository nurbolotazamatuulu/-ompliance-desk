import { cn } from '../../lib/cn';

type SpinnerSize = 'xs' | 'sm' | 'md';

const sizes: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border',
  md: 'h-5 w-5 border-2',
};

type Props = {
  size?: SpinnerSize;
  className?: string;
  'aria-label'?: string;
};

export default function Spinner({ size = 'sm', className, ...rest }: Props) {
  return (
    <span
      role="status"
      aria-label={rest['aria-label'] ?? 'Загрузка'}
      className={cn(
        'inline-block rounded-pill border-current border-r-transparent animate-spin',
        sizes[size],
        className,
      )}
    />
  );
}
