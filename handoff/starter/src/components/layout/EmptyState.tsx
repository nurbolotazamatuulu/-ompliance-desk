import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

/**
 * Пустое состояние страницы или таблицы — иконка-плейсхолдер,
 * заголовок и опциональный CTA.
 */
export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 max-w-[360px] mx-auto">
      {Icon && <Icon size={32} className="text-text-ghost mb-3" aria-hidden="true" />}
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-mute">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
