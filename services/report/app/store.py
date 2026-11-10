"""Report numbers kept in Redis, updated by the Kafka events.

Keys (all under "report:"):
  processed          SET   eventIds already applied (idempotency)
  invoice:{id}       HASH  status, amountCents, customerId, dueDate  (state per invoice)
  totals             HASH  issuedCents, receivedCents, openCents, overdueCents, canceledCents
  month:{YYYY-MM}    HASH  issuedCents, receivedCents
  overdue            SET   invoiceIds currently OVERDUE

The event does not carry the previous status, so the status of each invoice is stored here. That is what lets
"OVERDUE -> PAID" move the amount from the overdue total to the received total.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from redis.asyncio import Redis

log = logging.getLogger("report.store")

PREFIX = "report:"
K_PROCESSED = PREFIX + "processed"
K_TOTALS = PREFIX + "totals"
K_OVERDUE = PREFIX + "overdue"


def k_invoice(invoice_id: str) -> str:
    return f"{PREFIX}invoice:{invoice_id}"


def k_month(month: str) -> str:
    return f"{PREFIX}month:{month}"


SAO_PAULO = ZoneInfo("America/Sao_Paulo")


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
        if await self.r.sismember(K_PROCESSED, event_id):
            return "duplicate"

        kind = event["type"]
        invoice_id = event["invoiceId"]
        state = await self.r.hgetall(k_invoice(invoice_id))
        status = state.get("status")
        amount = int(state["amountCents"]) if state else int(event["amountCents"])
        month = month_of(event)

        pipe = self.r.pipeline(transaction=True)  # state change and "processed" mark happen together
        outcome = "applied"

        if kind == "invoice.created":
            if status is not None:
                outcome = "ignored"
            else:
                pipe.hset(k_invoice(invoice_id), mapping={
                    "status": "OPEN", "amountCents": amount,
                    "customerId": event.get("customerId", ""), "dueDate": event.get("dueDate", ""),
                })
                pipe.hincrby(K_TOTALS, "issuedCents", amount)
                pipe.hincrby(K_TOTALS, "openCents", amount)
                pipe.hincrby(k_month(month), "issuedCents", amount)

        elif kind == "invoice.overdue":
            if status != "OPEN":
                outcome = "ignored"
            else:
                pipe.hset(k_invoice(invoice_id), "status", "OVERDUE")
                pipe.hincrby(K_TOTALS, "openCents", -amount)
                pipe.hincrby(K_TOTALS, "overdueCents", amount)
                pipe.sadd(K_OVERDUE, invoice_id)

        elif kind == "invoice.paid":
            if status not in ("OPEN", "OVERDUE"):
                outcome = "ignored"
            else:
                self._leave_current_bucket(pipe, status, invoice_id, amount)
                pipe.hset(k_invoice(invoice_id), "status", "PAID")
                pipe.hincrby(K_TOTALS, "receivedCents", amount)
                pipe.hincrby(k_month(month), "receivedCents", amount)

        elif kind == "invoice.canceled":
            if status not in ("OPEN", "OVERDUE"):
                outcome = "ignored"
            else:
                self._leave_current_bucket(pipe, status, invoice_id, amount)
                pipe.hset(k_invoice(invoice_id), "status", "CANCELED")
                pipe.hincrby(K_TOTALS, "canceledCents", amount)

        else:
            outcome = "ignored"

        pipe.sadd(K_PROCESSED, event_id)
        await pipe.execute()
        log.info("Event %s", outcome, extra={
            "eventId": event_id, "correlationId": event.get("correlationId"),
            "invoiceId": invoice_id, "type": kind,
        })
        return outcome

    @staticmethod
    def _leave_current_bucket(pipe, status: str, invoice_id: str, amount: int) -> None:
        if status == "OPEN":
            pipe.hincrby(K_TOTALS, "openCents", -amount)
        else:
            pipe.hincrby(K_TOTALS, "overdueCents", -amount)
            pipe.srem(K_OVERDUE, invoice_id)

    # ----- reads -----

    async def totals(self) -> dict:
        raw = await self.r.hgetall(K_TOTALS)
        return {key: int(raw.get(key, 0)) for key in
                ("issuedCents", "receivedCents", "openCents", "overdueCents", "canceledCents")}

    async def month(self, month: str) -> dict:
        raw = await self.r.hgetall(k_month(month))
        return {"issuedCents": int(raw.get("issuedCents", 0)), "receivedCents": int(raw.get("receivedCents", 0))}

    async def overdue_invoices(self) -> list[dict]:
        ids = sorted(await self.r.smembers(K_OVERDUE))
        result = []
        for invoice_id in ids:
            raw = await self.r.hgetall(k_invoice(invoice_id))
            if raw:
                result.append({
                    "invoiceId": invoice_id, "customerId": raw.get("customerId", ""),
                    "amountCents": int(raw["amountCents"]), "dueDate": raw.get("dueDate", ""),
                })
        result.sort(key=lambda item: item["dueDate"])
        return result

    async def clear(self) -> int:
        """Deletes every report key (used by the rebuild command)."""
        keys = [key async for key in self.r.scan_iter(match=PREFIX + "*")]
        if keys:
            await self.r.delete(*keys)
        return len(keys)
