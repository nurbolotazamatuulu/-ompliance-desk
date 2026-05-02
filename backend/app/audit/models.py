"""
AuditEvent model — immutable audit log with hash-chain integrity (AD-Q2).

Implements the design from docs/vasp-expansion/02-domain-model.md §2.1.4
at MVP level. Schema and integrity constraints are enforced at:

- DB level: NOT NULL on tenant_id, current_hash, etc.; UNIQUE on event_id;
  triggers DENY UPDATE/DELETE (installed by audit/triggers.py on Postgres).
- App level: hash-chain computation in audit/recorder.py; verification in
  audit/verifier.py.

NOT a TenantScopedMixin model — auto-filter would block SUPER_ADMIN
cross-tenant audit reads (which legitimately need WHERE tenant_id=X explicit
or no WHERE at all). Audit access control happens at higher layers (RBAC
matrix in 2.1.3, REGULATOR_AUDITOR endpoint scoping in 2.4.x).
"""

import enum
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.database import Base


class AuditCategory(str, enum.Enum):
    """
    Valid `category` values for AuditEvent.

    Stored as String(30) in the DB (NOT as SA Enum) for flexibility —
    extending the list does not require ALTER TYPE in Postgres.
    Validation happens at app level in audit.recorder.audit_log().
    """

    AUTH = "auth"
    TENANCY = "tenancy"
    CLIENT = "client"
    SANCTIONS = "sanctions"
    RISK = "risk"
    TRANSACTIONS = "transactions"
    CUSTODY = "custody"
    FIU = "fiu"
    FREEZING = "freezing"
    SYSTEM = "system"
    SENSITIVE_ACCESS = "sensitive_access"


# Hash placeholder for legacy records migrated from audit_logs without
# recomputing chain. 64 zero-bytes = "no real hash". Verifier skips these.
LEGACY_HASH_PLACEHOLDER = "0" * 64


class AuditEvent(Base):
    """
    Immutable audit log entry with hash-chain integrity (AD-Q2).

    Each row's current_hash incorporates the previous row's hash (within
    the same tenant), creating a tamper-evident sequence. Updates and
    deletes are blocked by DB triggers on Postgres (audit/triggers.py)
    and by application convention everywhere.

    Hash content (canonical, written at record creation):
        SHA256(
            event_id | tenant_id | actor_user_id | actor_username |
            category | action | target_type | target_id |
            created_at_iso | prev_hash
        )

    Note on EXCLUDED fields:
    - payload_json is NOT in the hash. It may contain volatile data
      (precision-different timestamps, debug info) that shouldn't break
      verification.
    - ip_address and user_agent are NOT in the hash. They may differ
      across environments (proxy headers, X-Forwarded-For), and including
      them would make the chain brittle in deployment scenarios.

    actor_username IS in the hash as a denormalized snapshot — protects
    forensics integrity even if a User row is somehow physically removed
    via manual DB ops outside the regulatory retention policy. The
    actor_user_id FK alone could become NULL or dangling; the username
    captured at write time is permanent and hash-anchored.

    See audit/recorder.py for write API and audit/verifier.py for
    chain verification.
    """

    __tablename__ = "audit_events"

    # ─── Identity ─────────────────────────────────────────────────────
    id = Column(Integer, primary_key=True)
    event_id = Column(
        String(36),
        nullable=False,
        unique=True,
        default=lambda: str(uuid.uuid4()),
        doc="UUID — natural identifier for cross-system reference",
    )

    # ─── Scope ────────────────────────────────────────────────────────
    tenant_id = Column(
        Integer,
        ForeignKey("companies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc=(
            "Tenant this event belongs to. NOT routed through "
            "TenantScopedMixin auto-filter — audit reads are controlled "
            "explicitly by RBAC at higher layers, not by request context."
        ),
    )

    # ─── Actor (who) ──────────────────────────────────────────────────
    actor_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        doc=(
            "User performing the action. NULL for system-generated events. "
            "RESTRICT on delete: User entity is subject to 7-year retention "
            "(Q12); hard-delete is not permitted by regulatory policy. "
            "lifecycle_state='terminated' is the correct way to deactivate "
            "users while preserving audit references."
        ),
    )
    actor_username = Column(
        String(255),
        nullable=True,
        doc=(
            "Denormalized snapshot of actor's username at event time. "
            "Captured by recorder.audit_log() and hash-anchored. Survives "
            "even if a User row is physically removed outside policy "
            "(operational accident, manual DB ops). NULL only when "
            "actor_user_id is NULL (system events)."
        ),
    )
    actor_role = Column(
        String(50),
        nullable=True,
        doc="Snapshot of actor's role at event time (denormalized for forensics).",
    )

    # ─── Action (what) ────────────────────────────────────────────────
    category = Column(
        String(30),
        nullable=False,
        doc="Top-level grouping; valid values in AuditCategory enum.",
    )
    action = Column(
        String(100),
        nullable=False,
        doc="Specific action (e.g. 'login_success', 'tenant_filter_bypassed').",
    )

    # ─── Target (on what) ─────────────────────────────────────────────
    target_type = Column(
        String(50),
        nullable=True,
        doc="Entity type acted upon (e.g. 'User', 'Client', 'Tenant').",
    )
    target_id = Column(
        String(50),
        nullable=True,
        doc="Target entity ID. String to support int/UUID/composite IDs.",
    )

    # ─── Payload (free-form details) ──────────────────────────────────
    payload_json = Column(
        # JSONB on Postgres (binary, indexable JSON paths); JSON on SQLite tests.
        JSON().with_variant(JSONB(), "postgresql"),
        nullable=True,
        doc=(
            "Arbitrary JSON details. NOT included in hash — may contain "
            "volatile data (precise timestamps, debug info)."
        ),
    )

    # ─── Request context ──────────────────────────────────────────────
    # ip_address and user_agent are NOT in hash content (see class docstring).
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)

    # ─── Time ─────────────────────────────────────────────────────────
    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        doc="Wall-clock time of the event. Part of hash content.",
    )

    # ─── Hash chain ───────────────────────────────────────────────────
    prev_hash = Column(
        String(64),
        nullable=True,
        doc=(
            "current_hash of the previous AuditEvent for the same tenant, "
            "in created_at order. NULL for the first record per tenant."
        ),
    )
    current_hash = Column(
        String(64),
        nullable=False,
        doc="SHA-256 hex of canonical event content + prev_hash.",
    )

    # ─── Migration marker ─────────────────────────────────────────────
    legacy_unchained = Column(
        Boolean,
        nullable=False,
        default=False,
        doc=(
            "True for records migrated from the legacy audit_logs table "
            "(audit/migrate_legacy.py). Skipped by chain verification "
            "(no genuine hash computed at original write time)."
        ),
    )

    __table_args__ = (
        # Per-tenant chronological queries (most common access pattern).
        # ASC index works for ORDER BY created_at DESC too in PG and SQLite.
        Index("ix_audit_events_tenant_created", "tenant_id", "created_at"),
        # Per-tenant filtered-by-category queries (e.g. all auth events).
        Index(
            "ix_audit_events_tenant_category_created",
            "tenant_id",
            "category",
            "created_at",
        ),
    )
