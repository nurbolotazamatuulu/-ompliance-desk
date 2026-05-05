# 01 · Реестр клиентов

**Роут:** `/clients`
**Роли:** `compliance_officer`, `compliance_lead`, `auditor`, `admin`

## Лейаут

```
PageHeader:  «Клиенты»  · ИТОГО 1 248 · 42 в работе      [+ Создать клиента]
Toolbar:     [🔎 поиск] [Тип ▾] [Статус ▾] [Риск ▾] [Офицер ▾] [Период ▾]   1 248 ▼
DataTable виртуализированная
PaginationBar (если не виртуализация)
```

## Toolbar

- **Поиск** Input с лидирующей иконкой `Search`. Debounce 250ms. Ищет по: `fileNumber`, `inn`, `shortName/fullName`, `lastName + firstName`. Показывает `cd-caps mono: НАЙДЕНО 17` когда query есть.
- **Фильтры** — `<Select multiple>`:
  - Тип: ФЛ / ЮЛ.
  - Статус: 8 значений.
  - Риск: low/medium/high/critical.
  - Офицер: список из USERS (compliance role).
  - Период: «Сегодня / 7д / 30д / Свой».
- **Активные фильтры** показываем как чипы под toolbar; X на чипе сбрасывает один; «Сбросить все» если ≥2.

## Колонки таблицы

| № | id | header | width | mono | tone | sortable |
|---|---|---|---|---|---|---|
| 0 | checkbox | (selectable) | 32 | — | — | нет |
| 1 | fileNumber | № ДЕЛА | 130 | да | — | да |
| 2 | name | КЛИЕНТ | flex | — | — | да |
| 3 | type | ТИП | 60 | — | badge | нет |
| 4 | inn | ИНН | 140 | да | — | нет |
| 5 | risk | РИСК | 100 | mono num | tone | да |
| 6 | status | СТАТУС | 140 | — | badge | да |
| 7 | officer | ОФИЦЕР | 140 | — | — | нет |
| 8 | sla | SLA | 100 | mono | orange/red | да |
| 9 | createdAt | СОЗДАН | 100 | mono | — | да |
| 10 | actions | (kebab) | 40 | — | — | нет |

Density: compact (28px). Hover: row-hover.
`rowTone`: critical risk → red; SLA <4ч → orange.

## Bulk-действия

При выделении строк (≥1) показываем `<BulkActionBar>` снизу — sticky 56px:
- N выбрано.
- Кнопки: «Назначить офицера», «Изменить статус», «Запросить документы», «Экспорт CSV», «Экспорт PDF».
- Ghost X для снятия выделения.

При >1000 выбранных — disabled с tooltip «Слишком большая партия (макс 1000)».

## Создание

CTA «+ Создать клиента» в PageHeader → выпадашка:
- «Юридическое лицо (ЮЛ)» → `/onboarding/le/new/1`.
- «Физическое лицо (ФЛ)» → `/onboarding/pf/new/1`.

## Состояния

- **Loading** — 12 skeleton-rows.
- **Empty (нет клиентов вообще)** — EmptyState с иконкой `Users`, кнопка «Создать первого клиента».
- **Empty (фильтр без результатов)** — EmptyState с иконкой `SearchX`, кнопка «Сбросить фильтры».
- **Error** — на всю таблицу: «Не удалось загрузить список» + retry.
- **No rights** — если роль не имеет `clients.view` — fullscreen EmptyState `Lock`.

## URL state

Все фильтры синхронизировать с query string: `?q=&type=le&status=in_review,awaiting_docs&risk=high&officer=U-2&from=2026-04-01&to=2026-05-03&sort=risk&dir=desc&page=1`. Прокидываемая ссылка восстанавливает состояние.

## Виртуализация

`@tanstack/react-virtual` если rows > 200. Sticky header. Высота строки фикс 28px.

## Адаптив

- ≥1280: все колонки.
- 1024–1279: скрыть `tags`, `assignedOfficer`.
- 768–1023: + скрыть `inn`, `createdAt`.
- <768: список карточек (см. responsive.md).
