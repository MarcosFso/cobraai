/** Money is always an integer number of cents. Only these helpers convert to/from "R$ 1.500,00". */
export function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * "1.500,25" | "1500,25" | "1500.25" | "1500" -> 150025 (no floating point involved).
 * Returns null when the text is not a valid amount greater than zero.
 */
export function parseReaisToCents(text: string): number | null {
  const clean = text.trim().replace(/^R\$\s*/, '');
  if (!clean) return null;
  // "1.500" (no comma) is one thousand five hundred in Brazil, not 1.50
  const thousandsOnly = /^\d{1,3}(\.\d{3})+$/.test(clean);
  const normalized = clean.includes(',') || thousandsOnly ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  return cents > 0 ? cents : null;
}
