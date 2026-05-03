"""
Tests for app.tenancy.lifecycle FSM (Phase 1 RBAC+FSM block).

Covers:
- provision_tenant: creation in PROVISIONING state + audit event.
- activate_tenant: PROVISIONING → ACTIVE, SUSPENDED → ACTIVE, idempotent
  no-op on already-ACTIVE, illegal from TERMINATED.
- suspend_tenant: ACTIVE → SUSPENDED with mandatory reason.
- terminate_tenant: from PROVISIONING/ACTIVE/SUSPENDED → TERMINATED.
- mark_deletable: TERMINATED → DELETABLE; illegal from ACTIVE.

All tests use the existing `tenant_with_user` fixture (fresh SQLite in-
memory engine per test) plus a per-test `db_session` helper. Tenants
in specific starting states are seeded directly via _seed_tenant_in_state
to bypass FSM and isolate the transition under test.
"""

from datetime import datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import AuditEvent
from app.models import Company
from app.tenancy import reset_tenant_id, set_current_tenant_id
from app.tenancy.lifecycle import (
    InvalidTransitionError,
    SubscriptionSKU,
    TenantLifecycleState,
    activate_tenant,
    mark_deletable,
    provision_tenant,
    suspend_tenant,
    terminate_tenant,
)


# ─── Fixtures + helpers ─────────────────────────────────────────────────


@pytest.fixture
def db_session(tenant_with_user):
    """Per-test Session bound to the in-memory engine from tenant_with_user.

    Sets current_tenant_id to the seeded tenant for the duration of the
    test. The tenant_filter listener (installed earlier in the suite by
    test_tenancy fixtures) raises TenantContextMissingError on ANY query
    in strict env when tenant_id is None — including queries on Company
    itself, which is not TenantScopedMixin. with_loader_criteria still
    only applies to TenantScopedMixin subclasses, so setting tenant_id
    here is safe regardless of which Company we query.
    """
    token = set_current_tenant_id(tenant_with_user.tenant_id)
    session = tenant_with_user.Session()
    try:
        yield session
    finally:
        session.close()
        reset_tenant_id(token)


def _seed_tenant_in_state(
    session: Session,
    *,
    name: str,
    state: TenantLifecycleState,
    license_key: str,
    **extra,
) -> Company:
    """Insert a Company directly with the given lifecycle_state. Bypasses
    FSM so tests can stage starting states cleanly.

    Invariant: is_active is DERIVED from state (only ACTIVE → True).
    Passing is_active via **extra raises ValueError to prevent tests
    from creating inconsistent rows.
    """
    if "is_active" in extra:
        raise ValueError(
            "is_active is derived from state; pass state, not is_active"
        )
    company = Company(
        name=name,
        license_key=license_key,
        lifecycle_state=state.value,
        is_active=(state == TenantLifecycleState.ACTIVE),
        **extra,
    )
    session.add(company)
    session.flush()
    return company


def _audit_count(session: Session, tenant_id: int) -> int:
    return session.execute(
        select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == tenant_id)
    ).scalar_one()


def _last_audit(session: Session, tenant_id: int) -> AuditEvent | None:
    return session.execute(
        select(AuditEvent)
        .where(AuditEvent.tenant_id == tenant_id)
        .order_by(AuditEvent.id.desc())
        .limit(1)
    ).scalar_one_or_none()


# ─── 1. provision_tenant ────────────────────────────────────────────────


def test_provision_tenant_creates_in_provisioning_state(db_session, tenant_with_user):
    company = provision_tenant(
        db_session,
        name="New ОВА",
        subscription_sku=SubscriptionSKU.CS,
        license_expires_at=datetime(2030, 1, 1),
        license_key="NEWOVA-2026-001",
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )

    assert company.id is not None
    assert company.name == "New ОВА"
    assert company.lifecycle_state == TenantLifecycleState.PROVISIONING.value
    assert company.is_active is False
    assert company.provisioned_at is not None
    assert company.subscription_sku == SubscriptionSKU.CS.value
    assert company.license_key == "NEWOVA-2026-001"
    assert company.license_expires_at == datetime(2030, 1, 1)


def test_provision_tenant_writes_audit_event(db_session, tenant_with_user):
    company = provision_tenant(
        db_session,
        name="Audited ОВА",
        subscription_sku=SubscriptionSKU.VO,
        license_expires_at=datetime(2031, 6, 15),
        license_key="AUDIT-2026-002",
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )

    last = _last_audit(db_session, company.id)
    assert last is not None
    assert last.category == "tenancy"
    assert last.action == "tenant.provisioned"
    assert last.target_type == "Tenant"
    assert last.target_id == str(company.id)
    payload = last.payload_json
    assert payload["initial_state"] == TenantLifecycleState.PROVISIONING.value
    assert payload["subscription_sku"] == SubscriptionSKU.VO.value
    assert payload["license_expires_at"] == datetime(2031, 6, 15).isoformat()
    assert payload["name"] == "Audited ОВА"


# ─── 3-6. activate_tenant ───────────────────────────────────────────────


def test_activate_provisioning_to_active(db_session, tenant_with_user):
    company = _seed_tenant_in_state(
        db_session,
        name="АФГ-prov",
        state=TenantLifecycleState.PROVISIONING,
        license_key="AFG-2026-PROV",
        provisioned_at=datetime(2026, 1, 1),
    )

    activate_tenant(
        db_session,
        company.id,
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )
    db_session.refresh(company)

    assert company.lifecycle_state == TenantLifecycleState.ACTIVE.value
    assert company.is_active is True
    assert company.activated_at is not None

    last = _last_audit(db_session, company.id)
    assert last.action == "tenant.activated"
    assert last.payload_json["previous_state"] == "provisioning"
    assert last.payload_json["new_state"] == "active"


def test_activate_suspended_to_active(db_session, tenant_with_user):
    company = _seed_tenant_in_state(
        db_session,
        name="АФГ-susp",
        state=TenantLifecycleState.SUSPENDED,
        license_key="AFG-2026-SUSP",
        suspended_at=datetime(2026, 2, 1),
        suspension_reason="Test fixture",
    )

    activate_tenant(
        db_session,
        company.id,
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )
    db_session.refresh(company)

    assert company.lifecycle_state == TenantLifecycleState.ACTIVE.value
    assert company.is_active is True
    assert company.activated_at is not None

    last = _last_audit(db_session, company.id)
    assert last.action == "tenant.activated"
    assert last.payload_json["previous_state"] == "suspended"


def test_activate_already_active_is_silent_noop(db_session, tenant_with_user):
    company = _seed_tenant_in_state(
        db_session,
        name="АФГ-active",
        state=TenantLifecycleState.ACTIVE,
        license_key="AFG-2026-NOOP",
        provisioned_at=datetime(2026, 1, 1),
        activated_at=datetime(2026, 1, 2),
    )
    db_session.flush()

    audit_count_before = _audit_count(db_session, company.id)
    activated_at_before = company.activated_at

    activate_tenant(
        db_session,
        company.id,
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )
    db_session.flush()
    db_session.refresh(company)

    # State unchanged
    assert company.lifecycle_state == TenantLifecycleState.ACTIVE.value
    # activated_at NOT bumped
    assert company.activated_at == activated_at_before
    # No audit written
    assert _audit_count(db_session, company.id) == audit_count_before


def test_activate_invalid_transition_from_terminated(db_session, tenant_with_user):
    company = _seed_tenant_in_state(
        db_session,
        name="АФГ-term",
        state=TenantLifecycleState.TERMINATED,
        license_key="AFG-2026-TERM",
        terminated_at=datetime(2026, 2, 1),
        termination_reason="Test fixture",
    )
    db_session.flush()

    audit_count_before = _audit_count(db_session, company.id)

    with pytest.raises(InvalidTransitionError):
        activate_tenant(
            db_session,
            company.id,
            actor_user_id=tenant_with_user.user_id,
            actor_username=tenant_with_user.username,
            actor_role=tenant_with_user.role,
        )

    # InvalidTransitionError raises before any state mutation (only a
    # SELECT FOR UPDATE ran). Seeded state is intact in memory and DB
    # without needing rollback.
    assert company.lifecycle_state == TenantLifecycleState.TERMINATED.value
    assert _audit_count(db_session, company.id) == audit_count_before


# ─── 7-8. suspend_tenant ────────────────────────────────────────────────


def test_suspend_active_to_suspended_with_reason(db_session, tenant_with_user):
    company = _seed_tenant_in_state(
        db_session,
        name="АФГ-to-suspend",
        state=TenantLifecycleState.ACTIVE,
        license_key="AFG-2026-TOSUSP",
        activated_at=datetime(2026, 1, 1),
    )

    suspend_tenant(
        db_session,
        company.id,
        reason="Late license renewal",
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )
    db_session.refresh(company)

    assert company.lifecycle_state == TenantLifecycleState.SUSPENDED.value
    assert company.is_active is False
    assert company.suspended_at is not None
    assert company.suspension_reason == "Late license renewal"

    last = _last_audit(db_session, company.id)
    assert last.action == "tenant.suspended"
    assert last.payload_json["previous_state"] == "active"
    assert last.payload_json["new_state"] == "suspended"
    assert last.payload_json["reason"] == "Late license renewal"


def test_suspend_requires_non_empty_reason(db_session, tenant_with_user):
    company = _seed_tenant_in_state(
        db_session,
        name="АФГ-empty-reason",
        state=TenantLifecycleState.ACTIVE,
        license_key="AFG-2026-EMPTYR",
    )

    for bad_reason in ("", "   ", "\t\n  "):
        with pytest.raises(ValueError, match="non-empty reason"):
            suspend_tenant(
                db_session,
                company.id,
                reason=bad_reason,
                actor_user_id=tenant_with_user.user_id,
                actor_username=tenant_with_user.username,
                actor_role=tenant_with_user.role,
            )

    # ValueError fires before any DB op (no _load_for_update yet), so
    # the seeded state is preserved without needing rollback.
    assert company.lifecycle_state == TenantLifecycleState.ACTIVE.value


# ─── 9. terminate_tenant ────────────────────────────────────────────────


def test_terminate_from_any_state(db_session, tenant_with_user):
    """terminate_tenant accepts PROVISIONING/ACTIVE/SUSPENDED as start state."""
    starts = [
        (TenantLifecycleState.PROVISIONING, "AFG-2026-T1", "from-prov"),
        (TenantLifecycleState.ACTIVE, "AFG-2026-T2", "from-active"),
        (TenantLifecycleState.SUSPENDED, "AFG-2026-T3", "from-susp"),
    ]
    for state, key, name in starts:
        company = _seed_tenant_in_state(
            db_session,
            name=name,
            state=state,
            license_key=key,
        )

        terminate_tenant(
            db_session,
            company.id,
            reason=f"Termination from {state.value}",
            actor_user_id=tenant_with_user.user_id,
            actor_username=tenant_with_user.username,
            actor_role=tenant_with_user.role,
        )
        db_session.refresh(company)

        assert company.lifecycle_state == TenantLifecycleState.TERMINATED.value
        assert company.is_active is False
        assert company.terminated_at is not None
        assert company.termination_reason == f"Termination from {state.value}"

        last = _last_audit(db_session, company.id)
        assert last.action == "tenant.terminated"
        assert last.payload_json["previous_state"] == state.value
        assert last.payload_json["new_state"] == "terminated"


# ─── 10. mark_deletable ─────────────────────────────────────────────────


def test_mark_deletable_only_from_terminated(db_session, tenant_with_user):
    """Positive: TERMINATED → DELETABLE. Negative: ACTIVE → InvalidTransitionError."""
    # Positive
    terminated = _seed_tenant_in_state(
        db_session,
        name="АФГ-to-delete",
        state=TenantLifecycleState.TERMINATED,
        license_key="AFG-2026-DEL-OK",
        terminated_at=datetime(2026, 3, 1),
        termination_reason="Test fixture",
    )
    mark_deletable(
        db_session,
        terminated.id,
        actor_user_id=tenant_with_user.user_id,
        actor_username=tenant_with_user.username,
        actor_role=tenant_with_user.role,
    )
    db_session.refresh(terminated)
    assert terminated.lifecycle_state == TenantLifecycleState.DELETABLE.value
    assert terminated.is_active is False
    last = _last_audit(db_session, terminated.id)
    assert last.action == "tenant.marked_deletable"
    assert last.payload_json["previous_state"] == "terminated"
    assert last.payload_json["new_state"] == "deletable"

    # Negative: ACTIVE cannot jump to DELETABLE.
    active = _seed_tenant_in_state(
        db_session,
        name="АФГ-still-active",
        state=TenantLifecycleState.ACTIVE,
        license_key="AFG-2026-DEL-FAIL",
    )
    with pytest.raises(InvalidTransitionError):
        mark_deletable(
            db_session,
            active.id,
            actor_user_id=tenant_with_user.user_id,
            actor_username=tenant_with_user.username,
            actor_role=tenant_with_user.role,
        )
    # No state mutation before raise — see comment in
    # test_activate_invalid_transition_from_terminated.
    assert active.lifecycle_state == TenantLifecycleState.ACTIVE.value
