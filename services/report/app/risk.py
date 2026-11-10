"""Default-risk score per customer and a cash forecast, from the payment history the report store keeps.

Deliberately simple and explainable (rules, not a trained model), so every number can be justified to a user:

  score (0..100, higher = riskier) = 35 * share of paid invoices paid more than 3 days late
                                   + min(30, 2 * average days late)
                                   + min(35, 10 * invoices overdue now + days the oldest one is overdue)

  level: under 25 LOW, under 50 MEDIUM, otherwise HIGH; NO_DATA when the customer has no history at all.

The forecast then weighs every unpaid invoice by the chance of it being paid:
  not yet due : 1 - 0.6 * score/100   (between 40% and 100%), expected on due date + the customer's average delay
  overdue     : 0.6 - 0.5 * score/100 - min(0.3, days overdue/100), never below 10%, expected "this month"
"""
from datetime import date, timedelta

LOW, MEDIUM, HIGH, NO_DATA = "LOW", "MEDIUM", "HIGH", "NO_DATA"
ENOUGH_HISTORY = 3  # paid invoices needed before the score is considered reliable


def level_of(score: int) -> str:
    return LOW if score < 25 else MEDIUM if score < 50 else HIGH


def score_customer(paid: int, late: int, total_delay_days: int, overdue_days: list[int]) -> dict:
    """overdue_days: for every invoice of the customer that is overdue now, how many days past due."""
    if paid == 0 and not overdue_days:
        return {"score": 0, "level": NO_DATA, "avgDelayDays": 0.0, "lateRate": 0.0, "limitedData": True}
    avg_delay = total_delay_days / paid if paid else 0.0
    late_rate = late / paid if paid else 0.0
    oldest = max(overdue_days) if overdue_days else 0
    points = 35 * late_rate + min(30, 2 * avg_delay) + min(35, 10 * len(overdue_days) + oldest)
    score = min(100, round(points))
    return {
        "score": score,
        "level": level_of(score),
        "avgDelayDays": round(avg_delay, 1),
        "lateRate": round(late_rate, 2),
        "limitedData": paid < ENOUGH_HISTORY,
    }


def payment_probability(score: int, overdue_days: int) -> float:
    if overdue_days > 0:
        return max(0.1, 0.6 - 0.5 * score / 100 - min(0.3, overdue_days / 100))
    return 1 - 0.6 * score / 100


def _month(d: date) -> str:
    return d.strftime("%Y-%m")


def _add_months(first_of_month: date, n: int) -> date:
    index = first_of_month.year * 12 + first_of_month.month - 1 + n
    return date(index // 12, index % 12 + 1, 1)


def forecast(unpaid: list[dict], risk_by_customer: dict[str, dict], received_this_month: int, today: date,
             fallback_delay_days: float = 0.0, months: int = 3) -> list[dict]:
    """unpaid: invoices OPEN or OVERDUE with amountCents, customerId and dueDate (YYYY-MM-DD).

    Returns one entry per month, starting with the current one:
      nominalCents  what is due in the month if everybody paid on time (overdue invoices count in the current month)
      expectedCents what is expected to be received, each invoice weighed by its chance of being paid
      receivedCents already received (current month only)
    """
    first = today.replace(day=1)
    buckets = {_month(_add_months(first, i)): {"nominalCents": 0, "expectedCents": 0.0} for i in range(months)}
    current = _month(today)
    for invoice in unpaid:
        try:
            due = date.fromisoformat(invoice["dueDate"])
        except ValueError:
            continue
        risk = risk_by_customer.get(invoice.get("customerId", ""), {})
        score = risk.get("score", 0)
        overdue_days = max(0, (today - due).days)
        amount = int(invoice["amountCents"])
        probability = payment_probability(score, overdue_days)
        if overdue_days > 0:
            nominal_month = expected_month = current
        else:
            delay = risk.get("avgDelayDays") if risk.get("level") not in (None, NO_DATA) else fallback_delay_days
            nominal_month = _month(due)
            expected_month = _month(due + timedelta(days=round(delay or 0)))
        if nominal_month in buckets:
            buckets[nominal_month]["nominalCents"] += amount
        if expected_month in buckets:
            buckets[expected_month]["expectedCents"] += amount * probability
    return [
        {
            "month": month,
            "receivedCents": received_this_month if month == current else 0,
            "nominalCents": data["nominalCents"],
            "expectedCents": round(data["expectedCents"]),
        }
        for month, data in buckets.items()
    ]
