import fakeredis
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app, delinquency_rate
from app.store import ReportStore


@pytest.fixture
async def store():
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    yield ReportStore(redis)
    await redis.aclose()


def event(kind, invoice="inv-1", event_id=None, amount=100_00, occurred="2026-11-05T14:32:00Z", due="2026-11-10"):
    return {
        "eventId": event_id or f"{kind}-{invoice}",
        "correlationId": "c-1",
        "type": kind,
        "occurredAt": occurred,
        "invoiceId": invoice,
        "customerId": "cus-1",
        "customerEmail": "a@b.com",
        "amountCents": amount,
        "dueDate": due,
    }


async def test_created_goes_to_issued_and_open(store):
    await store.apply(event("invoice.created"))
    totals = await store.totals()
    assert totals["issuedCents"] == 10000 and totals["openCents"] == 10000
    assert (await store.month("2026-11"))["issuedCents"] == 10000


async def test_paid_moves_open_to_received(store):
    await store.apply(event("invoice.created"))
    await store.apply(event("invoice.paid"))
    totals = await store.totals()
    assert totals["openCents"] == 0 and totals["receivedCents"] == 10000
    assert (await store.month("2026-11"))["receivedCents"] == 10000


async def test_overdue_then_paid_leaves_the_overdue_total(store):
    await store.apply(event("invoice.created"))
    await store.apply(event("invoice.overdue"))
    assert (await store.totals())["overdueCents"] == 10000
    assert len(await store.overdue_invoices()) == 1

    await store.apply(event("invoice.paid"))
    totals = await store.totals()
    assert totals["overdueCents"] == 0 and totals["receivedCents"] == 10000
    assert await store.overdue_invoices() == []


async def test_canceled_leaves_open_and_overdue_totals(store):
    await store.apply(event("invoice.created", "a"))
    await store.apply(event("invoice.created", "b"))
    await store.apply(event("invoice.overdue", "b"))
    await store.apply(event("invoice.canceled", "a"))
    await store.apply(event("invoice.canceled", "b"))
    totals = await store.totals()
    assert totals["openCents"] == 0 and totals["overdueCents"] == 0
    assert totals["canceledCents"] == 20000 and totals["receivedCents"] == 0
    assert await store.overdue_invoices() == []


async def test_same_event_twice_is_applied_once(store):
    created = event("invoice.created")
    assert await store.apply(created) == "applied"
    assert await store.apply(created) == "duplicate"
    assert (await store.totals())["issuedCents"] == 10000


async def test_impossible_transitions_are_ignored(store):
    await store.apply(event("invoice.created"))
    await store.apply(event("invoice.paid"))
    assert await store.apply(event("invoice.canceled", event_id="x1")) == "ignored"
    assert await store.apply(event("invoice.paid", event_id="x2")) == "ignored"
    assert await store.apply(event("invoice.overdue", event_id="x3")) == "ignored"
    totals = await store.totals()
    assert totals["receivedCents"] == 10000 and totals["canceledCents"] == 0


async def test_clear_wipes_everything_including_processed_ids(store):
    created = event("invoice.created")
    await store.apply(created)
    await store.clear()
    assert (await store.totals())["issuedCents"] == 0
    # after a rebuild the same event must count again
    assert await store.apply(created) == "applied"
    assert (await store.totals())["issuedCents"] == 10000


def test_delinquency_rate():
    assert delinquency_rate({"openCents": 0, "overdueCents": 0, "receivedCents": 0}) == 0.0
    assert delinquency_rate({"openCents": 50, "overdueCents": 25, "receivedCents": 25}) == 25.0


async def test_http_endpoints(store):
    app = create_app(store=store, start_consumer=False)
    await store.apply(event("invoice.created", occurred="2026-11-05T10:00:00Z"))
    await store.apply(event("invoice.overdue"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/health")).json() == {"status": "UP"}

        summary = (await client.get("/reports/summary")).json()
        assert summary["overdueCents"] == 10000 and summary["delinquencyRate"] == 100.0

        monthly = (await client.get("/reports/monthly", params={"year": 2026})).json()
        assert len(monthly) == 12 and monthly[10]["month"] == "2026-11"
        assert monthly[10]["issuedCents"] == 10000

        overdue = (await client.get("/reports/overdue")).json()
        assert overdue[0]["invoiceId"] == "inv-1"
