"""Реестр ПДЛ / ИПДС — публичные должностные лица."""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/pep", tags=["pep"])


class PEPIn(BaseModel):
    client_id: int
    pep_type: Optional[str] = "PEP"   # PEP | IPEP | FAMILY | ASSOCIATE
    position: Optional[str] = None
    organization: Optional[str] = None
    country: Optional[str] = None
    source: Optional[str] = None
    identified_at: Optional[datetime] = None
    notes: Optional[str] = None


def _client_name(client: models.Client) -> str:
    if client.individual:
        parts = [client.individual.last_name, client.individual.first_name, client.individual.middle_name]
        return " ".join(p for p in parts if p) or f"Клиент #{client.id}"
    if client.legal_entity:
        return client.legal_entity.full_name or f"Клиент #{client.id}"
    return f"Клиент #{client.id}"


def _out(rec: models.PEPRecord, client_name: str) -> dict:
    return {
        "id": rec.id,
        "client_id": rec.client_id,
        "client_name": client_name,
        "pep_type": rec.pep_type,
        "position": rec.position,
        "organization": rec.organization,
        "country": rec.country,
        "source": rec.source,
        "identified_at": rec.identified_at,
        "notes": rec.notes,
        "created_at": rec.created_at,
    }


@router.get("")
def list_pep(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    records = (
        db.query(models.PEPRecord)
        .join(models.Client, models.PEPRecord.client_id == models.Client.id)
        .filter(models.Client.company_id == current_user.company_id)
        .order_by(models.PEPRecord.created_at.desc())
        .all()
    )
    result = []
    for rec in records:
        client = db.query(models.Client).filter(models.Client.id == rec.client_id).first()
        result.append(_out(rec, _client_name(client) if client else f"#{rec.client_id}"))
    return result


@router.post("", status_code=201)
def create_pep(
    data: PEPIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == data.client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    rec = models.PEPRecord(
        client_id=data.client_id,
        pep_type=data.pep_type,
        position=data.position,
        organization=data.organization,
        country=data.country,
        source=data.source,
        identified_at=data.identified_at,
        notes=data.notes,
        verified_by=current_user.id,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _out(rec, _client_name(client))


@router.put("/{pep_id}")
def update_pep(
    pep_id: int,
    data: PEPIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rec = (
        db.query(models.PEPRecord)
        .join(models.Client, models.PEPRecord.client_id == models.Client.id)
        .filter(
            models.PEPRecord.id == pep_id,
            models.Client.company_id == current_user.company_id,
        )
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    rec.pep_type = data.pep_type
    rec.position = data.position
    rec.organization = data.organization
    rec.country = data.country
    rec.source = data.source
    rec.identified_at = data.identified_at
    rec.notes = data.notes
    db.commit()
    db.refresh(rec)

    client = db.query(models.Client).filter(models.Client.id == rec.client_id).first()
    return _out(rec, _client_name(client) if client else f"#{rec.client_id}")


@router.delete("/{pep_id}", status_code=204)
def delete_pep(
    pep_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rec = (
        db.query(models.PEPRecord)
        .join(models.Client, models.PEPRecord.client_id == models.Client.id)
        .filter(
            models.PEPRecord.id == pep_id,
            models.Client.company_id == current_user.company_id,
        )
        .first()
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    db.delete(rec)
    db.commit()
