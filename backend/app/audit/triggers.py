"""
DB-level immutability triggers for audit_events (AD-Q2).

PL/pgSQL trigger that raises EXCEPTION on UPDATE/DELETE against
audit_events. This is the LAST line of defence — even a compromised
backend with full DB credentials cannot rewrite history without
explicitly dropping the trigger first (which itself is auditable
via pg_event_trigger / DDL audit if configured).

Application code in audit/recorder.py only INSERTs; the trigger
guarantees no other code path (manual SQL, ORM bug, malicious
backend) can modify or delete past records.

═══════════════════════════════════════════════════════════════════════
Idempotent install:

    from app.audit.triggers import install_audit_triggers
    install_audit_triggers(engine)

Safe to call on every backend startup. CREATE OR REPLACE FUNCTION +
DROP TRIGGER IF EXISTS + CREATE TRIGGER means re-running upgrades the
trigger body without errors and without leaving orphan triggers.

SQLite: no-op (test environment uses SQLite; immutability there is
guaranteed by application convention only — recorder.py never UPDATEs
or DELETEs, and tests don't either).

Why not Alembic: Alembic is not yet wired up in this project (Phase 0
deferred it). When Alembic lands in Phase 2+, the trigger install
becomes a versioned migration; until then, idempotent startup install
on each backend boot is the operational mechanism.
═══════════════════════════════════════════════════════════════════════
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


_IMMUTABLE_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION audit_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'audit_events is append-only — % denied (event_id=%, id=%)',
        TG_OP, OLD.event_id, OLD.id
        USING ERRCODE = 'check_violation';
    RETURN NULL;  -- unreachable, satisfies PL/pgSQL
END;
$$ LANGUAGE plpgsql;
"""

_DROP_UPDATE_TRIGGER_SQL = """
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
"""

_CREATE_UPDATE_TRIGGER_SQL = """
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
"""

_DROP_DELETE_TRIGGER_SQL = """
DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
"""

_CREATE_DELETE_TRIGGER_SQL = """
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
"""


def install_audit_triggers(engine: Engine) -> None:
    """
    Install (or refresh) the PL/pgSQL immutability triggers on
    audit_events. Idempotent — safe to run on every backend startup.

    No-op on non-Postgres engines (SQLite tests rely on application
    convention; recorder.py is the only writer and never UPDATEs/
    DELETEs).

    Args:
        engine: SQLAlchemy Engine bound to the target database.

    Raises:
        sqlalchemy.exc.SQLAlchemyError: only if the DDL itself fails
            (e.g. missing CREATE permission). Trigger DDL is in a
            single transaction — a failure leaves no half-installed state.
    """
    if engine.dialect.name != "postgresql":
        logger.debug(
            "install_audit_triggers: dialect=%s — skipping "
            "(SQLite/other relies on application convention).",
            engine.dialect.name,
        )
        return

    # All five statements in one transaction so a failure mid-way leaves
    # no partial state. begin() opens an explicit transaction; the
    # context manager commits on success, rolls back on exception.
    with engine.begin() as conn:
        conn.execute(text(_IMMUTABLE_FUNCTION_SQL))
        conn.execute(text(_DROP_UPDATE_TRIGGER_SQL))
        conn.execute(text(_CREATE_UPDATE_TRIGGER_SQL))
        conn.execute(text(_DROP_DELETE_TRIGGER_SQL))
        conn.execute(text(_CREATE_DELETE_TRIGGER_SQL))

    logger.info(
        "audit_events immutability triggers installed "
        "(audit_events_no_update, audit_events_no_delete)"
    )
