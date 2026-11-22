const SEXA = /^([+-])?(\d+)[:\s]+(\d+)[:\s]+(\d+(?:\.\d+)?)$/;

function sexagesimal(text: string): { sign: number; value: number } | null {
  const m = SEXA.exec(text.trim());
  if (!m) return null;
  const min = Number(m[3]);
  const sec = Number(m[4]);
  if (min >= 60 || sec >= 60) return null;
  return { sign: m[1] === '-' ? -1 : 1, value: Number(m[2]) + min / 60 + sec / 3600 };
}

/** "h:m:s" right ascension -> degrees in [0, 360); null if malformed or out of range. */
export function parseRa(text: string): number | null {
  const p = sexagesimal(text);
  if (!p || p.sign < 0 || p.value >= 24) return null;
  return p.value * 15;
}

/** "±d:m:s" declination -> degrees in [-90, 90]; null if malformed or out of range. */
export function parseDec(text: string): number | null {
  const p = sexagesimal(text);
  if (!p || p.value > 90) return null;
  return p.sign * p.value;
}
