"""CRUD для УБО (бенефициарных владельцев) и ИПДС/ПДЛ."""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api", tags=["ubos-pep"])


# ─── Вспомогательная функция: имя клиента ─────────────────────────────────────

def _client_display_name(client: models.Client) -> str:
    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        ind = client.individual
        parts = [ind.last_name, ind.first_name]
        if ind.middle_name:
            parts.append(ind.middle_name)
        return " ".join(parts)
    if client.legal_entity:
        return client.legal_entity.full_name or client.legal_entity.short_name or f"ID {client.id}"
    return f"Клиент #{client.id}"


# ─── Схемы УБО ────────────────────────────────────────────────────────────────

class UBOCreate(BaseModel):
    client_id: int
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    ownership_percentage: Optional[float] = None
    ownership_chain: Optional[str] = None
    is_ultimate: bool = True
    notes: Optional[str] = None


class UBOUpdate(BaseModel):
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    ownership_percentage: Optional[float] = None
    ownership_chain: Optional[str] = None
    is_ultimate: Optional[bool] = None
    notes: Optional[str] = None


class UBOOut(BaseModel):
    id: int
    client_id: int
    client_name: str
    last_name: str
    first_name: str
    middle_name: Optional[str]
    date_of_birth: Optional[datetime]
    nationality: Optional[str]
    passport_number: Optional[str]
    ownership_percentage: Optional[float]
    ownership_chain: Optional[str]
    is_ultimate: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Схемы ПДЛ/ИПДС ──────────────────────────────────────────────────────────

PEP_TYPES = {"PEP", "IPEP", "FAMILY", "ASSOCIATE"}


class PEPCreate(BaseModel):
    client_id: int
    pep_type: str   # PEP | IPEP | FAMILY | ASSOCIATE
    position: Optional[str] = None
    organization: Optional[str] = None
    country: Optional[str] = None
    source: Optional[str] = None
    identified_at: Optional[datetime] = None
    notes: Optional[str] = None


class PEPUpdate(BaseModel):
    pep_type: Optional[str] = None
    position: Optional[str] = None
    organization: Optional[str] = None
    country: Optional[str] = None
    source: Optional[str] = None
    identified_at: Optional[datetime] = None
    notes: Optional[str] = None


class PEPOut(BaseModel):
    id: int
    client_id: int
    client_name: str
    pep_type: Optional[str]
    position: Optional[str]
    organization: Optional[str]
    country: Optional[str]
    source: Optional[str]
    identified_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Хелпер доступа к клиенту ─────────────────────────────────────────────────

def _get_client(client_id: int, company_id: int, db: Session) -> models.Client:
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return client


# ─── УБО эндпоинты ────────────────────────────────────────────────────────────

@router.get("/ubos", response_model=List[UBOOut])
def list_ubos(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = (
        db.query(models.UBO)
        .join(models.Client, models.UBO.client_id == models.Client.id)
        .filter(models.Client.company_id == current_user.company_id)
    )
    if client_id:
        q = q.filter(models.UBO.client_id == client_id)
    rows = q.order_by(models.UBO.created_at.desc()).all()
    result = []
    for r in rows:
        d = {c.key: getattr(r, c.key) for c in r.__table__.columns}
        d["client_name"] = _client_display_name(r.client)
        result.append(UBOOut(**d))
    return result


@router.post("/ubos", response_model=UBOOut)
def create_ubo(
    data: UBOCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = _get_client(data.client_id, current_user.company_id, db)
    ubo = models.UBO(**data.model_dump())
    db.add(ubo)
    db.commit()
    db.refresh(ubo)
    d = {c.key: getattr(ubo, c.key) for c in ubo.__table__.columns}
    d["client_name"] = _client_display_name(client)
    return UBOOut(**d)


@router.get("/ubos/{ubo_id}", response_model=UBOOut)
def get_ubo(
    ubo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ubo = (
        db.query(models.UBO)
        .join(models.Client)
        .filter(models.UBO.id == ubo_id, models.Client.company_id == current_user.company_id)
        .first()
    )
    if not ubo:
        raise HTTPException(status_code=404, detail="УБО не найден")
    d = {c.key: getattr(ubo, c.key) for c in ubo.__table__.columns}
    d["client_name"] = _client_display_name(ubo.client)
    return UBOOut(**d)


@router.put("/ubos/{ubo_id}", response_model=UBOOut)
def update_ubo(
    ubo_id: int,
    data: UBOUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ubo = (
        db.query(models.UBO)
        .join(models.Client)
        .filter(models.UBO.id == ubo_id, models.Client.company_id == current_user.company_id)
        .first()
    )
    if not ubo:
        raise HTTPException(status_code=404, detail="УБО не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ubo, field, value)
    db.commit()
    db.refresh(ubo)
    d = {c.key: getattr(ubo, c.key) for c in ubo.__table__.columns}
    d["client_name"] = _client_display_name(ubo.client)
    return UBOOut(**d)


@router.delete("/ubos/{ubo_id}")
def delete_ubo(
    ubo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ubo = (
        db.query(models.UBO)
        .join(models.Client)
        .filter(models.UBO.id == ubo_id, models.Client.company_id == current_user.company_id)
        .first()
    )
    if not ubo:
        raise HTTPException(status_code=404, detail="УБО не найден")
    db.delete(ubo)
    db.commit()
    return {"ok": True}


# ─── ПДЛ/ИПДС эндпоинты ──────────────────────────────────────────────────────

@router.get("/pep", response_model=List[PEPOut])
def list_pep(
    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = (
        db.query(models.PEPRecord)
        .join(models.Client, models.PEPRecord.client_id == models.Client.id)
        .filter(models.Client.company_id == current_user.company_id)
    )
    if client_id:
        q = q.filter(models.PEPRecord.client_id == client_id)
    rows = q.order_by(models.PEPRecord.created_at.desc()).all()
    result = []
    for r in rows:
        d = {c.key: getattr(r, c.key) for c in r.__table__.columns}
        d["client_name"] = _client_display_name(r.client)
        result.append(PEPOut(**d))
    return result


@router.post("/pep", response_model=PEPOut)
def create_pep(
    data: PEPCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if data.pep_type not in PEP_TYPES:
        raise HTTPException(status_code=400, detail=f"pep_type must be one of {PEP_TYPES}")
    client = _get_client(data.client_id, current_user.company_id, db)
    pep = models.PEPRecord(**data.model_dump())
    db.add(pep)
    db.commit()
    db.refresh(pep)
    d = {c.key: getattr(pep, c.key) for c in pep.__table__.columns}
    d["client_name"] = _client_display_name(client)
    return PEPOut(**d)


@router.get("/pep/{pep_id}", response_model=PEPOut)
def get_pep(
    pep_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pep = (
        db.query(models.PEPRecord)
        .join(models.Client)
        .filter(models.PEPRecord.id == pep_id, models.Client.company_id == current_user.company_id)
        .first()
    )
    if not pep:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    d = {c.key: getattr(pep, c.key) for c in pep.__table__.columns}
    d["client_name"] = _client_display_name(pep.client)
    return PEPOut(**d)


@router.put("/pep/{pep_id}", response_model=PEPOut)
def update_pep(
    pep_id: int,
    data: PEPUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pep = (
        db.query(models.PEPRecord)
        .join(models.Client)
        .filter(models.PEPRecord.id == pep_id, models.Client.company_id == current_user.company_id)
        .first()
    )
    if not pep:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pep, field, value)
    db.commit()
    db.refresh(pep)
    d = {c.key: getattr(pep, c.key) for c in pep.__table__.columns}
    d["client_name"] = _client_display_name(pep.client)
    return PEPOut(**d)


@router.delete("/pep/{pep_id}")
def delete_pep(
    pep_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pep = (
        db.query(models.PEPRecord)
        .join(models.Client)
        .filter(models.PEPRecord.id == pep_id, models.Client.company_id == current_user.company_id)
        .first()
    )
    if not pep:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    db.delete(pep)
    db.commit()
    return {"ok": True}
