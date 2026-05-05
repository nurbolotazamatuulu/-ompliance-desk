import { Download, FileText, UserPlus } from 'lucide-react';
import GenericBulkActionBar from '../../components/data/BulkActionBar';
import Button from '../../components/primitives/Button';
import { useUIStore } from '../../stores/ui';

type Props = {
  selectedIds: Set<string>;
  onClear: () => void;
};

/**
 * BulkActionBar для Реестра — 5 actions (Stage 2 mock toast'ы).
 * Real backend mutation actions — Phase 2 router refactor.
 */
export default function ClientsListBulkActionBar({ selectedIds, onClear }: Props) {
  const pushToast = useUIStore((s) => s.pushToast);
  const count = selectedIds.size;

  const mockAction = (label: string) => {
    pushToast({
      tone: 'info',
      title: label,
      description: `Применено к ${count} ${count === 1 ? 'клиенту' : 'клиентам'} (mock).`,
    });
    onClear();
  };

  return (
    <GenericBulkActionBar
      count={count}
      onClear={onClear}
      actions={
        <>
          <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => mockAction('Назначен офицер')}>
            Назначить офицера
          </Button>
          <Button variant="secondary" size="sm" onClick={() => mockAction('Статус изменён')}>
            Изменить статус
          </Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => mockAction('Запрос документов отправлен')}>
            Запросить документы
          </Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => mockAction('Экспорт CSV')}>
            CSV
          </Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => mockAction('Экспорт PDF')}>
            PDF
          </Button>
        </>
      }
    />
  );
}
