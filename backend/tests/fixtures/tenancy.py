"""
Pytest fixtures for tenancy tests.

Provides `two_tenants` fixture and `use_tenant` context manager — the
canonical pattern for testing tenant isolation per AD-7.

Each test gets a fresh SQLite in-memory engine + Base + 2 isolated tenants
(no leak between tests, no need for a running PG).
"""

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator

import pytest
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.tenancy import (
    TenantScopedMixin,
    install_tenant_filter,
    reset_tenant_id,
    set_current_tenant_id,
)


@dataclass
class TenantHandle:
    """Convenient handle to a tenant + its sample data for assertions."""

    id: int
    name: str
    sample_data: list  # records owned by this tenant for cross-tenant tests


@dataclass
class TwoTenantsFixture:
    a: TenantHandle
    b: TenantHandle
    Session: type
    Model: type   # the test model (TenantScopedMixin subclass)


@pytest.fixture
def two_tenants() -> Generator[TwoTenantsFixture, None, None]:
    """
    Creates a fresh SQLite in-memory engine with:
    - companies table (FK target for tenant_id)
    - SampleTenantedModel (TenantScopedMixin subclass) for assertion targets
    - Two seeded tenants (id=1 'tenant_a', id=2 'tenant_b'), each with 2 rows

    Yields a handle exposing a, b, Session class, Model class.

    Cleanup is automatic — engine + Base are local to this fixture invocation,
    no shared state between tests.
    """
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base = declarative_base()

    class Company(Base):
        __tablename__ = "companies"
        id = Column(Integer, primary_key=True)
        name = Column(String(50), nullable=False)

    class SampleTenantedModel(TenantScopedMixin, Base):
        __tablename__ = "sample_tenanted"
        id = Column(Integer, primary_key=True)
        label = Column(String(100))

    Base.metadata.create_all(engine)
    install_tenant_filter()  # idempotent; safe to call across multiple tests

    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed 2 companies + 4 sample rows (2 per tenant).
    # INSERT path is not affected by tenant filter — direct .add works
    # regardless of current_tenant_id.
    session.add_all([
        Company(id=1, name="tenant_a"),
        Company(id=2, name="tenant_b"),
    ])
    session.flush()

    a_rows = [
        SampleTenantedModel(id=10, label="A-row-1", tenant_id=1),
        SampleTenantedModel(id=11, label="A-row-2", tenant_id=1),
    ]
    b_rows = [
        SampleTenantedModel(id=20, label="B-row-1", tenant_id=2),
        SampleTenantedModel(id=21, label="B-row-2", tenant_id=2),
    ]
    session.add_all(a_rows + b_rows)
    session.commit()
    session.close()

    yield TwoTenantsFixture(
        a=TenantHandle(id=1, name="tenant_a", sample_data=[10, 11]),
        b=TenantHandle(id=2, name="tenant_b", sample_data=[20, 21]),
        Session=Session,
        Model=SampleTenantedModel,
    )

    engine.dispose()


@contextmanager
def use_tenant(tenant: TenantHandle):
    """
    Context manager: set current_tenant_id to tenant.id for the scope,
    reset on exit (token-based — safe for nested use_tenant() calls).

    Example:
        with use_tenant(two_tenants.a):
            # current_tenant_id == tenant_a.id
            ...
    """
    token = set_current_tenant_id(tenant.id)
    try:
        yield
    finally:
        reset_tenant_id(token)
