"""
Multi-tenancy infrastructure (AD-7).

Provides per-request tenant context, automatic SQL filtering for
TenantScopedMixin models, and FastAPI dependency for setting context
based on the current authenticated user.

═══════════════════════════════════════════════════════════════════════
Query API — PREFER 2.0 style; 1.x style works in current SA.
═══════════════════════════════════════════════════════════════════════

The auto-filter listener uses do_orm_execute, which fires for
session.execute(select(Model)) — the modern 2.0 query API.

Empirically (verified by tests/test_tenancy.py::test_query_legacy_style_behavior
on SQLAlchemy 2.0.30), legacy 1.x-style queries (session.query(Model).filter(...))
are ALSO routed through do_orm_execute internally and get filtered correctly.

This is, however, **observed behavior, not contract**: the SA documentation
positions do_orm_execute as a 2.0-API hook, and a future major SA upgrade
could change this. New code in Phase 2+ SHOULD prefer 2.0 style for:
- Clarity (the canonical, idiomatic SA 2.0 form)
- Forward compatibility (guaranteed to filter regardless of internal routing)
- Code review consistency (one style per codebase)

    # PREFERRED:
    from sqlalchemy import select
    result = session.execute(select(Client).where(Client.is_active.is_(True)))
    clients = result.scalars().all()

    # ALSO FILTERS (current SA), but discouraged for new TenantScopedMixin code:
    clients = session.query(Client).filter(Client.is_active.is_(True)).all()

Existing AFG code (backend/app/routers/clients.py and others) uses
1.x-style queries with explicit company_id filtering — that's untouched
in this Phase 1 block and continues to work.

Test test_query_legacy_style_behavior asserts the current equivalence
between the two APIs. If a future SA version diverges, that test will
fail and force this docstring update.

═══════════════════════════════════════════════════════════════════════

Public API surface:
- get_current_tenant_id, set_current_tenant_id, clear_current_tenant_id
- bypass_tenant_filter (context manager for SUPER_ADMIN operations)
- is_tenant_filter_bypassed
- TenantScopedMixin (added when mixins.py is created)
- tenant_scoped (FastAPI dependency, added when dependencies.py is created)
- install_tenant_filter (call once on engine, added when sql_filter.py is created)
"""

from .context import (
    bypass_tenant_filter,
    clear_current_tenant_id,
    get_current_tenant_id,
    is_tenant_filter_bypassed,
    reset_tenant_id,
    set_current_tenant_id,
)
from .dependencies import tenant_scoped
from .mixins import TenantScopedMixin
from .sql_filter import TenantContextMissingError, install_tenant_filter

__all__ = [
    # Context API
    "get_current_tenant_id",
    "set_current_tenant_id",
    "reset_tenant_id",
    "clear_current_tenant_id",
    "bypass_tenant_filter",
    "is_tenant_filter_bypassed",
    # Mixin marker
    "TenantScopedMixin",
    # SQL filter listener
    "install_tenant_filter",
    "TenantContextMissingError",
    # FastAPI dependency
    "tenant_scoped",
]
