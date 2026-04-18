"""
Модуль отчётов.
Формирует структурированные выборки для:
  - Реестр клиентов (по уровню риска / статусу)
  - СПО (направленные в ГСФР)
  - Операции обязательного контроля
  - Документы (просроченные / отсутствующие)
  - Санкционные проверки
  - Сводный квартальный отчёт
"""

from datetime import datetime, date
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from pydantic import BaseModel
import io, csv

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _client_name(c: models.Client) -> str:
    if c.client_type == models.ClientType.INDIVIDUAL and c.individual:
        ind = c.individual
        return " ".join(p for p in [ind.last_name, ind.first_name, ind.middle_name] if p)
    if c.legal_entity:
        return c.legal_entity.short_name or c.legal_entity.full_name or f"Клиент #{c.id}"
    return f"Клиент #{c.id}"

def _client_doc_id(c: models.Client) -> str:
    if c.client_type == models.ClientType.INDIVIDUAL and c.individual:
        return c.individual.pin or c.individual.doc_series_number or "—"
    if c.legal_entity:
        return c.legal_entity.inn_resident or c.legal_entity.reg_number or "—"
    return "—"

RISK_LABELS = {
    "low": "Низкий", "medium": "Средний", "high": "Высокий", "critical": "Критический",
}
STATUS_LABELS = {
    "pending": "Ожидает", "in_progress": "В процессе",
    "approved": "Одобрен", "rejected": "Отклонён", "suspended": "Приостановлен",
}
DOC_LABELS: Dict[str, str] = {
    "passport": "Паспорт", "inn": "ИНН", "address_proof": "Подтверждение адреса",
    "source_of_funds": "Источник средств", "bank_statement": "Выписка банка",
    "charter": "Устав", "reg_certificate": "Свидетельство о регистрации",
    "tax_certificate": "Справка налогового органа", "ubo_declaration": "Декларация УБО",
    "license": "Лицензия", "financial_statements": "Финансовая отчётность",
    "aml_policy": "Политика ПОД/ФТ", "director_passport": "Паспорт руководителя",
}

def _csv_response(rows: List[List[Any]], headers: List[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    buf.write('\ufeff')  # BOM for Excel
    w = csv.writer(buf, delimiter=';', quoting=csv.QUOTE_MINIMAL)
    w.writerow(headers)
    for row in rows:
        w.writerow([str(v) if v is not None else "" for v in row])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

def _fmt_date(dt) -> str:
    if not dt:
        return ""
    if isinstance(dt, (datetime, date)):
        return dt.strftime("%d.%m.%Y")
    return str(dt)


# ─── Схемы ───────────────────────────────────────────────────────────────────

class ClientReportRow(BaseModel):
    id: int; name: str; doc_id: str; client_type: str
    risk_level: Optional[str]; risk_score: Optional[float]
    onboarding_status: Optional[str]; created_at: Optional[datetime]

class TransactionReportRow(BaseModel):
    id: int; operation_date: datetime; client_name: Optional[str]
    amount: float; currency: str; amount_kgs: Optional[float]
    type_code: Optional[str]; type_label: Optional[str]
    counterparty_name: Optional[str]; counterparty_country: Optional[str]
    indicators: List[str]; risk_score: Optional[float]; status: str; notes: Optional[str]

class DocumentReportRow(BaseModel):
    client_id: int; client_name: str; client_type: str
    document_type: str; label: str; status: str
    expires_at: Optional[datetime]; days_until_expiry: Optional[int]
    received_at: Optional[datetime]

class SanctionReportRow(BaseModel):
    id: int; checked_at: datetime; checked_name: str
    result: str; lists_checked: Optional[List[str]]; client_id: Optional[int]

class SummaryReport(BaseModel):
    period_from: str; period_to: str
    clients_total: int; clients_new: int
    clients_by_risk: Dict[str, int]
    transactions_total: int; transactions_mandatory: int
    transactions_suspicious: int; transactions_reported: int
    documents_expired: int; documents_missing: int
    sanctions_checks: int; sanctions_matches: int


# ─── 1. Отчёт по клиентам ────────────────────────────────────────────────────

@router.get("/clients", response_model=List[ClientReportRow])
def report_clients(
    risk_level: Optional[str] = Query(None),
    onboarding_status: Optional[str] = Query(None),
    client_type: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.is_active == True,
    )
    if risk_level:
        q = q.filter(models.Client.risk_level == risk_level)
    if onboarding_status:
        q = q.filter(models.Client.onboarding_status == onboarding_status)
    if client_type:
        q = q.filter(models.Client.client_type == client_type)
    if date_from:
        q = q.filter(models.Client.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.Client.created_at <= datetime.combine(date_to, datetime.max.time()))
    clients = q.order_by(models.Client.created_at.desc()).all()
    return [ClientReportRow(
        id=c.id,
        name=_client_name(c),
        doc_id=_client_doc_id(c),
        client_type="Физлицо" if c.client_type == models.ClientType.INDIVIDUAL else "Юрлицо",
        risk_level=RISK_LABELS.get(c.risk_level.value, c.risk_level.value) if c.risk_level else None,
        risk_score=c.risk_score,
        onboarding_status=STATUS_LABELS.get(c.onboarding_status.value, c.onboarding_status.value) if c.onboarding_status else None,
        created_at=c.created_at,
    ) for c in clients]


@router.get("/clients/csv")
def report_clients_csv(
    risk_level: Optional[str] = Query(None),
    onboarding_status: Optional[str] = Query(None),
    client_type: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows_data = report_clients(risk_level, onboarding_status, client_type, date_from, date_to, db, current_user)
    headers = ["ID", "Наименование", "ИНН / Паспорт", "Тип", "Уровень риска", "Риск-балл", "Статус онбординга", "Дата добавления"]
    rows = [[r.id, r.name, r.doc_id, r.client_type, r.risk_level or "—", r.risk_score or "—", r.onboarding_status or "—", _fmt_date(r.created_at)] for r in rows_data]
    return _csv_response(rows, headers, f"clients_{date.today()}.csv")


# ─── 2. Отчёт по транзакциям ─────────────────────────────────────────────────

def _txn_query(
    status: Optional[str], mandatory: Optional[bool],
    date_from: Optional[date], date_to: Optional[date],
    db: Session, company_id: int
):
    q = db.query(models.Transaction).filter(
        models.Transaction.company_id == company_id
    )
    if status:
        q = q.filter(models.Transaction.status == status)
    if mandatory is not None:
        q = q.filter(models.Transaction.is_mandatory_control == mandatory)
    if date_from:
        q = q.filter(models.Transaction.operation_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.Transaction.operation_date <= datetime.combine(date_to, datetime.max.time()))
    return q.order_by(models.Transaction.operation_date.desc()).all()


def _txn_to_row(t: models.Transaction, client_map: dict) -> TransactionReportRow:
    c = client_map.get(t.client_id) if t.client_id else None
    ind = list(dict.fromkeys((t.auto_indicators or []) + (t.manual_indicators or [])))
    return TransactionReportRow(
        id=t.id,
        operation_date=t.operation_date,
        client_name=_client_name(c) if c else None,
        amount=t.amount, currency=t.currency, amount_kgs=t.amount_kgs,
        type_code=t.type_code, type_label=t.type_label,
        counterparty_name=t.counterparty_name, counterparty_country=t.counterparty_country,
        indicators=ind, risk_score=t.risk_score,
        status=t.status.value if t.status else "new",
        notes=t.notes,
    )


@router.get("/transactions", response_model=List[TransactionReportRow])
def report_transactions(
    status: Optional[str] = Query(None),
    mandatory: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    txns = _txn_query(status, mandatory, date_from, date_to, db, current_user.company_id)
    clients = db.query(models.Client).filter(models.Client.company_id == current_user.company_id).all()
    cmap = {c.id: c for c in clients}
    return [_txn_to_row(t, cmap) for t in txns]


@router.get("/transactions/csv")
def report_transactions_csv(
    status: Optional[str] = Query(None),
    mandatory: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows_data = report_transactions(status, mandatory, date_from, date_to, db, current_user)
    headers = ["ID", "Дата", "Клиент", "Сумма", "Валюта", "Сумма KGS", "Код операции", "Вид операции",
               "Контрагент", "Страна", "Признаки", "Риск-балл", "Статус", "Комментарий"]
    rows = [[r.id, _fmt_date(r.operation_date), r.client_name or "—", r.amount, r.currency,
             r.amount_kgs or "—", r.type_code or "—", r.type_label or "—",
             r.counterparty_name or "—", r.counterparty_country or "—",
             " | ".join(r.indicators), r.risk_score or "—", r.status, r.notes or ""] for r in rows_data]
    return _csv_response(rows, headers, f"transactions_{date.today()}.csv")


# ─── 3. Отчёт по документам ──────────────────────────────────────────────────

@router.get("/documents", response_model=List[DocumentReportRow])
def report_documents(
    status: Optional[str] = Query(None),
    expiring_days: Optional[int] = Query(None),
    client_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    now = datetime.utcnow()
    q = db.query(models.ClientDocument).join(
        models.Client, models.ClientDocument.client_id == models.Client.id
    ).filter(models.Client.company_id == current_user.company_id)
    if status:
        q = q.filter(models.ClientDocument.status == status)
    if client_type:
        q = q.filter(models.Client.client_type == client_type)
    docs = q.all()

    clients = {c.id: c for c in db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id).all()}

    result = []
    for doc in docs:
        c = clients.get(doc.client_id)
        if not c:
            continue
        days = None
        if doc.expires_at:
            days = (doc.expires_at.date() - now.date()).days
        if expiring_days is not None:
            if days is None or not (0 <= days <= expiring_days):
                continue
        result.append(DocumentReportRow(
            client_id=doc.client_id,
            client_name=_client_name(c),
            client_type="Физлицо" if c.client_type == models.ClientType.INDIVIDUAL else "Юрлицо",
            document_type=doc.document_type,
            label=DOC_LABELS.get(doc.document_type, doc.document_type),
            status=doc.status.value,
            expires_at=doc.expires_at,
            days_until_expiry=days,
            received_at=doc.received_at,
        ))
    result.sort(key=lambda r: (r.days_until_expiry is None, r.days_until_expiry or 9999))
    return result


@router.get("/documents/csv")
def report_documents_csv(
    status: Optional[str] = Query(None),
    expiring_days: Optional[int] = Query(None),
    client_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows_data = report_documents(status, expiring_days, client_type, db, current_user)
    headers = ["ID клиента", "Клиент", "Тип клиента", "Документ", "Статус",
               "Получен", "Действителен до", "Дней до истечения"]
    rows = [[r.client_id, r.client_name, r.client_type, r.label, r.status,
             _fmt_date(r.received_at), _fmt_date(r.expires_at),
             r.days_until_expiry if r.days_until_expiry is not None else "—"] for r in rows_data]
    return _csv_response(rows, headers, f"documents_{date.today()}.csv")


# ─── 4. Отчёт по санкционным проверкам ───────────────────────────────────────

@router.get("/sanctions", response_model=List[SanctionReportRow])
def report_sanctions(
    result_filter: Optional[str] = Query(None, alias="result"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.SanctionsCheck).filter(
        models.SanctionsCheck.company_id == current_user.company_id
    )
    if result_filter:
        q = q.filter(models.SanctionsCheck.result == result_filter)
    if date_from:
        q = q.filter(models.SanctionsCheck.checked_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.SanctionsCheck.checked_at <= datetime.combine(date_to, datetime.max.time()))
    rows = q.order_by(models.SanctionsCheck.checked_at.desc()).all()
    return [SanctionReportRow(
        id=r.id, checked_at=r.checked_at, checked_name=r.checked_name,
        result=r.result, lists_checked=r.lists_checked, client_id=r.client_id,
    ) for r in rows]


@router.get("/sanctions/csv")
def report_sanctions_csv(
    result_filter: Optional[str] = Query(None, alias="result"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows_data = report_sanctions(result_filter, date_from, date_to, db, current_user)
    headers = ["ID", "Дата проверки", "Проверяемое имя", "Результат", "Проверенные списки", "ID клиента"]
    rows = [[r.id, _fmt_date(r.checked_at), r.checked_name, r.result,
             ", ".join(r.lists_checked or []), r.client_id or "—"] for r in rows_data]
    return _csv_response(rows, headers, f"sanctions_{date.today()}.csv")


# ─── 5. Сводный отчёт (для ГСФР) ─────────────────────────────────────────────

@router.get("/summary", response_model=SummaryReport)
def report_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cid = current_user.company_id
    now = datetime.utcnow()
    from_dt = datetime.combine(date_from, datetime.min.time()) if date_from else datetime(now.year, 1, 1)
    to_dt   = datetime.combine(date_to,   datetime.max.time()) if date_to   else now

    all_clients = db.query(models.Client).filter(
        models.Client.company_id == cid, models.Client.is_active == True).all()
    new_clients = [c for c in all_clients if c.created_at and from_dt <= c.created_at <= to_dt]

    txns = db.query(models.Transaction).filter(
        models.Transaction.company_id == cid,
        models.Transaction.operation_date >= from_dt,
        models.Transaction.operation_date <= to_dt,
    ).all()

    all_docs = db.query(models.ClientDocument).join(
        models.Client, models.ClientDocument.client_id == models.Client.id
    ).filter(models.Client.company_id == cid).all()

    sanctions = db.query(models.SanctionsCheck).filter(
        models.SanctionsCheck.company_id == cid,
        models.SanctionsCheck.checked_at >= from_dt,
        models.SanctionsCheck.checked_at <= to_dt,
    ).all()

    risk_counts: Dict[str, int] = {"low": 0, "medium": 0, "high": 0, "critical": 0, "unknown": 0}
    for c in all_clients:
        key = c.risk_level.value if c.risk_level else "unknown"
        risk_counts[key] = risk_counts.get(key, 0) + 1

    return SummaryReport(
        period_from=_fmt_date(from_dt),
        period_to=_fmt_date(to_dt),
        clients_total=len(all_clients),
        clients_new=len(new_clients),
        clients_by_risk={RISK_LABELS.get(k, k): v for k, v in risk_counts.items()},
        transactions_total=len(txns),
        transactions_mandatory=sum(1 for t in txns if t.is_mandatory_control),
        transactions_suspicious=sum(1 for t in txns if (t.auto_indicators or t.manual_indicators)),
        transactions_reported=sum(1 for t in txns if t.status == models.TransactionStatus.REPORTED),
        documents_expired=sum(1 for d in all_docs if d.status == models.DocumentStatus.EXPIRED),
        documents_missing=sum(1 for d in all_docs if d.status == models.DocumentStatus.MISSING),
        sanctions_checks=len(sanctions),
        sanctions_matches=sum(1 for s in sanctions if s.result in ("match", "possible_match")),
    )
