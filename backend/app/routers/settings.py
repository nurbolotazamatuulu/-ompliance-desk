"""
Настройки: профиль компании, управление пользователями, профиль текущего пользователя.
"""

from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext

from app.database import get_db
from app import models
from app.auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Схемы ───────────────────────────────────────────────────────────────────

class CompanyProfile(BaseModel):
    name: str
    legal_form: Optional[str] = None
    inn: Optional[str] = None
    reg_number: Optional[str] = None
    legal_address: Optional[str] = None
    actual_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    activity_types: Optional[str] = None
    license_number: Optional[str] = None
    license_issued_by: Optional[str] = None
    license_issued_at: Optional[datetime] = None
    license_expires_at: Optional[datetime] = None
    gsfr_reg_number: Optional[str] = None
    gsfr_reg_date: Optional[datetime] = None
    aml_officer_name: Optional[str] = None
    aml_officer_position: Optional[str] = None
    aml_officer_phone: Optional[str] = None
    aml_officer_email: Optional[str] = None

    model_config = {"from_attributes": True}


class CompanyOut(CompanyProfile):
    id: int
    license_status: Optional[str] = None
    max_clients: Optional[int] = None
    created_at: Optional[datetime] = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str
    full_name: str
    role: str
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None


# ─── Company profile ──────────────────────────────────────────────────────────

@router.get("/company", response_model=CompanyOut)
def get_company(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = db.query(models.Company).filter(
        models.Company.id == current_user.company_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    return company


@router.put("/company", response_model=CompanyOut)
def update_company(
    data: CompanyProfile,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = db.query(models.Company).filter(
        models.Company.id == current_user.company_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(company, k, v)
    db.commit()
    db.refresh(company)
    return company


@router.get("/company/extract", response_class=HTMLResponse)
def company_extract(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Выписка о компании в формате HTML для печати."""
    company = db.query(models.Company).filter(
        models.Company.id == current_user.company_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Компания не найдена")

    # Статистика
    clients_count = db.query(models.Client).filter(
        models.Client.company_id == company.id,
        models.Client.is_active == True,
    ).count()
    users_count = db.query(models.User).filter(
        models.User.company_id == company.id,
        models.User.is_active == True,
    ).count()

    def fmt(dt) -> str:
        if not dt: return "—"
        return dt.strftime("%d.%m.%Y")

    def val(v) -> str:
        return v if v else "—"

    license_status_label = {
        "active": "Действует", "expired": "Истекла", "suspended": "Приостановлена"
    }.get(company.license_status.value if company.license_status else "", "—")

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Выписка — {company.name}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Times New Roman', serif; font-size: 12pt; color: #1a1a1a; background: #fff; padding: 20mm; }}
    .header {{ text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }}
    .header h1 {{ font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }}
    .header p {{ font-size: 10pt; color: #555; margin-top: 4px; }}
    .stamp {{ display: inline-block; border: 2px solid #1a1a1a; border-radius: 50%; width: 90px; height: 90px;
              line-height: 1.2; text-align: center; font-size: 8pt; font-weight: bold; padding: 8px; margin: 8px auto; }}
    .section {{ margin: 20px 0; }}
    .section-title {{ font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;
                      border-bottom: 1px solid #aaa; padding-bottom: 4px; margin-bottom: 10px; }}
    table {{ width: 100%; border-collapse: collapse; }}
    td {{ padding: 5px 8px; vertical-align: top; }}
    td:first-child {{ width: 45%; color: #555; font-size: 10pt; }}
    td:last-child {{ font-weight: 500; }}
    .badge {{ display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 9pt; font-weight: bold; }}
    .badge-active {{ background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }}
    .badge-expired {{ background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }}
    .footer {{ margin-top: 32px; border-top: 1px solid #aaa; padding-top: 16px; font-size: 9pt; color: #666; }}
    .sign-block {{ display: flex; justify-content: space-between; margin-top: 40px; }}
    .sign-line {{ width: 200px; border-top: 1px solid #1a1a1a; text-align: center; font-size: 9pt; padding-top: 4px; }}
    @media print {{
      body {{ padding: 10mm; }}
      .no-print {{ display: none; }}
    }}
  </style>
</head>
<body>

<div class="no-print" style="background:#f3f4f6;padding:10px;margin-bottom:20px;border-radius:6px;font-family:sans-serif;font-size:11pt;">
  <button onclick="window.print()" style="background:#d4a843;color:#0a0d14;border:none;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer;margin-right:10px;">
    ⬇ Распечатать / Сохранить PDF
  </button>
  <span style="color:#555;">Используйте «Сохранить как PDF» в диалоге печати</span>
</div>

<div class="header">
  <h1>Выписка из реестра субъекта финансового мониторинга</h1>
  <p>Кыргызская Республика &nbsp;·&nbsp; ГСФР при Правительстве КР</p>
  <p style="margin-top:8px; font-size:10pt;">Дата формирования: <strong>{datetime.utcnow().strftime("%d.%m.%Y")}</strong></p>
</div>

<div class="section">
  <div class="section-title">1. Общие сведения о компании</div>
  <table>
    <tr><td>Полное наименование</td><td>{val(company.name)}</td></tr>
    <tr><td>Организационно-правовая форма</td><td>{val(company.legal_form)}</td></tr>
    <tr><td>ИНН</td><td>{val(company.inn)}</td></tr>
    <tr><td>Номер государственной регистрации</td><td>{val(company.reg_number)}</td></tr>
    <tr><td>Юридический адрес</td><td>{val(company.legal_address)}</td></tr>
    <tr><td>Фактический адрес</td><td>{val(company.actual_address)}</td></tr>
    <tr><td>Телефон</td><td>{val(company.phone)}</td></tr>
    <tr><td>Электронная почта</td><td>{val(company.email)}</td></tr>
    <tr><td>Сайт</td><td>{val(company.website)}</td></tr>
    <tr><td>Виды деятельности</td><td>{val(company.activity_types)}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">2. Лицензия ГСФР</div>
  <table>
    <tr><td>Номер лицензии</td><td>{val(company.license_number)}</td></tr>
    <tr><td>Орган, выдавший лицензию</td><td>{val(company.license_issued_by)}</td></tr>
    <tr><td>Дата выдачи</td><td>{fmt(company.license_issued_at)}</td></tr>
    <tr><td>Действительна до</td><td>{fmt(company.license_expires_at)}</td></tr>
    <tr><td>Статус лицензии</td>
        <td><span class="badge {'badge-active' if company.license_status and company.license_status.value == 'active' else 'badge-expired'}">{license_status_label}</span></td></tr>
    <tr><td>Рег. номер в реестре ГСФР</td><td>{val(company.gsfr_reg_number)}</td></tr>
    <tr><td>Дата регистрации в ГСФР</td><td>{fmt(company.gsfr_reg_date)}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">3. Ответственный сотрудник по ПОД/ФТ</div>
  <table>
    <tr><td>ФИО</td><td>{val(company.aml_officer_name)}</td></tr>
    <tr><td>Должность</td><td>{val(company.aml_officer_position)}</td></tr>
    <tr><td>Телефон</td><td>{val(company.aml_officer_phone)}</td></tr>
    <tr><td>Электронная почта</td><td>{val(company.aml_officer_email)}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">4. Использование системы ComplianceDesk</div>
  <table>
    <tr><td>Клиентов в реестре</td><td><strong>{clients_count}</strong></td></tr>
    <tr><td>Пользователей системы</td><td><strong>{users_count}</strong></td></tr>
    <tr><td>Дата регистрации в системе</td><td>{fmt(company.created_at)}</td></tr>
  </table>
</div>

<div class="sign-block">
  <div>
    <div class="sign-line">Ответственный сотрудник</div>
    <div style="text-align:center;font-size:9pt;color:#555;margin-top:4px;">{val(company.aml_officer_name)}</div>
  </div>
  <div style="text-align:center;">
    <div style="border:1px dashed #aaa;width:80px;height:80px;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#aaa;margin:0 auto;">М.П.</div>
  </div>
  <div>
    <div class="sign-line">Дата</div>
    <div style="text-align:center;font-size:9pt;color:#555;margin-top:4px;">{datetime.utcnow().strftime("%d.%m.%Y")}</div>
  </div>
</div>

<div class="footer">
  <p>Документ сформирован автоматически системой ComplianceDesk &nbsp;·&nbsp; {datetime.utcnow().strftime("%d.%m.%Y %H:%M")} UTC</p>
  <p style="margin-top:4px;">Соответствует требованиям Закона КР о ПОД/ФТ и Постановления Правительства КР № 606</p>
</div>

</body>
</html>"""
    return HTMLResponse(content=html)


# ─── Users management ─────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.User).filter(
        models.User.company_id == current_user.company_id
    ).order_by(models.User.created_at).all()


@router.post("/users", response_model=UserOut)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    user = models.User(
        company_id=current_user.company_id,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        hashed_password=pwd_ctx.hash(data.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.company_id == current_user.company_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user_id == current_user.id and data.is_active is False:
        raise HTTPException(status_code=400, detail="Нельзя деактивировать себя")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить собственный аккаунт")
    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.company_id == current_user.company_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    db.delete(user)
    db.commit()
    return {"ok": True}


# ─── Current user profile ─────────────────────────────────────────────────────

@router.get("/profile", response_model=UserOut)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.put("/profile", response_model=UserOut)
def update_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if data.full_name:
        user.full_name = data.full_name
    if data.email:
        existing = db.query(models.User).filter(
            models.User.email == data.email,
            models.User.id != current_user.id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email уже занят")
        user.email = data.email
    db.commit()
    db.refresh(user)
    return user


@router.put("/password")
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not pwd_ctx.verify(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Пароль должен быть не менее 8 символов")
    user.hashed_password = pwd_ctx.hash(data.new_password)
    db.commit()
    return {"ok": True}
