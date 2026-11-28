// Pure date helpers for the shared night store (unit-tested).
import { tonight } from '../astro/time';
import { parseDetailHash } from '../detailHash';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The first night to plan: the detail-hash date, then `?date=`, then tonight at the site. */
export function initialDate(hash: string, search: string, timezone: string): { date: string; picked: boolean } {
  const q = parseDetailHash(hash)?.date ?? new URLSearchParams(search).get('date');
  if (q && DATE_RE.test(q)) return { date: q, picked: true };
  return { date: tonight(timezone), picked: false };
}

/** `date` (YYYY-MM-DD) moved by `days` calendar days. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
