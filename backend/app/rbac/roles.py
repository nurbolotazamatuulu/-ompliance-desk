"""
UserRoleV2 enum + legacy → V2 migration map (Phase 1 RBAC block).

UserRoleV2 is the canonical role enum for permission checks via the
RBAC matrix in app.rbac.matrix. The legacy app.models.UserRole is kept
operational for backward compat until Phase 2 router refactor; this
module bridges the two.
"""

import enum

from app.models import UserRole


class UserRoleV2(str, enum.Enum):
    """
    Roles used by the Phase 1+ RBAC matrix.

    Stored as String(30) on User.role_v2 — same rationale as
    AuditCategory: extending the role list does not require ALTER TYPE
    on PG, and string comparison is universal across SQLite test DBs.

    Roles:
        SUPER_ADMIN        — vendor-level (ComplianceDesk operators).
                             Cross-tenant administrative access.
                             NOT a tenant role; created only via
                             vendor-side provisioning script (out of
                             scope for migrate_user_roles.py).
        TENANT_ADMIN       — admin of a single ОВА (tenant). Manages
                             users, configuration, audit access within
                             the tenant.
        COMPLIANCE_OFFICER — performs KYC/CDD, screening, risk scoring
                             on clients of one tenant.
        ANALYST            — read-only on clients (reports, dashboards).
        CLIENT_USER        — Phase 2+ self-service portal users (the
                             tenant's own customers). No permissions
                             in the Phase 1 matrix.
    """

    SUPER_ADMIN = "super_admin"
    TENANT_ADMIN = "tenant_admin"
    COMPLIANCE_OFFICER = "compliance_officer"
    ANALYST = "analyst"
    CLIENT_USER = "client_user"


# Legacy → V2 mapping. Used by:
#   - migrate_user_roles.py to populate User.role_v2 from User.role.
#   - rbac.decorators.require_permission as on-the-fly fallback when
#     a user's role_v2 IS NULL (pre-migration). This means RBAC works
#     for existing AFG users immediately after deploy — migration is a
#     pure data-hygiene step.
#
# Mapping rationale (each entry is a deliberate decision; do NOT change
# without re-reading these notes — they encode operational reasoning):
#
#   UserRole.SUPER_ADMIN → UserRoleV2.TENANT_ADMIN
#       Legacy SUPER_ADMIN was a tenant-level admin role — the
#       ComplianceDesk MVP did not distinguish vendor (ComplianceDesk
#       operators) from tenant (АФГ client) admin. All existing АФГ
#       users with legacy SUPER_ADMIN are de-facto tenant admins and
#       must migrate to TENANT_ADMIN. Vendor SUPER_ADMIN users (cross-
#       tenant) are created by a separate vendor provisioning script
#       — see migrate_user_roles.py module-level WARNING. After
#       migration NO existing AFG user should remain SUPER_ADMIN.
#
#   UserRole.COMPANY_ADMIN → UserRoleV2.TENANT_ADMIN
#       Direct correspondence — both are tenant admin roles.
#
#   UserRole.COMPLIANCE_OFFICER → UserRoleV2.COMPLIANCE_OFFICER
#       Direct correspondence — same role name, same intent.
#
#   UserRole.MANAGER → UserRoleV2.COMPLIANCE_OFFICER
#       Defensive fallback. If a MANAGER user in АФГ has write
#       operations attached to their day-to-day workflow, downgrading
#       them to ANALYST (CLIENT_READ only) would break their work.
#       Mapping to COMPLIANCE_OFFICER preserves full client read/
#       write/approve. Operations team can manually downgrade specific
#       MANAGER users to ANALYST after migration if read-only is the
#       actual intent (see Q-rbac-A — future set_user_role helper).
#
#   UserRole.READ_ONLY → UserRoleV2.ANALYST
#       Direct correspondence — both are read-only roles.
USER_ROLE_MIGRATION_MAP: dict[UserRole, UserRoleV2] = {
    UserRole.SUPER_ADMIN: UserRoleV2.TENANT_ADMIN,
    UserRole.COMPANY_ADMIN: UserRoleV2.TENANT_ADMIN,
    UserRole.COMPLIANCE_OFFICER: UserRoleV2.COMPLIANCE_OFFICER,
    UserRole.MANAGER: UserRoleV2.COMPLIANCE_OFFICER,
    UserRole.READ_ONLY: UserRoleV2.ANALYST,
}
