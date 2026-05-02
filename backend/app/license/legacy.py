"""
Лицензионный контроль.
При старте и раз в сутки приложение проверяет ключ у нашего сервера.
Если ключ истёк — новые записи блокируются, чтение остаётся.
"""

import httpx
from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.database import settings
from app import models


async def validate_license(db: Session, company: models.Company) -> bool:
    """
    Проверяет лицензию компании у центрального сервера лицензий.
    Возвращает True если активна, False если истекла.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.LICENSE_SERVER_URL}/validate",
                json={
                    "license_key": company.license_key,
                    "company_name": company.name,
                }
            )
            data = response.json()

            # Обновляем статус в локальной БД
            if data.get("valid"):
                company.license_status = models.LicenseStatus.ACTIVE
                company.license_expires_at = datetime.fromisoformat(data["expires_at"])
                company.max_clients = data.get("max_clients", 100)
            else:
                company.license_status = models.LicenseStatus.EXPIRED

            db.commit()
            return data.get("valid", False)

    except Exception:
        # Если сервер лицензий недоступен — работаем по локальному статусу
        # (grace period: не блокируем сразу если сервер временно упал)
        if company.license_expires_at and company.license_expires_at > datetime.utcnow():
            return True
        return False


def check_write_permission(company: models.Company):
    """Вызывается перед любой операцией записи."""
    if company.license_status == models.LicenseStatus.EXPIRED:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Лицензия истекла. Обратитесь к поставщику для продления."
        )


def check_client_limit(db: Session, company: models.Company):
    """Проверяет не превышен ли лимит клиентов."""
    client_count = db.query(models.Client).filter(
        models.Client.company_id == company.id,
        models.Client.is_active == True
    ).count()

    if client_count >= company.max_clients:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Достигнут лимит клиентов ({company.max_clients}). Обновите тариф."
        )
