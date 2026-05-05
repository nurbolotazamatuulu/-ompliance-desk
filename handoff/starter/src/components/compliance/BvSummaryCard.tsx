import type { BeneficialOwner } from '../../types';
import { formatNumber } from '../../lib/format';
import Badge from '../primitives/Badge';
import PdlBadge from './PdlBadge';
import { Link } from 'react-router-dom';

type Props = {
  /** Сжатый row для Главы 5 Анкеты-ЮЛ или Анкеты-ФЛ (has_bv=true). */
  bv: BeneficialOwner & { is_pdl?: boolean };
  /** Опциональный link на /clients/:id/bv для drill-in. */
  toBvTab?: string;
};

/**
 * Compact row для БВ summary в Анкете. Полная Анкета БВ — в drawer'е
 * на BVTab (Phase E2c).
 */
export default function BvSummaryCard({ bv, toBvTab }: Props) {
  const inner = (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-elev rounded-sm border border-border">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-text truncate">{bv.fullName}</span>
        {bv.is_pdl && <PdlBadge />}
        {bv.pep && !bv.is_pdl && <Badge tone="orange">PEP</Badge>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {bv.share > 0 && (
          <span className="cd-mono text-2xs text-text-dim">{formatNumber(bv.share, 1)}%</span>
        )}
        <Badge tone="neutral">{bv.controlBasis}</Badge>
      </div>
    </div>
  );
  if (toBvTab) {
    return (
      <Link to={toBvTab} className="block focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm">
        {inner}
      </Link>
    );
  }
  return inner;
}
