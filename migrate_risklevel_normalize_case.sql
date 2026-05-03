-- Phase 1 prep before Block 4 (Auth): normalize risklevel enum case.
-- Запускать: psql -U compliance_user -d compliance_db -f migrate_risklevel_normalize_case.sql
--
-- Background:
-- After migrate_risk_level.sql renamed 'unacceptable' → 'critical' (lowercase
-- preserved literally), the risklevel enum had mixed case
-- {LOW, MEDIUM, HIGH, critical}. Python's RiskLevel(str, enum.Enum) is
-- written/read by SQLAlchemy via enum .name (uppercase) by default. Writing
-- RiskLevel.CRITICAL would emit 'CRITICAL', which the DB rejected because
-- only lowercase 'critical' was defined. Latent bug — never triggered in
-- АФГ because no override path ever pushed a client to CRITICAL.
--
-- Fix: rename the lone lowercase label to uppercase. Atomic, no data
-- migration (existing rows are LOW/MEDIUM/HIGH and unaffected).

BEGIN;

ALTER TYPE risklevel RENAME VALUE 'critical' TO 'CRITICAL';

-- Sanity check (will print the resulting set; pipeline ignores stdout).
SELECT enum_range(NULL::risklevel) AS state_after;

COMMIT;
