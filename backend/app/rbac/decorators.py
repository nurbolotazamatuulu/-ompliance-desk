"""
require_permission FastAPI dependency factory (Phase 1 RBAC block).

Gate routes on the current user having a specific Permission. Designed
for Phase 2+ usage; Phase 1 ships the helper without wiring it into
existing routers (those still use legacy permission checks).

Usage:
    from app.rbac import Permission, require_permission

    @router.post(
        "/clients",
        dependencies=[Depends(require_permission(Permission.CLIENT_WRITE))],
    )
    def create_client(...):
        ...

The dependency:

1. Fetches current_user via the existing get_current_user dependency
   (app.auth.get_current_user — same as existing legacy routes).

2. Resolves the user's V2 role:
   - if current_user.role_v2 is set, parse to UserRoleV2.
   - else fall back via USER_ROLE_MIGRATION_MAP[current_user.role].

   This fallback means RBAC works for existing AFG users immediately
   after deploy — they don't need migrate_user_roles.py to run before
   their requests can be authorized. The migration is purely a data-
   hygiene step; RBAC behavior is identical with or without it.

3. Calls can(role, permission). If False — HTTP 403 with the required
   permission name in the detail (no wildcard "forbidden" — debugging
   permission issues without that hint is painful).

403 vs 401: this dependency assumes authentication already succeeded
(get_current_user raises 401 itself). require_permission is purely an
authorization gate, so 403 is correct.
"""

import logging

from fastapi import Depends, HTTPException, status

from app.auth import get_current_user
from app.models import User
from app.rbac.matrix import RBAC_MATRIX, can
from app.rbac.permissions import Permission
from app.rbac.roles import USER_ROLE_MIGRATION_MAP, UserRoleV2

logger = logging.getLogger(__name__)


def _resolve_role_v2(user: User) -> UserRoleV2 | None:
    """
    Return the user's UserRoleV2, falling back to legacy role mapping.

    None if neither source produces a known V2 role — caller should
    treat this as "no permissions", same as an unknown role.
    """
    raw = getattr(user, "role_v2", None)
    if raw:
        try:
            role = UserRoleV2(raw)
        except ValueError:
            logger.warning(
                "User id=%s has unknown role_v2=%r; falling back to legacy role",
                getattr(user, "id", "?"), raw,
            )
        else:
            # Defence-in-depth: matrix completeness invariant is enforced
            # by test_matrix_covers_all_roles. If we reach here with a role
            # missing from RBAC_MATRIX, tests have drifted from production.
            # can() will still fail-closed, but log the root cause loudly.
            if role not in RBAC_MATRIX:
                logger.error(
                    "User id=%s has role_v2=%r which is not in RBAC_MATRIX. "
                    "Matrix drift — fix app.rbac.matrix.",
                    getattr(user, "id", "?"), raw,
                )
            return role
    legacy = getattr(user, "role", None)
    if legacy is None:
        return None
    return USER_ROLE_MIGRATION_MAP.get(legacy)


def require_permission(permission: Permission):
    """
    FastAPI dependency factory: gate the route on `permission`.

    Returns a dependency callable that resolves the current user's V2
    role (preferring User.role_v2, falling back to legacy User.role
    via USER_ROLE_MIGRATION_MAP) and checks RBAC_MATRIX.
    """

    def _dep(current_user: User = Depends(get_current_user)) -> User:
        role = _resolve_role_v2(current_user)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No role assigned; cannot grant {permission.value}",
            )
        if not can(role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value}",
            )
        return current_user

    return _dep
