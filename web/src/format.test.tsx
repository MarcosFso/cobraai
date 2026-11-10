import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCardsView } from './components/Dashboard';
import { formatBrl, formatDate, formatDocument, parseReaisToCents } from './format';

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

describe('formatters', () => {
  it('formats cents as reais', () => {
    expect(formatBrl(150000).replace(/\s/g, ' ')).toBe('R$ 1.500,00');
  });

  it('formats dates without time zone shifts', () => {
    expect(formatDate('2026-11-10')).toBe('10/11/2026');
    expect(formatDate('2026-01-01T00:00:00+00:00')).toBe('01/01/2026');
  });

  it('formats CPF and CNPJ', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('SummaryCardsView', () => {
  it('shows the totals and highlights overdue amounts', () => {
    render(
      <SummaryCardsView
        summary={{ month: '2026-11', issuedCents: 320000, receivedCents: 170000, openCents: 70000, overdueCents: 30000, delinquencyRate: 11.11 }}
      />,
    );
    expect(screen.getByText('Atrasado')).toBeTruthy();
    expect(screen.getByText('11,1%')).toBeTruthy();
  });
});
