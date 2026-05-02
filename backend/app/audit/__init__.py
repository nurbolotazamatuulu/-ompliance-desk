"""
Audit module — immutable, hash-chained audit log (AD-Q2).

Public API:

    from app.audit import (
        audit_log,                  # write a new chained event (recorder.audit_log)
        AuditEvent,                 # ORM model
        AuditCategory,              # enum of valid category values
        LEGACY_HASH_PLACEHOLDER,    # constant for legacy_unchained rows
        verify_audit_chain,         # walk + verify chain for a tenant
        ChainVerificationResult,    # verifier return type
        ChainBreakReason,           # enum of failure modes
        install_audit_triggers,     # install PG immutability triggers (idempotent)
    )

Module layout:
    models.py         — AuditEvent ORM, AuditCategory enum, placeholder const
    recorder.py       — audit_log() + canonical hash helpers
    verifier.py       — verify_audit_chain() + result/reason types
    triggers.py       — install_audit_triggers(engine) — PL/pgSQL DENY UPDATE/DELETE
    migrate_legacy.py — CLI: audit_logs → audit_events (manual, NOT auto-run)

NOT re-exported on purpose:
    _canonical_hash_content, _compute_hash, _fetch_prev_hash — private to
    recorder.py; verifier.py imports them by name. New consumers should
    write through audit_log() and read through verify_audit_chain().

migrate_legacy.main is also not re-exported — it's a CLI entry point
invoked via `python -m app.audit.migrate_legacy`, not from app code.
"""

from app.audit.models import (
    LEGACY_HASH_PLACEHOLDER,
    AuditCategory,
    AuditEvent,
)
from app.audit.recorder import audit_log
from app.audit.triggers import install_audit_triggers
from app.audit.verifier import (
    ChainBreakReason,
    ChainVerificationResult,
    verify_audit_chain,
)

__all__ = [
    "audit_log",
    "AuditEvent",
    "AuditCategory",
    "LEGACY_HASH_PLACEHOLDER",
    "verify_audit_chain",
    "ChainVerificationResult",
    "ChainBreakReason",
    "install_audit_triggers",
]
