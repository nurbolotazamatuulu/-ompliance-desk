import type { Client, SanctionList, SanctionMatch } from '../types';
import { isoDateBetween, pad, pick, rng } from './_rng';
import { CLIENTS } from './clients';

export const generateSanctionMatches = (clients: Client[]): SanctionMatch[] => {
  const lists: SanctionList[] = ['KG_GSFR', 'OFAC_SDN', 'EU_CFSP', 'UN_SC', 'UK_OFSI', 'INTERNAL'];
  const out: SanctionMatch[] = [];
  clients.forEach((c, i) => {
    if (rng() > 0.85) {
      out.push({
        id: `SM-${pad(i, 5)}`,
        clientId: c.id,
        list: pick(lists),
        matchedField: pick(['name', 'inn', 'address', 'wallet'] as const),
        matchedValue: c.type === 'le' ? c.shortName : `${c.lastName} ${c.firstName}`,
        similarity: +(0.7 + rng() * 0.3).toFixed(2),
        recordRef: 'REF-' + pad(Math.floor(rng() * 99999), 5),
        recordSummary: 'Запись из санкционного списка с похожими реквизитами',
        detectedAt: isoDateBetween(new Date('2026-03-01'), new Date('2026-05-03')),
        status: pick(['new', 'in_review', 'false_positive', 'true_match'] as const),
      });
    }
  });
  return out;
};

export const SANCTIONS: SanctionMatch[] = generateSanctionMatches(CLIENTS);
