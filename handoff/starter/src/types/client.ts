import type { Address, CountryCode, DateOnly, ID, ISODate, Money } from '.';

export type ClientType = 'pf' | 'le'; // ФЛ / ЮЛ

export type ClientStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'awaiting_docs'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'closed';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface OverrideTrigger {
  code: string; // "C4.5"
  reason: string; // "Прямая связь с санкционным адресом ≤1 hop"
  forcedLevel: RiskLevel; // critical
  triggeredAt: ISODate;
}

export interface RiskScore {
  total: number; // 0–100
  level: RiskLevel;
  categories: {
    profile: number; // A
    assets: number; // B
    transactions: number; // C
    control: number; // D
  };
  updatedAt: ISODate;
  overrideTrigger?: OverrideTrigger;
}

export interface ClientBase {
  id: ID;
  type: ClientType;
  status: ClientStatus;
  risk: RiskScore;
  createdAt: ISODate;
  updatedAt: ISODate;
  assignedOfficerId?: ID;
  slaDeadline?: ISODate;
  inn: string; // 14 цифр
  fileNumber: string; // "ЮЛ-2026-00481"
  tags: string[];
}

export interface PfClient extends ClientBase {
  type: 'pf';
  lastName: string;
  firstName: string;
  middleName?: string;
  birthDate: DateOnly;
  birthPlace: string;
  citizenship: CountryCode;
  passport: {
    series: string; // "AN"
    number: string; // "0123456"
    issuedBy: string;
    issuedAt: DateOnly;
    expiresAt: DateOnly;
  };
  registrationAddress: Address;
  factualAddress?: Address;
  pep: boolean;
  pepDetails?: string;
}

export interface Signatory {
  id: ID;
  fullName: string;
  position: string;
  inn?: string;
  basis: string; // "Устав", "Доверенность №..."
}

export interface License {
  id: ID;
  number: string;
  issuedBy: string;
  issuedAt: DateOnly;
  expiresAt?: DateOnly;
  scope: string;
}

export interface LeClient extends ClientBase {
  type: 'le';
  fullName: string;
  shortName: string;
  okpo: string; // 8 цифр
  registeredAt: DateOnly;
  registeredBy: string; // "Минюст КР, г. Бишкек"
  legalAddress: Address;
  factualAddress?: Address;
  industry: string;
  // Полный список бенефициаров и подписантов лежит в UBOTree / отдельном API,
  // но мок генерирует пустые массивы для скорости — поэтому свойства
  // объявлены опциональными в type-сигнатуре.
  beneficialOwners: import('./ubo').BeneficialOwner[];
  signatories: Signatory[];
  authorizedCapital: Money;
  licenses: License[];
}

export type Client = PfClient | LeClient;
