"""
Per-request tenant context for multi-tenant isolation (AD-7).

Uses contextvars.ContextVar — the correct mechanism for FastAPI with asyncio:
- Request-scoped (each request gets its own ContextVar value)
- Race-condition-free (asyncio tasks don't bleed context to each other)
- Works in sync code too (sync FastAPI endpoints run in threadpool;
  ContextVar via copy_context provides correct isolation)

Public API:
- get_current_tenant_id() -> int | None
- set_current_tenant_id(tenant_id: int | None) -> Token
- clear_current_tenant_id()
- bypass_tenant_filter(reason) -> context manager
- is_tenant_filter_bypassed() -> bool
"""

import logging
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Generator

logger = logging.getLogger(__name__)

# Internal storage. Default None — no tenant set.
_current_tenant_id: ContextVar[int | None] = ContextVar(
    "current_tenant_id", default=None
)

# Bypass flag — when True, tenant filter is disabled in the current scope.
# Used by SUPER_ADMIN operations that legitimately need cross-tenant access.
_bypass_filter: ContextVar[bool] = ContextVar(
    "bypass_tenant_filter", default=False
)


def get_current_tenant_id() -> int | None:
    """Return tenant_id for the current request context, or None if not set."""
    return _current_tenant_id.get()


def set_current_tenant_id(tenant_id: int | None) -> Token:
    """
    Set tenant_id for the current request context.

    Returns a Token usable with `_current_tenant_id.reset(token)` to restore
    the previous value. FastAPI dependencies should use token-based reset
    (not clear_current_tenant_id) to be safe with nested scopes:

        token = set_current_tenant_id(user.tenant_id)
        try:
            yield
        finally:
            from app.tenancy.context import _current_tenant_id
            _current_tenant_id.reset(token)

    clear_current_tenant_id() is provided for test cleanup, not for
    production request handling.
    """
    return _current_tenant_id.set(tenant_id)


def clear_current_tenant_id() -> None:
    """
    Clear tenant_id for the current request context (reset to None).

    Intended for test cleanup. Production code should use reset_tenant_id(token)
    instead — that restores the previous value (which may not be None) rather
    than unconditionally clobbering to None.
    """
    _current_tenant_id.set(None)


def reset_tenant_id(token: Token) -> None:
    """
    Restore the previous tenant_id value using the Token returned from
    set_current_tenant_id().

    Use this in FastAPI dependencies and tests when you want to restore
    the previous tenant_id (typically None at request start) rather than
    clobber to None via clear_current_tenant_id().

    Example (FastAPI dependency):
        token = set_current_tenant_id(user.tenant_id)
        try:
            yield
        finally:
            reset_tenant_id(token)
    """
    _current_tenant_id.reset(token)


def is_tenant_filter_bypassed() -> bool:
    """Return True if the current scope has explicitly bypassed tenant filtering."""
    return _bypass_filter.get()


@contextmanager
def bypass_tenant_filter(reason: str) -> Generator[None, None, None]:
    """
    Context manager that disables tenant_id filtering within its scope.

    USE ONLY for SUPER_ADMIN operations that legitimately need cross-tenant
    access (vendor-level support, audit log review across tenants, etc.).

    Every bypass is logged via logging.warning with prefix 'BYPASS_TENANT_FILTER'
    so it can be greppable in audit. Phase 1+ will integrate with AuditEvent
    (hash-chain audit) for proper traceability — placeholder for now.

    Args:
        reason: human-readable explanation of why bypass is needed.
                Required, non-empty. Becomes part of the audit log entry.

    Raises:
        ValueError: if reason is empty / blank.

    Example:
        with bypass_tenant_filter(reason="vendor support: incident #123 cross-tenant analysis"):
            results = session.execute(select(Client))   # sees ALL tenants
    """
    if not reason or not reason.strip():
        raise ValueError(
            "bypass_tenant_filter requires a non-empty reason for audit trail"
        )

    logger.warning(f"BYPASS_TENANT_FILTER reason={reason!r}")
    token = _bypass_filter.set(True)
    try:
        yield
    finally:
        _bypass_filter.reset(token)
