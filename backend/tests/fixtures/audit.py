"""
Pytest fixtures for audit module tests (AD-Q2).

Provides `tenant_with_user` fixture — a fresh SQLite in-memory engine
with companies + users + audit_events tables and one seeded tenant +
user. The audit tests use the project's actual `app.database.Base`
(unlike `two_tenants` which builds its own local Base for
TenantScopedMixin coverage).

Why selective table creation instead of full Base.metadata.create_all:
the wider AFG model graph references PG-specific features (JSONB
defaults, etc.) and would slow down tests by an order of magnitude.
We only need companies, users, and audit_events for these tests.
"""

from dataclasses import dataclass
from typing import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.audit.models import AuditEvent
from app.database import Base
from app.models import AuditLog, Company, User, UserRole


@dataclass
class AuditTestEnv:
    """
    Handle exposed by `tenant_with_user`.

    Fields:
        tenant_id: companies.id of the seeded tenant (always 1).
        user_id: users.id of the seeded user (always 1).
        username: snapshot for assertions (matches users.email — Phase 1
            User has no separate username column; tests align with model).
        role: stringified UserRole.
        Session: sessionmaker bound to the in-memory engine. Each test
            creates its own Session() instance.
        engine: Engine handle for raw SQL test setup (e.g. tampering
            tests that need to bypass the ORM's audit_events INSERT path).
    """

    tenant_id: int
    user_id: int
    username: str
    role: str
    Session: type
    engine: object


@pytest.fixture
def tenant_with_user() -> Generator[AuditTestEnv, None, None]:
    """
    Fresh SQLite in-memory engine with one tenant + one user seeded.

    Tables created (selective; not the full Base.metadata):
      - companies   (FK target for tenant_id)
      - users       (FK target for actor_user_id)
      - audit_logs  (legacy table, kept available for migrate_legacy tests)
      - audit_events
    """
    engine = create_engine("sqlite:///:memory:", echo=False)

    Base.metadata.create_all(
        engine,
        tables=[
            Company.__table__,
            User.__table__,
            AuditLog.__table__,
            AuditEvent.__table__,
        ],
    )

    Session = sessionmaker(bind=engine)
    session = Session()

    company = Company(
        id=1,
        name="tenant_a",
        license_key="test-license-key-1",
    )
    user = User(
        id=1,
        company_id=1,
        email="alice@tenant-a.test",
        full_name="Alice Tester",
        hashed_password="not-a-real-hash",
        role=UserRole.COMPANY_ADMIN,
    )
    session.add_all([company, user])
    session.commit()
    session.close()

    yield AuditTestEnv(
        tenant_id=1,
        user_id=1,
        username="alice@tenant-a.test",
        role=UserRole.COMPANY_ADMIN.value,
        Session=Session,
        engine=engine,
    )

    engine.dispose()
