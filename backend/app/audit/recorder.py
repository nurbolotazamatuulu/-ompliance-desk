"""
Hash-chain audit recorder (AD-Q2).

Public API:

    audit_log(
        session: Session,
        category: str,            # validated against AuditCategory
        action: str,
        tenant_id: int | None = None,
        actor_user_id: int | None = None,
        actor_username: str | None = None,
        actor_role: str | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        payload: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditEvent

Behavior:
- Synchronous write in the caller's session (per AD-Q2). If the business
  transaction rolls back, the audit record rolls back too — acceptable
  trade-off for atomic consistency.
- Computes prev_hash by querying the latest AuditEvent for the same
  tenant_id with SELECT ... FOR UPDATE (concurrency-safe under PG row
  lock; SQLite is serialized at session level so the lock is a no-op
  but harmless).
- First record per tenant has prev_hash=NULL (genesis).
- current_hash = SHA-256 hex of canonical event content + prev_hash.

Hash content (canonical, '|' delimited):
    event_id | tenant_id | actor_user_id | actor_username |
    category | action | target_type | target_id |
    created_at_iso | prev_hash

NULL fields render as empty string in the canonical representation.
ip_address, user_agent, payload_json are EXCLUDED from the hash
(see models.py docstring for rationale).

If tenant_id is None, the value is taken from
app.tenancy.get_current_tenant_id(). If still None — ValueError, since
audit ALWAYS requires a tenant scope.

═══════════════════════════════════════════════════════════════════════
Known limitations:

Q-audit-A — race condition on concurrent writes for the same tenant_id.
Two transactions calling audit_log() concurrently for the same tenant
can both read the same prev_hash before either INSERT lands, producing
two records with identical prev_hash (a fork in the chain). FOR UPDATE
mitigates this on Postgres if both writers use the same DB, but only
within a single transaction's scope; cross-process concurrency at the
same tenant level is not fully serialized.

Mitigation in Phase 2+ when concurrent CO operations on one tenant
become realistic:
  - UNIQUE(tenant_id, prev_hash) constraint to detect forks at INSERT time
    (the second writer fails and must retry with refreshed prev_hash), OR
  - pg_advisory_xact_lock(tenant_id) at the start of audit_log to
    serialize all writers per tenant.

On stage (а→б) with one CO per tenant, the real-world risk is minimal
and accepted. Test coverage in test_audit.py is single-threaded.
═══════════════════════════════════════════════════════════════════════
"""

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.models import AuditCategory, AuditEvent
from app.tenancy import get_current_tenant_id

_VALID_CATEGORIES: frozenset[str] = frozenset(c.value for c in AuditCategory)


def _canonical_hash_content(
    *,
    event_id: str,
    tenant_id: int,
    actor_user_id: int | None,
    actor_username: str | None,
    category: str,
    action: str,
    target_type: str | None,
    target_id: str | None,
    created_at: datetime,
    prev_hash: str | None,
) -> str:
    """
    Build the canonical '|' delimited string fed into SHA-256.

    NULL/None fields render as empty string. created_at is serialized
    as ISO 8601 in UTC with microsecond precision — this is what the
    DB stores after server_default=func.now() (PG truncates to
    microseconds; we mirror that semantics).

    Pure function — also used by verifier.py to recompute hashes during
    chain verification.
    """
    # Force UTC; remove tzinfo for stable round-trip with naive DB datetimes.
    if created_at.tzinfo is not None:
        created_at = created_at.astimezone(timezone.utc).replace(tzinfo=None)
    created_at_iso = created_at.isoformat(timespec="microseconds")

    parts = [
        event_id,
        str(tenant_id),
        str(actor_user_id) if actor_user_id is not None else "",
        actor_username or "",
        category,
        action,
        target_type or "",
        target_id or "",
        created_at_iso,
        prev_hash or "",
    ]
    return "|".join(parts)


def _compute_hash(content: str) -> str:
    """SHA-256 hex (lowercase) over UTF-8 encoded content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _fetch_prev_hash(session: Session, tenant_id: int) -> str | None:
    """
    Return current_hash of the most recent CHAINED AuditEvent for this
    tenant, or None if no prior chained record (genesis).

    legacy_unchained=True records are skipped — their current_hash is
    LEGACY_HASH_PLACEHOLDER (not a real cryptographic value), and the
    verifier treats the first post-legacy chained record as a fresh
    genesis (prev_hash=NULL). The recorder must agree, otherwise the
    chain produced here would always fail verification across the
    migration boundary. See verifier.py module docstring and Q-audit-B
    for the migration boundary discussion.

    Uses SELECT ... FOR UPDATE to serialize concurrent writers within
    one transaction. SQLite has no row lock — but session-level locking
    already serializes writes there. See Q-audit-A in module docstring
    for cross-transaction race conditions and Phase 2+ mitigations.

    Ordering: by created_at DESC, then id DESC as a tiebreaker for rows
    with identical timestamps (rare but possible at sub-microsecond).
    """
    stmt = (
        select(AuditEvent.current_hash)
        .where(AuditEvent.tenant_id == tenant_id)
        .where(AuditEvent.legacy_unchained.is_(False))
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(1)
        .with_for_update()
    )
    result = session.execute(stmt).scalar_one_or_none()
    return result


def audit_log(
    session: Session,
    category: str,
    action: str,
    *,
    tenant_id: int | None = None,
    actor_user_id: int | None = None,
    actor_username: str | None = None,
    actor_role: str | None = None,
    target_type: str | None = None,
    target_id: Any = None,
    payload: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditEvent:
    """
    Write a single AuditEvent in the caller's session, synchronously,
    with hash-chain integrity (AD-Q2).

    Args:
        session: SQLAlchemy session. The audit row participates in the
            same transaction as the business operation — if the caller
            rolls back, the audit also rolls back.
        category: AuditCategory value (validated; ValueError if invalid).
        action: Specific action name (e.g. "login_success").
        tenant_id: Explicit tenant scope. If None, taken from
            app.tenancy.get_current_tenant_id(). If still None,
            ValueError — audit ALWAYS requires a tenant.
        actor_user_id, actor_username, actor_role: Snapshot of the
            user performing the action. All None for system events.
        target_type, target_id: Entity acted upon. target_id may be
            int/UUID/str — coerced to string for storage.
        payload: Arbitrary structured details. Stored as JSONB on PG.
            NOT included in hash.
        ip_address, user_agent: Request context. NOT in hash.

    Returns:
        The buffered AuditEvent (flushed but not committed — caller's
        commit/rollback decides finality).

    Raises:
        ValueError: invalid category, missing tenant_id, or
            actor_username present while actor_user_id is None
            (denormalized snapshot must match its FK).
    """
    if category not in _VALID_CATEGORIES:
        raise ValueError(
            f"Invalid audit category: {category!r}. "
            f"Valid: {sorted(_VALID_CATEGORIES)}"
        )

    if tenant_id is None:
        tenant_id = get_current_tenant_id()
    if tenant_id is None:
        raise ValueError(
            "audit_log requires tenant_id (explicit arg or via "
            "app.tenancy.set_current_tenant_id() in request context)"
        )

    # Consistency: actor_username only meaningful when actor_user_id is set.
    if actor_username is not None and actor_user_id is None:
        raise ValueError(
            "actor_username is a snapshot of an actor; provide actor_user_id "
            "or pass actor_username=None for system events"
        )

    # Generate event_id and timestamp at app level (not via DB defaults) so
    # the same values participate in the hash.
    event_id = str(uuid.uuid4())
    # datetime.utcnow() is deprecated in Python 3.12. Use timezone-aware now()
    # then strip tzinfo to match the naive UTC datetime stored by Postgres
    # after server_default=func.now().
    created_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Coerce target_id to str (TZ allows int/UUID/composite).
    target_id_str = str(target_id) if target_id is not None else None

    # Lock + read prev_hash atomically with the upcoming INSERT.
    prev_hash = _fetch_prev_hash(session, tenant_id)

    canonical = _canonical_hash_content(
        event_id=event_id,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        category=category,
        action=action,
        target_type=target_type,
        target_id=target_id_str,
        created_at=created_at,
        prev_hash=prev_hash,
    )
    current_hash = _compute_hash(canonical)

    event = AuditEvent(
        event_id=event_id,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
        category=category,
        action=action,
        target_type=target_type,
        target_id=target_id_str,
        payload_json=payload,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=created_at,
        prev_hash=prev_hash,
        current_hash=current_hash,
        legacy_unchained=False,
    )
    session.add(event)
    # Flush so id is assigned + INSERT issued under the FOR UPDATE lock
    # acquired by _fetch_prev_hash. Without flush, INSERT would defer to
    # commit and concurrent transactions could compute the same prev_hash.
    session.flush()

    return event
