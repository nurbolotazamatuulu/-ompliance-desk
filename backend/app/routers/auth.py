from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app import models
from app.auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


@router.post("/login", response_model=TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    # Ищем пользователя по email
    user = db.query(models.User).filter(
        models.User.email == form_data.username,
        models.User.is_active == True
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль"
        )

    # Проверяем активность компании
    if not user.company.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Компания заблокирована"
        )

    # Обновляем время последнего входа
    user.last_login_at = datetime.utcnow()
    db.commit()

    # Создаём токен (в него зашиваем id пользователя и компании)
    token = create_access_token(data={
        "sub": str(user.id),
        "company_id": user.company_id,
        "role": user.role.value
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "company_id": user.company_id,
            "company_name": user.company.name
        }
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    """Возвращает данные текущего пользователя по токену."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.value,
        "company_id": current_user.company_id,
        "company_name": current_user.company.name
    }
