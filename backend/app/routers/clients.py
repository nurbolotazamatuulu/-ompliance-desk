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

_DATE_FORMATS = ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d')

def _coerce_value(column, value):
    """Convert JSON-serialised date strings back to datetime for DateTime columns."""
    if value is None or value == '':
        return None
    from sqlalchemy import DateTime, Date
    col_type = type(column.type)
    if col_type in (DateTime, Date) and isinstance(value, str):
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return value

def _serialize_audit(d: dict) -> dict:
    """Make old_value dict JSON-safe (convert datetime → ISO string)."""
    return {k: v.isoformat() if isinstance(v, datetime) else v for k, v in d.items()}


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
    is_high_risk_country: bool = False
    hrc_measures: List[str] = []

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
    is_resident: Optional[bool] = Query(None),
    manager_code: Optional[str] = Query(None),
    is_high_risk_country: Optional[bool] = Query(None),
    contract_date_from: Optional[str] = Query(None),
    contract_date_to: Optional[str] = Query(None),
    limit: Optional[int] = Query(None, ge=1, le=500),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Список клиентов компании с фильтрами."""
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
    if manager_code:
        query = query.filter(models.Client.manager_code == manager_code)
    if contract_date_from:
        query = query.filter(models.Client.contract_date >= contract_date_from)
    if contract_date_to:
        query = query.filter(models.Client.contract_date <= contract_date_to)

    clients = query.order_by(models.Client.created_at.desc()).all()

    # Справочник высокорисковых стран (кэшируем на запрос)
    hrc_rows = db.query(models.HighRiskCountry).filter(models.HighRiskCountry.is_active == True).all()
    hrc_map: dict[str, list] = {}
    for row in hrc_rows:
        for name in (row.name_ru.lower(), row.name_en.lower()):
            hrc_map[name] = row.measures

    def get_hrc(country: Optional[str]):
        if not country:
            return False, []
        key = country.strip().lower()
        measures = hrc_map.get(key, [])
        return bool(measures), measures

    # Python-фильтры (имя в подтаблицах, резидент, высокорисковая страна)
    result_clients = []
    for c in clients:
        name = get_display_name(c)
        country = get_country(c)
        resident = get_is_resident(c)
        is_hrc, measures = get_hrc(country)

        if search:
            s = search.lower()
            if s not in name.lower() and not (c.contract_number and s in c.contract_number.lower()):
                continue
        if is_resident is not None and resident != is_resident:
            continue
        if is_high_risk_country is not None and is_hrc != is_high_risk_country:
            continue

        result_clients.append((c, name, country, resident, is_hrc, measures))

    if skip:
        result_clients = result_clients[skip:]
    if limit is not None:
        result_clients = result_clients[:limit]

    return [
        ClientListItem(
            id=c.id,
            client_type=c.client_type.value,
            display_name=name,
            contract_number=c.contract_number,
            contract_date=c.contract_date,
            manager_code=c.manager_code,
            is_resident=resident,
            country=country,
            risk_level=c.risk_level.value if c.risk_level else None,
            onboarding_status=c.onboarding_status.value,
            last_screening_at=c.last_screening_at,
            created_at=c.created_at,
            is_high_risk_country=is_hrc,
            hrc_measures=measures,
        )
        for c, name, country, resident, is_hrc, measures in result_clients
    ]


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
        director = db.query(models.DirectorClient).filter(
            models.DirectorClient.client_id == client_id
        ).first()
        base["director"] = {f: getattr(director, f) for f in director.__table__.columns.keys()} if director else None

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
    col_map = {c.name: c for c in models.IndividualClient.__table__.columns}
    allowed_fields = set(col_map.keys()) - {"id", "client_id"}

    for field, value in data.items():
        if field in allowed_fields:
            old_values[field] = getattr(ind, field)
            setattr(ind, field, _coerce_value(col_map[field], value))

    # Синхронизация ПДЛ-статуса с реестром PEPRecord
    if "is_pdl" in data:
        _sync_individual_pep(client, ind, db)

    # Журнал аудита
    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.updated",
        entity_type="individual_client",
        entity_id=client_id,
        old_value=_serialize_audit(old_values),
        new_value=data,
    ))
    db.commit()
    return {"message": "Данные обновлены"}


def _sync_individual_pep(client: models.Client, ind: models.IndividualClient, db: Session) -> None:
    """Создаёт/удаляет PEPRecord при изменении is_pdl у ФЛ клиента."""
    existing = db.query(models.PEPRecord).filter(
        models.PEPRecord.client_id == client.id,
        models.PEPRecord.ubo_id.is_(None),
    ).first()
    if ind.is_pdl:
        full_name = " ".join(p for p in [ind.last_name, ind.first_name, ind.middle_name] if p)
        if not existing:
            db.add(models.PEPRecord(
                client_id=client.id,
                pep_type="PEP",
                source="Анкета ФЛ",
                notes=full_name or None,
            ))
    else:
        if existing:
            db.delete(existing)


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
    col_map = {c.name: c for c in models.LegalEntityClient.__table__.columns}
    allowed_fields = set(col_map.keys()) - {"id", "client_id"}

    for field, value in data.items():
        if field in allowed_fields:
            old_values[field] = getattr(le, field)
            setattr(le, field, _coerce_value(col_map[field], value))

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.updated",
        entity_type="legal_entity_client",
        entity_id=client_id,
        old_value=_serialize_audit(old_values),
        new_value=data,
    ))
    db.commit()
    return {"message": "Данные обновлены"}


DIRECTOR_ALLOWED = {c.name for c in models.DirectorClient.__table__.columns} - {"id", "client_id", "created_at"}
REP_ALLOWED = {c.name for c in models.ClientRepresentative.__table__.columns} - {"id", "client_id", "created_at", "created_by"}


def _check_legal_client(client_id: int, company_id: int, db: Session):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == company_id,
    ).first()
    if not client or client.client_type != models.ClientType.LEGAL:
        raise HTTPException(status_code=404, detail="ЮЛ-клиент не найден")
    return client


# ─── Директора ────────────────────────────────────────────────────────────────

@router.get("/{client_id}/directors")
def list_directors(client_id: int, db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    _check_legal_client(client_id, current_user.company_id, db)
    rows = db.query(models.DirectorClient).filter(
        models.DirectorClient.client_id == client_id
    ).order_by(models.DirectorClient.id).all()
    return [{f: getattr(r, f) for f in r.__table__.columns.keys()} for r in rows]


@router.post("/{client_id}/directors", status_code=status.HTTP_201_CREATED)
def create_director(client_id: int, data: dict, db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    _check_legal_client(client_id, current_user.company_id, db)
    check_write_permission(current_user.company)
    director = models.DirectorClient(client_id=client_id)
    for field, value in data.items():
        if field in DIRECTOR_ALLOWED:
            setattr(director, field, value)
    db.add(director)
    db.commit()
    db.refresh(director)
    return {f: getattr(director, f) for f in director.__table__.columns.keys()}


@router.patch("/{client_id}/directors/{director_id}")
def update_director(client_id: int, director_id: int, data: dict,
                    db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    _check_legal_client(client_id, current_user.company_id, db)
    check_write_permission(current_user.company)
    director = db.query(models.DirectorClient).filter(
        models.DirectorClient.id == director_id,
        models.DirectorClient.client_id == client_id,
    ).first()
    if not director:
        raise HTTPException(status_code=404, detail="Директор не найден")
    for field, value in data.items():
        if field in DIRECTOR_ALLOWED:
            setattr(director, field, value)
    db.commit()
    return {f: getattr(director, f) for f in director.__table__.columns.keys()}


@router.delete("/{client_id}/directors/{director_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_director(client_id: int, director_id: int, db: Session = Depends(get_db),
                    current_user: models.User = Depends(get_current_user)):
    _check_legal_client(client_id, current_user.company_id, db)
    check_write_permission(current_user.company)
    director = db.query(models.DirectorClient).filter(
        models.DirectorClient.id == director_id,
        models.DirectorClient.client_id == client_id,
    ).first()
    if not director:
        raise HTTPException(status_code=404, detail="Директор не найден")
    db.delete(director)
    db.commit()


# ─── Доверительные лица / представители ──────────────────────────────────────

@router.get("/{client_id}/representatives")
def list_representatives(client_id: int, db: Session = Depends(get_db),
                         current_user: models.User = Depends(get_current_user)):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    rows = db.query(models.ClientRepresentative).filter(
        models.ClientRepresentative.client_id == client_id
    ).order_by(models.ClientRepresentative.id).all()
    return [{f: getattr(r, f) for f in r.__table__.columns.keys()} for r in rows]


@router.post("/{client_id}/representatives", status_code=status.HTTP_201_CREATED)
def create_representative(client_id: int, data: dict, db: Session = Depends(get_db),
                           current_user: models.User = Depends(get_current_user)):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    check_write_permission(current_user.company)
    rep = models.ClientRepresentative(client_id=client_id, created_by=current_user.id)
    for field, value in data.items():
        if field in REP_ALLOWED:
            setattr(rep, field, value)
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return {f: getattr(rep, f) for f in rep.__table__.columns.keys()}


@router.patch("/{client_id}/representatives/{rep_id}")
def update_representative(client_id: int, rep_id: int, data: dict,
                           db: Session = Depends(get_db),
                           current_user: models.User = Depends(get_current_user)):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    check_write_permission(current_user.company)
    rep = db.query(models.ClientRepresentative).filter(
        models.ClientRepresentative.id == rep_id,
        models.ClientRepresentative.client_id == client_id,
    ).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Представитель не найден")
    for field, value in data.items():
        if field in REP_ALLOWED:
            setattr(rep, field, value)
    db.commit()
    return {f: getattr(rep, f) for f in rep.__table__.columns.keys()}


@router.delete("/{client_id}/representatives/{rep_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_representative(client_id: int, rep_id: int, db: Session = Depends(get_db),
                           current_user: models.User = Depends(get_current_user)):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    check_write_permission(current_user.company)
    rep = db.query(models.ClientRepresentative).filter(
        models.ClientRepresentative.id == rep_id,
        models.ClientRepresentative.client_id == client_id,
    ).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Представитель не найден")
    db.delete(rep)
    db.commit()


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
def archive_client(
    client_id: int,
    reason: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Переводит клиента в архив (мягкое удаление)."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)
    client.is_active = False
    client.archived_at = datetime.utcnow()
    client.archived_by = current_user.id
    client.archive_reason = reason or None

    # Каскадная архивация УБО
    db.query(models.UBO).filter(models.UBO.client_id == client_id).update({"is_archived": True})

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.archived",
        entity_type="client",
        entity_id=client_id,
        new_value={"reason": reason},
    ))
    db.commit()
    return {"ok": True}


@router.post("/{client_id}/restore")
def restore_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Восстанавливает клиента из архива."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)
    client.is_active = True
    client.archived_at = None
    client.archived_by = None
    client.archive_reason = None

    # Каскадное восстановление УБО
    db.query(models.UBO).filter(models.UBO.client_id == client_id).update({"is_archived": False})

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="client.restored",
        entity_type="client",
        entity_id=client_id,
    ))
    db.commit()
    return {"ok": True}


@router.delete("/{client_id}/permanent")
def delete_client_permanent(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Полное безвозвратное удаление клиента и всех связанных данных."""
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    check_write_permission(current_user.company)
    db.query(models.PEPRecord).filter(models.PEPRecord.client_id == client_id).delete()
    db.query(models.UBO).filter(models.UBO.client_id == client_id).delete()
    db.query(models.PEPQuestionnaire).filter(models.PEPQuestionnaire.client_id == client_id).delete()
    db.query(models.ClientDocument).filter(models.ClientDocument.client_id == client_id).delete()
    db.query(models.SanctionsCheck).filter(models.SanctionsCheck.client_id == client_id).delete()
    db.query(models.RiskScoringHistory).filter(models.RiskScoringHistory.client_id == client_id).delete()
    db.query(models.ClientRepresentative).filter(models.ClientRepresentative.client_id == client_id).delete()
    db.query(models.DirectorClient).filter(models.DirectorClient.client_id == client_id).delete()
    db.query(models.SumsubRecord).filter(models.SumsubRecord.client_id == client_id).delete()
    db.query(models.SOFDocument).filter(models.SOFDocument.client_id == client_id).delete()
    if client.individual:
        db.delete(client.individual)
    if client.legal_entity:
        db.delete(client.legal_entity)
    db.delete(client)
    db.commit()
    return {"ok": True}


@router.get("/archived")
def list_archived(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Список архивированных клиентов."""
    clients = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.archived_at.isnot(None),
    ).order_by(models.Client.archived_at.desc()).all()

    result = []
    for c in clients:
        name = ""
        if c.client_type == models.ClientType.INDIVIDUAL and c.individual:
            ind = c.individual
            name = " ".join(p for p in [ind.last_name, ind.first_name, ind.middle_name] if p)
        elif c.legal_entity:
            name = c.legal_entity.full_name or c.legal_entity.short_name or f"#{c.id}"

        archived_by_name = None
        if c.archived_by:
            u = db.query(models.User).filter(models.User.id == c.archived_by).first()
            archived_by_name = u.full_name if u else None

        result.append({
            "id": c.id,
            "client_type": c.client_type.value,
            "display_name": name or f"Клиент #{c.id}",
            "contract_number": c.contract_number,
            "archived_at": c.archived_at,
            "archived_by_name": archived_by_name,
            "archive_reason": c.archive_reason,
        })
    return result


# ─── Анкета ПДЛ ───────────────────────────────────────────────────────────────

class PEPQuestionnaireIn(BaseModel):
    is_primary: Optional[bool] = None
    position: Optional[str] = None
    appointment_date: Optional[datetime] = None
    release_date: Optional[datetime] = None
    source_of_funds: Optional[str] = None
    approval_notes: Optional[str] = None
    family_members: Optional[list] = None
    close_associates: Optional[list] = None


@router.get("/{client_id}/pep-questionnaire")
def get_pep_questionnaire(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404)
    q = client.pep_questionnaire
    if not q:
        return {
            "id": None, "client_id": client_id, "is_primary": True,
            "position": None, "appointment_date": None, "release_date": None,
            "source_of_funds": None, "approval_notes": None,
            "family_members": [], "close_associates": [],
        }
    return {
        "id": q.id, "client_id": q.client_id, "is_primary": q.is_primary,
        "position": q.position,
        "appointment_date": q.appointment_date.isoformat() if q.appointment_date else None,
        "release_date": q.release_date.isoformat() if q.release_date else None,
        "source_of_funds": q.source_of_funds,
        "approval_notes": q.approval_notes,
        "family_members": q.family_members or [],
        "close_associates": q.close_associates or [],
    }


@router.patch("/{client_id}/pep-questionnaire")
def upsert_pep_questionnaire(
    client_id: int,
    data: PEPQuestionnaireIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404)

    q = client.pep_questionnaire
    if not q:
        q = models.PEPQuestionnaire(client_id=client_id)
        db.add(q)

    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        setattr(q, k, v)

    db.commit()
    db.refresh(q)
    return {"ok": True}
