"""
Migrate legacy audit_logs → audit_events as legacy_unchained=True (AD-Q2).

CLI tool, NOT called automatically. Run manually before Phase 2 begins
heavy AuditEvent reads. Phase 1 keeps the legacy audit_logs table as-is;
new code (Phase 1+) writes through audit/recorder.audit_log() to
audit_events.

Mapping:
    legacy.company_id          → AuditEvent.tenant_id
    legacy.user_id             → AuditEvent.actor_user_id
    User.username (JOIN)       → AuditEvent.actor_username (forensics snapshot)
    User.role (JOIN, str)      → AuditEvent.actor_role
    legacy.action              → AuditEvent.action
    derived from action prefix → AuditEvent.category   (see _derive_category)
    legacy.entity_type         → AuditEvent.target_type
    str(legacy.entity_id)      → AuditEvent.target_id
    {"old": ..., "new": ...}   → AuditEvent.payload_json (when either non-NULL)
    legacy.ip_address          → AuditEvent.ip_address
    legacy.created_at          → AuditEvent.created_at
    NULL                       → AuditEvent.prev_hash
    LEGACY_HASH_PLACEHOLDER    → AuditEvent.current_hash
    True                       → AuditEvent.legacy_unchained

Idempotency: by default, the script refuses to run if audit_events
already contains rows. This protects the verifier's contiguous-prefix
assumption (see verifier.py module docstring) — once chained records
exist, prepending legacy rows would interleave them and silently break
chain integrity. Use --force only in dev to override.

═══════════════════════════════════════════════════════════════════════
Q-audit-D limitation — actor_username is NOT a true historical snapshot.

The script JOINs current users.username at migration time. If a user was
renamed between the original legacy action and this migration, the
CURRENT username is recorded as actor_username for the historical event.
Accepted trade-off for MVP — legacy audit_logs has no username column
to recover from.

Phase 2+ mitigation: when User lifecycle (lifecycle_state, rename
history) is formalized, add a username_history table or JSONB on User
and reconstruct historical username via time-based JOIN. Until then,
treat legacy actor_username as approximate.
═══════════════════════════════════════════════════════════════════════

Usage:
    python -m app.audit.migrate_legacy --dry-run
    python -m app.audit.migrate_legacy --commit
    python -m app.audit.migrate_legacy --commit --batch-size 5000
    python -m app.audit.migrate_legacy --commit --force   # dev only

Phase 2+ TODO: when Alembic is wired up, convert this to a data
migration step (op.execute / batch_alter_table) so it runs as part of
the normal upgrade path. Until then, manual invocation is the
documented procedure.
"""

import argparse
import logging
import sys
import uuid
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit.models import LEGACY_HASH_PLACEHOLDER, AuditCategory, AuditEvent
from app.database import SessionLocal
from app.models import AuditLog, User

logger = logging.getLogger(__name__)

# Map known legacy action prefixes → AuditCategory.
# Extracted from current callsites + AuditCategory enum + Phase 2+
# anticipated prefixes (freezing, document, transaction, user). Unknown
# prefixes fall back to SYSTEM. Splitting handles both "client.created"
# (dot-delimited) and "login_success" (underscore-delimited) styles.
_CATEGORY_BY_PREFIX = {
    # ── observed in current code ──────────────────────────────────────
    "client": AuditCategory.CLIENT,
    "sanctions": AuditCategory.SANCTIONS,
    "risk": AuditCategory.RISK,
    # ── auth / session ────────────────────────────────────────────────
    "auth": AuditCategory.AUTH,
    "login": AuditCategory.AUTH,
    "logout": AuditCategory.AUTH,
    "user": AuditCategory.AUTH,
    # ── domain (Phase 2+ anticipated) ─────────────────────────────────
    "ubo": AuditCategory.CLIENT,
    "check": AuditCategory.SANCTIONS,
    "tenancy": AuditCategory.TENANCY,
    "transactions": AuditCategory.TRANSACTIONS,
    "transaction": AuditCategory.TRANSACTIONS,
    "custody": AuditCategory.CUSTODY,
    "fiu": AuditCategory.FIU,
    "freezing": AuditCategory.FREEZING,
    "document": AuditCategory.SYSTEM,
    "system": AuditCategory.SYSTEM,
    "sensitive": AuditCategory.SENSITIVE_ACCESS,
}


def _derive_category(action: str) -> str:
    """
    Return AuditCategory string for a legacy action.

    Splits on "." then on "_" and matches the first segment against
    _CATEGORY_BY_PREFIX. Falls back to SYSTEM for unknown prefixes.
    """
    if not action:
        return AuditCategory.SYSTEM.value
    prefix = action.split(".", 1)[0].split("_", 1)[0].lower()
    return _CATEGORY_BY_PREFIX.get(prefix, AuditCategory.SYSTEM).value


def _build_payload(old_value, new_value) -> dict | None:
    """
    Pack legacy old_value/new_value into AuditEvent.payload_json.
    Returns None if both are NULL — keeps payload_json sparse.
    """
    if old_value is None and new_value is None:
        return None
    return {"old": old_value, "new": new_value}


def _iter_legacy_batches(
    session: Session, batch_size: int
) -> Iterable[list[tuple[AuditLog, str | None, str | None]]]:
    """
    Yield batches of (AuditLog, username, role) tuples ordered by id ASC.

    Keyset pagination via WHERE id > last_id is O(N) total — safer than
    OFFSET/LIMIT (O(N²/batch_size)) for large legacy tables. Uses LEFT
    OUTER JOIN on users so legacy rows survive even if their user_id
    has since been deleted (won't happen under RESTRICT, but pre-RESTRICT
    data may have orphans).
    """
    last_id = 0
    while True:
        stmt = (
            select(AuditLog, User.username, User.role)
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.id > last_id)
            .order_by(AuditLog.id.asc())
            .limit(batch_size)
        )
        rows = session.execute(stmt).all()
        if not rows:
            break
        # rows are (AuditLog, username, role) Row tuples
        yield [(r[0], r[1], r[2]) for r in rows]
        last_id = rows[-1][0].id


def migrate_legacy(
    session: Session,
    *,
    batch_size: int = 1000,
    dry_run: bool = True,
    force: bool = False,
) -> dict:
    """
    Migrate every audit_logs row → audit_events as legacy_unchained=True.

    Args:
        session: SQLAlchemy session. The whole migration runs in this
            session's transaction.
        batch_size: rows fetched per round-trip. Adjust for memory vs
            DB chatter; 1000 is conservative.
        dry_run: if True, build records but DO NOT add to session;
            return stats only.
        force: if True, run even when audit_events already has rows.
            DANGEROUS in production — interleaving legacy and chained
            records breaks the verifier's contiguous-prefix assumption.
            Intended for dev re-runs after a manual TRUNCATE alternative.

    Returns:
        Dict with keys: legacy_total, migrated, skipped, by_tenant,
        by_category.

    Raises:
        RuntimeError: audit_events already contains rows AND force=False.
    """
    existing = session.execute(select(func.count(AuditEvent.id))).scalar_one()
    if existing > 0 and not force:
        raise RuntimeError(
            f"audit_events already has {existing} rows — refusing to run. "
            f"Re-running could interleave legacy with chained records and "
            f"break verifier integrity. Use --force in dev only "
            f"(see module docstring)."
        )
    if existing > 0 and force:
        logger.warning(
            "audit_events already has %d rows; --force given — proceeding "
            "anyway. Verifier contiguous-prefix assumption may be violated.",
            existing,
        )

    legacy_total = session.execute(select(func.count(AuditLog.id))).scalar_one()
    logger.info("Found %d legacy audit_logs rows.", legacy_total)

    migrated = 0
    skipped = 0
    by_tenant: dict[int, int] = {}
    by_category: dict[str, int] = {}

    for batch in _iter_legacy_batches(session, batch_size):
        for legacy, username, role in batch:
            if legacy.company_id is None:
                # Tenant scope is mandatory in audit_events.
                # Legacy rows without company_id are dropped (logged).
                logger.warning(
                    "Skipping legacy row id=%d — NULL company_id", legacy.id
                )
                skipped += 1
                continue

            category = _derive_category(legacy.action)
            event = AuditEvent(
                event_id=str(uuid.uuid4()),
                tenant_id=legacy.company_id,
                actor_user_id=legacy.user_id,
                actor_username=username,
                actor_role=role,
                category=category,
                action=legacy.action,
                target_type=legacy.entity_type,
                target_id=str(legacy.entity_id) if legacy.entity_id is not None else None,
                payload_json=_build_payload(legacy.old_value, legacy.new_value),
                ip_address=legacy.ip_address,
                user_agent=None,
                created_at=legacy.created_at,
                prev_hash=None,
                current_hash=LEGACY_HASH_PLACEHOLDER,
                legacy_unchained=True,
            )
            if not dry_run:
                session.add(event)

            migrated += 1
            by_tenant[legacy.company_id] = by_tenant.get(legacy.company_id, 0) + 1
            by_category[category] = by_category.get(category, 0) + 1

        if not dry_run:
            session.flush()  # release row buffers per batch

    return {
        "legacy_total": legacy_total,
        "migrated": migrated,
        "skipped": skipped,
        "by_tenant": by_tenant,
        "by_category": by_category,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Migrate audit_logs → audit_events (legacy_unchained=True).",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--dry-run", action="store_true", help="Build records but don't INSERT."
    )
    group.add_argument(
        "--commit", action="store_true", help="Run the migration and COMMIT."
    )
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Run migration even if audit_events has rows. Use with caution: "
            "can interleave legacy with chained records, breaking verifier's "
            "contiguous-prefix assumption."
        ),
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    session = SessionLocal()
    try:
        stats = migrate_legacy(
            session,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            force=args.force,
        )
        if args.commit:
            session.commit()
            logger.info("Committed %d records.", stats["migrated"])
        else:
            session.rollback()
            logger.info(
                "Dry-run: would migrate %d records (no changes).",
                stats["migrated"],
            )

        logger.info("Stats:")
        logger.info("  legacy_total = %d", stats["legacy_total"])
        logger.info("  migrated     = %d", stats["migrated"])
        logger.info("  skipped      = %d", stats["skipped"])
        logger.info("  by_tenant    = %s", stats["by_tenant"])
        logger.info("  by_category  = %s", stats["by_category"])
        return 0
    except Exception:
        session.rollback()
        logger.exception("Migration failed; rolled back.")
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
