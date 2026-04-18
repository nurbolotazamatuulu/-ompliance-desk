"""ИПДС — учёт документов источника происхождения денежных средств."""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/sof", tags=["sof-ipds"])

# ─── Справочник типов документов ─────────────────────────────────────────────

DOC_TYPES = {
    "bank_statement":        "Выписка из банка",
    "salary_certificate":    "Справка о доходах / справка с места работы",
    "tax_return":            "Налоговая декларация (форма 910 / иная)",
    "business_contract":     "Бизнес-контракт / договор оказания услуг",
    "property_deed":         "Свидетельство о собственности / договор купли-продажи",
    "dividend_certificate":  "Справка о дивидендах / решение о распределении прибыли",
    "inheritance":           "Свидетельство о наследстве",
    "gift_declaration":      "Договор дарения",
    "loan_agreement":        "Договор займа / кредитный договор",
    "crypto_proof":          "Подтверждение происхождения крипто-активов",
    "other":                 "Иное",
}

CURRENCIES = ["KGS", "USD", "EUR", "RUB", "USDT", "BTC"]


# ─── Схемы ────────────────────────────────────────────────────────────────────

class SOFDocCreate(BaseModel):
    client_id:       int
    doc_type:        str
    description:     Optional[str]   = None
    document_number: Optional[str]   = None
    document_date:   Optional[datetime] = None
    amount:          float
    currency:        str             = "KGS"
    period_from:     Optional[datetime] = None
    period_to:       Optional[datetime] = None
    notes:           Optional[str]   = None


class SOFDocUpdate(BaseModel):
    doc_type:        Optional[str]      = None
    description:     Optional[str]      = None
    document_number: Optional[str]      = None
    document_date:   Optional[datetime] = None
    amount:          Optional[float]    = None
    currency:        Optional[str]      = None
    period_from:     Optional[datetime] = None
    period_to:       Optional[datetime] = None
    notes:           Optional[str]      = None


class SOFDocOut(BaseModel):
    id:              int
    client_id:       int
    doc_type:        str
    doc_type_label:  str
    description:     Optional[str]
    document_number: Optional[str]
    document_date:   Optional[datetime]
    amount:          float
    currency:        str
    period_from:     Optional[datetime]
    period_to:       Optional[datetime]
    status:          str
    verified_by:     Optional[int]
    verified_at:     Optional[datetime]
    notes:           Optional[str]
    created_at:      datetime

    model_config = {"from_attributes": True}


class CoverageOut(BaseModel):
    client_id:          int
    total_verified_kgs: float   # Сумма верифицированных документов в KGS (по курсу)
    by_currency:        dict    # {"KGS": 500000, "USD": 1200, ...}
    by_type:            dict    # {"bank_statement": 300000, ...}
    doc_count:          int
    doc_count_verified: int


# ─── Вспомогательные функции ──────────────────────────────────────────────────

def _to_out(doc: models.SOFDocument) -> SOFDocOut:
    return SOFDocOut(
        id=doc.id,
        client_id=doc.client_id,
        doc_type=doc.doc_type,
        doc_type_label=DOC_TYPES.get(doc.doc_type, doc.doc_type),
        description=doc.description,
        document_number=doc.document_number,
        document_date=doc.document_date,
        amount=doc.amount,
        currency=doc.currency,
        period_from=doc.period_from,
        period_to=doc.period_to,
        status=doc.status.value,
        verified_by=doc.verified_by,
        verified_at=doc.verified_at,
        notes=doc.notes,
        created_at=doc.created_at,
    )


def _check_client(client_id: int, company_id: int, db: Session) -> models.Client:
    c = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == company_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return c


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("/doc-types")
def get_doc_types():
    return [{"value": k, "label": v} for k, v in DOC_TYPES.items()]


@router.get("/client/{client_id}", response_model=List[SOFDocOut])
def list_sof(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _check_client(client_id, current_user.company_id, db)
    docs = (
        db.query(models.SOFDocument)
        .filter(
            models.SOFDocument.client_id == client_id,
            models.SOFDocument.company_id == current_user.company_id,
        )
        .order_by(models.SOFDocument.document_date.desc().nullslast(),
                  models.SOFDocument.created_at.desc())
        .all()
    )
    return [_to_out(d) for d in docs]


@router.get("/client/{client_id}/coverage", response_model=CoverageOut)
def get_coverage(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _check_client(client_id, current_user.company_id, db)
    docs = (
        db.query(models.SOFDocument)
        .filter(
            models.SOFDocument.client_id == client_id,
            models.SOFDocument.company_id == current_user.company_id,
        )
        .all()
    )

    by_currency: dict = {}
    by_type: dict = {}
    verified_count = 0

    for d in docs:
        by_currency[d.currency] = by_currency.get(d.currency, 0.0) + d.amount
        type_label = DOC_TYPES.get(d.doc_type, d.doc_type)
        by_type[type_label] = by_type.get(type_label, 0.0) + d.amount
        if d.status == models.SOFDocumentStatus.VERIFIED:
            verified_count += 1

    # Упрощённый пересчёт в KGS (фиксированные ориентиры для отображения)
    RATES_TO_KGS = {"KGS": 1, "USD": 88, "EUR": 96, "RUB": 1.0, "USDT": 88, "BTC": 7_500_000}
    total_kgs = sum(
        by_currency.get(cur, 0) * RATES_TO_KGS.get(cur, 1)
        for cur in by_currency
    )

    return CoverageOut(
        client_id=client_id,
        total_verified_kgs=round(total_kgs, 2),
        by_currency=by_currency,
        by_type=by_type,
        doc_count=len(docs),
        doc_count_verified=verified_count,
    )


@router.post("/client/{client_id}", response_model=SOFDocOut)
def create_sof(
    client_id: int,
    data: SOFDocCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if data.doc_type not in DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"Неизвестный тип документа: {data.doc_type}")
    _check_client(client_id, current_user.company_id, db)

    doc = models.SOFDocument(
        client_id=client_id,
        company_id=current_user.company_id,
        **data.model_dump(exclude={"client_id"}),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.put("/{doc_id}", response_model=SOFDocOut)
def update_sof(
    doc_id: int,
    data: SOFDocUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = (
        db.query(models.SOFDocument)
        .filter(
            models.SOFDocument.id == doc_id,
            models.SOFDocument.company_id == current_user.company_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, val)
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.patch("/{doc_id}/verify", response_model=SOFDocOut)
def verify_sof(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = (
        db.query(models.SOFDocument)
        .filter(
            models.SOFDocument.id == doc_id,
            models.SOFDocument.company_id == current_user.company_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    doc.status = models.SOFDocumentStatus.VERIFIED
    doc.verified_by = current_user.id
    doc.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.patch("/{doc_id}/reject", response_model=SOFDocOut)
def reject_sof(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = (
        db.query(models.SOFDocument)
        .filter(
            models.SOFDocument.id == doc_id,
            models.SOFDocument.company_id == current_user.company_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    doc.status = models.SOFDocumentStatus.REJECTED
    db.commit()
    db.refresh(doc)
    return _to_out(doc)


@router.delete("/{doc_id}")
def delete_sof(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = (
        db.query(models.SOFDocument)
        .filter(
            models.SOFDocument.id == doc_id,
            models.SOFDocument.company_id == current_user.company_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    db.delete(doc)
    db.commit()
    return {"ok": True}
