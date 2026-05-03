"""
RBAC matrix + can() checker (Phase 1 RBAC block).

RBAC_MATRIX is a declarative role → frozenset[Permission] map. The
single public entry point for permission checks is `can(role,
permission)` — all higher-level helpers (decorators, routers, scripts)
go through it.

Design notes:

- SUPER_ADMIN is built with `frozenset(Permission)` so it
  automatically inherits every new permission added to the enum. This
  is INTENTIONAL: forgetting to grant a new permission to SUPER_ADMIN
  has historically been a source of "vendor support can't fix prod"
  incidents. The cost is that downgrading SUPER_ADMIN's blast radius
  requires explicit subtraction; we accept that trade-off.

- Other roles use explicit frozenset literals — adding a new permission
  must be a deliberate decision per role, not silently inherited.

- Unknown roles return False from can() (defence-in-depth). A user
  with a role we don't recognize gets ZERO permissions, not "all" or
  "default" — fail closed.

- Sets are O(1) for membership; can() does not need caching at this
  scale (~5 roles × ~12 permissions in Phase 1).

INVARIANT (asserted in test_rbac.py::test_matrix_covers_all_roles):
RBAC_MATRIX MUST have a key for every UserRoleV2 value. The fail-closed
behavior of can() on missing keys is defence-in-depth, not a substitute
for matrix completeness.
"""

from app.rbac.permissions import Permission
from app.rbac.roles import UserRoleV2


RBAC_MATRIX: dict[UserRoleV2, frozenset[Permission]] = {
    # Vendor-level. Auto-includes every permission in the enum.
    UserRoleV2.SUPER_ADMIN: frozenset(Permission),

    # Tenant-level admin (e.g. АФГ admin). Manages users + config внутри
    # своего tenant'а + читает audit. Lifecycle своего tenant'а
    # (provision/suspend/terminate) — vendor-only: это billing/contract
    # уровень, не self-service. Поэтому TENANT_PROVISION/SUSPEND/TERMINATE
    # не выдаются TENANT_ADMIN ни при каких условиях.
    UserRoleV2.TENANT_ADMIN: frozenset({
        Permission.TENANT_VIEW,
        Permission.USER_INVITE,
        Permission.USER_REVOKE,
        Permission.USER_RESET_PASSWORD,
        Permission.CLIENT_READ,
        Permission.CLIENT_WRITE,
        Permission.CLIENT_APPROVE,
        Permission.AUDIT_VIEW,
        Permission.CONFIG_CHANGE,
    }),

    # Day-to-day compliance work on clients.
    UserRoleV2.COMPLIANCE_OFFICER: frozenset({
        Permission.CLIENT_READ,
        Permission.CLIENT_WRITE,
        Permission.CLIENT_APPROVE,
        Permission.AUDIT_VIEW,
    }),

    # Read-only on clients (reports, dashboards). No audit access —
    # audit is sensitive and gated to admin/officer roles.
    UserRoleV2.ANALYST: frozenset({Permission.CLIENT_READ}),

    # Phase 2+ self-service portal users (the tenant's own customers).
    # No backend permissions in Phase 1 — they interact via a separate
    # client-facing API.
    UserRoleV2.CLIENT_USER: frozenset(),
}


def can(role: UserRoleV2, permission: Permission) -> bool:
    """
    Return True iff `role` is granted `permission` by RBAC_MATRIX.

    Unknown roles (not in the matrix) return False — fail closed. This
    means any future enum value that is added to UserRoleV2 but not
    yet wired into the matrix gets zero permissions until explicitly
    granted.
    """
    return permission in RBAC_MATRIX.get(role, frozenset())
