"""Report numbers kept in Redis, one set per company, updated by the Kafka events.

Keys (all under "report:", {org} is the company id that comes in every event):
  processed               SET   eventIds already applied (idempotency)
  {org}:invoice:{id}      HASH  status, amountCents, customerId, dueDate  (state per invoice)
  {org}:totals            HASH  issuedCents, receivedCents, openCents, overdueCents, canceledCents
  {org}:month:{YYYY-MM}   HASH  issuedCents, receivedCents
  {org}:overdue           SET   invoiceIds currently OVERDUE

Every read and every write is scoped by the company, so one company can never see another one's numbers.
The event does not carry the previous status, so the status of each invoice is stored here. That is what lets
"OVERDUE -> PAID" move the amount from the overdue total to the received total.

Demo sandboxes are throwaway: their keys expire (DEMO_TTL_SECONDS) so Redis does not fill up with old demos.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from redis.asyncio import Redis

log = logging.getLogger("report.store")

PREFIX = "report:"
K_PROCESSED = PREFIX + "processed"
DEMO_TTL_SECONDS = 48 * 3600
SAO_PAULO = ZoneInfo("America/Sao_Paulo")


def k_invoice(org: str, invoice_id: str) -> str:
    return f"{PREFIX}{org}:invoice:{invoice_id}"


def k_totals(org: str) -> str:
    return f"{PREFIX}{org}:totals"


def k_overdue(org: str) -> str:
    return f"{PREFIX}{org}:overdue"


def k_month(org: str, month: str) -> str:
    return f"{PREFIX}{org}:month:{month}"


def current_month() -> str:
    return datetime.now(SAO_PAULO).strftime("%Y-%m")


def month_of(event: dict) -> str:
    """Month (YYYY-MM) of the event in Sao Paulo time, the same calendar the billing service uses for due dates."""
    occurred = event.get("occurredAt") or ""
    try:
        return datetime.fromisoformat(occurred).astimezone(SAO_PAULO).strftime("%Y-%m")
    except ValueError:
        return current_month()


class ReportStore:
    def __init__(self, redis: Redis):
        self.r = redis

    async def apply(self, event: dict) -> str:
        """Applies one event. Returns 'applied', 'duplicate' or 'ignored'. Safe to call twice with the same event."""
        event_id = event["eventId"]
        org = event.get("orgId")
        if not org:
            log.warning("Event without orgId ignored", extra={"eventId": event_id})
            return "ignored"
        if await self.r.sismember(K_PROCESSED, event_id):
            return "duplicate"

        kind = event["type"]
        invoice_id = event["invoiceId"]
        state = await self.r.hgetall(k_invoice(org, invoice_id))
        status = state.get("status")
        amount = int(state["amountCents"]) if state else int(event["amountCents"])
        month = month_of(event)
        totals = k_totals(org)

        pipe = self.r.pipeline(transaction=True)  # state change and "processed" mark happen together
        outcome = "applied"
        touched: set[str] = set()

        def write(key: str) -> str:
            touched.add(key)
            return key

        if kind == "invoice.created":
            if status is not None:
                outcome = "ignored"
            else:
                pipe.hset(write(k_invoice(org, invoice_id)), mapping={
                    "status": "OPEN", "amountCents": amount,
                    "customerId": event.get("customerId", ""), "dueDate": event.get("dueDate", ""),
                })
                pipe.hincrby(write(totals), "issuedCents", amount)
                pipe.hincrby(totals, "openCents", amount)
                pipe.hincrby(write(k_month(org, month)), "issuedCents", amount)

        elif kind == "invoice.overdue":
            if status != "OPEN":
                outcome = "ignored"
            else:
                pipe.hset(write(k_invoice(org, invoice_id)), "status", "OVERDUE")
                pipe.hincrby(write(totals), "openCents", -amount)
                pipe.hincrby(totals, "overdueCents", amount)
                pipe.sadd(write(k_overdue(org)), invoice_id)

        elif kind == "invoice.paid":
            if status not in ("OPEN", "OVERDUE"):
                outcome = "ignored"
            else:
                self._leave_current_bucket(pipe, org, status, invoice_id, amount, write)
                pipe.hset(write(k_invoice(org, invoice_id)), "status", "PAID")
                pipe.hincrby(write(totals), "receivedCents", amount)
                pipe.hincrby(write(k_month(org, month)), "receivedCents", amount)

        elif kind == "invoice.canceled":
            if status not in ("OPEN", "OVERDUE"):
                outcome = "ignored"
            else:
                self._leave_current_bucket(pipe, org, status, invoice_id, amount, write)
                pipe.hset(write(k_invoice(org, invoice_id)), "status", "CANCELED")
                pipe.hincrby(write(totals), "canceledCents", amount)

        else:
            outcome = "ignored"

        if event.get("demo"):
            for key in touched:
                pipe.expire(key, DEMO_TTL_SECONDS)
        pipe.sadd(K_PROCESSED, event_id)
        await pipe.execute()
        log.info("Event %s", outcome, extra={
            "eventId": event_id, "correlationId": event.get("correlationId"),
            "orgId": org, "invoiceId": invoice_id, "type": kind,
        })
        return outcome

    @staticmethod
    def _leave_current_bucket(pipe, org: str, status: str, invoice_id: str, amount: int, write) -> None:
        if status == "OPEN":
            pipe.hincrby(write(k_totals(org)), "openCents", -amount)
        else:
            pipe.hincrby(write(k_totals(org)), "overdueCents", -amount)
            pipe.srem(write(k_overdue(org)), invoice_id)

    # ----- reads (always for one company) -----

    async def totals(self, org: str) -> dict:
        raw = await self.r.hgetall(k_totals(org))
        return {key: int(raw.get(key, 0)) for key in
                ("issuedCents", "receivedCents", "openCents", "overdueCents", "canceledCents")}

    async def month(self, org: str, month: str) -> dict:
        raw = await self.r.hgetall(k_month(org, month))
        return {"issuedCents": int(raw.get("issuedCents", 0)), "receivedCents": int(raw.get("receivedCents", 0))}

    async def overdue_invoices(self, org: str) -> list[dict]:
        ids = sorted(await self.r.smembers(k_overdue(org)))
        result = []
        for invoice_id in ids:
            raw = await self.r.hgetall(k_invoice(org, invoice_id))
            if raw:
                result.append({
                    "invoiceId": invoice_id, "customerId": raw.get("customerId", ""),
                    "amountCents": int(raw["amountCents"]), "dueDate": raw.get("dueDate", ""),
                })
        result.sort(key=lambda item: item["dueDate"])
        return result

    async def clear(self) -> int:
        """Deletes every report key of every company (used by the rebuild command)."""
        keys = [key async for key in self.r.scan_iter(match=PREFIX + "*")]
        if keys:
            await self.r.delete(*keys)
        return len(keys)
