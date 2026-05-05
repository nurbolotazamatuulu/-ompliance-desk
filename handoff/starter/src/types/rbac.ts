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
 * Маппинг legacy role string → UserRoleV2.
 *
 * Объединённый set из ДВУХ независимых legacy-enum'ов:
 *
 *   1. Handoff frontend Role (handoff/spec/data-model.ts + handoff/starter/src/types/index.ts):
 *      compliance_officer / compliance_lead / operator / admin / auditor / client
 *      Используется в текущих mocks/users.ts при работе frontend в Stage 2/3.
 *
 *   2. Backend legacy UserRole (backend/app/models.py UserRole):
 *      super_admin / company_admin / compliance_officer / manager / read_only
 *      Прилетит в Phase 2 router refactor когда frontend интегрируется
 *      с backend session (JWT claims или /auth/me).
 *
 * Stage 2 — переходный период; `mapLegacyRole` должен быть resilient
 * к обоим источникам.
 *
 * После Phase 2 — заменяется прямым `role_v2` в session, эта функция уйдёт.
 *
 * ⚠️ Conflict warning на ключе "admin":
 *   - В handoff Role 'admin' = tenant-level админ ОВА → 'tenant_admin'.
 *   - В backend UserRole 'admin' НЕ существует (есть super_admin и company_admin).
 *   - Если в будущем backend добавит plain 'admin' — semantic будет неоднозначен.
 *     Сейчас обрабатываем как handoff-side значение → 'tenant_admin'.
 */
const LEGACY_TO_V2: Record<string, UserRoleV2> = {
  // ── Handoff frontend roles (types/index.ts:41-45, mocks/users.ts) ──
  compliance_lead: 'tenant_admin', // handoff "lead" — senior compliance в одном tenant
  compliance_officer: 'compliance_officer',
  operator: 'analyst', // handoff "operator" — back-office, read-mostly
  admin: 'tenant_admin', // handoff "admin" — tenant-level админ ОВА (АФГ MVP)
  auditor: 'analyst', // handoff "auditor" — read-only review
  client: 'client_user',

  // ── Backend legacy roles (backend/app/models.py UserRole, для Phase 2 integration) ──
  super_admin: 'super_admin', // backend vendor-level (cross-tenant)
  company_admin: 'tenant_admin', // backend tenant админ (≡ handoff "admin")
  manager: 'compliance_officer', // defensive fallback (см. q_rbac_a) — НЕ analyst
  read_only: 'analyst',
};

export const mapLegacyRole = (role: string): UserRoleV2 =>
  LEGACY_TO_V2[role] ?? 'client_user';
