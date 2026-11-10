import { describe, expect, it } from 'vitest';
import { isValidDocument, normalizePhone } from './document';
import { addDaysIso, daysBetween, dueLabel, formatPhone, greeting, initials } from './format';
import { collectionMessage, whatsappLink } from './whatsapp';

describe('isValidDocument (same rule as the database)', () => {
  it('accepts valid CPF and CNPJ, with or without mask', () => {
    expect(isValidDocument('529.982.247-25')).toBe(true);
    expect(isValidDocument('52998224725')).toBe(true);
    expect(isValidDocument('11.222.333/0001-81')).toBe(true);
    expect(isValidDocument('12.345.678/0001-95')).toBe(true);
  });

  it('rejects wrong check digits, repeated digits and wrong length', () => {
    expect(isValidDocument('529.982.247-26')).toBe(false);
    expect(isValidDocument('11.222.333/0001-82')).toBe(false);
    expect(isValidDocument('111.111.111-11')).toBe(false);
    expect(isValidDocument('1234')).toBe(false);
    expect(isValidDocument('')).toBe(false);
  });
});

describe('phone', () => {
  it('adds the country code to DDD + number', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('5511912345678');
    expect(normalizePhone('(21) 3456-7890')).toBe('552134567890');
    expect(normalizePhone('+55 (11) 91234-5678')).toBe('5511912345678');
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('+1 202 555 0143')).toBeNull(); // a US number is not a Brazilian one
  });

  it('masks while typing', () => {
    expect(formatPhone('11')).toBe('11');
    expect(formatPhone('119')).toBe('(11) 9');
    expect(formatPhone('11912345678')).toBe('(11) 91234-5678');
    expect(formatPhone('5511912345678')).toBe('(11) 91234-5678');
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890');
  });
});

describe('WhatsApp collection message', () => {
  const invoice = { description: 'Honorários de novembro', amount_cents: 150000, due_date: '2026-11-10', status: 'OPEN' as const };

  it('is friendly for open invoices and firmer for overdue ones', () => {
    const open = collectionMessage(invoice, 'Ana Souza');
    expect(open).toContain('Olá, Ana!');
    expect(open).toContain('Honorários de novembro');
    expect(open.replace(/\s/g, ' ')).toContain('R$ 1.500,00');
    expect(open).toContain('10/11/2026');
    expect(open).toContain('lembrar');

    const overdue = collectionMessage({ ...invoice, status: 'OVERDUE' }, 'Ana Souza');
    expect(overdue).toContain('ainda consta em aberto');
  });

  it('builds a wa.me link with the encoded text', () => {
    const link = whatsappLink('5511912345678', 'Olá, tudo bem?');
    expect(link).toBe('https://wa.me/5511912345678?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  });
});

describe('dates', () => {
  it('counts days without time zone surprises', () => {
    expect(daysBetween('2026-11-10', '2026-11-15')).toBe(5);
    expect(daysBetween('2026-11-10', '2026-11-07')).toBe(-3);
    expect(addDaysIso('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('describes due dates in words', () => {
    expect(dueLabel('2026-11-10', '2026-11-10')).toBe('vence hoje');
    expect(dueLabel('2026-11-11', '2026-11-10')).toBe('vence amanhã');
    expect(dueLabel('2026-11-15', '2026-11-10')).toBe('vence em 5 dias');
    expect(dueLabel('2026-11-09', '2026-11-10')).toBe('venceu ontem');
    expect(dueLabel('2026-11-07', '2026-11-10')).toBe('venceu há 3 dias');
  });

  it('greets by the time of day and makes initials', () => {
    expect(greeting(new Date(2026, 10, 10, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 10, 10, 15))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 10, 10, 21))).toBe('Boa noite');
    expect(initials('Ana Souza')).toBe('AS');
    expect(initials('Padaria Pão Quente Ltda')).toBe('PL');
    expect(initials('Madonna')).toBe('M');
  });
});
