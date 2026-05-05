# 04 Технический план Phase 1

**Версия:** 1.0
**Дата:** 2026-05-03
**Шаг VASP-расширения:** 4/5
**Статус:** ретроспективная фиксация (3/6 блоков уже отгружены)

---

## Контекст

Документ фиксирует разбиение Phase 1 (foundation) на исполнительные блоки, мэппинг между архитектурными решениями ([03-architecture.md](03-architecture.md)) и их реализацией, а также открытые вопросы и отложенные на Phase 2+ задачи.

Документ создан **ретроспективно** после отгрузки Block 1–3. Block 4–6 описаны как план перед стартом, с зафиксированными architectural decisions (источник истины — `MEMORY.md` в auto-memory каждой сессии Claude).

Связанные артефакты:

- [00-decisions.md](00-decisions.md) — журнал регуляторных и архитектурных решений (Q1, Q2, …)
- [01-regulatory-checklist.md](01-regulatory-checklist.md) — 232 регуляторных требования из 9 НПА
- [02-domain-model.md](02-domain-model.md) — доменная модель (59 entities)
- [03-architecture.md](03-architecture.md) — архитектурные решения AD-1..AD-Q5
- [05-roadmap.md](05-roadmap.md) — поэтапный roadmap до Phase 4+

---

## Phase 1: scope и блоки

Phase 1 — **fundament**: multi-tenancy, audit, RBAC, FSM, auth, settings, license validation. Без этого fundament нельзя выкатывать клиент-facing features безопасно (audit обязан существовать до того как клиентские мутации записываются; tenant filter обязан существовать до того как multi-tenant данные пересекаются; etc.).

Phase 1 разбит на 6 блоков с критерием атомарности коммита: каждый блок — один зелёный CI коммит, не ломающий existing смоук-тесты.

### Map: AD → Block

| AD | Реализующий блок |
|---|---|
| AD-1 — modular monolith, multi-tenant | Block 1 (foundation) + Block 3 (FSM extension) |
| AD-2 — on-prem Docker Compose | Phase 0 (вне scope этого плана) |
| AD-3 — АФГ dev+prod разделение | Phase 0 |
| AD-4 — License подписанный JWT | Block 6 |
| AD-5 — SKU CS+VO | Block 3 (Company.subscription_sku) + Phase 2 routing |
| AD-6 — MinIO objects | Phase 0 + Phase 2 (storage layer) |
| AD-7 — multi-tenancy application-level | **Block 1** ✅ |
| AD-8 — APScheduler background jobs | Block 6 (license re-check) + Phase 2 (sanctions, KYT) |
| AD-9 — три SPA в monorepo | Phase 0 |
| AD-10 — Self-hosted auth | **Block 4** |
| AD-Q1 — Polymorphic FK | Phase 2 (Document, AuditEvent target_id уже строка — не нужно AD-Q1) |
| AD-Q2 — Hash-chain audit | **Block 2** ✅ |
| AD-Q3 — Sanctions без кэша | Phase 2 |
| AD-Q4 — Parallel sanctions screening | Phase 2 |
| AD-Q5 — Custodial omnibus | Phase 4 (VASP Operations) |

---

## Блоки Phase 1

### Block 1: Multi-tenancy infrastructure (AD-7) ✅

**Commit:** `7417899`
**Scope:** ContextVar + автоматический tenant_id-фильтр через SA `do_orm_execute`.

**Public API:**

```python
from app.tenancy import (
    TenantScopedMixin,            # mixin для tenant-scoped моделей
    set_current_tenant_id,        # запись в ContextVar
    get_current_tenant_id,        # чтение
    reset_tenant_id,              # token-based reset
    bypass_tenant_filter,         # context manager для админ-операций
    install_tenant_filter,        # установка SA-listener при старте
)
from app.tenancy.dependencies import tenant_scoped  # FastAPI dependency
```

**Файлы:** [`backend/app/tenancy/`](../../backend/app/tenancy/) — `context.py`, `mixins.py`, `sql_filter.py`, `dependencies.py`, `__init__.py`.

**Тесты:** `backend/tests/test_tenancy.py` — 7 тестов, покрытие ContextVar isolation, bypass, fail-fast в strict env, фильтрация cross-tenant запросов.

---

### Block 2: AuditEvent с hash-chain (AD-Q2) ✅

**Commit:** `b56548c`
**Scope:** Tamper-evident audit log с per-tenant SHA-256 hash chain. Регулятор-критическая компонента (7-летний retention из ст. 12 Закона КР № 87).

**Public API:**

```python
from app.audit import (
    audit_log,                  # write a chained event
    AuditEvent,                 # ORM модель
    AuditCategory,              # enum валидных категорий
    LEGACY_HASH_PLACEHOLDER,    # константа для legacy_unchained=True
    verify_audit_chain,         # walk + verify chain для tenant
    ChainVerificationResult,    # результат verifier
    ChainBreakReason,           # типы поломок
    install_audit_triggers,     # PG immutability triggers (idempotent)
)
```

**Hash content (canonical, SHA-256 hex):**

```
event_id | tenant_id | actor_user_id | actor_username |
category | action | target_type | target_id |
created_at_iso | prev_hash
```

`actor_username` — **денормализованный snapshot**, hash-anchored: пережёвывается даже если User row будет физически удалён вне политики.

`payload_json`, `ip_address`, `user_agent` — **не в hash** (volatile / environment-dependent).

**Файлы:** [`backend/app/audit/`](../../backend/app/audit/) — `models.py`, `recorder.py`, `verifier.py`, `triggers.py`, `migrate_legacy.py`, `__init__.py`.

**Тесты:** `backend/tests/test_audit.py` — 13 тестов. Genesis, цепочка, per-tenant изоляция, hash tampering detection (HASH_MISMATCH), prev_hash break (PREV_HASH_MISMATCH), legacy skip semantics.

---

### Block 3: RBAC + tenant FSM + user extensions ✅

**Commit:** `b5c6699`
**Scope:** RBAC matrix (5 ролей × 12 permissions), tenant lifecycle FSM, расширение Company и User под Block 4.

**Public API RBAC:**

```python
from app.rbac import (
    UserRoleV2,                   # canonical role enum (5 ролей)
    USER_ROLE_MIGRATION_MAP,      # legacy UserRole → V2
    Permission,                   # 12 permissions
    RBAC_MATRIX,                  # role → frozenset[Permission]
    can,                          # can(role, permission) -> bool
    require_permission,           # FastAPI dep factory
)
```

**Public API tenant FSM:**

```python
from app.tenancy.lifecycle import (
    TenantLifecycleState,         # PROVISIONING/ACTIVE/SUSPENDED/TERMINATED/DELETABLE
    SubscriptionSKU,              # CS / VO (per AD-5)
    InvalidTransitionError,
    provision_tenant,
    activate_tenant,
    suspend_tenant,
    terminate_tenant,
    mark_deletable,
)
```

**Расширение моделей:**

- `Company`: `lifecycle_state`, `subscription_sku`, `provisioned_at`, `activated_at`, `suspended_at`, `suspension_reason`, `terminated_at`, `termination_reason`. `is_active` оставлено как denormalization (Q-tenancy-C).
- `User`: `lifecycle_state`, `mfa_enrolled`, `mfa_secret`, `password_changed_at`, `failed_login_count`, `locked_until`, `role_v2`. **Все колонки добавлены, но активируются Block 4.**

**Ключевые design decisions:**

- `UserRoleV2` хранится как `String(30)`, не PG ENUM — расширение списка ролей не требует ALTER TYPE (как `AuditCategory`).
- `RBAC_MATRIX` — `frozenset[Permission]`, immutability через type system.
- `SUPER_ADMIN: frozenset(Permission)` — auto-наследует новые permissions; downgrade требует явного вычитания.
- `can()` на unknown role → `False` (fail-closed).
- `require_permission` fall-back через `USER_ROLE_MIGRATION_MAP[user.role]` если `user.role_v2 IS NULL` — RBAC работает на legacy users immediately on deploy; миграция = data hygiene.
- FSM **не проверяет permissions** — это ответственность caller'а через `@require_permission`.
- `activate_tenant` идемпотентен: ACTIVE → activate = silent no-op (без audit, без timestamp bump).
- `suspend`/`terminate` требуют непустой reason (`ValueError`).
- `migrate_user_roles.py` пишет per-user AuditEvent (`category='tenancy'`, `action='user.role_migrated'`).
- `REGULATOR_AUDITOR` **удалён** из `UserRoleV2` (YAGNI — регулятор не логинится в ComplianceDesk; отчётность подаётся через внешний портал ГСФР).

**Файлы:** [`backend/app/rbac/`](../../backend/app/rbac/) — 6 файлов; [`backend/app/tenancy/lifecycle.py`](../../backend/app/tenancy/lifecycle.py); [`backend/app/models.py`](../../backend/app/models.py) (modified).

**Тесты:** `test_rbac.py` (4) + `test_tenant_lifecycle.py` (10) — 14 тестов.

---

### Block 4: Auth (Argon2id + JWT RS256 + TOTP MFA) — следующий 🔵

**Зависимости:** активирует Block 3 поля `User.mfa_*`, `User.failed_login_count`, `User.locked_until`, `User.password_changed_at`.

**Locked architectural decisions** (из MEMORY.md):

| Topic | Decision |
|---|---|
| Password hashing | Argon2id m=19456 (19 MiB), t=2, p=1 (OWASP 2024 baseline) |
| Bcrypt → Argon2id (Q-auth-B) | LAZY: re-hash on successful login if hash starts with `$2`. DEADLINE: 6 мес после deploy date — APScheduler принудительный reset. |
| JWT delivery (Q-auth-C) | Bearer header + localStorage. Migration к httpOnly cookie deferred indefinitely. |
| MFA secret encryption (Q-auth-A — UPGRADED) | **MUST** encrypt via `app.crypto` в Block 4. AES-256-GCM или Fernet. Master key из `MFA_SECRET_ENCRYPTION_KEY` env var. |
| Refresh token (Q-auth-D) | Schema `refresh_tokens` с `token_hash`, `family_id`, `parent_token_id`. Access 15min, refresh 8h sliding, абсолютный max 24h на family. Reuse → invalidate family. |
| MFA flow | Two-step: `/auth/login` → `mfa_session_token` (5min) → `/auth/login/mfa`. Backward compat: legacy form-urlencoded endpoint preserved. |
| MFA mandatory | SUPER_ADMIN, TENANT_ADMIN, COMPLIANCE_OFFICER. Optional: ANALYST, CLIENT_USER. |
| Password policy | NIST SP 800-63B: min 12 chars, no rotation, no composition. |

**Frontend integration** (existing files в `compliance-frontend/src/`):

- `store/authStore.ts` (Zustand + persist) — добавить `mfaSession` transient state.
- `api/client.ts` (axios + interceptor) — добавить `/auth/login/mfa` метод + 401-refresh interceptor.
- `pages/Login.tsx` — добавить `MfaChallenge.tsx` для two-step flow.

**Pre-Block-4 fix (commit `67f3f4c`):** нормализован PG `risklevel` enum до `{LOW, MEDIUM, HIGH, CRITICAL}` — устраняет latent production bug в override-flow риск-скоринга.

**CLI bootstrap (`backend/app/cli.py`) — атомарная команда:**

`docker-compose exec backend python -m app.cli bootstrap` ОБЯЗАН одной транзакцией:

1. Создать **Tenant** через `app.tenancy.lifecycle.provision_tenant` (с `subscription_sku` из аргумента + `license_key` либо placeholder если не передан).
2. Создать **SUPER_ADMIN user** через новый Block 4 user-creation flow (Argon2id-hashed password от `getpass`).
3. Вывести на stdout **license_key placeholder** или real key (если уже есть JWT артефакт из `tools/license-generator/`).

Любой шаг fail → rollback всей транзакции (нет половинного состояния «tenant создан, user не создан»). Тач не только `app/auth/` (Block 4 territory), но и `app/tenancy/lifecycle.py` (Block 1+3 territory) — атомарность критична. Не писать только user-creation часть.

Это первый item в Block 4 deliverables — без него customer не сможет ничего залогинить после `docker-compose up`.

---

### Block 5: Settings + RetentionPolicy 🔵

**Scope:** TenantSettings, RiskSettings, PolicyDocument, RetentionPolicy сущности из [02-domain-model.md](02-domain-model.md).

**Ключевые конфигурации:**

- Per-tenant пороги риск-модели (Q1 в [00-decisions.md](00-decisions.md)).
- Retention policy: `kyc_retention_days=2555` (7 лет, default). HARD FLOOR: 5 лет (FATF R.11 baseline). `retention_basis='relationship_ended'`. `retention_action='archive'` (не physical delete).
- Storage: каждый customer (АФГ) ответственен за свои бэкапы и storage capacity.

**Не зависит от Block 4** — может идти параллельно или раньше.

---

### Block 6: License validation (AD-4) 🔵

**Scope:** RSA-4096 JWT verify на startup + APScheduler periodic re-check.

**Зависимость:** артефакт `tools/license-generator/` создан в Phase 0.

**Graceful degradation (Q-deploy-A):**

- Read ops: ALL доступны (regulator проверка, рассмотрение клиентов).
- Write ops: BLOCKED с UI banner.
- Force-license-check endpoint: AVAILABLE (admin может paste новый license JWT и recover без рестарта).

---

## Open Q-followups

Cross-cut по доменам. Полный текст и detailed action — `MEMORY.md` (auto-memory) и in-tree notes.

| Q | Domain | Owner phase | Hook |
|---|---|---|---|
| Q-audit-A | Audit | Phase 2+ | Race на concurrent writes одного tenant'а — UNIQUE(tenant_id, prev_hash) ИЛИ `pg_advisory_xact_lock` |
| Q-audit-B | Audit | Phase 2+ | Migration boundary anchoring — placeholder hash bridge ИЛИ system-generated migration_completed event |
| Q-audit-C | CI | Phase 1 close-out | Add PG service container в GitHub Actions для PG-only тестов (triggers, JSONB) |
| Q-audit-D | Audit | Phase 2+ | Historical username reconstruction в `migrate_legacy` через `username_history` таблицу |
| Q-warnings-A | Schema | Phase 2 | `LegalEntityClient.directors` vs `Client.directors` overlapping FK — `overlaps=` или `back_populates` |
| Q-auth-A | Auth | **Block 4** | `mfa_secret` plaintext → encrypt via `app.crypto` (UPGRADED) |
| Q-tenancy-B | Tenancy | Phase 2+ | `bypass_tenant_filter` placeholder logger → real AuditEvent через audit-session pattern |
| Q-tenancy-C | Tenancy | Phase 2 | `Company.is_active` denormalization — drop column после refactor всех legacy routes |
| Q-tenancy-D | Tenancy | Phase 2 | License key generator helper — `app.licensing.generate_key()` |
| Q-tenancy-E | Tenancy | Phase 2+ | `sql_filter._do_orm_execute` early-return для не-`TenantScopedMixin` запросов |
| Q-rbac-A | RBAC | Phase 2 | `app.rbac.set_user_role()` helper для ручного downgrade post-migration |
| Q-deploy-A | Deploy | **Block 6** | License graceful degradation (read OK, write BLOCKED) |
| Q-deploy-B | Deploy | Phase 4 | Managed updater agent для non-technical customers |

In-tree notes:
- [`backend/app/tenancy/q_tenancy_e_strict_env_overreach.md`](../../backend/app/tenancy/q_tenancy_e_strict_env_overreach.md)
- [`backend/app/q_deploy_a_license_graceful_degradation.md`](../../backend/app/q_deploy_a_license_graceful_degradation.md)
- [`backend/app/q_deploy_b_managed_updater.md`](../../backend/app/q_deploy_b_managed_updater.md)

---

## Отложено на Phase 2+ (вне Phase 1 scope)

- **Alembic setup** — currently `models.py` drift проверяется вручную и через `Base.metadata.create_all`. Phase 2 — формализовать миграции и backport известных операций (migrate_risk_level.sql, migrate_risklevel_normalize_case.sql, migrate_legacy.py, migrate_user_roles.py).
- **Router refactor под RBAC matrix** — current routers используют ad-hoc role checks. Phase 2 — заменить на `Depends(require_permission(X))`.
- **CDD-739 анкета** — текущая анкета клиента написана под Постановление КР № 606 (утратило силу). Phase 2 — ревизия под Положение о CDD от 14.11.2025 № 739.
- **`Company.is_active` removal** — Q-tenancy-C.
- **REGULATOR_AUDITOR re-introduction** — только если появится регулятор-side flow в системе (out of current scope).
- **MFA Phase 4 hardening** — key rotation strategy для `MFA_SECRET_ENCRYPTION_KEY`.

---

## Verification

Каждый блок Phase 1 закрывается с зелёным CI и атомарным коммитом. Текущий статус:

| Block | Commit | Tests |
|---|---|---|
| 1 (multi-tenancy) | `7417899` | 7 |
| 2 (audit) | `b56548c` | 13 |
| 3 (RBAC + FSM) | `b5c6699` | 14 (4 RBAC + 10 lifecycle) |
| Pre-Block-4 fix | `67f3f4c` | 2 (RiskLevel regression) |
| 4 (auth) | TBD | TBD |
| 5 (settings) | TBD | TBD |
| 6 (license) | TBD | TBD |

**Total Phase 1 tests на момент 04 написания: 36 passed.**

`feature/vasp-expansion` ⇆ `main` merge **запрещён** до закрытия всех 6 блоков. Три блока — фундамент, не production-ready Phase 1.
