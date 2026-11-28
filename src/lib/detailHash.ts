const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Hash for a target's detail screen, e.g. `#target=NGC7000&date=2026-11-22`. */
export function detailHash(id: string, date: string, from?: 'sky'): string {
  return `#target=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}${from ? `&from=${from}` : ''}`
}

/** Inverse of detailHash (`from` is where the detail was opened, null for Tonight); null when the hash is not a detail link. A malformed date becomes null. */
export function parseDetailHash(hash: string): { id: string; date: string | null; from: 'sky' | null } | null {
  if (!hash.startsWith('#target=')) return null
  const params = new URLSearchParams(hash.slice(1))
  const id = params.get('target')
  if (!id) return null
  const date = params.get('date')
  return { id, date: date !== null && DATE_RE.test(date) ? date : null, from: params.get('from') === 'sky' ? 'sky' : null }
}
