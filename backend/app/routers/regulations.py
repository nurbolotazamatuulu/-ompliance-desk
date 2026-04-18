"""
Нормативная база — реестр НПА и внутренних документов.
Глобальные документы (is_global=True) видны всем тенантам.
Компания может добавлять собственные внутренние документы.
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/regulations", tags=["regulations"])


# ─── Начальный реестр глобальных документов ──────────────────────────────────

SEED_DOCUMENTS = [
    # Законы КР
    {
        "category": "law",
        "title": "Закон Кыргызской Республики «О противодействии финансированию террористической деятельности и легализации (отмыванию) доходов, полученных преступным путём»",
        "short_title": "Закон КР о ПОД/ФТ",
        "number": "Закон КР",
        "issued_by": "Жогорку Кенеш Кыргызской Республики",
        "issued_at": "2006-08-30",
        "effective_from": "2006-08-30",
        "status": "active",
        "description": "Основной закон в сфере ПОД/ФТ. Устанавливает обязанности субъектов финансового мониторинга, порог обязательного контроля (600 000 сом), требования к идентификации клиентов и отчётности перед ГСФР.",
        "tags": ["ПОД/ФТ", "обязательный контроль", "600000", "идентификация"],
        "external_url": "https://cbd.minjust.gov.kg/act/view/ru-ru/1321",
    },
    {
        "category": "law",
        "title": "Закон Кыргызской Республики «О виртуальных активах»",
        "short_title": "Закон КР о виртуальных активах",
        "number": "Закон КР № 189",
        "issued_by": "Жогорку Кенеш Кыргызской Республики",
        "issued_at": "2023-10-10",
        "effective_from": "2024-01-01",
        "status": "active",
        "description": "Регулирует деятельность операторов и провайдеров услуг виртуальных активов (ПУВА/VASP). Устанавливает лицензирование, требования к AML/KYC для участников рынка ВА.",
        "tags": ["VASP", "ПУВА", "виртуальные активы", "лицензирование"],
        "external_url": "https://cbd.minjust.gov.kg",
    },
    # Постановления Правительства КР
    {
        "category": "decree",
        "title": "Постановление Правительства Кыргызской Республики № 606 «Об утверждении Положения о надлежащей проверке клиентов»",
        "short_title": "Постановление КР № 606 (НПК)",
        "number": "№ 606",
        "issued_by": "Правительство Кыргызской Республики",
        "issued_at": "2021-11-09",
        "effective_from": "2021-11-09",
        "status": "active",
        "description": "Положение о надлежащей проверке клиентов (НПК). Определяет стандарты KYC для физических и юридических лиц, состав анкеты клиента (Приложения 1 и 2), требования к верификации и обновлению данных.",
        "tags": ["НПК", "KYC", "анкета клиента", "физлица", "юрлица", "ПДЛ", "УБО"],
        "external_url": "https://cbd.minjust.gov.kg",
    },
    # Приказы ГСФР
    {
        "category": "order",
        "title": "Приказ Государственной службы финансовой разведки при Правительстве КР № 61/п «Об утверждении Методики оценки рисков ОД/ФТ»",
        "short_title": "Приказ ГСФР № 61/п (Риск-скоринг)",
        "number": "№ 61/п",
        "issued_by": "ГСФР при Правительстве Кыргызской Республики",
        "issued_at": "2022-03-15",
        "effective_from": "2022-03-15",
        "status": "active",
        "description": "Методика риск-скоринга для операторов виртуальных активов. Определяет три блока факторов (клиент, продукт/услуга, страна), весовые коэффициенты, пороги зон риска LOW/MEDIUM/HIGH/CRITICAL и автоматические override-триггеры.",
        "tags": ["риск-скоринг", "61/п", "VASP", "факторы риска", "override"],
        "external_url": "https://gsfr.gov.kg",
    },
    {
        "category": "order",
        "title": "Приказ ГСФР «Об утверждении перечня признаков подозрительных операций»",
        "short_title": "Приказ ГСФР — Признаки СПО (40001–40088)",
        "number": "Приказ ГСФР",
        "issued_by": "ГСФР при Правительстве Кыргызской Республики",
        "issued_at": "2020-01-01",
        "effective_from": "2020-01-01",
        "status": "active",
        "description": "Перечень признаков подозрительных операций (коды 40001–40088) и видов операций обязательного контроля (10000–38099). Основа для автоматического детектора в модуле транзакций.",
        "tags": ["СПО", "признаки", "40001", "40088", "обязательный контроль"],
        "external_url": "https://gsfr.gov.kg",
    },
    {
        "category": "instruction",
        "title": "Положение ГСФР «О требованиях к внутреннему контролю субъектов финансового мониторинга»",
        "short_title": "Положение ГСФР — Внутренний контроль",
        "number": "Положение ГСФР",
        "issued_by": "ГСФР при Правительстве Кыргызской Республики",
        "issued_at": "2019-06-01",
        "effective_from": "2019-06-01",
        "status": "active",
        "description": "Требования к организации системы внутреннего контроля: назначение ответственного сотрудника, программа ПОД/ФТ, обучение персонала, ведение документации, хранение записей не менее 5 лет.",
        "tags": ["внутренний контроль", "программа ПОД/ФТ", "ответственный сотрудник"],
        "external_url": "https://gsfr.gov.kg",
    },
    # Международные стандарты / Рекомендации FATF
    {
        "category": "guideline",
        "title": "Рекомендации ФАТФ (FATF Recommendations 2012, обновлены 2023)",
        "short_title": "Рекомендации FATF 40",
        "number": "40 Рекомендаций",
        "issued_by": "Financial Action Task Force (FATF)",
        "issued_at": "2012-02-16",
        "effective_from": "2012-02-16",
        "status": "active",
        "description": "40 рекомендаций FATF — международный стандарт ПОД/ФТ. Rec. 10: KYC/CDD. Rec. 15: новые технологии и VASP. Rec. 16: wire transfers (Travel Rule). Основа для национального законодательства КР.",
        "tags": ["FATF", "40 рекомендаций", "CDD", "Travel Rule", "VASP", "Rec.15"],
        "external_url": "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html",
    },
    {
        "category": "guideline",
        "title": "Руководство FATF по виртуальным активам и поставщикам услуг виртуальных активов (Updated Guidance for a Risk-Based Approach to Virtual Assets and VASPs)",
        "short_title": "FATF Guidance for VASPs (2021)",
        "number": "FATF Guidance 2021",
        "issued_by": "Financial Action Task Force (FATF)",
        "issued_at": "2021-10-28",
        "effective_from": "2021-10-28",
        "status": "active",
        "description": "Обновлённое руководство FATF по риск-ориентированному подходу для VASP. Охватывает Travel Rule, unhosted wallets, DeFi/DEX, NFT, P2P-транзакции. Определяет критерии для идентификации VASP и требования AML.",
        "tags": ["FATF", "VASP", "Travel Rule", "unhosted wallet", "DeFi", "риск-подход"],
        "external_url": "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html",
    },
    {
        "category": "guideline",
        "title": "Конвенция ООН против коррупции (UNCAC)",
        "short_title": "UNCAC 2003",
        "number": "A/RES/58/4",
        "issued_by": "Организация Объединённых Наций",
        "issued_at": "2003-10-31",
        "effective_from": "2005-12-14",
        "status": "active",
        "description": "Основополагающий международный инструмент в области ПДЛ. Статья 52: усиленная проверка ПДЛ. Применяется при идентификации PEP-клиентов (Politically Exposed Persons).",
        "tags": ["UNCAC", "ПДЛ", "PEP", "коррупция"],
        "external_url": "https://www.unodc.org/unodc/en/corruption/uncac.html",
    },
    {
        "category": "guideline",
        "title": "Вольфсбергские принципы по борьбе с отмыванием денег в частном банкинге",
        "short_title": "Вольфсбергские принципы (Wolfsberg AML Principles)",
        "number": "Wolfsberg Group",
        "issued_by": "Wolfsberg Group",
        "issued_at": "2012-05-01",
        "effective_from": "2012-05-01",
        "status": "active",
        "description": "Добровольные стандарты 13 крупнейших мировых банков. Принципы по KYC, EDD для ПДЛ, мониторингу транзакций, correspondent banking. Применяется как best practice при работе с VASP-контрагентами.",
        "tags": ["Wolfsberg", "EDD", "ПДЛ", "correspondent banking", "best practice"],
        "external_url": "https://www.wolfsberg-principles.com",
    },
]


def _ensure_seed(db: Session):
    """Заполняет глобальные документы если таблица пустая."""
    count = db.query(models.RegulatoryDocument).filter(
        models.RegulatoryDocument.is_global == True
    ).count()
    if count > 0:
        return
    for d in SEED_DOCUMENTS:
        doc = models.RegulatoryDocument(
            is_global=True,
            company_id=None,
            category=d["category"],
            title=d["title"],
            short_title=d.get("short_title"),
            number=d.get("number"),
            issued_by=d.get("issued_by"),
            issued_at=datetime.fromisoformat(d["issued_at"]) if d.get("issued_at") else None,
            effective_from=datetime.fromisoformat(d["effective_from"]) if d.get("effective_from") else None,
            status=d.get("status", "active"),
            description=d.get("description"),
            external_url=d.get("external_url"),
            tags=d.get("tags", []),
        )
        db.add(doc)
    db.commit()


# ─── Схемы ────────────────────────────────────────────────────────────────────

class RegDocOut(BaseModel):
    id: int
    category: str
    title: str
    short_title: Optional[str]
    number: Optional[str]
    issued_by: Optional[str]
    issued_at: Optional[datetime]
    effective_from: Optional[datetime]
    effective_to: Optional[datetime]
    status: str
    description: Optional[str]
    external_url: Optional[str]
    notes: Optional[str]
    tags: List[str]
    is_global: bool
    company_id: Optional[int]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class RegDocCreate(BaseModel):
    category: str
    title: str
    short_title: Optional[str] = None
    number: Optional[str] = None
    issued_by: Optional[str] = None
    issued_at: Optional[datetime] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    status: str = "active"
    description: Optional[str] = None
    external_url: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []


class RegDocUpdate(BaseModel):
    title: Optional[str] = None
    short_title: Optional[str] = None
    number: Optional[str] = None
    issued_by: Optional[str] = None
    issued_at: Optional[datetime] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None
    status: Optional[str] = None
    description: Optional[str] = None
    external_url: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[RegDocOut])
def list_regulations(
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _ensure_seed(db)
    q = db.query(models.RegulatoryDocument).filter(
        or_(
            models.RegulatoryDocument.is_global == True,
            models.RegulatoryDocument.company_id == current_user.company_id,
        )
    )
    if category:
        q = q.filter(models.RegulatoryDocument.category == category)
    if status:
        q = q.filter(models.RegulatoryDocument.status == status)
    docs = q.order_by(
        models.RegulatoryDocument.is_global.desc(),
        models.RegulatoryDocument.issued_at.desc().nullslast(),
    ).all()
    if search:
        sl = search.lower()
        docs = [d for d in docs if
                sl in (d.title or "").lower()
                or sl in (d.short_title or "").lower()
                or sl in (d.description or "").lower()
                or sl in (d.number or "").lower()
                or any(sl in t.lower() for t in (d.tags or []))]
    return docs


@router.post("", response_model=RegDocOut)
def create_regulation(
    data: RegDocCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = models.RegulatoryDocument(
        company_id=current_user.company_id,
        is_global=False,
        **data.model_dump(),
        created_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.put("/{doc_id}", response_model=RegDocOut)
def update_regulation(
    doc_id: int,
    data: RegDocUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.RegulatoryDocument).filter(
        models.RegulatoryDocument.id == doc_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    # Глобальные документы могут редактировать только компании (добавлять notes)
    for k, v in data.model_dump(exclude_none=True).items():
        if doc.is_global and k not in ("notes", "tags"):
            continue  # Разрешаем менять только notes для глобальных
        setattr(doc, k, v)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{doc_id}")
def delete_regulation(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.RegulatoryDocument).filter(
        models.RegulatoryDocument.id == doc_id,
        models.RegulatoryDocument.company_id == current_user.company_id,
        models.RegulatoryDocument.is_global == False,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден или нельзя удалить")
    db.delete(doc)
    db.commit()
    return {"ok": True}
