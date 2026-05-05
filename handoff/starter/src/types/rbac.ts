/**
 * RBAC permissions (Stage 2 frontend mock — Q-frontend-K).
 *
 * Real backend RBAC matrix живёт в `app.rbac` (Phase 1 Block 3 backend).
 * Stage 2 frontend опережает backend для двух permissions —
 * RISK_OVERRIDE и PEP_APPROVE — нужны для ApprovalDialog gating.
 *
 * Stage 2 минимальный набор permissions; backend RBAC_MATRIX имеет
 * 12 значений (TENANT_PROVISION, TENANT_SUSPEND, TENANT_TERMINATE,
 * USER_INVITE, USER_REVOKE, USER_RESET_PASSWORD не входят в Stage 2 —
 * для admin-screens Stage 4).
 *
 * При Phase 2 backend integration: убрать ROLE_PERMISSIONS_MOCK,
 * useCurrentPermissions становится hook от current backend session
 * (через JWT claims или /auth/me endpoint).
 */

export type Permission =
  | 'CLIENT_READ'
  | 'CLIENT_WRITE'
  | 'CLIENT_APPROVE'
  | 'AUDIT_VIEW'
  | 'CONFIG_CHANGE'
  | 'TENANT_VIEW'
  | 'RISK_OVERRIDE' // Q-frontend-K — Stage 2 frontend ahead
  | 'PEP_APPROVE'; // Q-frontend-K — Stage 2 frontend ahead

/**
 * UserRoleV2 — копия из backend `app.rbac.roles.UserRoleV2` (Phase 1 Block 3).
 * При Phase 2 frontend integration с backend types — заменить на shared module.
 */
export type UserRoleV2 =
  | 'super_admin'
  | 'tenant_admin'
  | 'compliance_officer'
  | 'analyst'
  | 'client_user';

export const ROLE_PERMISSIONS_MOCK: Record<UserRoleV2, Set<Permission>> = {
  super_admin: new Set<Permission>([
    'CLIENT_READ',
    'CLIENT_WRITE',
    'CLIENT_APPROVE',
    'AUDIT_VIEW',
    'CONFIG_CHANGE',
    'TENANT_VIEW',
    'RISK_OVERRIDE',
    'PEP_APPROVE',
  ]),
  tenant_admin: new Set<Permission>([
    'CLIENT_READ',
    'CLIENT_WRITE',
    'CLIENT_APPROVE',
    'AUDIT_VIEW',
    'CONFIG_CHANGE',
    'TENANT_VIEW',
    'RISK_OVERRIDE',
    'PEP_APPROVE',
  ]),
  compliance_officer: new Set<Permission>([
    'CLIENT_READ',
    'CLIENT_WRITE',
    'CLIENT_APPROVE',
    'AUDIT_VIEW',
    'RISK_OVERRIDE',
    // PEP_APPROVE — только tenant_admin+
  ]),
  analyst: new Set<Permission>(['CLIENT_READ']),
  client_user: new Set<Permission>(),
};

/**
 * Маппинг legacy `User.role` (handoff types/index.ts) на UserRoleV2.
 * Используется до Phase 2 router refactor когда `current_user.role` —
 * legacy enum. После Phase 2 — replaced с прямым `role_v2` в session.
 */
const LEGACY_TO_V2: Record<string, UserRoleV2> = {
  compliance_lead: 'tenant_admin', // legacy "lead" ~ tenant_admin
  compliance_officer: 'compliance_officer',
  operator: 'analyst',
  admin: 'tenant_admin', // legacy "admin" — tenant-level в АФГ MVP
  auditor: 'analyst', // read-only audit как analyst для frontend
  client: 'client_user',
};

export const mapLegacyRole = (role: string): UserRoleV2 =>
  LEGACY_TO_V2[role] ?? 'client_user';
