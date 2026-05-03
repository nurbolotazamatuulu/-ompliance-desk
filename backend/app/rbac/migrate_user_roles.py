"""
Migrate User.role (legacy) → User.role_v2 (Phase 1 RBAC block).

CLI tool, NOT called automatically. Manual invocation pattern, mirrors
audit/migrate_legacy.py: --dry-run / --commit / --batch-size / --force.

═══════════════════════════════════════════════════════════════════════
WARNING: existing legacy SUPER_ADMIN users are mapped to TENANT_ADMIN
because legacy SUPER_ADMIN was a tenant-level admin role (ComplianceDesk
MVP did not distinguish vendor from tenant admin). After migration,
vendor SUPER_ADMIN users (ComplianceDesk operators) MUST be created
manually via SUPER_ADMIN provisioning script (not in this block).
NO existing AFG user should remain SUPER_ADMIN after migration.
═══════════════════════════════════════════════════════════════════════

Audit:
Each successful role migration writes an AuditEvent (category=
'tenancy', action='user.role_migrated', tenant_id=user.company_id,
actor_user_id=None, actor_username='system:migrate_user_roles',
payload={legacy_role, previous_role_v2, new_role_v2}). This is
regulator-relevant: ГСФР can audit who got which role and when.
Dry-run writes NO audit (audit only fires when committing).

Idempotency: by default, the script refuses to run if any User row
already has role_v2 set. This protects against double-runs that would
silently overwrite values. Use --force in dev to override (overwrites
existing role_v2 for all rows in scope).

Mapping: see app.rbac.roles.USER_ROLE_MIGRATION_MAP and the rationale
comment block in roles.py.

Usage:
    python -m app.rbac.migrate_user_roles --dry-run
    python -m app.rbac.migrate_user_roles --commit
    python -m app.rbac.migrate_user_roles --commit --batch-size 5000
    python -m app.rbac.migrate_user_roles --commit --force   # dev only

Phase 2+ TODO: when Alembic is wired up, convert to a data migration
step. Until then, manual invocation is documented procedure.
"""

import argparse
import logging
import sys
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import AuditCategory, audit_log
from app.database import SessionLocal
from app.models import User
from app.rbac.roles import USER_ROLE_MIGRATION_MAP, UserRoleV2

logger = logging.getLogger(__name__)


def _iter_user_batches(
    session: Session, batch_size: int, only_unmigrated: bool
) -> Iterable[list[User]]:
    """
    Yield batches of User rows ordered by id ASC.

    Keyset pagination via WHERE id > last_id (O(N) total). When
    only_unmigrated is True, restricts to rows where role_v2 IS NULL.
    """
    last_id = 0
    while True:
        stmt = select(User).where(User.id > last_id)
        if only_unmigrated:
            stmt = stmt.where(User.role_v2.is_(None))
        stmt = stmt.order_by(User.id.asc()).limit(batch_size)

        rows = session.execute(stmt).scalars().all()
        if not rows:
            break
        yield list(rows)
        last_id = rows[-1].id


def migrate_user_roles(
    session: Session,
    *,
    batch_size: int = 1000,
    dry_run: bool = True,
    force: bool = False,
) -> dict:
    """
    Walk User rows and populate role_v2 from role via
    USER_ROLE_MIGRATION_MAP.

    Args:
        session: SQLAlchemy session. The whole migration runs in this
            session's transaction.
        batch_size: rows fetched per round-trip.
        dry_run: if True, build the new role_v2 values but DO NOT
            UPDATE; return stats only and write NO audit events.
        force: if True, run even when some User rows already have
            role_v2 set, AND overwrite their existing role_v2 values.
            DANGEROUS in production — use only in dev when re-running
            after a partial commit or wanting to apply mapping changes.

    Returns:
        dict with keys: total_users, migrated, skipped (legacy role
        not in map — should not happen), already_v2 (had role_v2;
        unchanged unless force), by_legacy_role.

    Raises:
        RuntimeError: existing role_v2 values found AND force=False.
    """
    pre_existing = session.execute(
        select(func.count(User.id)).where(User.role_v2.isnot(None))
    ).scalar_one()

    if pre_existing > 0 and not force:
        raise RuntimeError(
            f"{pre_existing} User rows already have role_v2 set — refusing "
            f"to run. Re-running could overwrite intentional manual edits "
            f"(see Q-rbac-A). Use --force in dev only."
        )
    if pre_existing > 0 and force:
        logger.warning(
            "%d users already have role_v2; --force given — proceeding "
            "AND overwriting their existing role_v2 values.",
            pre_existing,
        )

    total_users = session.execute(select(func.count(User.id))).scalar_one()
    logger.info("Found %d total user rows.", total_users)

    migrated = 0
    skipped = 0
    already_v2 = 0
    by_legacy_role: dict[str, int] = {}

    for batch in _iter_user_batches(
        session, batch_size, only_unmigrated=not force
    ):
        for user in batch:
            if user.role_v2 is not None and not force:
                already_v2 += 1
                continue

            target = USER_ROLE_MIGRATION_MAP.get(user.role)
            if target is None:
                # Should not happen — map covers all UserRole values.
                logger.warning(
                    "User id=%d has legacy role=%r not in "
                    "USER_ROLE_MIGRATION_MAP; skipping.",
                    user.id,
                    user.role,
                )
                skipped += 1
                continue

            legacy_value = user.role.value
            by_legacy_role[legacy_value] = by_legacy_role.get(legacy_value, 0) + 1

            if not dry_run:
                previous_role_v2 = user.role_v2  # may be None or existing value
                user.role_v2 = target.value
                audit_log(
                    session,
                    category=AuditCategory.TENANCY.value,
                    action="user.role_migrated",
                    tenant_id=user.company_id,
                    actor_user_id=None,        # system event
                    actor_username="system:migrate_user_roles",
                    actor_role=None,
                    target_type="User",
                    target_id=str(user.id),
                    payload={
                        "legacy_role": legacy_value,
                        "previous_role_v2": previous_role_v2,
                        "new_role_v2": target.value,
                    },
                )

            migrated += 1

        if not dry_run:
            session.flush()

    return {
        "total_users": total_users,
        "migrated": migrated,
        "skipped": skipped,
        "already_v2": already_v2,
        "by_legacy_role": by_legacy_role,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Migrate User.role → User.role_v2 via USER_ROLE_MIGRATION_MAP.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--dry-run", action="store_true", help="Build new values but don't UPDATE."
    )
    group.add_argument(
        "--commit", action="store_true", help="Run the migration and COMMIT."
    )
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Run AND overwrite existing role_v2 values. Use with caution: "
            "destroys manual role corrections (see Q-rbac-A)."
        ),
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    session = SessionLocal()
    try:
        stats = migrate_user_roles(
            session,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
            force=args.force,
        )
        if args.commit:
            session.commit()
            logger.info("Committed %d user role migrations.", stats["migrated"])
        else:
            session.rollback()
            logger.info(
                "Dry-run: would migrate %d user roles (no changes).",
                stats["migrated"],
            )

        logger.info("Stats:")
        logger.info("  total_users    = %d", stats["total_users"])
        logger.info("  migrated       = %d", stats["migrated"])
        logger.info("  skipped        = %d", stats["skipped"])
        logger.info("  already_v2     = %d", stats["already_v2"])
        logger.info("  by_legacy_role = %s", stats["by_legacy_role"])
        return 0
    except Exception:
        session.rollback()
        logger.exception("Migration failed; rolled back.")
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
