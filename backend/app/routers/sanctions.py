"""
Санкционный скрининг.
Эндпоинты: загрузка списков, поиск, история проверок.
"""

import io
import csv
import re
import unicodedata
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user
from app.sanctions_models import SanctionsList, SanctionEntry
from app.sanctions_loader import (
    SANCTIONS_SOURCES, normalize_name, get_name_variants,
    parse_gsfr_kg, parse_un, parse_uk_ofsi_csv,
    load_sanctions_list
)

router = APIRouter(prefix="/api/sanctions", tags=["sanctions"])


# ─── Fuzzy matching ───────────────────────────────────────────────────────────

def fuzzy_score(query: str, target: str) -> float:
    """
    Схожесть строк. Возвращает 0.0–1.0.
    Учитывает: точное совпадение, вхождение как слова, биграммы.
    """
    if not query or not target:
        return 0.0
    if query == target:
        return 1.0

    # Проверяем вхождение query как отдельного слова в target
    # Например "путин" → "putin" находится в "putin vladimir vladimirovich"
    target_words = target.split()
    query_words = query.split()

    # Все слова запроса содержатся в target как слова
    if all(qw in target_words for qw in query_words):
        # Чем больше совпадение по длине — тем выше балл
        return min(0.95, 0.80 + 0.05 * len(query_words))

    # Частичное вхождение слов
    matched_words = sum(1 for qw in query_words if qw in target_words)
    if matched_words > 0 and len(query_words) > 0:
        word_score = matched_words / len(query_words)
        if word_score >= 0.5:
            return word_score * 0.88

    # Строковое вхождение
    if query in target:
        shorter = len(query)
        longer = len(target)
        # Если запрос — значимая часть target (>30% длины)
        if shorter / longer >= 0.3:
            return 0.85
        return shorter / longer * 0.90

    if target in query:
        shorter = len(target)
        longer = len(query)
        return shorter / longer * 0.90

    # Биграммный коэффициент Дайса
    def bigrams(s):
        return set(s[i:i+2] for i in range(len(s)-1))

    q_bi = bigrams(query)
    t_bi = bigrams(target)
    if not q_bi or not t_bi:
        return 0.0

    intersection = len(q_bi & t_bi)
    score = 2 * intersection / (len(q_bi) + len(t_bi))
    return score


TIER_CONFIRMED = 0.92   # ≥ 92%  → подтверждённое совпадение (блокировка)
TIER_PROBABLE  = 0.78   # ≥ 78%  → вероятное (требует проверки)
TIER_POSSIBLE  = 0.60   # ≥ 60%  → возможное (обратить внимание)


def _match_tier(score: float) -> str:
    if score >= TIER_CONFIRMED:
        return "confirmed"
    if score >= TIER_PROBABLE:
        return "probable"
    return "possible"


def search_sanctions(
    db: Session,
    query_name: str,
    query_dob: Optional[str] = None,
    list_codes: Optional[List[str]] = None,
    threshold: float = TIER_POSSIBLE,
    limit: int = 20
) -> list[dict]:
    """
    Ищет совпадения в санкционных списках.
    Три уровня: confirmed (≥92%), probable (≥78%), possible (≥60%).
    """
    query_variants = get_name_variants(query_name)

    q = db.query(SanctionEntry)
    if list_codes:
        q = q.filter(SanctionEntry.list_code.in_(list_codes))

    all_entries = q.all()

    matches = []
    for entry in all_entries:
        best_score = 0.0

        names_to_check = [entry.primary_name_normalized or ""]
        if entry.aliases:
            for alias in entry.aliases:
                names_to_check.append(normalize_name(alias))

        for entry_name in names_to_check:
            if not entry_name:
                continue
            for variant in query_variants:
                score = fuzzy_score(variant, entry_name)
                if score > best_score:
                    best_score = score

        if best_score >= threshold:
            dob_match = None
            if query_dob and entry.date_of_birth:
                dob_match = query_dob in entry.date_of_birth or entry.date_of_birth in query_dob

            tier = _match_tier(best_score)
            matches.append({
                "entry_id": entry.id,
                "list_code": entry.list_code,
                "entity_type": entry.entity_type,
                "primary_name": entry.primary_name,
                "aliases": entry.aliases or [],
                "date_of_birth": entry.date_of_birth,
                "nationality": entry.nationality,
                "country": entry.country,
                "score": round(best_score * 100),
                "dob_match": dob_match,
                "match_tier": tier,
                "match_level": "match" if tier == "confirmed" else "possible_match",
            })

    matches.sort(key=lambda x: x["score"], reverse=True)
    return matches[:limit]


# ─── Схемы ────────────────────────────────────────────────────────────────────

class ScreeningRequest(BaseModel):
    name: str
    date_of_birth: Optional[str] = None
    client_id: Optional[int] = None
    list_codes: Optional[List[str]] = None
    notes: Optional[str] = None


class ScreeningResult(BaseModel):
    result: str  # clear / possible_match / match
    matches: list
    checked_name: str
    checked_dob: Optional[str]
    lists_checked: List[str]


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("/lists")
def get_lists(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Список всех санкционных списков и их статус."""
    lists = db.query(SanctionsList).all()

    # Добавляем списки которых ещё нет в БД
    existing_codes = {sl.code for sl in lists}
    result = []

    for source in SANCTIONS_SOURCES:
        code = source["code"]
        if code in existing_codes:
            sl = next(sl for sl in lists if sl.code == code)
            result.append({
                "code": sl.code,
                "name": sl.name,
                "last_updated": sl.last_updated,
                "entry_count": sl.entry_count,
                "is_active": sl.is_active,
                "auto_update": source["format"] == "opensanctions_csv",
            })
        else:
            result.append({
                "code": code,
                "name": source["name"],
                "last_updated": None,
                "entry_count": 0,
                "is_active": False,
                "auto_update": source["format"] == "opensanctions_csv",
            })

    return result


@router.post("/lists/upload")
async def upload_list(
    file: UploadFile = File(...),
    list_code: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Загружает XML файл санкционного списка."""
    content = await file.read()

    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        try:
            text = content.decode('windows-1251')
        except Exception:
            raise HTTPException(status_code=400, detail="Не удалось прочитать файл")

    # Определяем формат и парсим
    source = next((s for s in SANCTIONS_SOURCES if s["code"] == list_code), None)

    if list_code == "UN":
        entries_data = parse_un(text)
    elif list_code == "UK":
        entries_data = parse_uk_ofsi_csv(text)
    elif list_code.startswith("GSFR_KG") or source and source["format"] == "gsfr_kg":
        entries_data = parse_gsfr_kg(text, list_code)
    else:
        entries_data = parse_gsfr_kg(text, list_code)

    if not entries_data:
        raise HTTPException(
            status_code=422,
            detail="Не удалось распознать записи в файле. Проверьте формат."
        )

    # Удаляем старые записи
    db.query(SanctionEntry).filter(SanctionEntry.list_code == list_code).delete()

    # Сохраняем новые
    for ed in entries_data:
        db.add(SanctionEntry(**ed))

    # Обновляем метаданные
    sl = db.query(SanctionsList).filter(SanctionsList.code == list_code).first()
    if not sl:
        name = source["name"] if source else list_code
        sl = SanctionsList(code=list_code, name=name)
        db.add(sl)
    sl.last_updated = datetime.utcnow()
    sl.entry_count = len(entries_data)
    sl.is_active = True

    db.commit()

    # Журнал аудита
    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="sanctions.list_uploaded",
        entity_type="sanctions_list",
        new_value={"list_code": list_code, "count": len(entries_data)},
    ))
    db.commit()

    return {"message": f"Загружено {len(entries_data)} записей", "count": len(entries_data)}


@router.post("/lists/update-auto")
async def update_auto_lists(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Обновляет автоматические списки (OFAC, EU, UK) через OpenSanctions."""
    auto_sources = [s for s in SANCTIONS_SOURCES if s["format"] == "opensanctions_csv"]
    results = []
    for source in auto_sources:
        r = await load_sanctions_list(db, source)
        results.append(r)
    return {"results": results}


@router.post("/screen", response_model=ScreeningResult)
def screen(
    data: ScreeningRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Проверяет имя по санкционным спискам."""
    # Определяем какие списки проверять
    active_lists = db.query(SanctionsList).filter(SanctionsList.is_active == True).all()
    active_codes = [sl.code for sl in active_lists]

    if not active_codes:
        raise HTTPException(
            status_code=422,
            detail="Нет загруженных санкционных списков. Загрузите хотя бы один список."
        )

    lists_to_check = data.list_codes if data.list_codes else active_codes

    # Поиск
    matches = search_sanctions(
        db=db,
        query_name=data.name,
        query_dob=data.date_of_birth,
        list_codes=lists_to_check,
        threshold=0.75,
    )

    # Определяем итоговый результат по наивысшему tier
    if any(m["match_tier"] == "confirmed" for m in matches):
        result = "match"
    elif matches:
        result = "possible_match"
    else:
        result = "clear"

    # Сохраняем результат всегда
    check = models.SanctionsCheck(
        client_id=data.client_id if data.client_id else None,
        company_id=current_user.company_id,
        checked_name=data.name,
        checked_dob=data.date_of_birth,
        lists_checked=lists_to_check,
        result=result,
        matches=matches,
        checked_by=current_user.id,
        notes=data.notes,
    )
    db.add(check)

    # Если привязан к клиенту — обновляем дату проверки
    if data.client_id:
        client = db.query(models.Client).filter(
            models.Client.id == data.client_id,
            models.Client.company_id == current_user.company_id,
        ).first()
        if client:
            client.last_screening_at = datetime.utcnow()

    db.commit()

    return ScreeningResult(
        result=result,
        matches=matches,
        checked_name=data.name,
        checked_dob=data.date_of_birth,
        lists_checked=lists_to_check,
    )


@router.get("/history")
def get_history(
    client_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """История санкционных проверок."""
    q = db.query(models.SanctionsCheck).filter(
        models.SanctionsCheck.company_id == current_user.company_id
    )
    if client_id:
        q = q.filter(models.SanctionsCheck.client_id == client_id)

    checks = q.order_by(models.SanctionsCheck.checked_at.desc()).limit(limit).all()

    return [
        {
            "id": c.id,
            "client_id": c.client_id,
            "checked_name": c.checked_name,
            "checked_dob": c.checked_dob,
            "result": c.result,
            "matches_count": len(c.matches) if c.matches else 0,
            "lists_checked": c.lists_checked,
            "checked_at": c.checked_at,
            "notes": c.notes,
        }
        for c in checks
    ]


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Статистика по скринингу."""
    total = db.query(func.count(models.SanctionsCheck.id)).filter(
        models.SanctionsCheck.company_id == current_user.company_id
    ).scalar()

    matches = db.query(func.count(models.SanctionsCheck.id)).filter(
        models.SanctionsCheck.company_id == current_user.company_id,
        models.SanctionsCheck.result.in_(["match", "possible_match"])
    ).scalar()

    total_entries = db.query(func.count(SanctionEntry.id)).scalar()

    return {
        "total_checks": total,
        "matches_found": matches,
        "total_entries": total_entries,
    }


@router.post("/rescreening")
def run_rescreening(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Массовый пересмотр всех активных клиентов компании по текущим санкционным спискам.
    Возвращает статистику: total, clear, possible, confirmed, errors.
    Новые совпадения (результат изменился) помечаются в notes.
    """
    active_lists = db.query(SanctionsList).filter(SanctionsList.is_active == True).all()
    active_codes = [sl.code for sl in active_lists]

    if not active_codes:
        raise HTTPException(
            status_code=422,
            detail="Нет загруженных санкционных списков."
        )

    # Собираем всех активных клиентов с именами
    clients = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.is_active == True,
    ).all()

    stats = {"total": 0, "clear": 0, "possible": 0, "probable": 0, "confirmed": 0, "errors": 0, "new_hits": 0}
    new_hits = []

    for client in clients:
        try:
            # Определяем имя клиента
            name = None
            if client.individual:
                parts = [client.individual.last_name, client.individual.first_name, client.individual.middle_name]
                name = " ".join(p for p in parts if p)
            elif client.legal_entity:
                name = client.legal_entity.full_name

            if not name:
                continue

            stats["total"] += 1

            matches = search_sanctions(db=db, query_name=name, list_codes=active_codes)

            if any(m["match_tier"] == "confirmed" for m in matches):
                result = "match"
                stats["confirmed"] += 1
            elif any(m["match_tier"] == "probable" for m in matches):
                result = "possible_match"
                stats["probable"] += 1
            elif matches:
                result = "possible_match"
                stats["possible"] += 1
            else:
                result = "clear"
                stats["clear"] += 1

            # Проверяем, изменился ли результат по сравнению с последней проверкой
            last_check = db.query(models.SanctionsCheck).filter(
                models.SanctionsCheck.client_id == client.id,
                models.SanctionsCheck.company_id == current_user.company_id,
            ).order_by(models.SanctionsCheck.checked_at.desc()).first()

            is_new_hit = (result != "clear") and (last_check is None or last_check.result == "clear")
            if is_new_hit:
                stats["new_hits"] += 1
                new_hits.append({"client_id": client.id, "name": name, "result": result})

            check = models.SanctionsCheck(
                client_id=client.id,
                company_id=current_user.company_id,
                checked_name=name,
                lists_checked=active_codes,
                result=result,
                matches=matches,
                checked_by=current_user.id,
                notes="Автоматический пересмотр" + (" · НОВОЕ СОВПАДЕНИЕ" if is_new_hit else ""),
            )
            db.add(check)
            client.last_screening_at = datetime.utcnow()

        except Exception:
            stats["errors"] += 1

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="sanctions.rescreening",
        entity_type="sanctions",
        new_value=stats,
    ))
    db.commit()

    return {**stats, "new_hits_detail": new_hits}