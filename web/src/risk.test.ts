import { describe, expect, it } from 'vitest';
import { buildForecast, paymentProbability, scoreCustomer } from './risk';
import type { CustomerRisk } from './types';

// The same cases as services/report/tests/test_risk.py: both implementations must agree.
describe('risk score', () => {
  it('has no score without history', () => {
    expect(scoreCustomer(0, 0, 0, []).level).toBe('NO_DATA');
  });

  it('is low for a customer who always pays on time', () => {
    const result = scoreCustomer(8, 0, 0, []);
    expect(result.score).toBe(0);
    expect(result.level).toBe('LOW');
    expect(result.limitedData).toBe(false);
  });

  it('ranks habitual late payers higher, and overdue invoices raise it further', () => {
    const rarely = scoreCustomer(10, 1, 2, []);
    const often = scoreCustomer(10, 8, 80, []);
    expect(often.score).toBeGreaterThan(rarely.score);
    expect(often.level).toBe('MEDIUM');
    expect(rarely.level).toBe('LOW');
    expect(scoreCustomer(10, 8, 80, [20]).level).toBe('HIGH');
    expect(scoreCustomer(5, 0, 0, [3]).score).toBeLessThan(scoreCustomer(5, 0, 0, [45]).score);
  });

  it('caps at 100 and flags few payments as limited data', () => {
    expect(scoreCustomer(5, 5, 500, [90, 60, 30, 20]).score).toBe(100);
    expect(scoreCustomer(2, 1, 5, []).limitedData).toBe(true);
  });

  it('makes riskier and overdue invoices less likely to be paid', () => {
    expect(paymentProbability(0, 0)).toBeGreaterThan(paymentProbability(80, 0));
    expect(paymentProbability(30, 0)).toBeGreaterThan(paymentProbability(30, 20));
    expect(paymentProbability(100, 200)).toBeGreaterThanOrEqual(0.1);
  });
});

describe('cash forecast', () => {
  const today = '2026-11-10';
  const risk = (score: number, avgDelayDays: number, level: CustomerRisk['level']) =>
    new Map<string, CustomerRisk>([['c', { customer_id: 'c', customer_name: 'C', score, level, avg_delay_days: avgDelayDays, late_rate: 0, limited_data: false, paid_count: 5, overdue_count: 0, oldest_overdue_days: 0, unpaid_cents: 0 }]]);

  it('keeps an on-time customer in the month and adds what was received', () => {
    const months = buildForecast([{ customerId: 'c', amountCents: 10000, dueDate: '2026-11-20' }], risk(0, 0, 'LOW'), 5000, today);
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(months[0]).toEqual({ month: '2026-11', received_cents: 5000, nominal_cents: 10000, expected_cents: 10000 });
  });

  it('moves money to the next month for customers who pay late', () => {
    const months = buildForecast([{ customerId: 'c', amountCents: 10000, dueDate: '2026-11-28' }], risk(40, 10, 'MEDIUM'), 0, today);
    expect(months[0].nominal_cents).toBe(10000);
    expect(months[0].expected_cents).toBe(0);
    expect(months[1].expected_cents).toBe(Math.round(10000 * paymentProbability(40, 0)));
  });

  it('counts overdue invoices in the current month with a low chance', () => {
    const months = buildForecast([{ customerId: 'c', amountCents: 10000, dueDate: '2026-10-01' }], risk(80, 15, 'HIGH'), 0, today);
    expect(months[0].nominal_cents).toBe(10000);
    expect(months[0].expected_cents).toBeGreaterThan(0);
    expect(months[0].expected_cents).toBeLessThan(3000);
  });
});
