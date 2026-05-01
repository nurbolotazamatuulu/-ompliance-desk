"""
Детектор подозрительных операций.
Коды видов операций: 10000–38099 (обязательный контроль)
Коды признаков СПО: 40001–40088
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

# ─── Справочники ─────────────────────────────────────────────────────────────

# Виды операций подлежащих обязательному контролю (10000–38099)
OPERATION_TYPES = [
    # Наличные
    {"code": "10100", "label": "Зачисление наличных денег на счёт"},
    {"code": "10200", "label": "Снятие наличных денег со счёта"},
    {"code": "10300", "label": "Внесение наличных для перевода без открытия счёта"},
    {"code": "10400", "label": "Выплата наличных по переводу без открытия счёта"},
    # Безналичные
    {"code": "20100", "label": "Безналичный перевод на счёт в другой организации"},
    {"code": "20200", "label": "Получение безналичного перевода из другой организации"},
    {"code": "20300", "label": "Трансграничный перевод (исходящий)"},
    {"code": "20400", "label": "Трансграничный перевод (входящий)"},
    # Обмен / конвертация
    {"code": "30100", "label": "Обмен иностранной валюты"},
    {"code": "30200", "label": "Конвертация в виртуальные активы (покупка)"},
    {"code": "30300", "label": "Конвертация из виртуальных активов (продажа)"},
    {"code": "30400", "label": "Обмен одного вида виртуальных активов на другой"},
    # Виртуальные активы
    {"code": "35100", "label": "Перевод виртуальных активов (исходящий)"},
    {"code": "35200", "label": "Получение виртуальных активов (входящий)"},
    {"code": "35300", "label": "Перевод виртуальных активов на сторонний кошелёк"},
    {"code": "35400", "label": "Вывод на unhosted wallet (самостоятельный кошелёк)"},
    # Прочие
    {"code": "38010", "label": "Операция с ценными бумагами"},
    {"code": "38020", "label": "Операция с недвижимостью"},
    {"code": "38030", "label": "Открытие/закрытие счёта / кошелька"},
    {"code": "38099", "label": "Иная операция подлежащая контролю"},
]

# Признаки подозрительных операций (40001–40088)
SUSPICIOUS_INDICATORS = [
    # Группа I — Общие признаки (40001–40009)
    {"code": "40001", "group": "Общие", "label": "Операция не имеет очевидного экономического смысла или законной цели"},
    {"code": "40002", "group": "Общие", "label": "Структурирование (дробление) — разбивка суммы на части ниже порога 600 000 сом"},
    {"code": "40003", "group": "Общие", "label": "Операция не соответствует деловому профилю, роду деятельности или доходам клиента"},
    {"code": "40004", "group": "Общие", "label": "Клиент отказывается предоставить документы или объяснить цель операции"},
    {"code": "40005", "group": "Общие", "label": "Использование посредников (третьих лиц) без очевидной деловой причины"},
    {"code": "40006", "group": "Общие", "label": "Признаки осведомлённости клиента о методах ПОД/ФТ (целенаправленное уклонение)"},
    # Группа II — Наличные операции (40011–40019)
    {"code": "40011", "group": "Наличные", "label": "Регулярное внесение / снятие крупных сумм наличными без видимой причины"},
    {"code": "40012", "group": "Наличные", "label": "Внесение наличных с немедленным переводом (layering через наличные)"},
    {"code": "40013", "group": "Наличные", "label": "Использование множества счетов для последующего объединения средств (smurfing)"},
    {"code": "40014", "group": "Наличные", "label": "Операции наличными в нетипичные часы или в необычно больших купюрах"},
    # Группа III — Переводы (40021–40029)
    {"code": "40021", "group": "Переводы", "label": "Перевод в/из страны из списка FATF grey/black или санкционной юрисдикции"},
    {"code": "40022", "group": "Переводы", "label": "Перевод без указания назначения или с расплывчатой формулировкой"},
    {"code": "40023", "group": "Переводы", "label": "Повторяющиеся переводы на одинаковые или близкие суммы (round-tripping)"},
    {"code": "40024", "group": "Переводы", "label": "Цепочка переводов через несколько банков / стран без деловой цели"},
    {"code": "40025", "group": "Переводы", "label": "Получение средств от неизвестных лиц с немедленным снятием/переводом"},
    # Группа IV — Виртуальные активы (40031–40039)
    {"code": "40031", "group": "Крипто", "label": "Конвертация крупной суммы в виртуальные активы без объяснения цели"},
    {"code": "40032", "group": "Крипто", "label": "Использование миксеров, Tornado Cash, privacy coins (XMR, ZEC) или анонимизаторов"},
    {"code": "40033", "group": "Крипто", "label": "Операции с адресами из санкционных списков (OFAC, EU) или darknet-площадок"},
    {"code": "40034", "group": "Крипто", "label": "Вывод на unhosted wallet сразу после зачисления (немедленное самохранение)"},
    {"code": "40035", "group": "Крипто", "label": "Использование DEX / DeFi для обхода KYC-процедур (CEX→DEX→new wallet)"},
    {"code": "40036", "group": "Крипто", "label": "Активность в «тонкие часы» (02:00–06:00 UTC+6) — паттерн обфускации"},
    # Группа V — Клиент (40041–40049)
    {"code": "40041", "group": "Клиент", "label": "Клиент проявляет нервозность, явно скрывает информацию об операции"},
    {"code": "40042", "group": "Клиент", "label": "Клиент предоставил документы с признаками подделки или несоответствий"},
    {"code": "40043", "group": "Клиент", "label": "Клиент отказывается идентифицировать конечного бенефициара (UBO)"},
    {"code": "40044", "group": "Клиент", "label": "Клиент является ПДЛ/ИПДЛ и совершает операции, выходящие за рамки публичной роли"},
    {"code": "40045", "group": "Клиент", "label": "Совпадение клиента с данными санкционных списков или информацией о ML/TF"},
    # Группа VI — Организации (40051–40059)
    {"code": "40051", "group": "Организация", "label": "Юрлицо зарегистрировано недавно, операции несопоставимы с уставной деятельностью"},
    {"code": "40052", "group": "Организация", "label": "Структура собственности намеренно усложнена, реальный бенефициар неизвестен"},
    {"code": "40053", "group": "Организация", "label": "Использование офшорных компаний или номинальных директоров без деловой цели"},
    {"code": "40054", "group": "Организация", "label": "Операции между аффилированными компаниями без реального экономического содержания"},
]

INDICATOR_MAP = {i["code"]: i for i in SUSPICIOUS_INDICATORS}
OP_TYPE_MAP   = {o["code"]: o["label"] for o in OPERATION_TYPES}

# Курсы к KGS (ориентировочные, для авто-флага порога)
RATES_TO_KGS = {"KGS": 1, "USD": 88, "EUR": 96, "RUB": 1.0, "USDT": 88, "BTC": 7_500_000}
MANDATORY_THRESHOLD_KGS = 600_000

# Crypto type codes — для автодетекции 40031/40034
CRYPTO_CODES = {"30200", "30300", "30400", "35100", "35200", "35300", "35400"}


# ─── Автодетектирование индикаторов ──────────────────────────────────────────

def auto_detect(amount_kgs: float, type_code: Optional[str], counterparty_country: Optional[str]) -> List[str]:
    indicators = []
    high_risk_countries = {
        "IR", "KP", "MM", "SY", "CU", "RU", "BY",   # санкции / FATF black
        "PK", "YE", "HT", "NI", "PA", "VU", "BB",   # FATF grey
    }
    # Структурирование: чуть ниже порога
    if 550_000 <= amount_kgs < 600_000:
        indicators.append("40002")
    # Крипто-операция → предварительный флаг
    if type_code and type_code in CRYPTO_CODES:
        indicators.append("40031")
    # Вывод на unhosted wallet
    if type_code in {"35300", "35400"}:
        indicators.append("40034")
    # Высокорисковая страна
    if counterparty_country and counterparty_country.upper() in high_risk_countries:
        indicators.append("40021")
    return list(dict.fromkeys(indicators))   # deduplicate, preserve order


def calc_risk_score(amount_kgs: float, is_mandatory: bool, indicators: List[str]) -> float:
    score = 0.0
    if is_mandatory:        score += 30
    score += min(len(indicators) * 12, 50)
    if amount_kgs >= 5_000_000: score += 20
    return min(round(score, 1), 100.0)


# ─── Схемы ────────────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    client_id:           Optional[int]   = None
    amount:              float
    currency:            str             = "KGS"

    from pydantic import field_validator
    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError('Сумма должна быть больше нуля')
        return v
    operation_date:      datetime
    type_code:           Optional[str]   = None
    description:         Optional[str]   = None
    counterparty_name:   Optional[str]   = None
    counterparty_account:Optional[str]   = None
    counterparty_bank:   Optional[str]   = None
    counterparty_country:Optional[str]   = None
    manual_indicators:   List[str]       = []
    notes:               Optional[str]   = None


class TransactionUpdate(BaseModel):
    status:            Optional[str]      = None
    manual_indicators: Optional[List[str]] = None
    notes:             Optional[str]      = None
    description:       Optional[str]      = None


class TransactionOut(BaseModel):
    id:                  int
    client_id:           Optional[int]
    client_name:         Optional[str]
    amount:              float
    currency:            str
    amount_kgs:          Optional[float]
    operation_date:      datetime
    type_code:           Optional[str]
    type_label:          Optional[str]
    description:         Optional[str]
    counterparty_name:   Optional[str]
    counterparty_account:Optional[str]
    counterparty_bank:   Optional[str]
    counterparty_country:Optional[str]
    is_mandatory_control:bool
    auto_indicators:     List[str]
    manual_indicators:   List[str]
    all_indicators:      List[str]
    risk_score:          Optional[float]
    status:              str
    notes:               Optional[str]
    created_at:          datetime

    model_config = {"from_attributes": True}


class StatsOut(BaseModel):
    total:            int
    new:              int
    mandatory:        int
    suspicious:       int
    reviewing:        int
    reported:         int
    dismissed:        int


# ─── Вспомогательные ─────────────────────────────────────────────────────────

def _client_name(client: Optional[models.Client]) -> Optional[str]:
    if not client:
        return None
    if client.client_type == models.ClientType.INDIVIDUAL and client.individual:
        ind = client.individual
        return " ".join(p for p in [ind.last_name, ind.first_name] if p)
    if client.legal_entity:
        return client.legal_entity.full_name or client.legal_entity.short_name
    return f"Клиент #{client.id}"


def _to_out(t: models.Transaction) -> TransactionOut:
    auto = t.auto_indicators or []
    manual = t.manual_indicators or []
    all_ind = list(dict.fromkeys(auto + manual))
    return TransactionOut(
        id=t.id,
        client_id=t.client_id,
        client_name=_client_name(t.client) if t.client_id else None,
        amount=t.amount,
        currency=t.currency,
        amount_kgs=t.amount_kgs,
        operation_date=t.operation_date,
        type_code=t.type_code,
        type_label=OP_TYPE_MAP.get(t.type_code, t.type_label) if t.type_code else None,
        description=t.description,
        counterparty_name=t.counterparty_name,
        counterparty_account=t.counterparty_account,
        counterparty_bank=t.counterparty_bank,
        counterparty_country=t.counterparty_country,
        is_mandatory_control=t.is_mandatory_control or False,
        auto_indicators=auto,
        manual_indicators=manual,
        all_indicators=all_ind,
        risk_score=t.risk_score,
        status=t.status.value if t.status else "new",
        notes=t.notes,
        created_at=t.created_at,
    )


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("/indicators")
def get_indicators():
    return SUSPICIOUS_INDICATORS


@router.get("/operation-types")
def get_operation_types():
    return OPERATION_TYPES


@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Transaction).filter(
        models.Transaction.company_id == current_user.company_id
    )
    all_txns = q.all()
    return StatsOut(
        total=len(all_txns),
        new=sum(1 for t in all_txns if t.status == models.TransactionStatus.NEW),
        mandatory=sum(1 for t in all_txns if t.is_mandatory_control),
        suspicious=sum(1 for t in all_txns if (t.auto_indicators or t.manual_indicators)),
        reviewing=sum(1 for t in all_txns if t.status == models.TransactionStatus.REVIEWING),
        reported=sum(1 for t in all_txns if t.status == models.TransactionStatus.REPORTED),
        dismissed=sum(1 for t in all_txns if t.status == models.TransactionStatus.DISMISSED),
    )


@router.get("", response_model=List[TransactionOut])
def list_transactions(
    status:    Optional[str] = Query(None),
    mandatory: Optional[bool] = Query(None),
    client_id: Optional[int] = Query(None),
    search:    Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Transaction).filter(
        models.Transaction.company_id == current_user.company_id
    )
    if status:
        q = q.filter(models.Transaction.status == status)
    if mandatory is not None:
        q = q.filter(models.Transaction.is_mandatory_control == mandatory)
    if client_id:
        q = q.filter(models.Transaction.client_id == client_id)
    txns = q.order_by(models.Transaction.operation_date.desc()).all()

    result = [_to_out(t) for t in txns]

    if search:
        sl = search.lower()
        result = [
            t for t in result
            if sl in (t.client_name or "").lower()
            or sl in (t.counterparty_name or "").lower()
            or sl in (t.description or "").lower()
            or sl in (t.type_code or "")
        ]
    return result


@router.post("", response_model=TransactionOut)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    amount_kgs = data.amount * RATES_TO_KGS.get(data.currency, 1)
    is_mandatory = amount_kgs >= MANDATORY_THRESHOLD_KGS
    auto_ind = auto_detect(amount_kgs, data.type_code, data.counterparty_country)
    all_ind = list(dict.fromkeys(auto_ind + data.manual_indicators))
    risk = calc_risk_score(amount_kgs, is_mandatory, all_ind)

    txn = models.Transaction(
        client_id=data.client_id,
        company_id=current_user.company_id,
        amount=data.amount,
        currency=data.currency,
        amount_kgs=round(amount_kgs, 2),
        operation_date=data.operation_date,
        type_code=data.type_code,
        type_label=OP_TYPE_MAP.get(data.type_code, "") if data.type_code else None,
        description=data.description,
        counterparty_name=data.counterparty_name,
        counterparty_account=data.counterparty_account,
        counterparty_bank=data.counterparty_bank,
        counterparty_country=data.counterparty_country,
        is_mandatory_control=is_mandatory,
        auto_indicators=auto_ind,
        manual_indicators=data.manual_indicators,
        risk_score=risk,
        status=models.TransactionStatus.NEW,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return _to_out(txn)


@router.put("/{txn_id}", response_model=TransactionOut)
def update_transaction(
    txn_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    txn = db.query(models.Transaction).filter(
        models.Transaction.id == txn_id,
        models.Transaction.company_id == current_user.company_id,
    ).first()
    if not txn:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Операция не найдена")

    if data.status is not None:
        txn.status = data.status
        if data.status in ("reported", "dismissed"):
            txn.reviewed_by = current_user.id
            txn.reviewed_at = datetime.utcnow()
    if data.manual_indicators is not None:
        txn.manual_indicators = data.manual_indicators
        all_ind = list(dict.fromkeys((txn.auto_indicators or []) + data.manual_indicators))
        txn.risk_score = calc_risk_score(txn.amount_kgs or 0, txn.is_mandatory_control, all_ind)
    if data.notes is not None:
        txn.notes = data.notes
    if data.description is not None:
        txn.description = data.description

    db.commit()
    db.refresh(txn)
    return _to_out(txn)


@router.delete("/{txn_id}")
def delete_transaction(
    txn_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    txn = db.query(models.Transaction).filter(
        models.Transaction.id == txn_id,
        models.Transaction.company_id == current_user.company_id,
    ).first()
    if not txn:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Операция не найдена")
    db.delete(txn)
    db.commit()
    return {"ok": True}
