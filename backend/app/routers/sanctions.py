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
                # Exact match only — avoid substring false positives (e.g. "1990" in "1999-01-10")
                dob_match = query_dob.strip() == entry.date_of_birth.strip()

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
    if not data.name or not data.name.strip():
        raise HTTPException(status_code=422, detail="Имя для проверки не может быть пустым")

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

    LIST_NAMES = {
        "GSFR_KG_1": "ГСФР КР — ПФТ",
        "GSFR_KG_2": "ГСФР КР — ПЛПД ФЛ",
        "GSFR_KG_3": "ГСФР КР — ПЛПД ЮЛ",
        "GSFR_KG_4": "ГСФР КР — Сводный",
        "UN": "ООН",
        "OFAC": "США — OFAC",
        "EU": "ЕС",
        "UK": "Великобритания",
    }

    def _lists_with_hits(matches: list) -> list:
        """Агрегирует совпадения по спискам с максимальным tier и баллом."""
        by_list: dict = {}
        for m in (matches or []):
            code = m.get("list_code", "")
            score = m.get("score", 0)
            tier = m.get("match_tier") or ("confirmed" if score >= 92 else "probable" if score >= 78 else "possible")
            if code not in by_list or score > by_list[code]["best_score"]:
                by_list[code] = {
                    "list_code": code,
                    "list_name": LIST_NAMES.get(code, code),
                    "best_score": score,
                    "tier": tier,
                    "count": sum(1 for x in (matches or []) if x.get("list_code") == code),
                }
        return sorted(by_list.values(), key=lambda x: -x["best_score"])

    return [
        {
            "id": c.id,
            "client_id": c.client_id,
            "checked_name": c.checked_name,
            "checked_dob": c.checked_dob,
            "result": c.result,
            "matches_count": len(c.matches) if c.matches else 0,
            "lists_checked": c.lists_checked,
            "lists_with_hits": _lists_with_hits(c.matches),
            "matches": c.matches or [],
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


def _make_result(matches: list) -> str:
    if any(m["match_tier"] == "confirmed" for m in matches):
        return "match"
    if matches:
        return "possible_match"
    return "clear"


def _screen_subject(
    db, name: str, active_codes: list,
    client_id: int, company_id: int, user_id: int,
    subject_type: str, subject_id: Optional[int] = None, subject_name: Optional[str] = None,
) -> Optional[models.SanctionsCheck]:
    """Проверяет одно имя и создаёт запись SanctionsCheck. Возвращает объект без commit."""
    if not name or not name.strip():
        return None
    matches = search_sanctions(db=db, query_name=name.strip(), list_codes=active_codes)
    result = _make_result(matches)
    return models.SanctionsCheck(
        client_id=client_id,
        company_id=company_id,
        checked_name=name.strip(),
        lists_checked=active_codes,
        result=result,
        matches=matches,
        checked_by=user_id,
        subject_type=subject_type,
        subject_id=subject_id,
        subject_name=(subject_name or name.strip()),
        notes="Автоматический пересмотр",
    )


@router.post("/rescreening")
def run_rescreening(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Массовый пересмотр всех активных клиентов и связанных лиц:
    клиент, УБО, директора, доверенные лица, ПДЛ/ИПДЛ, родственники и близкие лица ПДЛ.
    """
    active_lists = db.query(SanctionsList).filter(SanctionsList.is_active == True).all()
    active_codes = [sl.code for sl in active_lists]

    if not active_codes:
        raise HTTPException(status_code=422, detail="Нет загруженных санкционных списков.")

    clients = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.is_active == True,
    ).all()

    stats = {"total": 0, "clear": 0, "possible": 0, "probable": 0, "confirmed": 0, "errors": 0, "new_hits": 0}
    new_hits = []

    SUBJECT_LABELS = {
        "client":          "Клиент",
        "ubo":             "УБО",
        "director":        "Директор",
        "signatory":       "Доверенное лицо",
        "pep_family":      "Родственник ПДЛ",
        "pep_associate":   "Близкое лицо ПДЛ",
    }

    for client in clients:
        try:
            subjects: list[tuple[str, Optional[int], str]] = []  # (subject_type, subject_id, name)

            # ── 1. Клиент ──────────────────────────────────────────────────────
            client_name = None
            if client.individual:
                ind = client.individual
                parts = [ind.last_name, ind.first_name, ind.middle_name]
                client_name = " ".join(p for p in parts if p)
            elif client.legal_entity:
                client_name = client.legal_entity.full_name

            if not client_name:
                continue

            subjects.append(("client", None, client_name))

            # ── 2. УБО ────────────────────────────────────────────────────────
            for ubo in (client.ubos or []):
                ubo_parts = [ubo.last_name, ubo.first_name, ubo.middle_name]
                ubo_name = " ".join(p for p in ubo_parts if p)
                if ubo_name:
                    subjects.append(("ubo", ubo.id, ubo_name))

                # ── 3. Родственники ПДЛ (из УБО) ─────────────────────────────
                if ubo.is_pep:
                    for member in (ubo.pdl_family_members or []):
                        mparts = [member.get("last_name"), member.get("first_name"), member.get("middle_name")]
                        mname = " ".join(p for p in mparts if p)
                        if mname:
                            subjects.append(("pep_family", ubo.id, mname))

                    for assoc in (ubo.pdl_close_associates or []):
                        aparts = [assoc.get("last_name"), assoc.get("first_name"), assoc.get("middle_name")]
                        aname = " ".join(p for p in aparts if p)
                        if aname:
                            subjects.append(("pep_associate", ubo.id, aname))

            # ── 4. Директора ──────────────────────────────────────────────────
            for director in (client.directors or []):
                dparts = [director.last_name, director.first_name, director.middle_name]
                dname = " ".join(p for p in dparts if p)
                if dname:
                    subjects.append(("director", director.id, dname))

            # ── 5. Доверенные лица (authorized_signatories из анкеты ЮЛ) ─────
            if client.legal_entity and client.legal_entity.authorized_signatories:
                sigs = client.legal_entity.authorized_signatories
                if isinstance(sigs, list):
                    for sig in sigs:
                        if isinstance(sig, dict):
                            sparts = [sig.get("last_name"), sig.get("first_name"), sig.get("middle_name")]
                            sname = " ".join(p for p in sparts if p)
                            if not sname:
                                sname = sig.get("full_name") or sig.get("name") or ""
                            if sname:
                                subjects.append(("signatory", None, sname))
                elif isinstance(sigs, str) and sigs.strip():
                    subjects.append(("signatory", None, sigs.strip()))

            # ── 6. ПДЛ из анкеты ФЛ (PEPQuestionnaire) ───────────────────────
            pep_q = db.query(models.PEPQuestionnaire).filter(
                models.PEPQuestionnaire.client_id == client.id
            ).first() if hasattr(models, "PEPQuestionnaire") else None

            if pep_q:
                for member in (pep_q.family_members or []):
                    mparts = [member.get("last_name"), member.get("first_name"), member.get("middle_name")]
                    mname = " ".join(p for p in mparts if p)
                    if mname:
                        subjects.append(("pep_family", None, mname))
                for assoc in (pep_q.close_associates or []):
                    aparts = [assoc.get("last_name"), assoc.get("first_name"), assoc.get("middle_name")]
                    aname = " ".join(p for p in aparts if p)
                    if aname:
                        subjects.append(("pep_associate", None, aname))

            # ── Скрининг всех субъектов ───────────────────────────────────────
            stats["total"] += 1
            worst_result = "clear"
            checks_for_client = []

            for subj_type, subj_id, subj_name in subjects:
                chk = _screen_subject(
                    db=db, name=subj_name, active_codes=active_codes,
                    client_id=client.id, company_id=current_user.company_id, user_id=current_user.id,
                    subject_type=subj_type, subject_id=subj_id,
                    subject_name=f"{SUBJECT_LABELS.get(subj_type, subj_type)}: {subj_name}",
                )
                if chk:
                    db.add(chk)
                    checks_for_client.append(chk)
                    if chk.result == "match":
                        worst_result = "match"
                    elif chk.result == "possible_match" and worst_result == "clear":
                        worst_result = "possible_match"

            if worst_result == "match":
                stats["confirmed"] += 1
            elif worst_result == "possible_match":
                stats["possible"] += 1
            else:
                stats["clear"] += 1

            # Проверяем новые совпадения (только по субъекту client)
            last_client_check = db.query(models.SanctionsCheck).filter(
                models.SanctionsCheck.client_id == client.id,
                models.SanctionsCheck.company_id == current_user.company_id,
                models.SanctionsCheck.subject_type == "client",
            ).order_by(models.SanctionsCheck.checked_at.desc()).first()

            is_new_hit = (worst_result != "clear") and (last_client_check is None or last_client_check.result == "clear")
            if is_new_hit:
                stats["new_hits"] += 1
                new_hits.append({"client_id": client.id, "name": client_name, "result": worst_result})

            client.last_screening_at = datetime.utcnow()

        except Exception as e:
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


@router.post("/rescreening/client/{client_id}")
def rescreen_single_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Комплексная санкционная проверка одного клиента и всех связанных лиц:
    клиент, УБО, директора, доверенные лица, ПДЛ/ИПДЛ, родственники и близкие лица ПДЛ.
    """
    active_lists = db.query(SanctionsList).filter(SanctionsList.is_active == True).all()
    active_codes = [sl.code for sl in active_lists]
    if not active_codes:
        raise HTTPException(status_code=422, detail="Нет загруженных санкционных списков.")

    client = db.query(models.Client).filter(
        models.Client.id == client_id,
        models.Client.company_id == current_user.company_id,
    ).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден.")

    SUBJECT_LABELS = {
        "client": "Клиент", "ubo": "УБО", "director": "Директор",
        "signatory": "Доверенное лицо", "pep_family": "Родственник ПДЛ", "pep_associate": "Близкое лицо ПДЛ",
    }

    subjects: list[tuple[str, Optional[int], str]] = []

    # 1. Клиент
    if client.individual:
        ind = client.individual
        client_name = " ".join(p for p in [ind.last_name, ind.first_name, ind.middle_name] if p)
    elif client.legal_entity:
        client_name = client.legal_entity.full_name or ""
    else:
        client_name = ""
    if client_name:
        subjects.append(("client", None, client_name))

    # 2. УБО
    for ubo in (client.ubos or []):
        ubo_name = " ".join(p for p in [ubo.last_name, ubo.first_name, ubo.middle_name] if p)
        if ubo_name:
            subjects.append(("ubo", ubo.id, ubo_name))
        if ubo.is_pep:
            for m in (ubo.pdl_family_members or []):
                mname = " ".join(p for p in [m.get("last_name"), m.get("first_name"), m.get("middle_name")] if p)
                if mname:
                    subjects.append(("pep_family", ubo.id, mname))
            for a in (ubo.pdl_close_associates or []):
                aname = " ".join(p for p in [a.get("last_name"), a.get("first_name"), a.get("middle_name")] if p)
                if aname:
                    subjects.append(("pep_associate", ubo.id, aname))

    # 3. Директора
    for d in (client.directors or []):
        dname = " ".join(p for p in [d.last_name, d.first_name, d.middle_name] if p)
        if dname:
            subjects.append(("director", d.id, dname))

    # 4. Доверенные лица
    if client.legal_entity and client.legal_entity.authorized_signatories:
        sigs = client.legal_entity.authorized_signatories
        if isinstance(sigs, list):
            for sig in sigs:
                if isinstance(sig, dict):
                    sname = " ".join(p for p in [sig.get("last_name"), sig.get("first_name"), sig.get("middle_name")] if p) or sig.get("full_name") or sig.get("name") or ""
                    if sname:
                        subjects.append(("signatory", None, sname))
                elif isinstance(sig, str) and sig.strip():
                    subjects.append(("signatory", None, sig.strip()))
        elif isinstance(sigs, str) and sigs.strip():
            subjects.append(("signatory", None, sigs.strip()))

    # 5. ПДЛ из анкеты ФЛ
    if hasattr(models, "PEPQuestionnaire"):
        pep_q = db.query(models.PEPQuestionnaire).filter(
            models.PEPQuestionnaire.client_id == client.id
        ).first()
        if pep_q:
            for m in (pep_q.family_members or []):
                mname = " ".join(p for p in [m.get("last_name"), m.get("first_name"), m.get("middle_name")] if p)
                if mname:
                    subjects.append(("pep_family", None, mname))
            for a in (pep_q.close_associates or []):
                aname = " ".join(p for p in [a.get("last_name"), a.get("first_name"), a.get("middle_name")] if p)
                if aname:
                    subjects.append(("pep_associate", None, aname))

    # Скрининг
    checked_subjects = []
    worst_result = "clear"

    for subj_type, subj_id, subj_name in subjects:
        chk = _screen_subject(
            db=db, name=subj_name, active_codes=active_codes,
            client_id=client.id, company_id=current_user.company_id, user_id=current_user.id,
            subject_type=subj_type, subject_id=subj_id,
            subject_name=f"{SUBJECT_LABELS.get(subj_type, subj_type)}: {subj_name}",
        )
        if chk:
            db.add(chk)
            db.flush()
            if chk.result == "match":
                worst_result = "match"
            elif chk.result == "possible_match" and worst_result == "clear":
                worst_result = "possible_match"
            checked_subjects.append({
                "subject_type": subj_type,
                "subject_name": f"{SUBJECT_LABELS.get(subj_type, subj_type)}: {subj_name}",
                "result": chk.result,
                "matches": chk.matches[:5] if chk.matches else [],
                "check_id": chk.id,
            })

    client.last_screening_at = datetime.utcnow()

    db.add(models.AuditLog(
        company_id=current_user.company_id,
        user_id=current_user.id,
        action="sanctions.rescreen_client",
        entity_type="client",
        entity_id=client.id,
        new_value={"result": worst_result, "subjects_count": len(checked_subjects)},
    ))
    db.commit()

    return {
        "result": worst_result,
        "subjects": checked_subjects,
        "lists_checked": active_codes,
        "total_subjects": len(checked_subjects),
    }


class OfficerDecisionIn(BaseModel):
    decision: Optional[str] = None   # confirmed | false_positive | null (сброс)
    notes: Optional[str] = None


@router.patch("/checks/{check_id}/decision")
def set_officer_decision(
    check_id: int,
    body: OfficerDecisionIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Офицер подтверждает совпадение или помечает как ложное срабатывание."""
    if body.decision is not None and body.decision not in ("confirmed", "false_positive"):
        raise HTTPException(status_code=422, detail="decision must be 'confirmed', 'false_positive', or null")

    check = db.query(models.SanctionsCheck).filter(
        models.SanctionsCheck.id == check_id,
        models.SanctionsCheck.company_id == current_user.company_id,
    ).first()
    if not check:
        raise HTTPException(status_code=404, detail="Проверка не найдена")

    # Сохранить оригинальный результат перед первым решением
    if body.decision is not None and check.officer_decision is None:
        check.notes = (check.notes or '') + f'[original_result:{check.result}]'

    check.officer_decision = body.decision
    check.officer_notes = body.notes if body.notes is not None else check.officer_notes

    if body.decision == 'confirmed':
        check.result = 'match'
        check.officer_id = current_user.id
        check.officer_decided_at = datetime.utcnow()
    elif body.decision == 'false_positive':
        check.result = 'clear'
        check.officer_id = current_user.id
        check.officer_decided_at = datetime.utcnow()
    else:
        # Сброс — восстановить оригинальный результат
        import re as _re
        m = _re.search(r'\[original_result:(\w+)\]', check.notes or '')
        check.result = m.group(1) if m else 'possible_match'
        check.officer_id = None
        check.officer_decided_at = None

    db.commit()
    return {"ok": True, "decision": body.decision, "result": check.result}


SUBJECT_RESULT_ORDER = {"match": 2, "possible_match": 1, "clear": 0}


@router.get("/rescreening/results")
def get_rescreening_results(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Последние результаты массового пересмотра по каждому клиенту.
    Возвращает агрегированный итог и разбивку по субъектам (УБО, директора, родственники ПДЛ и т.д.).
    """
    from sqlalchemy import func as sqlfunc

    active_lists = db.query(SanctionsList).filter(SanctionsList.is_active == True).all()
    active_codes = [sl.code for sl in active_lists]
    list_names_map = {sl.code: sl.name for sl in active_lists}

    clients = db.query(models.Client).filter(
        models.Client.company_id == current_user.company_id,
        models.Client.is_active == True,
    ).all()

    # Последняя дата скрининга по каждому клиенту
    latest_dates = db.query(
        models.SanctionsCheck.client_id,
        sqlfunc.max(models.SanctionsCheck.checked_at).label("max_at"),
    ).filter(
        models.SanctionsCheck.company_id == current_user.company_id,
    ).group_by(models.SanctionsCheck.client_id).all()
    latest_map = {row.client_id: row.max_at for row in latest_dates}

    rows = []
    for client in clients:
        client_name = None
        if client.individual:
            parts = [client.individual.last_name, client.individual.first_name, client.individual.middle_name]
            client_name = " ".join(p for p in parts if p)
        elif client.legal_entity:
            client_name = client.legal_entity.full_name
        if not client_name:
            continue

        max_at = latest_map.get(client.id)
        if not max_at:
            # Ни одной проверки — возвращаем строку без результата
            rows.append({
                "client_id": client.id,
                "name": client_name,
                "client_type": client.client_type,
                "result": "clear",
                "checked_at": None,
                "per_list": {},
                "matches": [],
                "subjects": [],
                "check_id": None,
                "officer_decision": None,
                "officer_notes": None,
                "officer_decided_at": None,
            })
            continue

        # Все проверки из последнего скрининга (один run = одна дата с секундной точностью)
        recent_checks = db.query(models.SanctionsCheck).filter(
            models.SanctionsCheck.client_id == client.id,
            models.SanctionsCheck.company_id == current_user.company_id,
            models.SanctionsCheck.checked_at == max_at,
        ).all()

        # Агрегируем worst result и per_list по всем субъектам
        overall_result = "clear"
        per_list: dict = {}
        all_matches: list = []
        checked_at = max_at.isoformat() if max_at else None

        # Субъекты с совпадениями (для детального отображения)
        subjects_with_hits: list = []

        # Ссылочный check (субъект client) для officer_decision
        client_check = None

        for chk in recent_checks:
            if chk.subject_type == "client" or chk.subject_type is None:
                client_check = chk

            chk_result = chk.result or "clear"
            if SUBJECT_RESULT_ORDER.get(chk_result, 0) > SUBJECT_RESULT_ORDER.get(overall_result, 0):
                overall_result = chk_result

            chk_matches = chk.matches or []
            for m in chk_matches:
                lc = m.get("list_code", "")
                score = m.get("score", 0)
                tier = m.get("match_tier", "possible")
                if lc not in per_list or score > per_list[lc]["score"]:
                    per_list[lc] = {"score": score, "tier": tier}

            if chk_matches:
                all_matches.extend(chk_matches)
                subjects_with_hits.append({
                    "subject_type": chk.subject_type or "client",
                    "subject_name": chk.subject_name or chk.checked_name,
                    "result": chk_result,
                    "matches": chk_matches[:5],
                    "check_id": chk.id,
                    "officer_decision": chk.officer_decision,
                    "officer_decided_at": chk.officer_decided_at.isoformat() if chk.officer_decided_at else None,
                })

        # Используем client_check или первый check для officer_decision
        ref_check = client_check or (recent_checks[0] if recent_checks else None)

        rows.append({
            "client_id": client.id,
            "name": client_name,
            "client_type": client.client_type,
            "result": overall_result,
            "checked_at": checked_at,
            "per_list": per_list,
            "matches": all_matches[:20],
            "subjects": subjects_with_hits,
            "check_id": ref_check.id if ref_check else None,
            "officer_decision": ref_check.officer_decision if ref_check else None,
            "officer_notes": ref_check.officer_notes if ref_check else None,
            "officer_decided_at": ref_check.officer_decided_at.isoformat() if ref_check and ref_check.officer_decided_at else None,
        })

    return {
        "list_codes": active_codes,
        "list_names": list_names_map,
        "clients": rows,
    }