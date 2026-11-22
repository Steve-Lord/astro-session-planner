import { describe, it, expect } from 'vitest'
import { parseRa, parseDec } from '../../src/lib/catalog/coords'

describe('parseRa', () => {
  it('converts h:m:s to degrees', () => {
    expect(parseRa('0:0:0')).toBe(0)
    expect(parseRa('12:0:0')).toBe(180)
    expect(parseRa('5:34:32')).toBeCloseTo(83.6333, 3)
  })
  it('accepts spaces and decimal seconds', () => {
    expect(parseRa('6 0 30.5')).toBeCloseTo(90.127, 3)
  })
  it('rejects bad input', () => {
    for (const s of ['', '24:0:0', '1:60:0', '1:0:60', '-1:0:0', 'a:b:c', '1:2']) expect(parseRa(s)).toBeNull()
  })
})

describe('parseDec', () => {
  it('converts ±d:m:s to degrees', () => {
    expect(parseDec('+72:0:0')).toBe(72)
    expect(parseDec('-30:30:0')).toBe(-30.5)
    expect(parseDec('41:16:9')).toBeCloseTo(41.2692, 3)
  })
  it('keeps the sign of -0 degree values', () => {
    expect(parseDec('-0:30:0')).toBe(-0.5)
  })
  it('rejects bad input', () => {
    for (const s of ['', '91:0:0', '-90:0:1', '10:60:0', 'x', '10:20']) expect(parseDec(s)).toBeNull()
  })
})
