import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from . import config
from .auth import current_org
from .consumer import run_consumer
from .logging_setup import setup_logging
from .store import SAO_PAULO, ReportStore, current_month


def delinquency_rate(totals: dict) -> float:
    """Overdue amount as a percentage of everything that is still valid (open + overdue + received)."""
    base = totals["openCents"] + totals["overdueCents"] + totals["receivedCents"]
    return round(totals["overdueCents"] * 100 / base, 2) if base else 0.0


def create_app(store: ReportStore | None = None, start_consumer: bool = True) -> FastAPI:
    redis: Redis | None = None
    if store is None:
        redis = Redis.from_url(config.REDIS_URL, decode_responses=True)
        store = ReportStore(redis)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        setup_logging()
        task = asyncio.create_task(run_consumer(store)) if start_consumer else None
        yield
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if redis:
            await redis.aclose()

    app = FastAPI(title="report-service", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])

    @app.get("/health")
    async def health():
        return {"status": "UP"}

    @app.get("/reports/summary")
    async def summary(org: str = Depends(current_org)):
        month = current_month()
        totals = await store.totals(org)
        current = await store.month(org, month)
        return {
            "month": month,
            "issuedCents": current["issuedCents"],
            "receivedCents": current["receivedCents"],
            "openCents": totals["openCents"],
            "overdueCents": totals["overdueCents"],
            "delinquencyRate": delinquency_rate(totals),
            "allTime": totals,
        }

    @app.get("/reports/monthly")
    async def monthly(year: int | None = None, org: str = Depends(current_org)):
        year = year or datetime.now(SAO_PAULO).year
        months = []
        for number in range(1, 13):
            key = f"{year}-{number:02d}"
            months.append({"month": key, **await store.month(org, key)})
        return months

    @app.get("/reports/overdue")
    async def overdue(org: str = Depends(current_org)):
        return await store.overdue_invoices(org)

    return app


app = create_app()
