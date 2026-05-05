import type { Client, KYTFlagCode, Transaction } from '../types';
import { isoDateBetween, pad, pick, range, rng } from './_rng';
import { CLIENTS } from './clients';

export const generateTransactions = (clients: Client[], n: number): Transaction[] => {
  const flags: KYTFlagCode[] = [
    'sanctioned_address',
    'mixer',
    'darknet_market',
    'high_risk_jurisdiction',
    'structuring',
    'velocity',
    'amount_threshold',
    'new_counterparty',
    'pep_counterparty',
  ];
  return range(n).map((i) => {
    const c = pick(clients);
    const flagged = rng() > 0.7;
    const blocked = flagged && rng() > 0.5;
    return {
      id: `TX-${pad(i + 1, 6)}`,
      clientId: c.id,
      direction: rng() > 0.5 ? 'in' : 'out',
      status: blocked ? 'blocked' : flagged ? 'flagged' : 'completed',
      asset: pick(['USDT', 'BTC', 'ETH', 'TRX', 'USDC']),
      amount: +(rng() * 50000).toFixed(4),
      fiatAmount: { amount: Math.floor(rng() * 5000000), currency: 'KGS' as const },
      rate: +(rng() * 90 + 80).toFixed(2),
      counterpartyAddress:
        '0x' + range(40).map(() => '0123456789abcdef'[Math.floor(rng() * 16)]).join(''),
      counterpartyJurisdiction: pick(['KG', 'RU', 'US', 'AE', 'SG', 'GB', 'TR', '??']),
      txHash:
        '0x' + range(64).map(() => '0123456789abcdef'[Math.floor(rng() * 16)]).join(''),
      network: pick(['tron', 'ethereum', 'bitcoin']),
      initiatedAt: isoDateBetween(new Date('2026-04-01'), new Date('2026-05-03')),
      flags: flagged
        ? [
            {
              code: pick(flags),
              severity: pick(['low', 'medium', 'high', 'critical'] as const),
              detail: 'Авто-детект KYT-фидом',
            },
          ]
        : [],
      blockedReason: blocked ? 'Совпадение по санкционному адресу' : undefined,
    } as Transaction;
  });
};

export const TRANSACTIONS: Transaction[] = generateTransactions(CLIENTS, 250);
