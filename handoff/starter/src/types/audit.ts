import type { ID, ISODate } from '.';

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
