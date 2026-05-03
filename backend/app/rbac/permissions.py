"""
Permission enum (Phase 1 RBAC block).

Permissions are atomic capabilities; roles are bags of permissions
defined in app.rbac.matrix.RBAC_MATRIX. New permissions are added here
as Phase 2+ features land — the module is intentionally small in
Phase 1 to keep the matrix reviewable.

Naming convention: '<domain>.<verb>'. Domain matches AuditCategory
where applicable (e.g. 'tenant', 'client', 'audit') so that audit
events and permission checks share the same vocabulary.

═══════════════════════════════════════════════════════════════════════
Process for adding a new Permission

1. Add the enum value to the appropriate domain section below. Keep
   alphabetical order within the section so diffs are reviewable.

2. Add the permission to roles that should have it in
   app.rbac.matrix.RBAC_MATRIX. SUPER_ADMIN gets ALL permissions
   automatically (matrix is built with `{p for p in Permission}` for
   that role) — no manual update needed there.

3. If the permission gates a new HTTP route, add
   `dependencies=[Depends(require_permission(Permission.X))]` to the
   route decorator. The decorator falls back to legacy role mapping
   for users whose role_v2 IS NULL — no migration required to ship.

4. Update tests in tests/test_rbac.py:
   - The `test_can_super_admin_has_all_permissions` test will start
     covering the new permission automatically.
   - If specific roles must / must NOT have the new permission, add
     focused tests asserting the matrix entries.

5. Document the operational meaning in a 1-line comment next to the
   enum value when '<domain>.<verb>' is not self-explanatory.
═══════════════════════════════════════════════════════════════════════
"""

import enum


class Permission(str, enum.Enum):
    # ── Tenant management ─────────────────────────────────────────────
    TENANT_PROVISION = "tenant.provision"
    TENANT_SUSPEND = "tenant.suspend"
    TENANT_TERMINATE = "tenant.terminate"
    TENANT_VIEW = "tenant.view"

    # ── User management ───────────────────────────────────────────────
    USER_INVITE = "user.invite"
    USER_REVOKE = "user.revoke"
    USER_RESET_PASSWORD = "user.reset_password"

    # ── Client (minimum for Phase 1 validation matrix) ────────────────
    CLIENT_READ = "client.read"
    CLIENT_WRITE = "client.write"
    CLIENT_APPROVE = "client.approve"

    # ── Audit ─────────────────────────────────────────────────────────
    AUDIT_VIEW = "audit.view"

    # ── System ────────────────────────────────────────────────────────
    CONFIG_CHANGE = "config.change"
