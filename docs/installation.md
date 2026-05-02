# ComplianceDesk-VASP — Installation Guide

**Status:** skeleton (Phase 0). Содержательное наполнение — по мере имплементации соответствующих компонентов.

Документ описывает on-premise развёртывание per [AD-2](./vasp-expansion/03-architecture.md#ad-2--on-premise-only-via-docker-compose). SaaS-модель не поддерживается на стадии (а→б). Air-gapped установка — поддерживается.

---

## Системные требования

> **Содержание будет заполнено в Phase 8 (production rollout АФГ).**

Будут покрыты:
- Минимальные / рекомендуемые / production CPU, RAM, disk
- Поддерживаемые ОС (Linux дистрибутивы, версии ядра)
- Версия Docker / Docker Compose
- Сетевые требования (open ports, internal DNS)
- TLS/SSL сертификаты для production

На текущем этапе АФГ работает на dev-машине разработчика (см. AD-3).

---

## Pre-install checklist

> **Содержание будет заполнено в Phase 1 (license module) и Phase 4 (master password).**

Будут покрыты:
- Получение license key от вендора (signed JWT по AD-4)
- Подготовка master password для шифрования private keys (AD-Q5)
- Генерация всех `*_PASSWORD` env vars (см. `.env.example`)
- Резервное копирование значений в защищённое хранилище

На текущем этапе использовать `.env.example` как ориентир.

---

## Развёртывание

> **Содержание будет заполнено в Phase 0+ постепенно.**

Будут покрыты:
- Клонирование репозитория / распаковка offline-архива (для air-gapped)
- Создание `.env` из `.env.example` с реальными значениями
- `docker compose up -d`
- Проверка статуса: `docker compose ps` (все сервисы должны быть `healthy`)

Текущий рабочий минимум:
```bash
cp .env.example .env
# отредактировать .env, заменить все CHANGE_ME_* placeholders
docker compose up -d
docker compose ps   # все 4 контейнера healthy, minio_init exited 0
```

---

## Первый запуск

> **Содержание будет заполнено в Phase 4 (AD-Q5 master password prompt).**

Будут покрыты:
- Master password prompt при старте backend (interactive, НЕ через env var)
- Bootstrap проверка license (`LICENSE_PUBLIC_KEY_PATH` validation)
- Авто-применение Alembic миграций при первом старте

На текущем этапе backend стартует без master password (`MASTER_PASSWORD_PROMPT_REQUIRED=false`).

---

## Создание первого tenant + TENANT_ADMIN

> **Содержание будет заполнено в Phase 1 (auth + tenant management).**

Будут покрыты:
- CLI команда / admin-эндпоинт создания tenant
- Назначение TENANT_ADMIN-пользователя с временным паролем
- Force-change-password при первом входе TENANT_ADMIN
- Завершение первичной настройки RiskSettings + ПВК (PolicyDocument)
- Переход tenant в `lifecycle_state = active`

На текущем этапе используется legacy company/users модель (модули 1-5).

---

## Backup procedure

См. отдельный документ: [`disaster-recovery.md`](./disaster-recovery.md).

Краткая выжимка:
- Daily Postgres backup через `pg_dump` (GPG-encrypted)
- Daily MinIO mirror через `mc mirror`
- Master password backup — отдельно, физически защищённо

---

## Troubleshooting

> **Содержание будет наполняться по мере появления реальных инцидентов.**

Будущие разделы:
- Контейнер не стартует / unhealthy
- Backend не подключается к Postgres / MinIO
- License revalidation fails
- Hash-chain verification разрыв (см. AD-Q2)
- Performance degradation

На текущем этапе для отладки:
```bash
docker compose logs <service>
docker compose ps -a
docker compose exec <service> sh
```

---

## История версий

| Версия | Дата | Изменения |
|---|---|---|
| 0.1 | 2026-05-02 | Phase 0 skeleton: разделы и пометки на будущее наполнение |
