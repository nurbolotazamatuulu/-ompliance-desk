---
name: Q-deploy-A — License validation graceful degradation
description: AD-4 license validation with 24h grace period — define WHAT is blocked when license expired. Read operations must remain available; write operations should fail with clear UI message.
type: project
---

Q-deploy-A: AD-4 specifies "RSA-4096 JWT with 24-hour grace period"
for license validation — but does NOT define what happens when grace
period expires. Compliance officer needs to view existing data even
in expired-license state (regulatory requirement: cannot lose access
to historical KYC during contract renewal hiccup).

**Why:** ГСФР проверка / клиент в high-risk situation в момент когда
license истёк = полный outage = регуляторное замечание. ОВА не виноваты
что vendor (ComplianceDesk) не выслал новую лицензию вовремя.

**Recommended graceful degradation (Phase 1, Block 6):**
- Read operations: ALL remain available (clients list, audit log,
  existing risk scores, sanctions history, document download)
- Write operations: BLOCKED with clear UI banner "License expired —
  contact vendor to renew. Read-only mode."
  - Cannot create new clients
  - Cannot modify risk scores
  - Cannot run new sanctions screenings (use cached results only)
  - Cannot upload new documents
- Admin endpoints: BLOCKED (cannot change settings during expired state)
- Force-license-check endpoint: AVAILABLE (admin can paste new license
  JWT and recover without restart)

Implementation: middleware that checks license state on each request,
maps HTTP method (GET vs POST/PUT/PATCH/DELETE) to allow/deny.
