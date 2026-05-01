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
    archived_at = Column(DateTime, nullable=True)
    archived_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    archive_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))

    # Связи
    company = relationship("Company", back_populates="clients")
    individual = relationship("IndividualClient", back_populates="client", uselist=False)
    legal_entity = relationship("LegalEntityClient", back_populates="client", uselist=False)
    directors = relationship("DirectorClient", foreign_keys="[DirectorClient.client_id]",
                             primaryjoin="Client.id == DirectorClient.client_id")
    documents = relationship("ClientDocument", back_populates="client")
    ubos = relationship("UBO", back_populates="client")
    pep_records = relationship("PEPRecord", back_populates="client")
    pep_questionnaire = relationship("PEPQuestionnaire", back_populates="client", uselist=False)
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
    ie_inn = Column(String(50))
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

    # Информация о банковском счёте
    bank1_account = Column(String(100))
    bank1_name = Column(String(255))
    bank1_location = Column(String(255))
    bank1_inn = Column(String(50))
    bank1_corr_account = Column(String(100))
    bank1_bic_swift = Column(String(50))

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
    lei = Column(String(50))                             # Legal Entity Identifier (поле 17)

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

    # Глава 2. Уставные документы (поля 21–29 Анкеты ЮЛ)
    management_structure = Column(JSON)                  # Органы управления (JSON)
    governing_body_name = Column(String(255))            # Наименование органа (поле 21)
    governing_body_members = Column(Text)                # ФИО членов органа (поле 22)
    authorized_signatories = Column(Text)                # Должностные лица с правом подписи (поле 23)
    authority_doc_details = Column(Text)                 # Документы о полномочиях (поле 24)
    authority_documents = Column(Text)                   # Устаревшее текстовое поле (сохраняется)
    authorized_capital = Column(Text)                    # Уставной капитал (поле 25)
    has_local_presence = Column(Boolean)                 # Присутствие по местонахождению
    branches_info = Column(Text)                         # Филиалы и представительства
    has_ubo = Column(Boolean, default=True)
    ubo_is_resident = Column(Boolean)
    has_pdl_in_structure = Column(Boolean, default=False)

    # Банковские счета (поля 38–47 Анкеты ЮЛ)
    bank1_account = Column(String(100))
    bank1_name = Column(String(255))
    bank1_location = Column(String(255))
    bank1_inn = Column(String(50))
    bank1_corr_account = Column(String(100))
    bank1_bic_swift = Column(String(50))
    bank2_account = Column(String(100))
    bank2_name = Column(String(255))
    bank2_location = Column(String(255))
    bank2_inn = Column(String(50))
    bank2_corr_account = Column(String(100))
    bank2_bic_swift = Column(String(50))

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
    directors = relationship("DirectorClient", back_populates="legal_entity",
                             foreign_keys="[DirectorClient.client_id]",
                             primaryjoin="LegalEntityClient.client_id == DirectorClient.client_id")


class DirectorClient(Base):
    """
    Анкета ФЛ директора юридического лица (поля 1–33 Анкеты клиента-ФЛ).
    Привязана к юридическому лицу, а не к отдельному клиенту.
    """
    __tablename__ = "director_clients"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    position = Column(String(255))           # Должность (Директор / Ген. директор / и т.д.)
    is_active = Column(Boolean, default=True)
    is_resident = Column(Boolean, default=True)
    last_name = Column(String(100))
    first_name = Column(String(100))
    middle_name = Column(String(100))
    date_of_birth = Column(DateTime)
    place_of_birth = Column(String(255))
    nationality = Column(String(100))
    gender = Column(String(10))
    citizenship = Column(String(100))
    marital_status = Column(String(50))
    pin = Column(String(20))

    doc_type = Column(String(100))
    doc_series_number = Column(String(50))
    doc_issued_at = Column(DateTime)
    doc_expires_at = Column(DateTime)
    doc_issued_by = Column(String(255))
    doc_division_code = Column(String(20))

    registration_address = Column(Text)
    actual_address = Column(Text)
    phone_mobile = Column(String(30))
    phone_work = Column(String(30))
    email = Column(String(255))

    foreign_doc_type = Column(String(50))
    foreign_doc_series_number = Column(String(50))
    foreign_doc_valid_from = Column(DateTime)
    foreign_doc_valid_to = Column(DateTime)

    business_purpose = Column(Text)
    is_pep = Column(Boolean, default=False)
    authority_documents = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    legal_entity = relationship("LegalEntityClient", back_populates="directors",
                                foreign_keys="[DirectorClient.client_id]",
                                primaryjoin="DirectorClient.client_id == LegalEntityClient.client_id")


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

    # Тип доверителя: ФЛ или ЮЛ
    is_legal_entity = Column(Boolean, default=False)

    # Для ФЛ-доверителя
    last_name = Column(String(100))
    first_name = Column(String(100))
    middle_name = Column(String(100))
    date_of_birth = Column(DateTime)
    citizenship = Column(String(100))
    pin = Column(String(20))
    doc_type = Column(String(100))
    doc_series_number = Column(String(50))
    doc_issued_at = Column(DateTime)
    doc_expires_at = Column(DateTime)
    doc_issued_by = Column(String(255))

    # Для ЮЛ-доверителя
    company_name = Column(String(255))
    company_inn = Column(String(50))
    company_legal_form = Column(String(100))
    company_reg_number = Column(String(100))
    company_legal_address = Column(Text)
    company_actual_address = Column(Text)

    # Реквизиты документа о полномочиях (доверенность / договор)
    authority_doc_number = Column(String(50))
    authority_doc_date = Column(DateTime)
    authority_doc_expires_at = Column(DateTime)
    authority_doc_notary = Column(String(255))
    authority_scope = Column(Text)

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
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)

    # ФИО
    last_name = Column(String(100), nullable=False)
    first_name = Column(String(100), nullable=False)
    middle_name = Column(String(100))

    # Персональные данные
    date_of_birth = Column(DateTime)
    place_of_birth = Column(String(255))
    nationality = Column(String(100))           # Гражданство
    country_of_residence = Column(String(100))  # Страна проживания
    pin = Column(String(20))                    # ИНН / ПИН

    # Документ
    doc_type = Column(String(100))
    doc_series_number = Column(String(50))
    doc_issued_by = Column(String(255))
    doc_issued_at = Column(DateTime)
    doc_expires_at = Column(DateTime)

    # Адреса и контакты
    registration_address = Column(Text)
    actual_address = Column(Text)
    phone = Column(String(30))
    email = Column(String(255))

    # Владение
    ownership_percentage = Column(Float)
    control_type = Column(String(50))           # direct / indirect
    recognition_basis = Column(Text)            # Доп. примечания к основанию
    recognition_criteria = Column(JSON, default=list)  # [{code, selected, details}]
    ownership_chain = Column(Text)
    is_ultimate = Column(Boolean, default=True)

    # Комплаенс
    is_pep = Column(Boolean, default=False)
    source_of_funds = Column(Text)              # Источник происхождения средств (общий)
    relationship_purpose = Column(Text)         # Цель деловых отношений

    # Поля анкеты ПДЛ (заполняются если is_pep=True)
    pdl_position = Column(String(255))          # Занимаемая должность
    pdl_appointment_date = Column(DateTime)     # Дата назначения
    pdl_release_date = Column(DateTime)         # Дата освобождения
    pdl_source_of_funds = Column(Text)          # ИПДС ПДЛ
    pdl_approval_notes = Column(Text)           # Письменное разрешение на обслуживание
    pdl_family_members = Column(JSON, default=list)   # Члены семьи ПДЛ
    pdl_close_associates = Column(JSON, default=list) # Близкие лица ПДЛ

    # Тип влияния (для БВ физического лица)
    influence_type = Column(String(100))  # родитель / усыновитель / опекун / попечитель / другое

    # Статус резидентства
    residency_status = Column(String(50))  # резидент / нерезидент

    # Архивация (каскадно при архивации клиента)
    is_archived = Column(Boolean, default=False, nullable=False)

    verified_at = Column(DateTime)
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    client = relationship("Client", back_populates="ubos")


# ─── ИПДС / ПДЛ ───────────────────────────────────────────────────────────────

class PEPRecord(Base):
    """Запись о ПДЛ (публичное должностное лицо КР) или ИПДЛ (иностранное ПДЛ)."""
    __tablename__ = "pep_records"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    ubo_id = Column(Integer, ForeignKey("ubos.id", ondelete="CASCADE"), nullable=True)
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


class PEPQuestionnaire(Base):
    """Анкета ПДЛ (типовая форма по Постановлению КР №606)."""
    __tablename__ = "pep_questionnaires"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, unique=True)
    is_primary = Column(Boolean, default=True)   # True=первичная, False=обновлённая

    # Глава 2. Деловой профиль ПДЛ
    position = Column(String(255))               # Занимаемая должность
    appointment_date = Column(DateTime)          # Дата назначения
    release_date = Column(DateTime)              # Дата освобождения
    source_of_funds = Column(Text)              # Источник происхождения средств
    approval_notes = Column(Text)               # Письменное разрешение на обслуживание

    # Глава 3. Члены семьи (JSON-массив)
    # [{relation, last_name, first_name, middle_name, gender, date_of_birth, pin, citizenship}]
    family_members = Column(JSON, default=list)

    # Глава 4. Близкие лица (JSON-массив)
    # [{relation_type, last_name, first_name, middle_name, gender, date_of_birth, pin, citizenship}]
    close_associates = Column(JSON, default=list)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    client = relationship("Client", back_populates="pep_questionnaire")


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

    # Субъект проверки (client | ubo | director | pep_family | pep_associate | signatory)
    subject_type = Column(String(50))
    subject_id = Column(Integer)          # ID субъекта (UBO.id / DirectorClient.id), NULL для JSON-субъектов
    subject_name = Column(String(255))    # Денормализованное имя субъекта для отображения

    # Решение офицера комплаенс
    officer_decision = Column(String(20))       # confirmed / false_positive
    officer_notes = Column(Text)
    officer_id = Column(Integer, ForeignKey("users.id"))
    officer_decided_at = Column(DateTime)

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


# ─── Высокорисковые страны (Приказ ГСФР № 78-ө/п от 20.06.2025) ──────────────

class HighRiskCountry(Base):
    """Перечень высокорисковых стран с применяемыми мерами."""
    __tablename__ = "high_risk_countries"

    id            = Column(Integer, primary_key=True)
    name_ru       = Column(String(200), nullable=False)
    name_en       = Column(String(200), nullable=False)
    basis         = Column(String(200))
    measures      = Column(JSON, nullable=False)
    order_ref     = Column(String(100), default="Приказ ГСФР № 78-ө/п от 20.06.2025")
    is_active     = Column(Boolean, default=True)

    audit_logs    = relationship("HighRiskCountryAudit", back_populates="country")


class HighRiskCountryAudit(Base):
    """Журнал изменений перечня высокорисковых стран."""
    __tablename__ = "high_risk_country_audit"

    id               = Column(Integer, primary_key=True)
    country_id       = Column(Integer, ForeignKey("high_risk_countries.id"), nullable=True)
    action           = Column(String(50), nullable=False)   # added / updated / deactivated / reactivated / pdf_uploaded
    country_name_ru  = Column(String(200))                  # дублируем имя на случай удаления
    old_value        = Column(JSON)
    new_value        = Column(JSON)
    changed_by_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    changed_by_name  = Column(String(200))                  # ФИО/email зафиксирован на момент изменения
    changed_at       = Column(DateTime, server_default=func.now())
    notes            = Column(Text)
    pdf_filename     = Column(String(500))                  # имя загруженного PDF (если action=pdf_uploaded)

    country          = relationship("HighRiskCountry", back_populates="audit_logs")


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