"""
Санкционный скрининг.

Архитектура:
- SanctionsList — метаданные списка (OFAC, EU, UN, UK, ГСФР KG)
- SanctionEntry — отдельная запись (физлицо или юрлицо)
- Поиск через fuzzy matching с транслитерацией

Списки хранятся локально в БД. Обновляются по запросу через loader.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON
from sqlalchemy.sql import func
from app.database import Base


class SanctionsList(Base):
    """Метаданные санкционного списка."""
    __tablename__ = "sanctions_lists"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)  # OFAC, EU, UN, UK, GSFR_KG_1 и т.д.
    name = Column(String(255), nullable=False)
    source_url = Column(String(500))
    last_updated = Column(DateTime)
    entry_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class SanctionEntry(Base):
    """Запись в санкционном списке."""
    __tablename__ = "sanction_entries"

    id = Column(Integer, primary_key=True)
    list_code = Column(String(20), nullable=False)      # Код списка
    entity_type = Column(String(20))                    # individual / entity
    reference_number = Column(String(100))              # Внутренний номер записи

    # Основное имя (для поиска)
    primary_name = Column(String(500), nullable=False)
    primary_name_normalized = Column(String(500))       # Нормализованное для поиска

    # Псевдонимы (все варианты написания)
    aliases = Column(JSON)                              # ["Иванов Иван", "Ivanov Ivan", ...]

    date_of_birth = Column(String(50))                  # Дата рождения (строкой — разные форматы)
    nationality = Column(String(100))
    country = Column(String(100))
    passport_numbers = Column(JSON)
    additional_info = Column(Text)

    raw_data = Column(Text)                             # Оригинальный XML/JSON фрагмент
    created_at = Column(DateTime, server_default=func.now())
