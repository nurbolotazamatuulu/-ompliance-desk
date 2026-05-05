import { cn } from '../../lib/cn';

type Variant = 'text' | 'circle' | 'rect' | 'table-row';

type Props = {
  variant?: Variant;
  className?: string;
  width?: number | string;
  height?: number | string;
};

const variantClass: Record<Variant, string> = {
  text: 'h-3 rounded-sm',
  circle: 'rounded-pill',
  rect: 'rounded-sm',
  'table-row': 'h-8 rounded-sm',
};

export default function Skeleton({ variant = 'text', className, width, height }: Props) {
  return (
    <span
      aria-hidden="true"
      style={{ width, height }}
      className={cn(
        'inline-block bg-elev animate-pulse',
        variantClass[variant],
        variant === 'text' && !width && 'w-full',
        className,
      )}
    />
  );
}
