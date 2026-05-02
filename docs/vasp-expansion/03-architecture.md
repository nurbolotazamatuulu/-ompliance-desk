# 03 Архитектура ComplianceDesk-VASP

**Версия:** 1.0
**Дата:** 2026-05-02
**Шаг VASP-расширения:** 3/5
**Статус:** утверждено к имплементации

# 1. Обзор и контекст

## Продукт и стадии развития

**ComplianceDesk** — платформа для оператора виртуальных активов (ОВА / VASP) в Кыргызстане. Поддерживает три контура (комплаенс / бэк-офис / клиентский портал) с продажей в виде двух SKU (Compliance Suite и VASP Operations) — см. AD-5.

**Стадия (а)**: Текущая — единственный действующий tenant — АФГ (Азия Финанс Груп). Платформа в разработке. Регуляторный режим — Кыргызстан.

**Стадия (б)**: 5-15 ОВА в КР — целевая аудитория следующих 12-18 месяцев. Multi-tenant архитектура подготовлена с самого начала через `tenant_id` (см. AD-1, AD-7), но эксплуатируется на одном tenant до достижения зрелости продукта.

**Расширение на другие юрисдикции** — отдельный архитектурный шаг с regulatory abstraction layer; не закладывается на стадиях (а→б).

## Карта документов

| Документ | Назначение | Статус |
|---|---|---|
| [`CLAUDE.md`](../../CLAUDE.md) | Контекст продукта, регуляторные источники | актуально |
| [`00-decisions.md`](./00-decisions.md) | Журнал решений Q1-Q22 | шаги 1-2 |
| [`01-regulatory-checklist.md`](./01-regulatory-checklist.md) | 232 регуляторных требования с маркировкой SKU | шаг 1 |
| [`02-domain-model.md`](./02-domain-model.md) | 59 сущностей в 5 подшагах (2.1-2.5) | шаг 2 |
| **`03-architecture.md`** | **Архитектурные решения, миграция, roadmap** | **шаг 3 (этот)** |
| `04-technical-plan.md` | Детальный технический план + код | шаг 4 |
| `05-roadmap.md` | Финальный roadmap с этапами и сроками | шаг 5 |

## Содержание артефакта

- **§2** — 15 архитектурных решений (AD-1..AD-10, AD-Q1..AD-Q5) в едином формате
- **§3** — Component diagram (Docker Compose stack)
- **§4** — Module boundaries (backend и frontend)
- **§5** — Security threat model (OWASP Top 10 + VASP-специфика)
- **§6** — Disaster recovery (RTO/RPO, backup, recovery procedures)
- **§7** — Migration path (текущий код → целевая модель)
- **§8** — Implementation Roadmap (8 phases для шага 4)

---

# 2. Архитектурные решения

## AD-1 — Modular monolith, multi-tenant, KR-only

**Решение:** Backend — modular monolith, multi-tenant с самого начала через `tenant_id`, single regulatory regime (КР). Целевая аудитория стадии (а→б): 5-15 ОВА в Кыргызстане.

**Обоснование:** На объёмах 5-15 tenant'ов микросервисная архитектура добавляет сложность развёртывания и эксплуатации без выгод по производительности или масштабируемости. Modular monolith с чёткими границами модулей даёт скорость разработки и простоту операций; миграция на микросервисы — отдельный архитектурный шаг при достижении лимитов.

**Архитектурные следствия:**
- Один runtime (FastAPI), один Postgres-instance, один MinIO
- Чёткие границы между модулями на уровне Python-пакетов (`backend/app/<module>/`)
- Multi-tenancy работает с одним tenant АФГ; добавление новых клиентов не требует переписывания кода
- Расширение на другие юрисдикции потребует regulatory abstraction layer (отдельный архитектурный шаг)

**Срок пересмотра:** при достижении 15+ tenants или резком росте нагрузки одного tenant'а; при появлении регуляторного требования к развёртыванию в нескольких юрисдикциях.

---

## AD-2 — On-premise-only via Docker Compose

**Решение:** Дефолтная и единственная модель развёртывания — on-premise через Docker Compose stack. SaaS не предлагается на стадии (а→б). Air-gapped scenario поддерживается.

**Обоснование:** Регуляторное требование ЗВА ст. 29 п. 2.1 (основной сервер на территории КР); недоверие новых ОВА к SaaS-моделям обработки чувствительных данных; экономия на cloud bill при малом количестве tenants; защита от прецедента Q15 (если регулятор переквалифицирует SaaS как «агента»).

**Архитектурные следствия:**
- Никаких managed cloud services (AWS RDS, S3, Cognito, Sentry-cloud)
- Все компоненты — self-hosted
- Поставка покрывает bare-metal/VM в ДЦ клиента и Docker host в его частном облаке
- Документация по installation содержит обе процедуры
- Offline-инсталляция через архив pre-pulled images
- Backup и DR — ответственность клиента, процедуры документируются вендором (см. §6)

**Срок пересмотра:** при появлении регуляторного разъяснения, разрешающего SaaS-модель; при росте до 20+ tenants, когда экономика SaaS становится оправданной.

---

## AD-3 — АФГ: dev и prod как раздельные инсталляции

**Решение:** АФГ имеет две инсталляции: dev на ПК разработчика, prod на сервере компании. Переход dev→prod — отдельная задача в backlog, не часть основного roadmap.

**Обоснование:** Текущая dev-инсталляция используется для разработки и тестирования продукта; production-rollout требует отдельной подготовки (выделение сервера, миграция, обучение персонала). Совмещение dev и prod — антипаттерн; разделение даёт безопасность экспериментов на dev без риска для production-данных.

**Архитектурные следствия:**
- Dev — для разработки и тестирования продукта, не production
- Prod-rollout — выделение сервера АФГ, миграция данных (если в dev есть реальные клиенты), назначение TENANT_ADMIN production-инсталляции
- Данные между инсталляциями НЕ синхронизируются
- License keys для dev и prod — разные

**Срок пересмотра:** после go-live АФГ production; при появлении второго клиента (становится явный prod-only).

---

## AD-4 — License key как подписанный JSON-токен

**Решение:** Подписанный JSON-токен (RS256 или ed25519) содержит `tenant_id`, `expires_at`, `sku`, список активных `add_ons`. Validation при старте приложения + ежедневная перепроверка через APScheduler. При expired — read-only mode.

**Обоснование:** Подписанный токен — простейший механизм проверки лицензии без зависимости от внешнего license server (важно для air-gapped инсталляций). Read-only mode при истечении лицензии позволяет клиенту видеть свои данные и выполнять retention-обязательства, но блокирует новые операции — приемлемый баланс между давлением на оплату и защитой клиентских данных.

**Архитектурные следствия:**
- License generator — отдельный внутренний инструмент вендора (CLI, не публичный)
- Биллинг-инфраструктура отсутствует в продукте — инвойсы и оплата через backoffice вендора
- Нет trial periods, нет self-service signup, нет per-user/per-transaction counting
- License renewal — ввод нового ключа через UI TENANT_ADMIN
- Public key для validation встроен в код приложения
- Read-only mode: клиент видит данные, экспорт работает (для retention), создание новых сущностей блокируется

**Срок пересмотра:** при появлении SaaS-режима (требует онлайн license server); при первом инциденте утечки private key вендора.

---

## AD-5 — Две SKU: CS и VO

**Решение:** Продуктовая линейка — Compliance Suite (CS) и VASP Operations (VO). FVP (Full VASP Platform) упразднена. Покупатель может купить любую комбинацию; оба SKU вместе = bundle со скидкой. Add-ons продаются поверх любой SKU.

**Обоснование:** В шаге 1 при анализе чек-листа было обнаружено, что FVP = CS + VO почти без дополнительной функциональности (только 1 строка про эмиссионные услуги — 97d). Двух-SKU модель проще для понимания клиентами и проще для имплементации. Эмиссионные услуги переразмечаются как add-on.

**Архитектурные следствия:**
- **CS** включает модули: `kyc, sanctions, risk_basic, ubo, fiu_reporting, freezing, hrc, audit, regulator_access`
- **VO** включает: `client_portal, back_office, transactions, custody, accounting, audit`
- **Add-ons** (опциональные): `risk_advanced_vasp` (Q3 уровень 2), `kyt_chainalysis`, `kyt_trm`, `travel_rule_notabene`, `regulator_audit_realtime`, `emission_services` (FVP-only требование 97d)
- License token содержит `sku ∈ {CS, VO, CS+VO}` + `add_ons: array of add_on_codes`
- Чек-лист (`01-regulatory-checklist.md`) переразмечается: строка 97d из FVP → add-on:emission_services

**Срок пересмотра:** при появлении 3-го отчётливого варианта продажи (например, regulator-only edition); при изменении регуляторного требования, делающего add-ons обязательными.

---

## AD-6 — MinIO как объектное хранилище

**Решение:** MinIO в составе Docker Compose. Object lock включён по умолчанию (immutable storage для retention 7 лет). Доступ через S3-compatible API.

**Обоснование:** S3-совместимое API даёт безболезненную миграцию на cloud storage в будущем (если AD-2 будет пересмотрено). Object lock — нативная защита retention-данных от случайного и злонамеренного удаления; критично для аудита и FIU-сообщений (retention 7 лет, см. Q12).

**Архитектурные следствия:**
- Bucket-структура per tenant: `tenant-{id}-documents, tenant-{id}-fiu-exports, tenant-{id}-audit-archive, tenant-{id}-verification-artifacts`
- Доступ через `boto3` или `minio-py` (выбор на шаге 4)
- Backup MinIO — отдельно от Postgres (см. §6)
- При переходе в SaaS — миграция на AWS S3 / Yandex Object Storage без изменения кода API
- Закрывает Q-2.1-G (storage документов ПВК и др.)

**Срок пересмотра:** при переходе на SaaS-режим (миграция на managed S3); при появлении регуляторного требования к специфичному типу хранилища.

---

## AD-7 — Multi-tenancy на application-level

**Решение:** Row-level filtering через `tenant_id` с защитой на уровне приложения. Postgres RLS не используется на стадии (а→б).

**Обоснование:** Application-level фильтрация проще в отладке, тестировании и миграциях. Postgres RLS добавляет сложность без существенной защиты на стадии 5-15 tenants (где утечка данных одного клиента к другому маловероятна по архитектуре доступа). При переходе в SaaS-режим — RLS добавляется как defence-in-depth.

**Архитектурные следствия:**
- SQLAlchemy event listener для автоматического `WHERE tenant_id = ?` в запросы
- Декоратор `@tenant_scoped` на всех роутерах
- В dev/staging окружениях — raise exception при отсутствии `tenant_id` фильтра
- Обязательная test fixture «two tenants» для каждого нового роутера (regression-защита)
- SUPER_ADMIN может обходить фильтр через явный `bypass_tenant_filter=True` с обязательным логированием
- Закрывает Q-2.1-A (защита от утечек)

**Срок пересмотра:** при переходе в SaaS-режим (RLS как defence-in-depth); при первом инциденте cross-tenant утечки данных.

---

## AD-8 — APScheduler для background jobs

**Решение:** APScheduler внутри FastAPI-приложения. Один процесс держит и web-handlers, и scheduler. Celery + Redis не используются на стадии (а→б).

**Обоснование:** APScheduler — простейшее решение без дополнительной инфраструктуры. На объёмах стадии (а→б) количество background jobs ограничено: scheduled re-screening, SLA-таймеры, retention purge — это десятки задач в день, не тысячи. Celery + Redis — overkill, добавляет 2 контейнера и сложность операций.

**Архитектурные следствия:**
- Реализуемые jobs (scheduler):
  - SLA-таймеры FIUMessage (ежечасно, см. 2.4.12)
  - Hash-chain verification (еженедельно, см. 2.1.4)
  - Retention purge (`purge_expired_records`, еженедельно, Q12)
  - License revalidation (ежедневно, AD-4)
  - FrozenAccount expiry check (ежедневно, ПЗМ § 12 — 2 месяца)
  - Periodic re-screening sanctions (по расписанию tenant'а)
  - High-risk countries list sync (ежедневно)
  - Threshold check aggregated_24h (по событию)
- Один процесс uvicorn = один scheduler instance; при горизонтальном масштабировании потребуется leader election или миграция на Celery
- При появлении необходимости в нескольких worker-процессах или сложных асинхронных пайплайнах — миграция на Celery + Redis как отдельный архитектурный шаг

**Срок пересмотра:** при горизонтальном масштабировании (несколько uvicorn instances); при появлении задач, требующих distributed coordination или offline retry с persistent queue.

---

## AD-9 — Frontend: три SPA в pnpm monorepo

**Решение:** Три отдельных SPA + shared library в monorepo через pnpm workspaces. Структура: `apps/compliance-frontend, apps/backoffice-frontend, apps/client-portal-frontend, packages/shared`.

**Обоснование:** Три аудитории (compliance, операционисты, клиенты) имеют принципиально разные UX и часто разные релизные циклы. Объединение в одно SPA с role-based routing сделало бы bundle непригодным по размеру. Monorepo даёт переиспользование (API client, design tokens, auth-утилиты) без копипасты.

**Архитектурные следствия:**
- Каждое приложение имеет свой Vite build, отдельный деплоймент
- Реализация деплоя: либо разные контейнеры за nginx, либо разные локации nginx с разных subdomain (`compliance.{tenant}.example.com`, `backoffice.{tenant}.example.com`, `portal.{tenant}.example.com`)
- Релизные циклы независимы (compliance может релизиться чаще, client-portal — реже)
- `packages/shared` содержит:
  - `api-client/` — auto-generated из FastAPI OpenAPI schema
  - `ui/` — design system (Tailwind components)
  - `auth/` — JWT handling, refresh logic
  - `types/` — generated TypeScript types
- Bundle size для каждого приложения — целевой ≤ 1 MB
- Codegen для API client — настраивается заранее, чтобы избежать дублирования типов

**Срок пересмотра:** при появлении 4-го UX-сценария (например, выделенный мобильный портал); при переходе на full-stack framework (Next.js / Remix).

---

## AD-10 — Self-hosted auth в FastAPI

**Решение:** Аутентификация и MFA внутри FastAPI без внешних провайдеров. Существующий `backend/app/auth.py` — baseline, расширяется до полной функциональности.

**Обоснование:** SSO/SAML/OAuth — требования enterprise-клиентов; их добавление сейчас (для АФГ + 5-15 KG-tenants) — преждевременная оптимизация. Self-hosted auth снимает зависимость от внешних провайдеров (важно для air-gapped инсталляций) и даёт полный контроль над auth-логикой.

**Архитектурные следствия:**
- **Хеширование паролей:** Argon2id (OWASP 2024: memory=64 MiB, iterations=3, parallelism=4) — переход с bcrypt
- **JWT:** RS256, access token 15 минут + refresh token 7 дней
- **MFA:** TOTP через `pyotp`, recovery codes (10 одноразовых)
- **Password recovery:** email-based с TTL 1 час, инвалидация активных sessions при reset
- **Account lockout:** после 5 неудачных попыток за 15 минут
- Все auth-события — в AuditEvent (категория `auth`), см. 2.1.4
- SSO/SAML/OAuth не поддерживаются на стадии (а→б)
- Миграция на Keycloak — отдельный архитектурный шаг при появлении enterprise-клиента

**Срок пересмотра:** при появлении первого enterprise-клиента, требующего SSO; при необходимости федеративного входа между несколькими tenant'ами.

---

## AD-Q1 — Polymorphic FK через nullable FK + CHECK

**Решение:** `VerificationSession` и `PEPProfile` реализуются с раздельными nullable FK на каждый возможный тип субъекта + CHECK constraint `num_nonnulls(...) = 1`. Никаких generic foreign keys, никаких раздельных таблиц на каждый тип субъекта.

**Обоснование:** Generic FK (поля `subject_type/subject_id` без явного FK) ломают referential integrity на уровне БД и не дают CASCADE при удалении субъекта. Раздельные таблицы (по одной на тип субъекта) приводят к взрывному дублированию схемы. Nullable FK + CHECK даёт нативную целостность БД и компромисс между размером модели и корректностью.

**Архитектурные следствия:**
- `VerificationSession` имеет колонки: `individual_client_id` (nullable FK), `director_client_id` (nullable FK), `ubo_id` (nullable FK), `representative_id` (nullable FK), `pep_relation_id` (nullable FK)
- CHECK constraint: `num_nonnulls(individual_client_id, director_client_id, ubo_id, representative_id, pep_relation_id) = 1`
- `PEPProfile` аналогично с колонками для каждого типа субъекта (см. 2.2.9)
- Нативные JOIN, CASCADE работает корректно при удалении субъекта
- Закрывает **Q-2.2-F**
- Добавление нового типа субъекта = миграция: ADD COLUMN + обновление CHECK constraint

**Срок пересмотра:** при росте числа типов субъектов до 8+ (когда таблица становится «широкой»); при переходе на DB, не поддерживающую CHECK constraints естественно.

---

## AD-Q2 — Синхронный hash-chain в audit

**Решение:** AuditEvent пишется синхронно в той же транзакции, что и бизнес-действие. Транзакционная согласованность гарантирована Postgres.

**Обоснование:** Транзакционная гарантия «бизнес-операция и её аудит — атомарны» критична для регуляторной защиты. Outbox-паттерны добавляют сложность (отдельная таблица, retry логика, eventual consistency) без выгод на текущих объёмах. Синхронная запись в одном transaction — простейший и надёжный способ.

**Архитектурные следствия:**
- При коммите бизнес-транзакции — audit точно записан; при откате — точно не записан
- Никаких outbox patterns, никаких асинхронных queues
- Hash-chain вычисляется в момент записи: `event_hash = SHA256(canonical_repr || previous_hash)` (см. 2.1.4)
- Postgres trigger `BEFORE UPDATE OR DELETE ON audit_events` — DENY (физическая защита иммутабельности)
- Закрывает **Q-2.1-M**
- **Запасной план:** мониторинг метрики «среднее время записи 1 audit event» с порогом 100ms; при превышении на production — миграция на outbox pattern как отдельная архитектурная задача

**Срок пересмотра:** при превышении порога латентности 100ms на audit-write; при переходе на горизонтальное масштабирование (где синхронная запись через одну сессию усложняется).

---

## AD-Q3 — Sanctions без кэша, KYT с кэшем

**Решение:** `SanctionsCheck` выполняется напрямую через локальную БД без кэширования. `KYTCheckResult` кэшируется с TTL 24 часа (платный внешний API).

**Обоснование:** SanctionsList хранится локально в Postgres; fuzzy-matching по 33k записей — быстрый (< 100 ms) при правильных индексах. Кэш sanctions добавлял бы сложность инвалидации без выигрыша. KYT — внешний платный API; кэширование критично для экономии и латентности.

**Архитектурные следствия:**
- Поле `cache_valid_until` в `SanctionsCheck` переименовывается в `last_check_at` (см. косметическая правка Q-3-B в §7)
- При обновлении sanctions list через `sanctions_loader.py` — никакая инвалидация не требуется (новые проверки автоматически работают по обновлённым данным)
- Для `KYTCheckResult`: TTL 24h, инвалидация по событию `kyt_check_completed` для конкретного адреса
- Закрывает **Q-2.4-A**
- Sanctions screening быстрый (< 100ms на проверку) — это позволяет выполнять Hook 7 без задержки UX
- KYT с кэшем — экономия на платном API + предсказуемая латентность

**Срок пересмотра:** при росте sanctions DB до 100k+ записей с замедлением > 200ms; при переходе на внешний sanctions provider; при изменении ценовой политики KYT провайдера.

---

## AD-Q4 — Parallel sanctions screening

**Решение:** Pre-submit hook 7 выполняет sanctions screening для нескольких субъектов параллельно через `asyncio.gather` с `return_exceptions=True`. При сбое любой проверки hook возвращает FAIL.

**Обоснование:** В одной заявке (Order) до 5-10 sanctions targets (клиент, source/target wallets, контрагент, представители). Последовательная проверка добавляла бы 5×100ms = 500ms к pre-submit pipeline. Параллельная — 100ms на самую долгую проверку. UX критично для клиентского портала.

**Архитектурные следствия:**
- Реализация: `await asyncio.gather(*[check_subject(s) for s in subjects], return_exceptions=True)`
- Время Hook 7 = время самой длинной проверки, не сумма
- Каждая `SanctionsCheck` создаётся независимо: успешные — с результатом, провалившиеся — со статусом `check_failed`
- AuditEvent на каждую проверку отдельно (для прослеживаемости)
- Параллельность ограничена количеством subjects в одном Order (типично 5-10) — в пределах connection pool size (default 20)
- Fail-stop поведение: любая упавшая проверка → весь hook FAIL (защитный режим)
- Закрывает **Q-2.4-B**

**Срок пересмотра:** при росте Order типа `transfer_va` со множественными контрагентами (10+); при появлении внешнего sanctions API (тогда параллельность критичнее из-за латентности).

---

## AD-Q5 — Custodial omnibus hot/cold model

**Решение:** ОВА владеет hot и cold кошельками; клиенты имеют `ClientBalance` в БД без отдельных on-chain кошельков. Внутренние операции — БД-only без on-chain активности. On-chain — только для deposits и withdrawals.

**Обоснование:** Omnibus-модель — стандарт для VASP-обмена; экономит on-chain fees, ускоряет внутренние операции, упрощает custody (один pool на актив вместо тысяч клиентских кошельков). Hot/cold separation — стандартная защита: горячие кошельки имеют ограниченный баланс, основные средства — в cold storage. Multi-sig / HSM / MPC не используются на стадии (а→б) — overhead не оправдан до объёмов $5M+/мес.

**Архитектурные следствия:**

**Новый модуль `accounting`** в backend monolith. Сущности:
- `Wallet` — omnibus pool кошелёк ОВА (по одному на актив-сеть; либо несколько hot для разных сетей)
- `ClientBalance` — позиция клиента в активе (не on-chain; в БД)
- `LedgerEntry` — double-entry записи всех движений ClientBalance
- `OnChainTransaction` — связь между внутренними движениями и on-chain транзакциями (deposits и withdrawals)
- `Reconciliation` — записи о сверках

**Reconciliation jobs** через APScheduler:
- Hourly: сверка БД ↔ on-chain (баланс кошелька в блокчейне vs сумма ClientBalance + tenant float)
- Daily: ledger consistency check (double-entry сходимость)
- Daily: liquidity threshold check (если hot < threshold, alert о необходимости пополнения из cold)

**Безопасность ключей:**
- Private keys hot wallets — encrypted в БД (AES-256-GCM, key derived через Argon2id из master password)
- Master password запрашивается при старте приложения (не в env file, не в Docker secret)
- Memory zero-out после каждого использования (best-effort)
- Cold wallets — air-gapped hardware у руководителя ОВА, никогда не в системе
- Multi-sig, HSM, MPC — не на стадии (а→б)

**Migration path к продвинутой custody:** интерфейс `KeyManagementProvider` с реализациями:
- `LocalEncryptedKMS` (текущая)
- `FireblocksKMS` (будущая, при росте $5M+/мес объёмы)

Переход — изменение настройки tenant'а + миграция ключей через секретную процедуру.

**Закрывает Q13** (custody-модель формализована).

**Срок пересмотра:** при достижении $5M/мес операций (рост требований к custody-безопасности); при первом инциденте hot wallet compromise; при появлении регуляторного требования к multi-sig для VASP.

---

# 3. Component diagram

## Docker Compose stack

```
                 ┌──────────────────┐
                 │  Client Browser  │
                 └────────┬─────────┘
                          │ HTTPS
                          ▼
                 ┌──────────────────┐
                 │      nginx       │ ◄─── TLS termination, reverse proxy,
                 │  (TLS, routing)  │      раздача статики frontend SPAs
                 └─┬─────┬─────┬────┘
                   │     │     │
                   ▼     ▼     ▼
               ┌────┐ ┌────┐ ┌────┐
               │ CS │ │ BO │ │ CP │ ◄─── статические SPA-bundles
               │SPA │ │SPA │ │SPA │      (могут быть отдельные контейнеры
               └────┘ └────┘ └────┘       или одна локация nginx)
                          │
                          │ /api/*
                          ▼
                 ┌──────────────────────┐
                 │      FastAPI         │ ◄─── backend monolith,
                 │   (uvicorn × N)      │      все модули,
                 │  + APScheduler       │      + scheduler в том же процессе
                 └──┬────────────┬──────┘
                    │            │
                    ▼            ▼
              ┌──────────┐  ┌─────────┐
              │ Postgres │  │  MinIO  │
              │   (15+)  │  │ (S3-API)│
              └──────────┘  └─────────┘
                              │
                              └─── Object Lock включён;
                                   buckets: tenant-{id}-documents,
                                   tenant-{id}-fiu-exports,
                                   tenant-{id}-audit-archive,
                                   tenant-{id}-verification-artifacts
```

## Описание компонентов

| Компонент | Версия | Назначение | Замечания |
|---|---|---|---|
| **nginx** | latest stable | TLS termination, reverse proxy, раздача статики SPA, маршрутизация `/api → FastAPI` | CSP headers, rate limiting на sensitive endpoints |
| **frontend SPAs** | — | 3 контейнера со статическими bundle (или один nginx с тремя локациями) | Vite build per app, см. AD-9 |
| **FastAPI backend** | Python 3.11+ | Modular monolith, asyncio, все доменные модули + APScheduler внутри процесса | uvicorn workers (1-4 по нагрузке) |
| **Postgres** | 15+ | Основная БД | Single instance; обязательная backup procedure (см. §6) |
| **MinIO** | latest stable | S3-совместимое объектное хранилище | Object lock включён; bucket-per-tenant |

## Внешние интеграции (over Internet, опционально)

| Интеграция | Назначение | Pluggable | Дефолт для KG |
|---|---|---|---|
| **KYTProvider API** | Анализ блокчейн-адресов и транзакций | да (Q10) | Ranex KG |
| **IDVProvider API** | Идентификация и верификация личности | да (Q10) | Самсаб |
| **Email gateway (SMTP)** | Notifications, password recovery | стандарт | tenant настраивает |
| **Blockchain nodes** | On-chain monitoring депозитов/выводов (AD-Q5) | да | tenant настраивает |
| **Travel Rule Provider** | IVMS101 messaging между VASP | да (add-on) | manual MVP |

В air-gapped инсталляциях все внешние интеграции могут отсутствовать — manual fallback везде.

---

# 4. Module boundaries

## Backend структура

```
backend/app/
├── auth/              # AD-10: Self-hosted auth, JWT, MFA, password recovery
├── tenants/           # AD-1, AD-7: Tenant management, settings, feature flags, license
├── users/             # User CRUD, RBAC enforcement
├── audit/             # AD-Q2: AuditEvent с hash-chain, иммутабельность
├── clients/           # IndividualClient, LegalEntityClient, VASPCounterparty, БВ-структура
├── verification/      # VerificationSession, IDV провайдеры (AD-Q1)
├── documents/         # ClientDocument, SOFDocument, ConsentRecord, MinIO интеграция (AD-6)
├── sanctions/         # SanctionsList, SanctionsCheck, SanctionsMatchDecision (AD-Q3)
├── risk/              # RiskAssessment, RiskBasic61p, RiskAdvancedVASP, RiskOverride, AnomalyDetector
├── kyt/               # KYTCheckResult, KYT провайдеры (Ranex/Chainalysis/TRM)
├── transactions/      # Order, Transaction, ThresholdCheck, pre-submit pipeline
├── accounting/        # AD-Q5: Wallet, ClientBalance, LedgerEntry, OnChainTransaction, Reconciliation
├── custody/           # CustodyMovement, KeyManagementProvider
├── travel_rule/       # TravelRuleMessage, провайдеры
├── freezing/          # FrozenAccount, FrozenOperation
├── fiu/               # FIUMessage, FIUExportBatch, SLA-таймеры
├── high_risk_countries/  # HighRiskCountry, HighRiskCountryCheck
├── rfi/               # RFIRequest, channels
├── notifications/     # Notification, deduplication, multi-channel
├── reporting/         # RegulatoryReport, ReportTemplate, Dashboard, SLABreach
├── regulator/         # RegulatorAPIAccess, read-only API endpoints
├── shared/            # CompositeApproval, Settings, RetentionPolicy, helpers
└── main.py            # FastAPI app, router mounting, startup/shutdown
```

## Правила импортов между модулями

| Правило | Описание |
|---|---|
| `shared` — глобально доступен | Импортируется любым модулем (helpers, common types) |
| `auth` — глобально доступен | Импортируется любым модулем (для `current_user`) |
| `tenants` — широко используется | Импортируется auth и большинством бизнес-модулей |
| `audit` — глобально доступен | Импортируется любым модулем (для `audit_event(...)`) |
| **Бизнес-модули — только через публичный API** | Импорт через `module/__init__.py`, не через внутренние файлы. Пример: `transactions` импортирует `sanctions` через `from app.sanctions import check_subject`, не `from app.sanctions.internal_helpers` |
| **Циклические импорты — запрещены** | Детектируется линтером (например, `pylint --disable=all --enable=cyclic-import`) на CI |
| **Только `main.py` монтирует routers** | Модули не импортируют друг друга через router-объекты; маршруты регистрируются в одном месте |

## Frontend monorepo структура

```
frontend/
├── apps/
│   ├── compliance-frontend/      # CS — для COMPLIANCE_OFFICER, COMPLIANCE_HEAD, TENANT_ADMIN
│   ├── backoffice-frontend/      # VO — для BACK_OFFICE_OPERATOR, BACK_OFFICE_HEAD
│   └── client-portal-frontend/   # VO — для CLIENT
├── packages/
│   └── shared/
│       ├── api-client/           # auto-generated from FastAPI OpenAPI
│       ├── ui/                   # design system (Tailwind components)
│       ├── auth/                 # JWT handling, refresh logic
│       └── types/                # generated TypeScript types
├── pnpm-workspace.yaml
└── package.json
```

## SKU → модули backend

| SKU | Включает модули |
|---|---|
| **CS** | `auth, tenants, users, audit, clients, verification, documents, sanctions, risk, kyt, freezing, fiu, high_risk_countries, rfi, notifications, reporting, regulator, shared` |
| **VO** | `auth, tenants, users, audit, clients, documents, transactions, accounting, custody, travel_rule, notifications, shared` |
| **CS+VO bundle** | union(CS, VO) — все модули |
| **Add-ons** (поверх любой SKU) | `risk_advanced_vasp` (требует `risk`), `kyt_chainalysis/trm` (требуют `kyt`), `travel_rule_notabene` (требует `travel_rule`), `regulator_audit_realtime`, `emission_services` |

---

# 5. Security threat model

## OWASP Top 10 (2021)

### A01:2021 Broken Access Control

**Угроза:** пользователь видит/изменяет данные за пределами своей роли или tenant.

**Меры:**
- AD-7 multi-tenancy на app-level (event listener + `@tenant_scoped` декоратор)
- RBAC матрица из 2.1.3 формализована в коде через permission-checks
- Test fixture «two tenants» обязательная для каждого роутера
- CHECK constraints на уровне БД где критично (например, `client_user_link.user_id != client_user_link.granted_by_user_id`)
- `CompositeApproval` (2.4.9) для высокорисковых действий с двойной подписью

### A02:2021 Cryptographic Failures

**Угроза:** компрометация private keys hot wallets, утечка JWT, ослабленные пароли.

**Меры:**
- AD-Q5: master password при старте + AES-256-GCM + Argon2id KDF + memory zero-out
- AD-10: Argon2id для паролей пользователей с OWASP 2024 параметрами (memory=64MiB, iterations=3, parallelism=4)
- JWT RS256 с асимметричной парой
- HTTPS обязателен (TLS 1.2+)
- Cold wallets — вне системы (air-gapped hardware)

### A03:2021 Injection

**Угроза:** SQL injection, XSS в frontend.

**Меры:**
- SQLAlchemy ORM повсюду (никаких raw SQL string concatenation)
- Pydantic валидация всех input на API уровне
- React автоматически escape JSX-output
- CSP headers в nginx

### A04:2021 Insecure Design

**Угроза:** дизайн-уровневые недостатки (например, weak password recovery flow).

**Меры:**
- Defence-in-depth: audit hash-chain + RBAC + CHECK constraints
- Password recovery с TTL 1ч + invalidate active sessions при reset
- Rate limiting на sensitive endpoints (login, password reset, sanctions check)

### A05:2021 Security Misconfiguration

**Угроза:** дефолтные пароли, debug mode на production, открытые админ-эндпоинты.

**Меры:**
- Установка master password обязательна при первом запуске
- Production config отключает debug
- nginx проксирует только нужные routes
- Minimum Postgres permissions для app user (никаких SUPERUSER)

### A06:2021 Vulnerable Components

**Угроза:** CVE в зависимостях (FastAPI, SQLAlchemy, npm packages).

**Меры:**
- `pip-audit` и `npm audit` как часть pre-deployment checks
- Обновление зависимостей при новых релизах с security advisories
- Pinned versions в `requirements.txt` / `package-lock.json`
- Air-gapped: pre-vetted offline package mirror

### A07:2021 Identification and Authentication Failures

**Угроза:** brute force, session hijacking, weak MFA.

**Меры:**
- AD-10: account lockout 5 fail attempts за 15 минут
- TOTP MFA обязательная для не-CLIENT ролей
- Recovery codes (10 одноразовых)
- Session invalidation при reset
- JWT short-lived (15 min access + 7 days refresh)

### A08:2021 Software and Data Integrity Failures

**Угроза:** подмена audit logs, манипуляция реестром операций.

**Меры:**
- AD-Q2: hash-chain в AuditEvent + Postgres trigger DENY UPDATE/DELETE
- Immutable MinIO buckets с object lock (AD-6)
- Версионирование документов через `ClientDocumentVersion`
- License key signature validation (AD-4)

### A09:2021 Security Logging and Monitoring Failures

**Угроза:** пропущенные инциденты, недостаточный audit для регулятора.

**Меры:**
- AD-Q2: синхронный audit в каждой бизнес-транзакции
- Закрытый перечень логируемых действий по 12 категориям (2.1.4)
- SLA breach detection (`SLABreach` 2.5.5)
- Hash-chain verification еженедельно (`verify_audit_chain` job)

### A10:2021 Server-Side Request Forgery (SSRF)

**Угроза:** внутренние эндпоинты доступны через манипуляцию URL.

**Меры:**
- nginx whitelisting external integrations (только разрешённые KYT/IDV endpoints)
- KYT/IDV провайдеры через pre-defined URLs в TenantSettings
- Никаких user-controlled URL для внутренних запросов

## VASP-специфичные угрозы

### V01: Privilege escalation между tenant'ами

**Угроза:** пользователь tenant A читает/изменяет данные tenant B.

**Меры:**
- AD-7: декоратор + listener + test fixture
- AuditEvent ловит все cross-tenant попытки
- SUPER_ADMIN bypass логируется отдельно с обязательным `justification`

### V02: Audit log manipulation

**Угроза:** подмена записей в audit log для скрытия инцидента.

**Меры:**
- AD-Q2: hash-chain + Postgres trigger
- Еженедельная verification (job `verify_audit_chain`)
- Alert + lock дальнейшей записи при обнаружении разрыва цепочки

### V03: Hot wallet key compromise

**Угроза:** кража private keys из БД.

**Меры:**
- AD-Q5: master password + Argon2id + AES-256-GCM + memory zero-out
- Cold wallets для долгосрочных средств
- Threshold-based hot/cold rebalancing
- Reconciliation alerts (расхождение балансов)

### V04: Sanctions check bypass

**Угроза:** операция проходит без полной sanctions screening.

**Меры:**
- AD-Q4: при любом сбое проверки — FAIL pre-submit
- Периодический re-screening всех клиентов через scheduler
- `sanctions_loader` атомарная загрузка списков (всё или ничего)
- Audit на каждую проверку (для регуляторного трейла)

### V05: PII exfiltration

**Угроза:** массовый экспорт клиентских данных недобросовестным сотрудником.

**Меры:**
- `data.exported` в audit (категория Sensitive access)
- Permission `AuditEvent.export` только для COMPLIANCE_HEAD/TENANT_ADMIN/REGULATOR_AUDITOR
- Отдельный audit category `regulator.api_called` с детальным логом всех вызовов
- Rate limiting на экспорт-эндпоинтах

### V06: Compromised license key

**Угроза:** украденный или дублированный license key используется без авторизации.

**Меры:**
- AD-4: license validation при старте + ежедневно
- `expires_at` в токене (короткие сроки выдачи: 1-3 года)
- JWT signature проверка с встроенным public key
- License generator не публичен (внутренний CLI вендора)

---

# 6. Disaster recovery

## Целевые показатели

| Метрика | Значение | Контекст |
|---|---|---|
| **RTO** (Recovery Time Objective) | 4 часа | От обнаружения сбоя до возобновления работы |
| **RPO** (Recovery Point Objective) | 24 часа | Допустимая потеря данных при критическом сбое |

Эти показатели — для стадии (а→б). При росте до критической инфраструктуры — пересмотр.

## Backup procedure (документация для клиента)

### Postgres

- **Daily full backup** через `pg_dump` в зашифрованный архив (GPG)
- **WAL archiving** для point-in-time recovery (опционально для высоких требований)
- **Retention** — минимум 30 дней; для аудит-критичных данных — 7 лет (Q12)
- **Off-site / отдельный носитель** — обязательно
- **Шифрование** через GPG с ключом, отличным от master password (AD-Q5)

### MinIO

- **Daily mirror** через `mc mirror` на отдельный физический носитель
- Object lock сохраняется при mirror
- Critical buckets (`tenant-{id}-fiu-exports, tenant-{id}-audit-archive`) дублируются с retention 7 лет

### Configuration

- **Docker Compose файлы** — в Git у вендора + у клиента
- **Environment files** (без secrets!) — в Git
- **Master password backup** — отдельно, защищённо физически (sealed envelope у руководителя ОВА), копия у вендора в encrypted form с ключом отзыва

## Recovery procedures

### При полной потере сервера

1. Развернуть новый сервер с теми же спецификациями
2. Установить Docker Compose
3. Восстановить Postgres из последнего backup (`pg_restore`)
4. Восстановить MinIO buckets из mirror
5. Скопировать `docker-compose.yml` и environment files
6. Запустить stack с master password (вход по защищённой процедуре)
7. License revalidation
8. Manual smoke test критичных функций (login, sanctions check, audit log read)
9. Notify клиентов о возобновлении работы

### При corrupted Postgres

1. Stop приложения
2. `pg_restore` latest backup в новую БД
3. Verification audit chain integrity (job `verify_audit_chain`)
4. При успешной верификации — switch app на восстановленную БД
5. **При разрыве chain — расследование, не возобновление работы**

### При compromised master password

1. Stop приложения немедленно
2. Подготовить новый master password
3. Re-encrypt все private keys в БД через migration script
4. Restart с новым master password
5. **Audit на тему compromise**: кто имел доступ, через какой канал, когда

## Распределение ответственности

- **Бэкапы** — ответственность клиента (на основании задокументированных процедур вендора)
- **В air-gapped инсталляции** — backup тоже air-gapped (на сменный носитель, физически отделённый)
- **Disaster recovery test** — рекомендуется ежеквартально, ответственность TENANT_ADMIN
- **Вендор** оказывает поддержку при инцидентах в рамках сервисного договора (отдельно от продукта)

---

# 7. Migration path

Существующий код в [`backend/app/models.py`](../../backend/app/models.py) содержит 22 ORM-класса (Base) + 8 enum. Целевая модель из 02-domain-model.md — 59 сущностей.

## Действия

| Code | Описание |
|---|---|
| **KEEP** | Остаётся как есть |
| **EXTEND** | Расширяется новыми полями (миграция Alembic с ADD COLUMN) |
| **REFACTOR** | Структурно меняется (renames, splits, merges) |
| **REPLACE** | Заменяется новой сущностью (data migration script) |
| **DEPRECATE** | Упраздняется (data migration в новые таблицы, потом DROP) |

## Таблица миграции

### Enums (8)

| Existing enum | Action | Target | Migration notes |
|---|---|---|---|
| `UserRole` | **REFACTOR** | UserRole (расширенный) | Q-2.1-A: `COMPANY_ADMIN → TENANT_ADMIN`, `MANAGER → BACK_OFFICE_OPERATOR`; добавляются `COMPLIANCE_HEAD, BACK_OFFICE_HEAD, CLIENT, REGULATOR_AUDITOR`; data migration через ALTER TYPE + UPDATE existing rows |
| `ClientType` | **EXTEND** | ClientType | Добавляется значение `vasp_counterparty` |
| `RiskLevel` | **KEEP** | RiskLevel | low/medium/high/critical — без изменений |
| `OnboardingStatus` | **KEEP** | OnboardingStatus | Сохраняется как подсостояние Client.lifecycle_state (см. 2.2.1) |
| `DocumentStatus` | **REFACTOR** | DocumentStatus (новый FSM) | Расширяется до 5 состояний: missing → received → accepted/rejected → expired |
| `LicenseStatus` | **KEEP** | LicenseStatus | active/expired/suspended — без изменений |
| `SOFDocumentStatus` | **KEEP** | SOFDocumentStatus | submitted/verified/rejected — без изменений |
| `TransactionStatus` | **DEPRECATE** | (выносится в FIUMessage status + Transaction.status) | FIU-ориентированные статусы переносятся в `FIUMessage.status` (см. 2.4.12); операционный `Transaction.status` — новый enum (см. 2.3.2) |

### Сущности (22)

| Existing entity | Action | Target entity | Migration notes |
|---|---|---|---|
| `Company` | **REFACTOR** | Tenant | Концептуально переименовывается в `Tenant`; таблица в БД остаётся `companies` для совместимости (backward-compatible alias). Расширяется полями: `lifecycle_state, sku, timezone, primary_currency, primary_language, max_users` |
| `User` | **EXTEND** | User | Добавляются: `linked_client_id (deprecated), timezone, language, mfa_enabled, mfa_secret, mfa_method, failed_login_attempts, locked_until`. Заменяется hashed_password с bcrypt → Argon2id (через переходный период с двойным хешированием) |
| — | **NEW** | client_user_link | Q-2.1-F resolution; Q17 (см. 2.2.2) |
| `Client` | **EXTEND** | Client | Добавляются: `lifecycle_state, relationship_started_at, relationship_ended_at, current_risk_level, current_risk_score, last_risk_assessed_at, preferred_language, retention_until`. Сохраняется `onboarding_status` для обратной совместимости |
| `IndividualClient` | **REFACTOR** | IndividualClient (CDD-739) | Q8 закрытие: структурирование адресов в 9 подполей (`reg_country/region/city/...`, аналогично actual_*); переименование `is_pdl → is_pep`. Подробнее в 2.2.3 |
| `LegalEntityClient` | **REFACTOR** | LegalEntityClient (CDD-739) | Q8 закрытие: `legal_address` в 8 структурных подполей; `authorized_capital` → `authorized_capital_registered + authorized_capital_paid`; новое `has_physical_presence_kg`; `authorized_signatories` → перевод в `ClientRepresentative`. Подробнее в 2.2.4 |
| — | **NEW** | VASPCounterparty | Подшаг 2.2.5 — для `client_type=vasp_counterparty` |
| `DirectorClient` | **EXTEND** | DirectorClient | Добавляются: `lifecycle_state, terminated_at, terminated_reason, replaced_by_director_id, appointment_doc_id, position (enum), verification_session_id` |
| — | **NEW** | DirectorHistory | Подшаг 2.2.6 — историзация смены директоров |
| `ClientRepresentative` | **EXTEND** | ClientRepresentative | Добавляются: `link_type, lifecycle_state, linked_user_id, authority_doc_id, authority_scope (JSON), revoked_at, revoked_by_user_id, revoked_reason, verification_session_id` |
| `UBO` | **EXTEND** | UBO | Q-3-A: переименование `gosregistry_sync_status → internal_verification_status` (после Q-2.2-H closure: out-of-scope гос. база БВ). Добавляются: `recognition_criteria_codes (JSON), recognition_criteria_details (JSON), parent_ubo_entity_id, verification_session_id` |
| — | **NEW** | UBOEntity | Подшаг 2.2.8 — промежуточные ЮЛ в цепочке владения |
| `PEPRecord` | **DEPRECATE** | (заменено PEPRelation) | Подшаг 2.2.9 — рефакторинг PEP. Старый PEPRecord переходит в новую структуру PEPProfile + PEPRelation; data migration: каждая PEPRecord → одна PEPProfile (для PEP-самого) или одна PEPRelation (для FAMILY/ASSOCIATE) |
| `PEPQuestionnaire` | **REPLACE** | PEPProfile | Подшаг 2.2.9 — переименование + расширение. Полиморфно привязывается к любому субъекту (через AD-Q1 nullable FKs). JSON-массивы `family_members, close_associates` — выносятся в отдельные `PEPRelation` записи |
| — | **NEW** | PEPRelation | Подшаг 2.2.9 — отдельная запись на каждого члена семьи / близкое лицо |
| `ClientDocument` | **EXTEND** | ClientDocument | Добавляются: `tenant_id, description, linked_entity_type, linked_entity_id, current_version_id, document_type (enum расширенный)`. `file_path` переносится в `ClientDocumentVersion` |
| — | **NEW** | ClientDocumentVersion | Подшаг 2.2.10 — версионирование документов |
| `SanctionsCheck` | **REFACTOR** | SanctionsCheck | `subject_type → target_type` (расширенный enum), `subject_id → target_id, subject_name → target_name_snapshot`. AD-Q3: `cache_valid_until → last_check_at` (Q-3-B косметика). Officer decision поля выносятся в новую `SanctionsMatchDecision` (data migration по существующим officer_decision записям) |
| — | **NEW** | SanctionsMatchDecision | Подшаг 2.4.4 |
| — | **NEW** | SanctionsListSnapshot | Подшаг 2.4.1 — версионирование списков |
| `SumsubRecord` | **DEPRECATE** | (заменено VerificationSession + IDV providers) | Sumsub становится одним из IDV-провайдеров; данные мигрируются в `VerificationSession + VerificationArtifact`. Старая таблица сохраняется ~3 месяца после миграции для верификации, потом DROP |
| — | **NEW** | VerificationSession | Подшаг 2.2.12 (с AD-Q1 polymorphic FK) |
| — | **NEW** | VerificationArtifact | Подшаг 2.2.12 — фото/видео/скан-доказательства |
| `RiskScoringHistory` | **DEPRECATE** | (декомпозируется в RiskAssessment + RiskBasic61p + RiskAdvancedVASP + RiskOverride) | Существующие записи: каждая → одна `RiskAssessment` + одна `RiskBasic61p` или `RiskAdvancedVASP` (по типу клиента) + при `override_applied=true` одна `RiskOverride`. Старая таблица DROP после успешной миграции |
| — | **NEW** | RiskAssessment, RiskBasic61p, RiskAdvancedVASP, RiskOverride | Подшаги 2.4.5-2.4.8 |
| — | **NEW** | CompositeApproval | Подшаг 2.4.9 — формализация всех ✋-решений |
| `SOFDocument` | **EXTEND** | SOFDocument | Добавляются: `linked_pep_profile_id, linked_transactions, coverage_percent, verification_session_id` |
| `Transaction` | **REFACTOR** | Order + Transaction (split) | Существующая `Transaction` разделяется на: `Order` (намерение клиента) + `Transaction` (исполнение). Поля `auto_indicators, manual_indicators, risk_score, is_mandatory_control, status (TransactionStatus)` — переносятся в FIU-домен 2.4 (FIUMessage + SuspiciousActivityFlag). Поля `counterparty_*` — выносятся в `CounterpartyBank`. `amount/currency/amount_kgs` — разделяется на детальную структуру Q5 |
| — | **NEW** | Order | Подшаг 2.3.1 |
| — | **NEW** | WalletAddress | Подшаг 2.3.3 |
| — | **NEW** | CustodyMovement | Подшаг 2.3.4 |
| — | **NEW** | CounterpartyBank | Подшаг 2.3.5 |
| — | **NEW** | ExchangeRateSnapshot | Подшаг 2.3.6 |
| — | **NEW** | ThresholdCheck | Подшаг 2.3.7, Q11 закрытие |
| — | **NEW** | FrozenAccount, FrozenOperation | Подшаг 2.3.8 |
| — | **NEW** | SuspiciousActivityFlag | Подшаг 2.3.9 + расширение в 2.4.17 |
| — | **NEW** | KYTCheckResult | Подшаг 2.4.10 |
| — | **NEW** | TravelRuleMessage | Подшаг 2.4.11 — Q18 (отдельная сущность, не в WalletAddress) |
| — | **NEW** | FIUMessage, FIUExportBatch, RFIInvolvement | Подшаги 2.4.12-2.4.14 |
| `RegulatoryDocument` | **KEEP** | RegulatoryDocument | Справочник законов/постановлений; уже работает. Не путать с новой `RegulatoryReport` (2.5.1) |
| `HighRiskCountry` | **EXTEND** | HighRiskCountry | Добавляются: `default_actions (JSON), designation_date, removal_date, basis, last_synced_at, source_url` |
| `HighRiskCountryAudit` | **KEEP** | HighRiskCountryAudit | Журнал изменений ВРС — без изменений |
| — | **NEW** | HighRiskCountryCheck | Подшаг 2.4.16 — per-target audit |
| `AuditLog` | **REPLACE** | AuditEvent | Полная замена с добавлением hash-chain. Существующие записи мигрируются в новую таблицу с пересчётом hash для всех записей. Старая таблица сохраняется ~3 месяца, потом DROP |
| — | **NEW** | TenantSettings | Подшаг 2.1.5 |
| — | **NEW** | RiskSettings | Подшаг 2.1.6 — Q1, Q3 |
| — | **NEW** | RetentionPolicy, RetentionExtension | Подшаг 2.1.7 — Q12 |
| — | **NEW** | PolicyDocument | Подшаг 2.1.8 |
| — | **NEW** | Notification | Подшаг 2.1.9 + расширение в 2.5.6 |
| — | **NEW** | FeatureFlag | Подшаг 2.1.1 |
| — | **NEW** | RFIRequest | Подшаг 2.2.13 |
| — | **NEW** | ClientPortalAccess | Подшаг 2.2.14 |
| — | **NEW** | AnomalyDetector | Подшаг 2.4.18 — Q1 |
| — | **NEW** | RegulatoryReport, RegulatorAPIAccess, RegulatorAPIAccessLog | Подшаг 2.5.1-2.5.2 |
| — | **NEW** | Dashboard, ReportTemplate, SLABreach | Подшаги 2.5.3-2.5.5 |
| — | **NEW** | ConsentRecord | Подшаг 2.5.7 — Q22 |
| — | **NEW** | ProfileBaseline | Подшаг 2.5.8 — Q21 |
| — | **NEW** | Wallet (omnibus), ClientBalance, LedgerEntry, OnChainTransaction, Reconciliation | AD-Q5 (модуль `accounting`) |

## Косметические правки шага 2 на основе AD

| ID | Изменение | Где |
|---|---|---|
| **Q-3-A** | Переименование `UBO.gosregistry_sync_status → UBO.internal_verification_status` | После Q-2.2-H closure: гос. база БВ — out-of-scope; внутренняя верификация остаётся |
| **Q-3-B** | Переименование `SanctionsCheck.cache_valid_until → SanctionsCheck.last_check_at` | После AD-Q3: sanctions без кэша; поле семантически — время последней проверки |

## Migration data scripts

Конкретные scripts (Alembic + raw SQL) — это **шаг 4** (technical plan). На уровне 03-architecture фиксируется только направление миграции и объём.

**АФГ dev-инсталляция:** при наличии реальных тестовых данных — миграция через скрипт, запускаемый ручным TENANT_ADMIN action, не автоматически. Production rollout (см. AD-3) — отдельная задача.

---

# 8. Implementation Roadmap

Последовательность фаз для имплементации в **шаге 4**. Зависимости отражены в порядке.

## Phase 0 — Infrastructure prep (1-2 недели)

- Monorepo setup (pnpm workspaces) — AD-9
- Docker Compose stack: Postgres, MinIO, FastAPI placeholder, nginx
- License generator (CLI tool) — AD-4
- CI: linting, type-checking, basic tests
- Master password procedure draft (документация)

**Артефакты:** Docker Compose файл, CI pipeline, License CLI tool.

## Phase 1 — Core foundation (3-4 недели)

- AD-7 multi-tenancy infrastructure (event listener, decorator, fixtures)
- AD-10 auth: Argon2id, JWT RS256, TOTP MFA, password recovery
- AD-Q2 AuditEvent с hash-chain, синхронная запись
- Tenant + User + RBAC матрица из 2.1.3
- TenantSettings + RiskSettings + PolicyDocument + RetentionPolicy
- Migration: existing Company → Tenant, существующие Users — extension (UserRole переименования)
- License validation + revalidation jobs (AD-8)

**Артефакты:** функциональный auth с MFA, multi-tenancy infra, audit hash-chain.

## Phase 2 — Client domain (4-5 недель)

- IndividualClient/LegalEntityClient с дельтой 606→CDD-739 (Q8)
- VerificationSession с AD-Q1 polymorphic FK + IDV provider interface
- ClientDocument + ClientDocumentVersion + MinIO интеграция (AD-6)
- UBO + UBOEntity + PEPProfile/PEPRelation + ConsentRecord (Q22)
- ClientPortalAccess + RFIRequest
- ProfileBaseline (Q21) для дроппер-детектора
- client_user_link (Q17)
- DirectorClient + DirectorHistory + ClientRepresentative (расширение)

**Артефакты:** полный CDD pipeline, клиентский портал базовый.

## Phase 3 — Sanctions + Risk (3-4 недели)

- SanctionsList + SanctionedEntity + SanctionsCheck (AD-Q3 без кэша) + SanctionsListSnapshot
- SanctionsMatchDecision с confidence-градацией (Q19)
- RiskAssessment + RiskBasic61p (обязательный) + AnomalyDetector (Q1 настраиваемые пороги)
- RiskOverride (Q4) + CompositeApproval
- HighRiskCountry + HighRiskCountryCheck

**Артефакты:** обязательный compliance-функционал CS.

## Phase 4 — Operations + Custody (5-6 недель)

- WalletAddress (без Travel Rule полей в адресе — Q18) + KeyManagementProvider
- AD-Q5 accounting module: Wallet, ClientBalance, LedgerEntry, OnChainTransaction, Reconciliation
- Master password setup procedure (production-ready)
- Order + Transaction + pre-submit pipeline 11 hooks
- AD-Q4 parallel sanctions screening в hook 7
- ThresholdCheck (Q11)
- CustodyMovement + signature_type/signature_payload (Q14 — пока MFA-fallback)
- ExchangeRateSnapshot, CounterpartyBank
- FrozenAccount + FrozenOperation + 2-month timer (ПЗМ § 12)

**Артефакты:** функциональный VO — заявки, исполнение, custody, замораживание.

## Phase 5 — Compliance workflow (3-4 недели)

- KYTCheckResult + KYTProvider interface + Ranex KG integration (KYT с кэшем)
- TravelRuleMessage (Q18 — отдельная сущность)
- FIUMessage + FIUExportBatch (Q5 Excel-MVP)
- SLA breach detection scheduler

**Артефакты:** полный FIU-pipeline на Excel-MVP, KYT-интеграция.

## Phase 6 — Reporting + Frontend (5-6 недель)

- RegulatoryReport (ПОВА п. 36)
- Dashboard (декларативные определения)
- SLABreach auto-detection
- Notification finalization (25+ триггеров — 2.5.6)
- RegulatorAPIAccess + RegulatorAPIAccessLog
- Frontend SPAs: compliance, back-office, client-portal — параллельно с backend
- shared library: API client codegen, design system

**Артефакты:** полный продукт MVP.

## Phase 7 — Add-ons (опционально, по спросу)

- RiskAdvancedVASP (4-блочная модель — Q3 уровень 2)
- Дополнительные KYT/IDV провайдеры (Chainalysis, TRM, Onfido)
- Travel Rule provider integration (Notabene)
- Advanced custody (FireblocksKMS migration при росте $5M+/мес)
- Emission services (FVP-only требование 97d)

## Phase 8 — Production rollout АФГ (отдельная задача, AD-3)

- Выделение сервера в АФГ
- Migration dev→prod (если есть реальные данные)
- TENANT_ADMIN onboarding
- Master password procedure setup
- Backup procedures setup
- Smoke tests
- Go-live

## Общая оценка

**~24-30 недель (6-7 месяцев)** на phases 0-6 одним разработчиком + Claude Code.

Phase 7-8 — параллельно/после, объём зависит от приоритетов.

## Зависимости фаз

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
                                                  ▲
                                                  │
                                            Phase 4 зависит от Phase 3
                                            (sanctions нужны для pre-submit hooks)

Phase 7 ──► параллельно Phase 5/6 (по приоритетам)
Phase 8 ──► после Phase 6 (production rollout)
```

---

## История версий

| Версия | Дата | Изменения |
|---|---|---|
| 1.0 | 2026-05-02 | Шаг 3 — формализация архитектуры. Зафиксированы 15 архитектурных решений (AD-1..AD-10, AD-Q1..AD-Q5). Component diagram (Docker Compose stack), module boundaries для backend (22 модуля) и frontend monorepo (3 SPA + shared). Security threat model (10 OWASP + 6 VASP-специфичных угроз). Disaster recovery procedures (RTO 4h, RPO 24h). Migration table из 30 существующих сущностей в 59 целевых (по 5 действиям: KEEP/EXTEND/REFACTOR/REPLACE/DEPRECATE). Implementation Roadmap из 9 фаз (Phase 0-8) с оценкой 24-30 недель |
