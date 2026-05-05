# ComplianceDesk — Рабочий стол комплаенс-офицера VASP

## Требования

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — установить на компьютер клиента
- Минимум 4 ГБ RAM, 10 ГБ свободного места

---

## Первый запуск

### 1. Скопируй файл настроек
```bash
cp .env.example .env
```

### 2. Открой `.env` и замени значения:
```
DB_PASSWORD=придумай_сложный_пароль
SECRET_KEY=случайная_строка_64_символа
COMPANY_LICENSE_KEY=ключ_от_поставщика
```

### 3. Запусти
```bash
docker-compose up -d
```

### 4. Создай первого тенанта и администратора

```bash
docker-compose exec backend python -m app.cli bootstrap
```

Команда атомарно (одна транзакция) создаёт:

- **Tenant** (через `app.tenancy.lifecycle.provision_tenant`) — стартовое состояние `provisioning` с заданным `license_key`.
- **SUPER_ADMIN user** — на этом этапе vendor-level админ; для каждого ОВА после deploy создаётся отдельный `TENANT_ADMIN` через UI.
- Выдаёт **placeholder license_key** на stdout (продакшен-ключ — из артефакта `tools/license-generator/`).

Пароль вводится интерактивно через `getpass` — не передавай его аргументом, не оставляй в shell-history.

При любой ошибке транзакция откатывается — половинных состояний нет.

> Команда `app.cli bootstrap` лежит в Phase 1 Block 4 (Auth). До отгрузки Block 4 admin создаётся вручную через `psql` либо временным скриптом — обратись к команде ComplianceDesk за инструкцией под текущий milestone.

### 5. Открой браузер

```
http://localhost
```

---

## Обновление до новой версии

```bash
docker-compose pull
docker-compose up -d
```
Данные сохраняются — они в отдельном volume (`postgres_data`).

---

## Резервная копия базы данных

```bash
docker-compose exec db pg_dump -U compliance_user compliance_db > backup_$(date +%Y%m%d).sql
```

---

## Структура проекта

```
compliance-desk/
├── docker-compose.yml     # Описание всех сервисов
├── .env                   # Секреты (не коммитить в git!)
├── backend/               # Python FastAPI сервер
│   ├── app/
│   │   ├── models.py      # Структура базы данных
│   │   ├── auth.py        # Аутентификация
│   │   ├── license.py     # Лицензионный контроль
│   │   └── routers/       # API эндпоинты (по модулям)
└── frontend/              # React приложение
    └── src/
        ├── pages/         # Страницы
        ├── components/    # Переиспользуемые компоненты
        ├── api/           # Запросы к бэкенду
        └── store/         # Глобальное состояние
```

---

## Роли пользователей (Phase 1+ — `UserRoleV2`)

Полная матрица прав — `app/rbac/matrix.py`. Краткое резюме:

| Роль | Назначение | Ключевые permissions |
|---|---|---|
| `super_admin` | Vendor-level (ComplianceDesk operators), cross-tenant. **Не выдаётся клиентам ОВА.** | Все permissions автоматически (включая `tenant.provision/suspend/terminate`) |
| `tenant_admin` | Админ одного ОВА. Управляет пользователями + конфигом + читает audit. **Не имеет** прав на lifecycle самого tenant'а — это billing/contract уровень, vendor-only. | `tenant.view`, `user.invite/revoke/reset_password`, `client.read/write/approve`, `audit.view`, `config.change` |
| `compliance_officer` | Day-to-day работа: KYC/CDD, скрининг, риск-скоринг. | `client.read/write/approve`, `audit.view` |
| `analyst` | Read-only на клиентов (отчёты, дашборды). Без audit. | `client.read` |
| `client_user` | Клиент ОВА (Phase 2+ self-service portal). В Phase 1 backend permissions нет — отдельный client-facing API. | — |

> Legacy `UserRole` (`super_admin`/`company_admin`/`compliance_officer`/`manager`/`read_only`) сохранена для backward compat с Phase 0 кодом до Phase 2 router refactor. До запуска `migrate_user_roles.py` `require_permission` декоратор автоматически разрешает legacy → V2 через `USER_ROLE_MIGRATION_MAP` — RBAC работает на existing АФГ пользователях с момента deploy.

---

## Порты: local dev vs Docker deployment

В проекте две валидные конфигурации портов в зависимости от способа запуска:

| Сценарий | Backend | Frontend | DB |
|---|---|---|---|
| **Docker Compose** (`docker-compose up -d`) — production-like | `8080` (host) → `8000` (container) | `80` (host) → `80` (container) | `5433` (host) → `5432` (container) |
| **Local dev** (uvicorn standalone + Vite dev) | `8002` (uvicorn) | `5173` (Vite dev server) | `5433` (тот же docker-compose db) |

Для customer deployment — Docker Compose. Local dev режим — для разработки фронтенда с горячей перезагрузкой и backend без контейнера.

> ⚠️ TLS termination в Docker-варианте сейчас отсутствует (frontend на :80 без HTTPS). Для production deployment customer'у нужен собственный reverse proxy (nginx/Apache/Cloudflare/etc.) — см. Q-deploy-C в репо. До отгрузки `docker-compose.prod.yml` с internal-network конфигурацией `:80` подходит ТОЛЬКО для local/staging без чувствительных данных.
