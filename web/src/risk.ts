import type { CustomerRisk, ForecastMonth, RiskLevel } from './types';

/**
 * The same rules as services/report/app/risk.py (the real score and forecast are computed there, from the Kafka
 * events). This copy feeds the in-memory sample data used for design previews and tests, and the labels the
 * screens show for each level.
 */

export const LEVEL_LABEL: Record<RiskLevel, string> = { LOW: 'Risco baixo', MEDIUM: 'Risco médio', HIGH: 'Risco alto', NO_DATA: 'Sem histórico' };

const levelOf = (score: number): RiskLevel => (score < 25 ? 'LOW' : score < 50 ? 'MEDIUM' : 'HIGH');

export function scoreCustomer(paid: number, late: number, totalDelayDays: number, overdueDays: number[]) {
  if (paid === 0 && overdueDays.length === 0) {
    return { score: 0, level: 'NO_DATA' as RiskLevel, avgDelayDays: 0, lateRate: 0, limitedData: true };
  }
  const avgDelay = paid ? totalDelayDays / paid : 0;
  const lateRate = paid ? late / paid : 0;
  const oldest = overdueDays.length ? Math.max(...overdueDays) : 0;
  const score = Math.min(100, Math.round(35 * lateRate + Math.min(30, 2 * avgDelay) + Math.min(35, 10 * overdueDays.length + oldest)));
  return { score, level: levelOf(score), avgDelayDays: Math.round(avgDelay * 10) / 10, lateRate: Math.round(lateRate * 100) / 100, limitedData: paid < 3 };
}

export const paymentProbability = (score: number, overdueDays: number) =>
  overdueDays > 0 ? Math.max(0.1, 0.6 - (0.5 * score) / 100 - Math.min(0.3, overdueDays / 100)) : 1 - (0.6 * score) / 100;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayNumber = (iso: string) => Math.floor(new Date(`${iso}T12:00:00`).getTime() / 86_400_000);

export function buildForecast(
  unpaid: { customerId: string; amountCents: number; dueDate: string }[],
  riskByCustomer: Map<string, CustomerRisk>,
  receivedThisMonth: number,
  today: string,
  fallbackDelay = 0,
): ForecastMonth[] {
  const start = new Date(`${today}T12:00:00`);
  start.setDate(1);
  const buckets = new Map<string, { nominal: number; expected: number }>();
  for (let i = 0; i < 3; i += 1) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    buckets.set(monthKey(d), { nominal: 0, expected: 0 });
  }
  const current = monthKey(start);
  for (const invoice of unpaid) {
    const risk = riskByCustomer.get(invoice.customerId);
    const overdueDays = Math.max(0, dayNumber(today) - dayNumber(invoice.dueDate));
    const probability = paymentProbability(risk?.score ?? 0, overdueDays);
    let nominalMonth = current;
    let expectedMonth = current;
    if (overdueDays === 0) {
      const delay = risk && risk.level !== 'NO_DATA' ? risk.avg_delay_days : fallbackDelay;
      const due = new Date(`${invoice.dueDate}T12:00:00`);
      nominalMonth = monthKey(due);
      due.setDate(due.getDate() + Math.round(delay));
      expectedMonth = monthKey(due);
    }
    const nominal = buckets.get(nominalMonth);
    if (nominal) nominal.nominal += invoice.amountCents;
    const expected = buckets.get(expectedMonth);
    if (expected) expected.expected += invoice.amountCents * probability;
  }
  return [...buckets].map(([month, data]) => ({
    month,
    received_cents: month === current ? receivedThisMonth : 0,
    nominal_cents: data.nominal,
    expected_cents: Math.round(data.expected),
  }));
}
