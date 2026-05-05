# Иконки

Только `lucide-react`. Размер по умолчанию 16px, на больших кнопках 18px, на мини-чипах 12px. Цвет — наследовать `currentColor` от родителя.

## Маппинг смыслов → Lucide

### Навигация

| Смысл | Lucide |
|---|---|
| Дашборд | `LayoutDashboard` |
| Клиенты | `Users` |
| Санкции | `ShieldAlert` |
| Транзакции / Операции | `ArrowLeftRight` |
| ИПДС | `UserSearch` |
| УБО | `Network` |
| Документы | `FileText` |
| Отчёты | `BarChart3` |
| Регуляторика | `Scale` |
| Админка | `Settings` |
| Аудит-лог | `History` |

### Статусы

| Смысл | Lucide |
|---|---|
| Одобрено / verified | `CircleCheck` |
| На проверке | `Clock` |
| Отказ / blocked | `CircleX` |
| Предупреждение | `TriangleAlert` |
| Критический риск | `OctagonAlert` |
| Нет прав | `Lock` |
| Скрыто | `EyeOff` |

### Действия

| Смысл | Lucide |
|---|---|
| Поиск | `Search` |
| Фильтр | `Filter` |
| Сортировка | `ArrowUpDown` |
| Сбросить | `RotateCcw` |
| Экспорт | `Download` |
| Импорт / загрузить | `Upload` |
| Создать | `Plus` |
| Редактировать | `Pencil` |
| Удалить | `Trash2` |
| Скопировать | `Copy` |
| Открыть в новом | `ExternalLink` |
| Закрыть | `X` |
| Меню | `Menu` |
| Ещё (kebab) | `MoreHorizontal` |
| Ещё (vertical) | `MoreVertical` |
| Назад / Вперёд | `ChevronLeft` / `ChevronRight` |
| Развернуть / Свернуть | `ChevronDown` / `ChevronUp` |
| Сохранить | `Save` |
| Подтвердить | `Check` |

### Compliance / KYT

| Смысл | Lucide |
|---|---|
| Кошелёк / адрес | `Wallet` |
| Хеш транзакции | `Hash` |
| Сеть блокчейна | `Link2` |
| Микшер | `Shuffle` |
| Darknet | `EyeOff` + tone red |
| Высокорисковая юрисдикция | `Globe` + tone orange |
| Структурирование | `LayoutGrid` |
| Velocity | `Gauge` |
| PEP | `Crown` |
| Граф связей | `Workflow` |

### Темы

| Смысл | Lucide |
|---|---|
| Тёмная тема | `Moon` |
| Светлая тема | `Sun` |
| Системная | `Monitor` |

### Уведомления / Колокол

| Смысл | Lucide |
|---|---|
| Уведомления | `Bell` |
| Новое | `BellDot` |
| Заглушено | `BellOff` |

## Запрещено

- Не миксовать с другими сетами (Heroicons, Phosphor, Tabler).
- Не рисовать свои SVG-иконки в продуктовых UI без явного согласования.
- Не использовать эмодзи в роли иконок.

## Импорт

```ts
import { LayoutDashboard, Users, ShieldAlert } from 'lucide-react';
```

Tree-shake'ит автоматически. Не делай barrel re-export всего сета.
