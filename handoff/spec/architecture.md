# Архитектура

## Стек

| Слой | Технология | Версия | Зачем |
|---|---|---|---|
| Сборка | Vite | 5.x | Быстрый dev, ESM |
| UI | React | 18.3 | — |
| Типы | TypeScript | 5.x | Strict mode |
| Стили | Tailwind CSS | 3.4 | Утилиты + CSS-переменные |
| Роутинг | React Router | 6.x | Data routers |
| Состояние | Zustand | 4.x | Малый footprint |
| Формы | React Hook Form + Zod | — | Валидация |
| Иконки | lucide-react | — | Open-source |
| Дата | date-fns + locale ru | — | Форматирование KG |
| Графы | reactflow | — | Только для УБО и KYT-графа |

## Структура папок

```
src/
├── main.tsx                 ← entry, ThemeProvider, Router
├── App.tsx                  ← layout-обёртка (Sidebar + Outlet)
│
├── styles/
│   ├── tokens.css           ← CSS-переменные тем
│   └── index.css            ← @tailwind base/components/utilities + базовые стили
│
├── types/                   ← из spec/data-model.ts
│   ├── client.ts
│   ├── sanction.ts
│   ├── transaction.ts
│   ├── document.ts
│   ├── ubo.ts
│   ├── audit.ts
│   └── index.ts
│
├── mocks/                   ← из spec/mock-data.ts (разбить по доменам)
│   ├── clients.ts           ← 100+ клиентов
│   ├── sanctions.ts         ← журнал скрининга
│   ├── transactions.ts      ← реестр операций
│   ├── audit.ts             ← аудит-лог
│   └── index.ts
│
├── stores/                  ← Zustand
│   ├── theme.ts             ← dark/light
│   ├── auth.ts              ← текущий офицер, права
│   ├── clients.ts           ← фильтры, выбранные строки
│   └── ui.ts                ← открытые модалки, тосты
│
├── lib/
│   ├── format.ts            ← formatINN, formatPassport, formatMoney, formatDate
│   ├── risk.ts              ← цвет/лейбл по уровню риска
│   ├── api.ts               ← fake-api с задержками
│   └── cn.ts                ← clsx-обёртка
│
├── components/              ← общие UI-компоненты
│   ├── primitives/
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Radio.tsx
│   │   ├── Switch.tsx
│   │   ├── Tabs.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Dialog.tsx
│   │   ├── Drawer.tsx
│   │   ├── Toast.tsx
│   │   ├── Spinner.tsx
│   │   └── Skeleton.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── PageHeader.tsx
│   │   ├── Toolbar.tsx
│   │   └── EmptyState.tsx
│   ├── data/
│   │   ├── DataTable.tsx        ← виртуализация, сортировка, выбор
│   │   ├── FilterBar.tsx
│   │   ├── PaginationBar.tsx
│   │   ├── ColumnPicker.tsx
│   │   └── BulkActionBar.tsx
│   ├── compliance/
│   │   ├── RiskScoreCard.tsx    ← шапка с 4 категориями + override
│   │   ├── RiskMeter.tsx        ← полоска прогресса
│   │   ├── KYTFlag.tsx          ← цветной флажок
│   │   ├── SanctionMatchCard.tsx
│   │   ├── ClientStatusBadge.tsx
│   │   └── OverrideTriggerCard.tsx
│   ├── wizard/
│   │   ├── WizardShell.tsx
│   │   ├── WizardSteps.tsx
│   │   └── WizardFooter.tsx
│   └── theme/
│       └── ThemeToggle.tsx
│
├── features/                ← экраны и доменная логика
│   ├── dashboard/
│   ├── clients-list/
│   ├── client-card/
│   │   ├── ClientCardLayout.tsx
│   │   ├── tabs/
│   │   │   ├── AnketaTab.tsx
│   │   │   ├── DocumentsTab.tsx
│   │   │   ├── UBOTab.tsx
│   │   │   ├── ScoringTab.tsx
│   │   │   ├── SanctionsTab.tsx
│   │   │   ├── TransactionsTab.tsx
│   │   │   └── HistoryTab.tsx
│   │   └── side/
│   │       ├── StatusPanel.tsx
│   │       ├── OverridePanel.tsx
│   │       └── AssignmentPanel.tsx
│   ├── onboarding-le/       ← 10 шагов
│   ├── onboarding-pf/       ← 6 шагов
│   ├── client-portal/
│   ├── ubo-builder/
│   └── admin/
│       ├── users/
│       ├── roles/
│       ├── audit-log/
│       └── scoring-config/
│
└── routes.tsx               ← конфиг React Router
```

## Роутинг

```
/                                    → редирект на /dashboard
/dashboard                           → Дашборд офицера
/clients                             → Реестр клиентов
/clients/:id                         → Карточка клиента (вкладка по умолчанию: anketa)
/clients/:id/anketa
/clients/:id/documents
/clients/:id/ubo
/clients/:id/scoring
/clients/:id/sanctions
/clients/:id/transactions
/clients/:id/history
/onboarding/le/:id?/:step?           → Wizard ЮЛ
/onboarding/pf/:id?/:step?           → Wizard ФЛ
/portal                              → Личный кабинет клиента (отдельный layout без Sidebar)
/admin/users
/admin/roles
/admin/audit
/admin/scoring
*                                    → 404
```

## Конвенции

- Все компоненты — функции, без `React.FC`.
- Пропсы — `type Props = { ... }` рядом с компонентом, экспорт компонента default.
- Файл = один компонент. Подкомпоненты — в отдельных файлах либо как `Component.Sub`.
- Tailwind-классы — в JSX напрямую; для длинных списков `cn(...)` из `lib/cn.ts`.
- Mock-API в `lib/api.ts` всегда возвращает `Promise` с задержкой 300–800мс — как настоящий бэк.
- `aria-label` обязателен на кнопках без текста; роли таблиц через нативные `<table>`.
