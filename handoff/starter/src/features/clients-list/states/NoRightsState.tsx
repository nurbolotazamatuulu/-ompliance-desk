import { Lock } from 'lucide-react';
import EmptyState from '../../../components/layout/EmptyState';

/**
 * Current user не имеет CLIENT_READ permission.
 * Показывается на всю страницу.
 */
export default function NoRightsState() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <EmptyState
        icon={Lock}
        title="Нет доступа к реестру клиентов"
        description="У вашей роли отсутствует право CLIENT_READ. Обратитесь к администратору тенанта."
      />
    </div>
  );
}
