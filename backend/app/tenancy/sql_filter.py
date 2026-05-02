"""
Automatic tenant_id filtering via SQLAlchemy do_orm_execute event (AD-7).

Installs a single global event listener on Session that intercepts
2.0-style ORM operations (session.execute(select(Model))) and rewrites
the statement to add `WHERE Model.tenant_id = :current_tenant_id` for
any Model that inherits TenantScopedMixin.

═══════════════════════════════════════════════════════════════════════
Query API — see app.tenancy.__init__ docstring for full details.
═══════════════════════════════════════════════════════════════════════

do_orm_execute fires for session.execute() calls (2.0 API). Empirically,
SA 2.0.x also routes session.query(Model) through do_orm_execute, so
legacy queries get filtered too. This is observed behavior; new code
in Phase 2+ should prefer 2.0 style for clarity and forward compatibility.

Existing 1.x-style queries on non-TenantScopedMixin models (Client, UBO,
etc. in app.models) are unaffected because they use explicit company_id
filtering — the listener is a no-op on non-mixin models.

═══════════════════════════════════════════════════════════════════════

Behavior:
- For SELECT/UPDATE/DELETE on TenantScopedMixin subclass:
  - If current_tenant_id is set: append WHERE clause with tenant_id binding
  - If current_tenant_id is None AND ENVIRONMENT in {development, staging, test}:
    raise TenantContextMissingError (catches missing @tenant_scoped decorator)
  - If current_tenant_id is None in production: log warning + skip filtering
    (graceful degradation; defence-in-depth via RBAC at higher layers)
  - If is_tenant_filter_bypassed() is True: skip filtering entirely
  - Skip relationship loads — SA handles FK joining automatically; double
    filtering would break eager loads.
- Non-TenantScopedMixin models (existing AFG models): listener is a no-op,
  query runs unchanged.

INSTALL:
    from app.tenancy.sql_filter import install_tenant_filter
    install_tenant_filter()   # idempotent — safe to call multiple times

Typically called once at backend startup (in app.main lifespan or after
SessionLocal creation).
"""

import logging
import os

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.tenancy.context import get_current_tenant_id, is_tenant_filter_bypassed
from app.tenancy.mixins import TenantScopedMixin

logger = logging.getLogger(__name__)

# Environments that fail-fast on missing tenant_id (catch dev/CI bugs early).
STRICT_ENVS = {"development", "staging", "test"}


class TenantContextMissingError(RuntimeError):
    """
    Raised when a TenantScopedMixin query is executed without
    current_tenant_id set (and not bypassed) in a strict environment.

    Almost always indicates a missing @tenant_scoped FastAPI dependency
    on the route, or a forgotten set_current_tenant_id in a test setup.
    """


def _is_strict_env() -> bool:
    env = os.environ.get("ENVIRONMENT", "development").lower().strip()
    return env in STRICT_ENVS


def _do_orm_execute(orm_execute_state: ORMExecuteState) -> None:
    """
    do_orm_execute event handler.

    Adds a tenant_id filter to any SELECT/UPDATE/DELETE on a TenantScopedMixin
    model. No-op for plain Core operations or for non-mixin models.
    """
    # Skip explicit bypass scopes.
    if is_tenant_filter_bypassed():
        return

    # Skip relationship loads — SA handles FK joining automatically;
    # adding our filter on top would break eager-loaded relationships.
    if orm_execute_state.is_relationship_load:
        return

    # Only act on SELECT, UPDATE, DELETE — INSERT supplies tenant_id directly
    # via the model instance.
    if not (
        orm_execute_state.is_select
        or orm_execute_state.is_update
        or orm_execute_state.is_delete
    ):
        return

    tenant_id = get_current_tenant_id()

    # If current_tenant_id is None:
    #   - strict env → raise
    #   - production → log warning + skip (no criteria applied)
    if tenant_id is None:
        if _is_strict_env():
            raise TenantContextMissingError(
                "Query on TenantScopedMixin model executed without current_tenant_id. "
                "Did you forget to apply @tenant_scoped to the route, or "
                "set_current_tenant_id() in a test setup?"
            )
        logger.warning(
            "tenant_id missing in production — query proceeds unfiltered. "
            "Higher-layer RBAC must protect this case."
        )
        return

    # with_loader_criteria attaches a per-entity WHERE clause that applies
    # to TenantScopedMixin subclasses encountered in the statement. This is
    # the SA-recommended mechanism for global automatic filtering.
    # include_aliases=True ensures aliased instances (self-joins, subqueries)
    # are also filtered.
    orm_execute_state.statement = orm_execute_state.statement.options(
        with_loader_criteria(
            TenantScopedMixin,
            lambda cls: cls.tenant_id == tenant_id,
            include_aliases=True,
        )
    )


_installed = False


def install_tenant_filter() -> None:
    """
    Register the do_orm_execute listener on the SQLAlchemy Session class.

    Idempotent — calling multiple times only installs once.
    """
    global _installed
    if _installed:
        return

    event.listen(Session, "do_orm_execute", _do_orm_execute)
    _installed = True
    logger.debug("Tenant filter listener installed on Session.do_orm_execute")
