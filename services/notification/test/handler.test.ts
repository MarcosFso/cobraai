import { beforeEach, describe, expect, it } from 'vitest';
import { EventHandler } from '../src/handler.js';
import type { Mailer } from '../src/mailer.js';
import { buildMessage, formatBrl } from '../src/messages.js';
import { buildApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const silent = { info: () => {}, warn: () => {}, error: () => {} };

class FakeMailer implements Mailer {
  sent: { to: string; subject: string; text: string }[] = [];
  failNext = false;
  async send(to: string, subject: string, text: string) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('smtp down');
    }
    this.sent.push({ to, subject, text });
  }
}

function event(type: string, eventId = 'evt-1') {
  return JSON.stringify({
    eventId,
    correlationId: 'corr-1',
    type,
    occurredAt: '2026-11-05T14:32:00Z',
    invoiceId: 'inv-1',
    customerId: 'cus-1',
    customerEmail: 'cliente@exemplo.com',
    amountCents: 150000,
    dueDate: '2026-11-10',
  });
}

describe('EventHandler', () => {
  let store: SqliteStore;
  let mailer: FakeMailer;
  let handler: EventHandler;

  beforeEach(() => {
    store = new SqliteStore(':memory:');
    mailer = new FakeMailer();
    handler = new EventHandler(store, mailer, silent);
  });

  it('sends one e-mail per created, paid and overdue event', async () => {
    expect(await handler.handle(event('invoice.created', 'a'))).toBe('sent');
    expect(await handler.handle(event('invoice.paid', 'b'))).toBe('sent');
    expect(await handler.handle(event('invoice.overdue', 'c'))).toBe('sent');
    expect(mailer.sent).toHaveLength(3);
    expect(mailer.sent[0].to).toBe('cliente@exemplo.com');
  });

  it('is idempotent: the same eventId delivered twice sends one e-mail', async () => {
    expect(await handler.handle(event('invoice.paid'))).toBe('sent');
    expect(await handler.handle(event('invoice.paid'))).toBe('duplicate');
    expect(mailer.sent).toHaveLength(1);
    expect(store.listByCustomer('cus-1')).toHaveLength(1);
  });

  it('ignores canceled events and invalid payloads', async () => {
    expect(await handler.handle(event('invoice.canceled'))).toBe('ignored');
    expect(await handler.handle('not json')).toBe('invalid');
    expect(await handler.handle('{"type":"invoice.paid"}')).toBe('invalid');
    expect(mailer.sent).toHaveLength(0);
  });

  it('releases the eventId when the e-mail fails, so the retry is not treated as duplicate', async () => {
    mailer.failNext = true;
    await expect(handler.handle(event('invoice.created'))).rejects.toThrow('smtp down');
    expect(store.listByCustomer('cus-1')).toHaveLength(0);

    expect(await handler.handle(event('invoice.created'))).toBe('sent');
    expect(mailer.sent).toHaveLength(1);
  });
});

describe('messages', () => {
  it('formats cents as Brazilian reais', () => {
    expect(formatBrl(150000).replace(/\s/g, ' ')).toBe('R$ 1.500,00');
    expect(formatBrl(1).replace(/\s/g, ' ')).toBe('R$ 0,01');
  });

  it('has no message for canceled invoices', () => {
    const parsed = JSON.parse(event('invoice.canceled'));
    expect(buildMessage(parsed)).toBeNull();
  });
});

describe('HTTP API', () => {
  it('serves /health and the notification history of a customer', async () => {
    const store = new SqliteStore(':memory:');
    const handler = new EventHandler(store, new FakeMailer(), silent);
    await handler.handle(event('invoice.created'));
    const app = buildApp(store);

    expect((await app.inject('/health')).json()).toEqual({ status: 'UP' });

    const history = await app.inject('/notifications?customerId=cus-1');
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0].type).toBe('invoice.created');

    expect((await app.inject('/notifications')).statusCode).toBe(400);
  });
});
