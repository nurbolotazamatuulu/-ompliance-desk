"""
Smoke tests for app.tenancy multi-tenancy infrastructure (AD-7).

Covers:
1. ContextVar isolation (set/get/clear)
2. bypass_tenant_filter context manager + reason validation
3. Strict env raises on missing tenant_id (TenantContextMissingError)
4. two_tenants fixture seeds 2 isolated tenants
5. Filter excludes other-tenant rows in query
6. Legacy 1.x-style query behavior (observational; documents known limitation)
"""

import pytest
from sqlalchemy import select

from app.tenancy import (
    bypass_tenant_filter,
    clear_current_tenant_id,
    get_current_tenant_id,
    is_tenant_filter_bypassed,
    reset_tenant_id,
    set_current_tenant_id,
)
from app.tenancy.sql_filter import TenantContextMissingError
from tests.fixtures.tenancy import use_tenant


# ─── 1. ContextVar isolation ─────────────────────────────────────────────

def test_context_var_isolation():
    """set / get / clear / reset roundtrip works."""
    assert get_current_tenant_id() is None

    token = set_current_tenant_id(7)
    assert get_current_tenant_id() == 7

    reset_tenant_id(token)
    assert get_current_tenant_id() is None

    set_current_tenant_id(99)
    clear_current_tenant_id()
    assert get_current_tenant_id() is None


# ─── 2. Bypass context manager ───────────────────────────────────────────

def test_bypass_context_manager():
    """bypass_tenant_filter enables flag inside scope, restores after."""
    assert not is_tenant_filter_bypassed()

    with bypass_tenant_filter(reason="test_bypass_context_manager"):
        assert is_tenant_filter_bypassed()

    assert not is_tenant_filter_bypassed()


def test_bypass_requires_reason():
    """Empty / blank reason raises ValueError to keep audit log honest."""
    with pytest.raises(ValueError, match="non-empty reason"):
        with bypass_tenant_filter(reason=""):
            pass

    with pytest.raises(ValueError, match="non-empty reason"):
        with bypass_tenant_filter(reason="   "):
            pass


# ─── 3. Strict env enforcement ────────────────────────────────────────────

def test_strict_env_raises_on_missing_tenant_id(two_tenants):
    """
    In ENVIRONMENT=test (strict), querying a TenantScopedMixin model without
    setting tenant_id MUST raise TenantContextMissingError. This catches
    missing @tenant_scoped on routes during dev/CI.
    """
    session = two_tenants.Session()
    # autouse fixture already cleared, but be explicit for the test contract
    clear_current_tenant_id()

    with pytest.raises(TenantContextMissingError):
        session.execute(select(two_tenants.Model)).scalars().all()

    session.close()


# ─── 4. Two-tenants fixture ──────────────────────────────────────────────

def test_two_tenants_fixture_seeds_data(two_tenants):
    """The fixture provides two distinct tenants, each with seeded sample rows."""
    assert two_tenants.a.id == 1
    assert two_tenants.b.id == 2
    assert two_tenants.a.sample_data == [10, 11]
    assert two_tenants.b.sample_data == [20, 21]
    assert two_tenants.a.id != two_tenants.b.id


# ─── 5. Filter excludes other-tenant rows ────────────────────────────────

def test_filter_excludes_other_tenant(two_tenants):
    """
    Inside use_tenant(a) scope, queries must return ONLY tenant_a rows.
    Outside scope (or in tenant_b scope), other rows.
    Bypass returns all rows.
    """
    session = two_tenants.Session()

    with use_tenant(two_tenants.a):
        rows = session.execute(select(two_tenants.Model)).scalars().all()
        ids = sorted(r.id for r in rows)
        assert ids == [10, 11], f"tenant_a should see only [10, 11], got {ids}"

    with use_tenant(two_tenants.b):
        rows = session.execute(select(two_tenants.Model)).scalars().all()
        ids = sorted(r.id for r in rows)
        assert ids == [20, 21], f"tenant_b should see only [20, 21], got {ids}"

    with use_tenant(two_tenants.a), bypass_tenant_filter(reason="cross-tenant audit test"):
        rows = session.execute(select(two_tenants.Model)).scalars().all()
        ids = sorted(r.id for r in rows)
        assert ids == [10, 11, 20, 21], f"bypass should see ALL rows, got {ids}"

    session.close()


# ─── 6. Legacy 1.x-style query — observational ───────────────────────────

def test_query_legacy_style_behavior(two_tenants):
    """
    Documents the OBSERVED behavior of legacy 1.x-style session.query() on
    TenantScopedMixin models, against the 2.0-style filter.

    Per the architectural docstring in app.tenancy: do_orm_execute hooks
    only the 2.0 path. session.query() may bypass the filter entirely.

    This test does NOT assert correctness — it asserts current behavior so
    that if SQLAlchemy ever changes it (or we install a separate 1.x hook
    in the future), the test will fail loudly and force a docs update.
    """
    session = two_tenants.Session()

    with use_tenant(two_tenants.a):
        # 2.0 style — must filter
        modern_rows = session.execute(select(two_tenants.Model)).scalars().all()
        modern_ids = sorted(r.id for r in modern_rows)

        # 1.x style — observational
        legacy_rows = session.query(two_tenants.Model).all()
        legacy_ids = sorted(r.id for r in legacy_rows)

    session.close()

    assert modern_ids == [10, 11], "2.0-style filter regression"

    # OBSERVED Phase 0 behavior: both paths produce same result if SA
    # routes Query through do_orm_execute internally. If not, legacy_ids
    # would include all rows [10, 11, 20, 21]. Either way, this test
    # documents the current behavior — if it ever changes, the failure
    # forces us to revisit the docstring warning in app.tenancy.__init__.
    assert legacy_ids == modern_ids, (
        f"Legacy 1.x-style query showed different rows than modern: "
        f"legacy={legacy_ids}, modern={modern_ids}. "
        f"Update app.tenancy docs warning if SA behavior changed."
    )
