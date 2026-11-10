# Kafka event contract

Single source of truth for the messages exchanged between services. Only **billing-service** publishes, and always
through the transactional outbox. Notification and report services only consume.

## Topics

One topic, `invoice.events`, carries every event of an invoice. The kind of event is the `type` field:

| `type` | Published when | Used by |
|---|---|---|
| `invoice.created` | An invoice is issued | notification, report |
| `invoice.paid` | An invoice is marked as paid (from `OPEN` or `OVERDUE`) | notification, report |
| `invoice.overdue` | The daily job moves an `OPEN` invoice past its due date to `OVERDUE` | notification, report |
| `invoice.canceled` | An invoice is canceled (from `OPEN` or `OVERDUE`) | report (notification ignores it) |

* Created with 3 partitions and `retention.ms=-1` (messages are kept forever, so the report service can rebuild
  its numbers by replaying the topic from the beginning).
* **Message key = `invoiceId`.** All events of one invoice go to the same partition and are read in order.
* **Why one topic and not one per event type?** Kafka only guarantees order inside a single partition. With separate
  topics the consumer could receive `invoice.overdue` before `invoice.created` of the same invoice and apply them
  in the wrong order. (The first version of this project did exactly that, and the demo numbers were wrong until
  the events were put in one topic.)

## Payload

```json
{
  "eventId": "7b1e4c2a-9f3d-4e8b-a1c5-2d6f8e9a0b3c",
  "correlationId": "c41d9e70-2b8a-4f61-9d3e-5a7b1c0f8e24",
  "type": "invoice.paid",
  "occurredAt": "2026-11-05T14:32:00Z",
  "orgId": "5d0c1f9e-3b7a-4c52-9e1a-7a2b4c6d8e90",
  "invoiceId": "0b0f7f3a-6f0e-4a54-8a8c-6f0f6f1f1a11",
  "customerId": "8a9d3c52-0f4e-47f5-9a0e-2f6a5b6f1c22",
  "customerName": "Maria Souza",
  "customerEmail": "cliente@exemplo.com",
  "amountCents": 150000,
  "dueDate": "2026-11-10",
  "demo": false,
  "seed": false
}
```

| Field | Meaning |
|---|---|
| `eventId` | Unique per message. Consumers store the ids they processed and ignore repeats (idempotent consumer). |
| `correlationId` | Born in the HTTP request (`X-Correlation-Id` header) and copied to the logs of every service. |
| `type` | Same as the topic name. |
| `orgId` | The company that owns the invoice. Every consumer keeps its data **per company** (Redis keys, notification history), so one company never sees another one's numbers. An event without `orgId` is ignored. |
| `demo` | The company is a throwaway demo sandbox ("Entrar como visitante"). Consumers let its data expire. |
| `seed` | The event comes from the sample data of a sandbox: the report service counts it (so the dashboard has numbers), the notification service records it in the history but sends no e-mail. |
| `occurredAt` | UTC instant of the change (for sample data, the date in the past the story pretends it happened). |
| `amountCents` | Integer cents. Never a decimal number. |
| `dueDate` | Calendar date (no time). "Today" is computed in `America/Sao_Paulo`. |

The event does **not** carry the previous status. A consumer that needs it (the report service) keeps its own state
per invoice.

## Delivery guarantees

* The outbox publisher sends **at least once**: the same `eventId` can arrive twice.
* Consumers must be idempotent: check the `eventId` before applying anything.
* Ordering is guaranteed only per `invoiceId` (the message key).
