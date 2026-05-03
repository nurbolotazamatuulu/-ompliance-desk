---
name: Q-tenancy-E — sql_filter strict env raises on non-tenant-scoped models
description: _do_orm_execute raises TenantContextMissingError on ANY query without current_tenant_id in strict env, even if the queried model has no TenantScopedMixin. Fix by early-return in listener for non-mixin models.
type: project
---

Q-tenancy-E: `app.tenancy.sql_filter._do_orm_execute` в strict env (через
`_is_strict_env()`) стреляет `TenantContextMissingError` на любой ORM
query без `current_tenant_id` ContextVar, **даже если модель не наследует
`TenantScopedMixin`**.

**Why:** обнаружено при написании `tests/test_tenant_lifecycle.py`. FSM
функции работают с `Company` напрямую — `Company` НЕ TenantScopedMixin,
но listener всё равно ловит запрос и raises. Тесты пришлось править
явным `set_current_tenant_id(...)` в db_session fixture.

Аналогичный баг проявится в production:
- `python -m app.rbac.migrate_user_roles --commit` — делает `select(User)`
  без tenant context (системный CLI, не привязан к запросу). User имеет
  `company_id` но не TenantScopedMixin → упадёт в strict env.
- Любой migration script через `app.database.SessionLocal()` без явного
  set_current_tenant_id → упадёт.
- Health checks / startup queries.

Сейчас CLI работает только потому что strict env по умолчанию выключен
в dev/test. Включение strict в production = немедленная регрессия.

**How to apply:** в `_do_orm_execute` — early-return ПЕРЕД проверкой
strict env, если ни одна из загружаемых mapper'ов не наследует
TenantScopedMixin. Псевдокод:

    def _do_orm_execute(orm_execute_state):
        if not _has_tenant_scoped_mapper(orm_execute_state):
            return  # not our concern
        tenant_id = current_tenant_id.get()
        if tenant_id is None:
            if _is_strict_env():
                raise TenantContextMissingError(...)
            # ... existing fallback

Тест-кейсы для Phase 2 fix:
- `test_query_non_scoped_model_in_strict_env_does_not_raise` (Company)
- `test_query_scoped_model_in_strict_env_still_raises` (Client)
- `test_mixed_query_strict_env_uses_loader_criteria_only_for_scoped`
