/**
 * ComplianceDesk · Доменная модель.
 * Скопируй в src/types/ и разбей по файлам по доменам.
 */

// ─── Общие ────────────────────────────────────────────────────────────────

export type ID = string;
export type ISODate = string;             // "2026-04-28T14:32:11Z"
export type DateOnly = string;            // "1985-03-22"
export type CountryCode = string;         // ISO-3166-1 alpha-2: "KG", "RU"
export type CurrencyCode = string;        // ISO-4217: "KGS", "USD", "USDT"
export type ChainAddress = string;        // "0xab12...c4f0" or "tb1q..."

export type Locale = 'ru';                // на старте только русский

// ─── Клиент ───────────────────────────────────────────────────────────────

export type ClientType = 'pf' | 'le';     // ФЛ / ЮЛ
export type ClientStatus =
  | 'draft'           // создан, не подан
  | 'submitted'       // подан на проверку
  | 'in_review'       // в работе у офицера
  | 'awaiting_docs'   // запрошены документы
  | 'approved'        // одобрен
  | 'rejected'        // отказ
  | 'suspended'       // приостановлен
  | 'closed';         // закрыт

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskScore {
  total: number;                          // 0–100
  level: RiskLevel;
  categories: {
    profile: number;                      // A
    assets: number;                       // B
    transactions: number;                 // C
    control: number;                      // D
  };
  updatedAt: ISODate;
  overrideTrigger?: OverrideTrigger;
}

export interface OverrideTrigger {
  code: string;                           // "C4.5"
  reason: string;                         // "Прямая связь с санкционным адресом ≤1 hop"
  forcedLevel: RiskLevel;                 // critical
  triggeredAt: ISODate;
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
  inn: string;                            // 14 цифр для ЮЛ, 14 для ФЛ
  fileNumber: string;                     // "ЮЛ-2026-00481"
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
    series: string;                       // "AN"
    number: string;                       // "0123456"
    issuedBy: string;
    issuedAt: DateOnly;
    expiresAt: DateOnly;
  };
  registrationAddress: Address;
  factualAddress?: Address;
  pep: boolean;                           // публичное должностное лицо
  pepDetails?: string;
}

export interface LeClient extends ClientBase {
  type: 'le';
  fullName: string;
  shortName: string;
  okpo: string;                           // 8 цифр
  registeredAt: DateOnly;
  registeredBy: string;                   // "Минюст КР, г. Бишкек"
  legalAddress: Address;
  factualAddress?: Address;
  industry: string;
  beneficialOwners: BeneficialOwner[];    // см. UBO
  signatories: Signatory[];
  authorizedCapital: Money;
  licenses: License[];
}

export type Client = PfClient | LeClient;

export interface Address {
  postalCode?: string;
  country: CountryCode;
  region: string;
  city: string;
  street: string;
  building: string;
  apartment?: string;
  raw?: string;                           // полная строка
}

export interface Signatory {
  id: ID;
  fullName: string;
  position: string;
  inn?: string;
  basis: string;                          // "Устав", "Доверенность №..."
}

export interface License {
  id: ID;
  number: string;
  issuedBy: string;
  issuedAt: DateOnly;
  expiresAt?: DateOnly;
  scope: string;
}

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

// ─── УБО ──────────────────────────────────────────────────────────────────

export interface BeneficialOwner {
  id: ID;
  type: 'natural' | 'legal';
  fullName: string;
  inn?: string;
  citizenship?: CountryCode;
  share: number;                          // 0..100
  controlBasis: 'direct' | 'indirect' | 'control_agreement' | 'other';
  pep: boolean;
  parents: ID[];                          // ребро вверх по структуре
}

export interface UBOTree {
  rootClientId: ID;
  nodes: BeneficialOwner[];
  edges: { from: ID; to: ID; share: number }[];
}

// ─── Документы ────────────────────────────────────────────────────────────

export type DocumentType =
  | 'passport' | 'inn_cert' | 'registration_cert' | 'charter' | 'license'
  | 'financial_report' | 'questionnaire' | 'pep_declaration' | 'other';

export type DocumentStatus = 'missing' | 'uploaded' | 'verified' | 'rejected' | 'expired';

export interface Document {
  id: ID;
  clientId: ID;
  type: DocumentType;
  name: string;
  status: DocumentStatus;
  uploadedAt?: ISODate;
  uploadedBy?: ID;
  verifiedAt?: ISODate;
  verifiedBy?: ID;
  expiresAt?: DateOnly;
  fileUrl?: string;
  sizeBytes?: number;
  mime?: string;
  rejectReason?: string;
  version: number;
}

// ─── Санкции ──────────────────────────────────────────────────────────────

export type SanctionList =
  | 'KG_GSFR'      // ГСФР КР
  | 'OFAC_SDN'     // США
  | 'EU_CFSP'      // ЕС
  | 'UN_SC'        // ООН
  | 'UK_OFSI'      // Великобритания
  | 'INTERPOL'
  | 'INTERNAL';    // внутренний стоп-лист

export type SanctionMatchStatus =
  | 'new' | 'in_review' | 'true_match' | 'false_positive' | 'discharged';

export interface SanctionMatch {
  id: ID;
  clientId: ID;
  list: SanctionList;
  matchedField: 'name' | 'inn' | 'address' | 'wallet' | 'phone';
  matchedValue: string;
  similarity: number;                     // 0..1
  recordRef: string;                      // ID записи в санкционном списке
  recordSummary: string;                  // human-readable
  detectedAt: ISODate;
  status: SanctionMatchStatus;
  decision?: SanctionDecision;
}

export interface SanctionDecision {
  decidedBy: ID;
  decidedAt: ISODate;
  outcome: 'true_match' | 'false_positive';
  rationale: string;
  attachments: ID[];                      // document IDs
}

// ─── Транзакции / KYT ─────────────────────────────────────────────────────

export type TransactionDirection = 'in' | 'out';
export type TransactionStatus =
  | 'pending' | 'completed' | 'flagged' | 'blocked' | 'released' | 'reversed';

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
  fiatAmount: Money;                      // в KGS на момент операции
  rate: number;                           // курс актив/KGS
  counterpartyAddress?: ChainAddress;
  counterpartyName?: string;
  counterpartyJurisdiction?: CountryCode;
  txHash?: string;
  network?: string;                       // "tron", "ethereum"
  initiatedAt: ISODate;
  completedAt?: ISODate;
  flags: KYTFlag[];
  blockedReason?: string;
  releasedBy?: ID;
  releasedAt?: ISODate;
}

// ─── История / Аудит ──────────────────────────────────────────────────────

export type AuditEventType =
  | 'client.created'
  | 'client.status_changed'
  | 'client.assigned'
  | 'document.uploaded'
  | 'document.verified'
  | 'risk.recalculated'
  | 'risk.override'
  | 'sanction.match'
  | 'sanction.discharged'
  | 'transaction.flagged'
  | 'transaction.released'
  | 'transaction.blocked'
  | 'note.added'
  | 'login'
  | 'permission.changed';

export interface AuditEvent {
  id: ID;
  clientId?: ID;
  actorId: ID;
  actorName: string;
  actorRole: string;
  type: AuditEventType;
  summary: string;
  details?: Record<string, unknown>;
  at: ISODate;
  ip?: string;
  before?: unknown;
  after?: unknown;
}

// ─── Пользователи / Роли ──────────────────────────────────────────────────

export type Role =
  | 'compliance_officer'
  | 'compliance_lead'
  | 'operator'
  | 'admin'
  | 'auditor'
  | 'client';

export interface Permission {
  resource: string;                       // "clients", "transactions", "admin.users"
  actions: ('view' | 'create' | 'edit' | 'delete' | 'approve' | 'override')[];
}

export interface User {
  id: ID;
  fullName: string;
  email: string;
  phone?: string;
  role: Role;
  permissions: Permission[];
  active: boolean;
  lastLoginAt?: ISODate;
  createdAt: ISODate;
}

// ─── Скоринг — конфигурация ───────────────────────────────────────────────

export interface ScoringRule {
  id: ID;
  code: string;                           // "C4.5"
  category: 'profile' | 'assets' | 'transactions' | 'control';
  title: string;
  description: string;
  weight: number;                         // вес в категории
  triggerOverride: boolean;               // поднимает до critical
  active: boolean;
}

// ─── Wizard / Онбординг ───────────────────────────────────────────────────

export interface WizardState<TData> {
  step: number;
  totalSteps: number;
  data: Partial<TData>;
  errors: Record<string, string>;
  status: 'editing' | 'submitting' | 'submitted';
}
