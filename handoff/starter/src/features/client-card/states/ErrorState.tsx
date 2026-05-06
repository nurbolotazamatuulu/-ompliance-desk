import { AlertTriangle } from 'lucide-react';
import EmptyState from '../../../components/layout/EmptyState';
import Button from '../../../components/primitives/Button';

type Props = { onRetry: () => void };

/**
 * Общая ошибка загрузки клиента — `useClient(id)` бросил error.
 * (Network failure, mock crash, etc.)
 */
export default function ErrorState({ onRetry }: Props) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <EmptyState
        icon={AlertTriangle}
        title="Не удалось загрузить карточку"
        description="Произошла ошибка при получении данных клиента. Попробуйте ещё раз."
        action={
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        }
      />
    </div>
  );
}
