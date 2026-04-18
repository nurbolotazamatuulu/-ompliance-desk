"""
Точка входа приложения.
Здесь FastAPI инициализируется, подключаются все роутеры (модули).
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import auth as auth_router
from app.routers import clients as clients_router
from app.routers import sanctions as sanctions_router
from app.routers import risk as risk_router
from app.routers import ubos as ubos_router
from app.routers import sof as sof_router
from app.routers import documents as documents_router
from app.routers import transactions as transactions_router
from app.routers import dashboard as dashboard_router
from app.routers import regulations as regulations_router
from app.routers import reports as reports_router
from app.routers import settings as settings_router
from app.sanctions_models import SanctionsList, SanctionEntry


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаём все таблицы при старте (если не существуют)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="ComplianceDesk API",
    description="Рабочий стол комплаенс-офицера для VASP",
    version="1.0.0",
    lifespan=lifespan
)

# Разрешаем запросы с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры (модули)
app.include_router(auth_router.router)
app.include_router(clients_router.router)
app.include_router(sanctions_router.router)
app.include_router(risk_router.router)
app.include_router(ubos_router.router)
app.include_router(sof_router.router)
app.include_router(documents_router.router)
app.include_router(transactions_router.router)
app.include_router(dashboard_router.router)
app.include_router(regulations_router.router)
app.include_router(reports_router.router)
app.include_router(settings_router.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ComplianceDesk"}
