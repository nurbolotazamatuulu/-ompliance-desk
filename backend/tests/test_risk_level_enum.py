"""
Regression tests for app.models.RiskLevel ↔ SA Enum serialization.

Background (Phase 1 sweep before Block 4):
The PG `risklevel` enum had mixed case `{LOW, MEDIUM, HIGH, critical}`
(historical artifact from migrate_risk_level.sql which renamed the old
`unacceptable` → `critical` literally). Python's RiskLevel(str, enum.Enum)
is serialized by SQLAlchemy via `.name` (UPPER) by default, so writing
RiskLevel.CRITICAL emitted 'CRITICAL' which the DB rejected. Latent
production bug — never triggered because no override path had pushed a
client to CRITICAL yet.

Fix: ALTER TYPE risklevel RENAME VALUE 'critical' TO 'CRITICAL'.

These tests assert two contracts that protect against future regression:

  1. Every RiskLevel value round-trips through ORM (write → read → equal).
  2. Raw DB strings written by SA are upper-case `.name` values
     ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') — the contract that the DB
     enum labels were normalized to match.

Limitation: SQLite does NOT enforce PG enum CHECK constraints; this test
verifies Python/SA wiring only. The actual PG-level enforcement is not
exercised here — see Q-audit-C (PG service container in CI).
"""

from sqlalchemy import Column, Enum, Integer, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.models import RiskLevel


def _make_test_table():
    """Build a throwaway model + engine bound to RiskLevel column."""
    Base = declarative_base()

    class _RLTest(Base):
        __tablename__ = "_rl_test"
        id = Column(Integer, primary_key=True)
        rl = Column(Enum(RiskLevel))

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return engine, Session, _RLTest


def test_all_risk_levels_round_trip():
    """Each RiskLevel value writes and reads back as the same enum member."""
    engine, Session, Model = _make_test_table()
    try:
        session = Session()
        for level in RiskLevel:
            session.add(Model(rl=level))
        session.commit()

        rows = session.query(Model).order_by(Model.id).all()
        assert [r.rl for r in rows] == list(RiskLevel)
        session.close()
    finally:
        engine.dispose()


def test_risk_level_serialized_as_uppercase_name():
    """SA writes RiskLevel.<name> (UPPER) to the underlying column.

    This is the contract that drove the DB enum case normalization
    (commit pre-Block-4): `risklevel` PG type labels are upper-case so
    that SA default mode (.name) and the DB agree.
    """
    engine, Session, Model = _make_test_table()
    try:
        session = Session()
        for level in RiskLevel:
            session.add(Model(rl=level))
        session.commit()

        raw = session.execute(text("SELECT rl FROM _rl_test ORDER BY id")).all()
        assert [r[0] for r in raw] == ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        session.close()
    finally:
        engine.dispose()
