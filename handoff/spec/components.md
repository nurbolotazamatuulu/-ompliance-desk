# Спецификация компонентов

Все компоненты — TypeScript функциональные с типизированными пропсами. Цвета через токены (`bg-surface`, `text-text-dim` и т.д.).

## Соглашения

- `size`: `'sm' | 'md' | 'lg'` (дефолт `'md'`)
- `tone` для сигналов: `'neutral' | 'green' | 'yellow' | 'orange' | 'red' | 'blue'`
- `variant` для кнопок: `'primary' | 'secondary' | 'ghost' | 'danger'`
- Все компоненты — controlled, без внутреннего state кроме hover/focus/anim.

## Inline → Tailwind таблица

В `components-ref/` стили inline. Маппинг:

| Inline | Tailwind |
|---|---|
| `background: T.surface` | `bg-surface` |
| `background: T.elev` | `bg-elev` |
| `border: 1px solid T.border` | `border border-border` |
| `color: T.text` / `T.textDim` / `T.textMute` | `text-text` / `text-text-dim` / `text-text-mute` |
| `fontFamily: STRICT_MONO` | `font-mono` |
| `letterSpacing: 0.08em; textTransform: uppercase; fontSize: 10px` | `cd-caps` (см. tokens.css) |
| `borderRadius: 3` | `rounded-sm` |
| `borderRadius: 4` | `rounded` |
| `padding: 14px 16px` | `px-4 py-3.5` |
| `gap: 12` | `gap-3` |

## Primitives

### Badge

```ts
type BadgeProps = {
  tone?: 'neutral'|'green'|'yellow'|'orange'|'red'|'blue';
  dot?: boolean;
  children: ReactNode;
};
```

**Визуал:** uppercase, mono, 10.5px, рамка `currentColor` 33% opacity, фон `*-soft`. Высота 18px, padding `2px 7px`. Точка слева — квадрат 5×5px (а не круг — намеренно, регуляторный стиль).

**A11y:** `role="status"` если содержит уровень риска или статус.

### Button

```ts
type ButtonProps = {
  variant?: 'primary'|'secondary'|'ghost'|'danger';
  size?: 'sm'|'md'|'lg';
  icon?: LucideIcon;
  iconPosition?: 'left'|'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button'|'submit'|'reset';
  onClick?: () => void;
  children?: ReactNode;
  'aria-label'?: string;
};
```

**Стиль:** uppercase, fontWeight 600, letter-spacing 0.05em (primary/secondary), 0.04em (ghost). Высота: sm 26, md 30, lg 36. `border-radius: 3px`. Без теней. Hover — на 4% светлее (через `oklch` calc или filter).

**Loading:** показать `<Spinner size="xs" />` слева, скрыть icon, disabled.

### Input / Select / Textarea

```ts
type InputProps = {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  prefix?: string;            // mono-префикс типа "ИНН:"
  suffix?: string;            // "KGS"
  size?: 'sm'|'md';
  monospace?: boolean;        // для ИНН, паспортов, хешей
  ...HTMLInputAttributes
};
```

**Layout:** label сверху (cd-caps, mono, 10px), input высота 32 (md) / 28 (sm), фон `bg-bg`, рамка `border-border`, `:focus` — `border-accent` + `ring-1 ring-focus`. Hint снизу 11px text-mute. Error снизу 11px text-red + рамка `border-red/60`.

**Special inputs (компоненты-обёртки):**
- `INNInput` — маска `############` для 14-знач. ИНН KG.
- `PassportKGInput` — маска `AN0000000`.
- `OkpoInput` — 8 цифр.
- `WalletAddressInput` — mono, валидация по сети (eth/tron/btc).

### Tabs

```ts
type TabsProps = {
  tabs: { id: string; label: string; badge?: ReactNode; alert?: boolean }[];
  active: string;
  onChange: (id: string) => void;
  size?: 'sm'|'md';
};
```

**Визуал:** строка кнопок без фона, разделитель снизу `border-border`, активный — `border-b-2 border-accent` и текст `text-text` (semibold). Неактивные `text-text-dim`. `alert: true` — красная точка справа от лейбла.

### DataTable

```ts
type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  rowTone?: (row: T) => 'red'|'orange'|undefined;  // тонкая подсветка фона
  sticky?: boolean;
  density?: 'compact'|'normal';
  pagination?: PaginationState;
};
type Column<T> = {
  id: string;
  header: string;
  align?: 'left'|'right'|'center';
  width?: number | string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};
```

**Поведение:**
- Высота строки: compact 28, normal 32.
- Хедер: cd-caps, mono, 10px, sticky.
- Hover — `bg-row-hover`.
- Клик по строке → `onRowClick`. Чекбокс не триггерит row click.
- Виртуализация при rows > 200 (через `@tanstack/react-virtual`).
- A11y: `<table role="table">`, `<th scope="col">`, `aria-sort` на сортируемых.

### Dialog / Drawer

`Dialog` — модалка по центру, max-w 480/640/800. `Drawer` — справа, ширины 400/520/720. Оба:
- Backdrop `rgba(0,0,0,0.6)` (dark) / `rgba(20,20,30,0.4)` (light), animation fadeIn 200ms.
- Контент сдвигается из-за края (drawer) или scale 0.97→1 (dialog).
- Esc и backdrop click закрывают; focus trap; восстановление фокуса.
- Шапка с `<X>` справа (Lucide), заголовок слева, опциональный subtitle ниже.

### Toast

Стек справа-снизу, ширина 320, авто-dismiss 5s (10s для error). Tone: `info|success|warning|error`. Левая полоса в цвет tone, иконка, заголовок + описание + close.

### Spinner / Skeleton

`Spinner` — 12/16/20px, два круга с opacity-маской и rotate 1s linear. `Skeleton` — `bg-elev` + анимированный градиент, варианты `text|circle|rect|table-row`.

## Layout

### Sidebar

180px ширина (свернутый — 56px). Лого блок 52px высоты сверху (mono, accent-text). Список секций: Дашборд, Клиенты, Санкции, Транзакции, ИПДС, УБО, Документы, Отчёты, Регуляторика, Админка. Активный пункт — фон `accent-bg-hi`, левая граница 2px `accent`. Внизу — версия, лицензия, статус онлайн.

**Responsive:** на tablet — авто-свернутый, на mobile — выезжает по `<Menu>` кнопке как drawer.

### Header (страничный)

Высота 52px, sticky. Слева: breadcrumb (cd-caps mono) + заголовок 15px semibold + subtitle mono. Справа: ThemeToggle, уведомления, аватар.

### PageHeader (внутрипанельный)

То же, но без брендинга — для подразделов.

### Toolbar

Высота 44, под Header. Поиск (Input с иконкой Search), фильтры (Select × N), счётчик результатов справа, кнопки экспорта/действий.

### EmptyState

Иконка 32px (text-ghost), заголовок 15px, описание 13px text-mute, опц. CTA-кнопка. По центру контейнера, max-w 360.

## Compliance-специфичные

### RiskScoreCard

Шапка карточки клиента. Layout grid `160px repeat(4, 1fr) auto`:
- Слева: «ИТОГОВЫЙ РИСК» + число 28px mono в цвет уровня + бейдж.
- 4 колонки категорий A/B/C/D: лейбл cd-caps, число 18px mono, тонкий progress 2px высотой.
- Справа: кнопка «Пересчитать» + «обновлён DD.MM.YYYY» mono.

**Props:** `score: RiskScore; onRecalculate: () => void; canRecalculate: boolean`.

### OverrideTriggerCard

Карточка-предупреждение. Рамка `border-red/35`. Заголовок cd-caps red + точка. Тело — текст триггера. Низ — «Авто-поднятие до CRITICAL» mono mute.

### KYTFlag

Inline-бейдж `<Badge tone="..." dot />` с маппингом из `KYTFlag.code` на лейбл.

### SanctionMatchCard

Большая карточка-результат. Шапка: список (KG_GSFR/OFAC/...) + бейдж similarity. Тело — поля совпадения mono. Подвал — кнопки «Истинное совпадение» (danger) / «Ложное» (secondary) или статус, если уже разобрано.

### ClientStatusBadge

Маппинг `ClientStatus → tone + label`:
- `draft` → neutral «ЧЕРНОВИК»
- `submitted` → blue «ПОДАН»
- `in_review` → yellow «НА ПРОВЕРКЕ»
- `awaiting_docs` → orange «ОЖИДАЕТ ДОКУМЕНТОВ»
- `approved` → green «ОДОБРЕН»
- `rejected` → red «ОТКАЗ»
- `suspended` → orange «ПРИОСТАНОВЛЕН»
- `closed` → neutral «ЗАКРЫТ»

## Wizard

### WizardShell

Двухколоночный layout: слева 240px со списком шагов (`WizardSteps`), справа — контент текущего шага + `WizardFooter`.

Шаги: круг 22×22 с номером, заголовок, статус (галка/точка/замок), вертикальная линия между. Текущий — `border-accent`, пройденный — `green`, заблокированный — `text-ghost`.

Footer: «Назад» (ghost) — слева, «Сохранить черновик» (ghost) — центр, «Продолжить» (primary) — справа. На последнем шаге — «Подать на проверку».
