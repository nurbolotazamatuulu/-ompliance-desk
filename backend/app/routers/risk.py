"""
Риск-скоринг. Комбинированная модель:
  - Все клиенты:           Приказ ГСФР 61/п (факторы клиента / продукта / страны)
  - Юрлица / VASP:  +     4-блочная модель A+B+C+D из PDF ГСФР
  - Итог (юрлица):         max(score_61p, score_vasp)   — консервативный подход
  - Итог (физлица):        score_61p
"""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/risk", tags=["risk-scoring"])


# ─── Модель 1: Приказ ГСФР 61/п ──────────────────────────────────────────────
# Применяется КО ВСЕМ клиентам как базовая оценка.

CRITERIA_61P = {
    "client": {
        "label": "Факторы клиента",
        "high": [
            {"id": "H_C_01", "text": "Клиент является ИПДС (иностранное публичное должностное лицо) или членом его семьи", "weight": 3},
            {"id": "H_C_02", "text": "Клиент является ПДЛ (публичное должностное лицо КР) или связанным с ним лицом", "weight": 2},
            {"id": "H_C_03", "text": "Нерезидент из высокорисковой юрисдикции (FATF grey/black list, санкционная страна)", "weight": 3},
            {"id": "H_C_04", "text": "Клиент уклоняется от идентификации или отказывается предоставлять документы", "weight": 3},
            {"id": "H_C_05", "text": "Источник средств/имущества неизвестен или документально не подтверждён", "weight": 2},
            {"id": "H_C_06", "text": "Непрозрачная структура владения: номинальные директора, офшорные trustee, неизвестный UBO", "weight": 2},
            {"id": "H_C_07", "text": "Совпадение с санкционными списками (ГСФР КР, ООН, OFAC, ЕС, Великобритания) [OVERRIDE]", "weight": 4, "override": True},
            {"id": "H_C_08", "text": "Ранее выявленные нарушения AML/KYC или подозрительные операции у данного клиента", "weight": 3},
            {"id": "H_C_09", "text": "Новый клиент без деловой истории (менее 3 месяцев отношений)", "weight": 1},
        ],
        "low": [
            {"id": "L_C_01", "text": "Долгосрочный клиент (более 3 лет, без выявленных нарушений)", "weight": 2},
            {"id": "L_C_02", "text": "Полностью подтверждён источник средств (выписки из банка, налоговые документы, контракты)", "weight": 2},
            {"id": "L_C_03", "text": "Государственный служащий КР на верифицированной должности (не ПДЛ)", "weight": 1},
            {"id": "L_C_04", "text": "Резидент КР с постоянным местом жительства (верифицированный адрес)", "weight": 1},
        ],
    },
    "product": {
        "label": "Продукты, операции и услуги",
        "high": [
            {"id": "H_P_01", "text": "Операции с наличными денежными средствами свыше 100 000 сом", "weight": 2},
            {"id": "H_P_02", "text": "Анонимные или псевдоанонимные транзакции без возможности идентификации", "weight": 3},
            {"id": "H_P_03", "text": "Операции с виртуальными активами (криптовалюта, токены, NFT)", "weight": 2},
            {"id": "H_P_04", "text": "Трансграничные переводы в страны FATF grey/black list или офшорные юрисдикции", "weight": 2},
            {"id": "H_P_05", "text": "Нестандартные/нетипичные операции без очевидной экономической цели", "weight": 2},
            {"id": "H_P_06", "text": "Дистанционное обслуживание без личного визита и видеоверификации", "weight": 1},
        ],
        "low": [
            {"id": "L_P_01", "text": "Стандартные платёжные операции (выплата зарплаты, пенсии, коммунальные платежи)", "weight": 2},
            {"id": "L_P_02", "text": "Операции исключительно на малые суммы (не превышают 50 000 сом за операцию)", "weight": 1},
            {"id": "L_P_03", "text": "Все операции проводятся только через лицензированные финансовые институты КР", "weight": 1},
        ],
    },
    "country": {
        "label": "Страновые и географические факторы",
        "high": [
            {"id": "H_G_01", "text": "Страна регистрации / гражданство из списка FATF grey list (усиленный мониторинг)", "weight": 2},
            {"id": "H_G_02", "text": "Страна регистрации / гражданство FATF black list (Иран, КНДР, Мьянма) или санкционная страна [OVERRIDE]", "weight": 4, "override": True},
            {"id": "H_G_03", "text": "Использование офшорных юрисдикций (BVI, Каймановы о-ва, Сейшелы, Панама)", "weight": 2},
            {"id": "H_G_04", "text": "Частая смена юрисдикций или многочисленные трансграничные операции", "weight": 1},
        ],
        "low": [
            {"id": "L_G_01", "text": "Операции исключительно внутри ЕАЭС (КР, Россия, Казахстан, Беларусь, Армения)", "weight": 2},
            {"id": "L_G_02", "text": "Гражданство / регистрация в юрисдикции с полным соответствием FATF (ЕС, США, Сингапур, Великобритания)", "weight": 1},
        ],
    },
}

# Максимально возможный «опасный» net для нормализации:
# max_high = 3+2+3+3+2+2+4+3+1 + 2+3+2+2+2+1 + 2+4+2+1 = 44
# Берём ~22 как «насыщение» (верхняя практическая граница)
_61P_NET_SATURATION = 22.0

_61P_ALL_HIGH = {c["id"]: c for cat in CRITERIA_61P.values() for c in cat["high"]}
_61P_ALL_LOW  = {c["id"]: c for cat in CRITERIA_61P.values() for c in cat["low"]}


def compute_risk_61p(high_selected: list, low_selected: list) -> dict:
    high_score = sum(_61P_ALL_HIGH[i]["weight"] for i in high_selected if i in _61P_ALL_HIGH)
    low_score  = sum(_61P_ALL_LOW[i]["weight"]  for i in low_selected  if i in _61P_ALL_LOW)
    net = high_score - low_score * 0.5

    active_overrides = [i for i in high_selected if _61P_ALL_HIGH.get(i, {}).get("override")]

    if active_overrides:
        r_norm = 100.0
    elif net <= 0:
        r_norm = 0.0
    else:
        r_norm = round(min(net / _61P_NET_SATURATION * 100, 100), 1)

    if r_norm <= 25:
        level = models.RiskLevel.LOW
    elif r_norm <= 50:
        level = models.RiskLevel.MEDIUM
    elif r_norm <= 75:
        level = models.RiskLevel.HIGH
    else:
        level = models.RiskLevel.CRITICAL

    return {
        "score_61p": r_norm,
        "level_61p": level,
        "override_61p": bool(active_overrides),
        "override_reasons_61p": active_overrides,
    }


# ─── Модель 2: 4-блочная VASP / PDF ГСФР ────────────────────────────────────
# Применяется ДОПОЛНИТЕЛЬНО для юридических лиц и VASP.

CRITERIA_VASP = {
    "A": [
        {
            "id": "A1", "label": "Юрисдикция регистрации", "max": 25,
            "options": [
                {"label": "Регулируемая юрисдикция (FATF member, полный AML/CFT) — США, ЕС, Сингапур", "value": 0},
                {"label": "Юрисдикция с базовым регулированием (частичное FATF) — КР, Казахстан, ОАЭ", "value": 10},
                {"label": "Офшорная юрисдикция (низкие требования KYC) — Сейшелы, BVI, Кайманы", "value": 20},
                {"label": "Высокорисковая юрисдикция (FATF grey/black, санкции) — Иран, КНДР, Myanmar", "value": 25},
            ],
        },
        {
            "id": "A2", "label": "Наличие лицензии", "max": 25,
            "options": [
                {"label": "Полная лицензия VASP от центрального регулятора — Финнадзор КР, MAS, BaFin", "value": 0},
                {"label": "Регистрация без лицензии (MSB, simplified regime) — FinCEN USA", "value": 10},
                {"label": "Временная лицензия / в процессе получения (>6 месяцев)", "value": 15},
                {"label": "Отсутствие лицензии — работа вне правового поля", "value": 25},
                {"label": "Отозванная лицензия — критическое нарушение [OVERRIDE]", "value": 25, "override": "A2.5"},
            ],
        },
        {
            "id": "A3", "label": "UBO (Ultimate Beneficial Owner)", "max": 25,
            "options": [
                {"label": "Полная идентификация UBO (документы, верификация, публичная информация)", "value": 0},
                {"label": "Частичная идентификация (известны промежуточные владельцы)", "value": 10},
                {"label": "Номинальные владельцы (nominees, офшорные trustee)", "value": 17},
                {"label": "Неизвестный UBO (отказ от раскрытия, shell companies)", "value": 25},
            ],
            "addon_pep": True,
        },
        {
            "id": "A4", "label": "Репутация", "max": 25,
            "options": [
                {"label": "Положительная репутация (аудиты Big4, >5 лет работы, нет нарушений)", "value": 0},
                {"label": "Нейтральная (новый участник <2 лет, нет негативных записей)", "value": 6},
                {"label": "Негативные упоминания (СМИ, жалобы, предупреждения регулятора)", "value": 15},
                {"label": "История нарушений (скам, банкротство, AML-нарушения) — FTX, BitMEX", "value": 22},
                {"label": "Связь с криминалом (расследования ML/TF) — BTC-e, Liberty Reserve [OVERRIDE]", "value": 25, "override": "A4.5"},
            ],
        },
    ],
    "B": [
        {
            "id": "B1", "label": "Тип виртуальных активов", "max": 30,
            "options": [
                {"label": "Регулируемые криптовалюты (BTC, ETH, major cap coins)", "value": 3},
                {"label": "Стейблкоины с proof-of-reserves (USDC, USDT)", "value": 6},
                {"label": "Альткоины / токены / DeFi / NFT-платформы", "value": 12},
                {"label": "Privacy coins (Monero XMR, Zcash ZEC, Dash) — обфускация транзакций", "value": 28},
                {"label": "Неидентифицированные токены (unknown, новые проекты) — риск scam/rug pulls", "value": 28},
            ],
        },
        {
            "id": "B2", "label": "Происхождение средств (SoF/SoW)", "max": 35,
            "options": [
                {"label": "Полная документация SoF+SoW (банковские выписки, tax returns, бизнес-документы)", "value": 0},
                {"label": "Частичная документация SoF (подтверждение источника конкретной транзакции)", "value": 10},
                {"label": "Декларируемый источник без подтверждения (self-declaration)", "value": 20},
                {"label": "Отказ от предоставления SoF/SoW — red flag для ML", "value": 32},
                {"label": "Несоответствие SoF профилю клиента (заявленный доход ≠ объём операций) [OVERRIDE]", "value": 35, "override": "B2.5"},
            ],
        },
        {
            "id": "B3", "label": "Использование миксеров / Tumblers / Мостов", "max": 35,
            "options": [
                {"label": "Не использует миксеры (чистая on-chain история)", "value": 0},
                {"label": "Единичное взаимодействие >2 hops (distant connection к миксеру)", "value": 12},
                {"label": "Регулярное использование миксеров (Tornado Cash, ChipMixer, Wasabi)", "value": 32},
                {"label": "Прямая связь ≤1 hop с миксером (direct send/receive) [OVERRIDE]", "value": 35, "override": "B3.4"},
            ],
        },
        {
            "id": "B4", "label": "Использование DEX (Decentralized Exchanges)", "max": 20,
            "options": [
                {"label": "Не использует DEX — только CEX с KYC на всех этапах", "value": 0},
                {"label": "Регулируемые DEX с KYC (dYdX, некоторые hybrid exchanges)", "value": 5},
                {"label": "Популярные DEX без KYC (Uniswap, PancakeSwap для известных токенов)", "value": 11},
                {"label": "Обход CEX через DEX (паттерн: CEX → DEX → new wallet → CEX)", "value": 19},
                {"label": "High-risk DEX pools (связь с санкционными пулами, darknet liquidity) [OVERRIDE]", "value": 20, "override": "B4.5"},
            ],
        },
    ],
    "C": [
        {
            "id": "C1", "label": "Объёмы транзакций", "max": 20,
            "options": [
                {"label": "Соответствие профилю клиента (объёмы в рамках declared income/business)", "value": 1},
                {"label": "Превышение профиля в 2–5 раз (требует объяснения)", "value": 10},
                {"label": "Существенное превышение >5x профиля (Suspicious Activity)", "value": 17},
                {"label": "Структурирование (Smurfing) — множество малых транзакций <$10k", "value": 19},
            ],
        },
        {
            "id": "C2", "label": "Частота транзакций", "max": 20,
            "options": [
                {"label": "Низкая частота (<10 транзакций/месяц) — retail user", "value": 1},
                {"label": "Средняя частота (10–100 транзакций/месяц) — active trader", "value": 5},
                {"label": "Высокая частота (100–1000/месяц) — professional trader / бизнес", "value": 11},
                {"label": "Массовые транзакции >1000/месяц, automated — layering индикатор", "value": 16},
                {"label": "Thin Hours pattern (концентрация 02:00–06:00 UTC+6) — обфускация", "value": 20},
            ],
        },
        {
            "id": "C3", "label": "География операций", "max": 25,
            "options": [
                {"label": "Одна низкорисковая юрисдикция (все транзакции в регулируемой стране)", "value": 1},
                {"label": "Несколько регулируемых стран (EU, USA, Singapore)", "value": 6},
                {"label": "Офшорные юрисдикции (Cayman, BVI, Seychelles) — tax havens", "value": 16},
                {"label": "Высокорисковые страны (FATF grey/black, санкции) — Иран, Myanmar, Syria", "value": 23},
                {"label": "Частая смена географии (rapid jurisdiction hopping) — обход регулирования", "value": 25},
            ],
        },
        {
            "id": "C4", "label": "Контрагенты", "max": 20,
            "options": [
                {"label": "Верифицированные контрагенты (KYC-прошедшие на известных CEX)", "value": 1},
                {"label": "Частично идентифицированные (некоторые unhosted wallets, P2P элементы)", "value": 9},
                {"label": "Преимущественно unhosted wallets (>70% транзакций с self-custody)", "value": 16},
                {"label": "Связь с санкционными адресами (2–3 hops от OFAC/EU lists)", "value": 19},
                {"label": "Прямая связь с санкционными адресами ≤1 hop [OVERRIDE]", "value": 20, "override": "C4.5"},
            ],
        },
        {
            "id": "C5", "label": "Пулы ликвидности", "max": 15,
            "options": [
                {"label": "Не использует пулы (только direct peer-to-peer)", "value": 0},
                {"label": "Легитимные Liquidity Pools (Uniswap, Curve с известными токенами)", "value": 4},
                {"label": "Unaudited pools (новые/неизвестные протоколы) — риск exploit", "value": 11},
                {"label": "High-Risk Pools (fraud/darknet/ransomware) — критический маркер [OVERRIDE]", "value": 15, "override": "C5.4"},
            ],
        },
    ],
    "D": [
        {
            "id": "D1", "label": "Политики AML/KYC", "max": 30,
            "options": [
                {"label": "Полная программа AML/KYC (written policies, MLRO назначен, обучение персонала)", "value": 1},
                {"label": "Базовые процедуры KYC (идентификация клиентов без EDD)", "value": 10},
                {"label": "Частичное KYC (некоторые клиенты не верифицированы) — regulatory gap", "value": 20},
                {"label": "Отсутствие формальных политик (no documented procedures) — noncompliance", "value": 27},
                {"label": "Обход KYC (намеренное игнорирование требований) — facilitating ML/TF [OVERRIDE]", "value": 30, "override": "D1.5"},
            ],
        },
        {
            "id": "D2", "label": "Учёт клиентских средств", "max": 25,
            "options": [
                {"label": "Полная сегрегация средств (раздельный учёт, ежедневная сверка) — MiCA standard", "value": 0},
                {"label": "Частичная сегрегация (mixed custody, периодическая сверка) — риск commingling", "value": 12},
                {"label": "Отсутствие раздельного учёта (client funds не разделены) — высокий риск потери", "value": 22},
                {"label": "Нет учёта вообще (no records of client balances) — critical violation [OVERRIDE]", "value": 25, "override": "D2.4"},
            ],
        },
        {
            "id": "D3", "label": "Отчётность регулятору", "max": 25,
            "options": [
                {"label": "Проактивная отчётность (ежемесячно, SAR filing, audit cooperation)", "value": 1},
                {"label": "Регулярная отчётность по требованию (quarterly reports)", "value": 6},
                {"label": "Нерегулярная отчётность (задержки, неполные данные) — compliance weakness", "value": 16},
                {"label": "Отсутствие отчётности (нет отчётов в ГСФР/регулятор) — serious violation", "value": 23},
                {"label": "Отказ от сотрудничества с регулятором (non-cooperation) — obstruction [OVERRIDE]", "value": 25, "override": "D3.5"},
            ],
        },
        {
            "id": "D4", "label": "Реакция на запросы", "max": 20,
            "options": [
                {"label": "Быстрая реакция (<24 часа, полная информация) — excellent cooperation", "value": 1},
                {"label": "Стандартная реакция (1–3 дня, адекватная информация)", "value": 6},
                {"label": "Медленная реакция (>5 дней, неполная информация) — poor cooperation", "value": 13},
                {"label": "Игнорирование запросов / отказ — non-cooperation", "value": 19},
            ],
        },
    ],
}

BLOCK_MAX = {"A": 25.0, "B": 30.0, "C": 20.0, "D": 25.0}
R_MAX = sum(BLOCK_MAX.values()) / 4  # = 25.0
A3_PEP_BONUS = 10

VASP_OVERRIDE_LABELS = {
    "A2.5": "Отозванная лицензия",
    "A4.5": "Связь с криминалом (расследования ML/TF)",
    "B2.5": "Несоответствие SoF профилю клиента",
    "B3.4": "Прямая связь ≤1 hop с миксером/Tumbler",
    "B4.5": "High-risk DEX pools (санкции/darknet)",
    "C4.5": "Прямая связь ≤1 hop с санкционным адресом",
    "C5.4": "High-risk пулы ликвидности (fraud/darknet)",
    "D1.5": "Намеренный обход KYC/AML",
    "D2.4": "Полное отсутствие учёта клиентских средств",
    "D3.5": "Отказ от сотрудничества с регулятором",
}


def compute_risk_vasp(scores: dict) -> dict:
    a3_max = CRITERIA_VASP["A"][2]["max"]

    def avg(ids: list) -> float:
        vals = []
        for cid in ids:
            v = scores.get(cid, 0)
            if cid == "A3" and scores.get("A3_pep"):
                v = min(v + A3_PEP_BONUS, a3_max)
            vals.append(v)
        return sum(vals) / len(vals)

    a_avg = avg(["A1", "A2", "A3", "A4"])
    b_avg = avg(["B1", "B2", "B3", "B4"])
    c_avg = avg(["C1", "C2", "C3", "C4", "C5"])
    d_avg = avg(["D1", "D2", "D3", "D4"])

    r_raw = (a_avg + b_avg + c_avg + d_avg) / 4
    r_norm = round(min(r_raw / R_MAX * 100, 100), 1)

    active_overrides = []
    for block_criteria in CRITERIA_VASP.values():
        for c in block_criteria:
            selected = scores.get(c["id"], 0)
            for opt in c["options"]:
                if opt["value"] == selected and "override" in opt:
                    ov = opt["override"]
                    if ov not in active_overrides:
                        active_overrides.append(ov)

    if active_overrides:
        r_norm = 100.0

    return {
        "block_a": round(min(a_avg / BLOCK_MAX["A"] * 100, 100), 1),
        "block_b": round(min(b_avg / BLOCK_MAX["B"] * 100, 100), 1),
        "block_c": round(min(c_avg / BLOCK_MAX["C"] * 100, 100), 1),
        "block_d": round(min(d_avg / BLOCK_MAX["D"] * 100, 100), 1),
        "score_vasp": r_norm,
        "override_applied": bool(active_overrides),
        "override_reasons": [f"{k}: {VASP_OVERRIDE_LABELS.get(k, k)}" for k in active_overrides],
    }


# ─── Комбинирование ───────────────────────────────────────────────────────────

def combine_results(r61p: dict, r_vasp: Optional[dict]) -> tuple:
    """Возвращает (final_score, risk_level, override_applied, all_overrides)."""
    score_61p = r61p["score_61p"]
    override_61p = r61p["override_61p"]
    reasons_61p = [f"61/п:{i}" for i in r61p["override_reasons_61p"]]

    if r_vasp is None:
        # Физлицо — только 61/п
        final = score_61p
        override = override_61p
        reasons = reasons_61p
    else:
        score_vasp = r_vasp["score_vasp"]
        override_vasp = r_vasp["override_applied"]
        reasons_vasp = r_vasp["override_reasons"]
        final = max(score_61p, score_vasp)
        override = override_61p or override_vasp
        reasons = reasons_61p + reasons_vasp

    if override:
        final = 100.0

    if final <= 25:
        level = models.RiskLevel.LOW
    elif final <= 50:
        level = models.RiskLevel.MEDIUM
    elif final <= 75:
        level = models.RiskLevel.HIGH
    else:
        level = models.RiskLevel.CRITICAL

    return round(final, 1), level, override, reasons


# ─── Схемы ────────────────────────────────────────────────────────────────────

class ScoreInput(BaseModel):
    # 61/п — базовая оценка (все клиенты)
    high_selected: List[str] = []
    low_selected: List[str] = []
    # VASP 4-блочная — расширенная оценка (только юрлица / VASP)
    scores: dict = {}
    a3_pep: bool = False


class ScoreState(BaseModel):
    # 61/п
    high_selected: List[str]
    low_selected: List[str]
    score_61p: Optional[float]
    level_61p: Optional[str]
    override_61p: bool
    override_reasons_61p: List[str]
    # VASP 4-блочная
    scores: dict
    a3_pep: bool
    block_a: Optional[float]
    block_b: Optional[float]
    block_c: Optional[float]
    block_d: Optional[float]
    score_vasp: Optional[float]
    # Итог
    final_score: Optional[float]
    risk_level: Optional[str]
    override_applied: bool
    override_reasons: List[str]
    scored_at: Optional[datetime]


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("/criteria")
def get_criteria():
    return {
        "criteria_61p": CRITERIA_61P,
        "criteria_vasp": CRITERIA_VASP,
    }


@router.get("/client/{client_id}", response_model=ScoreState)
def get_client_risk(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    record = (
        db.query(models.RiskScoringHistory)
        .filter(models.RiskScoringHistory.client_id == client_id)
        .order_by(models.RiskScoringHistory.assessed_at.desc())
        .first()
    )

    empty = ScoreState(
        high_selected=[], low_selected=[],
        score_61p=None, level_61p=None, override_61p=False, override_reasons_61p=[],
        scores={}, a3_pep=False,
        block_a=None, block_b=None, block_c=None, block_d=None, score_vasp=None,
        final_score=None, risk_level=None,
        override_applied=False, override_reasons=[],
        scored_at=None,
    )

    if not record or not record.score_details:
        return empty

    d = record.score_details
    return ScoreState(
        high_selected=d.get("high_selected", []),
        low_selected=d.get("low_selected", []),
        score_61p=d.get("score_61p"),
        level_61p=d.get("level_61p"),
        override_61p=d.get("override_61p", False),
        override_reasons_61p=d.get("override_reasons_61p", []),
        scores=d.get("scores", {}),
        a3_pep=d.get("a3_pep", False),
        block_a=record.block_a,
        block_b=record.block_b,
        block_c=record.block_c,
        block_d=record.block_d,
        score_vasp=d.get("score_vasp"),
        final_score=record.final_score,
        risk_level=record.risk_level.value if record.risk_level else None,
        override_applied=record.override_applied or False,
        override_reasons=record.override_reasons or [],
        scored_at=record.assessed_at,
    )


@router.post("/client/{client_id}", response_model=ScoreState)
def save_client_risk(
    client_id: int,
    data: ScoreInput,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    # Базовая оценка 61/п — для всех
    r61p = compute_risk_61p(data.high_selected, data.low_selected)

    # Расширенная оценка — только для юрлиц
    is_legal = client.client_type == models.ClientType.LEGAL
    r_vasp = None
    if is_legal and data.scores:
        full_scores = {**data.scores, "A3_pep": data.a3_pep}
        r_vasp = compute_risk_vasp(full_scores)

    final_score, risk_level, override_applied, override_reasons = combine_results(r61p, r_vasp)

    details = {
        "high_selected": data.high_selected,
        "low_selected": data.low_selected,
        "score_61p": r61p["score_61p"],
        "level_61p": r61p["level_61p"].value,
        "override_61p": r61p["override_61p"],
        "override_reasons_61p": r61p["override_reasons_61p"],
        "scores": data.scores,
        "a3_pep": data.a3_pep,
        "score_vasp": r_vasp["score_vasp"] if r_vasp else None,
    }

    history = models.RiskScoringHistory(
        client_id=client_id,
        company_id=current_user.company_id,
        block_a=r_vasp["block_a"] if r_vasp else None,
        block_b=r_vasp["block_b"] if r_vasp else None,
        block_c=r_vasp["block_c"] if r_vasp else None,
        block_d=r_vasp["block_d"] if r_vasp else None,
        score_details=details,
        final_score=final_score,
        risk_level=risk_level,
        override_applied=override_applied,
        override_reasons=override_reasons,
        manual_override=False,
        assessed_by=current_user.id,
    )
    db.add(history)

    client.risk_level = risk_level
    client.risk_score = final_score
    client.risk_score_details = details

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="risk.scored",
        entity_type="client",
        entity_id=client_id,
        new_value={
            "risk_level": risk_level.value,
            "final_score": final_score,
            "score_61p": r61p["score_61p"],
            "score_vasp": r_vasp["score_vasp"] if r_vasp else None,
            "override_applied": override_applied,
        },
    ))

    db.commit()
    db.refresh(history)

    return ScoreState(
        high_selected=data.high_selected,
        low_selected=data.low_selected,
        score_61p=r61p["score_61p"],
        level_61p=r61p["level_61p"].value,
        override_61p=r61p["override_61p"],
        override_reasons_61p=r61p["override_reasons_61p"],
        scores=data.scores,
        a3_pep=data.a3_pep,
        block_a=r_vasp["block_a"] if r_vasp else None,
        block_b=r_vasp["block_b"] if r_vasp else None,
        block_c=r_vasp["block_c"] if r_vasp else None,
        block_d=r_vasp["block_d"] if r_vasp else None,
        score_vasp=r_vasp["score_vasp"] if r_vasp else None,
        final_score=final_score,
        risk_level=risk_level.value,
        override_applied=override_applied,
        override_reasons=override_reasons,
        scored_at=history.assessed_at,
    )
