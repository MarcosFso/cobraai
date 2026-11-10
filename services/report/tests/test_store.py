import time

import fakeredis
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import JWT_SECRET
from app.main import create_app, delinquency_rate
from app.store import ReportStore, month_of

ORG_A = "aaaaaaaa-0000-4000-8000-000000000001"
ORG_B = "bbbbbbbb-0000-4000-8000-000000000002"


@pytest.fixture
async def store():
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    yield ReportStore(redis)
    await redis.aclose()


def event(kind, invoice="inv-1", event_id=None, amount=100_00, occurred="2026-11-05T14:32:00Z", due="2026-11-10", org=ORG_A, **extra):
    return {
        "eventId": event_id or f"{kind}-{invoice}-{org}",
        "correlationId": "c-1",
        "type": kind,
        "occurredAt": occurred,
        "orgId": org,
        "invoiceId": invoice,
        "customerId": "cus-1",
        "customerEmail": "a@b.com",
        "amountCents": amount,
        "dueDate": due,
        **extra,
    }


def token(org=ORG_A, secret=JWT_SECRET, expires_in=3600):
    return jwt.encode({"sub": "user-1", "org": org, "exp": int(time.time()) + expires_in}, secret, algorithm="HS256")


def bearer(**kwargs):
    return {"Authorization": f"Bearer {token(**kwargs)}"}


async def test_created_goes_to_issued_and_open(store):
    await store.apply(event("invoice.created"))
    totals = await store.totals(ORG_A)
    assert totals["issuedCents"] == 10000 and totals["openCents"] == 10000
    assert (await store.month(ORG_A, "2026-11"))["issuedCents"] == 10000


async def test_paid_moves_open_to_received(store):
    await store.apply(event("invoice.created"))
    await store.apply(event("invoice.paid"))
    totals = await store.totals(ORG_A)
    assert totals["openCents"] == 0 and totals["receivedCents"] == 10000
    assert (await store.month(ORG_A, "2026-11"))["receivedCents"] == 10000


async def test_overdue_then_paid_leaves_the_overdue_total(store):
    await store.apply(event("invoice.created"))
    await store.apply(event("invoice.overdue"))
    assert (await store.totals(ORG_A))["overdueCents"] == 10000
    assert len(await store.overdue_invoices(ORG_A)) == 1

    await store.apply(event("invoice.paid"))
    totals = await store.totals(ORG_A)
    assert totals["overdueCents"] == 0 and totals["receivedCents"] == 10000
    assert await store.overdue_invoices(ORG_A) == []


async def test_canceled_leaves_open_and_overdue_totals(store):
    await store.apply(event("invoice.created", "a"))
    await store.apply(event("invoice.created", "b"))
    await store.apply(event("invoice.overdue", "b"))
    await store.apply(event("invoice.canceled", "a"))
    await store.apply(event("invoice.canceled", "b"))
    totals = await store.totals(ORG_A)
    assert totals["openCents"] == 0 and totals["overdueCents"] == 0
    assert totals["canceledCents"] == 20000 and totals["receivedCents"] == 0
    assert await store.overdue_invoices(ORG_A) == []


async def test_same_event_twice_is_applied_once(store):
    created = event("invoice.created")
    assert await store.apply(created) == "applied"
    assert await store.apply(created) == "duplicate"
    assert (await store.totals(ORG_A))["issuedCents"] == 10000


async def test_impossible_transitions_are_ignored(store):
    await store.apply(event("invoice.created"))
    await store.apply(event("invoice.paid"))
    assert await store.apply(event("invoice.canceled", event_id="x1")) == "ignored"
    assert await store.apply(event("invoice.paid", event_id="x2")) == "ignored"
    assert await store.apply(event("invoice.overdue", event_id="x3")) == "ignored"
    totals = await store.totals(ORG_A)
    assert totals["receivedCents"] == 10000 and totals["canceledCents"] == 0


async def test_events_without_a_company_are_ignored(store):
    legacy = event("invoice.created")
    del legacy["orgId"]
    assert await store.apply(legacy) == "ignored"


async def test_clear_wipes_everything_including_processed_ids(store):
    created = event("invoice.created")
    await store.apply(created)
    await store.clear()
    assert (await store.totals(ORG_A))["issuedCents"] == 0
    # after a rebuild the same event must count again
    assert await store.apply(created) == "applied"
    assert (await store.totals(ORG_A))["issuedCents"] == 10000


async def test_companies_never_share_numbers(store):
    # the same invoice id in two companies is two different invoices
    await store.apply(event("invoice.created", "same-id", amount=50_00, org=ORG_A))
    await store.apply(event("invoice.created", "same-id", amount=70_00, org=ORG_B))
    await store.apply(event("invoice.overdue", "same-id", org=ORG_B))

    a, b = await store.totals(ORG_A), await store.totals(ORG_B)
    assert a["openCents"] == 5000 and a["overdueCents"] == 0
    assert b["openCents"] == 0 and b["overdueCents"] == 7000
    assert await store.overdue_invoices(ORG_A) == []
    assert [item["invoiceId"] for item in await store.overdue_invoices(ORG_B)] == ["same-id"]
    assert (await store.month(ORG_A, "2026-11"))["issuedCents"] == 5000
    assert (await store.month(ORG_B, "2026-11"))["issuedCents"] == 7000


async def test_demo_sandbox_keys_expire(store):
    await store.apply(event("invoice.created", demo=True))
    ttl = await store.r.ttl(f"report:{ORG_A}:totals")
    assert 0 < ttl <= 48 * 3600
    await store.apply(event("invoice.created", "other", org=ORG_B))  # a real company: no expiry
    assert await store.r.ttl(f"report:{ORG_B}:totals") == -1


def test_month_is_counted_in_sao_paulo_time():
    # 01:00 UTC on Dec 1st is still 22:00 of Nov 30th in Sao Paulo
    assert month_of({"occurredAt": "2026-12-01T01:00:00Z"}) == "2026-11"
    assert month_of({"occurredAt": "2026-11-05T14:32:00Z"}) == "2026-11"


def test_delinquency_rate():
    assert delinquency_rate({"openCents": 0, "overdueCents": 0, "receivedCents": 0}) == 0.0
    assert delinquency_rate({"openCents": 50, "overdueCents": 25, "receivedCents": 25}) == 25.0


async def test_http_endpoints_need_a_valid_token(store):
    app = create_app(store=store, start_consumer=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/health")).json() == {"status": "UP"}  # health stays public

        for path in ("/reports/summary", "/reports/monthly", "/reports/overdue"):
            assert (await client.get(path)).status_code == 401
            assert (await client.get(path, headers={"Authorization": "Bearer lixo"})).status_code == 401
            assert (await client.get(path, headers=bearer(secret="outro-segredo-que-nao-confere-12345"))).status_code == 401
            assert (await client.get(path, headers=bearer(expires_in=-10))).status_code == 401


async def test_http_endpoints_only_show_the_callers_company(store):
    app = create_app(store=store, start_consumer=False)
    await store.apply(event("invoice.created", "a1", amount=10_000, occurred="2026-11-05T10:00:00Z", org=ORG_A))
    await store.apply(event("invoice.overdue", "a1", org=ORG_A))
    await store.apply(event("invoice.created", "b1", amount=99_900, occurred="2026-11-05T10:00:00Z", org=ORG_B))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        a = (await client.get("/reports/summary", headers=bearer(org=ORG_A))).json()
        assert a["overdueCents"] == 10_000 and a["delinquencyRate"] == 100.0

        b = (await client.get("/reports/summary", headers=bearer(org=ORG_B))).json()
        assert b["overdueCents"] == 0 and b["openCents"] == 99_900

        monthly_a = (await client.get("/reports/monthly", params={"year": 2026}, headers=bearer(org=ORG_A))).json()
        assert len(monthly_a) == 12 and monthly_a[10]["issuedCents"] == 10_000
        monthly_b = (await client.get("/reports/monthly", params={"year": 2026}, headers=bearer(org=ORG_B))).json()
        assert monthly_b[10]["issuedCents"] == 99_900

        assert [i["invoiceId"] for i in (await client.get("/reports/overdue", headers=bearer(org=ORG_A))).json()] == ["a1"]
        assert (await client.get("/reports/overdue", headers=bearer(org=ORG_B))).json() == []

        # a company that never had an invoice simply sees zeros
        empty = (await client.get("/reports/summary", headers=bearer(org="cccccccc-0000-4000-8000-000000000003"))).json()
        assert empty["openCents"] == 0 and empty["issuedCents"] == 0
