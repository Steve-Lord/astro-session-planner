import qrcode from 'qrcode-generator'
import type { HorizonProfile } from '../types'
import { angDiff } from '../sweep/orientation'

const VERSION = 1
const FLAG_SEASONAL = 1
const FLAG_CALIBRATED = 2
const N = 360
const BITSET = 45
const HASH_KEY = 'import-horizon='

const DAMAGED = 'This link is damaged or incomplete.'
const INCOMPLETE = 'This link is incomplete.'
const MAX_LINK_CHARS = 2000
const MAX_RAW_BYTES = 1024   // largest valid payload is 769 bytes
const NEWER = 'This link was made by a newer version of the app.'

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, BufferSource>)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error(DAMAGED)
  let b = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b.length % 4) b += '='
  const bin = atob(b)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const q2 = (alt: number): number => Math.round(Math.min(90, Math.max(0, alt)) * 2)

export async function encodeHorizon(p: HorizonProfile): Promise<string> {
  const seasonal = p.seasonal.slice(0, N).some(Boolean)
  const calibrated = p.calibration !== null
  const raw = new Uint8Array(2 + N + (seasonal ? BITSET + N : 0) + 2)
  raw[0] = VERSION
  raw[1] = (seasonal ? FLAG_SEASONAL : 0) | (calibrated ? FLAG_CALIBRATED : 0)
  let o = 2
  for (let i = 0; i < N; i++) raw[o++] = q2(p.altitudes[i])
  if (seasonal) {
    for (let i = 0; i < N; i++) if (p.seasonal[i]) raw[o + (i >> 3)] |= 1 << (i & 7)
    o += BITSET
    for (let i = 0; i < N; i++) raw[o++] = q2(p.leafOffAltitudes[i])
  }
  const off = Math.round(angDiff(0, p.northOffsetDeg) * 10)
  new DataView(raw.buffer).setInt16(o, off, false)
  return toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')))
}

/** Inflate untrusted bytes, aborting as soon as the output exceeds `max` (returns null then). */
async function inflateCapped(bytes: Uint8Array, max: number): Promise<Uint8Array | null> {
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, BufferSource>)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

export async function decodeHorizon(s: string): Promise<HorizonProfile> {
  if (s.length > MAX_LINK_CHARS) throw new Error(DAMAGED)
  let inflated: Uint8Array | null
  try {
    inflated = await inflateCapped(fromBase64Url(s), MAX_RAW_BYTES)
  } catch {
    throw new Error(DAMAGED)
  }
  if (inflated === null) throw new Error(INCOMPLETE)
  const raw = inflated
  if (raw.length < 2) throw new Error(INCOMPLETE)
  if (raw[0] > VERSION) throw new Error(NEWER)
  if (raw[0] !== VERSION) throw new Error(DAMAGED)
  const flags = raw[1]
  const seasonal = (flags & FLAG_SEASONAL) !== 0
  if (raw.length !== 2 + N + (seasonal ? BITSET + N : 0) + 2) throw new Error(INCOMPLETE)
  let o = 2
  const altitudes = Array.from({ length: N }, (_, i) => raw[o + i] / 2)
  o += N
  let seasonalFlags: boolean[] = new Array(N).fill(false)
  let leafOff = altitudes.slice()
  if (seasonal) {
    const base = o
    seasonalFlags = Array.from({ length: N }, (_, i) => (raw[base + (i >> 3)] & (1 << (i & 7))) !== 0)
    o += BITSET
    const lo = o
    leafOff = Array.from({ length: N }, (_, i) => raw[lo + i] / 2)
    o += N
  }
  const northOffsetDeg = new DataView(raw.buffer, raw.byteOffset).getInt16(o, false) / 10
  const now = new Date().toISOString()
  return { altitudes, seasonal: seasonalFlags, leafOffAltitudes: leafOff, northOffsetDeg, createdAt: now, source: 'import',
    calibration: flags & FLAG_CALIBRATED ? { target: 'imported', at: now, residualAltDeg: 0 } : null }
}

export function importUrl(base: string, payload: string): string {
  return `${base}#${HASH_KEY}${payload}`
}

export function readImportHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  if (!h.startsWith(HASH_KEY)) return null
  const v = h.slice(HASH_KEY.length)
  return v.length > 0 ? v : null
}

export function horizonQrSvg(url: string): string {
  // Never pass alt/title text to createSvgTag: the URL must not be repeated inside the SVG.
  const qr = qrcode(0, 'L')
  qr.addData(url)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
}
