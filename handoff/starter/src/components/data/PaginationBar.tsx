import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Button from '../primitives/Button';

type Props = {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
};

/**
 * Pagination для DataTable. Показывает диапазон + total + nav кнопки.
 * Используется когда виртуализация не активна (rows ≤ 200) либо когда
 * server-side pagination (Q-frontend-A, Phase 2 switch).
 */
export default function PaginationBar({ page, perPage, total, onChange }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const canPrev = page > 1;
  const canNext = page < lastPage;

  return (
    <div className="flex items-center justify-between gap-4 px-4 h-10 border-t border-border bg-surface">
      <span className="cd-caps text-text-mute">
        {start}–{end} из {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronsLeft}
          disabled={!canPrev}
          onClick={() => onChange(1)}
          aria-label="Первая страница"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronLeft}
          disabled={!canPrev}
          onClick={() => onChange(page - 1)}
          aria-label="Предыдущая страница"
        />
        <span className="cd-caps mx-2">
          {page} / {lastPage}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronRight}
          disabled={!canNext}
          onClick={() => onChange(page + 1)}
          aria-label="Следующая страница"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={ChevronsRight}
          disabled={!canNext}
          onClick={() => onChange(lastPage)}
          aria-label="Последняя страница"
        />
      </div>
    </div>
  );
}
