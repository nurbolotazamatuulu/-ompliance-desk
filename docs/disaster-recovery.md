# ComplianceDesk-VASP — Disaster Recovery

**Status:** skeleton (Phase 0). Стартовая точка — копия §6 из [`vasp-expansion/03-architecture.md`](./vasp-expansion/03-architecture.md). Полное наполнение — Phase 8 при production rollout АФГ ([AD-3](./vasp-expansion/03-architecture.md#ad-3--афг-dev-и-prod-как-раздельные-инсталляции)).

Документ описывает целевые показатели восстановления, backup procedures и recovery scenarios для on-premise инсталляции ([AD-2](./vasp-expansion/03-architecture.md#ad-2--on-premise-only-via-docker-compose)).

Бэкапы и DR-тесты — **ответственность клиента**. Вендор предоставляет процедуры и поддержку при инцидентах в рамках сервисного договора.

---

## Целевые показатели

| Метрика | Значение | Контекст |
|---|---|---|
| **RTO** (Recovery Time Objective) | 4 часа | От обнаружения сбоя до возобновления работы |
| **RPO** (Recovery Point Objective) | 24 часа | Допустимая потеря данных при критическом сбое |

Эти показатели — для стадии (а→б). При росте до критической инфраструктуры — пересмотр.

---

## Backup procedure

### Postgres

- **Daily full backup** через `pg_dump` в зашифрованный архив (GPG)
- **WAL archiving** для point-in-time recovery (опционально для высоких требований)
- **Retention** — минимум 30 дней; для аудит-критичных данных — 7 лет ([Q12](./vasp-expansion/00-decisions.md#q12-сроки-хранения-данных))
- **Off-site / отдельный носитель** — обязательно
- **Шифрование** через GPG с ключом, отличным от master password ([AD-Q5](./vasp-expansion/03-architecture.md#ad-q5--custodial-omnibus-hotcold-model))

### MinIO

- **Daily mirror** через `mc mirror` на отдельный физический носитель
- Object lock сохраняется при mirror
- Critical buckets (`tenant-{id}-fiu-exports`, `tenant-{id}-audit-archive`) дублируются с retention 7 лет

### Configuration

- **Docker Compose файлы** — в Git у вендора + у клиента
- **Environment files** (без secrets!) — в Git
- **Master password backup** — отдельно, защищённо физически (sealed envelope у руководителя ОВА), копия у вендора в encrypted form с ключом отзыва

> **Phase 8 уточнения:** конкретные shell-команды (`pg_dump`, `mc mirror`, `gpg`), периодичность (cron expressions), retention scripts — будут детализированы при production rollout АФГ.

---

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
3. Verification audit chain integrity (job `verify_audit_chain` из [AD-Q2](./vasp-expansion/03-architecture.md#ad-q2--синхронный-hash-chain-в-audit))
4. При успешной верификации — switch app на восстановленную БД
5. **При разрыве chain — расследование, не возобновление работы**

### При compromised master password

1. Stop приложения немедленно
2. Подготовить новый master password
3. Re-encrypt все private keys в БД через migration script
4. Restart с новым master password
5. **Audit на тему compromise**: кто имел доступ, через какой канал, когда

### При compromised license private key (AD-4)

> **Содержание будет добавлено в Phase 1 (license module) и Phase 8 (production procedures).**

Базовый план:
- Регенерация key pair через `tools/license-generator/generate-keys.py --force`
- Перевыпуск всех активных license tokens
- Smear period: старый public key остаётся валидным до распространения новых tokens
- Уведомление всех tenants

### При compromised hot wallet keys (AD-Q5)

> **Содержание будет добавлено в Phase 4 (custody/accounting module).**

Базовый план:
- Немедленная заморозка всех связанных операций (FrozenAccount)
- Перенос балансов с скомпрометированного hot wallet на новый
- Отчёт в ФР как `RegulatoryReport.report_type=incident_report` (ПОВА п. 36)
- Постфактум-расследование через AuditEvent + KYTCheckResult логи

---

## Распределение ответственности

| Ответственность | Кто |
|---|---|
| Бэкапы (выполнение, контроль, retention) | Клиент (TENANT_ADMIN) |
| Документация процедур | Вендор |
| Air-gapped backup для air-gapped инсталляций | Клиент (на сменный носитель, физически отделённый) |
| Disaster recovery test (рекомендуется ежеквартально) | Клиент (TENANT_ADMIN) |
| Поддержка при инцидентах | Вендор (в рамках сервисного договора) |
| Master password backup | Клиент (физическое хранение); копия у вендора (encrypted) |
| License private key backup | Вендор (в рамках инфраструктуры license-generator) |

---

## Phase 0 baseline (текущая dev-инсталляция АФГ)

На текущем этапе:
- АФГ dev-инсталляция работает на ПК разработчика
- Production-уровень DR не применяется
- Регулярные бэкапы — на усмотрение разработчика
- При потере dev-данных нет регуляторного риска (нет реальных клиентских данных)

Production-rollout DR procedures активируются в Phase 8 ([AD-3](./vasp-expansion/03-architecture.md#ad-3--афг-dev-и-prod-как-раздельные-инсталляции)).

---

## История версий

| Версия | Дата | Изменения |
|---|---|---|
| 0.1 | 2026-05-02 | Phase 0 skeleton: копия §6 из 03-architecture.md, добавлены 2 раздела-заглушки (compromised license key, compromised hot wallet keys), таблица распределения ответственности, заметка о Phase 0 baseline |
