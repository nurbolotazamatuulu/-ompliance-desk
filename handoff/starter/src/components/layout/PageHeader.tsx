import type { ReactNode } from 'react';

type Props = {
  /** Хлебная крошка cd-caps mono над заголовком. */
  breadcrumb?: string;
  /** Главный заголовок страницы (15px semibold). */
  title: string;
  /** Подзаголовок mono (опц.). */
  subtitle?: ReactNode;
  /** Action-bar справа — кнопки или переключатели. */
  actions?: ReactNode;
};

export default function PageHeader({ breadcrumb, title, subtitle, actions }: Props) {
  return (
    <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="cd-caps mb-1">{breadcrumb}</div>}
        <h1 className="text-lg font-semibold text-text leading-tight">{title}</h1>
        {subtitle && (
          <div className="mt-1 text-sm text-text-mute font-mono truncate">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
