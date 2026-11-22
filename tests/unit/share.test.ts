import { describe, expect, it } from 'vitest'
import { decodeHorizon, encodeHorizon, horizonQrSvg, importUrl, readImportHash } from '../../src/lib/horizon/share'
import type { HorizonProfile } from '../../src/lib/types'

function profile(over: Partial<HorizonProfile> = {}): HorizonProfile {
  const altitudes = Array.from({ length: 360 }, (_, az) => {
    if (az >= 90 && az < 150) return 30.3 + (az % 7) * 0.31
    if (az >= 200 && az < 260) return 20.1 + (az % 5) * 0.4
    return 3.2 + (az % 3) * 0.2
  })
  const seasonal = altitudes.map((_, az) => az >= 200 && az < 260)
  const leafOffAltitudes = altitudes.map((a, i) => (seasonal[i] ? a - 8.7 : a))
  return { altitudes, seasonal, leafOffAltitudes, northOffsetDeg: 3.4, createdAt: '2026-01-01T00:00:00.000Z',
    source: 'sweep', calibration: { target: 'Moon', at: '2026-01-01T00:00:00.000Z', residualAltDeg: 0.4 }, ...over }
}
const flat = (): HorizonProfile => profile({
  altitudes: new Array(360).fill(5), seasonal: new Array(360).fill(false), leafOffAltitudes: new Array(360).fill(5), northOffsetDeg: 0,
  calibration: null })

async function deflateB64(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const out = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (const b of out) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('horizon share encoding', () => {
  it('round trips altitudes, seasonal, leaf-off and offset', async () => {
    const p = profile()
    const q = await decodeHorizon(await encodeHorizon(p))
    for (let i = 0; i < 360; i++) {
      expect(Math.abs(q.altitudes[i] - p.altitudes[i])).toBeLessThanOrEqual(0.25)
      expect(Math.abs(q.leafOffAltitudes[i] - p.leafOffAltitudes[i])).toBeLessThanOrEqual(0.25)
    }
    expect(q.seasonal).toEqual(p.seasonal)
    expect(Math.abs(q.northOffsetDeg - 3.4)).toBeLessThanOrEqual(0.05)
    expect(q.source).toBe('import')
    expect(q.calibration?.target).toBe('imported')
    expect(q.unswept).toBeUndefined()
  })
  it('uncalibrated flat profile has no calibration and is tiny', async () => {
    const s = await encodeHorizon(flat())
    expect(s.length).toBeLessThan(120)
    expect((await decodeHorizon(s)).calibration).toBeNull()
  })
  it('realistic garden profile is under 600 chars', async () => {
    expect((await encodeHorizon(profile())).length).toBeLessThan(600)
  })
  it('wraps and clamps', async () => {
    const p = flat()
    p.altitudes[10] = 120; p.altitudes[11] = -4; p.northOffsetDeg = 370
    const q = await decodeHorizon(await encodeHorizon(p))
    expect(q.altitudes[10]).toBe(90)
    expect(q.altitudes[11]).toBe(0)
    expect(Math.abs(q.northOffsetDeg - 10)).toBeLessThanOrEqual(0.05)
  })
  it('rejects bad base64 and garbage', async () => {
    await expect(decodeHorizon('***')).rejects.toThrow('This link is damaged or incomplete.')
    await expect(decodeHorizon('AAAA')).rejects.toThrow('This link is damaged or incomplete.')
  })
  it('rejects a truncated link', async () => {
    const s = await encodeHorizon(profile())
    await expect(decodeHorizon(s.slice(0, 60))).rejects.toThrow('This link is damaged or incomplete.')
  })
  it('rejects a short payload as incomplete', async () => {
    const bytes = new Uint8Array(100); bytes[0] = 1
    await expect(decodeHorizon(await deflateB64(bytes))).rejects.toThrow('This link is incomplete.')
    await expect(decodeHorizon(await deflateB64(new Uint8Array(0)))).rejects.toThrow('This link is incomplete.')
  })
  it('rejects a newer version', async () => {
    const bytes = new Uint8Array(364); bytes[0] = 2
    await expect(decodeHorizon(await deflateB64(bytes))).rejects.toThrow('This link was made by a newer version of the app.')
  })
  it('keeps location out of the link', async () => {
    const url = importUrl('https://example.test/app/', await encodeHorizon(profile()))
    expect(url).not.toContain('51.48')
    expect(url).not.toContain('0.0077')
    expect(url.startsWith('https://example.test/app/#import-horizon=')).toBe(true)
  })
  it('reads the import hash', () => {
    expect(readImportHash('#import-horizon=abc_-1')).toBe('abc_-1')
    expect(readImportHash('import-horizon=abc')).toBe('abc')
    expect(readImportHash('#other=abc')).toBeNull()
    expect(readImportHash('')).toBeNull()
    expect(readImportHash('#import-horizon=')).toBeNull()
  })
  it('makes a QR svg', () => {
    expect(horizonQrSvg('https://example.test/#import-horizon=abc')).toContain('<svg')
  })
})
