"""
Smoke tests for app.audit hash-chain audit log (AD-Q2).

Covers:
1. audit_log writes a chained AuditEvent with correct field values.
2. Category validation (invalid → ValueError, valid → OK).
3. tenant_id resolution (explicit, via context, missing → ValueError).
4. Hash chain genesis (prev_hash=NULL on first record).
5. Hash chain linkage (subsequent records reference prior current_hash).
6. Per-tenant chain isolation.
7. verify_audit_chain on intact chain → ok=True.
8. verify_audit_chain on tampered current_hash → HASH_MISMATCH.
9. verify_audit_chain on broken prev_hash linkage → PREV_HASH_MISMATCH.
10. legacy_unchained records skipped by verifier; chain resumes after them.

All tests use the `tenant_with_user` SQLite in-memory fixture. Tampering
tests rely on SQLite NOT having the PL/pgSQL immutability triggers — on
PG those UPDATEs would be rejected by the trigger before the verifier
saw them. Q-audit-C tracks adding a PG service container in CI so trigger
behavior gets covered too.
"""

import pytest
from sqlalchemy import select, update

from app.audit import (
    AuditCategory,
    AuditEvent,
    ChainBreakReason,
    LEGACY_HASH_PLACEHOLDER,
    audit_log,
    verify_audit_chain,
)
from app.audit.recorder import _canonical_hash_content, _compute_hash
from app.tenancy import reset_tenant_id, set_current_tenant_id


# ─── 1. audit_log basics ─────────────────────────────────────────────────


def test_audit_log_writes_event(tenant_with_user):
    env = tenant_with_user
    session = env.Session()

    event = audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="login_success",
        tenant_id=env.tenant_id,
        actor_user_id=env.user_id,
        actor_username=env.username,
        actor_role=env.role,
    )
    session.commit()

    assert event.id is not None
    assert event.event_id  # UUID assigned
    assert event.tenant_id == env.tenant_id
    assert event.actor_user_id == env.user_id
    assert event.actor_username == env.username
    assert event.actor_role == env.role
    assert event.category == AuditCategory.AUTH.value
    assert event.action == "login_success"
    assert event.legacy_unchained is False
    assert event.prev_hash is None  # genesis
    assert len(event.current_hash) == 64

    session.close()


# ─── 2. Category validation ──────────────────────────────────────────────


def test_audit_log_rejects_invalid_category(tenant_with_user):
    session = tenant_with_user.Session()
    with pytest.raises(ValueError, match="Invalid audit category"):
        audit_log(
            session,
            category="not_a_category",
            action="x",
            tenant_id=tenant_with_user.tenant_id,
        )
    session.close()


def test_audit_log_accepts_all_audit_categories(tenant_with_user):
    """Every AuditCategory value passes validation."""
    env = tenant_with_user
    session = env.Session()
    for cat in AuditCategory:
        audit_log(
            session,
            category=cat.value,
            action=f"smoke.{cat.value}",
            tenant_id=env.tenant_id,
        )
    session.commit()

    count = session.execute(
        select(AuditEvent).where(AuditEvent.tenant_id == env.tenant_id)
    ).all()
    assert len(count) == len(list(AuditCategory))
    session.close()


# ─── 3. tenant_id resolution ─────────────────────────────────────────────


def test_audit_log_requires_tenant_id(tenant_with_user):
    """No explicit tenant_id, no context → ValueError."""
    session = tenant_with_user.Session()
    with pytest.raises(ValueError, match="requires tenant_id"):
        audit_log(session, category=AuditCategory.SYSTEM.value, action="x")
    session.close()


def test_audit_log_uses_tenant_context(tenant_with_user):
    """If current_tenant_id is set in context, it's used as tenant_id."""
    env = tenant_with_user
    session = env.Session()
    token = set_current_tenant_id(env.tenant_id)
    try:
        event = audit_log(
            session,
            category=AuditCategory.SYSTEM.value,
            action="background.task",
        )
        session.commit()
        assert event.tenant_id == env.tenant_id
    finally:
        reset_tenant_id(token)
    session.close()


def test_audit_log_rejects_dangling_username(tenant_with_user):
    """actor_username without actor_user_id is a denormalization mistake."""
    env = tenant_with_user
    session = env.Session()
    with pytest.raises(ValueError, match="actor_username is a snapshot"):
        audit_log(
            session,
            category=AuditCategory.AUTH.value,
            action="x",
            tenant_id=env.tenant_id,
            actor_username="dangling@example.com",
            actor_user_id=None,
        )
    session.close()


# ─── 4–6. Hash chain semantics ───────────────────────────────────────────


def test_hash_chain_first_record_is_genesis(tenant_with_user):
    env = tenant_with_user
    session = env.Session()

    event = audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="login_success",
        tenant_id=env.tenant_id,
    )
    session.commit()

    assert event.prev_hash is None

    # Recompute hash from canonical content — must match stored.
    canonical = _canonical_hash_content(
        event_id=event.event_id,
        tenant_id=event.tenant_id,
        actor_user_id=event.actor_user_id,
        actor_username=event.actor_username,
        category=event.category,
        action=event.action,
        target_type=event.target_type,
        target_id=event.target_id,
        created_at=event.created_at,
        prev_hash=event.prev_hash,
    )
    assert _compute_hash(canonical) == event.current_hash
    session.close()


def test_hash_chain_subsequent_records_link(tenant_with_user):
    env = tenant_with_user
    session = env.Session()

    e1 = audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="login_success",
        tenant_id=env.tenant_id,
    )
    e2 = audit_log(
        session,
        category=AuditCategory.CLIENT.value,
        action="client.created",
        tenant_id=env.tenant_id,
    )
    session.commit()

    assert e1.prev_hash is None
    assert e2.prev_hash == e1.current_hash
    assert e1.current_hash != e2.current_hash
    session.close()


def test_hash_chain_per_tenant_isolation(tenant_with_user):
    """Two tenants → two independent genesis chains."""
    env = tenant_with_user
    session = env.Session()

    # Add a second tenant inline (fixture seeds only one).
    from app.models import Company

    session.add(Company(id=2, name="tenant_b", license_key="test-license-key-2"))
    session.commit()

    a1 = audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="a.login",
        tenant_id=1,
    )
    b1 = audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="b.login",
        tenant_id=2,
    )
    a2 = audit_log(
        session,
        category=AuditCategory.CLIENT.value,
        action="a.client.created",
        tenant_id=1,
    )
    session.commit()

    assert a1.prev_hash is None         # genesis for tenant 1
    assert b1.prev_hash is None         # genesis for tenant 2 (independent)
    assert a2.prev_hash == a1.current_hash  # links to tenant 1's chain
    assert a2.prev_hash != b1.current_hash  # NOT influenced by tenant 2
    session.close()


# ─── 7. Verifier — happy path ────────────────────────────────────────────


def test_verify_chain_intact(tenant_with_user):
    env = tenant_with_user
    session = env.Session()

    for i in range(5):
        audit_log(
            session,
            category=AuditCategory.SYSTEM.value,
            action=f"event.{i}",
            tenant_id=env.tenant_id,
        )
    session.commit()

    result = verify_audit_chain(session, tenant_id=env.tenant_id)
    assert result.ok is True
    assert result.total_records == 5
    assert result.chained_records == 5
    assert result.legacy_records == 0
    assert result.first_break_at is None
    assert result.first_break_reason is None
    session.close()


# ─── 8. Verifier — tampered current_hash ─────────────────────────────────


def test_verify_chain_detects_hash_tampering(tenant_with_user):
    """
    Simulate an attacker modifying current_hash directly. SQLite has no
    immutability triggers (unlike PG); we issue a raw UPDATE to bypass
    the application's append-only write path.
    """
    env = tenant_with_user
    session = env.Session()

    events = []
    for i in range(3):
        events.append(
            audit_log(
                session,
                category=AuditCategory.SYSTEM.value,
                action=f"event.{i}",
                tenant_id=env.tenant_id,
            )
        )
    session.commit()

    # Tamper with the middle record's current_hash.
    target_id = events[1].id
    session.execute(
        update(AuditEvent)
        .where(AuditEvent.id == target_id)
        .values(current_hash="0" * 63 + "f")  # plausible-shaped but wrong
    )
    session.commit()

    result = verify_audit_chain(session, tenant_id=env.tenant_id)
    assert result.ok is False
    # First break: when verifier walks forward, record 1 (the tampered)
    # fails its own hash recompute → HASH_MISMATCH on event 1.
    assert result.first_break_event_id == events[1].event_id
    assert result.first_break_reason == ChainBreakReason.HASH_MISMATCH
    session.close()


# ─── 9. Verifier — broken prev_hash linkage ──────────────────────────────


def test_verify_chain_detects_prev_hash_break(tenant_with_user):
    """
    Tamper with prev_hash on a non-genesis record so its stored linkage
    no longer matches the previous chained record's current_hash. The
    record's own current_hash is recomputed to stay self-consistent —
    so the failure must be PREV_HASH_MISMATCH, not HASH_MISMATCH.
    """
    env = tenant_with_user
    session = env.Session()

    events = []
    for i in range(3):
        events.append(
            audit_log(
                session,
                category=AuditCategory.SYSTEM.value,
                action=f"event.{i}",
                tenant_id=env.tenant_id,
            )
        )
    session.commit()

    target = events[2]
    fake_prev = "f" * 64
    # Recompute hash with the fake prev so that record 2 is internally
    # consistent — only its linkage to record 1 is broken.
    fake_canonical = _canonical_hash_content(
        event_id=target.event_id,
        tenant_id=target.tenant_id,
        actor_user_id=target.actor_user_id,
        actor_username=target.actor_username,
        category=target.category,
        action=target.action,
        target_type=target.target_type,
        target_id=target.target_id,
        created_at=target.created_at,
        prev_hash=fake_prev,
    )
    fake_current = _compute_hash(fake_canonical)
    session.execute(
        update(AuditEvent)
        .where(AuditEvent.id == target.id)
        .values(prev_hash=fake_prev, current_hash=fake_current)
    )
    session.commit()

    result = verify_audit_chain(session, tenant_id=env.tenant_id)
    assert result.ok is False
    assert result.first_break_event_id == target.event_id
    assert result.first_break_reason == ChainBreakReason.PREV_HASH_MISMATCH
    session.close()


# ─── 10. Verifier — legacy records ───────────────────────────────────────


def test_verify_chain_skips_legacy_unchained(tenant_with_user):
    """
    A leading block of legacy_unchained=True rows is counted but not
    verified, and the next chained record starts a fresh genesis
    (prev_hash MUST be NULL).
    """
    env = tenant_with_user
    session = env.Session()

    # Pre-existing legacy rows (migrated from audit_logs at some point).
    import uuid

    for i in range(2):
        session.add(
            AuditEvent(
                event_id=str(uuid.uuid4()),
                tenant_id=env.tenant_id,
                actor_user_id=env.user_id,
                actor_username=env.username,
                actor_role=env.role,
                category=AuditCategory.SYSTEM.value,
                action=f"legacy.{i}",
                target_type=None,
                target_id=None,
                payload_json=None,
                ip_address=None,
                user_agent=None,
                prev_hash=None,
                current_hash=LEGACY_HASH_PLACEHOLDER,
                legacy_unchained=True,
            )
        )
    session.commit()

    # Now write chained records via recorder.
    audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="post_migration.first",
        tenant_id=env.tenant_id,
    )
    audit_log(
        session,
        category=AuditCategory.AUTH.value,
        action="post_migration.second",
        tenant_id=env.tenant_id,
    )
    session.commit()

    result = verify_audit_chain(session, tenant_id=env.tenant_id)
    assert result.ok is True
    assert result.total_records == 4
    assert result.legacy_records == 2
    assert result.chained_records == 2
    session.close()
