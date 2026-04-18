"""
Агрегированный дашборд — сводные данные по всем модулям.
"""

from datetime import datetime, timedelta
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# ─── Схемы ───────────────────────────────────────────────────────────────────

class ClientStats(BaseModel):
    total: int; individual: int; legal: int
    high_risk: int; critical: int; pending: int

class DocStats(BaseModel):
    expired: int; expiring_7: int; expiring_30: int
    missing: int; requested: int; present: int

class TxnStats(BaseModel):
    total: int; new: int; reviewing: int; reported: int
    mandatory: int; suspicious: int

class SanctionsStats(BaseModel):
    total_checks: int; matches: int; possible_matches: int
    last_check_at: Optional[datetime]

class RiskDistribution(BaseModel):
    low: int; medium: int; high: int; critical: int; unknown: int

class AlertItem(BaseModel):
    level: str          # critical / warning / info
    category: str       # client / document / transaction / sanctions
    title: str
    detail: str
    link: Optional[str] = None
    count: int = 1

class ExpiringDoc(BaseModel):
    client_id: int; client_name: str
    document_type: str; label: str
    expires_at: Optional[datetime]
    days_until_expiry: Optional[int]

class RecentTxn(BaseModel):
    id: int
    client_name: Optional[str]
    amount: float; currency: str; amount_kgs: Optional[float]
    type_label: Optional[str]
    indicators_count: int
    risk_score: Optional[float]
    status: str
    operation_date: datetime

class RecentSanction(BaseModel):
    id: int
    checked_name: str
    result: str
    checked_at: datetime
    client_id: Optional[int]

class DashboardOut(BaseModel):
    clients: ClientStats
    documents: DocStats
    transactions: TxnStats
    sanctions: SanctionsStats
    risk_distribution: RiskDistribution
    alerts: List[AlertItem]
    expiring_docs: List[ExpiringDoc]
    recent_transactions: List[RecentTxn]
    recent_sanctions: List[RecentSanction]
    generated_at: datetime


# ─── Helpers ─────────────────────────────────────────────────────────────────

DOC_LABELS: Dict[str, str] = {
    "passport":              "Паспорт",
    "inn":                   "ИНН",
    "address_proof":         "Подтверждение адреса",
    "source_of_funds":       "Источник средств",
    "bank_statement":        "Выписка банка",
    "charter":               "Устав",
    "reg_certificate":       "Свидетельство о регистрации",
    "tax_certificate":       "Справка налогового органа",
    "ubo_declaration":       "Декларация УБО",
    "license":               "Лицензия",
    "financial_statements":  "Финансовая отчётность",
    "aml_policy":            "Политика ПОД/ФТ",
    "director_passport":     "Паспорт руководителя",
}

def _client_name(c: models.Client) -> str:
    if c.client_type == models.ClientType.INDIVIDUAL and c.individual:
        ind = c.individual
        return " ".join(p for p in [ind.last_name, ind.first_name] if p)
    if c.legal_entity:
        return c.legal_entity.short_name or c.legal_entity.full_name or f"Клиент #{c.id}"
    return f"Клиент #{c.id}"


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cid = current_user.company_id
    now = datetime.utcnow()

    # ── Клиенты ───────────────────────────────────────────────────────────────
    all_clients = db.query(models.Client).filter(
        models.Client.company_id == cid,
        models.Client.is_active == True,
    ).all()

    client_stats = ClientStats(
        total=len(all_clients),
        individual=sum(1 for c in all_clients if c.client_type == models.ClientType.INDIVIDUAL),
        legal=sum(1 for c in all_clients if c.client_type == models.ClientType.LEGAL),
        high_risk=sum(1 for c in all_clients if c.risk_level == models.RiskLevel.HIGH),
        critical=sum(1 for c in all_clients if c.risk_level == models.RiskLevel.CRITICAL),
        pending=sum(1 for c in all_clients if c.onboarding_status == models.OnboardingStatus.PENDING),
    )

    risk_dist = RiskDistribution(
        low=sum(1 for c in all_clients if c.risk_level == models.RiskLevel.LOW),
        medium=sum(1 for c in all_clients if c.risk_level == models.RiskLevel.MEDIUM),
        high=sum(1 for c in all_clients if c.risk_level == models.RiskLevel.HIGH),
        critical=sum(1 for c in all_clients if c.risk_level == models.RiskLevel.CRITICAL),
        unknown=sum(1 for c in all_clients if c.risk_level is None),
    )

    client_map = {c.id: c for c in all_clients}

    # ── Документы ─────────────────────────────────────────────────────────────
    all_docs = db.query(models.ClientDocument).join(
        models.Client, models.ClientDocument.client_id == models.Client.id
    ).filter(
        models.Client.company_id == cid
    ).all()

    # Авто-обновление просроченных
    for doc in all_docs:
        if (doc.status == models.DocumentStatus.PRESENT
                and doc.expires_at and doc.expires_at < now):
            doc.status = models.DocumentStatus.EXPIRED

    def days_left(doc: models.ClientDocument) -> Optional[int]:
        if not doc.expires_at:
            return None
        return (doc.expires_at.date() - now.date()).days

    doc_stats = DocStats(
        expired=sum(1 for d in all_docs if d.status == models.DocumentStatus.EXPIRED),
        expiring_7=sum(1 for d in all_docs
                       if d.status == models.DocumentStatus.PRESENT
                       and days_left(d) is not None and 0 <= days_left(d) <= 7),
        expiring_30=sum(1 for d in all_docs
                        if d.status == models.DocumentStatus.PRESENT
                        and days_left(d) is not None and 0 <= days_left(d) <= 30),
        missing=sum(1 for d in all_docs if d.status == models.DocumentStatus.MISSING),
        requested=sum(1 for d in all_docs if d.status == models.DocumentStatus.REQUESTED),
        present=sum(1 for d in all_docs if d.status == models.DocumentStatus.PRESENT),
    )

    # Ближайшие истекающие (топ 7)
    expiring = sorted(
        [d for d in all_docs
         if d.status == models.DocumentStatus.PRESENT
         and days_left(d) is not None and days_left(d) <= 60],
        key=lambda d: days_left(d) or 9999
    )[:7]

    expiring_docs = []
    for doc in expiring:
        c = client_map.get(doc.client_id)
        if not c:
            continue
        dl = days_left(doc)
        expiring_docs.append(ExpiringDoc(
            client_id=doc.client_id,
            client_name=_client_name(c),
            document_type=doc.document_type,
            label=DOC_LABELS.get(doc.document_type, doc.document_type),
            expires_at=doc.expires_at,
            days_until_expiry=dl,
        ))

    # ── Транзакции ────────────────────────────────────────────────────────────
    all_txns = db.query(models.Transaction).filter(
        models.Transaction.company_id == cid
    ).all()

    txn_stats = TxnStats(
        total=len(all_txns),
        new=sum(1 for t in all_txns if t.status == models.TransactionStatus.NEW),
        reviewing=sum(1 for t in all_txns if t.status == models.TransactionStatus.REVIEWING),
        reported=sum(1 for t in all_txns if t.status == models.TransactionStatus.REPORTED),
        mandatory=sum(1 for t in all_txns if t.is_mandatory_control),
        suspicious=sum(1 for t in all_txns if (t.auto_indicators or t.manual_indicators)),
    )

    recent_suspicious = sorted(
        [t for t in all_txns
         if t.status in (models.TransactionStatus.NEW, models.TransactionStatus.REVIEWING)
         and (t.auto_indicators or t.manual_indicators or t.is_mandatory_control)],
        key=lambda t: t.operation_date, reverse=True
    )[:5]

    recent_txns = []
    for t in recent_suspicious:
        c = client_map.get(t.client_id) if t.client_id else None
        ind = list(dict.fromkeys((t.auto_indicators or []) + (t.manual_indicators or [])))
        recent_txns.append(RecentTxn(
            id=t.id,
            client_name=_client_name(c) if c else None,
            amount=t.amount,
            currency=t.currency,
            amount_kgs=t.amount_kgs,
            type_label=t.type_label,
            indicators_count=len(ind),
            risk_score=t.risk_score,
            status=t.status.value,
            operation_date=t.operation_date,
        ))

    # ── Санкционные проверки ─────────────────────────────────────────────────
    sanctions_qs = db.query(models.SanctionsCheck).filter(
        models.SanctionsCheck.company_id == cid
    ).order_by(models.SanctionsCheck.checked_at.desc())

    all_checks = sanctions_qs.all()
    last_check = all_checks[0].checked_at if all_checks else None

    sanctions_stats = SanctionsStats(
        total_checks=len(all_checks),
        matches=sum(1 for s in all_checks if s.result == "match"),
        possible_matches=sum(1 for s in all_checks if s.result == "possible_match"),
        last_check_at=last_check,
    )

    recent_sanctions = [
        RecentSanction(
            id=s.id,
            checked_name=s.checked_name,
            result=s.result,
            checked_at=s.checked_at,
            client_id=s.client_id,
        )
        for s in all_checks[:5]
        if s.result in ("match", "possible_match")
    ]

    # ── Алерты ───────────────────────────────────────────────────────────────
    alerts: List[AlertItem] = []

    if client_stats.critical > 0:
        alerts.append(AlertItem(
            level="critical", category="client",
            title="Клиенты с критическим риском",
            detail=f"{client_stats.critical} клиент(ов) требуют немедленного рассмотрения",
            link="/clients",
            count=client_stats.critical,
        ))

    if doc_stats.expired > 0:
        alerts.append(AlertItem(
            level="critical", category="document",
            title="Просроченные документы",
            detail=f"{doc_stats.expired} документ(ов) с истёкшим сроком действия",
            link="/documents",
            count=doc_stats.expired,
        ))

    if txn_stats.reviewing > 0:
        alerts.append(AlertItem(
            level="warning", category="transaction",
            title="Операции на проверке",
            detail=f"{txn_stats.reviewing} операций ожидают решения офицера",
            link="/transactions",
            count=txn_stats.reviewing,
        ))

    if txn_stats.new > 0 and txn_stats.suspicious > 0:
        alerts.append(AlertItem(
            level="warning", category="transaction",
            title="Новые подозрительные операции",
            detail=f"{txn_stats.new} новых операций с признаками ПОД/ФТ",
            link="/transactions",
            count=txn_stats.new,
        ))

    if doc_stats.expiring_7 > 0:
        alerts.append(AlertItem(
            level="warning", category="document",
            title="Документы истекают через 7 дней",
            detail=f"{doc_stats.expiring_7} документ(ов) истекают в течение недели",
            link="/documents",
            count=doc_stats.expiring_7,
        ))

    if sanctions_stats.matches > 0:
        alerts.append(AlertItem(
            level="critical", category="sanctions",
            title="Совпадения в санкционных списках",
            detail=f"{sanctions_stats.matches} совпадений выявлено при проверке",
            link="/sanctions",
            count=sanctions_stats.matches,
        ))

    if client_stats.pending > 0:
        alerts.append(AlertItem(
            level="info", category="client",
            title="Клиенты на онбординге",
            detail=f"{client_stats.pending} клиент(ов) ожидают завершения проверки",
            link="/clients",
            count=client_stats.pending,
        ))

    # Сортировка: critical → warning → info
    level_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: level_order.get(a.level, 3))

    return DashboardOut(
        clients=client_stats,
        documents=doc_stats,
        transactions=txn_stats,
        sanctions=sanctions_stats,
        risk_distribution=risk_dist,
        alerts=alerts,
        expiring_docs=expiring_docs,
        recent_transactions=recent_txns,
        recent_sanctions=recent_sanctions,
        generated_at=now,
    )
