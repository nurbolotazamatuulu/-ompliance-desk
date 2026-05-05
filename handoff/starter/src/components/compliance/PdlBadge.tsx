import { Crown } from 'lucide-react';
import Badge from '../primitives/Badge';

/**
 * Маленький бейдж "ПДЛ" для лиц с `is_pdl=true` (БВ, ФЛ-клиент, член семьи).
 * Используется в карточках БВ, рядом с ФИО, в Реестре клиентов как indicator.
 */
export default function PdlBadge() {
  return (
    <Badge tone="orange" role="status">
      <Crown size={10} className="mr-1" aria-hidden="true" />
      ПДЛ
    </Badge>
  );
}
