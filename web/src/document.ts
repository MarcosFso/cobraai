/** CPF (11 digits) and CNPJ (14 digits) check digits. Same rule as the database; this one only gives faster feedback. */
export function isValidDocument(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (!/^\d+$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const digits = [...d].map(Number);

  if (d.length === 11) {
    const check = (length: number) => {
      const sum = digits.slice(0, length).reduce((acc, digit, index) => acc + digit * (length + 1 - index), 0);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return check(9) === digits[9] && check(10) === digits[10];
  }

  if (d.length === 14) {
    const check = (weights: number[]) => {
      const sum = weights.reduce((acc, weight, index) => acc + digits[index] * weight, 0);
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return check(w1) === digits[12] && check([6, ...w1]) === digits[13];
  }
  return false;
}

/** Digits of a Brazilian phone with the country code, or null if it does not look like one. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^55\d{10,11}$/.test(withCountry) ? withCountry : null;
}
