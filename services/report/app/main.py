import asyncio
from contextlib import asynccontextmanager
from datetime import date, datetime

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from . import config
from .auth import current_org
from .consumer import run_consumer
from .logging_setup import setup_logging
from .risk import NO_DATA, forecast, score_customer
from .store import SAO_PAULO, ReportStore, current_month


def delinquency_rate(totals: dict) -> float:
    """Overdue amount as a percentage of everything that is still valid (open + overdue + received)."""
    base = totals["openCents"] + totals["overdueCents"] + totals["receivedCents"]
    return round(totals["overdueCents"] * 100 / base, 2) if base else 0.0


async def build_risk(store: ReportStore, org: str, today: date) -> tuple[list[dict], dict[str, dict], list[dict]]:
    """Risk of every customer of the company (riskiest first), the same keyed by customer, and the unpaid invoices."""
    history = await store.customer_history(org)
    unpaid = await store.unpaid_invoices(org)
    overdue_days: dict[str, list[int]] = {}
    open_cents: dict[str, int] = {}
    for invoice in unpaid:
        open_cents[invoice["customerId"]] = open_cents.get(invoice["customerId"], 0) + invoice["amountCents"]
        try:
            late = (today - date.fromisoformat(invoice["dueDate"])).days
        except ValueError:
            continue
        if late > 0:
            overdue_days.setdefault(invoice["customerId"], []).append(late)

    rows = []
    for customer_id, data in history.items():
        days = overdue_days.get(customer_id, [])
        rows.append({
            "customerId": customer_id,
            "customerName": data["name"],
            **score_customer(data["paidCount"], data["lateCount"], data["delayDaysTotal"], days),
            "paidCount": data["paidCount"],
            "overdueCount": len(days),
            "oldestOverdueDays": max(days) if days else 0,
            "unpaidCents": open_cents.get(customer_id, 0),
        })
    rows.sort(key=lambda row: (row["level"] == NO_DATA, -row["score"], row["customerName"]))
    return rows, {row["customerId"]: row for row in rows}, unpaid


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

    @app.get("/reports/risk")
    async def risk(org: str = Depends(current_org)):
        """Default-risk score of each customer of the caller's company, riskiest first."""
        rows, _, _ = await build_risk(store, org, datetime.now(SAO_PAULO).date())
        return rows

    @app.get("/reports/forecast")
    async def cash_forecast(org: str = Depends(current_org)):
        """Expected cash for this month and the next two, weighing each unpaid invoice by its customer's risk."""
        today = datetime.now(SAO_PAULO).date()
        rows, by_customer, unpaid = await build_risk(store, org, today)
        paying = [row for row in rows if row["paidCount"]]
        payments = sum(row["paidCount"] for row in paying)
        fallback = sum(row["avgDelayDays"] * row["paidCount"] for row in paying) / payments if payments else 0.0
        received = (await store.month(org, current_month()))["receivedCents"]
        return {"months": forecast(unpaid, by_customer, received, today, fallback_delay_days=fallback)}

    @app.get("/reports/overdue")
    async def overdue(org: str = Depends(current_org)):
        return await store.overdue_invoices(org)

    return app


app = create_app()
