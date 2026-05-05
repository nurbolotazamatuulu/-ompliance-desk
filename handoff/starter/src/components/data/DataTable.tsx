import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import Checkbox from '../primitives/Checkbox';

export type Column<T> = {
  id: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

export type SortState = { field: string; dir: 'asc' | 'desc' } | null;

export type RowTone = 'red' | 'orange' | 'green' | undefined;

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  rowTone?: (row: T) => RowTone;
  sticky?: boolean;
  density?: 'compact' | 'normal';
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
};

const VIRTUALIZE_THRESHOLD = 200;

const toneRowClass = (t: RowTone): string => {
  switch (t) {
    case 'red':
      return 'bg-red-soft';
    case 'orange':
      return 'bg-orange-soft';
    case 'green':
      return 'bg-green-soft';
    default:
      return '';
  }
};

const alignClass = (a: Column<unknown>['align']): string => {
  switch (a) {
    case 'right':
      return 'text-right';
    case 'center':
      return 'text-center';
    default:
      return 'text-left';
  }
};

export default function DataTable<T>(props: Props<T>) {
  const {
    columns,
    rows,
    rowKey,
    loading = false,
    empty,
    selectable = false,
    selectedIds = new Set<string>(),
    onSelectionChange,
    onRowClick,
    rowTone,
    sticky = true,
    density = 'compact',
    sort,
    onSortChange,
  } = props;

  const rowH = density === 'compact' ? 28 : 32;
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  const allSelected =
    selectable && rows.length > 0 && rows.every((r) => selectedIds.has(rowKey(r)));
  const someSelected = selectable && rows.some((r) => selectedIds.has(rowKey(r)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (allSelected) rows.forEach((r) => next.delete(rowKey(r)));
    else rows.forEach((r) => next.add(rowKey(r)));
    onSelectionChange(next);
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleSort = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return;
    if (sort?.field !== col.id) {
      onSortChange({ field: col.id, dir: 'desc' });
    } else if (sort.dir === 'desc') {
      onSortChange({ field: col.id, dir: 'asc' });
    } else {
      onSortChange(null);
    }
  };

  const renderRow = (row: T, idx: number, top?: number) => {
    const id = rowKey(row);
    const tone = rowTone?.(row);
    const isSelected = selectable && selectedIds.has(id);
    const positionStyle = top !== undefined
      ? { transform: `translateY(${top}px)`, position: 'absolute' as const, top: 0, left: 0, right: 0 }
      : undefined;
    return (
      <div
        key={id}
        role="row"
        aria-selected={isSelected || undefined}
        onClick={() => onRowClick?.(row)}
        className={cn(
          'flex items-center border-b border-border/50 cursor-pointer hover:bg-row-hover transition-colors',
          toneRowClass(tone),
        )}
        style={{ height: rowH, ...positionStyle }}
      >
        {selectable && (
          <div
            role="cell"
            className="px-2 shrink-0"
            style={{ width: 32 }}
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(id);
            }}
          >
            <Checkbox checked={isSelected} onChange={() => toggleRow(id)} ariaLabel="Выбрать строку" />
          </div>
        )}
        {columns.map((c) => (
          <div
            key={c.id}
            role="cell"
            className={cn('px-2 truncate', alignClass(c.align), c.className)}
            style={{ width: c.width, flex: c.width ? undefined : '1 1 0' }}
          >
            {c.cell(row)}
          </div>
        ))}
        <span className="sr-only">{`Row ${idx + 1}`}</span>
      </div>
    );
  };

  return (
    <div className="border border-border rounded-sm bg-surface flex flex-col min-h-[200px] max-h-[calc(100vh-260px)]">
      {/* Header */}
      <div
        role="row"
        className={cn(
          'flex items-center bg-elev border-b border-border-hi',
          sticky && 'sticky top-0 z-10',
        )}
        style={{ height: 32 }}
      >
        {selectable && (
          <div role="columnheader" className="px-2 shrink-0" style={{ width: 32 }}>
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && someSelected}
              onChange={toggleAll}
              ariaLabel="Выбрать все строки"
            />
          </div>
        )}
        {columns.map((c) => {
          const isSorted = sort?.field === c.id;
          const SortIcon = isSorted ? (sort?.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
          return (
            <div
              key={c.id}
              role="columnheader"
              aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              onClick={() => handleSort(c)}
              className={cn(
                'cd-caps px-2 truncate flex items-center gap-1',
                alignClass(c.align),
                c.sortable && 'cursor-pointer hover:text-text',
                c.className,
              )}
              style={{ width: c.width, flex: c.width ? undefined : '1 1 0' }}
            >
              <span>{c.header}</span>
              {c.sortable && <SortIcon size={10} className={isSorted ? 'text-accent' : 'text-text-ghost'} aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        {loading ? (
          <div className="flex flex-col">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="border-b border-border/50" style={{ height: rowH }}>
                <div className="m-1.5 h-4 bg-elev animate-pulse rounded-sm" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            {empty ?? <span className="text-sm text-text-mute">Нет данных</span>}
          </div>
        ) : shouldVirtualize ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) =>
              renderRow(rows[vRow.index], vRow.index, vRow.start),
            )}
          </div>
        ) : (
          rows.map((r, i) => renderRow(r, i))
        )}
      </div>
    </div>
  );
}
