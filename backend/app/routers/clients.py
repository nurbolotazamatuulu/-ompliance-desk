"""
API эндпоинты для реестра клиентов.
Все операции изолированы по company_id — офицер видит только своих клиентов.
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user
from app.license import check_write_permission, check_client_limit

router = APIRouter(prefix="/api/clients", tags=["clients"])


# ─── Схемы (Pydantic) ─────────────────────────────────────────────────────────
# Схемы описывают формат данных для API запросов и ответов

class ClientListItem(BaseModel):
    """Краткая карточка для таблицы реестра."""
    id: int
    client_type: str
    display_name: str          # ФИО или название компании
    contract_number: Optional[str]
    contract_date: Optional[datetime]
    manager_code: Optional[str]
    is_resident: Optional[bool]
    country: Optional[str]
    risk_level: Optional[str]
    onboarding_status: str
    last_screening_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class CreateClientRequest(BaseModel):
    """Минимальные данные для создания клиента."""
    client_type: str                          # individual / legal
    contract_number: Optional[str] = None
    contract_date: Optional[datetime] = None
    manager_code: Optional[str] = None       # 4-значный код менеджера


class UpdateOnboardingStatus(BaseModel):
    status: str
    notes: Optional[str] = None


# ─── Хелперы ──────────────────────────────────────────────────────────────────

ONBOARDING_STATUS_RU = {
    "pending": "Ожидает",
    "in_progress": "В процессе",
    "approved": "Одобрен",
    "rejected": "Отклонён",
    "suspended": "Приостановлен",
}

RISK_LEVEL_RU = {
    "low": "Низкий",
    "medium": "Средний",
    "high": "Высокий",
    "critical": "Критический",
}


def get_display_name(client: models.Client) -> str:
    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        parts = [
            client.individual.last_name,
            client.individual.first_name,
            client.individual.middle_name or ""
        ]
        return " ".join(p for p in parts if p).strip()
    elif client.client_type == models.ClientType.LEGAL and client.legal_entity:
        return client.legal_entity.full_name
    return f"Клиент #{client.id}"


def get_country(client: models.Client) -> Optional[str]:
    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        return client.individual.citizenship
    elif client.client_type == models.ClientType.LEGAL and client.legal_entity:
        # Берём страну из юридического адреса или страну регистрации
        return None  # Расширим позже
    return None


def get_is_resident(client: models.Client) -> Optional[bool]:
    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        return client.individual.is_resident
    elif client.client_type == models.ClientType.LEGAL and client.legal_entity:
        return client.legal_entity.is_resident
    return None


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ClientListItem])
def list_clients(
    client_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Список клиентов компании с фильтрами.
    Поиск работает по имени/названию и номеру договора.
    """
    query = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.is_active == True
    )

    if client_type:
        query = query.filter(models.Client.client_type == client_type)
    if status:
        query = query.filter(models.Client.onboarding_status == status)
    if risk_level:
        query = query.filter(models.Client.risk_level == risk_level)

    clients = query.order_by(models.Client.created_at.desc()).all()

    # Поиск по имени (делаем в Python т.к. имя хранится в подтаблицах)
    if search:
        search_lower = search.lower()
        clients = [
            c for c in clients
            if search_lower in get_display_name(c).lower()
            or (c.contract_number and search_lower in c.contract_number.lower())
        ]

    result = []
    for c in clients:
        result.append(ClientListItem(
            id=c.id,
            client_type=c.client_type.value,
            display_name=get_display_name(c),
            contract_number=c.contract_number,
            contract_date=c.contract_date,
            manager_code=c.manager_code,
            is_resident=get_is_resident(c),
            country=get_country(c),
            risk_level=c.risk_level.value if c.risk_level else None,
            onboarding_status=c.onboarding_status.value,
            last_screening_at=c.last_screening_at,
            created_at=c.created_at,
        ))
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_client(
    data: CreateClientRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Создаёт нового клиента. Возвращает id для дальнейшего заполнения карточки."""
    company = current_user.company
    check_write_permission(company)
    check_client_limit(db, company)

    client = models.Client(
        company_id=current_user.company_id,
        client_type=data.client_type,
        contract_number=data.contract_number,
        contract_date=data.contract_date,
        manager_code=data.manager_code,
        onboarding_status=models.OnboardingStatus.PENDING,
        created_by=current_user.id,
    )
    db.add(client)
    db.flush()

    # Создаём пустую подзапись для типа клиента
    if data.client_type == models.ClientType.INDIVIDUAL:
        sub = models.IndividualClient(
            client_id=client.id,
            last_name="",
            first_name="",
        )
        db.add(sub)
    else:
        sub = models.LegalEntityClient(
            client_id=client.id,
            full_name="",
        )
        db.add(sub)

    # Журнал аудита
    log = models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.created",
        entity_type="client",
        entity_id=client.id,
        new_value={"client_type": data.client_type, "contract_number": data.contract_number},
    )
    db.add(log)
    db.commit()

    return {"id": client.id, "message": "Клиент создан"}


@router.get("/{client_id}")
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Полная карточка клиента со всеми данными."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()

    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    # Собираем полный ответ
    base = {
        "id": client.id,
        "client_type": client.client_type.value,
        "contract_number": client.contract_number,
        "contract_date": client.contract_date,
        "manager_code": client.manager_code,
        "risk_level": client.risk_level.value if client.risk_level else None,
        "onboarding_status": client.onboarding_status.value,
        "risk_score": client.risk_score,
        "last_screening_at": client.last_screening_at,
        "sumsub_status": client.sumsub_status,
        "notes": client.notes,
        "created_at": client.created_at,
    }

    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        ind = client.individual
        base["individual"] = {f: getattr(ind, f) for f in ind.__table__.columns.keys()}

    if client.client_type == models.ClientType.LEGAL and client.legal_entity:
        le = client.legal_entity
        base["legal_entity"] = {f: getattr(le, f) for f in le.__table__.columns.keys()}

    base["representatives"] = [
        {f: getattr(r, f) for f in r.__table__.columns.keys()}
        for r in client.representatives
    ]
    base["ubos_count"] = len(client.ubos)
    base["documents_count"] = len(client.documents)
    base["sanctions_checks_count"] = len(client.sanctions_checks)

    return base


@router.patch("/{client_id}/individual")
def update_individual(
    client_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Обновляет данные физлица. Принимает только те поля которые переданы."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client or client.client_type != models.ClientType.INDIVIDUAL:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)

    ind = client.individual
    old_values = {}
    allowed_fields = {c.name for c in models.IndividualClient.__table__.columns} - {"id", "client_id"}

    for field, value in data.items():
        if field in allowed_fields:
            old_values[field] = getattr(ind, field)
            setattr(ind, field, value)

    # Журнал аудита
    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.updated",
        entity_type="individual_client",
        entity_id=client_id,
        old_value=old_values,
        new_value=data,
    ))
    db.commit()
    return {"message": "Данные обновлены"}


@router.patch("/{client_id}/legal")
def update_legal(
    client_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Обновляет данные юрлица."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client or client.client_type != models.ClientType.LEGAL:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)

    le = client.legal_entity
    old_values = {}
    allowed_fields = {c.name for c in models.LegalEntityClient.__table__.columns} - {"id", "client_id"}

    for field, value in data.items():
        if field in allowed_fields:
            old_values[field] = getattr(le, field)
            setattr(le, field, value)

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.updated",
        entity_type="legal_entity_client",
        entity_id=client_id,
        old_value=old_values,
        new_value=data,
    ))
    db.commit()
    return {"message": "Данные обновлены"}


@router.patch("/{client_id}/status")
def update_status(
    client_id: int,
    data: UpdateOnboardingStatus,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Изменяет статус онбординга клиента."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)
    old_status = client.onboarding_status.value
    client.onboarding_status = data.status
    if data.notes:
        client.notes = data.notes

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.status_changed",
        entity_type="client",
        entity_id=client_id,
        old_value={"status": old_status},
        new_value={"status": data.status},
    ))
    db.commit()
    return {"message": "Статус обновлён"}


@router.delete("/{client_id}")
def deactivate_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Деактивирует клиента (не удаляет физически — данные хранятся)."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)
    client.is_active = False
    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.deactivated",
        entity_type="client",
        entity_id=client_id,
    ))
    db.commit()
    return {"message": "Клиент деактивирован"}
