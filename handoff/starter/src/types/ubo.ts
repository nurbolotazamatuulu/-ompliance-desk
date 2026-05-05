import type { CountryCode, ID } from '.';

export interface BeneficialOwner {
  id: ID;
  type: 'natural' | 'legal';
  fullName: string;
  inn?: string;
  citizenship?: CountryCode;
  share: number; // 0..100
  controlBasis: 'direct' | 'indirect' | 'control_agreement' | 'other';
  pep: boolean;
  parents: ID[]; // ребро вверх по структуре
}

export interface UBOTree {
  rootClientId: ID;
  nodes: BeneficialOwner[];
  edges: { from: ID; to: ID; share: number }[];
}
