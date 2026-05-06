import { Lock } from 'lucide-react';
import EmptyState from '../layout/EmptyState';

type Props = {
  /** Что именно недоступно — для подстановки в заголовок. */
  resource?: string;
};

/**
 * Full-page lock-state — current user не имеет нужного permission.
 * Используется на любой странице после permission-проверки.
 *
 * Generic shared variant (Phase E1). Phase C (clients-list) и
 * Phase E1 (client-card) импортируют из этого места с разным
 * `resource`. Permission-name (CLIENT_READ etc.) НЕ выводится в UI —
 * пользователь не знает кодов; пишем human-readable формулировку.
 */
export default function NoRightsState({ resource = 'этому разделу' }: Props) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <EmptyState
        icon={Lock}
        title={`Нет доступа к ${resource}`}
        description="У вашей роли нет прав для просмотра этого раздела. Обратитесь к администратору тенанта."
      />
    </div>
  );
}
