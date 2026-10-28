# Kafka event contract

Single source of truth for the messages exchanged between services. Only **billing-service** publishes, and always
through the transactional outbox. Notification and report services only consume.

## Topics

| Topic | Published when | Consumed by |
|---|---|---|
| `invoice.created` | An invoice is issued | notification, report |
| `invoice.paid` | An invoice is marked as paid (from `OPEN` or `OVERDUE`) | notification, report |
| `invoice.overdue` | The daily job moves an `OPEN` invoice past its due date to `OVERDUE` | notification, report |
| `invoice.canceled` | An invoice is canceled (from `OPEN` or `OVERDUE`) | report (notification ignores it) |

* Created with 3 partitions and `retention.ms=-1` (messages are kept forever, so the report service can rebuild
  its numbers by replaying the topics from the beginning).
* **Message key = `invoiceId`.** All events of one invoice go to the same partition and are read in order.

## Payload

```json
{
  "eventId": "7b1e4c2a-9f3d-4e8b-a1c5-2d6f8e9a0b3c",
  "correlationId": "c41d9e70-2b8a-4f61-9d3e-5a7b1c0f8e24",
  "type": "invoice.paid",
  "occurredAt": "2026-11-05T14:32:00Z",
  "invoiceId": "0b0f7f3a-6f0e-4a54-8a8c-6f0f6f1f1a11",
  "customerId": "8a9d3c52-0f4e-47f5-9a0e-2f6a5b6f1c22",
  "customerEmail": "cliente@exemplo.com",
  "amountCents": 150000,
  "dueDate": "2026-11-10"
}
```

| Field | Meaning |
|---|---|
| `eventId` | Unique per message. Consumers store the ids they processed and ignore repeats (idempotent consumer). |
| `correlationId` | Born in the HTTP request (`X-Correlation-Id` header) and copied to the logs of every service. |
| `type` | Same as the topic name. |
| `occurredAt` | UTC instant of the change. |
| `amountCents` | Integer cents. Never a decimal number. |
| `dueDate` | Calendar date (no time). "Today" is computed in `America/Sao_Paulo`. |

The event does **not** carry the previous status. A consumer that needs it (the report service) keeps its own state
per invoice.

## Delivery guarantees

* The outbox publisher sends **at least once**: the same `eventId` can arrive twice.
* Consumers must be idempotent: check the `eventId` before applying anything.
* Ordering is guaranteed only per `invoiceId` (the message key).
