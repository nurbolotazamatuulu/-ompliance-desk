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

### 4. Создай первого пользователя (администратора компании)
```bash
docker-compose exec backend python -c "
from app.database import SessionLocal
from app import models
from app.auth import get_password_hash

db = SessionLocal()

# Создаём компанию-тенанта
company = models.Company(
    name='Название вашей компании',
    license_key='ВАШ_ЛИЦЕНЗИОННЫЙ_КЛЮЧ'
)
db.add(company)
db.flush()

# Создаём администратора
user = models.User(
    company_id=company.id,
    email='admin@company.kg',
    full_name='Имя Фамилия',
    hashed_password=get_password_hash('пароль'),
    role=models.UserRole.COMPANY_ADMIN
)
db.add(user)
db.commit()
print('Пользователь создан')
"
```

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

## Роли пользователей

| Роль | Доступ |
|---|---|
| `company_admin` | Полный доступ + управление пользователями |
| `compliance_officer` | Полный рабочий доступ |
| `manager` | Просмотр и отчёты |
| `read_only` | Только просмотр |
