import { RotateCcw, Search } from 'lucide-react';
import EmptyState from '../../../components/layout/EmptyState';
import Button from '../../../components/primitives/Button';

type Props = {
  onResetFilters: () => void;
};

/**
 * Filters активны, но total === 0 — нет совпадений.
 * Reset filters action — обнуляет URL state.
 */
export default function EmptyResultsState({ onResetFilters }: Props) {
  return (
    <div className="border border-border rounded-sm bg-surface min-h-[400px] flex items-center justify-center">
      <EmptyState
        icon={Search}
        title="По вашим фильтрам ничего не найдено"
        description="Уточните или сбросьте критерии."
        action={
          <Button variant="secondary" icon={RotateCcw} onClick={onResetFilters}>
            Сбросить фильтры
          </Button>
        }
      />
    </div>
  );
}
