# 05 Roadmap ComplianceDesk-VASP

**Версия:** 1.0
**Дата:** 2026-05-03
**Шаг VASP-расширения:** 5/5
**Статус:** актуально для стадии (а→б)

---

## Контекст

Документ — карта движения от текущего состояния (Phase 1 в активной разработке, 3/6 блоков отгружено) до full-feature VASP-платформы. Гранулярность убывает с горизонтом: Phase 1 — на уровне блоков с commit hashes, Phase 2 — на уровне тем, Phase 3-4 — на уровне модулей, Phase 5+ — open-ended.

Связанные артефакты:

- [04-technical-plan.md](04-technical-plan.md) — детальный план Phase 1 (mapping AD ↔ block)
- [03-architecture.md](03-architecture.md) — архитектурные решения (AD-1..AD-Q5)
- [00-decisions.md](00-decisions.md) — журнал регуляторных и архитектурных Q-решений

---

## Phase 1: Foundation (в активной работе)

**Цель:** multi-tenancy, audit, auth, RBAC, settings, license — fundament перед клиент-facing features.

**Branch:** `feature/vasp-expansion`. Merge в `main` ЗАПРЕЩЁН до закрытия всех 6 блоков.

| Block | Scope | Status | Commit |
|---|---|---|---|
| 1 | Multi-tenancy infrastructure (AD-7) | ✅ shipped | `7417899` |
| 2 | AuditEvent с hash-chain (AD-Q2) | ✅ shipped | `b56548c` |
| 3 | RBAC + tenant FSM + user extensions | ✅ shipped | `b5c6699` |
| Pre-4 fix | risklevel enum case mismatch | ✅ shipped | `67f3f4c` |
| 4 | Auth (Argon2id + JWT RS256 + TOTP MFA) | 🔵 next | — |
| 5 | Settings + RetentionPolicy | 🔵 | — |
| 6 | License validation (AD-4) + APScheduler | 🔵 | — |

**ETA на закрытие Phase 1:** Block 4 ~3-4 hr, Block 5 ~1.5-2 hr, Block 6 ~2-3 hr (зависит от tools/license-generator артефакта из Phase 0).

**Критерий завершения Phase 1:** все 6 блоков с зелёным CI + 04-technical-plan.md обновлён под фактическое состояние Block 4-6 + production-ready Phase 1 release notes.

---

## Phase 2: Migration & integration

**Цель:** перевести существующие routers и доменные сущности на инфраструктуру Phase 1, формализовать миграции, обновить анкету клиента под актуальные НПА.

**Темы:**

1. **Alembic setup** — формализовать миграции; backport известных операций (`migrate_risk_level.sql`, `migrate_risklevel_normalize_case.sql`, `migrate_legacy.py`, `migrate_user_roles.py`).
2. **Router refactor под RBAC matrix** — `Depends(require_permission(X))` вместо ad-hoc role checks. Запуск `migrate_user_roles --commit` для populate `User.role_v2`.
3. **CDD-739 анкета** — ревизия анкеты клиента под Положение о CDD от 14.11.2025 № 739 (вместо утратившего силу Постановления № 606).
4. **AuditLog → AuditEvent migration** — manual run `migrate_legacy.py --commit` после Block 4 deploy. Phase 1 callsites продолжают писать в legacy `audit_logs` через `models.AuditLog(...)` — Phase 2 router refactor заменит на `audit.audit_log(...)`.
5. **Q-tenancy-C cleanup** — drop `Company.is_active` после ремувала всех legacy callsites.
6. **Q-warnings-A** — fix overlapping FK на `director_clients.client_id`.
7. **Q-tenancy-E** — `sql_filter._do_orm_execute` early-return для не-`TenantScopedMixin` запросов.
8. **License key generator** (Q-tenancy-D) — `app.licensing.generate_key()` helper для автоматизации `provision_tenant`.
9. **Frontend test infrastructure** — vitest + RTL при первом серьёзном касании auth/MFA frontend кода.

**Зависимости:** Phase 1 закрыт.

---

## Phase 3: Domain expansion (этапы 6-8 из CLAUDE.md)

**Цель:** расширить compliance-функционал согласно текущему roadmap из CLAUDE.md.

**Темы:**

1. **Этап 6: Реестр УБО и ИПДС** — Position о бенефициарных владельцах (`regulation-ubo-database.md`).
2. **Этап 7: Трекер документов и дедлайнов** — RetentionPolicy уже реализован в Phase 1 Block 5; здесь — UI-flow и нотификации.
3. **Этап 8: Детектор подозрительных операций** — коды 40001-40088 / 10000-38099 из `regulation-fiu-reporting.md`. Использует тэги Ranex (scam/mixer/darkmarket) для KYT-сигналов.
4. **Sanctions parallelization** (AD-Q4) — параллельный screening через 4 источника одновременно.
5. **Sanctions без кэша** (AD-Q3) — каждый screening — fresh hit на загруженные XML/CSV; KYT с кэшем (Ranex/Chainalysis).

**Зависимости:** Phase 2 (CDD-739 анкета закрыта, RBAC routers обновлены).

---

## Phase 4: VASP Operations (full SKU)

**Цель:** перейти от Compliance Suite к Full VASP Platform — клиент-facing portal + бэк-офис операционистов.

**Темы:**

1. **VASP Operations модуль** — клиентский портал (KYC self-service, RFI, заявки на операции) + бэк-офис (приём/исполнение заявок, фиксация курсов/контрагентов/кошельков).
2. **AD-Q5 — Custodial omnibus** — hot/cold модель для клиентских средств.
3. **MFA Phase 4 hardening** — `MFA_SECRET_ENCRYPTION_KEY` rotation strategy.
4. **Refresh token rotation strategy** — key rotation для JWT signing keys (`pg_advisory_xact_lock` defaults для concurrent writes — Q-audit-A).
5. **Q-deploy-B — Managed updater agent** — становится критичным когда выйдешь на 2-3 paying non-technical tenant'ов.
6. **AD-Q5 — Custodial wallet integration** — для VASP Operations требуется hot/cold separation, omnibus accounting.
7. **Этап 9: Нормативная база** — UI для отображения и поиска по применимым НПА (тексты в `docs/regulation/`).

**Зависимости:** Phase 3 закрыт; стадия (а→б) активна (5+ ОВА в КР).

---

## Phase 5+: Open horizon

Не приоритезированный backlog. Триггерится конкретными бизнес-событиями.

- **Этап 10: Дашборд** — comprehensive analytics. Сейчас базовый dashboard есть.
- **REGULATOR_AUDITOR role re-introduction** — только если регулятор (ГСФР) запросит native portal-side доступ к ComplianceDesk вместо текущей внешней отчётности.
- **Cross-jurisdiction expansion** — отдельный архитектурный шаг с regulatory abstraction layer. Не на стадиях (а→б).
- **AD-Q1 — Polymorphic FK** — если появится сущность с реально полиморфным targeting (текущие `Document.related_to_type` / `target_id`-в-`AuditEvent` решены строкой).

---

## Verification

Каждая Phase закрывается:

1. Все темы её scope отгружены атомарными коммитами в `feature/<phase>-<theme>` ветках.
2. CI зелёный на main после merge.
3. Соответствующий технический план / decisions journal обновлён.
4. Известные Q-followups либо закрыты, либо явно перенесены в следующую Phase с обоснованием.

**Phase 1 текущее состояние (на 2026-05-03):** 3/6 блоков отгружено (`7417899`, `b56548c`, `b5c6699`) + pre-Block-4 fix (`67f3f4c`). Backend `36 passed` smoke. Frontend без тестов (Phase 2 хук). CI зелёная на каждом коммите. Block 4 — следующий sprint.
