const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Hash for a target's detail screen, e.g. `#target=NGC7000&date=2026-11-22`. */
export function detailHash(id: string, date: string): string {
  return `#target=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}`
}

/** Inverse of detailHash; null when the hash is not a detail link. A malformed date becomes null. */
export function parseDetailHash(hash: string): { id: string; date: string | null } | null {
  if (!hash.startsWith('#target=')) return null
  const params = new URLSearchParams(hash.slice(1))
  const id = params.get('target')
  if (!id) return null
  const date = params.get('date')
  return { id, date: date !== null && DATE_RE.test(date) ? date : null }
}
