import { Plus, Users } from 'lucide-react';
import EmptyState from '../../../components/layout/EmptyState';
import Button from '../../../components/primitives/Button';

type Props = {
  onCreate?: () => void;
};

/**
 * "Клиентов нет" — empty state когда tenant полностью пустой.
 * CTA → выпадашка create (ФЛ/ЮЛ) — Phase 2 onboarding wizards.
 */
export default function EmptyClientsState({ onCreate }: Props) {
  return (
    <div className="border border-border rounded-sm bg-surface min-h-[400px] flex items-center justify-center">
      <EmptyState
        icon={Users}
        title="Клиентов пока нет"
        description="Создайте первого клиента — физическое или юридическое лицо."
        action={
          <Button variant="primary" icon={Plus} onClick={onCreate}>
            Создать клиента
          </Button>
        }
      />
    </div>
  );
}
