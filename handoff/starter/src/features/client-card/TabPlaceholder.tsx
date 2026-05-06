/**
 * Generic placeholder для всех 8 вкладок ClientCard в Phase E1.
 *
 * UI-copy: "{title} (в разработке)" / subtitle. Никаких внутренних
 * Phase-кодов (E2a/E3/Этап 4) в UI — пользователь не должен видеть
 * наш план разработки.
 *
 * Internal mapping (для разработчиков, НЕ в UI):
 *   /anketa       → Phase E2a/E2b (анкета ФЛ + ЮЛ)
 *   /scoring      → Phase E3
 *   /sanctions    → Phase E3
 *   /bv           → Phase E2c (БВ tab + 16-variant controlBasis)
 *   /documents    → Stage 3 (трекер документов)
 *   /ubo          → Stage 4 (UBO граф reactflow)
 *   /transactions → Stage 8 backend + Phase 2+ frontend
 *   /history      → Stage 3 (audit-log feed)
 */

import type { LucideIcon } from 'lucide-react';
import EmptyState from '../../components/layout/EmptyState';

type Props = {
  icon: LucideIcon;
  /** Имя вкладки. Финальная строка получает суффикс " (в разработке)". */
  title: string;
  subtitle: string;
};

export default function TabPlaceholder({ icon, title, subtitle }: Props) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <EmptyState icon={icon} title={`${title} (в разработке)`} description={subtitle} />
    </div>
  );
}
