"""
TenantScopedMixin for SQLAlchemy ORM models (AD-7).

Apply to NEW tenant-scoped models created in Phase 2+:

    from app.database import Base
    from app.tenancy.mixins import TenantScopedMixin

    class Client(TenantScopedMixin, Base):
        __tablename__ = "clients"
        id = Column(Integer, primary_key=True)
        # tenant_id is provided by the mixin (FK → companies.id, indexed)
        # ...other columns...

The mixin adds:
- tenant_id INTEGER NOT NULL, FK → companies.id (ON DELETE RESTRICT)
- index on tenant_id (SQLAlchemy default name: ix_<tablename>_tenant_id)

Why no __table_args__ in the mixin: subclasses commonly define their own
__table_args__ for UniqueConstraint, CheckConstraint, composite indexes,
etc. A mixin-level __table_args__ would be overridden by the subclass via
normal Python MRO, silently losing the tenant_id index. Using index=True
on the Column is part of the column definition itself and survives any
subclass __table_args__ override.

═══════════════════════════════════════════════════════════════════════
Query API — see app.tenancy.__init__ docstring for full details.
═══════════════════════════════════════════════════════════════════════

PREFER 2.0 style for new TenantScopedMixin code (idiomatic, future-proof):
    result = session.execute(select(Client).where(...))
    clients = result.scalars().all()

Legacy 1.x style (session.query(Client).filter(...).all()) is also
filtered correctly in current SA 2.0.x — verified by
tests/test_tenancy.py::test_query_legacy_style_behavior — but new code
should still prefer 2.0 style for consistency and forward compatibility.

═══════════════════════════════════════════════════════════════════════

The companies table is the canonical Tenant table per AD-1
(concept Tenant ≡ existing Company). When Phase 1+ migration renames
the table to "tenants", update the ForeignKey here and provide a DB
migration via Alembic.

ON DELETE RESTRICT: a tenant cannot be deleted while child rows exist.
Destructive tenant purge (Phase 7+ retention workflow) explicitly
cascades child tables first, then drops the tenant row. RESTRICT
prevents accidental DELETE FROM companies from cascading silently.
"""

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.orm import declared_attr


class TenantScopedMixin:
    """
    Mixin marking a model as tenant-scoped.

    Rows of this model belong to exactly one tenant. Queries against the
    model are auto-filtered by current_tenant_id via the do_orm_execute
    listener installed in sql_filter.py.

    The mixin acts as both:
    - A column provider (tenant_id Column with FK + index)
    - A marker class (sql_filter checks issubclass(mapper.class_,
      TenantScopedMixin) to decide whether to apply the auto-filter)
    """

    @declared_attr
    def tenant_id(cls):
        # NOTE: no return type annotation. SQLAlchemy 2.0+ Annotated Declarative
        # mode interprets `-> Column` as a Mapped[] annotation and rejects it.
        # The bare Column() return is correct for the project's legacy
        # declarative_base() Base in app.database.
        return Column(
            Integer,
            ForeignKey("companies.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
            doc="Tenant owning this row. Auto-filtered by tenancy.sql_filter.",
        )
