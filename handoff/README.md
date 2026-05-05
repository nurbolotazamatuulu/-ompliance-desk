# ComplianceDesk · Handoff для Claude Code

Регуляторный терминал для VASP-комплаенс Кыргызстана.
Этот пакет — полная спецификация дизайна, готовая к реализации в React + Tailwind.

## Как использовать

1. Открой проект в VSCode с расширением Claude Code.
2. Положи рядом этот пакет (`handoff/`) и попроси агента: «Реализуй ComplianceDesk по `handoff/CLAUDE.md`».
3. Агент сам прочитает `CLAUDE.md` и пойдёт по разделам.

## Что внутри

```
handoff/
├── README.md              ← этот файл
├── CLAUDE.md              ← инструкции для ИИ-агента (читай первым)
├── starter/               ← готовый Vite + React + Tailwind стартер
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles/tokens.css
│       └── styles/index.css
├── spec/
│   ├── architecture.md    ← структура папок, роутинг, паттерны
│   ├── data-model.ts      ← TypeScript-типы доменной модели
│   ├── components.md      ← спецификация UI-компонентов (props, варианты, a11y)
│   ├── states.md          ← empty / loading / error / no-rights / validation
│   ├── responsive.md      ← десктоп / планшет / мобильник
│   ├── i18n.md            ← локализация, форматы KG
│   ├── icons.md           ← маппинг Lucide-иконок на смыслы
│   ├── mock-data.ts       ← 100+ строк реалистичных данных
│   └── screens/
│       ├── 00-dashboard.md           ← Дашборд офицера (главная)
│       ├── 01-clients-list.md        ← Реестр клиентов
│       ├── 02-client-card.md         ← Карточка клиента (7 вкладок)
│       ├── 03-onboarding-le.md       ← Онбординг ЮЛ (10 шагов)
│       ├── 04-onboarding-pf.md       ← Онбординг ФЛ (6 шагов)
│       ├── 05-client-portal.md       ← Личный кабинет клиента
│       ├── 06-admin.md               ← Админка
│       └── 07-ubo-builder.md         ← Конструктор УБО
└── components-ref/        ← .jsx из визуального прототипа — пиксельный референс
    ├── _README.md
    ├── tokens.css
    ├── primitives.jsx
    ├── layout.jsx
    └── ...
```

## Принципы

- **Источник истины — `spec/`**. `components-ref/` — для пиксельной сверки.
- **Стек жёсткий**: React 18 + TypeScript + Vite + Tailwind + React Router + Lucide.
- **Темы две**: dark (по умолчанию) и light. Переключение через `data-theme` на `<html>`.
- **Адаптив**: desktop (≥1280), tablet (768–1279), mobile (<768).
- **Язык**: только русский (i18n-каркас на будущее).
- **Иконки**: только Lucide.

## Приоритет реализации

1. **Этап 1 — фундамент** (1–2 дня):
   стартер, токены, дизайн-система, Sidebar/Header/Layout.
2. **Этап 2 — приоритетный путь CDD** (2–3 дня):
   Дашборд → Реестр клиентов → Карточка клиента (Анкета + Скоринг + Санкции).
3. **Этап 3 — онбординг** (2 дня):
   Онбординг ЮЛ + Онбординг ФЛ + Личный кабинет.
4. **Этап 4 — добивка** (1–2 дня):
   остальные вкладки карточки, УБО-конструктор, Админка.
5. **Этап 5 — состояния и адаптив** (1 день):
   empty/loading/error, tablet/mobile.

## Прототип

Для пиксельной сверки используется `ComplianceDesk Directions.html` в корне проекта — там визуальные референсы карточки клиента, санкций, операций и онбординга в обеих темах.
