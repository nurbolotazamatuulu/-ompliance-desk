import { FileX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../../../components/layout/EmptyState';
import Button from '../../../components/primitives/Button';

/**
 * Клиент не найден — useClient(id) вернул undefined.
 * Route валиден, поэтому 404 не выбрасываем; показываем full-page EmptyState.
 */
export default function NotFoundState() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <EmptyState
        icon={FileX}
        title="Клиент не найден"
        description="Возможно, дело было удалено или передано другому тенанту. Откройте реестр и проверьте."
        action={
          <Button variant="secondary" onClick={() => navigate('/clients')}>
            К реестру
          </Button>
        }
      />
    </div>
  );
}
