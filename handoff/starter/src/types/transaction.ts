import type {
  ChainAddress,
  CountryCode,
  CurrencyCode,
  ID,
  ISODate,
  Money,
} from '.';

export type TransactionDirection = 'in' | 'out';

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'flagged'
  | 'blocked'
  | 'released'
  | 'reversed';

export type KYTFlagCode =
  | 'sanctioned_address'
  | 'mixer'
  | 'darknet_market'
  | 'high_risk_jurisdiction'
  | 'structuring'
  | 'velocity'
  | 'amount_threshold'
  | 'new_counterparty'
  | 'pep_counterparty';

export interface KYTFlag {
  code: KYTFlagCode;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
}

export interface Transaction {
  id: ID;
  clientId: ID;
  direction: TransactionDirection;
  status: TransactionStatus;
  asset: CurrencyCode;
  amount: number;
  fiatAmount: Money; // в KGS на момент операции
  rate: number; // курс актив/KGS
  counterpartyAddress?: ChainAddress;
  counterpartyName?: string;
  counterpartyJurisdiction?: CountryCode;
  txHash?: string;
  network?: string; // "tron", "ethereum"
  initiatedAt: ISODate;
  completedAt?: ISODate;
  flags: KYTFlag[];
  blockedReason?: string;
  releasedBy?: ID;
  releasedAt?: ISODate;
}
