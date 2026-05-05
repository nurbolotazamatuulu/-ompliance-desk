import { RotateCcw, TriangleAlert } from 'lucide-react';
import EmptyState from '../../../components/layout/EmptyState';
import Button from '../../../components/primitives/Button';

type Props = {
  onRetry: () => void;
  message?: string;
};

/**
 * Network/backend error при listClients fetch.
 */
export default function ErrorState({ onRetry, message }: Props) {
  return (
    <div className="border border-red/35 bg-red-soft rounded-sm min-h-[400px] flex items-center justify-center">
      <EmptyState
        icon={TriangleAlert}
        title="Не удалось загрузить список клиентов"
        description={message ?? 'Произошла ошибка сети или сервера. Попробуйте обновить.'}
        action={
          <Button variant="secondary" icon={RotateCcw} onClick={onRetry}>
            Повторить
          </Button>
        }
      />
    </div>
  );
}
