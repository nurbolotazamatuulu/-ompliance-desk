"""
FastAPI dependency for setting per-request tenant context (AD-7).

Routes that need automatic tenant_id filtering on TenantScopedMixin
models declare this dependency:

    from app.tenancy import tenant_scoped

    @router.get("/clients", dependencies=[Depends(tenant_scoped)])
    async def list_clients(...):
        # current_tenant_id is now set; queries on TenantScopedMixin
        # models are auto-filtered by sql_filter.py.
        ...

The dependency is a yielding generator — it sets the context, yields
control to the route handler, and resets the context on response (or
on exception).

Token-based reset (via reset_tenant_id) is safe with nested scopes —
if any code further up the stack also called set_current_tenant_id,
the previous value is restored verbatim instead of clobbered to None.

═══════════════════════════════════════════════════════════════════════

NOT applied to existing AFG routers in this Phase 1 block. Existing
routers (clients.py, sanctions.py, ubos.py, etc.) continue to filter
manually via current_user.company_id. Migration of existing routers to
@tenant_scoped happens in Phase 2 alongside domain refactoring.

═══════════════════════════════════════════════════════════════════════
"""

import logging
from typing import Generator

from fastapi import Depends, HTTPException, status

from app import models
from app.auth import get_current_user
from app.tenancy import reset_tenant_id, set_current_tenant_id

logger = logging.getLogger(__name__)


def tenant_scoped(
    current_user: models.User = Depends(get_current_user),
) -> Generator[models.User, None, None]:
    """
    Set current_tenant_id from the authenticated user's company_id for
    the duration of the request.

    SUPER_ADMIN exception: SUPER_ADMIN may not have a tenant (per AD-1
    and 2.1.3 RBAC matrix — vendor-level role, operates across tenants).
    For SUPER_ADMIN, the dependency yields without setting the context.
    SUPER_ADMIN routes that need cross-tenant access use bypass_tenant_filter()
    explicitly with a justification reason.

    ───────────────────────────────────────────────────────────────────
    Note for SUPER_ADMIN consumers:

    SUPER_ADMIN requests on TenantScopedMixin routes WILL trigger
    TenantContextMissingError in strict environments unless explicitly
    wrapped in bypass_tenant_filter(reason=...). This is intentional:
    SUPER_ADMIN cross-tenant access must be deliberate and audited, not
    accidental. Do not "fix" this behaviour by silently bypassing for
    SUPER_ADMIN inside this dependency — it would erode the audit guarantee.
    ───────────────────────────────────────────────────────────────────

    Yields:
        models.User: the authenticated user (passes through current_user
        for downstream dependencies and route handlers that need it).

    Raises:
        HTTPException 403: if non-SUPER_ADMIN user has no company_id
        (data integrity violation — every regular user must belong to a tenant).
    """
    if current_user.role == models.UserRole.SUPER_ADMIN:
        # SUPER_ADMIN: no tenant context set. Cross-tenant work requires
        # explicit bypass_tenant_filter() with reason.
        yield current_user
        return

    if not current_user.company_id:
        # All non-SUPER_ADMIN roles must belong to a tenant. If a user
        # somehow lacks company_id, that's a data integrity violation —
        # block the request rather than allow unscoped queries.
        logger.error(
            f"User {current_user.id} (role={current_user.role}) has no company_id; "
            f"refusing tenant_scoped dependency"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no tenant assignment",
        )

    token = set_current_tenant_id(current_user.company_id)
    try:
        yield current_user
    finally:
        # Token-based reset: safe with nested scopes (restores previous
        # value if any) and safe with concurrency (each request has its
        # own ContextVar copy).
        reset_tenant_id(token)
