import type { KYTFlagCode } from '../../types';
import { kytFlagLabel, kytFlagTone } from '../../lib/risk';
import Badge from '../primitives/Badge';

type Props = {
  code: KYTFlagCode;
};

/**
 * Inline KYT-флаг для строк в реестре транзакций или Дашборде.
 * Wrapper над Badge с маппингом code → label/tone.
 */
export default function KYTFlag({ code }: Props) {
  return (
    <Badge tone={kytFlagTone[code]} dot role="status">
      {kytFlagLabel[code]}
    </Badge>
  );
}
