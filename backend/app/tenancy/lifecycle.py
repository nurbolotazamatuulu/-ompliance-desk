"""
Tenant lifecycle FSM (Phase 1 RBAC+FSM block, AD-1).

Provides:
- TenantLifecycleState enum  — values for Company.lifecycle_state
- SubscriptionSKU enum       — values for Company.subscription_sku (per AD-5)
- ALLOWED_TRANSITIONS dict   — declarative state machine
- InvalidTransitionError     — raised on illegal transition attempt
- provision_tenant / activate_tenant / suspend_tenant /
  terminate_tenant / mark_deletable

Each transition function:
  1. SELECT ... FOR UPDATE the Company row (serialize concurrent transitions).
  2. Validate current → target via ALLOWED_TRANSITIONS.
  3. Update lifecycle_state + relevant timestamp + reason.
  4. Sync the legacy is_active denormalization (Q-tenancy-C):
       True iff lifecycle_state == ACTIVE.
  5. session.flush() to persist the state change before audit.
  6. Write AuditEvent via audit.audit_log(category='tenancy',
     action='tenant.<transition>', target_type='Tenant', target_id=str(id),
     payload={'previous_state': ..., 'new_state': ..., 'reason': ...}).
  7. Return the updated Company.

The caller is responsible for session.commit() (or rollback). FSM
functions only flush — this lets callers compose transitions with other
business operations atomically (e.g. provision_tenant + initial user
seeding in one transaction).

═══════════════════════════════════════════════════════════════════════
Authorization:

FSM functions DO NOT check whether the actor has permission to perform
the transition. That is the responsibility of the caller (typically a
FastAPI route protected by @require_permission(Permission.TENANT_PROVISION)
etc. from app.rbac.decorators). FSM trusts that any caller passing the
actor_* parameters has already validated authorization.

This split keeps the FSM testable without a request context and lets a
single FSM call serve many entry points (HTTP routes, CLI scripts,
scheduled jobs) — each enforces its own authorization rules upstream.
═══════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════
Legacy AFG tenants:

Existing pre-Phase-1 rows in `companies` have `lifecycle_state='active'`
(via server_default on ALTER TABLE ADD COLUMN) AND `provisioned_at IS
NULL`. The FSM treats this combination as a VALID active state — no
back-fill of provisioned_at is performed. Phase 2+ may decide to
back-fill from `created_at` if forensic completeness becomes a
requirement.
═══════════════════════════════════════════════════════════════════════

Idempotency:
- activate_tenant on an already-ACTIVE tenant is a no-op: returns the
  Company unchanged and writes NO audit event. Repeated activate calls
  represent a caller bug (or a benign retry), not a regulator-relevant
  business event — audit should record state changes, not request
  noise. A WARNING is logged for traceability.
- suspend_tenant, terminate_tenant, mark_deletable are NOT idempotent —
  re-applying the same transition raises InvalidTransitionError because
  ALLOWED_TRANSITIONS does not include self-loops for them. (Why not
  symmetric with activate? Because suspend/terminate carry mandatory
  reasons; replaying would silently overwrite the original reason.)

Concurrency:
- SELECT ... FOR UPDATE on Company serializes transition attempts on
  the same row across concurrent transactions. Cross-process semantics
  match audit_log's: PG row lock works correctly; SQLite is serialized
  at session level so the lock is a no-op but harmless.

License keys:
- provision_tenant() requires the caller to supply license_key — the
  existing Company schema mandates UNIQUE NOT NULL. Phase 2 will add an
  app.licensing.generate_key() helper (Q-tenancy-D); until then, caller
  responsibility.
"""

import enum
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import AuditCategory, audit_log
from app.models import Company

logger = logging.getLogger(__name__)


class TenantLifecycleState(str, enum.Enum):
    PROVISIONING = "provisioning"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"
    DELETABLE = "deletable"


class SubscriptionSKU(str, enum.Enum):
    """SKU values per AD-5. CS / VO sold separately or as Full bundle."""

    CS = "CS"   # Compliance Standard
    VO = "VO"   # VASP Operator


# Allowed FSM transitions. No self-loops — activate's idempotent no-op
# is handled at the caller level (early return), not as a recorded
# transition. TERMINATED → DELETABLE gated by 7-year retention policy
# (Phase 2+ retention sweeper sets DELETABLE; manual call also allowed
# for emergency cleanup).
ALLOWED_TRANSITIONS: dict[
    TenantLifecycleState, set[TenantLifecycleState]
] = {
    TenantLifecycleState.PROVISIONING: {
        TenantLifecycleState.ACTIVE,
        TenantLifecycleState.TERMINATED,
    },
    TenantLifecycleState.ACTIVE: {
        TenantLifecycleState.SUSPENDED,
        TenantLifecycleState.TERMINATED,
    },
    TenantLifecycleState.SUSPENDED: {
        TenantLifecycleState.ACTIVE,
        TenantLifecycleState.TERMINATED,
    },
    TenantLifecycleState.TERMINATED: {
        TenantLifecycleState.DELETABLE,
    },
    TenantLifecycleState.DELETABLE: set(),  # terminal
}


class InvalidTransitionError(RuntimeError):
    """
    Raised when an FSM function is called for a transition that is not
    permitted from the current lifecycle_state, or for an unknown tenant.

    The exception message includes tenant_id, current_state, and
    target_state for diagnostics.
    """


def _utc_now() -> datetime:
    """UTC naive datetime — matches Company.* DateTime column semantics."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _load_for_update(session: Session, tenant_id: int) -> Company:
    """Lock the Company row for the duration of the transaction."""
    stmt = select(Company).where(Company.id == tenant_id).with_for_update()
    company = session.execute(stmt).scalar_one_or_none()
    if company is None:
        raise InvalidTransitionError(f"Tenant id={tenant_id} not found")
    return company


def _assert_transition(
    company: Company, target: TenantLifecycleState
) -> TenantLifecycleState:
    """Validate current → target. Returns the resolved current state."""
    try:
        current = TenantLifecycleState(company.lifecycle_state)
    except ValueError:
        raise InvalidTransitionError(
            f"Tenant id={company.id} has unknown lifecycle_state="
            f"{company.lifecycle_state!r}"
        )
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidTransitionError(
            f"Tenant id={company.id}: transition "
            f"{current.value} → {target.value} is not allowed"
        )
    return current


def _audit_transition(
    session: Session,
    *,
    company: Company,
    previous: TenantLifecycleState,
    new: TenantLifecycleState,
    action: str,
    actor_user_id: int,
    actor_username: str,
    actor_role: str,
    reason: Optional[str] = None,
) -> None:
    """Write the standard audit event for a real lifecycle transition."""
    audit_log(
        session,
        category=AuditCategory.TENANCY.value,
        action=action,
        tenant_id=company.id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
        target_type="Tenant",
        target_id=str(company.id),
        payload={
            "previous_state": previous.value,
            "new_state": new.value,
            "reason": reason,
        },
    )


# ═══════════════════ Transition functions ════════════════════════════


def provision_tenant(
    session: Session,
    *,
    name: str,
    subscription_sku: SubscriptionSKU,
    license_expires_at: datetime,
    license_key: str,
    actor_user_id: int,
    actor_username: str,
    actor_role: str,
) -> Company:
    """
    Create a new tenant in PROVISIONING state.

    Creation is NOT a transition (there is no previous state) — uses
    a creation-specific audit event instead of _audit_transition.

    license_key is required by the existing Company schema (UNIQUE NOT
    NULL). See Q-tenancy-D for the Phase 2 generator helper plan; for
    now caller supplies.

    Audit: action='tenant.provisioned', payload includes initial state,
    subscription SKU, license expiry, and tenant name.
    """
    now = _utc_now()
    company = Company(
        name=name,
        license_key=license_key,
        license_expires_at=license_expires_at,
        subscription_sku=subscription_sku.value,
        lifecycle_state=TenantLifecycleState.PROVISIONING.value,
        provisioned_at=now,
        is_active=False,  # not yet active
    )
    session.add(company)
    session.flush()  # assign id

    audit_log(
        session,
        category=AuditCategory.TENANCY.value,
        action="tenant.provisioned",
        tenant_id=company.id,
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
        target_type="Tenant",
        target_id=str(company.id),
        payload={
            "initial_state": TenantLifecycleState.PROVISIONING.value,
            "subscription_sku": subscription_sku.value,
            "license_expires_at": license_expires_at.isoformat(),
            "name": name,
        },
    )
    return company


def activate_tenant(
    session: Session,
    tenant_id: int,
    *,
    actor_user_id: int,
    actor_username: str,
    actor_role: str,
) -> Company:
    """
    PROVISIONING/SUSPENDED → ACTIVE.

    Idempotent on an already-ACTIVE tenant: returns the Company
    unchanged and writes NO audit event. A WARNING is logged for
    traceability — repeated activates indicate a caller bug or benign
    retry, not a business event the regulator needs to see.
    """
    company = _load_for_update(session, tenant_id)

    # Idempotent no-op: already ACTIVE. No state change, no audit.
    try:
        current = TenantLifecycleState(company.lifecycle_state)
    except ValueError:
        raise InvalidTransitionError(
            f"Tenant id={company.id} has unknown lifecycle_state="
            f"{company.lifecycle_state!r}"
        )
    if current == TenantLifecycleState.ACTIVE:
        logger.warning(
            "activate_tenant called on already-active tenant id=%d (no-op)",
            company.id,
        )
        return company

    if TenantLifecycleState.ACTIVE not in ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidTransitionError(
            f"Tenant id={company.id}: transition "
            f"{current.value} → {TenantLifecycleState.ACTIVE.value} is not allowed"
        )

    company.lifecycle_state = TenantLifecycleState.ACTIVE.value
    company.activated_at = _utc_now()
    company.is_active = True
    session.flush()

    _audit_transition(
        session,
        company=company,
        previous=current,
        new=TenantLifecycleState.ACTIVE,
        action="tenant.activated",
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
    )
    return company


def suspend_tenant(
    session: Session,
    tenant_id: int,
    reason: str,
    *,
    actor_user_id: int,
    actor_username: str,
    actor_role: str,
) -> Company:
    """ACTIVE → SUSPENDED. reason is mandatory for forensics."""
    if not reason or not reason.strip():
        raise ValueError("suspend_tenant requires a non-empty reason")

    company = _load_for_update(session, tenant_id)
    previous = _assert_transition(company, TenantLifecycleState.SUSPENDED)
    company.lifecycle_state = TenantLifecycleState.SUSPENDED.value
    company.suspended_at = _utc_now()
    company.suspension_reason = reason
    company.is_active = False
    session.flush()

    _audit_transition(
        session,
        company=company,
        previous=previous,
        new=TenantLifecycleState.SUSPENDED,
        action="tenant.suspended",
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
        reason=reason,
    )
    return company


def terminate_tenant(
    session: Session,
    tenant_id: int,
    reason: str,
    *,
    actor_user_id: int,
    actor_username: str,
    actor_role: str,
) -> Company:
    """
    PROVISIONING/ACTIVE/SUSPENDED → TERMINATED. One-way (only DELETABLE
    follows after retention period). reason is mandatory.
    """
    if not reason or not reason.strip():
        raise ValueError("terminate_tenant requires a non-empty reason")

    company = _load_for_update(session, tenant_id)
    previous = _assert_transition(company, TenantLifecycleState.TERMINATED)
    company.lifecycle_state = TenantLifecycleState.TERMINATED.value
    company.terminated_at = _utc_now()
    company.termination_reason = reason
    company.is_active = False
    session.flush()

    _audit_transition(
        session,
        company=company,
        previous=previous,
        new=TenantLifecycleState.TERMINATED,
        action="tenant.terminated",
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
        reason=reason,
    )
    return company


def mark_deletable(
    session: Session,
    tenant_id: int,
    *,
    actor_user_id: int,
    actor_username: str,
    actor_role: str,
) -> Company:
    """
    TERMINATED → DELETABLE. Called after the 7-year ГСФР retention
    period elapses. The actual hard-delete is a separate Phase 2+
    retention sweep that DROPs child tables and removes the row.
    """
    company = _load_for_update(session, tenant_id)
    previous = _assert_transition(company, TenantLifecycleState.DELETABLE)
    company.lifecycle_state = TenantLifecycleState.DELETABLE.value
    company.is_active = False
    session.flush()

    _audit_transition(
        session,
        company=company,
        previous=previous,
        new=TenantLifecycleState.DELETABLE,
        action="tenant.marked_deletable",
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        actor_role=actor_role,
    )
    return company
