/**
 * Rates are Indian, so figures are formatted in the `en-IN` locale: the rupee
 * sign and lakh-style grouping (₹1,23,456 rather than ₹123,456).
 */
const LOCALE = 'en-IN';

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits}`;
  let formatter = CURRENCY_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    CURRENCY_FORMATTERS.set(key, formatter);
  }
  return formatter;
}

export function money(amount: number, currency = 'INR'): string {
  // Whole rupees are the norm; only show paise when the figure actually has them.
  return currencyFormatter(currency, Number.isInteger(amount) ? 0 : 2).format(amount);
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
});

export function shortDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return DATE_FORMAT.format(parsed);
}

export function dateRange(checkIn: string, checkOut: string): string {
  return `${shortDate(checkIn)} – ${shortDate(checkOut)}`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** `YYYY-MM-DD` for a date `offsetDays` from today, in the viewer's timezone. */
export function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}
