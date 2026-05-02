"""
Shared pytest fixtures for backend test suite.

Phase 0+ baseline:
- ENVIRONMENT=test forced for all tests (strict tenant filter — fail-fast on missing context).
- SQLite FK enforcement enabled (off by default in SQLite; required for
  TenantScopedMixin FK to companies.id to actually enforce).
- Autouse fixture clears tenant context before each test (prevents leak
  between tests when one set tenant_id and forgot to clear).

Existing test_app_starts.py uses production DB env vars (CI-supplied);
new tenancy/fixture-based tests use isolated SQLite in-memory engines
created per-test.
"""

import os
import sqlite3

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

# Force strict environment for all tests — missing tenant_id raises
# TenantContextMissingError instead of silently skipping the filter.
os.environ.setdefault("ENVIRONMENT", "test")

from app.tenancy import clear_current_tenant_id  # noqa: E402  (after env set)

# Re-export tenancy fixtures so pytest can discover them via standard
# fixture lookup (any test that asks for `two_tenants` finds it here).
from tests.fixtures.tenancy import two_tenants  # noqa: E402, F401

# Re-export audit fixtures (any test that asks for `tenant_with_user`).
from tests.fixtures.audit import tenant_with_user  # noqa: E402, F401


@event.listens_for(Engine, "connect")
def _enable_sqlite_fk(dbapi_conn, _connection_record):
    """
    SQLite ships with foreign_keys=OFF by default. Enable per-connection
    so that FKs on TenantScopedMixin (→ companies.id) are actually enforced
    in test DBs. No-op for non-SQLite drivers.
    """
    if isinstance(dbapi_conn, sqlite3.Connection):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


@pytest.fixture(autouse=True)
def _reset_tenant_context_before_each_test():
    """
    Defensively clear tenant_id ContextVar before every test. Prevents
    leak between tests when a test sets tenant_id and forgets to clear
    (e.g. via early raise / use_tenant skipped on assertion failure).
    """
    clear_current_tenant_id()
    yield
