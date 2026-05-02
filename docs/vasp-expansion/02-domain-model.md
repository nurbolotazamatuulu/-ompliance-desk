# 02 Доменная модель ComplianceDesk-VASP

**Версия:** 0.1 (только подшаг 2.1)
**Дата:** 2026-05-02
**Статус:** черновик после подшага 2.1

## Структура документа

| Подшаг | Раздел | Статус |
|---|---|---|
| 2.1 | Общий каркас (Tenant, User, RBAC, AuditLog, Settings, Notifications, i18n) | ✅ |
| 2.2 | Клиенты, БВ, ПДЛ (анкеты по CDD-739, документы) | ✅ |
| 2.3 | Операции (заявки, исполнение, реестр, custody) | ✅ |
| 2.4 | Compliance-домен (sanctions, risk, KYT, Travel Rule, FIU, HRC, детекторы) | ✅ |
| 2.5 | Reporting и интеграции (отчётность ОВА, регулятор-API, дашборды, consents, profile baseline) | ✅ этот подшаг |

---

# 2.1 Общий каркас

## Контекст и границы

Этот подшаг проектирует **сквозные сущности**, которые держат на себе все остальные домены: tenant, пользователи и ролевая модель, аудит-журнал, общие настройки tenant'а, risk-настройки (как сквозная сущность, конфигурирующая риск-домен из 2.4), retention, ПВК, уведомления и i18n. Конкретные доменные модели (клиенты, операции, риски, отчётность) проектируются в подшагах 2.2–2.5 — здесь только их каркас.

**Что есть в коде сейчас** ([backend/app/models.py](backend/app/models.py)):
- `Company` — tenant (реквизиты ОВА, лицензия ГСФР, AML-офицер, лимит клиентов)
- `User` — связан с `Company`, enum `UserRole` с 5 значениями (SUPER_ADMIN, COMPANY_ADMIN, COMPLIANCE_OFFICER, MANAGER, READ_ONLY)
- `AuditLog` — действия пользователей с привязкой к `Company` + `User`
- Изоляция данных — row-level через `company_id` во всех связанных таблицах, проверка на уровне роутеров через `current_user.company_id`
- `auth.py` — JWT bcrypt, декоратор `require_roles()` для проверки роли

**Что меняется на 2.1:**
- Концептуально `Company` → `Tenant` (с расширением lifecycle + feature flags); таблица в БД остаётся `companies` для совместимости с миграциями
- Расширяется ролевая модель (добавляются `BACK_OFFICE_OPERATOR`, `COMPLIANCE_HEAD`, `CLIENT`, `REGULATOR_AUDITOR`)
- Вводится явная матрица RBAC (роль × permission)
- Расширяется `AuditLog` под Q12 retention 7 лет + добавляется иммутабельность через hash-chain
- Появляются новые сущности: `TenantSettings`, `RiskSettings`, `RetentionPolicy`, `PolicyDocument`, `Notification`, `FeatureFlag`

## Карта сущностей 2.1

```
                            ┌─────────────────────┐
                            │       Tenant        │ ← переименован из Company
                            │  (lifecycle FSM)    │
                            └──────────┬──────────┘
                                       │ 1
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
            │ N                        │ N                        │ N
       ┌────▼─────┐             ┌──────▼──────┐           ┌───────▼────────┐
       │   User   │             │TenantSetting│           │ FeatureFlag    │
       │ (role)   │             │             │           │ (per-tenant)   │
       └────┬─────┘             └─────────────┘           └────────────────┘
            │ 1                          │ 1
            │ N                          │ 1
       ┌────▼──────────┐          ┌──────▼────────┐
       │ AuditEvent    │          │ RiskSettings  │  ← Q1, Q3
       │ (hash-chain,  │          │ (versioned)   │
       │  immutable)   │          └───────────────┘
       └───────────────┘                 │ N
            │ N                          │
            │                            ▼
            │ 1                  ┌────────────────┐
       ┌────▼──────────┐         │ PolicyDocument │  ← связь Settings ↔ ПВК
       │ Notification  │         │ (ПВК, версия)  │
       └───────────────┘         └────────────────┘

                            ┌─────────────────────┐
                            │ RetentionPolicy     │  ← Q12, на уровне tenant + per-record extension
                            └─────────────────────┘
```

---

## 2.1.1 Tenant

**Назначение:** ОВА (или организация-покупатель ComplianceDesk), для которого настраивается отдельная инсталляция. Изоляция данных — на уровне Tenant. Ныне в коде называется `Company`.

### Атрибуты

| Имя | Тип | Описание | Обязательность | Связь с чек-листом |
|---|---|---|---|---|
| id | int (PK) | Внутренний идентификатор | да | — |
| name | string(255) | Наименование организации | да | стр. 19 |
| inn | string(20) | ИНН | да для KG-tenant'ов | стр. 22 |
| legal_form | string(100) | ОПФ | да | стр. 21 |
| reg_number | string(100) | Регистрационный номер | да | стр. 23 |
| legal_address | text | Юридический адрес | да | стр. 24 |
| actual_address | text | Фактический адрес | нет | стр. 30 |
| phone, email, website | string | Контакты | нет | стр. 30 |
| activity_types | text | Виды деятельности | нет | стр. 27 |
| **Лицензия ГСФР:** |  |  |  |  |
| license_number | string(100) | Номер лицензии VASP | да для KG | косвенно стр. 114g1 |
| license_status | enum | active / expired / suspended | да | — |
| license_issued_at | datetime | Дата выдачи | нет | — |
| license_expires_at | datetime | Дата окончания | нет | — |
| license_issued_by | string | Орган выдачи (ГСФР) | нет | — |
| gsfr_reg_number | string | Номер в реестре ГСФР | нет | — |
| gsfr_reg_date | datetime | Дата регистрации | нет | — |
| **AML-офицер:** |  |  |  |  |
| aml_officer_name | string | ФИО ответственного | да | производное от ст. 22 ЗАМ |
| aml_officer_position | string | Должность | да | — |
| aml_officer_phone, _email | string | Контакты | да | — |
| **SKU и состояние:** |  |  |  |  |
| sku | enum | `CS` / `VO` / `FVP` — какой SKU куплен | да | определяет применимость требований 01-checklist |
| lifecycle_state | enum | См. FSM ниже | да | — |
| activated_at | datetime | Дата активации (выход из provisioning) | нет | — |
| suspended_at, suspended_reason | datetime, text | При временной блокировке | нет | — |
| offboarded_at | datetime | Дата off-boarding | нет | — |
| **Локализация и валюта:** |  |  |  |  |
| timezone | string(50) | IANA-имя (`Asia/Bishkek` по умолчанию) | да | стр. 99 (фиксация момента операции) |
| primary_currency | string(3) | Базовая валюта tenant'а (KGS) | да | — |
| primary_language | enum | `ru` / `ky` / `en` | да | — |
| **Лимиты:** |  |  |  |  |
| max_clients | int | Лимит клиентов по тарифу | нет | — |
| max_users | int | Лимит пользователей | нет | — |
| **Служебное:** |  |  |  |  |
| license_key | string | Ключ инсталляции (валидация SaaS-доступа) | да | — |
| created_at, updated_at | datetime | Сервисные | да | — |

### Lifecycle FSM

```
                ┌──────────────┐
                │ PROVISIONING │  ◄─── создание; настройка обязательных параметров
                └──────┬───────┘       (RiskSettings, ПВК, AML-офицер, лицензия)
                       │ activate (все обязательные настройки заполнены)
                       ▼
                ┌──────────────┐
       ┌──────► │   ACTIVE     │  ◄─── рабочий режим
       │        └──────┬───────┘
       │               │
       │       suspend │ резюме
       │               │
       │               ▼
       │        ┌──────────────┐
       │        │  SUSPENDED   │  ◄─── временная блокировка (просрочка платежа,
       │        └──────┬───────┘       расследование, регуляторное предписание)
       │               │
       │ resume        │ initiate offboarding
       │               ▼
       │        ┌──────────────┐
       └────────┤ OFFBOARDING  │  ◄─── процесс закрытия:
                │              │       — экспорт всех данных tenant'у
                └──────┬───────┘       — передача регулятору при необходимости
                       │ data_exported  — retention продолжает действовать
                       ▼ + retention_finalized
                ┌──────────────┐
                │   ARCHIVED   │  ◄─── только данные под retention; доступ
                └──────────────┘       только для регулятора по запросу
                       │ retention_expired
                       ▼
                ┌──────────────┐
                │   PURGED     │  ◄─── физическое удаление по Q12
                └──────────────┘
```

| Переход | Условие | Кто инициирует |
|---|---|---|
| `provisioning → active` | Заполнены: лицензия, AML-офицер, RiskSettings, ПВК подписан, выбраны KYT/IDV-провайдеры | TENANT_ADMIN с подтверждением SUPER_ADMIN (вендор) |
| `active → suspended` | Просрочка платежа / регуляторное предписание / расследование | SUPER_ADMIN, либо tenant_admin сам себя |
| `suspended → active` | Снятие основания | SUPER_ADMIN |
| `active → offboarding` | Расторжение договора | TENANT_ADMIN с двойным подтверждением |
| `offboarding → archived` | Завершён экспорт данных tenant'у; retention продолжает работать | автоматически по флагу `data_exported = true` |
| `archived → purged` | По истечении retention 7 лет (Q12) | scheduler `purge_expired_records` |

### Изоляция данных между tenant'ами

**Решение: row-level через `tenant_id`** (продолжаем существующий подход с `company_id`).

| Стратегия | Плюсы | Минусы | Решение |
|---|---|---|---|
| **Row-level (текущая)** | Уже реализована в существующем коде; экономична для SaaS; единая БД, единые миграции; проста в эксплуатации | Риск утечки при ошибке в фильтре (миграция → миграция декораторов); общий ресурс БД | ✅ принято |
| Schema-level (схема на tenant) | Сильная изоляция; раздельные права на схему | Усложнение миграций × N tenants; cross-tenant-аналитика затруднена; неэкономично при росте | отклонено |
| Database-level (БД на tenant) | Максимальная изоляция; раздельный backup | Резко возрастающие операционные затраты; неприменимо для SaaS-модели | отклонено как стандартная конфигурация; зарезервировано как опция «Enterprise on-premise» при особых требованиях клиента |

**Защитные механизмы row-level (закрытие риска утечки):**

1. **`tenant_id` обязательное поле** во всех бизнес-таблицах, NOT NULL.
2. **SQLAlchemy event listener** на сессии: автоматически добавляет `WHERE tenant_id = ?` в запросы текущего пользователя (паттерн «tenant-aware session»).
3. **Декоратор роутеров `@tenant_scoped`** делает обязательным извлечение `tenant_id` из `current_user`.
4. **Запрет cross-tenant запросов** — на уровне ORM-метода, любой запрос без `tenant_id` фильтра поднимает исключение в dev/staging-окружениях.
5. **Test-fixture «two tenants»** — обязательная проверка изоляции для каждого нового роутера.
6. **Особый режим SUPER_ADMIN** — единственная роль, обходящая фильтр (явно через `bypass_tenant_filter=True`).

**Покрытие требования стр. 206 чек-листа** «Мульти-тенантность (разделение данных между компаниями)» → `ЕСТЬ` (в коде уже работает; усиливается явной моделью).

### Feature flags и SKU

**Решение:** SKU задаёт **базовый набор включённых модулей**, дополнительные модули могут включаться индивидуально.

```
SKU = CS  → enabled_modules: {kyc, sanctions, risk_basic, fiu_reporting,
                              freezing, hrc, audit, regulator_access}
SKU = VO  → enabled_modules: {client_portal, back_office, transactions,
                              custody, audit}
SKU = FVP → enabled_modules: union(CS, VO) + {emission_services}
```

**Дополнительные опциональные модули** (включаются поверх SKU):
- `risk_advanced_vasp` (Q3) — 4-блочная VASP-модель риска (платная фича для FVP/CS)
- `mfa_required_for_clients` — обязательный MFA для клиентов на VO
- `regulator_audit_realtime` — read-only API для регулятора с уведомлением о доступе

**Сущность FeatureFlag:**

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| flag_key | string(100) | Ключ модуля/фичи |
| enabled | bool | — |
| activated_at | datetime | — |
| activated_by_user_id | int (FK User) | Кто включил |
| valid_until | datetime | Для платных подписок (null = бессрочно) |

При смене SKU система пересчитывает базовый набор флагов; уже включённые опциональные сохраняются; флаги, требующие модулей не из нового SKU, отключаются с уведомлением tenant_admin.

---

## 2.1.2 User

**Назначение:** учётная запись сотрудника tenant'а (для всех ролей CS/VO) или клиента-пользователя (для роли CLIENT в SKU VO/FVP).

### Атрибуты

| Имя | Тип | Описание | Обязательность |
|---|---|---|---|
| id | int (PK) | — | да |
| tenant_id | int (FK Tenant) | NULL только для SUPER_ADMIN | условно |
| email | string(255), unique | Логин | да |
| full_name | string(255) | ФИО | да |
| hashed_password | string(255) | bcrypt | да |
| role | enum UserRole | См. матрицу 2.1.3 | да |
| is_active | bool | Деактивация без удаления | да |
| **Привязка к клиенту (только для role=CLIENT):** |  |  |  |
| linked_client_id | int (FK Client) | Связь с клиентом ОВА | nullable |
| **Локализация:** |  |  |  |
| timezone | string(50) | Override tenant.timezone (необязательно) | nullable |
| language | enum | Override tenant.primary_language | nullable |
| **MFA:** |  |  |  |
| mfa_enabled | bool | Включён ли TOTP/SMS | да |
| mfa_secret | string (encrypted) | TOTP-секрет (для staff обязательно) | nullable |
| mfa_method | enum | `totp` / `sms` / `email_otp` | nullable |
| **Сервисное:** |  |  |  |
| last_login_at | datetime | — | nullable |
| failed_login_attempts | int | Анти-bruteforce | да |
| locked_until | datetime | Временная блокировка | nullable |
| created_at, updated_at | datetime | — | да |
| created_by_user_id | int (FK User) | Кто создал учётку | nullable |

### Lifecycle

```
        ┌──────────┐
        │ INVITED  │ ◄─── приглашение отправлено, пароль не задан
        └────┬─────┘
             │ user_set_password
             ▼
        ┌──────────┐
        │  ACTIVE  │ ◄─── штатный режим
        └──┬───┬───┘
           │   │
   suspend │   │ archive (off-boarding сотрудника)
           │   │
           ▼   ▼
   ┌──────────┐ ┌──────────┐
   │SUSPENDED │ │ ARCHIVED │
   └──────────┘ └──────────┘
                     │ retention_expired (7 лет)
                     ▼
                ┌──────────┐
                │  PURGED  │
                └──────────┘
```

**Регуляторная привязка:**
- стр. 196 (Журнал всех изменений в данных клиента) и 197 (ФИО+дата сотрудника) — `User` поставляет user_id и full_name в `AuditEvent`
- стр. 208 (MFA для сотрудников) — поля `mfa_*`
- Q12 (retention) — `archived → purged` через 7 лет

---

## 2.1.3 RBAC

### Роли

| Код | Название | Контур | Кто получает | Применимо в SKU |
|---|---|---|---|---|
| `SUPER_ADMIN` | Супер-администратор (вендор) | вне tenant | ComplianceDesk-вендор | все |
| `TENANT_ADMIN` | Администратор организации | админ tenant'а | директор/IT-руководитель ОВА | все |
| `COMPLIANCE_HEAD` | Руководитель комплаенса (MLRO) | комплаенс | начальник AML-службы | CS, FVP |
| `COMPLIANCE_OFFICER` | Комплаенс-офицер | комплаенс | сотрудник AML-службы | CS, FVP |
| `BACK_OFFICE_OPERATOR` | Операционист бэк-офиса | бэк-офис | оператор по исполнению заявок | VO, FVP |
| `BACK_OFFICE_HEAD` | Руководитель операционного отдела | бэк-офис | начальник операций | VO, FVP |
| `CLIENT` | Клиент tenant'а | клиентский портал | физ./юр. лицо — клиент ОВА | VO, FVP |
| `REGULATOR_AUDITOR` | Аудитор от регулятора (ГСФР) | внешний доступ | назначенное должностное лицо ГСФР | все (по требованию стр. 221) |
| `READ_ONLY` | Просмотр без изменений | универсальная | для аудита/наблюдателя | все |

> Существующие в коде роли `COMPANY_ADMIN` и `MANAGER` — переименовываются концептуально в `TENANT_ADMIN` и `BACK_OFFICE_OPERATOR` соответственно. Миграция значений enum — задача шага 4.

### Принцип разделения функций (Закон о ПФПД/ЛПД, ст. 24)

Закон требует разделения функций комплаенса и операционных функций. Формализуется через RBAC-ограничения:

1. **Несовместимость ролей у одного User**: один User может иметь только одну активную role, либо комплаенс-семейство (`COMPLIANCE_OFFICER`/`COMPLIANCE_HEAD`), либо операционное (`BACK_OFFICE_*`), либо административное (`TENANT_ADMIN`). Никаких комбинаций.
2. **Запрет одновременного auth+exec**: операционист не может одновременно создать заявку и одобрить её исполнение. Workflow требует двух разных Users в разных ролях.
3. **Override-апрувы — только COMPLIANCE_HEAD**: переход через override-триггер с продолжением отношений (Q4) требует подписи `COMPLIANCE_HEAD`, недоступной офицеру.
4. **TENANT_ADMIN — без операционного доступа**: админ управляет настройками и правами, но не может исполнять операции и принимать compliance-решения.

### Матрица RBAC: роль × permission

> Матрица — концептуальная (показывает что доступно). Конкретные имена permissions (`client.create`, `transaction.approve` и т.д.) утверждаются в подшагах 2.2–2.5 при проектировании соответствующих доменов.

Легенда: ✅ полный доступ · 👁 read-only · ✋ требует двойной подписи · ⛔ запрещено

| Permission / Role | SUP | TA | CH | CO | BOO | BOH | CL | RA | RO |
|---|---|---|---|---|---|---|---|---|---|
| **Tenant** |
| Tenant.read | ✅ | 👁 | 👁 | 👁 | 👁 | 👁 | ⛔ | 👁 | 👁 |
| Tenant.update_settings | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Tenant.suspend | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Users** |
| User.create | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| User.deactivate | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| User.reset_password | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | self | ⛔ | ⛔ |
| **Clients (KYC)** |
| Client.create | ⛔ | ⛔ | ✅ | ✅ | ✅ | ✅ | self-onboard | ⛔ | ⛔ |
| Client.update_anketa | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | self-update | ⛔ | ⛔ |
| Client.read | 👁 | 👁 | ✅ | ✅ | 👁 | 👁 | self | 👁 | 👁 |
| Client.approve_onboarding | ⛔ | ⛔ | ✅ | ✋ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Transactions / Operations** |
| Transaction.create_order | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| Transaction.execute | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.approve | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.read_all | 👁 | ⛔ | 👁 | 👁 | 👁 | 👁 | self | 👁 | 👁 |
| **Sanctions** |
| Sanctions.run_check | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Sanctions.officer_decision | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Risk** |
| Risk.read_score | ⛔ | ⛔ | ✅ | ✅ | 👁 | 👁 | ⛔ | 👁 | ⛔ |
| Risk.override_approval | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Risk.update_settings | ⛔ | ⛔ | ✋ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Freezing** |
| Freezing.suspend_operation | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Freezing.unfreeze | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **FIU Reporting** |
| FIU.mark_as_str | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FIU.export_excel | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FIU.confirm_submission | ⛔ | ⛔ | ✅ | ✋ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Audit / Regulator** |
| AuditEvent.read | 👁 | 👁 | 👁 | ⛔ | ⛔ | ⛔ | ⛔ | 👁 | ⛔ |
| AuditEvent.export | 👁 | 👁 | 👁 | ⛔ | ⛔ | ⛔ | ⛔ | 👁 | ⛔ |
| Regulator.api_access | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ |
| **RFI** |
| RFI.create_request | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| RFI.respond | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | self | ⛔ | ⛔ |

Сокращения: SUP=SUPER_ADMIN, TA=TENANT_ADMIN, CH=COMPLIANCE_HEAD, CO=COMPLIANCE_OFFICER, BOO=BACK_OFFICE_OPERATOR, BOH=BACK_OFFICE_HEAD, CL=CLIENT, RA=REGULATOR_AUDITOR, RO=READ_ONLY.

### Регуляторные привязки

- **стр. 204** «Разграничение доступа по ролям пользователей» → матрица выше
- **стр. 205** «Доступ службы внутреннего контроля (комплаенс) к базе клиентов и БВ» → COMPLIANCE_HEAD/COMPLIANCE_OFFICER имеют ✅ на Client.read
- **стр. 220–221** «Принимать запросы регулятора через защищённый канал» → роль REGULATOR_AUDITOR
- **стр. 78** «Письменное разрешение руководителя на работу с ПДЛ» → COMPLIANCE_HEAD как auth-уровень для approval'а
- **Закон о ПФПД/ЛПД ст. 24** (разделение функций) → правила несовместимости ролей у одного User

---

## 2.1.4 AuditEvent

**Назначение:** иммутабельная append-only запись каждого регулируемого действия в системе. Основной инструмент доказательной базы для ГСФР.

### Атрибуты

| Имя | Тип | Описание | Обязательность | Связь с чек-листом |
|---|---|---|---|---|
| id | int (PK) | — | да | — |
| tenant_id | int (FK Tenant) | NOT NULL во всех записях | да | — |
| sequence_no | bigint | Глобальный счётчик per-tenant; обеспечивает целостность hash-chain | да | — |
| user_id | int (FK User) | NULL для системных событий | nullable | стр. 197 |
| user_full_name_snapshot | string(255) | ФИО на момент события (защита от переименования) | да | стр. 197 |
| user_role_snapshot | enum | Роль на момент события | да | стр. 197 |
| **Что произошло:** |  |  |  |  |
| action | string(100) | Канонический ключ: `client.created`, `transaction.executed`, `risk.override_approved`, ... | да | стр. 196 |
| entity_type | string(50) | `client` / `transaction` / `risk_settings` / `auth` / ... | да | — |
| entity_id | int | Идентификатор затронутой сущности | nullable | — |
| **Содержание изменения:** |  |  |  |  |
| old_value | JSON | Снимок до (для update/delete) | nullable | — |
| new_value | JSON | Снимок после | nullable | — |
| metadata | JSON | Доп. контекст (override_reason, justification, basis_doc_ref) | nullable | — |
| **Контекст запроса:** |  |  |  |  |
| ip_address | string(50) | IP клиента запроса | nullable | стр. 52 (косвенно) |
| user_agent | string(500) | User-Agent | nullable | — |
| session_id | string(100) | Идентификатор сессии | nullable | — |
| **Иммутабельность:** |  |  |  |  |
| event_hash | string(64) | SHA-256 от канонического представления события | да | стр. 203 |
| previous_hash | string(64) | event_hash предыдущего события того же tenant | да | стр. 203 |
| **Сервисное:** |  |  |  |  |
| created_at | datetime (UTC) | Момент события | да | — |
| retention_until | datetime | created_at + 7 лет (Q12) | да | стр. 175, 203 |

### Иммутабельность: hash-chain

**Решение:** каждое новое событие включает в свой hash hash предыдущего события того же tenant. Цепочка подписана так, что подмена любого старого события требует пересчёта всех последующих hash'ей.

**Алгоритм:**
1. Собирается каноническое представление события (отсортированный JSON всех полей кроме `event_hash` и `previous_hash`).
2. Берётся `previous_hash = (SELECT event_hash FROM audit_events WHERE tenant_id=X ORDER BY sequence_no DESC LIMIT 1)`. Для первого события tenant'а — `previous_hash = '0' * 64` (genesis).
3. `event_hash = SHA256(canonical_repr || previous_hash)`.
4. INSERT ... RETURNING event_hash. Один sequence_no per tenant — гарантируется UNIQUE constraint.

**Альтернативы:**

| Подход | Плюсы | Минусы | Решение |
|---|---|---|---|
| **Hash-chain (выбран)** | Доказательная значимость без внешних зависимостей; локальная проверка; защита от tampering без append-only DB | Нагрузка на INSERT (последовательная — нельзя параллельно вставлять для одного tenant) | ✅ |
| Append-only через Postgres триггеры | Запрет UPDATE/DELETE на уровне БД | Не защищает от tampering при компрометации DB-доступа; не даёт доказательной значимости | используется как **вспомогательная** мера в дополнение к hash-chain |
| Внешний blockchain notarization | Максимальная доказательность | Усложнение, плата за газ, несовместимо с retention 7 лет | отклонено |
| WORM-storage (S3 Object Lock) | Аппаратная гарантия | Vendor lock-in; сложно для on-premise | отклонено как стандарт; зарезервировано для Enterprise |

**Защита целостности:** scheduled job `verify_audit_chain(tenant_id)` запускается еженедельно. Проверяет hash каждого события. При первой ошибке — алерт SUPER_ADMIN + блокировка дальнейшей записи аудита (требует ручного расследования). Лог проверок — в отдельной таблице `audit_chain_verifications`.

### Что подлежит логированию

Полный список — каноническое перечисление:

| Категория | Действия |
|---|---|
| **Auth** | `auth.login_success`, `auth.login_failed`, `auth.logout`, `auth.password_changed`, `auth.mfa_enabled`, `auth.locked` |
| **Tenant** | `tenant.created`, `tenant.lifecycle_changed`, `tenant.settings_updated`, `tenant.feature_flag_toggled` |
| **User** | `user.invited`, `user.activated`, `user.role_changed`, `user.suspended`, `user.archived` |
| **Client** | `client.created`, `client.anketa_updated`, `client.onboarding_status_changed`, `client.archived` |
| **Risk** | `risk.scored`, `risk.override_triggered`, `risk.override_approved`, `risk.settings_updated` |
| **Sanctions** | `sanctions.checked`, `sanctions.list_uploaded`, `sanctions.officer_decision_set` |
| **Transactions** | `transaction.order_created`, `transaction.executed`, `transaction.approved`, `transaction.rejected` |
| **Freezing** | `freezing.suspended`, `freezing.unfrozen`, `freezing.special_account_set` |
| **FIU** | `fiu.candidate_marked`, `fiu.exported`, `fiu.submission_confirmed`, `fiu.ack_received` |
| **RFI** | `rfi.requested`, `rfi.responded`, `rfi.expired` |
| **Sensitive access** | `data.exported` (Excel/CSV/PDF выгрузки), `regulator.api_called`, `audit.exported` |
| **System** | `system.retention_purged`, `system.audit_chain_verified`, `system.audit_chain_broken` |

Перечень — закрытый и расширяется только через PR-ревью с обоснованием.

### Регуляторные привязки

- **стр. 196** Журнал изменений → AuditEvent + матрица «что подлежит»
- **стр. 197** ФИО+дата → user_full_name_snapshot, created_at
- **стр. 198** Документация полноты → action `client.anketa_verified` с metadata.verified_by
- **стр. 199** Журнал санкционных проверок с датой → action `sanctions.checked`
- **стр. 200** Результаты верификации → entity_type=`verification_session`
- **стр. 201** Журнал цифровой идентификации → отдельная таблица + дублирование критических событий в AuditEvent (см. подшаг 2.2)
- **стр. 202** Журнал доступа к базе БВ → action `data.read` с metadata.entity_type=`ubo`
- **стр. 203** Защита от удаления/изменения → hash-chain + Postgres-триггер запрета UPDATE/DELETE

---

## 2.1.5 TenantSettings

**Назначение:** общие настройки tenant'а, не входящие в его реквизиты, и не относящиеся к доменным настройкам (риск, retention, ПВК — отдельные сущности).

### Атрибуты

| Имя | Тип | Описание | Обязательность | Q-привязка |
|---|---|---|---|---|
| id | int (PK) | — | да | — |
| tenant_id | int (FK Tenant), unique | Один к одному с Tenant | да | — |
| **KYT/IDV провайдеры:** |  |  |  |  |
| kyt_provider | enum | `ranex_kg` / `chainalysis` / `trm_labs` / `none` | да | Q10 |
| kyt_provider_config | JSON | API-ключ-ref, endpoint, контракт-ref | nullable | Q10 |
| idv_provider | enum | `samsab` / `sumsub` / `onfido` / `manual` | да | Q10 |
| idv_provider_config | JSON | аналогично | nullable | Q10 |
| **Источники курсов:** |  |  |  |  |
| rate_source_usdt_kgs | enum | `nbkr` / `binance` / `internal` / `manual` | да | Q5 (фиксация курса при операции) |
| rate_source_config | JSON | endpoint, обновление, fallback | nullable | Q5 |
| **Шаблоны экспортов:** |  |  |  |  |
| fiu_export_template | JSON | Состав полей Excel-реестра СПО/ПО | да | Q5 |
| client_card_export_template | JSON | Шаблон выгрузки карточки клиента | nullable | — |
| **SLA-настройки уведомлений:** |  |  |  |  |
| sla_warning_hours_before | int | За сколько часов до дедлайна предупреждать | да | стр. 166–172 |
| **Прочее:** |  |  |  |  |
| client_portal_subdomain | string | Сабдомен для клиентского портала (VO/FVP) | nullable | — |
| office_address_for_paper_orders | text | Адрес для бумажных поручений (Q14) | nullable | Q14 |
| support_email, support_phone | string | Контакты поддержки клиентов | nullable | — |
| created_at, updated_at | datetime | — | да | — |

**Изменения логируются** в AuditEvent через action `tenant.settings_updated` с полным diff в old_value/new_value.

---

## 2.1.6 RiskSettings

**Назначение:** все настройки риск-модели per-tenant с версионированием. Содержит пороги (Q1) и веса критериев (Q3). Влияет на риск-домен 2.4.

### Атрибуты

| Имя | Тип | Описание | Обязательность | Q-привязка |
|---|---|---|---|---|
| id | int (PK) | — | да | — |
| tenant_id | int (FK Tenant) | — | да | — |
| **Версионирование:** |  |  |  |  |
| version | int | Возрастающий счётчик per-tenant | да | Q1 |
| effective_from | datetime | С какого момента применяется | да | Q1 |
| effective_to | datetime | До какого момента (NULL = текущая) | nullable | Q1 |
| approved_by_user_id | int (FK User) | Кто утвердил (COMPLIANCE_HEAD) | да | Q1 |
| approved_at | datetime | — | да | Q1 |
| **Привязка к ПВК:** |  |  |  |  |
| policy_document_id | int (FK PolicyDocument) | Конкретная редакция ПВК | да | Q1 (защита) |
| **Параметры (раскрываются в JSON по группам):** |  |  |  |  |
| risk_basic_weights | JSON | Веса критериев Приказа 61/п (Q3 уровень 1) | да | Q3 |
| risk_basic_thresholds | JSON | Пороги «низкий/средний/высокий/критический» | да | Q3 |
| risk_advanced_vasp_weights | JSON | Веса 4-блочной модели A+B+C+D (Q3 уровень 2) | nullable (только если включён модуль) | Q3 |
| dropper_thresholds | JSON | Пороги дроппер-детектора (Q1) | да | Q1 (стр. 128–129) |
| splitting_thresholds | JSON | Пороги дробления (Q1) | да | Q1 (стр. 126) |
| threshold_operations | JSON | Пороги пороговых операций (по типам активов/счетов) | да | Q1, стр. 176 |
| night_time_window | JSON | Часовой диапазон «ночного времени» + TZ | да | Q1 (стр. 127) |
| override_triggers_list | JSON | Список override-триггеров по Q4 | да | Q4 |

**Версионирование как механизм:**

```
v1: effective_from=2026-01-01, effective_to=2026-04-15  (старая редакция ПВК)
v2: effective_from=2026-04-15, effective_to=NULL        (текущая)
```

При пересчёте исторического скоринга используется та версия, которая была effective на момент исходной оценки. Это критично для Q3 — «при пересмотре методики предыдущая редакция сохраняется».

**Регуляторные привязки:**
- стр. 178–181 — расчёт риск-уровня
- стр. 182–186 — новые критерии 26/п (входят в `dropper_thresholds`, `risk_basic_weights`)

---

## 2.1.7 RetentionPolicy

**Назначение:** конфигурация retention per-tenant + индивидуальные продления для конкретных записей (Q12).

### Атрибуты RetentionPolicy (per-tenant)

| Имя | Тип | Описание | Q-привязка |
|---|---|---|---|
| id | int (PK) | — | — |
| tenant_id | int (FK Tenant), unique | — | — |
| default_retention_years | int (default=7) | По умолчанию 7 лет (Q12) | Q12 |
| pre_purge_grace_days | int (default=30) | Soft-delete окно перед физическим удалением | Q12 |
| **Категориальные override** (если для категории нужен иной срок): |  |  |
| category_overrides | JSON `{ "audit_logs": 10, "fiu_messages": 7 }` | Точечные исключения | Q12 |
| **Приостановка purge:** |  |  |  |
| global_purge_paused | bool | На весь tenant (например, во время расследования) | Q12 |
| global_purge_pause_reason | text | Основание | Q12 |

### Сущность RetentionExtension (per-record)

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| target_entity_type | string(50) | Какой тип сущности продлевается |
| target_entity_id | int | id записи |
| original_retention_until | datetime | Изначальная дата истечения |
| extended_retention_until | datetime | Новая дата |
| reason | text | Основание (запрос ФР, расследование, судебное дело) |
| approved_by_user_id | int (FK User) | Кто продлил (минимум COMPLIANCE_HEAD) |
| approved_at | datetime | — |
| basis_doc_ref | string | Документ-основание (ID запроса ФР, № дела) |

**Workflow purge:**
1. Background scheduler `purge_scan` (еженедельно) находит записи где `retention_until < now() AND not in pending_deletion`.
2. Помечает их `pending_deletion = true`, `pending_deletion_at = now()`.
3. Через `pre_purge_grace_days` дней (по умолчанию 30) — физическое удаление.
4. После физического удаления — запись метаинформации в `retention_purge_log` (бессрочно): `{tenant_id, entity_type, entity_id, original_retention_until, purged_at, purged_by_system}`.

---

## 2.1.8 PolicyDocument

**Назначение:** регистрация ПВК (правил внутреннего контроля) tenant'а с версионированием. Используется для привязки изменений `RiskSettings` (Q1, Q3, Q4) к утверждённой редакции ПВК.

### Атрибуты

| Имя | Тип | Описание | Обязательность |
|---|---|---|---|
| id | int (PK) | — | да |
| tenant_id | int (FK Tenant) | — | да |
| document_type | enum | `pvk_aml` / `pvk_kyt` / `pvk_risk_methodology` / `external_audit_report` | да |
| version | string | Версия (например, "1.3") | да |
| approved_at | datetime | Дата утверждения | да |
| approved_by | string(255) | ФИО руководителя tenant'а (текстом, для исторической точности) | да |
| document_path | string | Путь к загруженному файлу (PDF) | да |
| document_hash | string(64) | SHA-256 файла (для проверки целостности) | да |
| effective_from | datetime | С какой даты действует | да |
| superseded_by_id | int (FK PolicyDocument) | Если заменён более поздней редакцией | nullable |
| created_at, created_by_user_id | — | Кто загрузил | да |

**Связь с RiskSettings:** каждая запись `RiskSettings.policy_document_id` ссылается на `PolicyDocument`. Невозможно создать `RiskSettings` без действующего `PolicyDocument` соответствующего типа — ограничение защищает Q1/Q3 от изменения параметров без обновления ПВК.

---

## 2.1.9 Notification

**Назначение:** общая инфраструктура уведомлений сотрудников tenant'а и клиентов. Не путать с регуляторной отчётностью (домен 2.5).

### Атрибуты

| Имя | Тип | Описание | Обязательность |
|---|---|---|---|
| id | int (PK) | — | да |
| tenant_id | int (FK Tenant) | — | да |
| recipient_user_id | int (FK User) | Адресат (один из: User или client_id для CLIENT-роли) | nullable |
| recipient_role | enum | Если адресат — роль (broadcast: все COMPLIANCE_OFFICER) | nullable |
| recipient_client_id | int (FK Client) | Если адресат — клиент tenant'а через email | nullable |
| **Содержание:** |  |  |  |
| category | enum | `sla_warning` / `override_alert` / `rfi_request` / `rfi_response` / `freezing_notification` / `regulator_request_received` | да |
| subject | string(255) | Заголовок | да |
| body | text | Текст (с шаблоном для мультиязычности) | да |
| body_template_key | string(100) | Ключ шаблона для i18n | nullable |
| body_template_params | JSON | Параметры подстановки | nullable |
| **Канал и доставка:** |  |  |  |
| channel | enum | `in_app` / `email` / `sms` / `push` (последние две — из v2) | да |
| status | enum | `pending` / `sent` / `delivered` / `read` / `failed` / `expired` | да |
| sent_at | datetime | — | nullable |
| read_at | datetime | — | nullable |
| failed_reason | text | — | nullable |
| **Связь с источником:** |  |  |  |
| source_entity_type | string(50) | Тип сущности-инициатора (`fiu_message`, `rfi_request`, ...) | nullable |
| source_entity_id | int | id сущности-инициатора | nullable |
| **Сервисное:** |  |  |  |
| created_at | datetime | — | да |
| expires_at | datetime | Дедлайн актуальности | nullable |

**Каналы (MVP):**
- `in_app` — встроенный feed уведомлений в UI ComplianceDesk (бейдж + список); read-status хранится
- `email` — для критичных событий (SLA на грани, override, регуляторный запрос) дублируется на email
- `sms`, `push` — отложены на v2

**Связи с другими доменами:**
- SLA-уведомления по СПО/ПО — генерируются доменом 2.5 (FIU) при приближении дедлайна
- RFI-канал клиенту — генерируются доменом 2.2 (CDD/RFI)
- Override-алерты — генерируются доменом 2.4 (Risk)
- Регуляторные запросы — генерируются от REGULATOR_AUDITOR (стр. 220 чек-листа)

---

## 2.1.10 Локализация, часовые пояса и валюты

### Часовые пояса

**Решение:** все timestamp в БД — UTC. Отображение — в TZ tenant'а или User'а.

| Уровень | Поле | Применение |
|---|---|---|
| Tenant | `Tenant.timezone` (default `Asia/Bishkek`) | По умолчанию для всех пользователей tenant'а; используется в SLA-расчётах (например, «не позднее 16:00 — относительно какого TZ?» — TZ tenant'а) |
| User | `User.timezone` (override, nullable) | Для отображения интерфейса персонально (например, REGULATOR_AUDITOR в Москве, tenant в Бишкеке) |
| Operation | `transaction.executed_at` (UTC) | Время фиксации операции; tenant видит в `Asia/Bishkek` |
| Audit | `AuditEvent.created_at` (UTC) | Глобально UTC; отображение в TZ просмотрщика |

**SLA-таймеры** считаются в TZ tenant'а — это критично для cutoff 16:00 (стр. 172) и «ночного времени» дроппер-детектора (Q1). Helper-функция `business_hours_in_tz(tenant_tz)` определяет рабочие часы и праздники КР.

### Языки интерфейса

**Минимум для MVP (KG-инсталляции):**
- `ru` — русский (основной для KG)
- `ky` — кыргызский (требование локального регулирования)

**Опционально для FVP / международных клиентов:**
- `en` — английский (для REGULATOR_AUDITOR из других юрисдикций, для FVP-клиентов)

**Реализация:**
- Все user-facing строки — через словари (i18n keys) с тремя файлами `ru.json`, `ky.json`, `en.json`
- Шаблоны уведомлений (`Notification.body_template_key`) переводятся на стороне клиента
- Регуляторные тексты (анкеты, формулировки прав) — отдельные блоки, переводятся официальным переводом
- Auto-detect языка пользователя — по `User.language` или `Tenant.primary_language`

### Валюты

**Решение:** деньги — всегда `amount` (Decimal) + `currency` (ISO-4217). Никаких неявных конверсий в коде.

**Канонические валюты:**
- `KGS` — основная (для KG-tenant'ов)
- `USD`, `EUR`, `RUB`, `USDT` — опериационные
- Дополнительные — настраиваются в `TenantSettings.allowed_currencies`

**Конверсии:**
- Курс фиксируется на момент события (Q5: курс USDT/KGS на момент исполнения операции)
- Источник курса — `TenantSettings.rate_source_usdt_kgs` (Q5)
- Все исторические курсы хранятся в отдельной таблице `exchange_rates_history` (проектируется в 2.3)
- Конверсия — только через явную функцию `convert(amount, from_currency, to_currency, at_datetime)` с указанием источника

---

## Соответствие чек-листу 01-regulatory-checklist.md

Подшаг 2.1 закрывает следующие строки чек-листа:

| Строка | Тема | Закрытие в 2.1 |
|---|---|---|
| 196 | Журнал всех изменений | AuditEvent (2.1.4) |
| 197 | ФИО+дата сотрудника | snapshot-поля в AuditEvent |
| 198 | Документация полноты | action `client.anketa_verified` |
| 199 | Журнал санкционных проверок | будет ссылаться на AuditEvent (раскрывается в 2.4) |
| 200 | Результаты верификации | entity_type = `verification_session` (2.2) |
| 201 | Журнал цифровой идентификации | отдельная таблица + дубль в AuditEvent (2.2) |
| 202 | Доступ к базе БВ | action `data.read` (2.2) |
| **203** | **Защита от удаления логов** | **hash-chain + Postgres-триггер (2.1.4)** |
| 204 | RBAC по ролям | матрица 2.1.3 |
| 205 | Доступ службы внутреннего контроля | роли COMPLIANCE_HEAD/OFFICER |
| 206 | Мульти-тенантность | row-level + защитные механизмы (2.1.1) |
| 207 | Защищённые каналы связи | TenantSettings.idv/kyt provider configs |
| 208 | MFA для сотрудников | поля `mfa_*` в User (2.1.2) |
| 220 | Принимать запросы регулятора | роль REGULATOR_AUDITOR + RFI/Notification (2.1.3, 2.1.9) |
| 221 | Не препятствовать проверке | роль REGULATOR_AUDITOR с read-only по матрице |
| 175 | Журнал СТР ≥ 5 лет | RetentionPolicy default=7 (2.1.7) |
| 189–195 | Хранение ≥ 5 лет | RetentionPolicy + RetentionExtension (2.1.7) |
| 114g5 | Audit trail запросов к внешним провайдерам | action `external_provider.called` в AuditEvent |
| 114g6 | Retention данных через внешний custody | RetentionPolicy с категорией `external_provider_calls` |

---

## Открытые вопросы 2.1

Все вопросы требуют решения **до перехода к 2.2** или явно выноса в более поздний шаг.

### Q-2.1-A. Имя enum'а для ролей при миграции

В существующем коде enum называется `UserRole` со значениями SUPER_ADMIN/COMPANY_ADMIN/COMPLIANCE_OFFICER/MANAGER/READ_ONLY. На 2.1 предлагается переименовать `COMPANY_ADMIN → TENANT_ADMIN`, `MANAGER → BACK_OFFICE_OPERATOR`, добавить новые роли. Это ломающая миграция (alembic + ручное обновление существующих записей).

**Требуется решение:** делать миграцию сразу на шаге 4, или выпустить совместимость с алиасами enum (старые имена → новые)?

### Q-2.1-B. Признак «vendor-tenant» для SUPER_ADMIN

SUPER_ADMIN — единственная роль вне конкретного tenant'а (вендор, обслуживающий все tenants). Текущая модель не различает «User вендора» и «User tenant'а». Предлагается:

- (а) Виртуальный «vendor-tenant» (tenant_id=0 или dedicated row), все SUPER_ADMIN привязаны к нему;
- (б) `User.tenant_id` nullable, NULL означает «vendor-уровень»;

**Требуется решение:** какой подход. (а) проще для запросов; (б) явнее семантически.

### Q-2.1-C. Иерархия Tenant'ов (для Holding-структур)

Если ОВА входит в холдинг (несколько связанных юрлиц с общим управлением), нужна ли иерархия Tenant'ов (parent_tenant_id)? Это влияет на RBAC (TENANT_ADMIN холдинга видит все подчинённые) и на отчётность.

**Не блокирует 2.1**, но требует ответа до 2.2 (клиенты могут пересекаться между tenant'ами холдинга — БВ-связи, общие списки санкций).

### Q-2.1-D. Hash-chain — гранулярность проверки

При обнаружении разрыва hash-chain (`audit.chain_broken`) нужно ли:
- (а) полностью блокировать запись в audit для tenant'а до расследования (риск: операционная остановка),
- (б) продолжать запись, но помечать все события после разрыва как «unverified» (риск: потеря доказательной значимости).

**Текущая позиция в 2.1.4:** вариант (а) — блокировка с алертом SUPER_ADMIN. Требуется подтверждение пользователя.

### Q-2.1-E. RBAC для роли READ_ONLY — детализация

Текущая 5-ролевая модель имеет роль `READ_ONLY`. В матрице 2.1.3 она присутствует, но её сценарии использования размыты:
- Стажёр в комплаенсе?
- Внешний аудитор (НЕ ГСФР)?
- Просмотр для руководства tenant'а?

**Требуется решение:** оставить как универсальный «наблюдатель», или разделить (внутренний vs внешний; стажёр vs аудитор)? От этого зависит, видит ли READ_ONLY persistent personal data (ПДн) клиентов или только агрегаты.

### Q-2.1-F. CLIENT-роль и связь с физлицом-БВ

Может ли один CLIENT-User быть связан более чем с одним клиентом ОВА (например, директор ЮЛ + сам себя как ФЛ)? Поле `linked_client_id` сейчас 1:1.

**Требуется решение:** делать ли `User_client_links` (many-to-many)? Не блокирует 2.1, нужен ответ до 2.2.

### Q-2.1-G. Storage для документов ПВК

`PolicyDocument.document_path` указывает на файл. Где физически хранится — в БД (BYTEA), на файловой системе, в S3/MinIO?

**Не блокирует 2.1** (это решение шага 3 — архитектура). Заметка: должно быть стабильным (доступно через 7 лет retention) и поддерживать `document_hash` для проверки целостности.

### Q-2.1-H. SLA-помощник для рабочих дней КР

Нескольким доменам (FIU, Freezing) нужна функция «следующий рабочий день в КР с учётом праздников». Это сквозная утилита.

**Не блокирует 2.1**, но требует решения по источнику списка праздников (статичный список с обновлением, API НБ КР, что-то ещё). На 2.1 — фиксируется как обязательный shared-helper в каркасе.

---

# 2.2 Клиентский домен

## Контекст и границы

Этот подшаг проектирует **сущности, относящиеся к клиенту ОВА** — его идентификационные данные, бенефициарную структуру, документы, верификационные сеансы, RFI-канал и доступ в клиентский портал. Транзакции и операции — это домен 2.3; риск-скоринг — 2.4; санкционная проверка как процесс — 2.4; отчётность в ФР — 2.5.

**Что есть в коде сейчас** ([backend/app/models.py](backend/app/models.py)):
- `Client` (1 запись на клиента ОВА; client_type ∈ {individual, legal})
- `IndividualClient`, `LegalEntityClient` — расширения по 606 (утратило силу!)
- `DirectorClient` — директор ЮЛ как ФЛ
- `ClientRepresentative` — доверенное лицо
- `UBO` — БВ (без поддержки многоуровневых цепочек владения)
- `PEPRecord` + `PEPQuestionnaire` — две сущности с пересекающимися полями
- `ClientDocument` — без версионирования
- `SOFDocument` — отдельная таблица для документов источника средств
- `SumsubRecord` — kepеer-записей IDV-провайдера

**Что меняется на 2.2:**
- `Client.client_type` расширяется до 3 значений: `individual` / `legal_entity` / `vasp_counterparty` (последнее — для VASP-как-контрагента, нужен на Risk-Advanced модуле Q3)
- Анкеты ФЛ/ЮЛ ревизуются под Положение о CDD (постановление 739), таблица дельты ниже (закрытие Q8)
- Вводится `ClientLifecycleState` — отдельная FSM от существующего `OnboardingStatus`
- `client_user_link` — many-to-many связь User↔Client (Q-2.1-F resolution)
- `DirectorHistory` — историзация смены директоров ЮЛ
- `UBOEntity` — поддержка многоуровневых цепочек (UBO через несколько ЮЛ)
- `ClientDocumentVersion` — версионирование документов с retention старых версий
- `VerificationSession` — журнал цифровой идентификации с доказательным материалом (закрытие стр. 201)
- `RFIRequest` — формализованный канал запроса доп. информации
- `ClientPortalAccess` — состояния онбординга клиента в портале (для SKU VO/FVP)

**Принципы изоляции и аудита (наследуются из 2.1):**
- `tenant_id` обязательно во всех таблицах домена; row-level фильтрация
- Все изменения — через AuditEvent с hash-chain (2.1.4)
- Retention 7 лет — через RetentionPolicy (2.1.7), включая физические файлы документов

## Карта сущностей 2.2

```
                    ┌────────────────┐
                    │     Client     │ ◄─── базовая запись
                    │ (lifecycle FSM)│
                    └───────┬────────┘
                            │ 1
              ┌─────────────┼─────────────────────────────────────────────────┐
              │             │             │             │           │        │
              │ 0..1        │ 0..1        │ N           │ N         │ 1      │ 0..1
        ┌─────▼────┐ ┌──────▼─────┐ ┌─────▼────┐  ┌─────▼─────┐ ┌───▼────┐ ┌─▼──────────┐
        │Individual│ │LegalEntity │ │ Director │  │Representa-│ │PEPQues-│ │  Portal    │
        │  Client  │ │   Client   │ │  Client  │  │  tive     │ │tionn'r │ │  Access    │
        └──────────┘ └─────┬──────┘ └────┬─────┘  └───────────┘ └────────┘ └────┬───────┘
                           │ 1           │ N                                    │
                           │ N           ▼                                      │ N
                           │      ┌────────────┐                          ┌─────▼──────┐
                           │      │  Director  │                          │client_user_│
                           │      │  History   │                          │   link     │
                           │      └────────────┘                          └────────────┘
                           │ N
                           ▼
                    ┌────────────┐         ┌────────────┐
                    │    UBO     │ ◄───────┤ UBOEntity  │ ◄─── для цепочек
                    └─────┬──────┘ N    1  │(промежу-   │       многоуровневого
                          │ N              │ точные ЮЛ) │       владения
                          │                └────────────┘
                          ▼
                    ┌────────────┐
                    │ PEPRecord  │ ◄─── PEP-связи (FAMILY/ASSOCIATE)
                    └────────────┘
                            ▲
                            │ N        ┌────────────────────┐
                  ┌─────────┴─┐        │  Client (back to)  │
                  │  PEP records on    │                    │
                  │  client side       └────────────────────┘
                  └────────────────────┐
                                       │
                            ┌──────────▼──────────┐
                            │      Client         │
                            │  ──────────────     │
                            ▼                     ▼
                    ┌────────────────┐    ┌────────────────┐
                    │ ClientDocument │    │  SOFDocument   │
                    │    + versions  │    │ (отдельный)    │
                    └────────────────┘    └────────────────┘

                            ┌──────────▼──────────┐
                            │      Client         │
                            ▼                     ▼
                    ┌──────────────────┐ ┌────────────────┐
                    │ Verification     │ │  RFIRequest    │
                    │   Session        │ │                │
                    │  + Artifact      │ │                │
                    └──────────────────┘ └────────────────┘
```

---

## 2.2.1 Client (базовая сущность)

**Назначение:** одна запись на каждого клиента ОВА (физлицо, юрлицо или VASP-контрагент). Все остальные сущности 2.2 привязаны к `Client.id`.

### Атрибуты

| Имя | Тип | Описание | Обязательность | Связь с чек-листом |
|---|---|---|---|---|
| id | int (PK) | — | да | — |
| tenant_id | int (FK Tenant) | Изоляция | да | стр. 206 |
| **Тип и состояние:** |  |  |  |  |
| client_type | enum | `individual` / `legal_entity` / `vasp_counterparty` | да | определяет какое расширение применимо |
| lifecycle_state | enum | См. FSM ниже | да | — |
| onboarding_status | enum | `pending` / `in_progress` / `approved` / `rejected` / `suspended` (legacy в коде) | да | сохраняется для совместимости |
| **Договор:** |  |  |  |  |
| contract_number | string(50) | Номер договора с клиентом | nullable | в коде есть |
| contract_date | datetime | Дата договора | nullable | — |
| relationship_started_at | datetime | Дата фактического начала отношений | nullable | базис для retention 7 лет |
| relationship_ended_at | datetime | Дата прекращения отношений | nullable | базис retention для CDD |
| **Управление:** |  |  |  |  |
| assigned_manager_user_id | int (FK User) | Закреплённый менеджер | nullable | — |
| manager_code | string(4) | 4-значный код менеджера (legacy) | nullable | — |
| **Риск (только summary, детали в 2.4):** |  |  |  |  |
| current_risk_level | enum RiskLevel | `low` / `medium` / `high` / `critical` | nullable | — |
| current_risk_score | float | Текущий балл (последний из RiskScoringHistory) | nullable | — |
| last_risk_assessed_at | datetime | — | nullable | стр. 83 (дата следующего обновления) |
| **Скрининг (только summary, детали в 2.4):** |  |  |  |  |
| last_screening_at | datetime | Последняя санкционная проверка | nullable | стр. 138 |
| **Локализация:** |  |  |  |  |
| preferred_language | enum | `ru` / `ky` / `en` | nullable | — |
| **Сервисное:** |  |  |  |  |
| notes | text | Внутренние комментарии офицера | nullable | — |
| created_at, updated_at | datetime | — | да | — |
| created_by_user_id | int (FK User) | Кто создал | да | — |
| archived_at, archived_by, archive_reason | — | Soft-archive поля (legacy) | nullable | — |
| retention_until | datetime | created_at + 7 лет, либо relationship_ended_at + 7 лет | да | Q12; стр. 189 |

### Lifecycle FSM (Client)

```
                       ┌──────────────┐
                       │  ONBOARDING  │ ◄─── создание; заполнение анкеты;
                       └──────┬───────┘       загрузка документов; верификация;
                              │ approve         санкционная проверка; первичный риск
                              ▼
                       ┌──────────────┐
                ┌────► │    ACTIVE    │ ◄─── штатное обслуживание
                │      └──┬─────┬─────┘
                │         │     │
        resume  │  suspend│     │ rfi_blocked (просрочка RFI > N дней)
                │         │     │
                │         ▼     ▼
                │      ┌──────────────┐
                ├──────┤  SUSPENDED   │ ◄─── временная блокировка (расследование,
                │      └──────┬───────┘       просрочка RFI, регуляторное основание)
                │             │
                │  resolve_rfi│  initiate_termination
                │             ▼
                │      ┌──────────────┐
                └──────┤  TERMINATING │ ◄─── процесс расторжения отношений
                       └──────┬───────┘       (закрытие операций, отчёт в ФР, экспорт)
                              │ relationship_ended
                              ▼
                       ┌──────────────┐
                       │   ARCHIVED   │ ◄─── retention 7 лет; доступ только
                       └──────┬───────┘       для регулятора и расследований
                              │ retention_expired
                              ▼
                       ┌──────────────┐
                       │   PURGED     │ ◄─── физическое удаление (Q12)
                       └──────────────┘
```

| Переход | Условие | Кто инициирует | Audit action |
|---|---|---|---|
| `onboarding → active` | Анкета заполнена, верификация пройдена, санкции чисты, RiskSettings применены | COMPLIANCE_OFFICER (для low/med) или COMPLIANCE_HEAD (для high) | `client.approved` |
| `active → suspended` | Запрос RFI просрочен / расследование / стр. 171 (отказ/прекращение) | COMPLIANCE_OFFICER+ | `client.suspended` |
| `suspended → active` | Закрытие основания | COMPLIANCE_OFFICER+ | `client.unsuspended` |
| `* → terminating` | Расторжение отношений (по инициативе клиента или ОВА) | COMPLIANCE_HEAD | `client.termination_started` |
| `terminating → archived` | Все операции завершены, СПО (если требовалось) отправлено, экспорт выдан клиенту | COMPLIANCE_HEAD + автоматический check | `client.archived` |
| `archived → purged` | По истечении retention_until через scheduled job | system | `system.retention_purged` |

> **Замечание:** существующее поле `onboarding_status` сохраняется для совместимости — это подсостояние `lifecycle_state = ONBOARDING`. На шаге 4 при миграции возможна их интеграция в одну FSM.

### Регуляторные привязки

- Стр. 206 — мульти-тенантность через `tenant_id`
- Стр. 171 — `lifecycle_state = SUSPENDED` для отказа/прекращения/приостановления отношений (триггер СТР, домен 2.5)
- Стр. 189 — retention 7 лет с момента прекращения отношений (`relationship_ended_at + 7 years` для CDD-категории)

---

## 2.2.2 client_user_link (Q-2.1-F resolution)

**Назначение:** many-to-many связь между `User` (роль `CLIENT`) и `Client`-сущностью. Позволяет одному User быть связанным с несколькими Client-сущностями (например, директор ЮЛ + сам себя как ФЛ).

### Атрибуты

| Имя | Тип | Описание | Обязательность |
|---|---|---|---|
| id | int (PK) | — | да |
| tenant_id | int (FK Tenant) | — | да |
| user_id | int (FK User) | Должен иметь role=CLIENT | да |
| client_id | int (FK Client) | — | да |
| link_type | enum | `self` / `director` / `representative` / `ubo` | да |
| granted_at | datetime | — | да |
| granted_by_user_id | int (FK User) | Кто выдал доступ (TENANT_ADMIN или COMPLIANCE_OFFICER) | да |
| revoked_at | datetime | — | nullable |
| revoked_by_user_id | int (FK User) | — | nullable |
| revocation_reason | text | — | nullable |
| **Уникальность:** UNIQUE (user_id, client_id, link_type) — защита от дублирующих связей |  |  |  |

### Семантика link_type

| link_type | Семантика | Пример |
|---|---|---|
| `self` | User представляет самого себя как клиента (для роли CLIENT при ФЛ-онбординге) | Иванов Иван — User-CLIENT, привязан к Client (individual=Иванов) |
| `director` | User управляет ЮЛ от имени директора | Иванов Иван — директор ООО «Альфа», привязан к Client (legal_entity=Альфа) с link_type=director |
| `representative` | User действует по доверенности | Сотрудник по доверенности |
| `ubo` | User является БВ (для уведомлений и подтверждений) | БВ-физлицо ЮЛ-клиента |

> Один User может иметь несколько активных связей с разными Clients — например, тот же Иванов Иван может быть `self` для своего ФЛ-аккаунта и `director` для своего ООО.

**Ограничения:**
- При revoke связи — пользователь теряет доступ к данным соответствующего Client'а в портале, но история остаётся
- При архивации `Client.lifecycle_state = ARCHIVED` — все активные связи автоматически revoked
- Изменения `client_user_link` логируются в AuditEvent через `client.access_granted` / `client.access_revoked`

---

## 2.2.3 IndividualClient (анкета ФЛ по CDD-739)

### Дельта 606 → CDD-739 (закрытие Q8)

Постановление № 606 утратило силу. Положение о CDD (постановление 739 от 14.11.2025) пришло на замену. Структура анкеты ФЛ изменилась незначительно — основные расхождения:

| Поле | В коде сейчас (по 606) | В CDD-739 (Прил. 1) | Действие |
|---|---|---|---|
| Статус резидент/нерезидент | `is_resident` (boolean) | поле 1, выбор из 2 | оставить boolean, добавить в UI выбор; семантика та же |
| ФИО | `last_name`, `first_name`, `middle_name` | поля 2-4 | без изменений |
| Дата рождения | `date_of_birth` | поле 5 | без изменений |
| Место рождения | `place_of_birth` | поле 6 | без изменений |
| Национальность | `nationality` | поле 7 | без изменений |
| Пол | `gender` | поле 8 | без изменений |
| Гражданство | `citizenship` | поле 9 | без изменений |
| Семейное положение | `marital_status` | поле 10 | без изменений |
| Документ ID | `doc_type, doc_series_number, doc_issued_at, doc_expires_at, doc_issued_by, doc_division_code` | поле 11 (6 подполей) | без изменений |
| ПИН | `pin` | поле 12 | без изменений |
| Адрес регистрации | `registration_address` (text, неструктурированный) | поле 13 (структурно: страна, область, город, район, населённый пункт, улица, дом, корпус, квартира) | **РАСШИРИТЬ:** добавить структурные подполя |
| Адрес фактический | `actual_address` (text, неструктурированный) | поле 14 (структурно — то же) | **РАСШИРИТЬ:** аналогично |
| Контакты | `phone_home, phone_work, phone_mobile, fax, email` | поле 15 (3 подполя) | без изменений |
| Документ нерезидента | `foreign_doc_*` | поле 16 (4 подполя: тип, номер, даты валидности) | без изменений; добавить enum выбора {ВНЖ, разрешение, виза} |
| Цель отношений | `business_purpose` | поле 17 | без изменений |
| ПДЛ-флаг | `is_pdl` | поле 18 | переименовать `is_pep` (FATF-стандартизация) |
| **БВ-флаг ДЛЯ ФЛ** | `has_ubo` (boolean, был в коде) | поле 19 (НОВОЕ для ФЛ в 739) | без изменений; уточнить: при `has_ubo=true` обязательно заполнение анкеты БВ |
| Документы о полномочиях | `authority_documents` | поле 20 | без изменений |
| ИП-блок | `is_individual_entrepreneur, ie_*` (12 полей) | поля 21-22 | без изменений |
| Банковский счёт | `bank1_*` (6 полей) | в 739 не упомянут как обязательный для ФЛ | оставить опциональным |
| Глава 3 «Верификация» | `verification_*, sanctions_check_*, criminal_list_check_*, risk_justification, next_update_date, db_entry_*` | в 739 верификация — отдельный процесс (см. VerificationSession 2.2.12) | **ВЫНЕСТИ:** оставить только summary-поля в IndividualClient, основные детали — в `VerificationSession` |

**Итого:** структурно дельта минимальна. Главные изменения:
1. Структурирование адресов (поля 13, 14)
2. Переименование `is_pdl → is_pep`
3. Вынос верификации в отдельную сущность `VerificationSession`

### Атрибуты IndividualClient (после CDD-739)

| Группа | Поля (имена + краткое описание) | Регуляторная привязка |
|---|---|---|
| **Связь с Client** | `client_id` (FK Client, unique) | — |
| **Резидентство** | `is_resident` (bool) | стр. 1 (поле 1) |
| **ФИО** | `last_name`, `first_name`, `middle_name` | стр. 2-4 |
| **Персональные данные** | `date_of_birth`, `place_of_birth`, `nationality`, `gender`, `citizenship`, `marital_status` | стр. 3-5 (поля 5-10) |
| **Документ** | `doc_type` (enum: passport_kg, passport_foreign, id_card_kg, birth_certificate, military_id, driver_license, residence_permit, refugee_certificate), `doc_series_number`, `doc_issued_at`, `doc_expires_at`, `doc_issued_by`, `doc_division_code` | стр. 6 (поле 11), стр. 39 |
| **ПИН** | `pin` | стр. 7 (поле 12) |
| **Адрес регистрации (структурно)** | `reg_country`, `reg_region`, `reg_city`, `reg_district`, `reg_settlement`, `reg_street`, `reg_house`, `reg_building`, `reg_apartment` | стр. 8 (поле 13) |
| **Адрес фактический (структурно)** | `actual_country`, `actual_region`, ..., `actual_apartment` | стр. 9 (поле 14) |
| **Контакты** | `phone_home`, `phone_work`, `phone_mobile`, `fax`, `email` | стр. 10 (поле 15) |
| **Иностранный гражданин** | `foreign_doc_type` (enum: residence_permit, temp_permit, visa), `foreign_doc_series_number`, `foreign_doc_valid_from`, `foreign_doc_valid_to` | стр. 11 (поле 16) |
| **Деловой профиль** | `business_purpose` (text — цель отношений) | стр. 12 (поле 17) |
| **PEP** | `is_pep` (bool) | стр. 13 (поле 18); если true → создаётся PEPQuestionnaire (2.2.9) |
| **БВ для ФЛ (НОВОЕ в 739)** | `has_ubo` (bool) | стр. 14 (поле 19); если true → требуется UBO-запись (2.2.8) |
| **Полномочия** | `authority_documents` (text) | стр. 15 (поле 20) |
| **ИП-блок** | `is_individual_entrepreneur` + `ie_*` (12 полей) | стр. 16-17 (поля 21-22) |
| **Banking (опционально)** | `bank1_*` (6 полей) | — |
| **Verification summary** (детали в VerificationSession) | `verification_status` (enum: not_started, in_progress, passed, failed, requires_manual_review), `last_verified_at`, `next_review_date` | стр. 200 (журнал результатов верификации) |

**Связи:**
- `client` ← Client (1:1)
- (логическая) `pep_questionnaire` ← PEPQuestionnaire когда is_pep=true
- (логическая) `ubo_self` ← UBO когда has_ubo=true (БВ-физлицо самого ФЛ — родитель/опекун/попечитель и т.д.)

---

## 2.2.4 LegalEntityClient (анкета ЮЛ по CDD-739)

### Дельта 606 → CDD-739

| Поле | В коде сейчас (по 606) | В CDD-739 (Прил. 2) | Действие |
|---|---|---|---|
| Статус резидент/нерезидент | `is_resident` | поле 1 | без изменений |
| Полное наименование | `full_name` | поле 2 | без изменений |
| Сокращённое наименование | `short_name` | поле 3 | без изменений |
| Иностранное наименование | `name_foreign` | поле 4 | без изменений |
| ОПФ | `legal_form` | поле 5 | без изменений |
| ИНН резидент/нерезидент | `inn_resident`, `inn_nonresident` | поля 6-7 | без изменений |
| Регистрация | `reg_date`, `reg_number`, `reg_authority`, `legal_address` | поле 8 | без изменений |
| Юридический адрес (структурно) | `legal_address` (text) | поле 8 (структура: страна, область, город, район, улица, дом, корпус, квартира) | **РАСШИРИТЬ:** структурные подполя |
| Соцфонд | `social_fund_reg_number` | поле 9 | без изменений |
| ОКПО | `okpo_code` | поле 10 | без изменений |
| Деятельность | `activity_type`, `main_activities` | поле 11, 23 | без изменений |
| Форма собственности | `ownership_form` | поле 12 | без изменений |
| БИК (банки) | `bank_id_code` | поле 13 | без изменений |
| Контакты | `phone_*`, `fax`, `email`, `actual_address` | поле 14 | оставить как есть |
| **Структура управления + члены** | `management_structure` (JSON), `governing_body_name`, `governing_body_members` | поле 15 (НОВЫЙ обязательный блок в 739) | **ОСТАВИТЬ JSON, формализовать** через DirectorClient (2.2.6) с `position` и историю DirectorHistory |
| **Доверенные лица с правом подписи** | `authorized_signatories` (text) | поле 15 (НОВОЕ обязательный блок в 739) | **ВЫНЕСТИ В ClientRepresentative** (2.2.7) с `link_type='signatory'` |
| Документы полномочий | `authority_doc_details` | поле 16 | без изменений |
| **Уставный капитал — два значения** | `authorized_capital` (text) | поле 17 (зарегистрированный + оплаченный — РАЗДЕЛЬНО) | **РАЗДЕЛИТЬ:** `authorized_capital_registered`, `authorized_capital_paid` |
| **Физическое присутствие в КР** | (нет в текущей модели) | поле 18 (НОВОЕ в 739) | **ДОБАВИТЬ:** `has_physical_presence_kg` (bool) |
| Филиалы | `branches_info` | поле 19 | без изменений; формализовать как JSON-массив |
| БВ-флаг + резидентство | `has_ubo`, `ubo_is_resident` | поле 20 | без изменений |
| ПДЛ в структуре | `has_pdl_in_structure` | поле 21 | переименовать `has_pep_in_structure` |
| Лицензия | `license_*` (6 полей) | поле 22 | без изменений |
| Цель отношений | `business_purpose` | поле 24 | без изменений |
| Banking (банковские счета ЮЛ) | `bank1_*`, `bank2_*` (12 полей) | в 739 для ЮЛ-клиента не обязательно как поле анкеты | оставить опциональным |
| Глава 4 «Верификация» | `verification_*`, `sanctions_check_*` etc. | в 739 — отдельная сущность | **ВЫНЕСТИ:** в `VerificationSession` |

**Итого изменений в LegalEntityClient:**
1. Структурирование `legal_address`
2. Раздельные поля для зарегистрированного и оплаченного капитала
3. Новое поле `has_physical_presence_kg`
4. Перевод `authorized_signatories` в формальную сущность `ClientRepresentative` (с link_type='signatory')
5. Переименование `has_pdl_in_structure → has_pep_in_structure`
6. Вынос верификации в отдельную сущность

### Атрибуты LegalEntityClient (после CDD-739)

| Группа | Поля | Регуляторная привязка |
|---|---|---|
| **Связь с Client** | `client_id` (FK Client, unique) | — |
| **Резидентство** | `is_resident` | стр. 18 (поле 1) |
| **Наименования** | `full_name`, `short_name`, `name_foreign` | стр. 19-20 (поля 2-4) |
| **ОПФ** | `legal_form` | стр. 21 (поле 5) |
| **ИНН** | `inn_resident`, `inn_nonresident` | стр. 22 (поля 6-7) |
| **LEI** (legacy, опционально) | `lei` | — |
| **Регистрация** | `reg_date`, `reg_number`, `reg_authority` | стр. 23 (поле 8) |
| **Юридический адрес (структурно)** | `legal_country`, `legal_region`, `legal_city`, `legal_district`, `legal_street`, `legal_house`, `legal_building`, `legal_apartment` | стр. 24 (поле 8) |
| **Соцфонд / ОКПО** | `social_fund_reg_number`, `okpo_code` | стр. 25-26 (поля 9-10) |
| **Деятельность** | `activity_type`, `main_activities`, `additional_activities` | стр. 27 (поля 11, 23) |
| **Форма собственности** | `ownership_form` | стр. 28 (поле 12) |
| **БИК** | `bank_id_code` (только для банков) | стр. 29 (поле 13) |
| **Контакты** | `phone_work`, `phone_mobile`, `fax`, `email`, `actual_address` (text) | стр. 30 (поле 14) |
| **Структура управления** | `management_structure` (JSON: список органов и членов; авторитетный источник — связи DirectorClient + DirectorHistory) | стр. 31 (поле 15) |
| **Документы полномочий** | `authority_doc_details` (text) | стр. 33 (поле 16) |
| **Уставный капитал (раздельно)** | `authorized_capital_registered` (Decimal), `authorized_capital_paid` (Decimal), `authorized_capital_currency` (string ISO) | стр. 34 (поле 17) |
| **Физическое присутствие в КР** | `has_physical_presence_kg` (bool) | стр. 35 (поле 18, новое в 739) |
| **Филиалы / представительства** | `branches` (JSON-массив: {name, address, country, registered_at}) | стр. 36 (поле 19) |
| **БВ-флаг** | `has_ubo` (bool, default true для ЮЛ), `ubo_is_resident` (bool) | стр. 37 (поле 20) |
| **PEP в структуре** | `has_pep_in_structure` (bool) | стр. 38 (поле 21) |
| **Лицензия** | `license_type`, `license_number`, `license_issued_at`, `license_issued_by`, `license_expires_at`, `license_activities` | стр. 37 (поле 22) |
| **Цель отношений** | `business_purpose` | стр. 38 (поле 24) |
| **Banking (опционально)** | `bank1_*`, `bank2_*` (12 полей) | — |
| **Verification summary** | `verification_status`, `last_verified_at`, `next_review_date` | стр. 200 |

---

## 2.2.5 VASPCounterparty (новая сущность)

**Назначение:** дополнительная анкета для клиента-VASP (контрагент-оператор виртуальных активов). Заполняется в дополнение к `LegalEntityClient`, активируется при `Client.client_type = vasp_counterparty`. Используется на VASP-Advanced риск-модели (Q3 уровень 2).

### Атрибуты

| Группа | Поля | Назначение |
|---|---|---|
| **Связь** | `client_id` (FK Client, unique), `legal_entity_client_id` (FK LegalEntityClient, unique) | базовая ЮЛ-анкета обязательна |
| **Лицензия VASP** | `vasp_license_number`, `vasp_license_jurisdiction` (string ISO-3166), `vasp_license_issued_at`, `vasp_license_expires_at`, `vasp_license_status` (enum: active, expired, suspended, revoked, none) | критично для override A2.5 (Q4) |
| **Регуляторный надзор** | `regulator_name`, `regulator_jurisdiction`, `last_regulatory_inspection_at`, `regulatory_findings_summary` (text) | блок A risk-модели |
| **Услуги** | `services_offered` (JSON: array of {service_type ∈ {trading, exchange, transfer, custody, emission}, since}) | соответствие ст. 26 ЗВА |
| **Обслуживаемые активы** | `supported_assets` (JSON: array of {ticker, network, type ∈ {coin, stablecoin, token, nft}}) | блок B риск-модели |
| **Объёмы / клиентская база** | `monthly_volume_usd_estimate`, `client_count_estimate`, `daily_active_clients_estimate` | для калибровки риска и override C1 |
| **AML/KYT-провайдер** | `kyt_provider_used` (enum), `kyt_provider_contract_ref` | блок D risk-модели |
| **Audit trail** | `last_external_audit_at`, `auditor_name`, `audit_report_doc_id` (FK ClientDocument) | блок D |

**Связи:**
- `legal_entity_client` ← LegalEntityClient (1:1)
- Используется доменом 2.4 (Risk-Advanced)

---

## 2.2.6 DirectorClient + DirectorHistory

### DirectorClient

**Назначение:** ФЛ-директор ЮЛ-клиента (для каждого активного директора — отдельная запись). Существует в коде; здесь — формализация и добавление историзации.

**Изменения относительно текущей модели:**
- Добавляется `lifecycle_state` ∈ {active, terminated} — для разграничения текущих и исторических директоров
- Добавляется `terminated_at`, `terminated_reason` — для трекинга смены директоров
- Добавляется `replaced_by_director_id` (FK DirectorClient, nullable) — цепочка смены
- Добавляется `appointment_doc_id` (FK ClientDocument, nullable) — приказ о назначении
- Поле `position` уточняется enum'ом ({general_director, executive_director, ceo, board_chairman, member_of_board, other})

**Атрибуты (только новое + изменения):**

| Группа | Поля |
|---|---|
| Прежние поля | (наследуются из текущего `DirectorClient`: ФИО, документ, адрес, контакты, и т.д.) |
| **Назначение** | `position` (enum), `appointment_date`, `appointment_doc_id` (FK ClientDocument) |
| **Прекращение** | `lifecycle_state` (active/terminated), `terminated_at`, `terminated_reason`, `replaced_by_director_id` |
| **Verification** | `verification_session_id` (FK VerificationSession, nullable) — последний верификационный сеанс директора |

### DirectorHistory (новая сущность)

**Назначение:** иммутабельный лог смен директоров для ЮЛ-клиента. Запись создаётся при каждом изменении состава директоров — переход из active в terminated, новое назначение, ротация.

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| client_id | int (FK Client) | ЮЛ-клиент |
| director_id | int (FK DirectorClient) | Директор-фигурант |
| event_type | enum | `appointed` / `terminated` / `position_changed` / `replaced` |
| event_date | datetime | Фактическая дата события (по приказу) |
| event_doc_id | int (FK ClientDocument) | Подтверждающий документ |
| previous_director_id | int (FK DirectorClient, nullable) | При замене |
| recorded_at | datetime | Когда зафиксировано в системе |
| recorded_by_user_id | int (FK User) | — |

> Дублируется с AuditEvent — но AuditEvent работает с любыми сущностями, а DirectorHistory оптимизирована под бизнес-вопрос «кто был директором ЮЛ на дату X». Полезна для регуляторных запросов, ретроспективных проверок риск-модели и расследований.

---

## 2.2.7 ClientRepresentative

**Назначение:** доверенное лицо клиента — действующее по доверенности или доверительному управлению. Существует в коде; здесь — расширение для покрытия требования стр. 32 (CDD-739 поле 15: «Сведения о лицах, имеющих право подписи»).

### Изменения относительно текущей модели

- Добавляется `link_type` ∈ {power_of_attorney, trust_management, signatory, other}
- Добавляется `lifecycle_state` ∈ {active, expired, revoked, terminated}
- `authority_scope` структурируется через JSON: `{can_create_orders: bool, can_sign_contracts: bool, can_request_withdrawals: bool, max_amount_usd: number, allowed_operation_types: [...]}`
- Добавляется `linked_user_id` (FK User, nullable) — если представитель имеет CLIENT-аккаунт через `client_user_link`

### Атрибуты (расширения)

| Группа | Поля |
|---|---|
| **Связь** | `client_id` (FK Client), `linked_user_id` (FK User, nullable), `link_type` |
| Прежние поля | (наследуются: ФЛ/ЮЛ-доверитель, документ, контакты) |
| **Доверенность** | `authority_doc_number`, `authority_doc_date`, `authority_doc_expires_at`, `authority_doc_notary`, `authority_doc_id` (FK ClientDocument), `authority_scope` (JSON) |
| **Lifecycle** | `lifecycle_state`, `revoked_at`, `revoked_by_user_id`, `revoked_reason` |
| **Verification** | `verification_session_id` (FK VerificationSession, nullable) |

**Регуляторная привязка:** стр. 32 (CDD-739 поле 15), стр. 33 (документы о полномочиях, поле 16).

---

## 2.2.8 UBO + UBOEntity (для многоуровневых цепочек)

### UBO (бенефициарный владелец — физлицо)

**Назначение:** ФЛ, признанное БВ ЮЛ-клиента (или ФЛ-клиента с link через `has_ubo` для ИП и т.п.). Существует в коде; здесь — расширение под Положение об эл. базе БВ ЮЛ.

**Изменения относительно текущей модели:**
- Добавляется `recognition_criteria_codes` (JSON: array of int) — коды 16 критериев из Положения об эл. базе БВ (вместо размытого текста), пример `[1, 8]` = «25%+ владение» + «через семейные отношения»
- Добавляется `recognition_criteria_details` (JSON: dict {code: details_text}) — текстовые пояснения по каждому коду
- Добавляется `parent_ubo_entity_id` (FK UBOEntity, nullable) — для многоуровневой структуры (через какое промежуточное ЮЛ владеет)
- Добавляется `verification_session_id` (FK VerificationSession, nullable)
- Добавляется `gosregistry_sync_status` (enum: not_synced, synced, mismatch) — статус сверки с государственной электронной базой БВ ЮЛ
- Добавляется `gosregistry_last_synced_at` (datetime)

### UBOEntity (новая сущность)

**Назначение:** промежуточное юрлицо в цепочке владения, не являющееся клиентом ОВА (т.е. не имеющее своей записи в `Client`). Используется для моделирования многоуровневых структур.

```
ОВА-клиент:        Client(legal_entity=A)
                         │ owns 100%
                         ▼
                   UBOEntity(B)  ← промежуточное ЮЛ, НЕ клиент ОВА
                         │ owns 80%
                         ▼
                   UBOEntity(C)  ← ещё одно промежуточное
                         │ owns 60%
                         ▼
                   UBO(person=Иванов Иван) ← конечный БВ
```

**Атрибуты UBOEntity:**

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| client_id | int (FK Client) | ЮЛ-клиент, в чью цепочку входит |
| name | string(255) | Полное наименование |
| legal_form | string(100) | ОПФ |
| inn | string(50) | ИНН (при наличии) |
| jurisdiction | string(3) | ISO-3166 код страны регистрации |
| registration_number | string(100) | — |
| registered_at | datetime | — |
| parent_entity_id | int (FK UBOEntity, nullable) | Если входит в более крупную цепочку |
| ownership_percentage_in_parent | float | Доля в родительской сущности |
| ownership_doc_id | int (FK ClientDocument, nullable) | Подтверждающий документ |
| created_at, updated_at | datetime | — |

### Связь с государственной базой БВ ЮЛ

Положение об эл. базе БВ ЮЛ (см. ПБВ в чек-листе) предписывает существование централизованной базы БВ. ComplianceDesk не реплицирует эту базу, но взаимодействует с ней:
- При создании UBO для нового ЮЛ-клиента — запрос в гос. базу через API/портал (вне scope 2.2 — это интеграция уровня 3-4)
- При расхождении — `gosregistry_sync_status = mismatch`, требует выяснения у клиента (через RFI)
- При обновлении нашей записи — отправка обновления в гос. базу (если предусмотрено API)

### Регуляторные привязки

- стр. 60-74 (полный набор полей БВ из Положения об эл. базе БВ)
- стр. 67 (связь БВ↔ПДЛ через `is_pep` + PEPRecord для FAMILY/ASSOCIATE)
- стр. 71 (тип влияния БВ ФЛ-клиента — `influence_type` уже в коде)
- стр. 72 (16 критериев признания) — `recognition_criteria_codes`
- стр. 73 (цепочка владения) — UBOEntity
- стр. 74 (хранение 5 лет) — RetentionPolicy

---

## 2.2.9 PEPRecord + PEPQuestionnaire (рефакторинг)

**Текущее состояние:** в коде две таблицы:
- `PEPRecord` — на каждого ПДЛ-связанного субъекта (сам клиент-ПДЛ, или член семьи, или близкое лицо)
- `PEPQuestionnaire` — анкета ПДЛ (1:1 с клиентом если он ПДЛ)
- + дублирующие поля в `UBO.pdl_*`

**Проблемы:**
- Тройное хранение информации о ПДЛ (`Client.is_pep_implicit`, `PEPRecord`, `PEPQuestionnaire`, `UBO.pdl_*`)
- Семья и близкие лица хранятся в JSON в `PEPQuestionnaire` И в `PEPRecord` параллельно

**Решение для 2.2:**

### Финальная схема:

1. **Флаг `is_pep`** на сущностях, к которым он применим: `IndividualClient.is_pep`, `DirectorClient.is_pep`, `UBO.is_pep`, `ClientRepresentative.is_pep`, `Client.has_pep_in_structure` (для ЮЛ-клиентов).

2. **PEPProfile** (вместо `PEPQuestionnaire`) — переименованная и расширенная сущность, привязанная к **любому** субъекту с PEP-статусом (не только к Client). Содержит должность, даты назначения/освобождения, источник средств ПДЛ, разрешение руководства, и т.д.

3. **PEPRelation** (вместо JSON-массивов в `PEPQuestionnaire.family_members` / `close_associates`) — отдельные записи для каждого члена семьи или близкого лица. Связь с PEPProfile + полные данные родственника/ассоциированного лица.

4. **PEPRecord** — упрощается: сохраняется только для исторической связи с UBO; на новых записях не используется (логика мигрирует в `PEPProfile` + `PEPRelation`).

### Атрибуты PEPProfile

| Группа | Поля |
|---|---|
| **Связь с субъектом (полиморфная)** | `subject_type` ∈ {individual_client, director, ubo, representative}, `subject_id` (id в соотв. таблице), `tenant_id`, `client_id` (для индекса) |
| **Тип ПДЛ** | `pep_type` ∈ {national_kg, foreign, international_org, retired (бывший)} |
| **Должность** | `position` (string), `organization` (string), `country` (ISO-3166) |
| **Даты** | `appointment_date`, `release_date` (для retired) |
| **Источник средств** | `source_of_funds` (text — детальное описание), `source_doc_ids` (JSON array of FK SOFDocument) |
| **Разрешение руководства** | `approval_required` (bool), `approval_decision` (enum: pending, granted, refused), `approved_by_user_id` (FK User, должен быть COMPLIANCE_HEAD), `approved_at`, `approval_notes`, `approval_doc_id` (FK ClientDocument) |
| **Источник идентификации** | `identified_source` (text — например, «открытая база данных ПДЛ»), `identified_at`, `verified_by_user_id` |
| **Lifecycle** | `lifecycle_state` ∈ {active, retired, revoked} |

### Атрибуты PEPRelation

| Группа | Поля |
|---|---|
| **Связь** | `pep_profile_id` (FK PEPProfile), `tenant_id`, `client_id` |
| **Тип связи** | `relation_type` ∈ {spouse, child, parent, sibling, in_law, other_family, business_associate, official_representative} |
| **Данные родственника / ассоциированного лица** | `last_name`, `first_name`, `middle_name`, `gender`, `date_of_birth`, `pin`, `citizenship` |
| **Скрининг** | `is_screened` (bool), `screening_session_id` (FK VerificationSession, опционально), `last_screened_at` |

### Регуляторные привязки

- стр. 88-93 (анкета ПДЛ, семья, близкие, разрешение руководства)
- стр. 78 (письменное разрешение руководителя — поле `approval_decision = granted` + `approved_by` = COMPLIANCE_HEAD)
- ст. 21 ч. 3 ЗАМ (источник средств ПДЛ — `source_of_funds` + `source_doc_ids`)

---

## 2.2.10 ClientDocument + ClientDocumentVersion

### Текущая схема и её ограничения

В коде `ClientDocument` имеет:
- `client_id`, `document_type`, `status`, `file_path`, `issued_at`, `expires_at`, `requested_at`, `received_at`

**Проблемы:**
- Нет версионирования: при загрузке нового скана старый затирается (или дублируется записью без связи)
- Нет связи с RFI (зачем загружен? в ответ на какой запрос?)
- Нет связи с VerificationSession (использован ли этот документ при верификации?)
- `status` слишком широкий (5 значений из текущего DocumentStatus enum) — нужны более детальные состояния

### Решение

**ClientDocument** — основная запись о документе как «логической сущности» (например, «паспорт клиента Иванов И.»).

**ClientDocumentVersion** — каждая физическая загрузка файла как версия документа. При замене документа создаётся новая версия, старая получает `superseded_at`. Все версии хранятся под retention.

### Атрибуты ClientDocument

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| client_id | int (FK Client) | — |
| document_type | enum | См. перечень ниже |
| description | string(255) | Свободное описание (например, «паспорт основной» / «паспорт дубликат») |
| linked_entity_type | enum | `client` / `director` / `representative` / `ubo` / `pep_profile` (опц.) — к какой суб-сущности относится |
| linked_entity_id | int | — |
| current_version_id | int (FK ClientDocumentVersion) | Текущая активная версия |
| earliest_issued_at | datetime | Дата выдачи (документально) |
| earliest_expires_at | datetime | Срок действия |
| status | enum | См. FSM ниже |
| created_at, created_by_user_id | — | Когда заведена логическая запись |

**Document type перечень** (расширяется на шаге 4 при миграции):

`passport_kg`, `passport_foreign`, `id_card_kg`, `birth_certificate`, `military_id`, `driver_license`, `residence_permit`, `refugee_certificate`, `power_of_attorney`, `legal_entity_charter`, `legal_entity_registration_cert`, `legal_entity_tax_cert`, `bank_card_signatures`, `appointment_order`, `license_certificate`, `audit_report`, `sof_bank_statement`, `sof_salary_certificate`, `sof_tax_return`, `sof_business_contract`, `sof_property_deed`, `sof_dividend`, `sof_inheritance`, `sof_loan`, `sof_gift`, `sof_crypto_proof`, `kyt_report`, `idv_video_recording`, `consent_personal_data`, `client_anketa_signed`, `pvk_acknowledgement`, `other`.

### Атрибуты ClientDocumentVersion

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| document_id | int (FK ClientDocument) | — |
| version_no | int | Возрастающий per document_id |
| file_path | string | Путь к физическому файлу (ссылка зависит от Q-2.1-G) |
| file_hash | string(64) | SHA-256 файла — целостность |
| file_mime | string(50) | — |
| file_size_bytes | bigint | — |
| uploaded_at | datetime | — |
| uploaded_by_user_id | int (FK User) | Может быть CLIENT-роль (через портал) |
| upload_source | enum | `staff_upload` / `client_portal` / `idv_callback` / `rfi_response` / `migration_import` |
| linked_rfi_request_id | int (FK RFIRequest, nullable) | Если в ответ на RFI |
| linked_verification_session_id | int (FK VerificationSession, nullable) | Если как доказательный материал |
| is_current | bool | True для активной версии (только одна на document_id) |
| superseded_at | datetime | Когда была заменена | nullable |
| superseded_by_version_id | int (FK ClientDocumentVersion) | На какую версию заменена | nullable |
| **OCR/extracted data** | `extracted_data` (JSON) | Извлечённые поля при OCR (для удобства; источник правды — поля анкеты) | nullable |

### FSM ClientDocument.status

```
                ┌──────────┐
                │ MISSING  │ ◄─── ожидаемый документ ещё не получен
                └────┬─────┘
                     │ uploaded (любой версии)
                     ▼
                ┌──────────┐
                │RECEIVED  │ ◄─── есть файл, ожидает проверки офицером
                └─┬──────┬─┘
    pass_review │      │ fail_review
                ▼      ▼
        ┌──────────┐ ┌──────────┐
        │ ACCEPTED │ │ REJECTED │ ◄─── требует переподачи
        └────┬─────┘ └──────────┘
             │ expires_at < now() (scheduled)
             ▼
        ┌──────────┐
        │ EXPIRED  │ ◄─── документ просрочен; client_lifecycle ставится на check
        └──────────┘
```

### Регуляторные привязки

- стр. 39-43 (типы документов для верификации)
- стр. 41 (подлинники / нотариальные копии — фиксируется в `description` или отдельном поле `copy_type`)
- стр. 42-43 (перевод иностранных документов с апостилем — отдельные версии с типом `notarized_translation`)

---

## 2.2.11 SOFDocument (источники средств)

**Решение:** оставить **отдельной сущностью** `SOFDocument`, как в текущем коде.

**Обоснование:**

| Подход | Плюсы | Минусы |
|---|---|---|
| **Отдельная сущность (выбран)** | Специальные поля (`amount`, `currency`, `period_from/to`, покрытие операций) не имеют смысла для других типов документов; статус-машина SOF (`submitted/verified/rejected`) отличается от `ClientDocument.status`; уже работает в коде | Дублирование кода с `ClientDocumentVersion` для file_path/hash; не объединяется с RFI-механизмом без явной адаптации |
| Подвид `ClientDocument` с `document_type=sof_*` | Единая модель документов; единый retention; общий механизм версионирования | Полей становится слишком много (значительная часть `null` для не-SOF документов); статус-машина усложняется до 8+ состояний |

**Связь с ClientDocumentVersion:** при замене SOF-документа — новая запись в `SOFDocument` (новая запись = новая версия). Старая остаётся со статусом `superseded` или `verified` (если уже была верифицирована и закрыла часть операций).

**Дополнения к текущей схеме:**
- `linked_pep_profile_id` (FK PEPProfile, nullable) — если SOF подтверждает источник средств ПДЛ (стр. 92)
- `linked_transactions` (JSON: array of FK Transaction) — какие операции покрывает этот документ (модель транзакций — 2.3, поэтому связь логическая до 2.3)
- `coverage_percent` — рассчитываемое поле = `amount` / Σ(transaction_volumes), которое использует SOF
- `verification_session_id` (FK VerificationSession, nullable) — связь с сеансом верификации, если документ был частью комплексной проверки

### Регуляторные привязки

- стр. 77 (запрос источника средств при высоком риске) → SOFDocument как реализация
- стр. 92 (источник средств ПДЛ) → `linked_pep_profile_id`

---

## 2.2.12 VerificationSession + VerificationArtifact

**Назначение:** журнал каждого верификационного сеанса (видеоверификации, IDV-цикла, ручной проверки офицером). Закрывает требование стр. 200-201 (журнал результатов верификации, журнал цифровой идентификации).

### VerificationSession

| Группа | Поля |
|---|---|
| **Связь** | `id` (PK), `tenant_id`, `subject_type` ∈ {individual_client, director, ubo, representative, pep_relation}, `subject_id` |
| **Провайдер (Q10)** | `idv_provider` (enum: samsab, sumsub, onfido, manual), `provider_session_id` (string — ID на стороне провайдера) |
| **Состояние** | `lifecycle_state` (см. FSM), `started_at`, `ended_at` |
| **Результат** | `result` (enum: passed, failed, manual_review_required, expired, cancelled), `confidence_score` (float 0-1), `flags` (JSON: array of {flag_type, severity, details} — например, `{flag_type: face_match_low, severity: high}`) |
| **Триггеры отказа (стр. 51)** | `rejection_reasons` (JSON array of enum: doubt_in_data, under_16, ip_not_kg, phone_not_kg, face_mismatch, gov_lookup_mismatch, video_unverifiable, suspicious_behavior, ml_tf_suspicion, high_risk_client, sanctions_match) |
| **Контекст** | `client_ip`, `client_user_agent`, `client_geolocation` (string ISO-3166 — определённая страна), `device_fingerprint` (string) |
| **Auth** | `auth_method` (enum: sms_otp, email_otp, totp), `auth_verified_at` |
| **Reviewer (для manual_review)** | `reviewed_by_user_id` (FK User, должен быть COMPLIANCE_OFFICER+), `reviewed_at`, `review_decision` (enum: approved, rejected, requires_clarification), `review_notes` |
| **Auto-extracted data** | `extracted_data` (JSON: что распозналось из документа — ФИО, дата рождения, ID и т.д.) — для сверки с ручным вводом |

### VerificationArtifact

**Назначение:** доказательный материал верификационного сеанса (видео, селфи, скан паспорта, response от госсервиса). Каждый артефакт — отдельная запись.

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| session_id | int (FK VerificationSession) | — |
| artifact_type | enum | `selfie_photo` / `selfie_video` / `liveness_video` / `doc_front_scan` / `doc_back_scan` / `gov_lookup_response` / `audio_recording` / `screenshare_recording` / `kyt_report` |
| file_path | string | Путь к физическому файлу |
| file_hash | string(64) | SHA-256 |
| file_mime | string(50) | — |
| captured_at | datetime | Время захвата материала (от провайдера) |
| stored_at | datetime | Время сохранения у нас |
| retention_until | datetime | По Q12 = stored_at + 7 лет |
| metadata | JSON | Доп. контекст (resolution видео, длительность, IP-адрес при захвате) |

### FSM VerificationSession

```
            ┌──────────────┐
            │  INITIATED   │ ◄─── сеанс начат, ожидаются артефакты
            └──────┬───────┘
                   │ artifacts_received
                   ▼
            ┌──────────────┐
            │  PROCESSING  │ ◄─── провайдер обрабатывает или ручная проверка
            └──┬─────┬──┬──┘
        passed│  fail│  │ requires_review
              ▼     │  ▼
       ┌──────────┐ │ ┌────────────────┐
       │  PASSED  │ │ │ MANUAL_REVIEW  │
       └──────────┘ │ └────┬───────┬───┘
                    │      │       │
                    │  approve     │ reject
                    │      ▼       ▼
                    │  ┌─────────┐ ┌─────────┐
                    │  │ PASSED  │ │ FAILED  │
                    │  └─────────┘ └─────────┘
                    ▼
              ┌──────────┐
              │  FAILED  │
              └──────────┘
```

### Связи

- → `IndividualClient.last_verification_session_id` / `DirectorClient.verification_session_id` / `UBO.verification_session_id` / `ClientRepresentative.verification_session_id`
- → `ClientDocumentVersion.linked_verification_session_id` (документы как доказательный материал)
- → `SOFDocument.verification_session_id`
- → AuditEvent: каждый переход FSM логируется

### Регуляторные привязки

- **стр. 200** Результаты верификации → VerificationSession.result
- **стр. 201** Журнал цифровой идентификации (фото/видео, госсервисы) → VerificationArtifact + retention 7 лет
- **стр. 44-46** Получение фото/видео реального времени, сопоставление с документом, сверка с госсервисами → VerificationArtifact с разными `artifact_type`
- **стр. 47-48** Проверка телефона/email подлинности → `auth_method` + `auth_verified_at`
- **стр. 51** Отказ по триггерам → `rejection_reasons`
- **стр. 52** Определение IP клиента → `client_ip`, `client_geolocation`
- **стр. 53** Liveness-защита → `flags.liveness_detected`
- **стр. 54** MFA → `auth_method`
- **стр. 55** Ежегодный аудит точности алгоритмов → внешняя процедура (вне scope сущности)

---

## 2.2.13 RFIRequest (запрос дополнительной информации)

**Назначение:** формализованный запрос дополнительных сведений или документов клиенту. Закрывает требования стр. 94-97 чек-листа (RFI: инициация, срок ответа, канал, хранение).

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id` (PK), `tenant_id`, `client_id` (FK Client) |
| **Контекст RFI** | `target_entity_type` ∈ {client, transaction, ubo, sof_document, verification_session, other} (что именно требует разъяснения), `target_entity_id` (nullable), `category` ∈ {document_request, clarification, anketa_update, sof_request, other} |
| **Контент** | `subject` (string 255), `body` (text — формулировка вопроса/требования), `requested_documents` (JSON array of {document_type, description}), `body_template_key` (string — для i18n) |
| **Дедлайн** | `created_at`, `deadline` (datetime), `deadline_extension_count` (int) — сколько раз продлевался |
| **Состояние** | `status` ∈ {draft, pending_send, sent, in_progress, responded, reviewed, closed, expired, cancelled} |
| **Доставка** | `channel` ∈ {portal, email, manual} (стр. 96), `sent_at`, `sent_via` (string — конкретный канал, например, email-адрес или portal-уведомление) |
| **Ответ клиента** | `responded_at`, `responded_by_user_id` (FK User, role=CLIENT), `response_body` (text), `response_attachments` (JSON: array of FK ClientDocumentVersion) |
| **Review офицером** | `reviewed_at`, `reviewed_by_user_id` (FK User, COMPLIANCE_OFFICER+), `review_decision` ∈ {accepted, requires_followup, rejected}, `review_notes` |
| **Авторство** | `created_by_user_id` (FK User — кто инициировал RFI; должен быть COMPLIANCE_OFFICER+) |

### FSM RFIRequest

```
        ┌──────────┐
        │  DRAFT   │ ◄─── создан офицером, ещё не отправлен
        └────┬─────┘
             │ send
             ▼
        ┌──────────┐
        │   SENT   │ ◄─── отправлен клиенту по выбранному каналу
        └────┬─────┘
             │ client_started_responding
             ▼
        ┌──────────┐
        │IN_PROGR. │ ◄─── клиент начал отвечать (открыл портал, загружает документы)
        └────┬─────┘
             │ client_submitted_response
             ▼
        ┌──────────┐
        │RESPONDED │ ◄─── ответ получен, ожидает review офицером
        └────┬─────┘
             │ officer_reviewed
             ├──── accepted ──► CLOSED
             ├──── rejected ──► CLOSED (с пометкой rejected; может породить новый RFI)
             └──── requires_followup ──► новый RFI создаётся, текущий → CLOSED

        Параллельно:
        SENT/IN_PROGR./RESPONDED → EXPIRED (deadline истёк)
        SENT/IN_PROGR. → CANCELLED (офицер отменил)
```

### Связи

- → ClientDocumentVersion.linked_rfi_request_id (документы, поданные в ответ)
- → Notification (на каждое событие FSM создаётся уведомление клиенту/офицеру)
- → AuditEvent: каждое изменение состояния
- → Client.lifecycle_state может перейти в SUSPENDED при `deadline_extension_count > N` (см. Client FSM)

### Регуляторные привязки

- стр. 94 (инициация RFI) → создание записи + `created_by_user_id`
- стр. 95 (срок ответа) → `deadline` + scheduled job алертинга
- стр. 96 (канал доставки) → `channel` + `sent_via`
- стр. 97 (хранение запросов и ответов как часть истории клиента) → запись + retention 7 лет

---

## 2.2.14 ClientPortalAccess

**Назначение:** состояния онбординга клиента в клиентский портал (для SKU VO/FVP). Не дублирует `Client.lifecycle_state` — а описывает прогресс конкретного User'а с `role=CLIENT` через self-service шаги.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| client_user_link_id | int (FK client_user_link) | Конкретная связь User↔Client |
| portal_state | enum | См. FSM |
| registered_at | datetime | Когда User зарегистрировался |
| identity_verified_at | datetime | Когда прошёл первичную идентификацию (VerificationSession passed) |
| anketa_completed_at | datetime | Когда заполнил анкету (CDD-739) |
| consent_signed_at | datetime | Согласие на обработку ПДн |
| activated_at | datetime | Когда стал ACTIVE (доступен полный функционал) |
| **Self-service настройки** | `mfa_method` (enum), `notification_preferences` (JSON) | — |
| `last_login_at` | datetime | — |

### FSM portal_state

```
         ┌─────────────┐
         │  REGISTERED │ ◄─── email/телефон верифицирован, пароль задан
         └──────┬──────┘
                │ start_idv
                ▼
         ┌──────────────────┐
         │  IDV_IN_PROGRESS │ ◄─── VerificationSession в процессе
         └──┬─────────────┬─┘
       pass │             │ fail / require_review
            ▼             ▼
   ┌──────────────────┐ ┌──────────────────┐
   │IDENTITY_VERIFIED │ │  REVIEW_REQUIRED │ (ручная проверка офицером)
   └────────┬─────────┘ └──────────────────┘
            │ submit_anketa
            ▼
   ┌──────────────────┐
   │ ANKETA_SUBMITTED │ ◄─── анкета заполнена клиентом, ожидает review
   └────────┬─────────┘
            │ officer_review_passed
            ▼
   ┌──────────────────┐
   │ CDD_COMPLETED    │ ◄─── все CDD-этапы пройдены, можно подавать заявки
   └────────┬─────────┘
            │ activate
            ▼
   ┌──────────────────┐
   │     ACTIVE       │ ◄─── штатный режим
   └──────────────────┘

   Параллельно: ACTIVE → SUSPENDED (просрочка RFI / расследование)
                ACTIVE → REVOKED (расторжение отношений)
```

### Связи

- → `client_user_link` (1:1 на каждую активную связь)
- → AuditEvent (`portal.state_changed`)
- Каждый переход FSM генерирует Notification клиенту по выбранному `notification_preferences.channel`

### Возможности портала по состоянию

| Состояние | Что доступно клиенту |
|---|---|
| REGISTERED | Только запуск IDV-сеанса |
| IDV_IN_PROGRESS | UI верификации (загрузка документов, видео, ответы на запросы провайдера) |
| IDENTITY_VERIFIED | Заполнение анкеты CDD-739 |
| ANKETA_SUBMITTED | Просмотр статуса review, ответы на RFI |
| CDD_COMPLETED | Доступ ко всем функциям + ожидание `activate` |
| ACTIVE | Полный функционал: подача заявок (домен 2.3), просмотр истории, ответы на RFI, обновление документов |

---

## State machines (сводная таблица)

| Сущность | FSM | Финальные состояния |
|---|---|---|
| Client | onboarding → active → suspended → terminating → archived → purged | purged |
| Director | active → terminated | terminated |
| ClientRepresentative | active → expired/revoked → terminated | terminated |
| ClientDocument | missing → received → accepted/rejected → expired | expired |
| VerificationSession | initiated → processing → manual_review → passed/failed | passed, failed |
| RFIRequest | draft → sent → in_progress → responded → closed (или expired/cancelled) | closed, expired, cancelled |
| ClientPortalAccess | registered → idv_in_progress → identity_verified → anketa_submitted → cdd_completed → active → revoked | revoked |
| client_user_link | active → revoked | revoked |

---

## Соответствие чек-листу 01-regulatory-checklist.md

Подшаг 2.2 закрывает следующие строки чек-листа:

| Строки | Тема | Закрытие в 2.2 |
|---|---|---|
| 1-17 | Анкета ФЛ (поля 1-22 CDD-739) | IndividualClient (2.2.3) с полным набором полей |
| 18-38 | Анкета ЮЛ (поля 1-24 CDD-739) | LegalEntityClient (2.2.4) |
| 39-43 | Документы для верификации | ClientDocument + ClientDocumentVersion (2.2.10), document_type enum |
| 44-46 | Видео/фото клиента в режиме реального времени, сопоставление | VerificationSession + VerificationArtifact (2.2.12) |
| 47-48 | Подлинность телефона/email | VerificationSession.auth_method, auth_verified_at |
| 50 | Видеоконференция с клиентом | VerificationArtifact.artifact_type = `screenshare_recording` |
| 51 | Отказ по триггерам | VerificationSession.rejection_reasons |
| 52 | IP-адрес клиента | VerificationSession.client_ip, client_geolocation |
| 53 | Liveness | VerificationSession.flags |
| 54 | MFA | VerificationSession.auth_method |
| 60-74 | Состав сведений о БВ + 16 критериев | UBO (расширенная) + UBOEntity (2.2.8) |
| 75 | Усиленные меры (EDD) | поле `Client.current_risk_level = high/critical` влияет на обязательность RFI и review |
| 77 | Запрос источника средств | SOFDocument (2.2.11) |
| 78 | Письменное разрешение руководителя | PEPProfile.approval_decision = granted, approved_by = COMPLIANCE_HEAD |
| 83 | Дата заполнения / следующего обновления | Client.last_risk_assessed_at, IndividualClient.next_review_date |
| 84-86 | Обновление анкеты | RFIRequest для запроса обновлений; AuditEvent.action = `client.anketa_updated` |
| 88-93 | Анкета ПДЛ + семья + близкие лица | PEPProfile + PEPRelation (2.2.9) |
| 94-97 | RFI | RFIRequest (2.2.13) |
| 200 | Журнал результатов верификации | VerificationSession (2.2.12) |
| 201 | Журнал цифровой идентификации | VerificationArtifact (2.2.12) |
| 202 | Журнал доступа к базе БВ | AuditEvent с `entity_type=ubo` (наследуется из 2.1.4) |

**Итого: ~50 строк чек-листа закрыты в 2.2.**

---

## Открытые вопросы 2.2

### Q-2.2-A. Многоуровневые структуры UBO — глубина моделирования

Сущность UBOEntity (2.2.8) поддерживает произвольную глубину цепочки. На практике встречаются цепочки 5-7 уровней (особенно в офшорах). Нужны ли ограничения на глубину или поведенческие настройки (например, авто-EDD при цепочке > 3 уровней)?

**Не блокирует 2.2**, но требует обсуждения для UI/UX (как визуализировать длинные цепочки) и risk-домена 2.4 (вес длины цепочки в риск-модели).

### Q-2.2-B. Связь VerificationSession ↔ ClientDocument: один-ко-многим или many-to-many?

Один сеанс верификации использует несколько документов (паспорт + селфи + видео = 3 артефакта в одной сессии). Один документ может быть использован в нескольких сессиях (повторная верификация без переподачи паспорта). Сейчас связь только через `linked_verification_session_id` в ClientDocumentVersion (один-ко-многим).

**Требуется решение:** делать ли отдельную таблицу-связку `verification_session_documents`?

### Q-2.2-C. Хранение PEP-источников (открытые базы, ПЭП-сервисы)

`PEPProfile.identified_source` сейчас text. Для аудита и регуляторных запросов может потребоваться структура: какая именно база использовалась, версия, дата выгрузки. Это пересекается с провайдерами KYT (Q10), которые часто включают PEP-список.

**Не блокирует 2.2**, но требует уточнения на 2.4 (где PEP-проверка происходит как часть скрининга).

### Q-2.2-D. Авто-конвертация Client.client_type

Клиент может изменить статус (например, ФЛ → ИП → ЮЛ через регистрацию ОсОО). Сейчас `client_type` зафиксирован при создании. Нужна ли возможность миграции?

**Текущая позиция:** при существенном изменении статуса — закрытие старого Client'а (terminating → archived) и создание нового. Связь — через notes или отдельное поле `predecessor_client_id`. Требует подтверждения.

### Q-2.2-E. Структурированные адреса vs обратная совместимость

Раздробление `registration_address` на 9 подполей ломает существующие данные. Миграция требует ручной классификации существующих текстовых адресов или OCR-разбора.

**Текущая позиция:** оставить старое текстовое поле как `registration_address_legacy`, новые анкеты заполнять структурированно. Постепенная backfill-миграция отдельной задачей. Не блокирует 2.2.

### Q-2.2-F. Polymorphic FK на subject_type/subject_id (PEPProfile, VerificationSession)

Полиморфные ключи (subject_type + subject_id без явного FK) усложняют целостность БД (нет CASCADE, нет проверки существования). Альтернатива — отдельные FK-поля для каждого типа (individual_client_id, director_id, ubo_id, ...) с CHECK constraint что заполнено ровно одно.

**Не блокирует 2.2**, но требует решения архитектора БД на шаге 3.

### Q-2.2-G. ClientPortalAccess — отношение к role=CLIENT

Технически `ClientPortalAccess` — это расширение состояния `User` с `role=CLIENT`. Разделение на две сущности (User в 2.1 + ClientPortalAccess в 2.2) — это правильно, но порождает дублирование некоторых полей (last_login_at).

**Текущая позиция:** оставить `User.last_login_at` как глобальное (для всех ролей), а `ClientPortalAccess.last_login_at` — как portal-specific (включая в т.ч. вход через мобильный портал). Может потребовать пересмотра.

### Q-2.2-H. Государственная база БВ ЮЛ — режим интеграции

Положение об эл. базе БВ предусматривает централизованную базу. Способ интеграции (API, manual upload, web-portal scraping?) не определён в положении. ↗ к **Q-2.1-G** (storage) и шагу 3.

### Q-2.2-I. Обработка смены ФИО / документов при сохранении исторических данных

Когда у клиента меняется паспорт (новая серия/номер) — старая запись `IndividualClient` затирается или исторично сохраняется?

**Текущая позиция:** базовые поля затираются (один Client = одна актуальная анкета), исторический след — через `ClientDocument` + AuditEvent (старый паспорт как ClientDocumentVersion с `is_current=false`). Для критичных изменений (смена ФИО) — зеркально создаётся `client_name_change_history` (вне scope 2.2, проектируется при обнаружении необходимости).

### Q-2.2-J. Удаление БВ при изменении структуры собственности

Когда лицо перестаёт быть БВ (продало долю) — соответствующая UBO-запись удаляется или архивируется?

**Текущая позиция:** soft-archive через `is_archived=true` (уже в коде) + `archived_at`. Запись физически остаётся под retention 7 лет. На UI показывается «бывший БВ» с датами.

---

# 2.3 Операционный домен

## Контекст и границы

Этот подшаг проектирует **операционный слой** — заявки клиентов на сделки с виртуальными активами, фактическое исполнение операций бэк-офисом, моделирование кошельков и custody-движений, замораживание и приостановление, фиксацию курсов валют, пороговые проверки. Sanctions screening, risk-rescoring, formal FIUMessage — это домен **2.4**; XML/Excel-генерация регуляторных сообщений — **2.5**. В 2.3 обозначаются точки интеграции (hooks, события).

**Что есть в коде сейчас** ([backend/app/models.py:752](backend/app/models.py#L752)):
- `Transaction` — единственная сущность операционного слоя; смешанная функциональность (учёт операции + AML-индикаторы + статус для FIU). На 2.3 рефакторится: финансовая часть остаётся, AML-часть выносится в 2.4 (FIUMessage).
- `TransactionStatus` enum — FIU-ориентированные статусы (NEW, REVIEWING, REPORTED, DISMISSED). Не подходит как операционный lifecycle — переносится в 2.4.

**Чего нет в коде** (новые на 2.3): Order, WalletAddress, CustodyMovement, CounterpartyBank, ExchangeRateSnapshot, ThresholdCheck, FrozenAccount, FrozenOperation, SuspiciousActivityFlag.

**Что меняется на 2.3:**
- Существующая Transaction рефакторится: разделение на `Order` (намерение клиента) + `Transaction` (факт исполнения). Это критично для workflow клиентского портала + back-office + раздельной ответственности по RBAC.
- Финансовые поля Transaction структурируются под Q5 Excel-реестр: раздельные `fiat_in/out`, `va_amount/asset/network`, `kgs_equivalent`.
- Custody моделируется нейтрально (Q13) — поле `key_holder` ∈ {we, external_provider, client} на уровне Wallet и movement; конкретный режим выбирается на шаге 3 (архитектура).
- Подпись поручения формализуется (Q14): `signature_type` ∈ {paper, ecp_kg, mfa_in_portal} + `signature_payload` (JSON).
- 8 новых сущностей закрывают: реестр операций ОВА, custody-движения (включая через внешний custody — закрытие 114g3-g5), кошельки и Travel Rule, фиксация курса (Q5), пороговые проверки (Q11), замораживание операций и активов, промежуточные подозрительные флаги.

**Принципы наследуются из 2.1/2.2:**
- `tenant_id` обязательный, row-level изоляция
- AuditEvent на каждое изменение состояния через hash-chain
- Retention 7 лет (Q12) применяется ко всем операционным сущностям
- RBAC из 2.1.3 формализует кто может что делать

## Карта сущностей 2.3

```
                        ┌──────────────┐
              ┌───────► │   Client     │ ◄─── из 2.2
              │         └──────┬───────┘
              │                │ N
              │                │
              │ N         ┌────▼─────┐         ┌────────────────┐
              ├──────────►│  Order   │◄────────┤   RFIRequest   │ ◄─ из 2.2
              │           │ (intent, │         │ (waiting_for_  │
              │           │  FSM)    │         │   rfi state)   │
              │           └────┬─────┘         └────────────────┘
              │                │ 1
              │                │ N (partial fills)
              │                ▼
              │         ┌──────────────┐
              │         │ Transaction  │   ┌──── ExchangeRate
              │         │  (execution, │ ◄─┤    Snapshot (Q5)
              │         │   FSM)       │   │
              │         └──┬─────┬──┬──┘   │
              │            │     │  │       │
              │            │ 0..1│  │ 2     │
              │            │     │  │       │
              │            ▼     ▼  ▼       │
              │   ┌──────────┐ ┌──────────────┐   ┌───────────┐
              │   │CustodyMo-│ │CounterpartyBnk│   │Threshold  │
              │   │ vement   │ │(client+oper.) │   │Check (Q11)│
              │   │  (FSM)   │ └───────────────┘   └─────┬─────┘
              │   └────┬─────┘                            │ creates
              │        │ src/tgt                          ▼
              │        ▼                          ┌──────────────┐
              │ ┌──────────────┐                  │SuspiciousAct.│
              │ │ WalletAddress│                  │    Flag      │ ── escalate ─►
              │ │ (key_holder, │                  └──────────────┘    FIUMessage
              │ │  KYT-tags)   │                                       (домен 2.4)
              │ └──────┬───────┘
              │        │ N
              │ ┌──────▼────────┐         ┌─────────────────┐
              └─┤ FrozenAccount │         │FrozenOperation  │ ── reports ──►
                │   (assets)    │         │  (workflow)     │    FIUMessage (2.4)
                │   (FSM)       │         │   (FSM)         │
                └───────────────┘         └─────────────────┘
                       ▲                        ▲
                       │                        │
                       └─── pre-submit ────────┘
                            hooks (Order)
```

---

## 2.3.1 Order (заявка клиента)

**Назначение:** намерение клиента совершить операцию. Содержит запрошенные параметры, подпись клиента (Q14), результаты pre-submit hooks. Один Order может быть исполнен одной или несколькими `Transaction` (partial fills).

### Атрибуты

| Группа | Поля | Регуляторная привязка |
|---|---|---|
| **Связь** | `id` (PK), `tenant_id` (FK Tenant), `client_id` (FK Client), `created_by_user_id` (FK User; должен иметь активную запись в `client_user_link` для `client_id`) | стр. 103 (привязка к заявке клиента) |
| **Тип операции** | `order_type` (enum: `buy_va`, `sell_va`, `exchange`, `transfer_va`, `withdraw`, `deposit`) | ст. 26 ЗВА (#97a-c, 114c) |
| **Запрашиваемые параметры** | `requested_amount` (Decimal), `requested_currency` (string ISO/тикер), `target_asset` (string — VA-тикер, для buy/exchange), `target_network` (string — BTC/ETH/TRON и т.п.), `target_address` (string), `target_address_id` (FK WalletAddress, nullable — для VA-операций), `source_address_id` (FK WalletAddress, nullable — для withdraw/transfer) | стр. 106-107 (wallet, network) |
| **Подпись (Q14)** | `signature_type` (enum: `paper`, `ecp_kg`, `mfa_in_portal`), `signature_payload` (JSON: для paper — путь к скану, для ecp_kg — подпись и сертификат, для mfa_in_portal — verified_at + method + nonce), `signature_verified_at` (datetime), `signature_verified_by_user_id` (для paper — кто принял в офисе) | ст. 26 п. 5 ЗВА (#114f) |
| **Workflow timing** | `submitted_at, expires_at` (по умолчанию + 30 дней), `under_review_at, approved_at, executing_started_at, completed_at, settled_at` | — |
| **Статус** | `status` (enum, FSM ниже), `status_changed_at, status_changed_by_user_id`, `previous_status` | — |
| **Compliance review** | `compliance_decision` (enum: pending, approved, rejected, escalated), `compliance_decision_user_id` (FK User — COMPLIANCE_OFFICER+), `compliance_decision_at`, `compliance_notes`, `risk_level_at_submit` (enum RiskLevel — для аудита) | стр. 75-76 (EDD/HRC) |
| **Back-office assignment** | `back_office_assigned_user_id` (FK User — BACK_OFFICE_OPERATOR), `back_office_assigned_at`, `back_office_decision_at` | — |
| **Cancel/reject context** | `rejection_reason` (text), `rejected_by_user_id`, `cancelled_by_client_at`, `cancellation_reason` | — |
| **RFI** | `pending_rfi_request_id` (FK RFIRequest, nullable) — текущий открытый RFI, при наличии Order в статусе `waiting_for_rfi` | стр. 94-97 (RFI) |
| **Pre-submit hooks summary** | `hooks_summary` (JSON: array of {hook_name, status ∈ {pass, fail, warn}, details, evaluated_at}) — снимок всех проверок на момент submit | — |
| **Сервисное** | `notes` (text), `created_at, updated_at, retention_until` (Q12) | — |

### Lifecycle FSM

```
                ┌──────────┐
                │  DRAFT   │ ◄─── создан клиентом в портале или
                └────┬─────┘       BACK_OFFICE_OPERATOR в админке
                     │ submit (валидация подписи + pre-submit hooks)
                     ▼
                ┌────────────┐
                │ SUBMITTED  │ ◄─── pre-submit pipeline пройден
                └────┬───────┘
                     │ assign_for_review
                     ▼
                ┌────────────┐  needs_rfi  ┌──────────────────┐
                │UNDER_REVIEW├────────────►│ WAITING_FOR_RFI  │ ◄── открыт RFIRequest
                └────┬───────┘             └────────┬─────────┘
                     │ approve                      │ rfi_responded
                     │                              │
                     │             ┌────────────────┘
                     ▼             ▼
                ┌────────────┐
                │  APPROVED  │
                └────┬───────┘
                     │ start_execution (BACK_OFFICE_OPERATOR)
                     ▼
                ┌────────────┐
                │ EXECUTING  │ ◄─── одна или несколько Transaction
                └────┬───────┘       исполняются под этой заявкой
                     │ all_transactions_completed
                     ▼
                ┌────────────┐
                │ COMPLETED  │ ◄─── все Transaction завершены успешно
                └────┬───────┘
                     │ reconciled (сверка поступлений/выплат, ThresholdCheck)
                     ▼
                ┌────────────┐
                │  SETTLED   │ ◄─── финальное состояние
                └────────────┘

   Отказные ветки (из любого состояния до COMPLETED):
   * → REJECTED_BY_COMPLIANCE  (от UNDER_REVIEW; rejection_reason обязателен)
   * → REJECTED_BY_BACK_OFFICE (от APPROVED/EXECUTING; например, отказ банка-партнёра)
   * → CANCELLED_BY_CLIENT     (от DRAFT/SUBMITTED; через клиентский портал)
   * → EXPIRED                 (по expires_at; scheduled job)
   * → FROZEN                  (если в EXECUTING сработало замораживание; → FrozenOperation)
```

### Pre-submit pipeline (hooks)

При переходе `draft → submitted` выполняется фиксированный pipeline. Каждый hook возвращает `pass / fail / warn`. На `fail` — submit блокируется. На `warn` — submit разрешается с пометкой в `hooks_summary`. Все hook-результаты логируются в AuditEvent.

| # | Hook | Что проверяет | Поведение |
|---|---|---|---|
| 1 | `validate_signature` | `signature_type` соответствует разрешённым типам tenant'а; payload валиден | fail → блок |
| 2 | `client_active` | `Client.lifecycle_state = active` | fail → блок |
| 3 | `link_active` | в `client_user_link` есть незаkанчившаяся запись для `(created_by_user_id, client_id)` | fail → блок |
| 4 | `not_frozen_account` | нет активного `FrozenAccount` для `client_id` или `wallet_id` | fail → блок |
| 5 | `not_frozen_operation` | нет активной `FrozenOperation` на predecessor-orders клиента | fail → блок |
| 6 | `wallet_validity` | `target_address_id` (если задан) — корректный, `owner_type` соответствует `order_type` | fail → блок |
| 7 | `pre_tx_sanctions_screen` (hook в 2.4) | client + counterparty + wallet проверяются по санкционным спискам | fail (match) → блок; warn (possible_match) → требует compliance review |
| 8 | `kyt_check_wallet` (hook в 2.4) | Wallet KYT-проверка через `KYTProvider` (Q10) | warn (high_risk) → требует review; fail (override-trigger по Q4) → блок |
| 9 | `risk_re_evaluation` (hook в 2.4) | Пересчёт risk-уровня клиента с учётом операции | если risk поднимается до high/critical → автоматически в UNDER_REVIEW |
| 10 | `threshold_check_single` | ThresholdCheck single mode (Q11): сумма операции в KGS vs threshold | warn (превышение) → пометка для compliance |
| 11 | `compliance_review_required` | Если результат любого предыдущего hook — warn/escalate, или risk = high/critical, или PEP-клиент | определяет нужен ли UNDER_REVIEW (вместо прямого APPROVED) |

Pipeline всегда выполняется ВЕСЬ, даже после первого fail (для полного аудита). Order попадает в SUBMITTED только если все fail-критичные hooks прошли.

### Регуляторные привязки

- стр. 78 (письменное разрешение руководителя на работу с PEP) → если Client связан с PEPProfile, hook 11 → UNDER_REVIEW + `compliance_decision_user_id` обязательно COMPLIANCE_HEAD
- стр. 103 (привязка к заявке) → `Order.id` фигурирует в Transaction
- стр. 105 (только безналичный расчёт) → валидация в hook 1 на специфичные `order_type` (например, для `withdraw fiat` — обязательно банк-получатель)
- стр. 137 (pre-transaction sanctions screening) → hook 7
- стр. 140 (приостановление при подозрении) → переход в FROZEN при срабатывании hook 4-5

---

## 2.3.2 Transaction (исполненная операция)

**Назначение:** запись о фактически исполненной операции. Связана с Order, содержит финансовые детали в формате Q5 Excel-реестра, фиксирует курс на момент исполнения.

### Дельта от существующей Transaction (models.py:752)

| Поле | Сейчас | Изменение |
|---|---|---|
| `client_id, company_id` | есть | сохраняются (`company_id → tenant_id` концептуально) |
| `amount, currency, amount_kgs` | есть | **разделяются** на `fiat_in_*`, `fiat_out_*`, `va_amount/asset/network`, `kgs_equivalent` (Q5) |
| `operation_date` | есть | переименовывается в `executed_at` (для ясности) |
| `type_code, type_label` | есть | сохраняются как `operation_code_kg` (коды 10000-38099 ПФР), но классификация переносится в 2.4 |
| `description` | есть | сохраняется |
| `counterparty_name/account/bank/country` | есть | **выносятся** в `CounterpartyBank` (2.3.5) с FK |
| `is_mandatory_control, auto_indicators, manual_indicators, risk_score` | есть | **переносятся в 2.4** (FIU-домен): эти поля относятся к compliance-классификации, не к операционной записи |
| `status` (TransactionStatus = NEW/REVIEWING/REPORTED/DISMISSED) | есть | **разделяется**: операционный `status` (FSM ниже, новый) + compliance-статус через FIUMessage в 2.4 |
| `reviewed_by, reviewed_at, notes` | есть | переносятся в FIUMessage (2.4) |

### Атрибуты Transaction (после рефакторинга)

| Группа | Поля | Регуляторная привязка |
|---|---|---|
| **Связь** | `id` (PK), `tenant_id, client_id` (FK Client), `order_id` (FK Order, nullable — Transaction может быть без Order для системных движений вроде корректировок) | стр. 98 (реестр операций) |
| **Тип** | `transaction_type` (enum, тот же что Order.order_type), `operation_code_kg` (string — код 10000-38099 ПФР для отчётности 2.5), `operation_label` (string — человеко-читаемое) | стр. 100 (код операции) |
| **Финансовые поля Q5** |  |  |
| `fiat_in_amount` | Decimal | сумма входа по банку (полученная от клиента) |
| `fiat_in_currency` | string ISO-4217 | — |
| `fiat_out_amount` | Decimal | сумма выхода по банку (выплаченная клиенту) |
| `fiat_out_currency` | string ISO-4217 | — |
| `va_amount` | Decimal | объём VA |
| `va_asset` | string | тикер (BTC, USDT, ETH, ...) |
| `va_network` | string | сеть (Bitcoin, ERC20, TRC20, ...) |
| `kgs_equivalent` | Decimal | эквивалент в KGS (для порога Q11) |
| `payment_purpose` | text | назначение платежа по выписке (Q5 поле) |
| **Курс (Q5)** | `exchange_rate_snapshot_id` (FK ExchangeRateSnapshot) — фиксируется в момент исполнения, не пересчитывается | стр. 101 (курс) |
| **Банки (Q5)** | `client_bank_id` (FK CounterpartyBank), `operator_bank_id` (FK CounterpartyBank) | стр. 102 (контрагент) |
| **Custody (если VA)** | `custody_movement_id` (FK CustodyMovement, nullable; для fiat-операций — null) | 114g3 (логирование через внешний custody) |
| **Wallets (если VA)** | `source_wallet_id, target_wallet_id` (FK WalletAddress, nullable для fiat) | 106-107 |
| **Workflow** | `executed_at` (datetime UTC), `executed_by_user_id` (FK User — BACK_OFFICE_OPERATOR; обязательно для статуса completed), `recorded_at, recorded_by_user_id` | стр. 99 (фиксация момента с точностью до минут) |
| **Статус** | `status` (FSM ниже), `status_changed_at, status_changed_by_user_id`, `previous_status` | — |
| **Failure context** | `failure_reason` (text), `failed_at`, `reverse_transaction_id` (FK Transaction — для reversed) | — |
| **Compliance summary** (cross-ref в 2.4) | `last_screening_check_id` (FK SanctionsCheck из 2.4, nullable), `risk_score_at_execution` (float) | стр. 122 (мониторинг по профилю) |
| **Сервисное** | `notes` (text), `created_at, updated_at, retention_until` (Q12) | стр. 175, 189-191 |

### Связь Order ↔ Transaction

- **1:1** — типичный случай. Один Order = одна Transaction.
- **1:many** — частичное исполнение. Например, Order на 100 BTC исполняется тремя Transactions (50 + 30 + 20). Все Transaction.order_id = Order.id; Order переходит в COMPLETED только после всех partial fills.
- **0:1 (Transaction без Order)** — системные движения: корректировка, ребалансировка hot↔cold (через CustodyMovement без Order), ручная запись для миграции исторических данных. Помечается `transaction_type = 'system_adjustment'`, `executed_by_user_id` должен быть BACK_OFFICE_HEAD+.

### Lifecycle FSM

```
                ┌──────────┐
                │ PENDING  │ ◄─── создана из Order (или системно)
                └────┬─────┘
                     │ start_execution
                     ▼
                ┌────────────┐
                │ EXECUTING  │ ◄─── оператор исполняет (банковский платёж +
                └────┬───────┘       создание CustodyMovement если applicable)
                     │ confirm_execution
                     ▼
                ┌────────────┐
                │ COMPLETED  │ ◄─── успешное исполнение зафиксировано
                └────┬───────┘
                     │ reconcile (ThresholdCheck single + 24h aggregate;
                     ▼            сверка с банком; KYT post-check)
                ┌────────────┐
                │ RECONCILED │ ◄─── финальное штатное состояние
                └────────────┘

   Отказные ветки:
   * EXECUTING → FAILED   (failure_reason обязателен)
   * COMPLETED → REVERSED (через reverse_transaction_id; например, банк отозвал платёж)
   * COMPLETED → DISPUTED (claim от клиента; не отменяет, но требует расследования)
```

### Регуляторные привязки

- стр. 98-102 — реестр операций ОВА со всеми условиями, момент исполнения, код, сумма/валюта/курс, контрагент
- стр. 99 — `executed_at` точность до минут (datetime достаточно)
- стр. 105 — только безналичный расчёт: hook валидации в pre-submit; здесь же поля `fiat_in_*/out_*` обязательны
- стр. 121 — предоставление информации о переводах в ФР в течение 3 раб. дней → выгрузка по Transaction-фильтру (домен 2.5)
- стр. 175, 189 — retention 7 лет

---

## 2.3.3 WalletAddress

**Назначение:** учёт криптокошельков и адресов — клиентских (внешних), tenant'а (горячий/холодный), неизвестных контрагентов. Persistent-сущность, к которой привязаны KYT-теги, Travel Rule метаданные, white-list статус.

### Атрибуты

| Группа | Поля | Регуляторная привязка |
|---|---|---|
| **Идентификация** | `id` (PK), `tenant_id`, `address` (string — blockchain-адрес), `network` (enum: bitcoin, ethereum, tron, polygon, bsc, ton, solana, ...) | стр. 106-107 |
| **Уникальность** | UNIQUE (tenant_id, network, address) — один адрес на сеть в tenant'е | — |
| **Владелец** | `owner_type` (enum: `client_external` — адрес клиента вне tenant; `tenant_hot` — горячий кошелёк tenant'а; `tenant_cold` — холодный; `external_unknown` — неизвестный получатель/отправитель), `client_id` (FK Client, nullable — заполнен только для client_external) | — |
| **Custody (Q13)** | `key_holder` (enum: `we`, `external_provider`, `client`), `custody_provider` (enum: `internal`, `fireblocks`, `bitgo`, `copper`, `manual`, `na` — для client/external), `custody_account_ref` (string — ID на стороне провайдера) | 114g3-g6 |
| **Travel Rule** (для transfer_va между VASPs) | `counterparty_vasp_name, counterparty_vasp_jurisdiction` (ISO-3166), `counterparty_vasp_lei` (LEI), `travel_rule_payload` (JSON по IVMS101 — формат фиксируется на шаге 4, см. Q-2.3-H), `travel_rule_provider` (enum: notabene, sumsub_travel, manual) | стр. 115-117 |
| **KYT (Q10)** | `last_kyt_check_at`, `kyt_risk_score` (0-100), `kyt_tags` (JSON: array of strings — mixer, darknet, scam, sanctioned, exchange, gambling, ...), `kyt_provider` (enum: ranex_kg, chainalysis, trm_labs), `kyt_check_history` (JSON-massив last 10 checks с датами и score) | стр. 113, 130 |
| **Whitelisting (опц.)** | `is_whitelisted` (bool), `whitelisted_at`, `whitelisted_by_user_id` (COMPLIANCE_OFFICER+), `whitelist_expires_at`, `whitelist_reason` | — |
| **Метаданные** | `label` (string — человеко-читаемое имя, например, «Холодный кошелёк ОсОО Альфа»), `description` (text) | — |
| **Lifecycle** | `is_active` (bool), `deactivated_at, deactivation_reason` | — |
| **Сервисное** | `created_at, updated_at, created_by_user_id` | — |

### Связи

- → Transaction.source_wallet_id, Transaction.target_wallet_id
- → CustodyMovement.source_wallet_id, CustodyMovement.target_wallet_id
- → FrozenAccount (target_type = wallet) — кошелёк может быть заморожен
- → AuditEvent при каждом изменении KYT-тегов или whitelist-статуса

### Регуляторные привязки

- стр. 106 (адрес кошелька) — собственно сущность
- стр. 107 (хеш транзакции) — связан через Transaction/CustodyMovement.blockchain_tx_hash
- стр. 109 (запрет операций с privacy wallets без идентификации) — `kyt_tags` содержит `privacy_wallet`; pre-submit hook 8 блокирует если `owner_type=external_unknown` AND tag contains privacy_wallet
- стр. 113 (запрет операций с активами высокого процентного скоринга) — `kyt_risk_score > tenant_threshold`
- стр. 130 (теги AML/KYT-провайдера) — `kyt_tags`

---

## 2.3.4 CustodyMovement

**Назначение:** фиксирует **любое** перемещение VA, инициированное оператором ОВА — даже когда custody внешний (Fireblocks, BitGo). Закрывает требование 114g3-g5 чек-листа («локальное логирование операций через внешний custody»). Создаётся также для системных движений (hot↔cold ребалансировка) без Transaction.

### Атрибуты

| Группа | Поля | Регуляторная привязка |
|---|---|---|
| **Связь** | `id` (PK), `tenant_id`, `transaction_id` (FK Transaction, nullable) | 114g3 |
| **Адреса** | `source_wallet_id` (FK WalletAddress), `target_wallet_id` (FK WalletAddress) | — |
| **Параметры движения** | `amount` (Decimal), `asset` (string — VA-тикер), `network` (string), `network_fee` (Decimal — комиссия сети) | — |
| **Custody-провайдер** | `custody_provider` (enum: `internal`, `fireblocks`, `bitgo`, `copper`, `manual`, `client_self` — для key_holder=client), `external_movement_id` (string — ID операции на стороне провайдера, для сверки), `external_request_payload` (JSON — что отправили провайдеру), `external_response_payload` (JSON — ответ; закрывает 114g5) | 114g3-g5 |
| **Инициация** | `initiated_by_user_id` (FK User), `initiation_reason` (enum: `client_order`, `internal_rebalance`, `regulator_request`, `freeze_transfer`, `correction`), `signature_type` (Q14 enum), `signature_payload` (JSON) | ст. 26 п. 5 ЗВА (#114f) |
| **Исполнение** | `requested_at, signed_at, broadcasted_at, confirmed_at, settled_at`, `executed_by_user_id` (BACK_OFFICE_OPERATOR+) | стр. 99 |
| **On-chain** | `blockchain_tx_hash` (string), `blockchain_confirmations` (int), `blockchain_block_number` (bigint) | стр. 107 |
| **Статус** | `status` (FSM ниже), `failure_reason` (text) | — |
| **Сервисное** | `notes` (text), `retention_until` (Q12) | 114g6 |

### Lifecycle FSM

```
              ┌──────────────┐
              │  REQUESTED   │ ◄─── оператор инициировал движение
              └──────┬───────┘
                     │ sign (signature_type validated)
                     ▼
              ┌──────────────┐
              │   SIGNED     │ ◄─── подпись зафиксирована
              └──────┬───────┘
                     │ broadcast (через custody_provider или вручную)
                     ▼
              ┌──────────────┐
              │ BROADCASTED  │ ◄─── транзакция в мемпуле; blockchain_tx_hash есть
              └──────┬───────┘
                     │ blockchain confirms (≥N подтверждений по сети)
                     ▼
              ┌──────────────┐
              │  CONFIRMED   │ ◄─── on-chain подтверждение получено
              └──────┬───────┘
                     │ settled (final reconciliation; для VA с finality)
                     ▼
              ┌──────────────┐
              │   SETTLED    │ ◄─── финальное штатное состояние
              └──────────────┘

  Отказные:
  REQUESTED/SIGNED → CANCELLED (отмена до broadcast)
  BROADCASTED → FAILED (replaced by RBF / dropped from mempool / reverted)
```

### Особый случай: key_holder = client (non-custodial режим)

Для клиента, удерживающего собственный приватный ключ (Q13), CustodyMovement записывается **только для логирования факта** самостоятельного перемещения клиентом. В этом случае:
- `custody_provider = 'client_self'`
- `external_request_payload, external_response_payload` — null
- `signature_type` обычно `mfa_in_portal` (клиент подтвердил намерение в портале) или null (если ОВА только наблюдает движение)
- `executed_by_user_id` — null (нет оператора)
- Lifecycle ускорен: REQUESTED → BROADCASTED → CONFIRMED (без SIGNED)

### Регуляторные привязки

- стр. 114c (услуга перевода ВА) — фактическая реализация перевода
- стр. 114d-f (custody-блок) — все три требования закрываются: сохранность через `key_holder` + `custody_provider`; самостоятельное перемещение клиентом — режим `client_self`; перемещение по поручению — связь с Order (через transaction_id) + signature_payload
- 114g3 (локальное логирование) — собственно сущность
- 114g4 (compliance-проверки на операции через внешний custody) — pre-submit hooks Order перед созданием CustodyMovement
- 114g5 (audit trail запросов к external API) — `external_request_payload, external_response_payload`
- 114g6 (retention 5 лет) — `retention_until` (7 лет по Q12)

---

## 2.3.5 CounterpartyBank

**Назначение:** банковские реквизиты контрагентов в fiat-операциях. Раздельно фиксируются банк клиента и банк оператора. Закрывает поля Excel-реестра Q5 («Банк клиента: наименование, страна, БИК, № счёта» + «Банк оператора: ...»).

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Реквизиты** |  |  |
| bank_name | string(255) | Полное наименование |
| country | string(3) | ISO-3166 |
| bic | string(20) | БИК (для KG-банков) |
| swift_code | string(20) | SWIFT (для международных) |
| account_number | string(50) | Номер счёта |
| account_holder_name | string(255) | Имя владельца счёта |
| iban | string(50) | IBAN (опционально) |
| corr_account | string(50) | Корр. счёт (опционально) |
| **Семантика** |  |  |
| is_operator_bank | bool | True если банк ОВА (recurring); False для банка клиента-контрагента (одноразовый) |
| operator_bank_label | string | Метка для оператора (например, «Основной счёт ОсОО Х в Дос-Кредобанке») |
| **Уникальность** | UNIQUE (tenant_id, bic, account_number) — один и тот же счёт в банке не дублируется |  |
| created_at, updated_at | datetime | — |

### Связи

- ← Transaction.client_bank_id (банк, с которого пришли средства от клиента, или на который ушли клиенту)
- ← Transaction.operator_bank_id (банк ОВА, через который проведена fiat-нога)

**Дизайн-решение:** `is_operator_bank=true` записи переиспользуются между транзакциями (это банки tenant'а, их 2-3 максимум). `is_operator_bank=false` записи могут переиспользоваться (если клиент платит с одного и того же счёта дважды) или создаваться разово — UNIQUE constraint обеспечивает дедупликацию.

### Регуляторные привязки

- Q5 (Excel-реестр поля «Банк клиента» + «Банк оператора»)
- стр. 102 (контрагент в реестре операций)

---

## 2.3.6 ExchangeRateSnapshot

**Назначение:** фиксация курса валютной пары в момент исполнения операции (Q5). Источник не валидируется системой — `recorded_by_user_id` несёт ответственность. Курс никогда не пересчитывается.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| pair | string(20) | `USDT_KGS`, `USD_KGS`, `EUR_KGS`, `BTC_USDT`, ... |
| rate | Decimal(20, 8) | Курс с точностью до 8 знаков |
| recorded_at | datetime UTC | Момент фиксации |
| source | string(255) | Свободный текст (Q5: не валидируется) — например, «Биржа Bitfinex», «ЦБ КР», «внутренний расчёт» |
| recorded_by_user_id | int (FK User) | BACK_OFFICE_OPERATOR+ |
| transaction_id | int (FK Transaction, nullable) | Связь 1:1 с операцией; nullable для «голых» снимков (если tenant ведёт справочник курсов) |
| notes | text | Комментарий (например, обоснование выбора источника) |

### Связи

- ← Transaction.exchange_rate_snapshot_id (1:1 с операцией) — стандартный случай
- Возможно использование без Transaction для построения исторического справочника курсов в `TenantSettings.rate_source_*` (но это вторичный сценарий)

### Регуляторные привязки

- Q5 (курс USDT/KGS на момент исполнения операции)
- стр. 101 (сумма, валюта, курс к KGS)
- Используется в ThresholdCheck для расчёта `kgs_equivalent`

---

## 2.3.7 ThresholdCheck (Q11)

**Назначение:** проверяет, попадает ли операция или серия операций под пороговое требование 1М сомов. Q11 требует поддержки **двух режимов**: единичная операция и агрегат за окно (по умолчанию 24ч, настраивается в RiskSettings).

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| transaction_id | int (FK Transaction) | Транзакция-триггер (та, что только что completed) |
| client_id | int (FK Client) | Денормализация для индекса |
| mode | enum | `single` / `aggregated_24h` / `aggregated_custom` |
| window_hours | int | Размер окна в часах (для aggregated_*); null для single |
| window_start, window_end | datetime UTC | Границы агрегационного окна (для aggregated_*) |
| included_transaction_ids | JSON: array of int | Какие Transaction.id вошли в агрегат (для аудита и регуляторного объяснения) |
| aggregate_amount_kgs | Decimal | Сумма всех включённых операций в KGS (через ExchangeRateSnapshot каждой) |
| threshold_kgs | Decimal | Действующий порог из RiskSettings (по умолчанию 1_000_000) |
| exceeds_threshold | bool | aggregate_amount_kgs >= threshold_kgs |
| evaluated_at | datetime UTC | — |
| evaluated_by | string | `system` (всегда автоматически) |

### Поведение

При `Transaction.status → completed`:
1. Создаётся запись `ThresholdCheck` с `mode = single`, `aggregate_amount_kgs = transaction.kgs_equivalent`.
2. Создаётся вторая запись `ThresholdCheck` с `mode = aggregated_24h`, `window_hours = 24` (или из `RiskSettings.threshold_window_hours`); `aggregate_amount_kgs = Σ(kgs_equivalent)` всех completed Transactions того же `client_id` в окне `[now() - window_hours, now()]`.
3. Если в любом из режимов `exceeds_threshold = true` → автоматически создаётся `SuspiciousActivityFlag` с `flag_reason = threshold_exceeded`, ссылка на этот ThresholdCheck в `flag_details.threshold_check_id`.

### Курс в агрегате (Q-2.3-F)

Каждая операция в окне приходит со своим `exchange_rate_snapshot_id` — её собственный `kgs_equivalent` фиксируется в момент исполнения. ThresholdCheck **не пересчитывает** курсы; просто суммирует `kgs_equivalent` всех Transaction'ов в окне. Это семантически корректно: каждая операция считается по своему курсу.

### Регуляторные привязки

- Q11 (порог 1М сомов в обоих режимах) — собственно реализация
- стр. 169 (СТР по операциям сверх порога — 3 раб. дня) — триггер из ThresholdCheck создаёт SuspiciousActivityFlag → escalate в FIUMessage (2.4) с deadline_at = now() + 3 рабочих дня
- стр. 176 (пороги пороговых операций) — `threshold_kgs` берётся из `RiskSettings.threshold_operations` (per-tenant configuration)

---

## 2.3.8 FrozenAccount + FrozenOperation

### FrozenAccount (заморозка активов)

**Назначение:** фиксация состояния «замороженных активов» — клиента, кошелька или конкретного баланса. ПЗМ § 12 устанавливает максимальный 2-месячный срок.

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Цель заморозки** | | |
| target_type | enum | `client` (все средства клиента), `wallet` (конкретный кошелёк), `asset_balance` (отдельная позиция в активе) |
| target_id | int | id соответствующей сущности (Client.id / WalletAddress.id / составной ключ для balance) |
| amount_frozen | Decimal | Замороженная сумма (для wallet/asset_balance); null для `client` (всё) |
| asset | string | Тикер актива; null если client-уровень |
| **Основание** | | |
| basis | enum | `sanction_match` (срабатывание санкционного списка), `fr_request` (запрос ФР), `court_order` (судебное решение), `suspicion` (внутреннее основание) |
| basis_doc_id | int (FK ClientDocument) | Документ-основание (приказ ФР, решение суда, внутренняя справка) |
| basis_details | text | Детали основания |
| **Workflow** | | |
| status | enum | FSM ниже |
| frozen_at, frozen_by_user_id | datetime, FK User | COMPLIANCE_HEAD по матрице 2.1.3 |
| frozen_until | datetime | По умолчанию `frozen_at + 60 days` (ПЗМ § 12); может продлеваться через RetentionExtension-механизм |
| special_account_ref | string | Ссылка на спец. счёт (TenantSettings.special_account_for_frozen) |
| **Разморозка** | | |
| unfreeze_decision_doc_id | int (FK ClientDocument) | Решение ФР/суда (ПЗМ § 38, 39) |
| unfrozen_at, unfrozen_by_user_id | datetime, FK User | — |
| unfreeze_reason | text | — |
| **Сервисное** | created_at, updated_at, retention_until (Q12) | — |

#### FSM FrozenAccount

```
                ┌──────────┐
                │  FROZEN  │ ◄─── создан COMPLIANCE_HEAD'ом
                └──┬─────┬─┘
                   │     │
        partial_unfreeze │ unfreeze_decision_received
                   │     │
                   ▼     ▼
       ┌──────────────────┐  ┌──────────────┐
       │PARTIALLY_UNFROZEN│  │  UNFROZEN    │ ◄─── финальное штатное
       └──────┬───────────┘  └──────────────┘
              │ remainder unfreeze
              ▼
        ┌──────────────┐
        │  UNFROZEN    │
        └──────────────┘

  Параллельно: FROZEN → EXPIRED_2_MONTHS (по frozen_until без решения о продлении)
                (требует ручного вмешательства COMPLIANCE_HEAD)
```

### FrozenOperation (приостановление операции)

**Назначение:** фиксация состояния «приостановленной операции» — Order, Transaction, или CustodyMovement. Семантически отличается от FrozenAccount: заморозка касается активов; приостановление — workflow-объекта.

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Цель** | | |
| target_type | enum | `order` / `transaction` / `custody_movement` |
| target_id | int | id |
| **Основание** | | |
| basis | enum | `sanction_match`, `fr_request`, `kyt_high_risk`, `manual_compliance` |
| basis_details | text | — |
| **Workflow** | | |
| status | enum | `suspended` (active) → `released` (возобновлён) | `reported_to_fiu` (отправлен в ФР) |
| suspended_at, suspended_by_user_id | datetime, FK User | COMPLIANCE_OFFICER+ |
| released_at, released_by_user_id | datetime, FK User | — |
| release_reason | text | — |
| fiu_message_id | int (FK FIUMessage из 2.4, nullable) | Если статус `reported_to_fiu` |
| **Сроки** | | |
| max_suspension_until | datetime | По умолчанию `suspended_at + 2 months` (ПЗМ § 12) |
| created_at, updated_at, retention_until | datetime | — |

#### FSM FrozenOperation

```
              ┌──────────────┐
              │  SUSPENDED   │ ◄─── создан COMPLIANCE_OFFICER'ом или
              └──┬────────┬──┘       автоматически по триггеру
                 │        │
       release   │        │ escalate_to_fiu
                 │        │
                 ▼        ▼
         ┌──────────────┐ ┌────────────────┐
         │   RELEASED   │ │REPORTED_TO_FIU │ ◄─── СПО создано в 2.4;
         └──────────────┘ └────────────────┘       перешло во владение ФР
```

### Hooks при создании FrozenAccount/FrozenOperation

При создании FrozenAccount(client_id=X) — все активные Order/Transaction клиента X в статусах `submitted/under_review/approved/executing` автоматически получают связанные `FrozenOperation` со статусом `suspended` (каскад). Каждый — отдельная запись.

При создании FrozenOperation(target_type=order) — Order переходит в статус `FROZEN`.

### Регуляторные привязки

- стр. 140 (незамедлительное приостановление) — FrozenOperation, hook 4-5 в pre-submit
- стр. 141 (уведомление ФР в течение 3 ч) — связь с FIUMessage (2.4) с deadline = suspended_at + 3h
- стр. 142 (срок 2 месяца) — `frozen_until = frozen_at + 60 days`; scheduled job контролирует
- стр. 143-144 (журнал замороженных средств; заморозка всех средств лица) — FrozenAccount с `target_type=client`
- стр. 145 (спец. счёт) — `special_account_ref` + TenantSettings
- стр. 146 (автоматическая блокировка операций) — pre-submit hook 4
- стр. 148 (размораживание только по решению ФР/суда) — `unfreeze_decision_doc_id` обязателен
- стр. 149 (уведомление ФР о размораживании 1 раб. день) — связь с FIUMessage (2.4)
- стр. 150 (поля сообщения о замораживании) — стандартный payload генерируется FIUMessage в 2.4

---

## 2.3.9 SuspiciousActivityFlag

**Назначение:** промежуточный слой между обнаруженной аномалией и формальным сообщением в ФР. Позволяет офицеру dismiss ложные срабатывания с обоснованием БЕЗ создания записи в ГСФР.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Цель флага** | | |
| target_type | enum | `transaction` / `order` / `client` / `wallet_address` |
| target_id | int | id |
| **Источник** | | |
| flag_reason | enum | `threshold_exceeded` (Q11), `kyt_high_risk` (KYT провайдер), `structuring_detected` (smurfing-эвристика), `night_time_pattern` (дроппер 26/п), `dropper_pattern` (дроппер 26/п), `sanctions_match` (санкции), `manual_officer` (ручная пометка), `freeze_basis` (триггер заморозки), `pep_high_risk` (PEP-связь), `hrc_counterparty` (ВРС-страна), `other` |
| flag_details | JSON | Контекст (`threshold_check_id`, `kyt_provider_response`, ...) |
| flagged_by | string | `user_id:N` или `system:rule_name` (например, `system:threshold_check`) |
| flagged_at | datetime | — |
| **Workflow** | | |
| status | enum | FSM ниже |
| resolved_by_user_id | int (FK User) | COMPLIANCE_OFFICER+ |
| resolved_at | datetime | — |
| resolution | enum | `dismissed` / `escalated_to_fiu` / `escalated_to_freeze` |
| resolution_notes | text | Обоснование dismissal или эскалации |
| escalated_fiu_message_id | int (FK FIUMessage из 2.4, nullable) | — |
| escalated_frozen_operation_id | int (FK FrozenOperation, nullable) | — |
| **Сервисное** | created_at, retention_until (Q12) | — |

### FSM SuspiciousActivityFlag

```
              ┌──────────┐
              │  ACTIVE  │ ◄─── флаг создан (системой или офицером)
              └──┬────┬──┘
                 │    │
     dismiss_FP  │    │ escalate (to_fiu / to_freeze)
                 │    │
                 ▼    ▼
        ┌──────────┐ ┌──────────────┐
        │DISMISSED │ │ ESCALATED    │ ◄── создан FIUMessage и/или
        └──────────┘ └──────────────┘     FrozenOperation в 2.4
```

### Регуляторные привязки

- стр. 122 (постоянная проверка соответствия операций профилю) — система создаёт флаги по различным правилам
- стр. 123 (выявление операций без экономического смысла) — `flag_reason=manual_officer` после ручного анализа
- стр. 124 (коды индикаторов 40001-40088) — связь с `Transaction.operation_code_kg` через flag_details
- стр. 126-129 (детектор дробления, ночного времени, дроппер) — `flag_reason ∈ {structuring_detected, night_time_pattern, dropper_pattern}`
- стр. 130 (теги AML/KYT-провайдера) — `flag_reason=kyt_high_risk` с провайдерскими тегами в `flag_details`
- стр. 131 (уведомление офицера о срабатывании детектора) — каждый создаваемый флаг порождает Notification (2.1.9) для COMPLIANCE_OFFICER

---

## RBAC матрица для операционного домена

Расширение матрицы 2.1.3 со специфичными permissions.

| Permission / Role | SUP | TA | CH | CO | BOO | BOH | CL | RA | RO |
|---|---|---|---|---|---|---|---|---|---|
| **Order** |
| Order.create_self_draft | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ |
| Order.create_on_behalf | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Order.submit | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | self | ⛔ | ⛔ |
| Order.cancel_own_draft | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | self | ⛔ | ⛔ |
| Order.review | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | 👁 |
| Order.approve_normal_risk | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Order.approve_high_risk | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Order.reject | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Order.assign_back_office | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| Order.read_own | ⛔ | ⛔ | 👁 | 👁 | 👁 | 👁 | self | 👁 | 👁 |
| Order.read_all | 👁 | ⛔ | 👁 | 👁 | 👁 | 👁 | ⛔ | 👁 | 👁 |
| **Transaction** |
| Transaction.start_execution | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.confirm_execution | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.record_exchange_rate | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.attach_banks | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.mark_failed | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.reverse | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| Transaction.read_own | ⛔ | ⛔ | 👁 | 👁 | 👁 | 👁 | self | 👁 | 👁 |
| Transaction.read_all | 👁 | ⛔ | 👁 | 👁 | 👁 | 👁 | ⛔ | 👁 | 👁 |
| **CustodyMovement** |
| CustodyMovement.initiate | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| CustodyMovement.sign | ⛔ | ⛔ | ⛔ | ⛔ | ✅ (≤ tenant_threshold) | ✅ | ⛔ | ⛔ | ⛔ |
| CustodyMovement.broadcast | ⛔ | ⛔ | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| **WalletAddress** |
| WalletAddress.create | ⛔ | ⛔ | ✅ | ✅ | ✅ | ✅ | self_external | ⛔ | ⛔ |
| WalletAddress.whitelist | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| WalletAddress.deactivate | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ |
| **FrozenAccount / FrozenOperation** |
| FrozenAccount.create | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FrozenAccount.unfreeze | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FrozenOperation.suspend | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FrozenOperation.release | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FrozenOperation.escalate_to_fiu | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **SuspiciousActivityFlag** |
| Flag.create_manual | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Flag.dismiss | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Flag.escalate | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **ThresholdCheck / ExchangeRateSnapshot / CounterpartyBank** |
| (создаются автоматически или операторами в рамках исполнения; не требуют отдельных permissions) |  |  |  |  |  |  |  |  |  |

Ключевое: разделение функций (ст. 24 ЗАМ) формализуется так:
- Создание/исполнение операций (BOO, BOH) и их одобрение в compliance (CH, CO) — **разные люди в разных ролях**.
- Approval high-risk Order'а — только COMPLIANCE_HEAD (двойной уровень).
- Заморозка/разморозка — только COMPLIANCE_HEAD (нет у COMPLIANCE_OFFICER).

---

## State machines (сводная таблица 2.3)

| Сущность | FSM | Финальные состояния |
|---|---|---|
| Order | draft → submitted → under_review → (waiting_for_rfi ↔) → approved → executing → completed → settled | settled, rejected_*, cancelled, expired, frozen |
| Transaction | pending → executing → completed → reconciled | reconciled, failed, reversed, disputed |
| CustodyMovement | requested → signed → broadcasted → confirmed → settled | settled, failed, cancelled |
| FrozenAccount | frozen → partially_unfrozen → unfrozen | unfrozen, expired_2_months |
| FrozenOperation | suspended → released / reported_to_fiu | released, reported_to_fiu |
| SuspiciousActivityFlag | active → dismissed / escalated | dismissed, escalated |

---

## Соответствие чек-листу 01-regulatory-checklist.md

Подшаг 2.3 закрывает следующие строки:

| Строки | Тема | Закрытие в 2.3 |
|---|---|---|
| 97a-97c | Услуги VASP (купля-продажа, обмен, перевод) | Order.order_type + Transaction (2.3.1, 2.3.2) |
| 98 | Реестр всех операций со всеми условиями | Transaction (2.3.2) |
| 99 | Момент исполнения с точностью до минут | Transaction.executed_at (UTC datetime) |
| 100 | Уникальный код операции | Transaction.operation_code_kg |
| 101 | Сумма, валюта, курс к KGS | Transaction (fiat_in/out, va_amount, kgs_equivalent) + ExchangeRateSnapshot (2.3.6) |
| 102 | Контрагент (имя, счёт, банк, страна) | CounterpartyBank (2.3.5) + Transaction.client_bank_id/operator_bank_id |
| 103 | Привязка к заявке клиента | Order.id + Transaction.order_id |
| 104 | Электронное подтверждение клиенту | Notification (2.1.9) при `Transaction.completed` (механизм генерации в шаге 4) |
| 105 | Только безналичный расчёт | Pre-submit hook 1 + валидация fiat-полей |
| 106 | Адрес кошелька | WalletAddress (2.3.3) + Transaction.source_wallet_id/target_wallet_id |
| 107 | Хеш транзакции | CustodyMovement.blockchain_tx_hash |
| 108 | Запрет анонимных сделок | Pre-submit hook 6 (wallet_validity) + проверка owner_type |
| 109 | Запрет privacy wallets без идентификации | Pre-submit hook 8 (kyt_check) с проверкой `kyt_tags` |
| 110 | Запрет NFT | Pre-submit hook (валидация target_asset) — детально в шаге 4 |
| 111 | Запрет предоплаченных карт | Pre-submit hook (валидация source_bank типа) |
| 112 | Запрет операций с казино | KYT-теги + риск-модель (домен 2.4); SuspiciousActivityFlag |
| 113 | Запрет операций с активами высокого скоринга | Pre-submit hook 8 + WalletAddress.kyt_risk_score |
| 114c | Услуга перевода ВА | Order.order_type=transfer_va + CustodyMovement |
| 114d-f | Custody — сохранность, самостоятельный вывод, перемещение по поручению | WalletAddress.key_holder + CustodyMovement (с signature_payload Q14) |
| 114g3 | Локальное логирование операций через внешний custody | CustodyMovement.custody_provider, external_movement_id |
| 114g4 | Compliance-проверки на операции через внешний custody | Pre-submit hooks Order |
| 114g5 | Audit trail запросов к внешнему custody API | CustodyMovement.external_request_payload, external_response_payload |
| 114g6 | Retention локальных данных | Q12: retention_until на CustodyMovement, Transaction |
| 115-117 | Travel Rule (отправитель, получатель, неотъемлемость) | WalletAddress.travel_rule_payload |
| 118-119 | Мониторинг переводов с отсутствующей информацией; отклонение | Pre-submit hook (WalletAddress validation для Travel Rule) |
| 120 | Хранение информации о переводах ≥ 5 лет | Q12 retention |
| 122 | Постоянная проверка соответствия операций профилю | SuspiciousActivityFlag + risk-domain в 2.4 (hooks) |
| 123 | Выявление операций без экономического смысла | SuspiciousActivityFlag (manual_officer) |
| 124 | Коды индикаторов 40001-40088 | Transaction.operation_code_kg + flag_details (детали в 2.4) |
| 125 | Коды операций 10000-38099 | Transaction.operation_code_kg |
| 126-129 | Детекторы (дробление, ночное время, дроппер) | SuspiciousActivityFlag (flag_reason) — логика детекторов в 2.4 |
| 131 | Уведомление офицера о срабатывании | Notification (2.1.9) на каждый SuspiciousActivityFlag |
| 132 | Pre-transaction sanctions screening | Pre-submit hook 7 (логика в 2.4) |
| 137 | Pre-transaction screening контрагента/wallet | Pre-submit hook 7-8 |
| 139 | Автоматическая блокировка при совпадении | Pre-submit hook 7 (fail) → Order = REJECTED_BY_COMPLIANCE |
| 140 | Незамедлительное приостановление | FrozenOperation (2.3.8) |
| 141 | Уведомление ФР в 3 ч | связь FrozenOperation → FIUMessage (2.4) с deadline |
| 142 | Срок 2 месяца | FrozenOperation.max_suspension_until + FrozenAccount.frozen_until |
| 143 | Журнал замороженных средств | FrozenAccount (2.3.8) |
| 144 | Заморозка всех средств лица | FrozenAccount.target_type = client |
| 145 | Спец. счёт | FrozenAccount.special_account_ref + TenantSettings |
| 146 | Автоматическая блокировка операций по замороженным | Pre-submit hook 4-5 |
| 147 | Заморозка процентов и поступлений | scheduled job (логика в шаге 4); хранение в FrozenAccount |
| 148 | Размораживание только по решению ФР/суда | FrozenAccount.unfreeze_decision_doc_id |
| 149 | Уведомление ФР о размораживании | связь с FIUMessage (2.4) |
| 150 | Поля сообщения о замораживании | FIUMessage payload (2.4) |
| 151 | Целевые финансовые санкции в 3 ч | связь FrozenOperation → FIUMessage с deadline = suspended_at + 3h |
| 169 | СПО по операциям сверх порога — 3 раб. дня | ThresholdCheck → SuspiciousActivityFlag → FIUMessage с deadline |
| 176 | Пороги операций | RiskSettings.threshold_operations + ThresholdCheck.threshold_kgs |

**Итого: ~40 строк чек-листа закрыты в 2.3.**

---

## Открытые вопросы 2.3

### Q-2.3-A. Дробление Transaction при partial fill — отдельные записи или массив

Order на 100 BTC исполняется 3 транзакциями. Текущее решение — 3 отдельных Transaction с одним order_id (1:many). Альтернатива — одна Transaction с массивом fills.

**Текущая позиция:** 3 отдельных Transaction. Каждая — своя запись в реестр операций (как требует ПОВА), своя отметка времени, свой курс. Валидно для аудита и Q5 Excel.

### Q-2.3-B. Хранение blockchain_tx_hash для failed onchain — Transaction или CustodyMovement

Если broadcast прошёл, но транзакция была reverted/replaced (RBF), `blockchain_tx_hash` есть, но не финальный. Где хранить?

**Текущая позиция:** в `CustodyMovement.blockchain_tx_hash` сохраняется последний попытанный hash; статус FAILED; `failure_reason` поясняет. История попыток — в `external_response_payload` JSON.

### Q-2.3-C. Reverse-операции (refund) — отдельный type или связь parent_transaction_id

Когда отзывается transaction (банк возвращает платёж после completed) — это новая Transaction со ссылкой на родителя или просто status=reversed?

**Текущая позиция:** обе сущности. Исходная Transaction → status=reversed, `Transaction.reverse_transaction_id` ссылается на новую Transaction (тип `system_adjustment` с inverted amounts). Это даёт чистый аудит.

### Q-2.3-D. Reconciliation с банковскими выписками — scope текущего этапа

Современные ОВА сверяют свою БД с банковскими выписками для обнаружения расхождений. Это отдельная функциональность.

**Не блокирует 2.3**, выносится в Q-2.3-D как future scope. Минимально на 2.3 — поле `Transaction.status = reconciled` обозначает успешную сверку (механизм сверки — шаг 4 или позже).

### Q-2.3-E. Продление 2-месячного срока FrozenAccount

ПЗМ § 12 — «не более двух месяцев». Можно ли продлить при наличии оснований? Прямой нормы нет; практика ОВА — связь с конкретным основанием (расследование, продлённый запрос ФР).

**Текущая позиция:** на 2.3 — поле `frozen_until`; продление через `RetentionExtension`-механизм (2.1.7) с обязательным `basis_doc_id` и подписью COMPLIANCE_HEAD. После 2 месяцев без продления → status `expired_2_months`, требует ручного вмешательства. Окончательное решение — на шаге 4.

### Q-2.3-F. Курс в агрегате 24h ThresholdCheck

При расчёте aggregate_24h: каждая операция имеет свой курс на момент исполнения. Какой курс использовать для агрегата?

**Текущая позиция:** `aggregate_amount_kgs = Σ(transaction.kgs_equivalent)`, где каждая `kgs_equivalent` зафиксирована своим `ExchangeRateSnapshot`. Курсы НЕ нормализуются. Это семантически корректно (каждая операция считается по своему курсу) и аудит-friendly.

### Q-2.3-G. FSM Order при partial fill

Когда Order в EXECUTING получил первую completed Transaction, но осталось ещё — статус остаётся EXECUTING (логично) или появляется промежуточный PARTIALLY_FILLED?

**Текущая позиция:** статус EXECUTING остаётся до COMPLETED (когда все Transactions completed). Доп. поле `Order.fill_progress_percent` (рассчитывается из суммы Transaction.va_amount / Order.requested_amount) для UI.

### Q-2.3-H. Travel Rule payload — стандарт IVMS101?

ВПР рекомендует IVMS101 как формат для Travel Rule. Но провайдеры (Notabene, Sumsub Travel) могут иметь свои API.

**Не блокирует 2.3**, требует решения на шаге 4 при выборе Travel Rule провайдера. Сейчас `WalletAddress.travel_rule_payload` — JSON произвольной структуры; нормализация — позже.

### Q-2.3-I. Order без Client (anonymous deposit detection)

Бывает, что входящая VA-транзакция приходит на адрес ОВА без явного Order (клиент перевёл «впрок»). Как моделировать?

**Текущая позиция:** Transaction может существовать без Order (`order_id = null`, `transaction_type = system_adjustment` или новый `unattributed_deposit`). При появлении такого депозита — автоматически создаётся SuspiciousActivityFlag (`flag_reason = unattributed_deposit`) для compliance review. На шаге 4 — UX для ассоциации с клиентом постфактум.

### Q-2.3-J. Тип ключа: Wallet или Transaction для key_holder

`key_holder` (Q13) сейчас на уровне WalletAddress. Но для одного и того же кошелька могут быть разные операции с разной моделью (например, custody-перевод vs broadcast клиентом). Может ли key_holder отличаться per-operation?

**Текущая позиция:** key_holder фиксируется на WalletAddress (характеристика владельца). Если бизнес-модель меняется (перевод управления ключом) — создаётся новая WalletAddress-запись со ссылкой `previous_address_id` (для аудита). Не блокирует.

### Q-2.3-K. Изменение Order после submit

Может ли клиент отредактировать Order после submitted (например, изменить target_address до approval)?

**Текущая позиция:** нет. После submit — только cancel и создание нового Order. Это согласуется с требованием иммутабельности подписи (Q14). Edge case — опечатка в адресе — решается через cancel + create new.

### Q-2.3-L. Дублирование операций между ОВА и custody-провайдером

Если используется Fireblocks, у него есть свой реестр операций. Дублируем ли мы 100% или только то, что инициировано через нас?

**Текущая позиция:** дублируем 100% операций, которые проходят через наши кошельки (даже если инициированы вне ОВА — например, прямой ввод клиента на наш адрес). Это требование 114g3 чек-листа — все операции через наш custody должны быть в нашем реестре. Реализация — через webhook/polling от провайдера в шаге 4.

---

# 2.4 Compliance-домен

## Контекст и границы

Этот подшаг проектирует **слой compliance-проверок** — sanctions screening, риск-скоринг (Q3 два уровня), KYT-проверки кошельков (Q10), Travel Rule сообщения, формирование кандидатов в ФР (СПО/ПО) с экспортом в Excel (Q5), мониторинг высокорискованных стран, детекторы подозрительной активности. Что **НЕ входит**: API регулятора, дашборды для регулятора, отчётность ОВА в УО — это **2.5**. Конкретные алгоритмы fuzzy-matching и SLA-трекинг — техника шага 4.

**Что есть в коде сейчас:**
- [`sanctions_models.py:18`](backend/app/sanctions_models.py#L18) — `SanctionsList` (метаданные списков)
- [`sanctions_models.py:32`](backend/app/sanctions_models.py#L32) — `SanctionEntry` (запись в списке; минимальный набор полей)
- [`models.py:609`](backend/app/models.py#L609) — `SanctionsCheck` (история проверок с officer_decision)
- [`sanctions.py`](backend/app/sanctions.py) — fuzzy-matching с транслитерацией (3 уровня: confirmed ≥92%, probable ≥78%, possible ≥60%)
- [`sanctions_loader.py`](backend/app/sanctions_loader.py) — парсеры списков (ГСФР×4, UN, OFAC, EU, UK)
- [`models.py:659`](backend/app/models.py#L659) — `RiskScoringHistory` (история риск-оценок: 4-блочная VASP-модель с override-полями)
- [`models.py:846`](backend/app/models.py#L846) — `HighRiskCountry` + `HighRiskCountryAudit` (список ВРС с журналом)

**Что НЕТ в коде** (новое на 2.4): SanctionsMatchDecision (формализация решений офицера с двойной подписью), CompositeApproval (общая сущность для ✋-решений), KYTCheckResult (унифицированный результат от провайдеров Q10), TravelRuleMessage (перенос из 2.3 по Q-2.3-O), FIUMessage (полная FSM с SLA-таймерами), FIUExportBatch (Excel-реестр Q5), RFIInvolvement, HighRiskCountryCheck (per-target проверки), AnomalyDetector (декларативная модель детекторов Q1).

**Что меняется на 2.4:**
- `SanctionsList` сохраняется как есть; добавляется `version_no` для отслеживания снимков списка (regulatory snapshot для аудит/расследования).
- `SanctionEntry` → переименовывается в **SanctionedEntity** концептуально; расширяется набор полей под требования VASP-сценария (vessel/aircraft, identifiers structured).
- `SanctionsCheck` рефакторится: `target_type` расширяется (был `subject_type` для client/ubo/director/...; теперь добавляются wallet/transaction/order/counterparty); officer_decision выносится в отдельную сущность `SanctionsMatchDecision` (с двойной подписью при positive_match).
- `RiskScoringHistory` декомпозируется в **RiskAssessment** (общее) + **RiskBasic61p** + **RiskAdvancedVASP** + **RiskOverride** (отдельные сущности по моделям и override-механизму, с версионированием через `RiskSettings`).
- `HighRiskCountry` сохраняется; добавляется per-проверка сущность `HighRiskCountryCheck` (для аудита).
- Существующая `Transaction.is_mandatory_control / auto_indicators / manual_indicators / risk_score / status` (FIU-классификация) — **переносится** в `FIUMessage` + `SuspiciousActivityFlag` (последний расширяется из 2.3.9).

## Карта сущностей 2.4

```
                        [SANCTIONS]
              ┌──────────────────────────┐
   ┌──────────┤  SanctionsList (ref.)    │ ← OFAC, EU, UN, UK, ГСФР×4
   │  N       └──────────┬───────────────┘   с версионированием
   │                     │ 1
   │ entries             │
   │                     │ N
   │            ┌────────▼────────┐
   │            │ SanctionedEntity│ ← запись в списке (FL/UL/vessel/aircraft)
   │            │   (refactor)    │
   │            └─────────────────┘
   │
   │ N
   ▼
┌────────────────┐  on positive  ┌──────────────────────┐
│ SanctionsCheck │ ─────────────►│SanctionsMatchDecision│ ← двойная подпись CO+CH
│   (refactor)   │               │   (CompositeApproval)│
└──┬─────────────┘               └──────────┬───────────┘
   │ если match                              │ if positive
   │                                         │ → создаёт FIUMessage
   ▼                                         │
┌─────────────────┐                          ▼
│SuspiciousActiv. │ ◄─── из 2.3.9         ┌──────────────┐
│  Flag (extens.) │                       │ FIUMessage   │
└─────────────────┘                       │  (СПО/ПО)    │
                              ┌──escalate ┘ FSM + SLA    │
                              │           └──┬───────────┘
                              │              │ N
                       [DETECTORS]            │ M
                  ┌─────────────────┐         ▼
                  │ AnomalyDetector │  ┌──────────────────┐
                  │  (configurable) │  │ FIUExportBatch   │
                  └────────┬────────┘  │  (Excel by Q5)   │
                           │ trigger    └──────────────────┘
                           ▼
                  ┌─────────────────┐
                  │SuspiciousActiv. │
                  │     Flag        │
                  └─────────────────┘

           [RISK SCORING — Q3 два уровня]
                ┌────────────────────┐
                │  RiskAssessment    │ ← общая запись каждой оценки
                │  (with model_ver-  │   с версионированием через
                │   sion fr/Settings)│   RiskSettings (2.1.6)
                └─┬────┬─────┬───────┘
                  │    │     │
              N   │  N │   N │
                  │    │     │
                  ▼    ▼     ▼
        ┌──────────┐ ┌─────────┐ ┌──────────┐
        │RiskBasic │ │RiskAdv- │ │RiskOver- │ ← триггер CRITICAL
        │  61p     │ │ ancedV- │ │ ride (Q4)│   без подсчёта
        └──────────┘ │ ASP (Q3)│ └──────────┘
                     └─────────┘ + CompositeApproval

                   [KYT — Q10]
              ┌──────────────────┐
              │ KYTCheckResult   │ ← унифицированный ответ
              │  (Ranex/Chana-   │   от любого провайдера
              │   lysis/TRM/...) │
              └────────┬─────────┘
                       │ feeds
                       ▼ ↑
              WalletAddress.kyt_*
              Transaction.va_kyt_*

                  [TRAVEL RULE]
              ┌──────────────────┐
              │TravelRuleMessage │ ← перенос Q-2.3-O
              │   (FSM)          │   originator+beneficiary
              └──────────────────┘   IVMS101 payload

              [HIGH-RISK COUNTRIES]
      ┌──────────────────┐   ┌─────────────────────┐
      │ HighRiskCountry  │ ◄─┤HighRiskCountryCheck │ ← per-target
      │   (refactor)     │   │   (audit trail)     │
      └──────────────────┘   └─────────────────────┘

           [SHARED]
      ┌──────────────────┐
      │CompositeApproval │ ← двойная подпись для
      │ (cross-domain)   │   override, FIU.confirm,
      └──────────────────┘   Risk.update_settings и др.
```

---

# 2.4.A Sanctions Screening

## 2.4.1 SanctionsList (рефакторинг)

**Назначение:** метаданные санкционного списка (ГСФР×4, UN, OFAC, EU, UK OFSI). В коде уже есть; на 2.4 — расширение для версионирования (snapshot для аудита).

### Атрибуты

| Имя | Тип | Описание | Дельта от кода |
|---|---|---|---|
| id | int (PK) | — | — |
| code | string(20), unique | `OFAC`, `EU`, `UN`, `UK_OFSI`, `GSFR_KG_PFT`, `GSFR_KG_PLPD_FL`, `GSFR_KG_PLPD_UL`, `GSFR_KG_CONSOLIDATED` | — |
| name | string(255) | — | — |
| source_url | string(500) | — | — |
| **last_updated** | datetime | — | — |
| **last_synced_at** | datetime | Когда последний раз tenant обновил у себя | НОВОЕ |
| **current_version_no** | int | Возрастающий счётчик версий списка | НОВОЕ |
| **schema_version** | string | Формат данных (v1/v2 — для парсера) | НОВОЕ |
| entry_count | int | Количество SanctionedEntity в текущей версии | — |
| is_active | bool | Активен в screening | — |
| created_at | datetime | — | — |

### Новая сущность: SanctionsListSnapshot

**Назначение:** при каждом `last_synced_at` сохраняется снимок (`current_version_no`) — какие записи были в списке на конкретную дату. Нужно для регуляторного объяснения «по какому списку вы проверяли клиента 5 лет назад».

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| sanctions_list_id | int (FK SanctionsList) | — |
| version_no | int | UNIQUE (list_id, version_no) |
| synced_at | datetime | Время снимка |
| entry_ids_snapshot | JSON: array of int | id всех `SanctionedEntity`, активных на момент снимка |
| source_file_hash | string(64) | SHA-256 исходного файла списка |
| diff_summary | JSON | `{added: N, removed: M, modified: K}` против предыдущей версии |

> Снимки tenant-agnostic — общий для всех tenants, поскольку списки ГСФР/UN/OFAC одни и те же. Хранятся под retention 7 лет (Q12).

### Регуляторные привязки

- стр. 133 (загрузка санкционных списков из 4 источников) — собственно сущность
- стр. 138 (срок действия проверки) — `SanctionsCheck.list_version_no` (см. 2.4.3) ссылается на snapshot для воспроизводимости

---

## 2.4.2 SanctionedEntity (рефакторинг SanctionEntry)

**Назначение:** одна запись в санкционном списке. Существующая `SanctionEntry` имеет минимальный набор полей; для VASP-сценария требуется поддержка vessel/aircraft и структурированных идентификаторов.

### Атрибуты

| Имя | Тип | Описание | Дельта |
|---|---|---|---|
| id | int (PK) | — | — |
| sanctions_list_id | int (FK SanctionsList) | (Заменяет `list_code` string в коде) | РЕФАКТОР |
| reference_number | string(100) | Внутренний № в списке источника | — |
| **entity_type** | enum | `individual` / `legal_entity` / `vessel` / `aircraft` / `address_only` | РАСШИРЕН |
| **Имена и переводы** |  |  |  |
| primary_name | string(500) | Канонический | — |
| primary_name_normalized | string(500) | Lowercase + транслит | — |
| names_all | JSON | `[{name, lang, transliteration_method, source}]` — все варианты для fuzzy matching | РАСШИРЕНО |
| **Личные данные (для individual)** |  |  |  |
| date_of_birth | string(50) | Строкой (разные форматы в источниках) | — |
| place_of_birth | string(255) | НОВОЕ | НОВОЕ |
| nationalities | JSON: array of string | Множественное гражданство | РАСШИРЕНО |
| gender | string(10) | НОВОЕ | НОВОЕ |
| **Идентификаторы** |  |  |  |
| identifiers | JSON: `[{type, value, country}]` | `passport_*`, `national_id_*`, `tax_id_*`, `lei`, `bic`, `mmsi` (для vessel), `imo` (для vessel/aircraft) | РЕФАКТОР существующего `passport_numbers` |
| **Адреса** |  |  |  |
| addresses | JSON: array of {country, region, city, address, period} | Все адреса с историей | РАСШИРЕНО |
| **Криптовалютные адреса (новое)** |  |  |  |
| crypto_addresses | JSON: `[{address, network, designation_date}]` | Например, OFAC SDN List публикует BTC/ETH адреса | НОВОЕ |
| **Санкционный контекст** |  |  |  |
| designation_date | datetime | Когда внесён в список | — |
| removal_date | datetime, nullable | Когда исключён | — |
| sanction_program | string(100) | Программа (например, `OFAC SDN`, `EU Russia 833/2014`) | НОВОЕ |
| basis | text | Основание санкций | НОВОЕ |
| additional_info | text | — | — |
| raw_data | text | Оригинальный XML/JSON фрагмент | — |
| **Сервисное** |  |  |  |
| created_at | datetime | — | — |
| **Soft-delete** | `removed_at` (для удалённых из списка с сохранением для аудита) | НОВОЕ |

### Регуляторные привязки

- стр. 134 (fuzzy-поиск с транслитерацией) — `names_all` + поле `primary_name_normalized`
- стр. 137 (pre-tx screening контрагента / wallet-owner) — поле `crypto_addresses` для проверки кошельков напрямую

---

## 2.4.3 SanctionsCheck (рефакторинг)

**Назначение:** факт проверки одного субъекта против санкционных списков. Существующая запись расширяется: `target_type` теперь покрывает не только client/ubo/director/etc, но и wallet/transaction/order/counterparty.

### Дельта от существующей SanctionsCheck

| Поле | Сейчас | Изменение |
|---|---|---|
| `subject_type` | client/ubo/director/pep_family/pep_associate/signatory | **переименовывается в `target_type`**, расширяется до `wallet`, `transaction`, `order`, `counterparty_bank`, `vasp_counterparty`, `crypto_address` |
| `subject_id`, `subject_name` | есть | переименовываются в `target_id`, `target_name_snapshot` |
| `lists_checked` | JSON array of code | дополняется `lists_versions_snapshot` (JSON: `{list_code: version_no}`) — для воспроизводимости |
| `result` | clear/match/possible_match | сохраняется (3 уровня: clear, possible_match, match с tier confirmed/probable) |
| `matches` | JSON | сохраняется (детали matches: each match → entity_id, score, tier, matched_field) |
| `officer_decision`, `officer_notes`, `officer_id`, `officer_decided_at` | inline | **переносится в SanctionsMatchDecision (2.4.4)** для формализации workflow и двойной подписи |
| `checked_by` | user_id | оставляется; для системных проверок sentinel `'system'` |

### Атрибуты SanctionsCheck (после рефакторинга)

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id, client_id` (FK Client, nullable — для system-checks без клиента, например, проверка нового кошелька) |
| **Цель** | `target_type` (расширенный enum), `target_id, target_name_snapshot, target_dob_snapshot` (если individual) |
| **Контекст** | `triggered_by` (enum: pre_submit_hook_7, periodic_rescreening, list_update, manual_officer, onboarding), `triggered_by_event_id` (например, Order.id для pre_submit) |
| **Снимок** | `lists_checked` (JSON: array of list_code), `lists_versions_snapshot` (JSON: `{list_code: version_no}`) |
| **Результат** | `result` (enum: clear, possible_match, match), `matches` (JSON: array of match details) |
| **Cache** | `cache_valid_until` (datetime) — Q-2.3-R: TTL для кэша; пересчёт по событиям unfreeze, list_updated, officer_dismiss |
| **Сервисное** | `checked_at, checked_by_user_id` (или sentinel `system`), `notes`, `retention_until` (Q12 = 7 лет) |

### Hook 7 — Pre-transaction sanctions screening (детально)

При переходе `Order.draft → submitted` в pipeline (2.3.1) создаётся серия SanctionsCheck'ов:

1. **Client check** — если в кэше нет валидного результата за < TTL и без событий-инвалидаторов, повторно проверяется клиент. Цель: получить актуальный статус.
2. **Wallet checks** — `target_address_id` и `source_address_id` (если заданы) проверяются как `target_type=wallet` (по `WalletAddress.address` против `crypto_addresses` в списках).
3. **VASP-counterparty check** — если `target_type=transfer_va` и `WalletAddress.is_vasp_owned`, отдельная проверка `target_type=vasp_counterparty` по naming.
4. **Counterparty-bank check** — если есть `client_bank_id` (для fiat-операций), проверяется `target_type=counterparty_bank` (банк по BIC).

Hook возвращает:
- **PASS** — все checks → result=clear
- **WARN** — есть possible_match хотя бы на одном subject → требует UNDER_REVIEW (Order переходит)
- **FAIL** — есть match хотя бы на одном subject → Order сразу REJECTED_BY_COMPLIANCE; одновременно создаётся FIUMessage candidate (стр. 170 — 3 ч SLA срочного уведомления)

### Кэширование (Q-2.3-R)

- TTL по умолчанию: 24h для check `target_type=client`, 1h для `target_type=wallet`, 0 (без кэша) для `target_type=transaction/order` (всегда свежо).
- Инвалидация по событиям: `list_updated` (любое обновление SanctionsList), `client.anketa_updated`, `wallet.kyt_check_completed`.
- Реализация — `cache_valid_until` поле + проверка перед использованием закэшированного результата.

### Регуляторные привязки

- стр. 135 (проверка клиента, БВ, директоров, доверенных лиц, ПДЛ-связанных) — `target_type` enum покрывает всех
- стр. 137 (pre-tx screening контрагента / wallet-owner) — Hook 7
- стр. 138 (срок действия проверки) — `cache_valid_until`
- стр. 139 (автоматическая блокировка операции при совпадении) — Hook 7 на FAIL

---

## 2.4.4 SanctionsMatchDecision

**Назначение:** формализация решения офицера по possible_match / match. Заменяет inline-поля `SanctionsCheck.officer_*`. При `decision = positive_match` требует двойной подписи (через CompositeApproval — 2.4.9).

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| sanctions_check_id | int (FK SanctionsCheck) | — |
| **Решение** |  |  |
| decision | enum | `false_positive` / `positive_match` / `needs_more_info` / `escalated_to_freeze` |
| decided_by_user_id | int (FK User) | COMPLIANCE_OFFICER+ |
| decided_at | datetime | — |
| justification | text | Обязательно при `false_positive` (объяснение почему не совпадение) и при `positive_match` (что делать дальше) |
| evidence_doc_ids | JSON: array of FK ClientDocument | Подтверждающие документы |
| **Двойная подпись (для positive_match)** |  |  |
| composite_approval_id | int (FK CompositeApproval, nullable) | Заполняется при `decision = positive_match` |
| **Workflow последствия** |  |  |
| created_freezing_id | int (FK FrozenAccount, nullable) | Если положительное → автоматическая заморозка |
| created_fiu_message_id | int (FK FIUMessage, nullable) | Если требует уведомления ФР → FIUMessage candidate |
| **Сервисное** | `created_at, retention_until` (Q12) | — |

### Workflow

```
SanctionsCheck.result = possible_match / match
            │
            ▼
COMPLIANCE_OFFICER review
            │
            ├─► decision=false_positive  ─►  closed (с обоснованием в justification)
            ├─► decision=needs_more_info ─►  открывается RFIRequest (2.2.13);
            │                                SanctionsCheck остаётся в pending;
            │                                после ответа — повторный review
            └─► decision=positive_match  ─►  ┌──────────────────────────────┐
                                             │ CompositeApproval pending    │
                                             │  ↓ approval by COMPLIANCE_HEAD│
                                             │ Auto: создаётся FrozenAccount │
                                             │       создаётся FIUMessage    │
                                             │  candidate с deadline=3h      │
                                             │       (стр. 170)              │
                                             └──────────────────────────────┘
```

### Регуляторные привязки

- стр. 136 (регистрация решения офицера) — собственно сущность
- стр. 170 (срочное уведомление 3 ч о санкционном совпадении) — связь с FIUMessage через `created_fiu_message_id`

---

# 2.4.B Risk-Scoring (Q3 — два уровня)

## 2.4.5 RiskAssessment

**Назначение:** общая запись каждой риск-оценки, привязанная к версии RiskSettings. Декомпозирует существующую `RiskScoringHistory` на семейство сущностей (общее + специализированное по уровню + override).

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id` |
| **Цель оценки** | `target_type` (enum: client, transaction, wallet, vasp_counterparty, order), `target_id` |
| **Тип модели** | `assessment_type` (enum: `basic_61p` / `advanced_vasp`) |
| **Версионирование (Q1, Q3)** | `risk_settings_version` (int) — какая версия `RiskSettings` использовалась; `risk_settings_id` (FK RiskSettings из 2.1.6) |
| **Результат** | `final_score` (Decimal 0-100), `level` (enum RiskLevel: low/medium/high/critical), `score_breakdown` (JSON: для basic_61p — high/low criteria counts; для advanced — block scores) |
| **Триггер** | `triggered_by` (enum: onboarding, periodic_review, transaction_completed, settings_changed, manual_re_eval, override_triggered) |
| **Override-флаг** | `override_triggered` (bool), `risk_override_id` (FK RiskOverride, nullable) |
| **Авторство** | `assessor_type` (enum: `system_auto`, `user_manual`), `assessor_user_id` (FK User, nullable для system) |
| **Manual override** | `manual_override` (bool), `manual_override_justification` (text), `manual_override_composite_approval_id` (FK CompositeApproval, nullable — required if manual_override) |
| **Сервисное** | `assessed_at, next_review_date, retention_until` (Q12) |

### Версионирование RiskSettings (Q3)

При изменении `RiskSettings` (через wizard в админке) — старые `RiskAssessment` записи остаются с прежним `risk_settings_version`. Новые оценки — по новой версии. Для целей пересчёта историй (например, регулятор просит перепроверить риски) — есть метод `recompute(target_id, at_datetime)` который использует `RiskSettings`, действовавшую на `at_datetime`.

### Регуляторные привязки

- стр. 178-181 (риск-уровень, зоны риска, override, 4-блочная VASP) — основная реализация в специализированных сущностях ниже
- стр. 75 (применять усиленные меры к high/critical) — связь с pre-submit hook 9 (Order)
- стр. 82 (запрет SDD при подозрениях) — поле `level=critical` блокирует переход на упрощённую процедуру

---

## 2.4.6 RiskBasic61p

**Назначение:** детализация риск-оценки **уровня 1** (Приказ ГСФР 61/п, обязательный для всех). Связана 1:1 с `RiskAssessment` (когда `assessment_type='basic_61p'`).

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| risk_assessment_id | int (FK RiskAssessment, unique) | 1:1 |
| **Критерии (детальный ответ по каждому)** |  |  |
| criteria_responses | JSON: `[{criterion_code, group, weight_at_eval, response: bool/value, contribution_to_score, source_evidence}]` | По каждому из ~14 high и ~12 low критериев |
| **Сводка** |  |  |
| high_criteria_triggered_count | int | Сколько high-критериев сработало |
| low_criteria_applicable_count | int | Сколько low-критериев применимо |
| calculated_score | Decimal | Балл по методике (формула из `RiskSettings.basic_61p_formula`) |
| **Связь с типологиями (НКО — гл. 3 61/п)** |  |  |
| nko_subcriteria_responses | JSON, nullable | Если client — НКО (ст. 1 п. 4 крит.) — расширенный набор НКО-критериев |
| **Сервисное** | `created_at` | — |

### Перечень критериев (для справки, источник правды — 61/п в действующей редакции с 26/п)

**Глава 1. Высокие риски — 16 критериев** (после 26/п): нерезидент с необычными обстоятельствами, подозрительные операции, непрозрачная структура, НКО, иностранный PEP, отсутствие информации о ЮЛ, ВРС-страна, запрос ФР, сомнительные документы, номинальные акционеры, интенсивный наличный оборот, необычная структура собственности, некоммерческий кооператив, игорная деятельность, **VPN/смена IP (новое 26/п)**, **быстрые переводы от разных лиц (новое 26/п)**.

**Глава 2. Низкие риски — 11 критериев** (после удаления § 3 п. 12 в 26/п): соответствующие требованиям финучреждения, публичные компании на бирже, госорганы и предприятия, страховые полисы с малой суммой, пенсионная система, оплата ЖКУ, налогов, интернета, такси, госуслуг, билеты (кроме международных).

**Глава 3. НКО** — отдельные критерии в `nko_subcriteria_responses`.

**Веса критериев** хранятся в `RiskSettings.basic_61p_weights` (Q3); фиксируются для конкретной версии и не переписываются.

### Регуляторные привязки

- стр. 178 (расчёт уровня риска по 61/п) — собственно сущность
- стр. 182-186 (новые критерии 26/п — VPN, дроппер, крипто-краудфандинг, оружие) — `criteria_responses` включает эти коды; их триггеры — детекторы (2.4.18)

---

## 2.4.7 RiskAdvancedVASP

**Назначение:** детализация риск-оценки **уровня 2** (4-блочная модель A+B+C+D для VASP-контрагентов). Опциональный модуль (`feature_flag.risk_advanced_vasp`). Связана 1:1 с `RiskAssessment` (когда `assessment_type='advanced_vasp'`).

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| risk_assessment_id | int (FK RiskAssessment, unique) | 1:1 |
| **Связь с VASP-клиентом** | `vasp_counterparty_id` (FK VASPCounterparty из 2.2.5) | — |
| **Подкритерии блоков (детально)** |  |  |
| block_a_subcriteria | JSON | A1 (юрисдикция), A2 (лицензия), A3 (UBO transparency), A4 (репутация, найдены ли ML/TF-расследования) |
| block_b_subcriteria | JSON | B1 (тип активов), B2 (SoF), B3 (миксеры), B4 (DEX) |
| block_c_subcriteria | JSON | C1 (объёмы), C2 (частота), C3 (география), C4 (контрагенты), C5 (пулы) |
| block_d_subcriteria | JSON | D1 (политики), D2 (сегрегация средств), D3 (отчётность), D4 (реакция на запросы) |
| **Сводка по блокам** |  |  |
| block_a_score | Decimal | 0-100 |
| block_b_score | Decimal | 0-100 |
| block_c_score | Decimal | 0-100 |
| block_d_score | Decimal | 0-100 |
| final_score | Decimal | (A+B+C+D)/4 |
| **Сервисное** | `created_at` | — |

### Связь с VASPCounterparty

Этот тип оценки доступен **только** для `Client.client_type='vasp_counterparty'`. Pre-validation: `RiskAssessment(target_type=client, ...).assessment_type='advanced_vasp'` → требует существования `VASPCounterparty` для `target_id`.

### Регуляторные привязки

- стр. 181 (4-блочная модель A+B+C+D) — собственно сущность
- Q3 (опциональный модуль) — `tenant.feature_flags.risk_advanced_vasp` контролирует доступность

---

## 2.4.8 RiskOverride

**Назначение:** запись о срабатывании override-триггера (Q4) с двойной подписью COMPLIANCE_OFFICER + COMPLIANCE_HEAD.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| risk_assessment_id | int (FK RiskAssessment) | Связь с оценкой |
| **Триггер** |  |  |
| override_trigger | enum | 10 значений из Q4 (B2.5, B3.4, B4.5, C4.5, C5.4, D1.5, D2.4, D3.5, A2.5, A4.5) |
| trigger_evidence | JSON | Что именно сработало (например, KYT-результат с hop-distance=1 для B3.4) |
| triggered_at | datetime | — |
| **Workflow** |  |  |
| approved_by_compliance_officer_id | int (FK User) | Первая подпись (CO) |
| approved_by_compliance_head_id | int (FK User) | Вторая подпись (CH) |
| composite_approval_id | int (FK CompositeApproval) | Формализация двойной подписи |
| **Решение** |  |  |
| decision | enum | `continue_relations` / `terminate` / `suspend` |
| decision_justification | text | Обязательно — почему ОВА выбирает данное действие |
| decision_at | datetime | — |
| **Последствия (auto-create)** |  |  |
| created_termination_order_id | int (FK Order, nullable) | Если decision=terminate, создаётся внутренний Order |
| created_freezing_id | int (FK FrozenAccount, nullable) | Если decision=suspend → freeze |
| created_fiu_message_id | int (FK FIUMessage, nullable) | Если требуется СПО |
| **Сервисное** | `created_at, retention_until` (Q12) | — |

### Workflow

При срабатывании любого из 10 override-triggers:
1. Создаётся `RiskOverride` с `decision=NULL`
2. `RiskAssessment.level` мгновенно ставится в `critical` (без подсчёта баллов, по Q4)
3. Notification направляется COMPLIANCE_HEAD
4. Compliance Officer формирует обоснование, выбирает decision
5. Compliance Head утверждает через CompositeApproval
6. Авто-создаются последствия (terminate/suspend/freeze + СПО)

### Регуляторные привязки

- стр. 180 (override-триггеры) — собственно сущность
- Q4 (двойная подпись + обоснование в ПВК) — формализация workflow

---

# 2.4.C Cross-cutting

## 2.4.9 CompositeApproval

**Назначение:** общая сущность для всех решений с двойной подписью («✋» в матрице 2.1.3). Гарантирует разделение функций — инициатор не может быть подписантом.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Цель approval'а** |  |  |
| target_type | enum | `risk_override` / `sanctions_match_positive` / `client_onboarding_high_risk` / `risk_settings_update` / `fiu_submission_confirmed` / `freezing_create` / `unfreezing` / `transfer_order_high_amount` |
| target_id | int | id целевой сущности |
| **Workflow** |  |  |
| status | enum | `pending` / `approved` / `rejected` / `expired` |
| **Инициатор** |  |  |
| requested_by_user_id | int (FK User) | Кто инициировал решение |
| requested_at | datetime | — |
| request_justification | text | Почему требуется |
| **Подписант** |  |  |
| approver_user_id | int (FK User) | Должен быть **другим** User'ом и иметь требуемую роль (COMPLIANCE_HEAD для большинства); CHECK constraint `requested_by_user_id != approver_user_id` |
| approver_role_required | enum UserRole | Какая роль обязана подписать |
| approved_at | datetime, nullable | — |
| approval_decision | enum | `approve` / `reject` |
| approval_justification | text | Обязательно при rejection, опционально при approve |
| **Дедлайн** |  |  |
| pending_until | datetime, nullable | По умолчанию `requested_at + 24h`; expired-job переводит в `expired` если не подписано |
| **Сервисное** | `created_at, retention_until` (Q12) | — |

### Использование в матрице 2.1.3

| Что | Кто инициирует | Кто подписывает |
|---|---|---|
| Risk.update_settings | COMPLIANCE_HEAD | TENANT_ADMIN |
| Client.approve_onboarding (high) | COMPLIANCE_OFFICER | COMPLIANCE_HEAD |
| FIU.confirm_submission | COMPLIANCE_OFFICER | COMPLIANCE_HEAD |
| Sanctions.officer_decision (positive) | COMPLIANCE_OFFICER | COMPLIANCE_HEAD |
| RiskOverride.continue_relations | COMPLIANCE_OFFICER | COMPLIANCE_HEAD |
| Freezing.create (для крупных сумм) | COMPLIANCE_OFFICER | COMPLIANCE_HEAD |

### Регуляторные привязки

- Q4 (override-триггеры с двойной подписью)
- Закон о ПФПД/ЛПД ст. 24 (разделение функций)

---

# 2.4.D KYT (Know-Your-Transaction)

## 2.4.10 KYTCheckResult

**Назначение:** унифицированный результат KYT-проверки кошелька/транзакции от любого провайдера (Ранекс KG, Chainalysis, TRM Labs, Elliptic). Q10 предписывает pluggable интерфейс `KYTProvider`.

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id, target_type` (enum: `wallet`, `transaction`, `va_address_string`), `target_id` (FK WalletAddress / Transaction / null) |
| **Если string-target** (для одноразовой проверки адреса без сохранения как Wallet) | `target_address` (string), `target_network` (string) |
| **Провайдер** | `provider` (enum: `ranex_kg`, `chainalysis`, `trm_labs`, `elliptic`, `manual`), `provider_request_id` (string — ID на стороне провайдера для аудита 114g5) |
| **Результат — нормализованный** | `risk_score` (Decimal 0-100), `tags` (JSON: array of normalized tags — `mixer`, `darknet`, `scam`, `sanctioned`, `gambling`, `exchange`, `defi`, `bridge`, `privacy_wallet`, `unhosted`, `vasp`, `unknown`), `hops_to_sanctioned` (int, nullable), `hops_to_mixer` (int, nullable), `total_received` (Decimal), `total_sent` (Decimal) |
| **Сырой ответ** | `raw_request_payload` (JSON), `raw_response_payload` (JSON) — для аудита 114g5 |
| **Cache** | `checked_at, cached_until` (TTL по умолчанию 24h, настраивается per-tenant) |
| **Сервисное** | `created_at, retention_until` (Q12) |

### Hook 8 — KYT-проверка кошелька (детально)

При переходе `Order.draft → submitted` в pipeline, для VA-операций:

1. **Адрес-получатель** (target_address_id) — `KYTProvider.check_address(network, address)`
2. **Адрес-отправитель** (source_address_id, если есть)
3. **VASP контрагент** (если transfer_va — `target_address.counterparty_vasp_*`)

Hook возвращает:
- **PASS** — risk_score < `RiskSettings.kyt_warn_threshold` (например, < 30) И нет critical-tags
- **WARN** — risk_score между warn_threshold и block_threshold ИЛИ есть medium-risk tags (gambling, defi)
- **FAIL** — risk_score ≥ `RiskSettings.kyt_block_threshold` (например, ≥ 70) ИЛИ tags содержат любой из {mixer, darknet, sanctioned, scam} → **override-trigger** B3.4 / C4.5 / C5.4 / B4.5 → блок

При FAIL — автоматически создаётся `RiskOverride` соответствующего типа.

### Регуляторные привязки

- ПОВА п. 7.1 (обязательная AML/KYT-проверка) — собственно сущность
- стр. 113 (запрет операций с активами высокого скоринга) — Hook 8 на FAIL
- стр. 130 (теги AML/KYT-провайдера) — `tags` поле
- 114g3-g5 (аудит trail запросов к внешнему KYT) — `raw_request_payload`, `raw_response_payload`
- Q10 (pluggable KYT-интерфейс) — `provider` enum

---

# 2.4.E Travel Rule

## 2.4.11 TravelRuleMessage (перенос Q-2.3-O)

**Назначение:** Travel Rule сообщение к/от другого VASP. По Q-2.3-O — переносится из `WalletAddress.travel_rule_payload` в отдельную сущность с полным workflow и связью с провайдером (Notabene, Sumsub Travel и т.п.).

`WalletAddress` сохраняет только метаданные владельца адреса:
- `is_vasp_owned` (bool)
- `counterparty_vasp_name`, `counterparty_vasp_jurisdiction`, `counterparty_vasp_lei`
- `travel_rule_capable` (bool — поддерживает ли VASP-партнёр обмен Travel Rule сообщениями через стандартный канал)

### Атрибуты TravelRuleMessage

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| transaction_id | int (FK Transaction) | Привязка к операции |
| **Направление** | `direction` (enum: `outgoing` (мы отправляем), `incoming` (получаем)) | — |
| **Originator** | `originator_payload` (JSON по IVMS101: name, address, account/wallet, document, dob, country) | Информация об отправителе средств |
| **Beneficiary** | `beneficiary_payload` (JSON по IVMS101) | Информация о получателе |
| **Провайдер** | `provider` (enum: `notabene`, `sumsub_travel`, `manual`, `none`), `external_message_id` (string) | Q-2.3-H |
| **Workflow** | `status` (enum FSM ниже), `requested_at, sent_at, acknowledged_at, failed_at, timeout_at` | — |
| **Failure context** | `failure_reason` (text), `retry_count` (int) | — |
| **Сырые данные** | `raw_request_payload` (JSON), `raw_response_payload` (JSON) | Аудит |
| **Сервисное** | `created_at, retention_until` (Q12) | — |

### FSM TravelRuleMessage

```
              ┌──────────┐
              │ PENDING  │ ◄─── создан на этапе Order approval
              └────┬─────┘
                   │ send_to_provider
                   ▼
              ┌──────────┐
              │   SENT   │ ◄─── отправлено провайдеру TR
              └─┬─────┬──┘
                │     │
   acknowledged │     │ provider_failed / counterparty_rejected
                ▼     ▼
        ┌──────────────┐ ┌──────────┐
        │ ACKNOWLEDGED │ │ FAILED   │ ◄─── требует ручного review
        └──────────────┘ └──────────┘

   Параллельно: SENT → TIMEOUT (по acknowledgement_deadline без ответа)
```

### Связь с Order/Transaction

- Outgoing Travel Rule инициируется при `Order.approved` для transfer_va если `target_address.is_vasp_owned=true`. Если до момента `Order.start_execution` статус не ACKNOWLEDGED — есть выбор политики tenant'а:
  - Strict: блок до получения acknowledged
  - Lenient: WARN; outgoing исполняется, ACK ожидается асинхронно
- Incoming Travel Rule — при поступлении входящей VA-транзакции на наш адрес от другого VASP (через webhook от провайдера TR).

### Регуляторные привязки

- стр. 115-117 (Travel Rule — отправитель, получатель, неотъемлемость)
- стр. 118-119 (мониторинг переводов с отсутствующей информацией; отклонение)
- ↗ Q-2.3-H (формат IVMS101)

---

# 2.4.F FIU Reporting (СПО/ПО)

## 2.4.12 FIUMessage

**Назначение:** кандидат или финализированное сообщение в орган финансовой разведки (СПО — подозрительные операции; ПО — пороговые операции). На MVP экспортируется в Excel-реестр (Q5); XML — будущая итерация.

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id, client_id` (FK Client) |
| **Тип** | `type` (enum: `СПО`, `ПО`) |
| **Источник** | `trigger_source` (enum: `manual_compliance`, `threshold_exceeded` (Q11), `sanction_match`, `freezing_initiated`, `system_anomaly` (детектор), `relationship_terminated`, `regulator_request`), `triggered_by_event_id` (FK к источнику: SuspiciousActivityFlag.id / ThresholdCheck.id / SanctionsMatchDecision.id / FrozenOperation.id) |
| **Связь с операциями** | `transaction_ids` (JSON: array of FK Transaction), `order_ids` (JSON: array of FK Order), `wallet_ids` (JSON: array of FK WalletAddress) |
| **Workflow** | `status` (enum FSM ниже) |
| **Дедлайн (SLA)** | `deadline` (datetime) — рассчитывается по trigger_source + ПФР: 5h для подозрительных, 3h для санкционных/срочных, 2 раб.дня для ВРС, 3 раб.дня для пороговых, 1 раб.день для отказов в установлении отношений |
| **Снимок данных** | `data_snapshot` (JSON: все поля Excel-реестра Q5 на момент создания, для воспроизводимости) |
| **Pipeline** | `marked_at, marked_by_user_id, exported_at, exported_by_user_id, fiu_export_batch_id` (FK FIUExportBatch), `submitted_at, submitted_by_user_id, ack_received_at, ack_doc_id` (FK ClientDocument для квитанции) |
| **Подтверждение отправки** | `submission_composite_approval_id` (FK CompositeApproval) — двойная подпись |
| **Документы основания** | `basis_doc_ids` (JSON: array of FK ClientDocument — что подтверждает основание) |
| **Comments** | `comments` (text) — может быть длинным разбором офицера |
| **Dismiss** | `dismissed_at, dismissed_by_user_id, dismissal_justification` (если dismissed без отправки в ФР — обязательно обоснование) |
| **Связь с заморозкой** | `linked_freezing_id` (FK FrozenAccount, nullable) — обратная ссылка от FrozenOperation.fiu_message_id (2.3.8) |
| **Сервисное** | `created_at, retention_until` (Q12 = 7 лет) |

### FSM FIUMessage

```
                       ┌──────────────┐
                       │  CANDIDATE   │ ◄─── автогенерация (system) или
                       └──────┬───────┘       ручная пометка офицером
                              │ officer_review
                              ├──── dismiss → DISMISSED (с justification)
                              │
                              │ mark_for_export
                              ▼
                       ┌──────────────┐
                       │   MARKED     │ ◄─── подтверждён офицером, ожидает экспорта
                       └──────┬───────┘
                              │ included_in_export_batch
                              ▼
                       ┌──────────────┐
                       │  EXPORTED    │ ◄─── попал в Excel-реестр (FIUExportBatch)
                       └──────┬───────┘
                              │ submission_confirmed (двойная подпись)
                              ▼
                       ┌──────────────┐
                       │  SUBMITTED   │ ◄─── офицер подтвердил отправку в ГСФР
                       └──────┬───────┘
                              │ ack_received
                              ▼
                       ┌──────────────┐
                       │ ACKNOWLEDGED │ ◄─── квитанция получена; финальное штатное
                       └──────────────┘

   Параллельно: любое состояние → EXPIRED_SLA (если deadline пропущен)
                                  + автоматическая критическая Notification руководству
```

### SLA-расчёт

`deadline = created_at + sla_hours_by_trigger`, где `sla_hours_by_trigger`:

| trigger_source | SLA | Источник |
|---|---|---|
| sanction_match | 3 ч | стр. 170 |
| manual_compliance (СПО) | 5 ч | стр. 166 |
| threshold_exceeded (ПО) | 3 раб. дня | стр. 169 |
| HRC (страновой триггер) | 2 раб. дня | стр. 167 |
| relationship_terminated | 1 раб. день | стр. 171 |

Background scheduler каждый час проверяет приближение deadline и шлёт Notification (2.1.9) офицеру за `sla_warning_hours_before` (TenantSettings).

### Регуляторные привязки

- стр. 161 (формирование сообщения по типовой форме) — Excel/XML генерация (на MVP — Excel)
- стр. 166-171 (SLA по типам) — `deadline`
- стр. 175 (журнал ≥ 5 лет) — retention 7 лет
- Q5 (Excel-MVP вместо XML) — экспорт через `FIUExportBatch`

---

## 2.4.13 FIUExportBatch (Excel-реестр Q5)

**Назначение:** один Excel-файл со всеми отобранными FIUMessage. Q5 предписывает `один файл = много строк` (не файл-на-операцию).

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Тип экспорта** | `export_type` (enum: `СПО`, `ПО`, `mixed`) | — |
| **Связь** | `included_message_ids` (JSON: array of FK FIUMessage) | Какие сообщения включены |
| **Шаблон Q5** |  |  |
| template_version | string | Версия шаблона полей (для эволюции схемы) |
| field_mapping | JSON | Маппинг полей FIUMessage → колонки Excel (берётся из TenantSettings.fiu_export_template) |
| **Файл** |  |  |
| file_path | string | Путь (зависит от Q-2.1-G) |
| file_hash | string(64) | SHA-256 |
| file_size_bytes | bigint | — |
| **Workflow** |  |  |
| generated_at | datetime | — |
| generated_by_user_id | int (FK User) | COMPLIANCE_OFFICER |
| **Подтверждение отправки в ГСФР** |  |  |
| submission_confirmed_at | datetime | Когда офицер подтвердил, что перенёс из Excel в программу ГСФР |
| submission_confirmed_by_user_id | int (FK User) | — |
| submission_composite_approval_id | int (FK CompositeApproval) | Двойная подпись (Q5: критичная операция) |
| **Сервисное** | `created_at, retention_until` (Q12) | — |

### Workflow Q5

1. Офицер просматривает FIUMessage в статусе `marked` (пометил как нужные для отправки).
2. Офицер инициирует экспорт: выбирает фильтры (тип, период) → создаётся `FIUExportBatch`.
3. Система генерирует Excel из `data_snapshot` каждого FIUMessage по шаблону `TenantSettings.fiu_export_template`.
4. Все включённые FIUMessage переходят в статус `exported`.
5. Офицер скачивает Excel, открывает рядом с программой ГСФР, переносит данные.
6. После отправки: `submission_confirmed` (с двойной подписью CO+CH); все FIUMessage → `submitted`.
7. По мере получения квитанций офицер отмечает `ack_received_at` на каждом FIUMessage.

### Поля шаблона Q5 (из 00-decisions.md)

Стандартный шаблон (настраиваемый в `TenantSettings.fiu_export_template`):

| Колонка Excel | Источник в FIUMessage.data_snapshot |
|---|---|
| Наименование клиента | `client_full_name` |
| Сумма входа по банку | `transaction.fiat_in_amount` |
| Валюта входа | `transaction.fiat_in_currency` |
| Сумма выхода по банку | `transaction.fiat_out_amount` |
| Валюта выхода | `transaction.fiat_out_currency` |
| Сумма USDT | `transaction.va_amount` (если va_asset=USDT) |
| Курс USDT/KGS | `exchange_rate_snapshot.rate` |
| Эквивалент в KGS | `transaction.kgs_equivalent` |
| Банк клиента — наименование | `client_bank.bank_name` |
| Банк клиента — страна | `client_bank.country` |
| Банк клиента — БИК | `client_bank.bic` |
| Банк клиента — № счёта | `client_bank.account_number` |
| Банк оператора — наименование | `operator_bank.bank_name` |
| Банк оператора — страна | `operator_bank.country` |
| Банк оператора — БИК | `operator_bank.bic` |
| Банк оператора — № счёта | `operator_bank.account_number` |
| Назначение платежа по выписке | `transaction.payment_purpose` |

### Регуляторные привязки

- Q5 (Excel-MVP) — собственно реализация
- стр. 161, 175 — журнал отправленных СПО + retention

---

## 2.4.14 RFIInvolvement

**Назначение:** связь FIUMessage / SanctionsMatchDecision / RiskAssessment с RFIRequest (2.2.13) — когда compliance нужна доп. информация для оценки.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Источник запроса** | `source_type` (enum: `fiu_message`, `sanctions_match`, `risk_assessment`, `pre_submit_hook`), `source_id` | — |
| rfi_request_id | int (FK RFIRequest) | — |
| **Поведение пока RFI открыт** | `parent_pause_state` (enum: `paused_decision`, `proceeded_with_warning`) | Что делать с источником пока ждём ответ |
| **Сервисное** | `created_at` | — |

### Использование

- При `SanctionsMatchDecision.decision='needs_more_info'` → создаётся RFIInvolvement; SanctionsMatchDecision висит в pending до ответа
- При недостатке информации для риск-оценки → RFI запрашивает обновление анкеты или СПО-документ
- При FIUMessage.candidate с неполными данными → RFI к клиенту через портал

---

# 2.4.G High-Risk Countries

## 2.4.15 HighRiskCountry (рефакторинг)

**Назначение:** список высокорискованных стран. В коде уже есть `HighRiskCountry` + `HighRiskCountryAudit`. На 2.4 — расширение под автодействия и явные basis-источники.

### Дельта от существующей

| Поле | Сейчас | Изменение |
|---|---|---|
| `country_code, country_name` | есть | сохраняется |
| `measures` (JSON) | есть | расширяется до `default_actions` (JSON: `{auto_block_for_individuals: bool, auto_block_for_legal: bool, require_edd: bool, require_manual_review: bool, require_fiu_report: bool}`) |
| `is_active` | есть | сохраняется |
| `designation_date, removal_date` | нет | НОВОЕ — дата внесения и удаления (для historical compliance) |
| `basis` | нет | НОВОЕ — text: основание (ФАТФ, БАЗ, НОР и т.п.) |
| `last_synced_at, source_url` | нет | НОВОЕ — синхронизация со списком ФР КР |

### Связь с per-tenant override

Сам список ВРС — общий (не tenant-specific). Но действия (`auto_block / require_edd`) могут переопределяться в `TenantSettings.high_risk_country_actions` (JSON: `{country_code: actions_override}`) — например, tenant может решить применять более строгие меры.

### Регуляторные привязки

- стр. 152-153 (хранение перечня; источники ФАТФ/Базель/ОЭСР/ООН/НОР) — собственно сущность
- стр. 154 (применение усиленных мер) — `default_actions.require_edd`
- стр. 155-157 (отказ в установлении отношений / лицензировании ЮЛ из ВРС) — `default_actions.auto_block_*`
- стр. 159 (СПО за 2 раб. дня) — `default_actions.require_fiu_report` → автоматическая FIUMessage candidate

---

## 2.4.16 HighRiskCountryCheck

**Назначение:** журнал каждой проверки против списка ВРС. Per-target audit trail.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Цель** | `target_type` (enum: `client`, `wallet`, `transaction`, `order`, `counterparty_bank`, `vasp_counterparty`), `target_id` | — |
| **Результат** | `country_code_detected` (string ISO-3166), `is_high_risk` (bool), `matched_country_id` (FK HighRiskCountry, nullable) | — |
| **Действие** | `action_taken` (enum: `auto_block`, `edd_required`, `notification_only`, `none`), `action_reason` (text) | — |
| **Триггер** | `triggered_by` (enum: `pre_submit_hook`, `periodic_review`, `client_anketa_change`, `wallet_kyt_check`) | — |
| **Контекст** | `triggered_event_id` (например, Order.id) | — |
| checked_at | datetime | — |
| **Сервисное** | `retention_until` (Q12) | — |

### Регуляторные привязки

- стр. 154 (применение усиленных мер) — `action_taken=edd_required`
- стр. 159 (СПО 2 раб. дня) — при `is_high_risk=true` и `action_taken!=none` → автоматически создаётся FIUMessage candidate с deadline
- стр. 160 (квартальная отчётность) — выгрузка по HighRiskCountryCheck за период

---

# 2.4.H Detectors

## 2.4.17 SuspiciousActivityFlag (расширение из 2.3.9)

Базовая сущность определена в 2.3.9. На 2.4 — углубление связей и source-tracking.

### Дополнительные атрибуты

| Имя | Тип | Описание |
|---|---|---|
| **Source-tracking (детально)** |  |  |
| detector_id | int (FK AnomalyDetector, nullable) | Какой детектор сработал (для system-flags) |
| rule_engine_version | string | Версия правил детектора на момент срабатывания |
| **Связь с проверками** |  |  |
| linked_sanctions_check_id | int (FK SanctionsCheck, nullable) | — |
| linked_kyt_check_id | int (FK KYTCheckResult, nullable) | — |
| linked_threshold_check_id | int (FK ThresholdCheck, nullable) | — |
| linked_hrc_check_id | int (FK HighRiskCountryCheck, nullable) | — |
| linked_risk_assessment_id | int (FK RiskAssessment, nullable) | — |

### Workflow эскалации

При `escalate` создаётся:
1. **FIUMessage** — candidate (если основание подходит для СПО/ПО)
2. **FrozenOperation** — если требуется приостановление параллельно

При `dismiss` — обязательно `resolution_notes` с обоснованием. Запись остаётся в БД под retention 7 лет, но не вызывает повторных алертов.

---

## 2.4.18 AnomalyDetector

**Назначение:** декларативная модель детекторов подозрительной активности. Правила (пороги, окна, типы) хранятся в БД, не зашиты в код. Закрывает Q1 (настраиваемые пороги).

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id` |
| **Идентификация** | `detector_code` (enum), `detector_name` (string), `description` (text) |
| **Тип** | `detector_type` (enum: `dropper` (Q1, 26/п), `structuring` (smurfing), `velocity` (частота), `geo_anomaly` (страны), `vpn_pattern` (26/п § 1 п. 15), `night_time` (26/п § 3 п. 15), `crypto_crowdfunding` (26/п § 3 п. 13), `arms_trade` (26/п § 3 п. 11), `unattributed_deposit`, `weight_imbalance` (входящие vs исходящие), `custom_rule`) |
| **Применимость** | `applies_to` (enum: `transaction`, `order`, `wallet`, `client`, `va_address_string`) |
| **Параметры (Q1, конфигурируемые per-tenant)** | `parameters` (JSON: специфичны для типа; например, для dropper — `{min_operations_per_day: 10, min_unique_counterparties: 5, min_interval_seconds: 60, night_window_start_hour: 22, night_window_end_hour: 6}`); подключаются из `RiskSettings.detector_parameters` |
| **Результат** | `severity` (enum: `warn` / `flag` / `block`) — что делает детектор при срабатывании; `flag_reason_mapping` (string — какое значение `SuspiciousActivityFlag.flag_reason` создавать) |
| **Workflow** | `is_active` (bool), `activated_at, activated_by_user_id, deactivated_at, deactivated_by_user_id, deactivation_reason` |
| **Сервисное** | `created_at, updated_at` |

### Триггеры срабатывания

Каждый детектор имеет evaluator-функцию (логика — шаг 4). Запуск:
- **Per-event**: на событие `Transaction.completed` запускаются все детекторы, у которых `applies_to ∈ {transaction, order}`. Каждый детектор оценивается; при срабатывании → `SuspiciousActivityFlag` со ссылкой на детектор.
- **Periodic**: scheduler запускает детекторы с `applies_to ∈ {wallet, client}` ежедневно (сканирует совокупность).

### Дефолтные детекторы (из 26/п)

| Detector code | Параметры | Источник |
|---|---|---|
| `dropper_high_freq` | mins_btw_inbound_outbound, count_per_day | 26/п § 3 п. 15 |
| `dropper_diverse_counterparties` | min_unique_counterparties_per_day | 26/п § 3 п. 15 |
| `dropper_night_time` | night_window_hours_tz | 26/п § 3 п. 15 |
| `vpn_changing_ip` | distinct_ips_window_hours | 26/п § 1 п. 15 |
| `inbound_from_unrelated_then_outbound` | min_inbound_count, max_outbound_delay_hours | 26/п § 1 п. 16 |
| `crypto_crowdfunding_pattern` | va_asset_token_patterns | 26/п § 3 п. 13 |
| `structuring_below_threshold` | window_hours, count_in_window, sum_close_to_threshold_pct | стр. 126 |

### Регуляторные привязки

- стр. 124 (коды индикаторов 40001-40088) — соответствуют `flag_reason_mapping`
- стр. 126-129 (детекторы дробления/ночи/дроппера) — собственно детекторы
- стр. 182-186 (новые критерии 26/п) — реализация через AnomalyDetector
- Q1 (настраиваемые пороги) — `parameters` JSON из RiskSettings

---

# 2.4.I Pre-submit hooks 7-9 — детальный разбор

Hooks определены в 2.3.1 как часть pipeline `Order.draft → submitted`. Здесь — раскрытие compliance-логики.

### Hook 7: Pre-transaction sanctions screening

**Цель:** проверить клиента, кошельки, контрагентов, VASP-партнёров против всех активных санкционных списков.

**Что создаёт:**
- `SanctionsCheck` записи (по одной на каждый target из {client, source_wallet, target_wallet, vasp_counterparty, counterparty_bank})
- При `result=match` или `possible_match` → `SanctionsMatchDecision` candidate (pending)

**Логика принятия решения:**
- Все checks `result=clear` → **PASS**
- Хотя бы один `result=possible_match` → **WARN** (Order → UNDER_REVIEW)
- Хотя бы один `result=match` → **FAIL** (Order → REJECTED_BY_COMPLIANCE; auto-create FIUMessage с trigger=sanction_match, deadline=3h)

**Кэш:** использует `cache_valid_until` из SanctionsCheck (24h для client, 1h для wallet, 0 для tx/order).

---

### Hook 8: KYT-проверка кошелька

**Цель:** проверить риск-теги и hop-distance для VA-кошельков.

**Что создаёт:**
- `KYTCheckResult` записи (по одной на target_wallet, source_wallet)

**Логика:**
- `risk_score < kyt_warn_threshold` И нет critical-tags → **PASS**
- `kyt_warn_threshold ≤ risk_score < kyt_block_threshold` ИЛИ medium-risk tags → **WARN**
- `risk_score ≥ kyt_block_threshold` ИЛИ critical-tags ({mixer, darknet, sanctioned, scam}) → **FAIL**
  - При FAIL → **создаётся `RiskOverride`** (Q4 trigger: B3.4 для mixer, B4.5 для darknet pool, C4.5 для sanctioned, C5.4 для scam pool); Order → REJECTED_BY_COMPLIANCE

**Применимость:** только для `order_type ∈ {transfer_va, withdraw, deposit, exchange}` где есть VA-адрес.

---

### Hook 9: Risk re-evaluation

**Цель:** пересчитать risk-уровень клиента с учётом параметров новой операции.

**Что создаёт:**
- `RiskAssessment` запись (assessment_type=basic_61p; для VASP — также advanced_vasp если включен модуль)

**Логика (с учётом Q-2.3-S):**
- Δrisk = новый level - предыдущий level
- Δrisk = 0 (level не изменился) → **PASS** (даже если уровень high — это не повод для review каждой операции)
- Δrisk > 0 (повысился) → **WARN** (Order → UNDER_REVIEW; Notification COMPLIANCE_OFFICER)
- `level=critical` И впервые достигнут → **FAIL** (Order → REJECTED_BY_COMPLIANCE; RiskOverride если override-trigger)

**PEP-обработка (с учётом Q-2.3-T):** PEP-клиент не вызывает review каждой операции. Вместо этого создаётся отдельный `MonitoringFlag` (расширение SuspiciousActivityFlag с `flag_reason=pep_high_risk`, severity=informational) — попадает в дашборд PEP-мониторинга, но не блокирует операцию. Отчёт по PEP-мониторингу (стр. 79) — отдельная функция (домен 2.5).

---

# 2.4.J Расширение RBAC матрицы

Дополнения к матрице 2.1.3 для compliance-домена:

| Permission / Role | SUP | TA | CH | CO | BOO | BOH | CL | RA | RO |
|---|---|---|---|---|---|---|---|---|---|
| **Sanctions** |
| Sanctions.run_manual_check | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| SanctionsMatchDecision.dismiss_fp | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| SanctionsMatchDecision.confirm_positive | ⛔ | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| SanctionsList.upload | ✅ | ✋ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Risk** |
| Risk.view_assessment | 👁 | ⛔ | 👁 | 👁 | 👁 | 👁 | self | 👁 | 👁 |
| Risk.manual_re_assess | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Risk.manual_override | ⛔ | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| RiskSettings.update | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| RiskOverride.approve_continue | ⛔ | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **KYT** |
| KYT.view_results | ⛔ | ⛔ | 👁 | 👁 | 👁 | 👁 | ⛔ | 👁 | ⛔ |
| KYT.manual_recheck | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Travel Rule** |
| TravelRule.send_outgoing | ⛔ | ⛔ | ✅ | ✅ | ✅ | ✅ | ⛔ | ⛔ | ⛔ |
| TravelRule.acknowledge_incoming | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **FIU** |
| FIU.view_candidates | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | 👁 | ⛔ |
| FIU.mark_for_export | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FIU.dismiss_candidate | ⛔ | ⛔ | ✅ | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FIU.export_excel | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FIU.confirm_submission | ⛔ | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| FIU.set_ack_received | ⛔ | ⛔ | ✅ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **HRC** |
| HRC.view_list | ⛔ | 👁 | ✅ | ✅ | 👁 | 👁 | ⛔ | 👁 | 👁 |
| HRC.manual_update_actions | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Detectors** |
| AnomalyDetector.activate | ⛔ | ⛔ | ✅ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| AnomalyDetector.update_parameters | ⛔ | ✋ (sign) | ✋ (init) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **Composite Approval** |
| CompositeApproval.approve | (по target_type требуется конкретная роль) |  |  |  |  |  |  |  |  |

**Ключевые правила разделения функций (ст. 24 ЗАМ):**
- Sanctions positive_match — двойная подпись CO+CH (CO инициирует, CH подписывает)
- FIU.confirm_submission — двойная подпись CO+CH (Q5: критичная операция)
- Risk.update_settings — CH инициирует, TENANT_ADMIN подписывает (защита Q1)
- RiskOverride continue → двойная подпись CO+CH

---

# 2.4.K State machines (сводная таблица 2.4)

| Сущность | FSM | Финальные состояния |
|---|---|---|
| SanctionsCheck | (нет FSM, иммутабельный snapshot) | — |
| SanctionsMatchDecision | pending → false_positive / positive_match / needs_more_info / escalated_to_freeze | все, кроме pending |
| RiskAssessment | (нет FSM, иммутабельный snapshot per evaluation) | — |
| RiskOverride | triggered → pending_approval → approved (decision) / rejected | approved, rejected |
| CompositeApproval | pending → approved / rejected / expired | approved, rejected, expired |
| TravelRuleMessage | pending → sent → acknowledged / failed / timeout | acknowledged, failed, timeout |
| FIUMessage | candidate → marked → exported → submitted → acknowledged (плюс dismissed, expired_sla) | acknowledged, dismissed, expired_sla |
| AnomalyDetector | (config-сущность; имеет is_active, не FSM) | — |

---

# 2.4.L Соответствие чек-листу 01-regulatory-checklist.md

Подшаг 2.4 закрывает следующие строки:

| Строки | Тема | Закрытие в 2.4 |
|---|---|---|
| 133-134 | Загрузка списков, fuzzy + транслитерация | SanctionsList + SanctionedEntity (2.4.1, 2.4.2) — в коде уже есть |
| 135 | Проверка клиента/БВ/директоров/etc | SanctionsCheck.target_type расширенный (2.4.3) |
| 136 | Регистрация решения офицера | SanctionsMatchDecision (2.4.4) |
| 137 | Pre-tx screening контрагента/wallet-owner | Hook 7 (2.4.I) |
| 138 | Срок действия проверки | SanctionsCheck.cache_valid_until |
| 139 | Автоматическая блокировка при совпадении | Hook 7 на FAIL → Order=REJECTED |
| 178-181 | Расчёт уровня риска по 61/п, зоны, override, 4-блочная | RiskAssessment + RiskBasic61p + RiskAdvancedVASP + RiskOverride (2.4.5-2.4.8) |
| 182-186 | Новые критерии 26/п (VPN, дроппер, крипто-краудфандинг, оружие, удалён § 3 п. 12) | AnomalyDetector + RiskBasic61p.criteria_responses (2.4.18) |
| 188 | Критерии НКО | RiskBasic61p.nko_subcriteria_responses |
| 75-77 | EDD/SOF при high risk | Hook 9 → UNDER_REVIEW + RFI |
| 78 | Письменное разрешение для PEP | PEPProfile.approval_decision (2.2.9) + COMPLIANCE_HEAD signature |
| 113 | Запрет операций с активами высокого скоринга | Hook 8 на FAIL |
| 115-119 | Travel Rule | TravelRuleMessage (2.4.11) |
| 122-123 | Постоянная проверка / выявление операций без смысла | AnomalyDetector + SuspiciousActivityFlag |
| 124 | Коды 40001-40088 | AnomalyDetector.flag_reason_mapping |
| 126-129 | Детекторы дробления/ночи/дроппера | AnomalyDetector (детекторы из 26/п) |
| 130 | Теги AML/KYT-провайдера | KYTCheckResult.tags (2.4.10) |
| 131 | Уведомление офицера о срабатывании | SuspiciousActivityFlag → Notification |
| 132 | Pre-tx sanctions screening | Hook 7 |
| 137-139 | Pre-tx checks | Hook 7-8 |
| 141 | Уведомление ФР о приостановлении 3 ч | FIUMessage с deadline=3h при sanction_match/freezing |
| 150 | Поля сообщения о замораживании | FIUMessage.data_snapshot |
| 152-160 | HRC список + меры | HighRiskCountry + HighRiskCountryCheck (2.4.15-2.4.16) |
| 161-175 | СПО/ПО формирование, SLA, журнал | FIUMessage + FIUExportBatch (2.4.12-2.4.13) |
| 169 | СПО за 3 раб. дня по пороговым | FIUMessage с deadline по trigger=threshold_exceeded |
| 170 | Срочное уведомление 3 ч | FIUMessage с trigger=sanction_match |
| 171 | Сообщение об отказе/прекращении 1 раб. день | FIUMessage с trigger=relationship_terminated |
| 175 | Журнал ≥ 5 лет | retention_until 7 лет (Q12) |
| 176 | Пороги операций | RiskSettings.threshold_operations + ThresholdCheck (2.3.7) → FIUMessage |
| 177 | Конфиденциальность факта отправки СПО | RBAC: только COMPLIANCE_HEAD/OFFICER + REGULATOR_AUDITOR видят FIU.* |

**Итого: ~50 строк чек-листа закрыты в 2.4.**

---

# 2.4.M Открытые вопросы 2.4

### Q-2.4-A. Cache invalidation для SanctionsCheck — каскадные события

При обновлении SanctionsList (новая версия) — все cached SanctionsCheck'ы становятся невалидны. Каскадная инвалидация требует обхода всех записей с `cache_valid_until > now()`. Для tenant с миллионами проверок — потенциальный bottleneck.

**Текущая позиция:** scheduled job `invalidate_caches_on_list_update()` запускается асинхронно после `SanctionsListSnapshot.created`. До его завершения — checks отдают cached с пометкой `is_potentially_stale=true`. Это ускоряет user-flow, но ослабляет гарантии.

### Q-2.4-B. Распределение Hook 7 между client и wallet check'ами — последовательно или параллельно

При `Order.draft → submitted` Hook 7 создаёт несколько SanctionsCheck'ов (client, target_wallet, source_wallet, ...). Это потенциально 5+ запросов в KYT-провайдер при wallets, плюс несколько в local sanctions DB.

**Текущая позиция:** локальные checks (sanctions DB) — параллельно. KYT-checks — параллельно с rate-limiting per provider. Шаг 4 уточнит.

### Q-2.4-C. Версионирование RiskSettings — глубина ретроспективы

Когда меняется `RiskSettings`, все новые оценки идут по новой версии. Старые остаются. Но если регулятор просит «перепроверить риск клиента X на дату Y» — мы должны использовать версию, действовавшую на Y. Это требует хранения **всех** версий навсегда (даже после прекращения отношений с клиентом).

**Текущая позиция:** RiskSettings версии не purge-ются по retention; хранятся бессрочно (`retention_until=NULL`). Объёмов мало (10-20 версий за всю жизнь tenant'а).

### Q-2.4-D. Override-trigger detection — где живёт логика

10 override-triggers (Q4): где определяются их условия? В коде Hook 8 (для KYT-зависимых: B3.4, B4.5, C4.5, C5.4) или в `AnomalyDetector` (для остальных)?

**Текущая позиция:** decentralized. Hook 8 непосредственно создаёт `RiskOverride` для KYT-trigger'ов. Остальные (B2.5 SoF несоответствие, A2.5 отозванная лицензия, A4.5 ML/TF расследования, D-серия) — через специализированные детекторы и compliance review. Все ведут к `RiskOverride` записи.

### Q-2.4-E. PEP-monitoring как отдельный домен или часть SuspiciousActivityFlag

Q-2.3-T определил, что PEP не блокирует каждую операцию. Но усиленный мониторинг (стр. 79) требует отдельного report'а.

**Текущая позиция:** PEP-мониторинг реализуется через периодическое создание `MonitoringFlag` (расширение SuspiciousActivityFlag с `severity=informational`). Дашборд PEP-операций — задача 2.5. Отдельной сущности `PEPMonitoring*` не создаётся в 2.4.

### Q-2.4-F. Travel Rule — стратегия strict vs lenient на tenant

Tenant решает: блокировать `Order.start_execution` пока TR не acknowledged (strict), или пускать асинхронно (lenient)?

**Текущая позиция:** настройка в `TenantSettings.travel_rule_policy` (enum: strict / lenient_24h_grace / disabled). Default — strict для FATF-юрисдикций, lenient_24h_grace для всех остальных. На MVP — все tenant'ы получают lenient_24h_grace; шаг 4 уточнит.

### Q-2.4-G. FIUMessage.data_snapshot — иммутабельный или обновляется

Когда снапшот данных делается? При `marked` (CompliancO выбрал для отправки) или при `exported` (попал в Excel)?

**Текущая позиция:** snapshot делается при переходе `candidate → marked`. После этого иммутабелен. Если данные изменились (например, ExchangeRateSnapshot был исправлен) — нужна новая FIUMessage (старая dismissed с обоснованием).

### Q-2.4-H. AnomalyDetector — отказоустойчивость при ошибке детектора

Если detector evaluator-функция кидает exception (например, неправильные параметры) — что происходит? Detector deactivate, audit алерт?

**Текущая позиция:** Auto-deactivate (set `is_active=false`) с записью в AuditEvent + алерт TENANT_ADMIN. Чтобы один сломанный детектор не блокировал весь pipeline. Шаг 4 уточнит.

### Q-2.4-I. ВРС-список — кто и как обновляет в БД

`HighRiskCountry.last_synced_at` — обновляется автоматически (при загрузке нового приказа ФР) или вручную TENANT_ADMIN?

**Текущая позиция:** SUPER_ADMIN загружает приказ ФР как `RegulatoryDocument` (домен в коде уже есть), парсер извлекает страны → авто-обновление `HighRiskCountry`. Tenants получают обновление автоматически (список общий). TENANT_ADMIN может только override actions для конкретной страны через `TenantSettings.high_risk_country_actions`.

### Q-2.4-J. Двойная подпись для Sanctions positive_match — обязательность

Q4 формализовал двойную подпись для override-decision. Но Q4 не покрывает sanctions positive_match явно. Я расширил в 2.4.4. Надо ли?

**Текущая позиция:** Да. Sanctions positive_match — это серьёзное regulatory consequence (заморозка + СТР). Двойная подпись (CO+CH) — естественное расширение Q4. Если регулятор не требует — это «защитная мера» tenant'а, не противоречит.

### Q-2.4-K. Источник KYT-провайдера для входящих incoming Travel Rule

Когда приходит входящая VA-транзакция от другого VASP с Travel Rule, originator-данные включают account/wallet — нужен ли KYT-check на originator wallet?

**Текущая позиция:** Да. Создаётся `KYTCheckResult` для originator wallet. Если result=high-risk — flag для compliance review (incoming не блокируется автоматически — это уже принято; только flag).

### Q-2.4-L. Где считается threshold для FIU-кандидатов — в ThresholdCheck или FIUMessage

ThresholdCheck (2.3.7) вычисляет превышение. Но создаёт FIUMessage только если `exceeds_threshold=true`. Нужно ли дублировать threshold-данные в FIUMessage.data_snapshot?

**Текущая позиция:** FIUMessage.data_snapshot включает поле `threshold_check_id` + копию ключевых данных (aggregate_amount_kgs, mode, window_hours). Это иммутабельный снимок для audit и Excel-экспорта.

---

# 2.5 Reporting и интеграции

## Контекст и границы

Финальный подшаг доменной модели. Закрывает три задачи:
1. **Reporting и интеграции с УО** — оперативная и периодическая отчётность ОВА в уполномоченный орган (ПОВА п. 36); read-only API/выгрузки для регулятора (ГСФР).
2. **Кросс-доменные сущности** — дашборды (декларативная модель), шаблоны выгрузок, SLA-нарушения, расширенная семантика Notification, профиль ожидаемой активности клиента.
3. **Финальный аудит покрытия** — пройти по 232 строкам чек-листа и зафиксировать где каждая закрыта; собрать все открытые вопросы из 2.1-2.4 + новые 2.5 в сводный список.

**Что НЕ входит** (вне scope шага 2):
- Конкретные алгоритмы расчёта SLA — техника шага 4
- UI/UX дашбордов — это шаг 3 (архитектура клиента) и шаг 4 (имплементация)
- API контракты — шаг 4
- Дизайн фронтенда — вне всех 5 шагов VASP-расширения

**Что есть в коде сейчас:**
- [`models.py:817`](backend/app/models.py#L817) `RegulatoryDocument` — справочник законов, постановлений, приказов (используется для регуляторной базы UI). Не путать с `RegulatoryReport` из 2.5.1 — это разные сущности.

**Что НЕТ в коде:** все 8 сущностей этого подшага новые.

---

## 2.5.1 RegulatoryReport (отчётность ОВА в УО)

**Назначение:** структурированная запись об отчёте ОВА в уполномоченный орган (ГСФР). Отличается от `FIUMessage` (2.4.12): FIUMessage — это сообщения о подозрительных и пороговых операциях клиентов; RegulatoryReport — отчётность самой ОВА перед регулятором (оперативная статистика, годовая, инцидентная и т.д.).

### Атрибуты

| Группа | Поля | Регуляторная привязка |
|---|---|---|
| **Связь** | `id, tenant_id` | — |
| **Тип отчёта** | `report_type` (enum, см. ниже), `reporting_period_start, reporting_period_end` (datetime) | ПОВА п. 36 пп. 1-22 |
| **Жизненный цикл** | `status` (enum FSM ниже), `generated_at, generated_by_user_id` (COMPLIANCE_OFFICER+), `reviewed_at, reviewed_by_user_id` (COMPLIANCE_HEAD), `submitted_at, submitted_by_user_id`, `acknowledgement_received_at, acknowledgement_doc_id` (FK ClientDocument) | стр. 214-216 |
| **Содержание** | `payload` (JSON: структура зависит от report_type), `data_snapshot_at` (datetime — за какой момент собраны данные) | — |
| **Файл** | `export_file_id` (FK ClientDocument; PDF/Excel/XML), `export_format` (enum: excel, pdf, xml, json) | — |
| **Подтверждение отправки** | `submission_composite_approval_id` (FK CompositeApproval из 2.4.9 — двойная подпись CO+CH) | стр. 214 |
| **Документы основания** | `basis_doc_ids` (JSON: array of FK ClientDocument) | — |
| **SLA** | `due_date` (datetime — крайний срок подачи) | ПОВА п. 36, 37 |
| **Сервисное** | `notes` (text), `created_at, retention_until` (Q12 = 7 лет) | стр. 175 |

### Перечень `report_type` (по ПОВА п. 36)

| Code | Описание | Периодичность | Источник |
|---|---|---|---|
| `operational_monthly` | Оперативная статистика (объёмы, клиентская база, операции) | ежемесячно | ПОВА п. 36 |
| `operational_quarterly` | Расширенная квартальная статистика | ежеквартально | ПОВА п. 37 |
| `financial_quarterly` | Финансовая отчётность (баланс, P&L) | ежеквартально (до 10 раб. дней) | ПОВА п. 37 |
| `annual_report` | Годовой отчёт | ежегодно | ПОВА п. 36 |
| `risk_methodology_update` | Уведомление о пересмотре методологии (ПВК-связано) | по факту | Q1 |
| `incident_report` | Сообщение об инциденте (взлом, утечка ПДн, отказ систем) | по факту, не позднее 1 раб. дня | производное от ПОВА |
| `license_renewal` | Заявка на продление/изменение лицензии | по графику | ПОВА |
| `staff_changes` | Уведомление о смене ключевых должностных лиц (AML-офицер, директор) | в течение 14 дней | производное от ПОВА |
| `infrastructure_changes` | Изменение состава платформы, серверов, провайдеров | в течение N дней | ПОВА п. 31.14 |
| `kyt_provider_changes` | Смена обязательного AML/KYT-провайдера | по факту | ПОВА п. 7.1 |
| `aml_program_update` | Обновление AML-программы (ПВК) | при существенных изменениях | стр. 220 |
| `ad_hoc_request` | Ответ на ad-hoc запрос регулятора | по запросу с дедлайном | стр. 220 |
| `regulator_inspection_response` | Ответ на запрос в рамках регуляторной проверки | в установленный срок | стр. 221 |

### FSM RegulatoryReport

```
                    ┌──────────┐
                    │  DRAFT   │ ◄─── создан COMPLIANCE_OFFICER'ом
                    └────┬─────┘
                         │ generate (автосбор данных по report_type)
                         ▼
                    ┌────────────┐
                    │ GENERATED  │ ◄─── отчёт сформирован, файл сохранён
                    └────┬───────┘
                         │ review_for_submission
                         ▼
                    ┌────────────┐
                    │  REVIEWED  │ ◄─── COMPLIANCE_HEAD просмотрел и подписал
                    └────┬───────┘       (CompositeApproval CO+CH)
                         │ submit_to_regulator
                         ▼
                    ┌────────────┐
                    │ SUBMITTED  │ ◄─── отправлен в УО
                    └────┬───────┘
                         │ ack_received
                         ▼
                    ┌──────────────┐
                    │ ACKNOWLEDGED │ ◄─── финальное штатное
                    └──────────────┘

   Параллельно: любое состояние → EXPIRED (если due_date пропущен)
                              → SLABreach запись (см. 2.5.5)
```

### Связи

- → AuditEvent на каждый переход FSM
- → SLABreach при `expired`
- → CompositeApproval для двойной подписи
- → Notification (приближение due_date, успешная подача, получение ack)
- ← Dashboard (2.5.3) — RegulatoryReport отображается в `compliance_overview` дашборде

### Регуляторные привязки

- стр. 214 (ежемесячная оперативная отчётность ОВА в УО) — `report_type=operational_monthly`
- стр. 215 (квартальная финансовая отчётность не позднее 10 раб. дней) — `report_type=financial_quarterly` с `due_date`
- стр. 216 (сведения для ведения реестра ОВА) — `report_type=staff_changes` + `infrastructure_changes`
- стр. 218-219 (внутренний контроль + предоставление сведений в установленные сроки) — workflow `submission_composite_approval_id`
- стр. 220 (взаимодействие — приём отчётов и запросов от регулятора) — `report_type=ad_hoc_request, regulator_inspection_response`

---

## 2.5.2 RegulatorAPIAccess (доступ регулятора)

**Назначение:** управление и аудит доступа представителей регулятора (ГСФР) к данным tenant'а через read-only API. Закрывает требования стр. 220-223 (принимать запросы регулятора, не препятствовать проверке, предоставлять выгрузки операций).

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id, regulator_user_id` (FK User; должен иметь role=REGULATOR_AUDITOR) |
| **Основание доступа** | `access_basis_type` (enum: `regulator_inspection`, `targeted_request`, `routine_audit`, `incident_investigation`, `aml_review`), `access_basis_doc_id` (FK ClientDocument — приказ ГСФР, письменный запрос) |
| **Scope доступа** | `access_scope` (JSON: `{entity_types: array, period_start, period_end, target_clients: array | null, target_transactions: array | null, allowed_endpoints: array}`) |
| **Сроки** | `access_granted_at, access_granted_by_user_id` (TENANT_ADMIN), `access_expires_at` (по умолчанию = `access_basis_doc.deadline + 7 days`) |
| **Workflow** | `status` (enum: `pending_grant, active, expired, revoked, completed`) |
| **Revocation** | `revoked_at, revoked_by_user_id, revocation_reason` |
| **Совокупная статистика** | `total_api_calls, last_api_call_at, total_records_accessed` (денормализация для дашборда) |
| **Сервисное** | `created_at, retention_until` (Q12) |

### Сущность RegulatorAPIAccessLog (детальный лог)

**Назначение:** каждый API-вызов регулятором — отдельная запись (для аудита). Высокая частота записей; per-call detail.

| Имя | Тип | Описание |
|---|---|---|
| id | bigint (PK) | Высокообъёмная таблица |
| tenant_id | int (FK Tenant) | — |
| access_id | int (FK RegulatorAPIAccess) | — |
| endpoint | string(500) | URL эндпоинта (например, `/regulator/transactions`) |
| http_method | string(10) | GET/POST |
| request_params | JSON | Query/body params |
| called_at | datetime | — |
| response_status | int | HTTP status |
| returned_record_count | int | Сколько записей вернули |
| response_size_bytes | bigint | — |
| ip_address | string(50) | — |
| audit_event_id | int (FK AuditEvent) | Связь с hash-chain аудитом |
| retention_until | datetime | Q12 |

> Каждый вызов также генерирует запись в `AuditEvent` через action `regulator.api_called` (см. 2.1.4 категория «Sensitive access»). RegulatorAPIAccessLog — оптимизированная сущность для быстрого дашборд-просмотра без обхода всего AuditEvent.

### Регуляторные привязки

- стр. 220 (принимать запросы регулятора через защищённый канал и отвечать) — собственно сущность; `RegulatoryReport.report_type=ad_hoc_request` для текстовых запросов; `RegulatorAPIAccess` для data-запросов
- стр. 221 (не препятствовать проверке) — endpoint `GET /regulator/transactions, /regulator/clients, /regulator/audit_events` доступны только REGULATOR_AUDITOR с активным `RegulatorAPIAccess`
- стр. 223 (предоставлять регулятору read-only API/выгрузки для блокчейн-анализа) — endpoint `GET /regulator/transactions` со streaming JSON/CSV

---

## 2.5.3 Dashboard (декларативная модель)

**Назначение:** определение какие данные доступны какой роли в каком сводном представлении. Не моделирует UI/виджеты — только логику доступа и состав данных. UI реализуется в шаге 4.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant) | — |
| **Идентификация** | | |
| dashboard_code | enum (см. ниже) | — |
| name_i18n_key | string | Локализованное название |
| description | text | — |
| **Доступ** | | |
| available_to_roles | JSON: array of UserRole | Какие роли видят дашборд |
| **Виджеты** | | |
| widgets | JSON: array of widget definitions | Каждый widget = `{widget_type, data_source, params, visible_to_roles, position}` |
| **Сервисное** | `is_active, created_at, updated_at` | — |

### Перечень `dashboard_code`

| Code | Назначение | Доступно ролям |
|---|---|---|
| `compliance_overview` | Общий обзор compliance: открытые SanctionsMatchDecision, RiskOverride pending, FIUMessage candidates, freezing active | COMPLIANCE_HEAD, COMPLIANCE_OFFICER |
| `operations_overview` | Операционный дашборд: ожидающие Order, выполняющиеся Transaction, очередь approval'ов | BACK_OFFICE_HEAD, BACK_OFFICE_OPERATOR |
| `client_onboarding_status` | Статус онбординга всех клиентов: на каком шаге CDD, RFI открытые | COMPLIANCE_OFFICER, COMPLIANCE_HEAD |
| `sanctions_alerts` | Активные совпадения по санкциям, истории decision'ов | COMPLIANCE_HEAD, COMPLIANCE_OFFICER |
| `fiu_pipeline` | Воронка FIUMessage: candidate → marked → exported → submitted → ack | COMPLIANCE_HEAD, COMPLIANCE_OFFICER |
| `frozen_accounts` | Активные FrozenAccount + FrozenOperation; приближение 2-мес дедлайна | COMPLIANCE_HEAD, COMPLIANCE_OFFICER |
| `pending_approvals` | Все CompositeApproval в статусе pending для текущего пользователя | COMPLIANCE_HEAD, TENANT_ADMIN |
| `sla_breaches` | Активные SLABreach, нерешённые | COMPLIANCE_HEAD, TENANT_ADMIN |
| `risk_distribution` | Распределение клиентов по уровням риска (для регуляторной отчётности) | COMPLIANCE_HEAD, REGULATOR_AUDITOR |
| `pep_monitoring` | Отдельный дашборд для PEP-клиентов (Q-2.4-E) — операции, отклонения от профиля | COMPLIANCE_HEAD, COMPLIANCE_OFFICER |
| `regulator_audit_trail` | Лог всех вызовов регулятора (RegulatorAPIAccessLog) | TENANT_ADMIN, COMPLIANCE_HEAD |
| `tenant_admin_overview` | Системный: количество клиентов/операций/users, статус подписки, feature flags | TENANT_ADMIN |
| `super_admin_overview` | Все tenants, lifecycle states, нарушения SLA, инциденты | SUPER_ADMIN |

### Регуляторные привязки

- стр. 80 (ежедневный мониторинг операций high-risk клиентов) — `compliance_overview` + `risk_distribution` (фильтр по level=high)
- стр. 122 (постоянная проверка операций по профилю) — `compliance_overview` widget связан с ProfileBaseline (2.5.8)

---

## 2.5.4 ReportTemplate (шаблоны выгрузок)

**Назначение:** конфигурация шаблонов выгрузок (Excel/CSV/PDF) для разных отчётных задач. Q5 Excel-шаблон для FIUExportBatch — частный случай. На 2.5 — обобщение для всех типов выгрузок.

### Атрибуты

| Имя | Тип | Описание |
|---|---|---|
| id | int (PK) | — |
| tenant_id | int (FK Tenant; nullable для системных шаблонов SUPER_ADMIN) | — |
| **Идентификация** | | |
| template_type | enum | `fiu_excel` (Q5), `regulatory_report_excel`, `regulatory_report_pdf`, `audit_export`, `client_dossier`, `transaction_register`, `frozen_accounts_report`, `risk_assessment_summary`, `verification_log_export`, `regulator_data_export` |
| name | string(255) | — |
| description | text | — |
| **Конфигурация** | | |
| format | enum | `excel`, `csv`, `pdf`, `json`, `xml` |
| fields_config | JSON | Список полей: `[{field_path, column_name, data_format, transformations}]` |
| filters_config | JSON | Доступные фильтры с дефолтами |
| sort_config | JSON | Порядок сортировки |
| **Версионирование** | | |
| is_default | bool | True для шаблона по умолчанию для template_type+tenant |
| version | int | Возрастающий счётчик |
| previous_version_id | int (FK ReportTemplate, nullable) | Цепочка версий |
| **Жизненный цикл** | | |
| is_active | bool | — |
| created_by_user_id, created_at, deactivated_at | — | — |

### Связи

- → FIUExportBatch.template_version (2.4.13)
- → RegulatoryReport.export_format (2.5.1)
- → AuditEvent на изменение шаблонов (это влияет на регуляторную отчётность; регулятор может попросить «по какому шаблону формировался отчёт за период X»)

---

## 2.5.5 SLABreach

**Назначение:** иммутабельная запись о случившемся нарушении SLA-таймера. Сводная сущность для дашборда «SLA Breaches» и для регуляторных объяснений «почему был нарушен срок».

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id` |
| **Тип нарушения** | `breach_type` (enum: `fiu_overdue` (FIUMessage не отправлен в SLA), `rfi_overdue` (клиент не ответил в дедлайн), `freeze_expired_unresolved` (2-мес FrozenAccount без продления), `regulatory_report_overdue` (RegulatoryReport не подан в due_date), `onboarding_stalled_critical` (Client.lifecycle_state=onboarding > N дней), `retention_purge_overdue` (запись с истёкшим retention не purged), `composite_approval_expired` (pending approval не подписан в 24h)) |
| **Цель** | `target_type` (enum), `target_id` |
| **Сроки** | `expected_at` (datetime — когда должно было произойти событие), `occurred_at` (datetime — когда зафиксировано нарушение), `breach_duration_hours` (вычисляемое) |
| **Severity** | `severity` (enum: `low, medium, high, critical`) — рассчитывается на основе breach_type и duration |
| **Resolution** | `is_resolved` (bool), `resolved_at, resolved_by_user_id, resolution_action` (enum: `submitted_late, escalated, dismissed_with_justification, regulatory_self_report_filed`), `resolution_notes` (text) |
| **Эскалация** | `escalation_required` (bool — для critical SLA автоматически эскалируется TENANT_ADMIN); `escalated_at, escalated_to_user_id` |
| **Регуляторное самораскрытие** | `regulatory_report_id` (FK RegulatoryReport, nullable — если breach был задекларирован регулятору как `incident_report`) |
| **Сервисное** | `created_at, retention_until` (Q12) |

### Обнаружение нарушений

Background scheduler `detect_sla_breaches()` запускается каждый час:
- Сканирует FIUMessage: `status != acknowledged AND deadline < now() - grace_minutes` → SLABreach(`fiu_overdue`)
- Сканирует RFIRequest: `status != closed AND deadline < now()` → SLABreach(`rfi_overdue`)
- Сканирует FrozenAccount: `frozen_until < now() AND status='frozen' AND no_extension` → SLABreach(`freeze_expired_unresolved`)
- Сканирует RegulatoryReport: `status != submitted AND due_date < now()` → SLABreach(`regulatory_report_overdue`)
- Сканирует CompositeApproval: `status='pending' AND pending_until < now()` → SLABreach(`composite_approval_expired`)

При создании SLABreach с `severity ∈ {high, critical}` — автоматически создаётся Notification (2.1.9) для COMPLIANCE_HEAD/TENANT_ADMIN.

### Регуляторные привязки

- стр. 166-172 (SLA по FIU-сообщениям) — `breach_type=fiu_overdue`
- стр. 174 (переотправка СПО при отрицательной квитанции) — отдельный SLA на retry
- стр. 218 (меры внутреннего контроля) — SLABreach как часть документально подтверждённой реакции

---

## 2.5.6 Notification — детализация

Базовая сущность определена в 2.1.9. На 2.5 — раскрытие полного перечня категорий и триггеров с учётом всего, что накопилось в 2.2-2.4. Дополнительные атрибуты:

### Дополнительные атрибуты

| Имя | Тип | Описание |
|---|---|---|
| **Дедупликация** | | |
| deduplication_key | string(255) | Уникальный ключ для предотвращения спама (например, `fiu_overdue_FIUMessage_42` — вторая Notification с тем же ключом не создаётся в течение TTL) |
| dedup_ttl_hours | int | По умолчанию 24h |
| **Trigger source (детализация)** | | |
| trigger_source_type | enum | `sla_breach, sanctions_match, rfi_response, override_pending, freeze_alert, list_updated, ack_received, threshold_hit, anomaly_detected, regulator_request_received, retention_warning` |
| trigger_source_id | int | id источника (SLABreach.id, FIUMessage.id, ...) |
| **Приоритет** | `priority` (enum: `low, normal, high, critical`) — критичные дублируются на email | — |
| **Группировка** | `group_key` (string, nullable) — для UI-группировки похожих notifications | — |

### Полный перечень триггеров (по доменам)

| Trigger | Получатель | Канал | Приоритет |
|---|---|---|---|
| **Из 2.2 (Client domain)** | | | |
| `client_anketa_overdue` | COMPLIANCE_OFFICER | in_app | normal |
| `verification_failed` | COMPLIANCE_OFFICER | in_app | high |
| `rfi_response_received` | COMPLIANCE_OFFICER (создавший RFI) | in_app + email | normal |
| `rfi_overdue` | COMPLIANCE_OFFICER | in_app | high |
| `client_portal_login_unusual` (необычный IP/гео) | CLIENT (сам), COMPLIANCE_OFFICER | email | high |
| **Из 2.3 (Operations)** | | | |
| `order_under_review` (требует compliance) | COMPLIANCE_OFFICER | in_app | normal |
| `order_high_risk_approved` | COMPLIANCE_HEAD | in_app + email | high |
| `transaction_completed` | CLIENT (стр. 104 — подтверждение клиенту) | email | normal |
| `freezing_initiated` | COMPLIANCE_HEAD, TENANT_ADMIN | in_app + email | critical |
| `freeze_2_months_approaching` | COMPLIANCE_HEAD | in_app + email | high |
| **Из 2.4 (Compliance)** | | | |
| `sanctions_match_positive_pending_approval` | COMPLIANCE_HEAD | in_app + email | critical |
| `sanctions_list_updated` | COMPLIANCE_HEAD | in_app | normal |
| `risk_override_pending_approval` | COMPLIANCE_HEAD | in_app + email | critical |
| `kyt_high_risk_detected` | COMPLIANCE_OFFICER | in_app | high |
| `fiu_message_deadline_approaching` | COMPLIANCE_OFFICER | in_app + email | high |
| `fiu_ack_received` | COMPLIANCE_OFFICER | in_app | normal |
| `hrc_list_updated` | TENANT_ADMIN, COMPLIANCE_HEAD | in_app | normal |
| `anomaly_detected` (от AnomalyDetector) | COMPLIANCE_OFFICER | in_app | normal/high (по severity) |
| `pep_unusual_pattern` | COMPLIANCE_OFFICER | in_app | normal |
| **Из 2.5 (Reporting)** | | | |
| `sla_breach_critical` | TENANT_ADMIN, COMPLIANCE_HEAD | in_app + email | critical |
| `regulatory_report_due_soon` | COMPLIANCE_HEAD | in_app + email | high |
| `regulator_api_access_granted` | TENANT_ADMIN | in_app + email | high |
| `regulator_inspection_started` | TENANT_ADMIN, COMPLIANCE_HEAD | in_app + email | critical |
| `retention_records_to_purge_soon` | TENANT_ADMIN | in_app | low |
| `consent_withdrawal` | COMPLIANCE_OFFICER | in_app + email | high |
| `profile_baseline_significant_deviation` | COMPLIANCE_OFFICER | in_app | normal |

---

## 2.5.7 ConsentRecord (закрытие Q-2.2-M из копилки)

**Назначение:** учёт согласий клиента на обработку персональных данных, биометрии, передачу третьим лицам и т.п. Регуляторное требование Закона КР «Об информации персонального характера» + общая практика GDPR-style управления consents.

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id, client_id` (FK Client) |
| **Тип согласия** | `consent_type` (enum: `pii_processing` — основная обработка ПДн; `biometric_processing` — биометрия (видео, селфи); `third_party_transfer` — передача внешним провайдерам KYT/IDV/custody; `marketing_communications` — маркетинг; `kyt_provider_check` — конкретно для KYT-проверок (если требуется); `idv_provider_check` — для IDV-проверок; `regulator_data_share` — передача данных регулятору; `cross_border_transfer` — трансграничная передача (для иностранных провайдеров)) |
| **Источник** | `granted_at, granted_via` (enum: `client_portal, paper_signature, video_consent, manual_officer_record`), `granted_doc_id` (FK ClientDocument — например, скан подписанного согласия) |
| **Содержание согласия** | `consent_text_version` (string — версия текста согласия, утверждённая в ПВК), `consent_text_id` (FK PolicyDocument из 2.1.8) |
| **Срок действия** | `valid_from, valid_until` (nullable — null = бессрочно), `auto_renewal` (bool) |
| **Отзыв согласия** | `withdrawn_at, withdrawn_via, withdrawal_reason, withdrawal_doc_id` (FK ClientDocument) |
| **Workflow** | `status` (enum: `active, withdrawn, expired, superseded` (заменено новой версией)) |
| **Связь с конкретными провайдерами** (для third_party_transfer/kyt_*/idv_*) | `affected_providers` (JSON: array of `{provider_type, provider_name}`) |
| **Сервисное** | `created_at, retention_until` (Q12) |

### Workflow

```
                  ┌──────────┐
                  │  ACTIVE  │ ◄─── согласие подписано/получено
                  └──┬─────┬─┘
                     │     │
            withdraw │     │ valid_until exceeded (auto_renewal=false)
                     ▼     ▼
            ┌────────────┐ ┌──────────┐
            │ WITHDRAWN  │ │ EXPIRED  │
            └────────────┘ └──────────┘

   Параллельно: ACTIVE → SUPERSEDED (новая версия согласия подписана)
```

### Бизнес-правила

- Без `consent_type=pii_processing` в статусе `active` — клиент не может перейти в `Client.lifecycle_state=active`
- Отзыв согласия `pii_processing` → автоматически инициирует `Client.terminating` workflow + RegulatoryReport `incident_report`
- Согласие на `kyt_provider_check` обязательно для использования соответствующего KYT-провайдера в Hook 8

### Регуляторные привязки

- ПОВА (защита персональных данных как часть лицензионных требований)
- Закон КР «Об информации персонального характера» (вне основного scope чек-листа, но обязательное требование для обработки ПДн)
- Закрытие Q-2.2-M

---

## 2.5.8 ProfileBaseline (закрытие Q-2.2-L из копилки)

**Назначение:** заявленный при онбординге профиль ожидаемой деловой активности клиента. Используется AnomalyDetector (2.4.18) для сравнения «факт vs ожидание» — критический инструмент мониторинга по стр. 122 (постоянная проверка операций на соответствие профилю).

### Атрибуты

| Группа | Поля |
|---|---|
| **Связь** | `id, tenant_id, client_id` (FK Client) |
| **Заявленные ожидания** | `expected_monthly_volume_kgs` (Decimal), `expected_monthly_transaction_count` (int), `expected_avg_transaction_kgs` (Decimal), `expected_unique_counterparty_count_monthly` (int) |
| **География** | `expected_geo` (JSON: array of ISO-3166 country codes — страны, с которыми клиент ожидает работать) |
| **Активы** | `expected_assets` (JSON: array of `{ticker, network, expected_monthly_volume_pct}`) — тикеры VA с долей ожидаемого объёма |
| **Тип операций** | `expected_order_types` (JSON: array of order_type) — какие типы операций ожидаются (deposit, withdraw, exchange, transfer_va) |
| **Тип контрагентов** | `expected_counterparty_types` (JSON: `{individuals_pct, legal_entities_pct, vasps_pct}`) |
| **Источник заявки** | `declared_at, declared_via` (enum: `client_portal, paper_anketa, manual_officer`), `declaration_doc_id` (FK ClientDocument) |
| **Версионирование** | `version` (int), `previous_version_id` (FK ProfileBaseline, nullable) |
| **Пересмотр** | `last_reviewed_at, next_review_date, last_reviewed_by_user_id` (COMPLIANCE_OFFICER) |
| **Workflow** | `is_current` (bool — только одна актуальная per client), `status` (enum: `pending_review, active, superseded`) |
| **Триггеры пересмотра** | `requires_review_due_to_deviation` (bool — устанавливается AnomalyDetector при значительном отклонении факта от ожиданий) |
| **Сервисное** | `created_at, retention_until` (Q12) |

### Связь с AnomalyDetector

Новый detector_type `profile_deviation`:
- Запуск ежемесячно (или конфигурируется)
- Сравнивает агрегаты Transaction за последний месяц с ProfileBaseline.expected_*
- При отклонении свыше `RiskSettings.profile_deviation_threshold_pct` (например, 200% от заявленного) → SuspiciousActivityFlag со ссылкой на ProfileBaseline + ProfileBaseline.requires_review_due_to_deviation=true

### Workflow пересмотра

При срабатывании `profile_deviation` → Notification COMPLIANCE_OFFICER → инициируется RFI к клиенту с просьбой пояснить (или обновить профиль) → если ответ удовлетворительный, COMPLIANCE_OFFICER создаёт новую `ProfileBaseline` (version+1) и помечает старую superseded.

### Регуляторные привязки

- стр. 122 (постоянная проверка соответствия операций профилю) — собственно реализация механизма сравнения факт vs профиль
- стр. 75 (применять усиленные меры при отклонении профиля) — `requires_review_due_to_deviation` влияет на Hook 9 (risk re-evaluation)
- стр. 12 (цель и характер деловых отношений) — связь с `IndividualClient.business_purpose` / `LegalEntityClient.business_purpose` (текстовое описание дополняет numeric baseline)

---

# 2.5.A Финальное покрытие чек-листа

Сквозной аудит: для каждой группы строк 01-regulatory-checklist.md — где закрыта.

## Раздел I — Идентификация и верификация

| Строки | Группа | Закрыто в | Не закрыто (комментарий) |
|---|---|---|---|
| 1-17 | I.1 Анкета ФЛ | 2.2.3 IndividualClient + Q8 дельта 606→739 | — |
| 18-38 | I.2 Анкета ЮЛ | 2.2.4 LegalEntityClient + Q8 дельта 606→739 | — |
| 39-43 | I.3 Документы | 2.2.10 ClientDocument + ClientDocumentVersion | — |
| 44-55 | I.4 Дистанционная видеоверификация | 2.2.12 VerificationSession + VerificationArtifact + Hook 7 (sanctions auto) + 2.5.7 ConsentRecord (consent на биометрию) | — |
| 56 | Серверы в КР | (вне домена — инфра, шаг 3) | Шаг 3 |
| 57 | TLS | (вне домена — инфра) | Шаг 3 |
| 58 | Запасной сервер | (вне домена — инфра) | Шаг 3 |
| 59 | Согласование систем для иностранцев | 2.5.7 ConsentRecord + Q7 (запрос ГСФР) | частично — процедура в шаге 4 |

## Раздел II — CDD/EDD/SDD, БВ, ПДЛ, RFI

| Строки | Группа | Закрыто в | Не закрыто |
|---|---|---|---|
| 60-74 | II.1 БВ (16 критериев) | 2.2.8 UBO + UBOEntity | — |
| 75-78 | II.2 EDD/SDD триггеры | Hook 9 + 2.4.5 RiskAssessment + 2.4.8 RiskOverride + 2.5.8 ProfileBaseline | — |
| 79-87 | II.2 Periodicity, обновления | 2.5.8 ProfileBaseline.next_review_date + 2.4.5 RiskAssessment.next_review_date + 2.2.13 RFIRequest | — |
| 88-93 | II.3 ПДЛ | 2.2.9 PEPProfile + PEPRelation | — |
| 94-97 | II.4 RFI | 2.2.13 RFIRequest + 2.4.14 RFIInvolvement | — |

## Раздел III — Реестр операций, Travel Rule, мониторинг

| Строки | Группа | Закрыто в | Не закрыто |
|---|---|---|---|
| 97a-97d | III.0 Функциональный scope | 2.3.1 Order.order_type + 2.3.2 Transaction | 97d (эмиссионные услуги) — out-of-scope MVP |
| 98-105 | III.1 Реестр операций | 2.3.2 Transaction + 2.3.5 CounterpartyBank + 2.3.6 ExchangeRateSnapshot | — |
| 106-113 | III.1 Адреса, запреты | 2.3.3 WalletAddress + Hook 8 (KYT) + Hook 7 (sanctions) | стр. 110 (NFT-запрет) — детально шаг 4 |
| 114 | Видеонаблюдение терминалов | ИСКЛЮЧЕНО (OOS — онлайн-сценарий) | — |
| 114c | Услуга перевода | 2.3.1 Order.order_type=transfer_va + 2.3.4 CustodyMovement | — |
| 114d-f | III.1.bis Custody | 2.3.3 WalletAddress.key_holder + 2.3.4 CustodyMovement (Q13/Q14) | — |
| 114g1 | Запрет non-VASP агентов | 2.4.10 KYTCheckResult.provider + Tenant.feature_flags + матрица 2.1.3 | — |
| 114g2 | Обязательный AML/KYT-провайдер | 2.4.10 KYTCheckResult + 2.1.5 TenantSettings.kyt_provider | — |
| 114g3-g5 | Локальное логирование external custody | 2.3.4 CustodyMovement.external_request_payload/response_payload | — |
| 114g6 | Retention | 2.1.7 RetentionPolicy + Q12 | — |
| 115-121 | III.2 Travel Rule | 2.4.11 TravelRuleMessage + 2.3.3 WalletAddress.is_vasp_owned | — |
| 122-132 | III.3 Транзакционный мониторинг | 2.4.18 AnomalyDetector + 2.3.9 SuspiciousActivityFlag + 2.5.8 ProfileBaseline + Hook 9 | — |

## Раздел IV — Sanctions, Freezing, HRC, FIU

| Строки | Группа | Закрыто в | Не закрыто |
|---|---|---|---|
| 133-139 | IV.1 Санкции | 2.4.1-2.4.4 + Hook 7 | — |
| 140-151 | IV.2 Замораживание | 2.3.8 FrozenAccount + FrozenOperation + 2.4.12 FIUMessage (для уведомлений ФР) | — |
| 152-160 | IV.3 ВРС | 2.4.15 HighRiskCountry + 2.4.16 HighRiskCountryCheck | — |
| 161-177 | IV.4 СПО/ПО в ФР | 2.4.12 FIUMessage + 2.4.13 FIUExportBatch (Q5) | — |
| 178-188 | IV.5 Риск-скоринг | 2.4.5-2.4.8 RiskAssessment family + 2.4.18 AnomalyDetector | — |

## Раздел V — Хранение, журналы, RBAC, инфра

| Строки | Группа | Закрыто в | Не закрыто |
|---|---|---|---|
| 189-195 | V.1 Retention | 2.1.7 RetentionPolicy + RetentionExtension + Q12 | стр. 193 (резервное копирование) — частично инфра шаг 3 |
| 196-203 | V.2 Аудит | 2.1.4 AuditEvent + hash-chain | — |
| 204-208 | V.3 RBAC | 2.1.3 RBAC матрица + 2.4.9 CompositeApproval + расширения 2.3, 2.4 | стр. 208 (MFA сотрудников) — поля User есть, имплементация шаг 4 |
| 209-217 | V.4 Инфра | (вне домена — шаг 3) | Шаг 3: 209 (серверы КР), 210 (запасной сервер), 211 (ИБ-процедуры), 212 (защита PII) — частично 2.5.7 ConsentRecord |
| 213 | Один личный кабинет одним клиентом | 2.2.14 ClientPortalAccess + UNIQUE constraint на client_user_link | — |
| 214-216 | V.4 Отчётность ОВА | 2.5.1 RegulatoryReport | — |
| 217 | Согласование рекламы | ИСКЛЮЧЕНО (OOS — организационный процесс) | — |
| 218-223 | V.5 Раскрытие/доступ регулятора | 2.5.1 RegulatoryReport + 2.5.2 RegulatorAPIAccess + RegulatorAPIAccessLog | — |

## Сводка покрытия

| Категория | Кол-во строк | % |
|---|---:|---:|
| Полностью закрыто на уровне доменной модели | 200+ | ~87% |
| Частично закрыто (модель есть, имплементация шаг 4) | 15-20 | ~8% |
| Out-of-scope (явно ИСКЛЮЧЕНО) | 3 | ~1% |
| Откладывается на шаг 3 (архитектура / инфраструктура) | 6-8 | ~3% |
| Откладывается на шаг 4 (имплементация деталей) | 5-7 | ~2% |

**Итого: ~95% строк чек-листа имеют адресную привязку к сущностям доменной модели.** Оставшиеся 5% — инфраструктурные требования (физическое размещение серверов, резервное копирование, MFA-имплементация), которые корректно решаются на уровне архитектуры (шаг 3) или имплементации (шаг 4), а не в доменной модели.

## Не закрыто на уровне доменной модели

Строки, которые принципиально не моделируются в доменной модели и требуют решения на других уровнях:

| Строка | Тема | Где решается |
|---|---|---|
| 56 | Серверы в КР (физическое размещение) | Шаг 3 (архитектура) — выбор облачного провайдера, региона |
| 57 | TLS/HTTPS | Шаг 3 + конфигурация на шаге 4 |
| 58 | Запасной сервер за границей | Шаг 3 (multi-region архитектура) |
| 110 | Запрет операций с NFT | Шаг 4 (валидатор `target_asset` против списка) |
| 193 | Резервное копирование данных | Шаг 3 (бэкап-стратегия) |
| 208 | MFA для сотрудников (имплементация) | Шаг 4 (модель полей в User уже есть, нужна интеграция с TOTP-провайдером) |
| 209-212 | Инфраструктурные требования | Шаг 3 |
| 217 | Согласование рекламы | Out-of-scope (организационный процесс маркетинга, не ИТ) |

---

# 2.5.B Сводный список всех открытых вопросов

Все Q-2.X-Y вопросы из подшагов 2.1-2.5, сгруппированные по тому, на каком шаге решаются.

## Закрыто в шаге 2 (этом)

| ID | Вопрос | Где разрешено |
|---|---|---|
| Q-2.1-C | Иерархия Tenant'ов | Решено: плоско, без иерархии (формализовано пользователем перед 2.2) |
| Q-2.1-F | CLIENT ↔ Client связь | Решено: many-to-many через client_user_link (2.2.2) |
| Q-2.2-L | ProfileBaseline для anomaly detection | Закрыто: 2.5.8 ProfileBaseline |
| Q-2.2-M | Управление consents | Закрыто: 2.5.7 ConsentRecord |
| Q-2.3-O | Travel Rule в отдельной сущности | Закрыто: 2.4.11 TravelRuleMessage |
| Q-2.3-S | Risk hook 9 — дельта vs абсолютный уровень | Решено: формализовано в 2.4.I (Hook 9 — по дельте) |
| Q-2.3-T | PEP не блокирует каждую операцию | Решено: формализовано в 2.4.I (PEP → MonitoringFlag, не WARN/FAIL) |

## Откладывается на шаг 3 (архитектура)

| ID | Вопрос | Почему на шаг 3 |
|---|---|---|
| Q-2.1-B | SUPER_ADMIN — vendor-tenant vs nullable tenant_id | Архитектурное решение по обработке cross-tenant |
| Q-2.1-G | Storage документов ПВК (BYTEA / FS / S3) | Архитектура хранения |
| Q-2.1-M | Производительность hash-chain (async write) | Архитектура аудита |
| Q-2.2-F | Polymorphic FK или раздельные FK | Архитектура БД |
| Q-2.2-H | Гос. база БВ — режим интеграции | Архитектура интеграций |
| Q-2.4-A | Каскадная инвалидация cache при list_update | Архитектура кэша |
| Q-2.4-B | Sanctions checks parallel/sequential | Архитектура pipeline |

## Откладывается на шаг 4 (технический план / имплементация)

| ID | Вопрос | Почему на шаг 4 |
|---|---|---|
| Q-2.1-A | Миграция enum UserRole | Деталь имплементации миграции |
| Q-2.1-N | License key expiration → tenant.suspended | Триггер имплементации |
| Q-2.2-D | client_type конвертация (ФЛ → ИП → ЮЛ) | Workflow имплементации |
| Q-2.2-E | Structured addresses + backwards compat | Миграция данных |
| Q-2.2-I | Обработка смены ФИО / документов | Workflow имплементации |
| Q-2.3-A | Дробление Transaction (partial fill) | Имплементационная деталь (есть текущая позиция) |
| Q-2.3-B | blockchain_tx_hash failed onchain | Имплементационная деталь (есть текущая позиция) |
| Q-2.3-C | Reverse-операции | Имплементационная деталь (есть текущая позиция) |
| Q-2.3-G | FSM Order при partial fill | Имплементационная деталь (есть текущая позиция) |
| Q-2.3-H | Travel Rule IVMS101 формат | Зависит от выбора провайдера в шаге 4 |
| Q-2.3-K | Изменение Order после submit | Имплементационная деталь (есть текущая позиция: запрещено) |
| Q-2.3-L | Webhook/polling Fireblocks | Имплементационная деталь |
| Q-2.4-D | Override-trigger detection — где живёт | Имплементационная деталь (decentralized — текущая позиция) |
| Q-2.4-G | FIUMessage.data_snapshot — момент создания | Имплементационная деталь (есть текущая позиция: при marked) |
| Q-2.4-H | AnomalyDetector — отказоустойчивость | Имплементационная деталь |

## Backlog / future iterations

| ID | Вопрос | Куда |
|---|---|---|
| Q-2.1-D | Поведение при разрыве hash-chain | Backlog (текущая позиция: блокировка + алерт) |
| Q-2.1-E | Детализация роли READ_ONLY | Backlog (нужно на основе реального использования) |
| Q-2.1-H | Источник списка праздников КР | Backlog (статичный список MVP, динамический позже) |
| Q-2.1-I | AML-офицер в Tenant vs FK на User | Backlog (косметика модели) |
| Q-2.1-J | AuditEvent.read для CO — own-only? | Backlog (политика доступа) |
| Q-2.1-K | Второй подписант для Risk.update_settings | Решено в 2.4.9: TENANT_ADMIN |
| Q-2.1-L | Order.create_on_behalf для BACK_OFFICE_OPERATOR | Решено в матрице 2.3 |
| Q-2.2-A | Глубина UBO-цепочек | Backlog (зависит от UI/UX, не блокирует) |
| Q-2.2-B | VerificationSession ↔ ClientDocument m-to-m | Backlog (есть текущее решение 1-to-many) |
| Q-2.2-C | PEP-источников структура | Backlog (зависит от провайдеров KYT) |
| Q-2.2-G | ClientPortalAccess vs User overlap | Backlog (косметика) |
| Q-2.2-J | Удаление БВ при изменении структуры | Решено: soft-archive (текущая позиция) |
| Q-2.3-D | Reconciliation с банковскими выписками | Future scope (не MVP) |
| Q-2.3-E | Продление 2-мес FrozenAccount | Решено через RetentionExtension |
| Q-2.3-F | Курс в агрегате 24h | Решено: каждая операция со своим курсом (формализовано) |
| Q-2.3-I | Order без Client (anonymous deposit) | Решено: SuspiciousActivityFlag + manual association |
| Q-2.3-J | key_holder per-Wallet vs per-Operation | Решено: per-Wallet (текущая позиция) |
| Q-2.3-N (если был) | — | — |
| Q-2.4-C | Версионирование RiskSettings — ретроспектива | Решено: бессрочное хранение версий |
| Q-2.4-E | PEP-monitoring как отдельный домен | Решено: MonitoringFlag (расширение SuspiciousActivityFlag) |
| Q-2.4-F | Travel Rule strict vs lenient | Решено: per-tenant policy в TenantSettings |
| Q-2.4-I | Кто обновляет HRC-список в БД | Решено: SUPER_ADMIN |
| Q-2.4-J | Двойная подпись для sanctions positive_match | Решено: да, обязательно |
| Q-2.4-K | KYT для originator wallet incoming TR | Решено: да, проверяем (flag без блока) |
| Q-2.4-L | Threshold-данные в FIUMessage.data_snapshot | Решено: дублируем для иммутабельности |

---

# 2.5.C Открытые вопросы 2.5

### Q-2.5-A. RegulatoryReport.payload структура

Каждый `report_type` имеет свою структуру `payload` (JSON). Эти структуры должны соответствовать формам, утверждённым ГСФР. На 2.5 — не специфицируются, поскольку:
- Конкретные шаблоны зависят от текущих форм ГСФР (могут меняться)
- Реализация — через `ReportTemplate` (2.5.4) с настраиваемыми полями

**Не блокирует 2.5**, требует уточнения форм при имплементации шага 4.

### Q-2.5-B. RegulatorAPIAccess — формат запроса доступа

Как именно регулятор получает доступ? Email с приказом → SUPER_ADMIN/TENANT_ADMIN создаёт `RegulatorAPIAccess` вручную? Или есть API «request access»?

**Текущая позиция:** ручное создание TENANT_ADMIN'ом на основании письменного запроса ФР (загруженного как `access_basis_doc`). Автоматизация — на шаге 4 при наличии формального API ФР.

### Q-2.5-C. Dashboard.widgets — формат vs UI-связь

`widgets` JSON определяет состав. Но рендеринг и взаимодействие — UI. Как обеспечить, чтобы изменения в Dashboard не ломали UI и наоборот?

**Не блокирует 2.5**, решается контрактом backend↔frontend в шаге 4.

### Q-2.5-D. SLABreach — false positive из-за clock-skew или системных сбоев

При system downtime в момент дедлайна — SLABreach создаётся, но это технический сбой, не реальное нарушение. Нужно ли различать?

**Текущая позиция:** SLABreach всегда создаётся, но `resolution_action=dismissed_with_justification` с пометкой о системном инциденте позволяет закрыть без эскалации. Шаг 4 уточнит.

### Q-2.5-E. ConsentRecord versions — обработка изменения текста согласия

Если ОВА обновляет текст pii_processing согласия (новая редакция ПВК) — как мигрируются существующие consents? Все становятся superseded и требуют переподписания?

**Текущая позиция:** да. Старая `ConsentRecord` → status=superseded, новая ConsentRecord создаётся в pending state, клиент получает Notification и должен подписать в портале или через офицера. До переподписания — Client.lifecycle_state=suspended.

### Q-2.5-F. ProfileBaseline — обязательность для онбординга

Должен ли каждый клиент иметь ProfileBaseline для перехода в active? Или это опционально (особенно для ФЛ с разовыми операциями)?

**Текущая позиция:** обязательно для всех client_type = legal_entity и vasp_counterparty. Для individual — обязательно если ожидаемый объём > порог `RiskSettings.profile_required_threshold_kgs`. Для разовых операций ФЛ ниже порога — необязательно. Шаг 4 уточнит UX.

### Q-2.5-G. Многотенантные дашборды для SUPER_ADMIN

`super_admin_overview` — должен видеть все tenants. Это нарушает row-level изоляцию (Q-2.1-A в 2.1.1). Текущее решение — SUPER_ADMIN с явным `bypass_tenant_filter=True`.

**Не блокирует 2.5**, реализация через специальный режим в шаге 4 с особым аудитом.

---

# 2.5.D Сводная статистика домена

## Сущности по подшагам

| Подшаг | Кол-во новых сущностей | Из них рефакторинг существующих | Полностью новые |
|---|---:|---:|---:|
| 2.1 | 10 | 1 (User extension) | 9 |
| 2.2 | 14 | 7 (Client, Individual, Legal, Director, Representative, UBO, ClientDocument, PEP refactor) | 7 |
| 2.3 | 9 | 1 (Transaction) | 8 |
| 2.4 | 18 | 4 (SanctionsList, SanctionedEntity, SanctionsCheck, HighRiskCountry) | 14 |
| 2.5 | 8 | 0 | 8 |
| **Итого** | **59** | **13** | **46** |

## Открытые вопросы по подшагам

| Подшаг | Q-вопросов | Закрыто в этом шаге | На шаг 3 | На шаг 4 | Backlog |
|---|---:|---:|---:|---:|---:|
| 2.1 | 8+6 (доп.) | 2 | 3 | 2 | 7 |
| 2.2 | 10+2 (доп.) | 2 | 1 | 4 | 5 |
| 2.3 | 12+2 (доп.) | 3 | 0 | 6 | 5 |
| 2.4 | 12 | 0 | 2 | 4 | 6 |
| 2.5 | 7 | 0 | 0 | 4 | 3 |
| **Итого** | **~57** | **7** | **6** | **20** | **26** |

## Покрытие чек-листа

| Категория | Кол-во | % |
|---|---:|---:|
| Полностью закрыто моделью | 200+ | ~87% |
| Частично закрыто (модель есть, имплементация позже) | 15-20 | ~8% |
| Out-of-scope (явно ИСКЛЮЧЕНО) | 3 | ~1% |
| Откладывается на шаг 3 | 6-8 | ~3% |
| Откладывается на шаг 4 | 5-7 | ~2% |

**~95% покрытие** — все ключевые регуляторные требования имеют адресные привязки к сущностям доменной модели.

---

---

## История версий

| Версия | Дата | Изменения |
|---|---|---|
| 0.1 | 2026-05-02 | Подшаг 2.1 — общий каркас (Tenant, User, RBAC, AuditEvent, TenantSettings, RiskSettings, RetentionPolicy, PolicyDocument, Notification, i18n). 8 открытых вопросов вынесены |
| 0.2 | 2026-05-02 | Подшаг 2.2 — клиентский домен. Спроектированы 14 сущностей: Client (с lifecycle FSM), client_user_link (Q-2.1-F resolution), IndividualClient + LegalEntityClient (с дельтой 606→CDD-739, закрытие Q8), VASPCounterparty (новая для VASP-контрагентов), DirectorClient + DirectorHistory (историзация), ClientRepresentative (расширение), UBO + UBOEntity (многоуровневые цепочки), PEPProfile + PEPRelation (рефакторинг PEP), ClientDocument + ClientDocumentVersion (версионирование), SOFDocument (оставлен отдельной сущностью), VerificationSession + VerificationArtifact (закрытие стр. 200-201), RFIRequest, ClientPortalAccess. Закрыто ~50 строк чек-листа. 10 открытых вопросов 2.2 вынесены |
| 0.3 | 2026-05-02 | Подшаг 2.3 — операционный домен. Спроектированы 9 сущностей: Order (намерение клиента, FSM с 11 состояниями), Transaction (рефакторинг существующей; разделена на финансовые поля Q5 и компоненты Excel-реестра; AML-классификация вынесена в 2.4), WalletAddress (с key_holder Q13, KYT-полями Q10, Travel Rule), CustodyMovement (закрытие 114g3-g6 — локальное логирование через внешний custody, signature_payload Q14), CounterpartyBank (поля Excel Q5), ExchangeRateSnapshot (фиксация курса Q5), ThresholdCheck (Q11 — single + aggregated_24h), FrozenAccount + FrozenOperation (раздельные сущности заморозки активов и приостановления workflow), SuspiciousActivityFlag (промежуточный слой между detected anomaly и formal FIUMessage). Описан pre-submit hooks pipeline из 11 шагов. Расширена RBAC матрица для операционного домена. Закрыто ~40 строк чек-листа. 12 открытых вопросов 2.3 вынесены |
| 0.4 | 2026-05-02 | Подшаг 2.4 — compliance-домен. Спроектированы 18 сущностей в группах: (A) Sanctions — SanctionsList (рефакт. + версионирование snapshot), SanctionedEntity (рефакт. с поддержкой vessel/aircraft/crypto_addresses), SanctionsCheck (рефакт. с расширенным target_type), SanctionsMatchDecision (двойная подпись через CompositeApproval); (B) Risk — RiskAssessment (общая, версионируется через RiskSettings), RiskBasic61p (уровень 1 — обязательный 61/п), RiskAdvancedVASP (уровень 2 — 4-блочная VASP, опциональный модуль Q3), RiskOverride (10 триггеров Q4, двойная подпись); (C) Cross-cutting — CompositeApproval (формализация всех ✋-решений из RBAC); (D) KYT — KYTCheckResult (унифицированный ответ от любого провайдера Q10); (E) Travel Rule — TravelRuleMessage (перенос Q-2.3-O, IVMS101, FSM с 5 состояниями); (F) FIU — FIUMessage (СПО/ПО с FSM и SLA-таймерами по ПФР), FIUExportBatch (Excel-реестр Q5 с двойной подписью), RFIInvolvement; (G) HRC — HighRiskCountry (рефакт.), HighRiskCountryCheck (per-target audit); (H) Detectors — AnomalyDetector (декларативная модель, конфигурируется через RiskSettings, Q1), SuspiciousActivityFlag расширен (linked_*_check_id для source-tracking). Раскрыты pre-submit hooks 7-9 с PASS/WARN/FAIL логикой. Расширена RBAC. Закрыто ~50 строк чек-листа. 12 открытых вопросов 2.4 |
| 0.5 | 2026-05-02 | **Финальный подшаг 2.5** — reporting и интеграции. Спроектированы 8 сущностей: RegulatoryReport (отчётность ОВА в УО — 13 типов отчётов по ПОВА п. 36, FSM с двойной подписью), RegulatorAPIAccess + RegulatorAPIAccessLog (read-only доступ ГСФР с per-call audit), Dashboard (декларативная модель — 13 типов дашбордов по ролям), ReportTemplate (обобщение Q5 Excel-шаблонов на все типы выгрузок), SLABreach (сводная сущность нарушений SLA — 7 типов с auto-detection scheduler'ом), Notification (детализация — 25+ триггеров с deduplication_key), ConsentRecord (закрывает Q-2.2-M — 8 типов consents), ProfileBaseline (закрывает Q-2.2-L — заявленный профиль для anomaly detection). Проведён финальный аудит покрытия чек-листа: ~95% (200+ строк закрыто моделью; остальное — инфраструктура шага 3 или имплементация шага 4). Сведены ВСЕ открытые вопросы (~57 шт.) с распределением: закрыто в шаге 2 (7), на шаг 3 (6), на шаг 4 (20), backlog (26). 7 новых открытых вопросов 2.5. **Шаг 2 полностью завершён.** |


<!-- IDВопросБлокируетQ-2.1-AМиграция enum UserRoleШаг 4Q-2.1-BSUPER_ADMIN bypass — vendor-tenant vs nullable; on-premise buildШаг 3Q-2.1-CИерархия Tenant'ов — решено: плоско, без иерархииЗакрытQ-2.1-DПоведение при разрыве hash-chainНе блокируетQ-2.1-EДетализация роли READ_ONLYНе блокируетQ-2.1-FCLIENT ↔ Client связь — решено: many-to-many через client_user_link, link_type enumЗакрытQ-2.1-GХранилище для документов ПВКШаг 3Q-2.1-HИсточник списка праздников КР для SLAНе блокируетQ-2.1-I (новый)Дублирование AML-офицера в Tenant vs FK на UserНе блокирует, на шаге 3Q-2.1-J (новый)AuditEvent.read для COMPLIANCE_OFFICER — вообще нет или own-onlyНе блокируетQ-2.1-K (новый)Кто второй подписант для Risk.update_settings (✋)Уточнить до 2.5Q-2.1-L (новый)Поддержка Transaction.create_order_on_behalf для BACK_OFFICE_OPERATORБизнес-вопрос, до шага 4Q-2.1-M (новый)Производительность hash-chain — async write через queueШаг 3Q-2.1-N (новый)License key expiration → tenant.suspended (FSM trigger)Шаг 4 -->