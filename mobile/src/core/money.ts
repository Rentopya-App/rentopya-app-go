/** "1.250,50", "1250,5" or "1250.5" → "1250.50"; null when it is not a positive amount. */
export function parseAmount(text: string) {
  const clean = text.replace(/\s/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** API amount ("1250.50") as the text a person edits ("1250,50" in Turkish). */
export function amountText(amount: string | number, lang: string) {
  const s = Number(amount).toFixed(2).replace(/\.00$/, '');
  return lang === 'en' ? s : s.replace('.', ',');
}

/** Signed amount a person typed ("-1.250,5", "300") → "-1250.50"; null when it is not one. */
export function parseSignedAmount(text: string) {
  const clean = text.replace(/\s/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  return /^-?\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized).toFixed(2) : null;
}
