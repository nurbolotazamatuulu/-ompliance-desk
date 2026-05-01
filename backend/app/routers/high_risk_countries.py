"""Перечень высокорисковых стран (Приказ ГСФР № 78-ө/п от 20.06.2025)."""

import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/high-risk-countries", tags=["high-risk-countries"])

UPLOAD_DIR = "/app/uploads/hrc_docs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Начальные данные (Приказ ГСФР № 78-ө/п от 20.06.2025) ──────────────────

HIGH_RISK_COUNTRIES_DATA = [
    ("Алжир", "Algeria", "список ФАТФ", ["1.1"]),
    ("Ангилья", "Anguilla", "список оффшорных зон", ["1", "1.1"]),
    ("Ангола", "Angola", "список ФАТФ", ["1.1"]),
    ("Антигуа и Барбуда", "Antigua and Barbuda", "список оффшорных зон", ["1", "1.1"]),
    ("Аруба", "Aruba", "список оффшорных зон", ["1", "1.1"]),
    ("Белиз", "Belize", "список оффшорных зон", ["1", "1.1"]),
    ("Бермудские острова", "Bermuda", "список оффшорных зон", ["1", "1.1"]),
    ("Боливия", "Bolivia", "список ФАТФ", ["1", "1.1"]),
    ("Британские Виргинские острова", "British Virgin Islands", "список ФАТФ, список оффшорных зон", ["1", "1.1"]),
    ("Буркина-Фасо", "Burkina Faso", "список ФАТФ", ["1.1"]),
    ("Венесуэла", "Venezuela", "список ФАТФ, Базельский институт управления", ["1.1"]),
    ("Габонская Республика", "Gabonese Republic", "Базельский институт управления", ["1.1"]),
    ("Гвинея-Бисау", "Guinea-Bissau", "список СБ ООН, Базельский институт управления", ["1", "1.1"]),
    ("Государство Ливия", "State of Libya", "список СБ ООН", ["1", "1.1"]),
    ("Гренада", "Grenada", "список оффшорных зон", ["1", "1.1"]),
    ("Демократическая Республика Конго", "Democratic Republic of the Congo", "Базельский институт управления, список ФАТФ", ["1.1"]),
    ("Исламская Республика Афганистан", "Islamic Republic of Afghanistan", "Резолюция СБ ООН", ["1", "1.1"]),
    ("Исламская Республика Иран", "Islamic Republic of Iran", "список ФАТФ", ["1.1"]),
    ("Йеменская Республика", "Republic of Yemen", "список ФАТФ, список СБ ООН", ["1", "1.1"]),
    ("Кения", "Kenya", "список ФАТФ", ["1.1"]),
    ("Княжество Андорра", "Principality of Andorra", "список оффшорных зон", ["1", "1.1"]),
    ("Корейская Народно-Демократическая Республика", "Democratic People's Republic of Korea", "список ФАТФ, список СБ ООН", ["1", "1.1", "2", "3", "4", "5", "6"]),
    ("Кот-д'Ивуар", "Cote d'Ivoire", "список ФАТФ", ["1.1"]),
    ("Лаосская Народно-Демократическая Республика", "Lao People's Democratic Republic", "Базельский институт управления, список ФАТФ", ["1.1"]),
    ("Ливан", "Lebanon", "список ФАТФ, список СБ ООН", ["1", "1.1"]),
    ("Макао (Китайская Народная Республика)", "Macao (People's Republic of China)", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Мали", "Republic of Mali", "список СБ ООН", ["1", "1.1"]),
    ("Мальдивская Республика", "Republic of Maldives", "список оффшорных зон", ["1", "1.1"]),
    ("Мозамбик", "Mozambique", "список ФАТФ", ["1.1"]),
    ("Монако", "Monaco", "список ФАТФ, список оффшорных зон", ["1", "1.1"]),
    ("Монсеррат", "Montserrat", "список оффшорных зон", ["1", "1.1"]),
    ("Намибия", "Namibia", "список ФАТФ", ["1.1"]),
    ("Независимое Государство Самоа", "Independent State of Samoa", "список оффшорных зон", ["1", "1.1"]),
    ("Непал", "Nepal", "список ФАТФ", ["1.1"]),
    ("Ниуэ (Новая Зеландия)", "Niue (New Zealand)", "список оффшорных зон", ["1", "1.1"]),
    ("Острова Кайман", "Cayman Islands", "список оффшорных зон", ["1", "1.1"]),
    ("Острова Кука (Новая Зеландия)", "Cook Islands (New Zealand)", "список оффшорных зон", ["1", "1.1"]),
    ("Острова Лабуан (Малайзия)", "Labuan Islands (Malaysia)", "список оффшорных зон", ["1", "1.1"]),
    ("Острова Теркс и Кайкос", "Turks and Caicos Islands", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Болгария", "Republic of Bulgaria", "список ФАТФ", ["1.1"]),
    ("Республика Вануату", "Republic of Vanuatu", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Гаити", "Republic of Haiti", "Базельский институт управления, список ФАТФ", ["1.1"]),
    ("Республика Ирак", "Republic of Iraq", "список СБ ООН", ["1", "1.1"]),
    ("Республика Камерун", "Republic of Cameroon", "список ФАТФ", ["1.1"]),
    ("Республика Конго", "Republic of the Congo", "список СБ ООН, Базельский институт управления, список ФАТФ", ["1", "1.1"]),
    ("Республика Маврикий", "Republic of Mauritius", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Маршалловы острова", "Republic of the Marshall Islands", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Науру", "Republic of Nauru", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Панама", "Republic of Panama", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Сейшельские острова", "Republic of Seychelles", "список оффшорных зон", ["1", "1.1"]),
    ("Республика Союз Мьянма", "Republic of the Union of Myanmar", "список ФАТФ, Базельский институт управления", ["1", "1.1"]),
    ("Республика Судан", "Republic of the Sudan", "список СБ ООН", ["1", "1.1"]),
    ("Республика Чад", "Republic of Chad", "Базельский институт управления", ["1.1"]),
    ("Республика Южный Судан", "Republic of South Sudan", "список СБ ООН, список ФАТФ", ["1", "1.1"]),
    ("Сент-Винсент и Гренадины", "Saint Vincent and the Grenadines", "список оффшорных зон", ["1", "1.1"]),
    ("Сент-Люсия", "Saint Lucia", "список оффшорных зон", ["1", "1.1"]),
    ("Сирийская Арабская Республика", "Syrian Arab Republic", "список ФАТФ", ["1.1"]),
    ("Социалистическая Республика Вьетнам", "Socialist Republic of Vietnam", "список ФАТФ", ["1", "1.1"]),
    ("Федеративная Республика Нигерия", "Federal Republic of Nigeria", "список ФАТФ", ["1.1"]),
    ("Федеративная Республика Сомали", "Somali Republic", "список СБ ООН", ["1", "1.1"]),
    ("Федерация Сент-Китс и Невис", "Federation of Saint Kitts and Nevis", "список оффшорных зон", ["1", "1.1"]),
    ("Центральноафриканская Республика", "Central African Republic", "список СБ ООН, Базельский институт управления", ["1", "1.1"]),
    ("Южно-Африканская Республика", "Republic of South Africa", "список ФАТФ", ["1.1"]),
]

MEASURES_DESCRIPTIONS = {
    "1":   "Уведомление ОФРД о всех операциях с лицами из высокорисковой страны",
    "1.1": "Усиленная надлежащая проверка клиента (EDD) при установлении деловых отношений",
    "2":   "Отказ в установлении деловых отношений и проведении операций",
    "3":   "Отказ / прекращение корреспондентских отношений с ЮЛ из высокорисковой страны",
    "4":   "Усиленный надзор и ужесточение требований внешнего аудита для филиалов",
    "5":   "Отказ в лицензировании дочерних обществ, филиалов или представительств",
    "6":   "Отказ в лицензировании ЮЛ, учредителем которого является лицо из высокорисковой страны",
}


def seed_high_risk_countries(db: Session):
    if db.query(models.HighRiskCountry).count() > 0:
        return
    for name_ru, name_en, basis, measures in HIGH_RISK_COUNTRIES_DATA:
        db.add(models.HighRiskCountry(
            name_ru=name_ru, name_en=name_en,
            basis=basis, measures=measures,
        ))
    db.commit()


# ─── Схемы ────────────────────────────────────────────────────────────────────

class HRCOut(BaseModel):
    id: int
    name_ru: str
    name_en: str
    basis: Optional[str]
    measures: list
    order_ref: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class HRCCreate(BaseModel):
    name_ru: str
    name_en: str
    basis: Optional[str] = None
    measures: List[str]
    order_ref: Optional[str] = None


class HRCUpdate(BaseModel):
    name_ru: Optional[str] = None
    name_en: Optional[str] = None
    basis: Optional[str] = None
    measures: Optional[List[str]] = None
    order_ref: Optional[str] = None
    is_active: Optional[bool] = None


class AuditOut(BaseModel):
    id: int
    action: str
    country_name_ru: Optional[str]
    old_value: Optional[dict]
    new_value: Optional[dict]
    changed_by_name: str
    changed_at: datetime
    notes: Optional[str]
    pdf_filename: Optional[str]

    class Config:
        from_attributes = True


# ─── Хелпер аудита ────────────────────────────────────────────────────────────

def _log(db: Session, user: models.User, action: str, country: Optional[models.HighRiskCountry],
         old_val=None, new_val=None, notes: str = None, pdf_filename: str = None):
    db.add(models.HighRiskCountryAudit(
        country_id=country.id if country else None,
        action=action,
        country_name_ru=country.name_ru if country else None,
        old_value=old_val,
        new_value=new_val,
        changed_by_id=user.id,
        changed_by_name=user.email,
        notes=notes,
        pdf_filename=pdf_filename,
    ))


# ─── Эндпоинты ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[HRCOut])
def list_hrc(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.HighRiskCountry)
    if not include_inactive:
        q = q.filter(models.HighRiskCountry.is_active == True)
    return q.order_by(models.HighRiskCountry.name_ru).all()


@router.get("/history", response_model=List[AuditOut])
def get_history(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.HighRiskCountryAudit)
        .order_by(models.HighRiskCountryAudit.changed_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/measures-info")
def get_measures_info(current_user: models.User = Depends(get_current_user)):
    return MEASURES_DESCRIPTIONS


@router.post("", response_model=HRCOut)
def add_country(
    data: HRCCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    country = models.HighRiskCountry(**data.model_dump())
    db.add(country)
    db.flush()
    _log(db, current_user, "added", country, new_val=data.model_dump())
    db.commit()
    db.refresh(country)
    return country


@router.patch("/{country_id}", response_model=HRCOut)
def update_country(
    country_id: int,
    data: HRCUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    country = db.query(models.HighRiskCountry).filter(
        models.HighRiskCountry.id == country_id
    ).first()
    if not country:
        raise HTTPException(status_code=404, detail="Страна не найдена")

    old_val = {
        "name_ru": country.name_ru, "name_en": country.name_en,
        "basis": country.basis, "measures": country.measures,
        "order_ref": country.order_ref, "is_active": country.is_active,
    }

    updates = data.model_dump(exclude_none=True)
    action = "deactivated" if updates.get("is_active") == False else \
             "reactivated" if updates.get("is_active") == True and not country.is_active else \
             "updated"

    for k, v in updates.items():
        setattr(country, k, v)

    _log(db, current_user, action, country, old_val=old_val, new_val=updates)
    db.commit()
    db.refresh(country)
    return country


@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    order_ref: str = Form(...),
    notes: str = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Допускается только PDF")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = f"hrc_{ts}_{file.filename}"
    dest = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    _log(db, current_user, "pdf_uploaded", None,
         notes=f"Приказ: {order_ref}. {notes or ''}".strip(),
         pdf_filename=safe_name)
    db.commit()

    return {"ok": True, "filename": safe_name, "order_ref": order_ref}


@router.get("/pdf/{filename}")
def download_pdf(
    filename: str,
    current_user: models.User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path) or ".." in filename:
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(path, media_type="application/pdf", filename=filename)
