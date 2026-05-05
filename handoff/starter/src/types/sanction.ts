import type { ID, ISODate } from '.';

export type SanctionList =
  | 'KG_GSFR' // ГСФР КР
  | 'OFAC_SDN' // США
  | 'EU_CFSP' // ЕС
  | 'UN_SC' // ООН
  | 'UK_OFSI' // Великобритания
  | 'INTERPOL'
  | 'INTERNAL'; // внутренний стоп-лист

export type SanctionMatchStatus =
  | 'new'
  | 'in_review'
  | 'true_match'
  | 'false_positive'
  | 'discharged';

export interface SanctionDecision {
  decidedBy: ID;
  decidedAt: ISODate;
  outcome: 'true_match' | 'false_positive';
  rationale: string;
  attachments: ID[]; // document IDs
}

export interface SanctionMatch {
  id: ID;
  clientId: ID;
  list: SanctionList;
  matchedField: 'name' | 'inn' | 'address' | 'wallet' | 'phone';
  matchedValue: string;
  similarity: number; // 0..1
  recordRef: string;
  recordSummary: string;
  detectedAt: ISODate;
  status: SanctionMatchStatus;
  decision?: SanctionDecision;
}
