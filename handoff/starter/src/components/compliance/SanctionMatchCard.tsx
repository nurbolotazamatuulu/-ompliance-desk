import type { SanctionMatch } from '../../types';
import { sanctionListLabel } from '../../lib/risk';
import { formatDateTime, formatNumber } from '../../lib/format';
import Badge from '../primitives/Badge';
import Button from '../primitives/Button';
import { cn } from '../../lib/cn';

type Props = {
  match: SanctionMatch;
  onTrueMatch?: (m: SanctionMatch) => void;
  onFalsePositive?: (m: SanctionMatch) => void;
};

const fieldLabel: Record<SanctionMatch['matchedField'], string> = {
  name: 'ФИО',
  inn: 'ИНН',
  address: 'Адрес',
  wallet: 'Кошелёк',
  phone: 'Телефон',
};

const statusBadge = (status: SanctionMatch['status']) => {
  switch (status) {
    case 'new':
      return <Badge tone="orange" dot role="status">НОВОЕ</Badge>;
    case 'in_review':
      return <Badge tone="yellow" dot role="status">В РАЗБОРЕ</Badge>;
    case 'true_match':
      return <Badge tone="red" dot role="status">ПОДТВЕРЖДЕНО</Badge>;
    case 'false_positive':
      return <Badge tone="green" dot role="status">ЛОЖНОЕ</Badge>;
    case 'discharged':
      return <Badge tone="neutral" dot role="status">СНЯТО</Badge>;
  }
};

const similarityTone = (s: number) => (s >= 0.95 ? 'red' : s >= 0.85 ? 'orange' : 'yellow');

export default function SanctionMatchCard({ match, onTrueMatch, onFalsePositive }: Props) {
  const isOpen = match.status === 'new' || match.status === 'in_review';
  return (
    <div
      className={cn(
        'border rounded-sm p-3 bg-surface flex flex-col gap-2',
        match.status === 'true_match' && 'border-red/35',
        match.status === 'false_positive' && 'border-green/35',
        isOpen && 'border-orange/35',
        match.status === 'discharged' && 'border-border',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone="blue">{sanctionListLabel[match.list]}</Badge>
          <Badge tone={similarityTone(match.similarity)}>
            {formatNumber(match.similarity * 100, 0)}%
          </Badge>
          {statusBadge(match.status)}
        </div>
        <span className="cd-caps text-text-mute shrink-0">{formatDateTime(match.detectedAt)}</span>
      </header>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <span className="cd-caps">Поле</span>
        <span className="font-mono">{fieldLabel[match.matchedField]}</span>
        <span className="cd-caps">Совпало</span>
        <span className="font-mono truncate">{match.matchedValue}</span>
        <span className="cd-caps">Запись</span>
        <span className="font-mono text-text-mute">{match.recordRef}</span>
      </div>
      <p className="text-sm text-text-dim">{match.recordSummary}</p>
      {isOpen && (
        <footer className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button variant="secondary" size="sm" onClick={() => onFalsePositive?.(match)}>
            Ложное
          </Button>
          <Button variant="danger" size="sm" onClick={() => onTrueMatch?.(match)}>
            Истинное совпадение
          </Button>
        </footer>
      )}
    </div>
  );
}
