import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCardsView } from './components/SummaryCards';
import { formatBrl, parseReaisToCents } from './money';

describe('parseReaisToCents', () => {
  it('converts without floating point errors', () => {
    expect(parseReaisToCents('1.500,25')).toBe(150025);
    expect(parseReaisToCents('1500,25')).toBe(150025);
    expect(parseReaisToCents('1500.25')).toBe(150025);
    expect(parseReaisToCents('1500')).toBe(150000);
    expect(parseReaisToCents('1.500')).toBe(150000);
    expect(parseReaisToCents('0,1')).toBe(10);
    expect(parseReaisToCents('19,99')).toBe(1999);
    expect(parseReaisToCents('R$ 10,00')).toBe(1000);
  });

  it('rejects zero, negatives and garbage', () => {
    for (const text of ['', '0', '0,00', '-5', 'abc', '1,234', '1,2,3']) {
      expect(parseReaisToCents(text)).toBeNull();
    }
  });
});

describe('formatBrl', () => {
  it('formats cents as reais', () => {
    expect(formatBrl(150000).replace(/\s/g, ' ')).toBe('R$ 1.500,00');
  });
});

describe('SummaryCardsView', () => {
  it('shows the totals', () => {
    render(
      <SummaryCardsView
        summary={{ month: '2026-11', issuedCents: 0, receivedCents: 250000, openCents: 100000, overdueCents: 50000, delinquencyRate: 12.5 }}
      />,
    );
    expect(screen.getByText('Atrasado')).toBeTruthy();
    expect(screen.getByText('12,5%')).toBeTruthy();
  });
});
