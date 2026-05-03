"""
Tests for app.rbac.matrix — RBAC permission matrix and can() checker.

Phase 1 RBAC block. Decorators and migration script have separate test
files (added when those modules are written).
"""

from app.rbac.matrix import RBAC_MATRIX, can
from app.rbac.permissions import Permission
from app.rbac.roles import UserRoleV2


def test_matrix_covers_all_roles():
    """
    INVARIANT: RBAC_MATRIX MUST have a key for every UserRoleV2 value.
    Fail-closed behavior in can() is defence-in-depth, not a substitute
    for matrix completeness — this test enforces the invariant.
    """
    assert set(RBAC_MATRIX.keys()) == set(UserRoleV2), (
        f"RBAC_MATRIX missing roles: {set(UserRoleV2) - set(RBAC_MATRIX.keys())}"
    )


def test_super_admin_has_all_permissions():
    """
    SUPER_ADMIN is built with frozenset(Permission) so it auto-inherits
    every new permission added to the enum — test guards this contract.
    """
    assert RBAC_MATRIX[UserRoleV2.SUPER_ADMIN] == frozenset(Permission)


def test_can_returns_false_for_disallowed():
    """can() returns False when the role exists but lacks the permission."""
    # ANALYST has CLIENT_READ but not CLIENT_WRITE.
    assert can(UserRoleV2.ANALYST, Permission.CLIENT_READ) is True
    assert can(UserRoleV2.ANALYST, Permission.CLIENT_WRITE) is False
    # TENANT_ADMIN does NOT have tenant lifecycle permissions
    # (vendor-only — billing/contract level, not self-service).
    assert can(UserRoleV2.TENANT_ADMIN, Permission.TENANT_PROVISION) is False
    assert can(UserRoleV2.TENANT_ADMIN, Permission.TENANT_SUSPEND) is False
    assert can(UserRoleV2.TENANT_ADMIN, Permission.TENANT_TERMINATE) is False
    # COMPLIANCE_OFFICER has audit view but no config changes.
    assert can(UserRoleV2.COMPLIANCE_OFFICER, Permission.AUDIT_VIEW) is True
    assert can(UserRoleV2.COMPLIANCE_OFFICER, Permission.CONFIG_CHANGE) is False
    # CLIENT_USER has no backend permissions in Phase 1.
    assert can(UserRoleV2.CLIENT_USER, Permission.CLIENT_READ) is False


def test_can_returns_false_for_unknown_role():
    """
    Defence-in-depth: a role-shaped value not present in RBAC_MATRIX
    returns False from can(). Simulates a future enum value that was
    added to UserRoleV2 but not yet wired into the matrix.
    """
    # Ad-hoc string that mimics an enum value not in the matrix.
    # Bypasses type checker — that's the point: simulate runtime drift.
    fake_role = "unmapped_future_role"
    assert can(fake_role, Permission.CLIENT_READ) is False  # type: ignore[arg-type]
