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

/** "2026-11-10" -> "10/11/2026" (no Date object, so no time zone surprises). */
export function formatDate(isoDate: string): string {
  return isoDate.slice(0, 10).split('-').reverse().join('/');
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** "52998224725" -> "529.982.247-25"; CNPJ -> "11.222.333/0001-81". */
export function formatDocument(digits: string): string {
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return digits;
}

/** Today as YYYY-MM-DD in the user's calendar, for the due date input. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
