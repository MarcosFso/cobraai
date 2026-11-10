import { beforeEach, describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../src/auth.js';
import { EventHandler } from '../src/handler.js';
import type { Mailer } from '../src/mailer.js';
import { buildMessage, formatBrl } from '../src/messages.js';
import { buildApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const SECRET = 'test-secret-with-at-least-32-characters-long';
const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002';

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

function event(type: string, eventId = 'evt-1', extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    eventId,
    correlationId: 'corr-1',
    type,
    occurredAt: '2026-11-05T14:32:00Z',
    orgId: ORG_A,
    invoiceId: 'inv-1',
    customerId: 'cus-1',
    customerName: 'Maria',
    customerEmail: 'cliente@exemplo.com',
    amountCents: 150000,
    dueDate: '2026-11-10',
    demo: false,
    seed: false,
    ...extra,
  });
}

const token = (org: string, extra: Record<string, unknown> = {}) =>
  signToken({ sub: 'user-1', org, exp: Math.floor(Date.now() / 1000) + 3600, ...extra }, SECRET);

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
    expect(store.listByOrg(ORG_A)).toHaveLength(1);
  });

  it('ignores canceled events, invalid payloads and events without a company', async () => {
    expect(await handler.handle(event('invoice.canceled'))).toBe('ignored');
    expect(await handler.handle('not json')).toBe('invalid');
    expect(await handler.handle('{"type":"invoice.paid"}')).toBe('invalid');
    expect(await handler.handle(event('invoice.paid', 'x', { orgId: null }))).toBe('invalid');
    expect(mailer.sent).toHaveLength(0);
  });

  it('records sample data of a demo sandbox in the history without sending any e-mail', async () => {
    expect(await handler.handle(event('invoice.created', 'seed-1', { seed: true, demo: true }))).toBe('recorded');
    expect(mailer.sent).toHaveLength(0);
    expect(store.listByOrg(ORG_A)).toHaveLength(1);
  });

  it('releases the eventId when the e-mail fails, so the retry is not treated as duplicate', async () => {
    mailer.failNext = true;
    await expect(handler.handle(event('invoice.created'))).rejects.toThrow('smtp down');
    expect(store.listByOrg(ORG_A)).toHaveLength(0);

    expect(await handler.handle(event('invoice.created'))).toBe('sent');
    expect(mailer.sent).toHaveLength(1);
  });

  it('keeps the history of each company apart', async () => {
    await handler.handle(event('invoice.created', 'a1'));
    await handler.handle(event('invoice.created', 'b1', { orgId: ORG_B, customerEmail: 'outro@exemplo.com' }));
    expect(store.listByOrg(ORG_A).map((r) => r.customerEmail)).toEqual(['cliente@exemplo.com']);
    expect(store.listByOrg(ORG_B).map((r) => r.customerEmail)).toEqual(['outro@exemplo.com']);
    expect(store.listByOrg('cccccccc-0000-4000-8000-000000000003')).toEqual([]);
  });

  it('purges only old demo history', async () => {
    await handler.handle(event('invoice.created', 'old-demo', { demo: true, seed: true, occurredAt: '2026-01-01T00:00:00Z' }));
    await handler.handle(event('invoice.created', 'old-real', { occurredAt: '2026-01-01T00:00:00Z' }));
    await handler.handle(event('invoice.created', 'new-demo', { demo: true, seed: true, occurredAt: '2026-11-05T00:00:00Z' }));
    expect(store.purgeDemoBefore('2026-06-01T00:00:00Z')).toBe(1);
    expect(store.listByOrg(ORG_A).map((r) => r.eventId).sort()).toEqual(['new-demo', 'old-real']);
  });
});

describe('messages', () => {
  it('formats cents as Brazilian reais', () => {
    expect(formatBrl(150000).replace(/\s/g, ' ')).toBe('R$ 1.500,00');
    expect(formatBrl(1).replace(/\s/g, ' ')).toBe('R$ 0,01');
  });

  it('has no message for canceled invoices', () => {
    expect(buildMessage(JSON.parse(event('invoice.canceled')))).toBeNull();
  });
});

describe('token', () => {
  it('accepts a valid token and reads the company', () => {
    expect(verifyToken(token(ORG_A), SECRET)?.org).toBe(ORG_A);
  });

  it('rejects wrong secret, tampering, expiry, missing company and other algorithms', () => {
    expect(verifyToken(token(ORG_A), 'another-secret-with-at-least-32-characters')).toBeNull();

    const [h, p, s] = token(ORG_A).split('.');
    const forged = Buffer.from(JSON.stringify({ org: ORG_B, exp: 9999999999 })).toString('base64url');
    expect(verifyToken(`${h}.${forged}.${s}`, SECRET)).toBeNull();

    expect(verifyToken(signToken({ org: ORG_A, exp: 1 }, SECRET), SECRET)).toBeNull();
    expect(verifyToken(signToken({ exp: 9999999999 }, SECRET), SECRET)).toBeNull();
    expect(verifyToken('abc', SECRET)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${p}.`;
    expect(verifyToken(none, SECRET)).toBeNull();
  });
});

describe('HTTP API', () => {
  it('serves /health publicly and the history only to a logged user, only of that user company', async () => {
    const store = new SqliteStore(':memory:');
    const handler = new EventHandler(store, new FakeMailer(), silent);
    await handler.handle(event('invoice.created', 'a1'));
    await handler.handle(event('invoice.paid', 'b1', { orgId: ORG_B, customerEmail: 'outro@exemplo.com' }));
    const app = buildApp(store, { jwtSecret: SECRET });

    expect((await app.inject('/health')).json()).toEqual({ status: 'UP' });

    expect((await app.inject('/notifications')).statusCode).toBe(401);
    expect((await app.inject({ url: '/notifications', headers: { authorization: 'Bearer lixo' } })).statusCode).toBe(401);

    const a = await app.inject({ url: '/notifications', headers: { authorization: `Bearer ${token(ORG_A)}` } });
    expect(a.json()).toHaveLength(1);
    expect(a.json()[0].type).toBe('invoice.created');
    expect(a.json()[0].to).toBe('cliente@exemplo.com');

    const b = await app.inject({ url: '/notifications', headers: { authorization: `Bearer ${token(ORG_B)}` } });
    expect(b.json()).toHaveLength(1);
    expect(b.json()[0].to).toBe('outro@exemplo.com');

    // asking for another company's customer id through the filter still returns nothing of theirs
    const sneaky = await app.inject({ url: '/notifications?customerId=cus-1', headers: { authorization: `Bearer ${token(ORG_B)}` } });
    expect(sneaky.json().every((row: { to: string }) => row.to === 'outro@exemplo.com')).toBe(true);
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const app = buildApp(new SqliteStore(':memory:'), { jwtSecret: SECRET, corsOrigins: ['http://localhost:5173'] });
    const allowed = await app.inject({ method: 'OPTIONS', url: '/notifications', headers: { origin: 'http://localhost:5173' } });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await app.inject({ method: 'OPTIONS', url: '/notifications', headers: { origin: 'http://evil.example' } });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
