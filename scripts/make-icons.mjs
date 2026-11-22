// Generates public/icon-192.png, icon-512.png, apple-touch-icon.png (180x180).
// Node built-ins only: software rasteriser (4x4 supersampling) + zlib PNG encoder.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BG = [11, 16, 32]
const MOON = [242, 233, 201]
// Shapes in a 100x100 design space.
const stars = [[74, 24, 2.5, [255, 255, 255]], [82, 58, 2, [207, 216, 255]], [24, 22, 2, [207, 216, 255]]]

function pixel(x, y) {
  let c = BG
  const d = (cx, cy) => Math.hypot(x - cx, y - cy)
  if (d(46, 52) <= 26 && d(58, 44) > 24) c = MOON
  for (const [sx, sy, r, col] of stars) if (d(sx, sy) <= r) c = col
  return c
}

function render(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const N = 4
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0
      for (let sy = 0; sy < N; sy++)
        for (let sx = 0; sx < N; sx++) {
          const c = pixel(((px + (sx + 0.5) / N) / size) * 100, ((py + (sy + 0.5) / N) / size) * 100)
          r += c[0]; g += c[1]; b += c[2]
        }
      const o = py * (size * 3 + 1) + 1 + px * 3
      raw[o] = Math.round(r / N / N); raw[o + 1] = Math.round(g / N / N); raw[o + 2] = Math.round(b / N / N)
    }
  }
  return raw
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const out = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url))
writeFileSync(out('icon-192.png'), png(192))
writeFileSync(out('icon-512.png'), png(512))
writeFileSync(out('apple-touch-icon.png'), png(180))
console.log('icons written')
