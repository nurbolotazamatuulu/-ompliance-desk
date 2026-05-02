"""
Hash-chain verifier (AD-Q2).

Walks all AuditEvent records for a given tenant in chronological order,
recomputes each hash from canonical content + stored prev_hash, and
compares against stored current_hash. Reports the first break.

Reuses _canonical_hash_content and _compute_hash from recorder.py to
guarantee identical hashing semantics — verifier and recorder must
agree byte-for-byte on the canonical representation, otherwise the
chain is unverifiable.

═══════════════════════════════════════════════════════════════════════
ASSUMPTION on legacy record layout:

legacy_unchained records, if present, occupy a CONTIGUOUS PREFIX of the
chronological sequence — they were all migrated from audit_logs at
deployment time, before any new chained records. The verifier does NOT
support legacy records interleaved with chained records (would silently
miss tampering across the legacy boundary).

If this assumption is ever violated (e.g. legacy migration is run on a
tenant that already has chained events, or new legacy records appear
post-migration), this function MUST be reviewed.

Q-audit-B (open question for Phase 2+ migration formalization):

Currently, the first post-migration chained record has prev_hash=NULL,
which a regulator could interpret as "no audit existed before this date".
When migrate_legacy.py is formalized in Phase 2+, consider one of:

  (a) Last legacy record's current_hash = LEGACY_HASH_PLACEHOLDER ('0'*64)
      AND the first post-migration record's prev_hash = same placeholder.
      The chain visually anchors to the migration boundary.

  (b) After migration completes, a system-generated AuditEvent of
      action='legacy_migration_completed' is written through the normal
      recorder.audit_log(). Its prev_hash links genesis = NULL by current
      semantics; the real new chain begins from this anchor record.

Both options preserve forensic continuity. Decide before first production
deployment that runs migrate_legacy.py.
═══════════════════════════════════════════════════════════════════════

Public API:

    result = verify_audit_chain(session, tenant_id=1)
    if not result.ok:
        # Investigate result.first_break_event_id, result.first_break_reason
        ...

Phase 1 scope: function ready, NOT called from a scheduler. Phase 1+
will add APScheduler weekly verification job (separate block).

Records with legacy_unchained=True are SKIPPED — they came from the
old audit_logs table without genuine hashes (LEGACY_HASH_PLACEHOLDER).
The verifier counts them but does not consider their absence a break.
"""

import enum
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.models import AuditEvent
from app.audit.recorder import _canonical_hash_content, _compute_hash


class ChainBreakReason(str, enum.Enum):
    """
    Discriminator for the failure mode detected by verify_audit_chain().

    Stored as a string-Enum for serialization / log compatibility (a
    `ChainBreakReason.HASH_MISMATCH` value compares equal to the literal
    string "hash_mismatch") while giving callers IDE autocomplete and
    typo protection on the producer side.
    """

    HASH_MISMATCH = "hash_mismatch"
    """Recomputed current_hash from canonical content does not equal the stored value."""

    PREV_HASH_MISMATCH = "prev_hash_mismatch"
    """Stored prev_hash does not equal the previous chained record's current_hash."""

    GENESIS_WITH_PREV = "genesis_with_prev"
    """
    First chained record (or first after a legacy block) has a non-NULL
    prev_hash — typically means the original genesis record was deleted
    and a later record now appears at the head of the chain.
    """

    NON_GENESIS_WITHOUT_PREV = "non_genesis_without_prev"
    """
    A non-first chained record has prev_hash=NULL — typically means the
    original genesis was deleted and a record from the middle is now
    incorrectly marked as genesis.
    """


@dataclass
class ChainVerificationResult:
    """
    Outcome of a hash-chain verification pass for one tenant.

    Fields:
        tenant_id: scope of the verification.
        total_records: all AuditEvent rows for this tenant.
        legacy_records: count of legacy_unchained=True (skipped).
        chained_records: count of records actually verified.
        first_break_at: created_at of the first record where the
            recomputed hash diverged or chain linkage failed. None if
            no break.
        first_break_event_id: event_id of that record. None if no break.
        first_break_reason: ChainBreakReason value. None if no break.
        ok: shorthand — True iff first_break_at is None.
    """

    tenant_id: int
    total_records: int
    legacy_records: int
    chained_records: int
    first_break_at: datetime | None
    first_break_event_id: str | None
    first_break_reason: ChainBreakReason | None

    @property
    def ok(self) -> bool:
        return self.first_break_at is None


def verify_audit_chain(session: Session, tenant_id: int) -> ChainVerificationResult:
    """
    Verify the integrity of the AuditEvent hash chain for a tenant.

    Algorithm:
        1. Load all rows for tenant ORDER BY created_at ASC, id ASC.
           (Same tiebreaker as recorder._fetch_prev_hash for consistency.)
        2. Walk in order:
           - skip legacy_unchained rows (count separately)
           - first chained record: prev_hash MUST be NULL (genesis)
           - subsequent chained records: prev_hash MUST equal previous
             chained record's current_hash
           - in either case: recompute current_hash from canonical content;
             MUST match stored current_hash
        3. Return result on first failure or after walking entire chain.

    After a contiguous block of legacy_unchained records, the next chained
    record is treated as the START of a new verifiable chain (prev_hash
    MUST be NULL). This reflects the migration semantics: legacy records
    have placeholder hashes, so they cannot anchor the chain — the chain
    begins from the first post-migration record. See Q-audit-B in the
    module docstring for Phase 2+ alternatives that preserve continuity.

    Args:
        session: SQLAlchemy session, any transaction state. Read-only.
        tenant_id: tenant to verify.

    Returns:
        ChainVerificationResult — call result.ok for boolean check.
    """
    stmt = (
        select(AuditEvent)
        .where(AuditEvent.tenant_id == tenant_id)
        .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
    )
    rows = session.execute(stmt).scalars().all()

    total = len(rows)
    legacy_count = 0
    chained_count = 0
    last_chained_hash: str | None = None  # current_hash of the previous chained record

    def _break(row: AuditEvent, reason: ChainBreakReason) -> ChainVerificationResult:
        return ChainVerificationResult(
            tenant_id=tenant_id,
            total_records=total,
            legacy_records=legacy_count,
            chained_records=chained_count,
            first_break_at=row.created_at,
            first_break_event_id=row.event_id,
            first_break_reason=reason,
        )

    for row in rows:
        if row.legacy_unchained:
            legacy_count += 1
            # Legacy records do NOT participate in the chain. They reset
            # the lineage from the verifier's perspective. The next
            # non-legacy record is treated as a genesis (prev_hash MUST
            # be NULL). See module docstring ASSUMPTION on legacy layout
            # and Q-audit-B for the migration boundary discussion.
            last_chained_hash = None
            continue

        chained_count += 1

        # Check 1: prev_hash linkage.
        if last_chained_hash is None:
            # First non-legacy record (or right after a legacy block).
            # Must be genesis — prev_hash NULL.
            if row.prev_hash is not None:
                return _break(row, ChainBreakReason.GENESIS_WITH_PREV)
        else:
            # Non-genesis record. prev_hash must equal previous chained hash.
            if row.prev_hash is None:
                return _break(row, ChainBreakReason.NON_GENESIS_WITHOUT_PREV)
            if row.prev_hash != last_chained_hash:
                return _break(row, ChainBreakReason.PREV_HASH_MISMATCH)

        # Check 2: recompute hash, compare to stored.
        canonical = _canonical_hash_content(
            event_id=row.event_id,
            tenant_id=row.tenant_id,
            actor_user_id=row.actor_user_id,
            actor_username=row.actor_username,
            category=row.category,
            action=row.action,
            target_type=row.target_type,
            target_id=row.target_id,
            created_at=row.created_at,
            prev_hash=row.prev_hash,
        )
        recomputed = _compute_hash(canonical)
        if recomputed != row.current_hash:
            return _break(row, ChainBreakReason.HASH_MISMATCH)

        last_chained_hash = row.current_hash

    return ChainVerificationResult(
        tenant_id=tenant_id,
        total_records=total,
        legacy_records=legacy_count,
        chained_records=chained_count,
        first_break_at=None,
        first_break_event_id=None,
        first_break_reason=None,
    )
