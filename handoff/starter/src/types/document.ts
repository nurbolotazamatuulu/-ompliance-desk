import type { DateOnly, ID, ISODate } from '.';

export type DocumentType =
  | 'passport'
  | 'inn_cert'
  | 'registration_cert'
  | 'charter'
  | 'license'
  | 'financial_report'
  | 'questionnaire'
  | 'pep_declaration'
  | 'other';

export type DocumentStatus =
  | 'missing'
  | 'uploaded'
  | 'verified'
  | 'rejected'
  | 'expired';

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
