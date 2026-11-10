/** Same JSON that the billing service writes to the outbox (see contracts/events.md). */
export type EventType = 'invoice.created' | 'invoice.paid' | 'invoice.overdue' | 'invoice.canceled';

export interface InvoiceEvent {
  eventId: string;
  correlationId: string;
  type: EventType;
  occurredAt: string;
  orgId: string;
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amountCents: number;
  dueDate: string;
  /** The company is a throwaway demo sandbox: its history is deleted after a while. */
  demo: boolean;
  /** Sample data of a sandbox: recorded in the history, but no e-mail is sent. */
  seed: boolean;
}

/** Event types that produce an e-mail. invoice.canceled is consumed by the report service only. */
export const NOTIFIED_TYPES: EventType[] = ['invoice.created', 'invoice.paid', 'invoice.overdue'];

const REQUIRED = ['eventId', 'type', 'orgId', 'invoiceId', 'customerId', 'customerEmail', 'amountCents', 'dueDate'] as const;

/** Returns the parsed event, or null when the payload is not a valid event (including events without a company). */
export function parseEvent(raw: string): InvoiceEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  for (const key of REQUIRED) {
    if (obj[key] === undefined || obj[key] === null) return null;
  }
  if (typeof obj.amountCents !== 'number') return null;
  return { correlationId: 'none', occurredAt: '', customerName: '', demo: false, seed: false, ...obj } as unknown as InvoiceEvent;
}
