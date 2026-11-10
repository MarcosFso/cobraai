import time
from datetime import date

import fakeredis
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import JWT_SECRET
from app.main import build_risk, create_app
from app.risk import HIGH, LOW, MEDIUM, NO_DATA, forecast, payment_probability, score_customer
from app.store import ReportStore, days_late

ORG_A = "aaaaaaaa-0000-4000-8000-000000000001"
ORG_B = "bbbbbbbb-0000-4000-8000-000000000002"


@pytest.fixture
async def store():
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    yield ReportStore(redis)
    await redis.aclose()


def event(kind, invoice, customer="cus-1", due="2026-11-10", occurred="2026-11-05T14:00:00Z", amount=100_00, org=ORG_A, name="Cliente Um"):
    return {
        "eventId": f"{kind}-{invoice}-{org}", "correlationId": "c", "type": kind, "occurredAt": occurred, "orgId": org,
        "invoiceId": invoice, "customerId": customer, "customerName": name, "customerEmail": "a@b.com",
        "amountCents": amount, "dueDate": due,
    }


def bearer(org=ORG_A):
    token = jwt.encode({"sub": "u", "org": org, "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


# ----- the score -----

def test_customer_without_history_has_no_score():
    result = score_customer(0, 0, 0, [])
    assert result["level"] == NO_DATA and result["limitedData"]


def test_always_on_time_is_low_risk():
    result = score_customer(paid=8, late=0, total_delay_days=0, overdue_days=[])
    assert result["score"] == 0 and result["level"] == LOW and not result["limitedData"]


def test_often_late_is_higher_than_rarely_late():
    rarely = score_customer(paid=10, late=1, total_delay_days=2, overdue_days=[])
    often = score_customer(paid=10, late=8, total_delay_days=80, overdue_days=[])
    assert often["score"] > rarely["score"]
    assert often["level"] == MEDIUM and rarely["level"] == LOW
    assert often["avgDelayDays"] == 8.0 and often["lateRate"] == 0.8
    # late on most invoices AND something overdue right now is the high-risk profile
    assert score_customer(paid=10, late=8, total_delay_days=80, overdue_days=[20])["level"] == HIGH


def test_an_overdue_invoice_raises_the_score_and_old_ones_raise_it_more():
    base = score_customer(paid=5, late=0, total_delay_days=0, overdue_days=[])
    recent = score_customer(paid=5, late=0, total_delay_days=0, overdue_days=[3])
    old = score_customer(paid=5, late=0, total_delay_days=0, overdue_days=[45])
    assert base["score"] < recent["score"] < old["score"]
    assert old["level"] == MEDIUM


def test_score_is_capped_at_100():
    assert score_customer(5, 5, 500, [90, 60, 30, 20])["score"] == 100


def test_few_payments_means_limited_data():
    assert score_customer(2, 1, 5, [])["limitedData"] is True


def test_riskier_customers_are_less_likely_to_pay():
    assert payment_probability(0, 0) > payment_probability(80, 0)
    assert payment_probability(30, 0) > payment_probability(30, 20)  # overdue is worse than not yet due
    assert payment_probability(100, 200) >= 0.1


# ----- days late -----

def test_days_late_counts_calendar_days_in_sao_paulo():
    assert days_late("2026-11-10", {"occurredAt": "2026-11-15T14:00:00Z"}) == 5
    assert days_late("2026-11-10", {"occurredAt": "2026-11-10T14:00:00Z"}) == 0
    assert days_late("2026-11-10", {"occurredAt": "2026-11-02T14:00:00Z"}) == 0  # early is not negative
    assert days_late("2026-11-10", {"occurredAt": "2026-11-11T01:00:00Z"}) == 0  # still the 10th in Sao Paulo
    assert days_late("", {"occurredAt": "2026-11-11T01:00:00Z"}) == 0


# ----- the forecast -----

TODAY = date(2026, 11, 10)


def test_forecast_weighs_unpaid_invoices_and_includes_received():
    unpaid = [{"customerId": "good", "amountCents": 100_00, "dueDate": "2026-11-20"}]
    risk = {"good": {"score": 0, "level": LOW, "avgDelayDays": 0.0}}
    months = forecast(unpaid, risk, received_this_month=50_00, today=TODAY)
    assert [m["month"] for m in months] == ["2026-11", "2026-12", "2027-01"]
    assert months[0] == {"month": "2026-11", "receivedCents": 50_00, "nominalCents": 100_00, "expectedCents": 100_00}


def test_a_customer_who_pays_late_moves_money_to_the_next_month():
    unpaid = [{"customerId": "slow", "amountCents": 100_00, "dueDate": "2026-11-28"}]
    risk = {"slow": {"score": 40, "level": MEDIUM, "avgDelayDays": 10.0}}
    months = forecast(unpaid, risk, 0, TODAY)
    assert months[0]["nominalCents"] == 100_00 and months[0]["expectedCents"] == 0
    assert months[1]["nominalCents"] == 0 and months[1]["expectedCents"] == round(100_00 * payment_probability(40, 0))


def test_overdue_invoices_count_in_the_current_month_with_a_low_chance():
    unpaid = [{"customerId": "bad", "amountCents": 100_00, "dueDate": "2026-10-01"}]
    risk = {"bad": {"score": 80, "level": HIGH, "avgDelayDays": 15.0}}
    months = forecast(unpaid, risk, 0, TODAY)
    assert months[0]["nominalCents"] == 100_00
    assert 0 < months[0]["expectedCents"] < 30_00


def test_unknown_customers_use_the_company_average_delay():
    unpaid = [{"customerId": "new", "amountCents": 100_00, "dueDate": "2026-11-28"}]
    months = forecast(unpaid, {}, 0, TODAY, fallback_delay_days=9)
    assert months[0]["expectedCents"] == 0 and months[1]["expectedCents"] == 100_00


def test_forecast_crosses_the_year():
    months = forecast([], {}, 0, date(2026, 12, 15))
    assert [m["month"] for m in months] == ["2026-12", "2027-01", "2027-02"]


# ----- the store builds the history from the events -----

async def test_payment_history_is_built_from_paid_events(store):
    await store.apply(event("invoice.created", "i1", due="2026-11-10"))
    await store.apply(event("invoice.paid", "i1", occurred="2026-11-15T14:00:00Z"))  # 5 days late
    await store.apply(event("invoice.created", "i2", due="2026-12-10"))
    await store.apply(event("invoice.paid", "i2", occurred="2026-12-01T14:00:00Z"))  # early
    history = (await store.customer_history(ORG_A))["cus-1"]
    assert history == {"name": "Cliente Um", "paidCount": 2, "lateCount": 1, "delayDaysTotal": 5}


async def test_up_to_three_days_late_is_not_counted_as_late(store):
    await store.apply(event("invoice.created", "i1", due="2026-11-10"))
    await store.apply(event("invoice.paid", "i1", occurred="2026-11-13T14:00:00Z"))  # 3 days: within the grace
    await store.apply(event("invoice.created", "i2", due="2026-11-10"))
    await store.apply(event("invoice.paid", "i2", occurred="2026-11-14T14:00:00Z"))  # 4 days: late
    history = (await store.customer_history(ORG_A))["cus-1"]
    assert history["lateCount"] == 1 and history["delayDaysTotal"] == 7


async def test_the_same_event_twice_does_not_double_the_history(store):
    await store.apply(event("invoice.created", "i1"))
    paid = event("invoice.paid", "i1", occurred="2026-11-15T14:00:00Z")
    await store.apply(paid)
    assert await store.apply(paid) == "duplicate"
    assert (await store.customer_history(ORG_A))["cus-1"]["paidCount"] == 1


async def test_unpaid_invoices_follow_the_status(store):
    await store.apply(event("invoice.created", "a"))
    await store.apply(event("invoice.created", "b"))
    await store.apply(event("invoice.created", "c"))
    await store.apply(event("invoice.overdue", "b"))
    await store.apply(event("invoice.paid", "a"))
    await store.apply(event("invoice.canceled", "c"))
    unpaid = await store.unpaid_invoices(ORG_A)
    assert [(i["invoiceId"], i["status"]) for i in unpaid] == [("b", "OVERDUE")]


async def test_risk_report_ranks_the_riskiest_customer_first(store):
    for n in range(4):  # a customer who always pays 12 days late
        await store.apply(event("invoice.created", f"slow-{n}", customer="slow", name="Lento", due="2026-06-10"))
        await store.apply(event("invoice.paid", f"slow-{n}", customer="slow", name="Lento", occurred="2026-06-22T14:00:00Z"))
    for n in range(4):  # one who pays on the day
        await store.apply(event("invoice.created", f"ok-{n}", customer="ok", name="Pontual", due="2026-06-10"))
        await store.apply(event("invoice.paid", f"ok-{n}", customer="ok", name="Pontual", occurred="2026-06-10T14:00:00Z"))
    await store.apply(event("invoice.created", "x", customer="newbie", name="Novo", due="2027-01-10"))

    rows, by_customer, _ = await build_risk(store, ORG_A, date(2026, 11, 10))
    assert [r["customerName"] for r in rows] == ["Lento", "Pontual", "Novo"]  # no-data customers go last
    assert rows[0]["avgDelayDays"] == 12.0 and rows[0]["level"] in (MEDIUM, HIGH)
    assert rows[1]["level"] == LOW
    assert by_customer["newbie"]["level"] == NO_DATA


async def test_risk_of_one_company_never_includes_another(store):
    await store.apply(event("invoice.created", "a", org=ORG_A, customer="ca", name="Da A"))
    await store.apply(event("invoice.created", "b", org=ORG_B, customer="cb", name="Da B"))
    rows_a, _, unpaid_a = await build_risk(store, ORG_A, date(2026, 11, 10))
    assert [r["customerName"] for r in rows_a] == ["Da A"]
    assert [i["invoiceId"] for i in unpaid_a] == ["a"]


# ----- the endpoints -----

async def test_endpoints_need_a_login_and_stay_inside_the_company(store):
    await store.apply(event("invoice.created", "a", org=ORG_A, customer="ca", name="Da A", due="2030-01-10"))
    await store.apply(event("invoice.created", "b", org=ORG_B, customer="cb", name="Da B", due="2030-01-10"))
    app = create_app(store=store, start_consumer=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/reports/risk")).status_code == 401
        assert (await client.get("/reports/forecast")).status_code == 401
        risk = (await client.get("/reports/risk", headers=bearer(ORG_A))).json()
        assert [r["customerName"] for r in risk] == ["Da A"]
        months = (await client.get("/reports/forecast", headers=bearer(ORG_B))).json()["months"]
        assert len(months) == 3 and all({"month", "nominalCents", "expectedCents", "receivedCents"} <= set(m) for m in months)
