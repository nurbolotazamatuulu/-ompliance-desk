"""
RBAC module — role-based permission matrix (Phase 1).

Public API:

    from app.rbac import (
        UserRoleV2,                   # canonical role enum
        USER_ROLE_MIGRATION_MAP,      # legacy UserRole → UserRoleV2 mapping
        Permission,                   # atomic permission enum
        RBAC_MATRIX,                  # role → frozenset[Permission]
        can,                          # can(role, permission) -> bool
        require_permission,           # FastAPI dependency factory
    )

Module layout:
    roles.py              UserRoleV2 enum + USER_ROLE_MIGRATION_MAP
    permissions.py        Permission enum + "how to add a permission" guide
    matrix.py             RBAC_MATRIX dict + can() checker
    decorators.py         require_permission() FastAPI dependency factory
    migrate_user_roles.py CLI: User.role → User.role_v2 (manual, NOT auto-run)

NOT re-exported on purpose:
    _resolve_role_v2          — private to decorators.py.
    migrate_user_roles, main  — CLI internals; run via
                                `python -m app.rbac.migrate_user_roles`.

Phase 1 → Phase 2 transition:
The RBAC infrastructure ships ready in Phase 1 but is NOT yet applied
to existing routers. Phase 2 router refactor will:
  1. Replace ad-hoc role checks with `Depends(require_permission(X))`.
  2. Run `migrate_user_roles --commit` to populate User.role_v2.
  3. Eventually drop User.role (legacy) once all callsites switch.

Until then, require_permission falls back to the legacy role via
USER_ROLE_MIGRATION_MAP transparently — RBAC works for existing AFG
users immediately on deploy.
"""

from app.rbac.decorators import require_permission
from app.rbac.matrix import RBAC_MATRIX, can
from app.rbac.permissions import Permission
from app.rbac.roles import USER_ROLE_MIGRATION_MAP, UserRoleV2

__all__ = [
    "UserRoleV2",
    "USER_ROLE_MIGRATION_MAP",
    "Permission",
    "RBAC_MATRIX",
    "can",
    "require_permission",
]
