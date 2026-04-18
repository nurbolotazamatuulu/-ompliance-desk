"""
Модели базы данных — описывают все таблицы.
Каждый класс = одна таблица в PostgreSQL.
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean,
    ForeignKey, Text, Enum, Float, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


# ─── Справочники (enums) ─────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"       # Ты — управление всеми тенантами
    COMPANY_ADMIN = "company_admin"   # Админ компании-клиента
    COMPLIANCE_OFFICER = "compliance_officer"
    MANAGER = "manager"               # Только просмотр + отчёты
    READ_ONLY = "read_only"


class ClientType(str, enum.Enum):
    INDIVIDUAL = "individual"   # Физическое лицо
    LEGAL = "legal"             # Юридическое лицо


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OnboardingStatus(str, enum.Enum):
    PENDING = "pending"         # Ожидает проверки
    IN_PROGRESS = "in_progress"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"     # Временно приостановлен


class DocumentStatus(str, enum.Enum):
    PRESENT = "present"         # Документ есть
    REQUESTED = "requested"     # Запрошен, ещё не получен
    EXPIRED = "expired"         # Просрочен
    MISSING = "missing"         # Отсутствует


class LicenseStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    SUSPENDED = "suspended"


# ─── Компании (тенанты) ───────────────────────────────────────────────────────

class Company(Base):
    """Каждая компания-покупатель — это тенант."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)

    # Реквизиты
    legal_form      = Column(String(100))           # ОПФ (ОсОО, АО, ИП…)
    inn             = Column(String(20))             # ИНН
    reg_number      = Column(String(100))            # Номер гос. регистрации
    legal_address   = Column(Text)
    actual_address  = Column(Text)
    phone           = Column(String(30))
    email           = Column(String(255))
    website         = Column(String(255))
    activity_types  = Column(Text)                  # Виды деятельности

    # Лицензия ГСФР
    license_number    = Column(String(100))
    license_key       = Column(String(255), unique=True, nullable=False)
    license_status    = Column(Enum(LicenseStatus), default=LicenseStatus.ACTIVE)
    license_expires_at = Column(DateTime)
    license_issued_by  = Column(String(255))         # Орган выдавший лицензию
    license_issued_at  = Column(DateTime)

    # Регистрация в ГСФР
    gsfr_reg_number = Column(String(100))
    gsfr_reg_date   = Column(DateTime)

    # Ответственный сотрудник по ПОД/ФТ
    aml_officer_name     = Column(String(255))
    aml_officer_position = Column(String(255))
    aml_officer_phone    = Column(String(30))
    aml_officer_email    = Column(String(255))

    max_clients = Column(Integer, default=100)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, onupdate=func.now())

    users = relationship("User", back_populates="company")
    clients = relationship("Client", back_populates="company")


# ─── Пользователи ─────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    company = relationship("Company", back_populates="users")
    audit_logs = relationship("AuditLog", back_populates="user")


# ─── Клиенты ──────────────────────────────────────────────────────────────────

class Client(Base):
    """Физлицо или юрлицо на обслуживании."""
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    client_type = Column(Enum(ClientType), nullable=False)

    # Общие поля
    risk_level = Column(Enum(RiskLevel))
    onboarding_status = Column(Enum(OnboardingStatus), default=OnboardingStatus.PENDING)
    risk_score = Column(Float)                # Итоговый балл риск-скоринга
    risk_score_details = Column(JSON)         # Детали по каждому критерию
    last_screening_at = Column(DateTime)      # Последняя санкционная проверка
    sumsub_applicant_id = Column(String(100)) # ID в Sumsub
    sumsub_status = Column(String(50))
    contract_number = Column(String(50))          # Номер договора (= внутренний ID клиента)
    contract_date = Column(DateTime)              # Дата договора
    manager_code = Column(String(4))              # 4-значный код менеджера
    notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))

    # Связи
    company = relationship("Company", back_populates="clients")
    individual = relationship("IndividualClient", back_populates="client", uselist=False)
    legal_entity = relationship("LegalEntityClient", back_populates="client", uselist=False)
    documents = relationship("ClientDocument", back_populates="client")
    ubos = relationship("UBO", back_populates="client")
    pep_records = relationship("PEPRecord", back_populates="client")
    sanctions_checks = relationship("SanctionsCheck", back_populates="client")
    sumsub_records = relationship("SumsubRecord", back_populates="client")
    scoring_history = relationship("RiskScoringHistory", back_populates="client")
    sof_documents   = relationship("SOFDocument", back_populates="client")
    representatives = relationship("ClientRepresentative", back_populates="client")


class IndividualClient(Base):
    """
    Анкета физического лица (Приложение 1 к Положению о НПК, Постановление №606).
    Поля соответствуют типовой форме анкеты клиента - физического лица.
    """
    __tablename__ = "individual_clients"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), unique=True)

    # Глава 1. Идентификационные сведения
    is_resident = Column(Boolean, default=True)          # Резидент / нерезидент
    last_name = Column(String(100), nullable=False)      # Фамилия
    first_name = Column(String(100), nullable=False)     # Имя
    middle_name = Column(String(100))                    # Отчество
    date_of_birth = Column(DateTime)                     # Дата рождения
    place_of_birth = Column(String(255))                 # Место рождения
    nationality = Column(String(100))                    # Национальность
    gender = Column(String(10))                          # Пол
    citizenship = Column(String(100))                    # Гражданство
    marital_status = Column(String(50))                  # Семейное положение

    # Документ, удостоверяющий личность
    doc_type = Column(String(100))                       # Наименование документа
    doc_series_number = Column(String(50))               # Серия и номер
    doc_issued_at = Column(DateTime)                     # Дата выдачи
    doc_expires_at = Column(DateTime)                    # Дата окончания
    doc_issued_by = Column(String(255))                  # Орган, выдавший документ
    doc_division_code = Column(String(20))               # Код подразделения

    pin = Column(String(20))                             # ПИН / ИНН
    registration_address = Column(Text)                  # Адрес регистрации
    actual_address = Column(Text)                        # Адрес фактического проживания

    # Контактные данные
    phone_home = Column(String(30))
    phone_work = Column(String(30))
    phone_mobile = Column(String(30))
    fax = Column(String(30))
    email = Column(String(255))

    # Для иностранных граждан и ЛБГ
    foreign_doc_type = Column(String(100))               # Тип документа на пребывание
    foreign_doc_series_number = Column(String(50))
    foreign_doc_valid_from = Column(DateTime)
    foreign_doc_valid_to = Column(DateTime)

    # Глава 2. Деловой профиль
    business_purpose = Column(Text)                      # Цель и характер деловых отношений
    is_pdl = Column(Boolean, default=False)              # Является ли ПДЛ
    has_ubo = Column(Boolean, default=False)             # Наличие бенефициарного владельца
    authority_documents = Column(Text)                   # Документы о полномочиях распоряжения

    # Для ИП
    is_individual_entrepreneur = Column(Boolean, default=False)
    ie_registration_date = Column(DateTime)
    ie_registration_number = Column(String(100))
    ie_registration_authority = Column(String(255))
    ie_registration_place = Column(String(255))
    ie_patent_type = Column(String(100))
    ie_patent_number = Column(String(50))
    ie_patent_issued_at = Column(DateTime)
    ie_patent_issued_by = Column(String(255))
    ie_patent_expires_at = Column(DateTime)
    ie_activities = Column(Text)

    # Глава 3. Верификация (заполняется офицером)
    verification_status = Column(String(20))             # conducted / not_conducted
    verification_date = Column(DateTime)
    sanctions_check_result = Column(String(20))          # clear / match
    sanctions_check_date = Column(DateTime)
    criminal_list_check_result = Column(String(20))      # clear / match
    criminal_list_check_date = Column(DateTime)
    risk_justification = Column(Text)                    # Обоснование уровня риска
    next_update_date = Column(DateTime)                  # Дата очередного обновления
    db_entry_date = Column(DateTime)                     # Дата занесения в БД
    db_entry_officer = Column(String(255))               # ФИО ответственного сотрудника

    client = relationship("Client", back_populates="individual")


class LegalEntityClient(Base):
    """
    Анкета юридического лица (Приложение 2 к Положению о НПК, Постановление №606).
    """
    __tablename__ = "legal_entity_clients"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), unique=True)

    # Глава 1. Идентификационные сведения
    is_resident = Column(Boolean, default=True)
    full_name = Column(String(255), nullable=False)      # Полное наименование
    short_name = Column(String(255))                     # Сокращённое наименование
    name_foreign = Column(String(255))                   # Наименование на иностранном языке
    legal_form = Column(String(100))                     # Организационно-правовая форма
    inn_resident = Column(String(20))                    # ИНН для резидента
    inn_nonresident = Column(String(50))                 # ИНН/КИО для нерезидента

    # Государственная регистрация
    reg_date = Column(DateTime)
    reg_number = Column(String(100))
    reg_authority = Column(String(255))
    legal_address = Column(Text)                         # Юридический адрес (место регистрации)

    social_fund_reg_number = Column(String(50))          # Регномер Соцфонда
    okpo_code = Column(String(20))                       # Код ОКПО
    activity_type = Column(String(255))                  # Вид деятельности
    ownership_form = Column(String(100))                 # Форма собственности
    bank_id_code = Column(String(20))                    # БИК (для комбанков)

    # Контактные данные
    phone_work = Column(String(30))
    phone_mobile = Column(String(30))
    fax = Column(String(30))
    email = Column(String(255))
    actual_address = Column(Text)                        # Фактический адрес если отличается

    # Глава 2. Уставные документы
    management_structure = Column(JSON)                  # Органы управления (JSON)
    authority_documents = Column(Text)                   # Документы о полномочиях
    authorized_capital = Column(Text)                    # Уставной капитал
    has_local_presence = Column(Boolean)                 # Присутствие по местонахождению
    branches_info = Column(Text)                         # Филиалы и представительства
    has_ubo = Column(Boolean, default=True)
    ubo_is_resident = Column(Boolean)
    has_pdl_in_structure = Column(Boolean, default=False)

    # Глава 3. Деловой профиль
    license_type = Column(String(100))
    license_number = Column(String(50))
    license_issued_at = Column(DateTime)
    license_issued_by = Column(String(255))
    license_expires_at = Column(DateTime)
    license_activities = Column(Text)
    main_activities = Column(Text)                       # Основные виды деятельности
    business_purpose = Column(Text)                      # Цель и характер деловых отношений

    # Глава 4. Верификация
    verification_status = Column(String(20))
    verification_date = Column(DateTime)
    sanctions_check_result = Column(String(20))
    sanctions_check_date = Column(DateTime)
    risk_justification = Column(Text)
    next_update_date = Column(DateTime)
    db_entry_date = Column(DateTime)
    db_entry_officer = Column(String(255))

    client = relationship("Client", back_populates="legal_entity")


class ClientRepresentative(Base):
    """
    Представитель клиента — лицо, действующее по доверенности
    или доверительному управлению. Идентифицируется отдельно согласно п.17 НПК.
    """
    __tablename__ = "client_representatives"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    # Тип полномочий
    authority_type = Column(String(50))  # power_of_attorney / trust_management / other

    # Идентификационные сведения представителя
    last_name = Column(String(100), nullable=False)
    first_name = Column(String(100), nullable=False)
    middle_name = Column(String(100))
    date_of_birth = Column(DateTime)
    citizenship = Column(String(100))
    pin = Column(String(20))

    # Документ, удостоверяющий личность
    doc_type = Column(String(100))
    doc_series_number = Column(String(50))
    doc_issued_at = Column(DateTime)
    doc_expires_at = Column(DateTime)
    doc_issued_by = Column(String(255))

    # Реквизиты доверенности / договора доверительного управления
    authority_doc_number = Column(String(50))     # Номер доверенности
    authority_doc_date = Column(DateTime)          # Дата выдачи
    authority_doc_expires_at = Column(DateTime)    # Срок действия
    authority_doc_notary = Column(String(255))     # Нотариус (если нотариально удостоверена)
    authority_scope = Column(Text)                 # Объём полномочий

    # Контакты
    phone = Column(String(30))
    email = Column(String(255))

    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))

    client = relationship("Client", back_populates="representatives")


# ─── УБО (бенефициарные владельцы) ───────────────────────────────────────────

class UBO(Base):
    """Бенефициарный владелец юридического лица."""
    __tablename__ = "ubos"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)  # Юрлицо
    last_name = Column(String(100), nullable=False)
    first_name = Column(String(100), nullable=False)
    middle_name = Column(String(100))
    date_of_birth = Column(DateTime)
    nationality = Column(String(100))
    passport_number = Column(String(50))
    ownership_percentage = Column(Float)       # Доля владения %
    ownership_chain = Column(Text)             # Описание цепочки владения
    is_ultimate = Column(Boolean, default=True)  # Конечный УБО?
    verified_at = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    client = relationship("Client", back_populates="ubos")


# ─── ИПДС / ПДЛ ───────────────────────────────────────────────────────────────

class PEPRecord(Base):
    """Запись об ИПДС (иностранное публичное должностное лицо) или ПДЛ."""
    __tablename__ = "pep_records"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    pep_type = Column(String(50))          # PEP, IPEP, FAMILY, ASSOCIATE
    position = Column(String(255))         # Должность
    organization = Column(String(255))     # Организация
    country = Column(String(100))
    source = Column(String(255))           # Источник информации
    identified_at = Column(DateTime)
    verified_by = Column(Integer, ForeignKey("users.id"))
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    client = relationship("Client", back_populates="pep_records")


# ─── Документы клиента ────────────────────────────────────────────────────────

class ClientDocument(Base):
    __tablename__ = "client_documents"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    document_type = Column(String(100), nullable=False)  # Паспорт, устав, выписка и т.д.
    status = Column(Enum(DocumentStatus), default=DocumentStatus.MISSING)
    file_path = Column(String(500))           # Путь к файлу
    issued_at = Column(DateTime)
    expires_at = Column(DateTime)             # Срок действия
    requested_at = Column(DateTime)           # Когда запросили
    received_at = Column(DateTime)            # Когда получили
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    client = relationship("Client", back_populates="documents")


# ─── Санкционные проверки ─────────────────────────────────────────────────────

class SanctionsCheck(Base):
    __tablename__ = "sanctions_checks"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    checked_name = Column(String(255), nullable=False)  # Имя которое проверяли
    checked_dob = Column(DateTime)
    lists_checked = Column(JSON)              # ["OFAC", "EU", "UN", "UK", "GSFR_KG"]
    result = Column(String(20))               # clear / match / possible_match
    matches = Column(JSON)                    # Детали совпадений
    checked_by = Column(Integer, ForeignKey("users.id"))
    checked_at = Column(DateTime, server_default=func.now())
    notes = Column(Text)

    client = relationship("Client", back_populates="sanctions_checks")


# ─── Sumsub записи ────────────────────────────────────────────────────────────

class SumsubRecord(Base):
    __tablename__ = "sumsub_records"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    applicant_id = Column(String(100))         # ID в Sumsub
    verification_status = Column(String(50))   # approved / rejected / pending
    verification_level = Column(String(100))   # Уровень верификации
    rejection_reason = Column(Text)
    raw_data = Column(JSON)                    # Полный ответ от Sumsub
    verified_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    added_by = Column(Integer, ForeignKey("users.id"))

    client = relationship("Client", back_populates="sumsub_records")


# ─── История риск-скоринга ───────────────────────────────────────────────────

class RiskScoringHistory(Base):
    """
    История оценок риск-скоринга по клиенту.
    Физлицо: блоки B + C, итог = (B+C)/2
    Юрлицо: блоки A+B+C+D, итог = R = 0.25*(A+B+C+D)
    Каждая оценка сохраняется отдельной строкой — история не перезаписывается.
    """
    __tablename__ = "risk_scoring_history"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    # Блоки (None если не применяется к данному типу клиента)
    block_a = Column(Float)       # Профиль участника (только юрлица)
    block_b = Column(Float)       # Активы и операции
    block_c = Column(Float)       # Транзакционный риск
    block_d = Column(Float)       # Комплаенс и контроль (только юрлица)

    score_details = Column(JSON)  # Детали по каждому критерию {A1: 10, A2: 5, ...}
    final_score = Column(Float)   # Итоговый R
    risk_level = Column(Enum(RiskLevel), nullable=False)

    # Override по критическим индикаторам
    override_applied = Column(Boolean, default=False)
    override_reasons = Column(JSON)  # ["B3.4: прямая связь с миксером ≤1 hop", ...]

    # Ручная корректировка офицером (с обоснованием)
    manual_override = Column(Boolean, default=False)
    manual_override_justification = Column(Text)

    assessed_by = Column(Integer, ForeignKey("users.id"))
    assessed_at = Column(DateTime, server_default=func.now())
    next_review_date = Column(DateTime)  # Рассчитывается автоматически по зоне

    client = relationship("Client", back_populates="scoring_history")


# ─── ИПДС — Источник происхождения денежных средств ─────────────────────────

class SOFDocumentStatus(str, enum.Enum):
    SUBMITTED  = "submitted"   # Предоставлен клиентом, ожидает проверки
    VERIFIED   = "verified"    # Верифицирован офицером
    REJECTED   = "rejected"    # Отклонён — недостаточно / недостоверно


class SOFDocument(Base):
    """
    Документ-подтверждение источника происхождения средств (ИПДС/SoF/SoW).
    Каждый документ покрывает определённую сумму и период.
    Покрытие = Σ verified amount / declared transaction volume.
    """
    __tablename__ = "sof_documents"

    id             = Column(Integer, primary_key=True)
    client_id      = Column(Integer, ForeignKey("clients.id"), nullable=False)
    company_id     = Column(Integer, ForeignKey("companies.id"), nullable=False)

    doc_type       = Column(String(60), nullable=False)
    # bank_statement | salary_certificate | tax_return | business_contract |
    # property_deed | dividend_certificate | inheritance | loan_agreement |
    # gift_declaration | crypto_proof | other

    description    = Column(Text)              # Краткое описание источника
    document_number = Column(String(100))      # Номер / реквизиты документа
    document_date  = Column(DateTime)          # Дата документа

    amount         = Column(Float, nullable=False)   # Сумма покрытия
    currency       = Column(String(10), default="KGS")

    period_from    = Column(DateTime)          # Период покрытия: начало
    period_to      = Column(DateTime)          # Период покрытия: конец

    status         = Column(Enum(SOFDocumentStatus), default=SOFDocumentStatus.SUBMITTED)
    verified_by    = Column(Integer, ForeignKey("users.id"))
    verified_at    = Column(DateTime)

    notes          = Column(Text)
    created_at     = Column(DateTime, server_default=func.now())
    updated_at     = Column(DateTime, onupdate=func.now())

    client         = relationship("Client", back_populates="sof_documents")


# ─── Подозрительные операции ──────────────────────────────────────────────────

class TransactionStatus(str, enum.Enum):
    NEW        = "new"        # Выявлена, ещё не рассмотрена
    REVIEWING  = "reviewing"  # На рассмотрении у офицера
    REPORTED   = "reported"   # Направлено сообщение в ГСФР
    DISMISSED  = "dismissed"  # Рассмотрена, признана несущественной


class Transaction(Base):
    """
    Операция клиента.
    При создании автоматически проставляются:
      - is_mandatory_control (≥600 000 KGS по Закону КР о ПОД/ФТ)
      - auto_indicators — предварительные коды 40xxx на основе правил
    Офицер дополнительно может вручную добавить/убрать индикаторы.
    """
    __tablename__ = "transactions"

    id               = Column(Integer, primary_key=True)
    client_id        = Column(Integer, ForeignKey("clients.id"), nullable=True)
    company_id       = Column(Integer, ForeignKey("companies.id"), nullable=False)

    # Параметры операции
    amount           = Column(Float, nullable=False)
    currency         = Column(String(10), default="KGS")
    amount_kgs       = Column(Float)              # Приведённая сумма в KGS (для порога)
    operation_date   = Column(DateTime, nullable=False)
    type_code        = Column(String(10))         # 10000–38099 — код вида операции
    type_label       = Column(String(255))
    description      = Column(Text)

    # Контрагент
    counterparty_name    = Column(String(255))
    counterparty_account = Column(String(100))
    counterparty_bank    = Column(String(255))
    counterparty_country = Column(String(100))

    # Автодетектирование
    is_mandatory_control = Column(Boolean, default=False)   # Порог ≥600 000 KGS
    auto_indicators      = Column(JSON, default=list)       # Автоматические коды 40xxx
    manual_indicators    = Column(JSON, default=list)       # Добавленные офицером
    risk_score           = Column(Float)                    # 0–100

    # Статус и рассмотрение
    status           = Column(Enum(TransactionStatus), default=TransactionStatus.NEW)
    reviewed_by      = Column(Integer, ForeignKey("users.id"))
    reviewed_at      = Column(DateTime)
    notes            = Column(Text)

    created_at       = Column(DateTime, server_default=func.now())
    created_by       = Column(Integer, ForeignKey("users.id"))

    client           = relationship("Client", foreign_keys=[client_id])


# ─── Нормативная база ────────────────────────────────────────────────────────

class RegDocCategory(str, enum.Enum):
    LAW         = "law"          # Закон
    DECREE      = "decree"       # Постановление Правительства
    ORDER       = "order"        # Приказ / Распоряжение
    INSTRUCTION = "instruction"  # Инструкция / Положение
    GUIDELINE   = "guideline"    # Руководство / Рекомендации FATF
    INTERNAL    = "internal"     # Внутренний документ компании


class RegDocStatus(str, enum.Enum):
    ACTIVE     = "active"
    DRAFT      = "draft"
    SUPERSEDED = "superseded"   # Утратил силу / заменён
    ARCHIVED   = "archived"


class RegulatoryDocument(Base):
    __tablename__ = "regulatory_documents"

    id           = Column(Integer, primary_key=True)
    company_id   = Column(Integer, ForeignKey("companies.id"), nullable=True)
    is_global    = Column(Boolean, default=False)   # виден всем тенантам

    category     = Column(Enum(RegDocCategory), nullable=False)
    title        = Column(String(500), nullable=False)
    short_title  = Column(String(150))
    number       = Column(String(100))              # Номер документа
    issued_by    = Column(String(255))              # Орган, издавший документ
    issued_at    = Column(DateTime)                 # Дата издания
    effective_from = Column(DateTime)               # Вступил в силу
    effective_to   = Column(DateTime)               # Утратил силу (null = действует)

    status       = Column(Enum(RegDocStatus), default=RegDocStatus.ACTIVE)
    description  = Column(Text)                     # Краткое содержание
    external_url = Column(String(500))              # Ссылка на официальный источник
    notes        = Column(Text)                     # Аннотации офицера
    tags         = Column(JSON, default=list)

    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, onupdate=func.now())
    created_by   = Column(Integer, ForeignKey("users.id"), nullable=True)


# ─── Журнал аудита ────────────────────────────────────────────────────────────

class AuditLog(Base):
    """Каждое действие пользователя записывается сюда. Для регулятора."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String(100), nullable=False)  # client.created, check.sanctions и т.д.
    entity_type = Column(String(50))              # client, ubo, document...
    entity_id = Column(Integer)
    old_value = Column(JSON)
    new_value = Column(JSON)
    ip_address = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="audit_logs")