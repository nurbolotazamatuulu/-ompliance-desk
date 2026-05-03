---
name: Q-deploy-B — Managed updater for non-technical customers
description: AD-2 says "client pulls and restarts" for updates — assumes customer has technical staff. Many VASP in KG do not. Optional managed updater agent inside docker-compose can pull + restart automatically based on signed update notifications.
type: project
---

Q-deploy-B: AD-2 deployment model assumes customer can run
`docker-compose pull && docker-compose up -d` and handle migrations.
Reality: many VASP в КР не имеют IT отдела, compliance officer =
бухгалтер + директор + AML.

**Why:** Без managed updater каждый release = WhatsApp с customer'ом,
"запусти эту команду", "что увидел в логах?". Не масштабируется на
5+ customers, блокирует sales-driven onboarding (sales не может
гарантировать customer'у что обновления будут гладкими).

**Recommended approach (Phase 4 or sooner if pain):**
- Add updater agent service to docker-compose (Python script +
  APScheduler).
- Polls signed update manifest from vendor registry every 6 hours.
- If new version available: docker pull, alembic upgrade,
  docker-compose restart of backend service.
- Reports success/failure to vendor via webhook (opt-in telemetry).
- Customer can disable in settings if they want manual control.
- Signed manifest prevents rogue updates (RSA verify against vendor
  public key, same as license validation key).

Не critical для Phase 1 (АФГ self-managed). Critical когда выйдешь на
2-3 paying tenant'ов которые НЕ technical.
