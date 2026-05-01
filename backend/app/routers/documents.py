"""Трекер документов клиентов — статусы, сроки, дедлайны."""

import os
import shutil
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/documents", tags=["documents"])

UPLOADS_ROOT = "/app/uploads"


# ─── Справочник типов документов ─────────────────────────────────────────────

# has_expiry=True — у документа бывает срок действия, нужно отслеживать
INDIVIDUAL_DOC_TYPES = [
    {"key": "passport_id",        "label": "Паспорт / ID-карта",                        "has_expiry": True},
    {"key": "questionnaire",      "label": "Анкета клиента (подписанная)",               "has_expiry": False},
    {"key": "photo_with_passport","label": "Фотография с паспортом",                     "has_expiry": False},
    {"key": "source_of_funds",    "label": "Подтверждение происхождения средств",        "has_expiry": True},
    {"key": "tax_registration",   "label": "Постановка на учёт в налоговом органе",     "has_expiry": False},
    {"key": "power_of_attorney",  "label": "Доверенность (если действует представитель)","has_expiry": True},
]

LEGAL_DOC_TYPES = [
    {"key": "questionnaire",       "label": "Анкета (подписанная, заверенная печатью)",     "has_expiry": False},
    {"key": "director_photo",      "label": "Фотография директора с паспортом",             "has_expiry": False},
    {"key": "registration_cert",   "label": "Свидетельство о государственной регистрации",  "has_expiry": False},
    {"key": "charter",             "label": "Устав (действующая редакция)",                 "has_expiry": False},
    {"key": "founding_decision",   "label": "Решение о создании / перерегистрации",         "has_expiry": False},
    {"key": "founding_agreement",  "label": "Учредительный договор (при наличии)",          "has_expiry": False},
    {"key": "charter_amendments",  "label": "Изменения в учредительные документы",          "has_expiry": False},
    {"key": "tax_registration",    "label": "Постановка на учёт в налоговом органе",        "has_expiry": False},
    {"key": "financial_statements","label": "Финансовая отчётность (последний период)",     "has_expiry": True},
    {"key": "authority_docs",      "label": "Документы о полномочиях подписантов",          "has_expiry": True},
    {"key": "signatory_id",        "label": "Удостоверение личности подписанта и UBO",      "has_expiry": True},
    {"key": "license",             "label": "Лицензия / регуляторное разрешение",           "has_expiry": True},
    {"key": "nonresident_status",  "label": "Документ о статусе нерезидента",               "has_expiry": True},
]

DOC_TYPE_MAP = {d["key"]: d for d in INDIVIDUAL_DOC_TYPES + LEGAL_DOC_TYPES}


def _required_types(client_type: str) -> list:
    if client_type == "individual":
        return INDIVIDUAL_DOC_TYPES
    return LEGAL_DOC_TYPES


# ─── Схемы ────────────────────────────────────────────────────────────────────

class DocUpsert(BaseModel):
    document_type: str
    status:        str   # present | requested | expired | missing
    issued_at:     Optional[datetime] = None
    expires_at:    Optional[datetime] = None
    received_at:   Optional[datetime] = None
    notes:         Optional[str]      = None


class DocOut(BaseModel):
    id:            Optional[int]
    client_id:     int
    document_type: str
    label:         str
    has_expiry:    bool
    status:        str
    issued_at:     Optional[datetime]
    expires_at:    Optional[datetime]
    received_at:   Optional[datetime]
    days_until_expiry: Optional[int]
    notes:         Optional[str]
    file_name:     Optional[str]
    updated_at:    Optional[datetime]

    model_config = {"from_attributes": True}


class DocListItem(DocOut):
    client_name:   str
    client_type:   str


# ─── Вспомогательные функции ──────────────────────────────────────────────────

def _days_until(dt: Optional[datetime]) -> Optional[int]:
    if dt is None:
        return None
    return (dt.date() - datetime.utcnow().date()).days


def _to_out(doc: models.ClientDocument, client_id: int, doc_type: str) -> DocOut:
    meta = DOC_TYPE_MAP.get(doc_type, {"label": doc_type, "has_expiry": False})
    file_name = os.path.basename(doc.file_path) if doc.file_path else None
    return DocOut(
        id=doc.id,
        client_id=client_id,
        document_type=doc_type,
        label=meta["label"],
        has_expiry=meta["has_expiry"],
        status=doc.status.value if doc.status else "missing",
        issued_at=doc.issued_at,
        expires_at=doc.expires_at,
        received_at=doc.received_at,
        days_until_expiry=_days_until(doc.expires_at),
        notes=doc.notes,
        file_name=file_name,
        updated_at=doc.updated_at,
    )


def _placeholder(client_id: int, doc_type: str) -> DocOut:
    meta = DOC_TYPE_MAP.get(doc_type, {"label": doc_type, "has_expiry": False})
    return DocOut(
        id=None,
        client_id=client_id,
        document_type=doc_type,
        label=meta["label"],
        has_expiry=meta["has_expiry"],
        status="missing",
        issued_at=None,
        expires_at=None,
        received_at=None,
        days_until_expiry=None,
        notes=None,
        updated_at=None,
    )


def _client_display_name(client: models.Client) -> str:
    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        ind = client.individual
        return " ".join(p for p in [ind.last_name, ind.first_name, ind.middle_name] if p)
    if client.legal_entity:
        return client.legal_entity.full_name or client.legal_entity.short_name or f"#{client.id}"
    return f"Клиент #{client.id}"


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("/required-types")
def get_required_types(client_type: str = Query("individual")):
    return _required_types(client_type)


@router.get("/client/{client_id}", response_model=List[DocOut])
def get_client_docs(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        return []

    required = _required_types(client.client_type.value)
    saved = {
        d.document_type: d
        for d in db.query(models.ClientDocument)
        .filter(models.ClientDocument.client_id == client_id)
        .all()
    }

    result = []
    for r in required:
        key = r["key"]
        if key in saved:
            result.append(_to_out(saved[key], client_id, key))
        else:
            result.append(_placeholder(client_id, key))
    return result


@router.post("/client/{client_id}/upsert", response_model=DocOut)
def upsert_doc(
    client_id: int,
    data: DocUpsert,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Клиент не найден")

    status_map = {
        "present": models.DocumentStatus.PRESENT,
        "requested": models.DocumentStatus.REQUESTED,
        "expired": models.DocumentStatus.EXPIRED,
        "missing": models.DocumentStatus.MISSING,
    }

    doc = db.query(models.ClientDocument).filter(
        models.ClientDocument.client_id == client_id,
        models.ClientDocument.document_type == data.document_type,
    ).first()

    if doc is None:
        doc = models.ClientDocument(
            client_id=client_id,
            document_type=data.document_type,
        )
        db.add(doc)

    doc.status     = status_map.get(data.status, models.DocumentStatus.MISSING)
    doc.issued_at  = data.issued_at
    doc.expires_at = data.expires_at
    doc.received_at = data.received_at
    doc.notes      = data.notes

    db.commit()
    db.refresh(doc)
    return _to_out(doc, client_id, data.document_type)


@router.get("", response_model=List[DocListItem])
def list_all_docs(
    status: Optional[str] = Query(None),           # present|requested|expired|missing
    expiring_days: Optional[int] = Query(None),    # напр. 30 — истекает в течение 30 дней
    client_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Глобальный реестр документов по компании.
    Если у клиента нет записи для обязательного типа — возвращает placeholder со статусом missing.
    """
    clients_q = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.is_active == True,
    )
    if client_id:
        clients_q = clients_q.filter(models.Client.id == client_id)
    clients = clients_q.all()

    result: List[DocListItem] = []
    now = datetime.utcnow()

    for client in clients:
        required = _required_types(client.client_type.value)
        saved = {
            d.document_type: d
            for d in db.query(models.ClientDocument)
            .filter(models.ClientDocument.client_id == client.id)
            .all()
        }
        name = _client_display_name(client)

        for r in required:
            key = r["key"]
            doc = saved.get(key)
            base = _to_out(doc, client.id, key) if doc else _placeholder(client.id, key)

            # Авто-статус expired для просроченных
            effective_status = base.status
            if base.expires_at and base.expires_at < now and base.status == "present":
                effective_status = "expired"

            # Фильтр по статусу
            if status and effective_status != status:
                continue

            # Фильтр «истекает через N дней»
            if expiring_days is not None:
                if base.days_until_expiry is None:
                    continue
                if not (0 <= base.days_until_expiry <= expiring_days):
                    continue

            base_data = base.model_dump()
            base_data['status'] = effective_status
            result.append(DocListItem(
                **base_data,
                client_name=name,
                client_type=client.client_type.value,
            ))

    # Сортировка: сначала просроченные, потом истекающие, потом остальные
    def sort_key(d: DocListItem):
        if d.days_until_expiry is not None:
            return (0, d.days_until_expiry)
        if d.status == "missing":
            return (1, 0)
        if d.status == "requested":
            return (2, 0)
        return (3, 0)

    result.sort(key=sort_key)
    return result


# ─── Загрузка файла ───────────────────────────────────────────────────────────

def _upload_dir(company_id: int, client_id: int) -> str:
    path = os.path.join(UPLOADS_ROOT, str(company_id), str(client_id))
    os.makedirs(path, exist_ok=True)
    return path


def _safe_ext(filename: str) -> str:
    allowed = {".pdf"}
    _, ext = os.path.splitext(filename.lower())
    return ext if ext in allowed else ""


@router.post("/client/{client_id}/upload/{doc_type}", response_model=DocOut)
def upload_file(
    client_id: int,
    doc_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    ext = _safe_ext(file.filename or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Недопустимый тип файла")

    upload_dir = _upload_dir(current_user.company_id, client_id)
    # один файл на тип документа — перезаписываем
    dest = os.path.join(upload_dir, f"{doc_type}{ext}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = db.query(models.ClientDocument).filter(
        models.ClientDocument.client_id == client_id,
        models.ClientDocument.document_type == doc_type,
    ).first()

    if doc is None:
        doc = models.ClientDocument(client_id=client_id, document_type=doc_type)
        db.add(doc)

    doc.file_path = dest
    if doc.status == models.DocumentStatus.MISSING:
        doc.status = models.DocumentStatus.PRESENT

    db.commit()
    db.refresh(doc)
    return _to_out(doc, client_id, doc_type)


@router.get("/client/{client_id}/file/{doc_type}")
def download_file(
    client_id: int,
    doc_type: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404)

    doc = db.query(models.ClientDocument).filter(
        models.ClientDocument.client_id == client_id,
        models.ClientDocument.document_type == doc_type,
    ).first()

    if not doc or not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(
        doc.file_path,
        filename=os.path.basename(doc.file_path),
        media_type="application/octet-stream",
    )


@router.delete("/client/{client_id}/file/{doc_type}", status_code=204)
def delete_file(
    client_id: int,
    doc_type: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404)

    doc = db.query(models.ClientDocument).filter(
        models.ClientDocument.client_id == client_id,
        models.ClientDocument.document_type == doc_type,
    ).first()

    if doc and doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    if doc:
        doc.file_path = None
        db.commit()

    return None
