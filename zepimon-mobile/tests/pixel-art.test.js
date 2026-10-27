import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { constants, crc32, deflateSync, inflateSync } from 'node:zlib'
import { crop, decodePng, inflate, pixelArt } from '../src/pixel-art.ts'

const sprites = new URL('../assets/pokemon/', import.meta.url)
const sprite = name => readFileSync(new URL(name, sprites))
// A PNG with every row stored through one filter type, so each filter is checked against its own encoder.
function png(width, height, rgba, filter) {
  const stride = width * 4, rows = Buffer.alloc(height * (stride + 1))
  const at = (x, y) => (x < 0 || y < 0 ? 0 : rgba[y * stride + x])
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = filter
    for (let x = 0; x < stride; x++) {
      const left = at(x - 4, y), up = at(x, y - 1), corner = at(x - 4, y - 1), estimate = left + up - corner
      const paeth = [left, up, corner].sort((a, b) => Math.abs(estimate - a) - Math.abs(estimate - b))[0]
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter]
      rows[y * (stride + 1) + 1 + x] = (rgba[y * stride + x] - predictor) & 0xff
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const length = Buffer.alloc(4), crc = Buffer.alloc(4)
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
// Pseudo-random bytes from a fixed seed, so failures repeat.
function noise(length, seed = 7) {
  const bytes = Buffer.alloc(length)
  for (let i = 0; i < length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; bytes[i] = seed >>> 24 }
  return bytes
}

test('inflate matches zlib for stored, fixed and dynamic blocks', () => {
  const sample = Buffer.concat([Buffer.from('Every step, a little adventure. '.repeat(400)), noise(70000), Buffer.alloc(3000, 9)])
  for (const options of [{ level: 0 }, { strategy: constants.Z_FIXED }, { level: 1 }, { level: 9 }]) {
    assert.deepEqual(Buffer.from(inflate(deflateSync(sample, options))), sample, JSON.stringify(options))
  }
  assert.deepEqual(inflate(deflateSync(Buffer.alloc(0))), new Uint8Array(0))
})

test('inflate rejects data that is not zlib or ends early', () => {
  assert.throws(() => inflate(Buffer.from('not zlib')), /Not zlib data/)
  const packed = deflateSync(noise(500))
  assert.throws(() => inflate(packed.subarray(0, packed.length - 40)), /ends early|Invalid/)
})

test('every filter type decodes back to the original pixels', () => {
  const rgba = noise(7 * 5 * 4, 3)
  for (const filter of [0, 1, 2, 3, 4]) assert.deepEqual(decodePng(png(7, 5, rgba, filter)), { width: 7, height: 5, rgba: new Uint8Array(rgba) })
})

test('every bundled sprite decodes, and its image data inflates as zlib does', () => {
  const files = readdirSync(sprites).filter(file => file.endsWith('.png'))
  assert.ok(files.length > 1000)
  for (const file of files) {
    const bytes = sprite(file)
    const { width, height, rgba } = decodePng(bytes)
    assert.equal(width, 96, file); assert.equal(height, 96, file); assert.equal(rgba.length, 96 * 96 * 4, file)
    const data = []
    for (let at = 8; at < bytes.length; at += bytes.readUInt32BE(at) + 12) {
      if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + bytes.readUInt32BE(at)))
    }
    const joined = Buffer.concat(data)
    assert.deepEqual(Buffer.from(inflate(joined)), inflateSync(joined), file)
  }
})

test('sprites decode to the same pixels as Pillow', () => {
  // SHA-1 of Image.open(file).convert('RGBA').tobytes()
  const expected = { '25.png': 'dff240ddf6e3b2f16250f3847f8a2a9f7174b7dd', '445-shiny.png': 'e0425a7a38d6d71d7569c62439f65868494ebdb9',
    'egg.png': 'b6c5bdd62b7a655f6c9890d3504999b8c50dbd50' }
  for (const [file, hash] of Object.entries(expected)) {
    assert.equal(createHash('sha1').update(decodePng(sprite(file)).rgba).digest('hex'), hash, file)
  }
})

test('every walking sheet is a strip of eight 44 × 44 frames the decoder reads', () => {
  const trail = new URL('../assets/trail/', import.meta.url)
  const files = readdirSync(trail).filter(file => file.endsWith('.png'))
  assert.ok(files.length > 1000)
  for (const file of files) {
    // IHDR: width, height, then bit depth 8, colour type 6 (RGBA), compression 0, filter 0, interlace 0.
    const bytes = readFileSync(new URL(file, trail))
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20), ...bytes.subarray(24, 29)], [352, 44, 8, 6, 0, 0, 0], file)
  }
  const sheet = decodePng(readFileSync(new URL('charizard.png', trail)))
  // The share image's walking pose is the first east-facing frame, the seventh.
  const east = pixelArt(crop(sheet, 6 * 44, 0, 44, 44))
  assert.ok(east.width > 20 && east.width <= 44 && east.height > 20 && east.height <= 44)
})

test('crop copies one frame and refuses one outside the image', () => {
  const rgba = new Uint8Array(4 * 3 * 4).map((_, i) => i)
  const image = { width: 4, height: 3, rgba }
  assert.deepEqual(crop(image, 1, 1, 2, 2), { width: 2, height: 2, rgba: new Uint8Array([20, 21, 22, 23, 24, 25, 26, 27, 36, 37, 38, 39, 40, 41, 42, 43]) })
  assert.throws(() => crop(image, 3, 0, 2, 1), /outside/)
  assert.throws(() => crop(image, 0, 0, 0, 1), /outside/)
})

test('decodePng rejects other files and formats', () => {
  assert.throws(() => decodePng(Buffer.from('GIF89a')), /Not a PNG/)
  const palette = Buffer.from(sprite('25.png'))
  palette[25] = 3
  assert.throws(() => decodePng(palette), /Unsupported PNG/)
})

test('pixel art covers each opaque pixel exactly once, cropped to the sprite', () => {
  const pixels = decodePng(sprite('25.png'))
  const art = pixelArt(pixels)
  // Pillow: getbbox() is (35, 24, 74, 70), with 1011 opaque pixels in 12 colours.
  assert.deepEqual([art.width, art.height, art.paths.length], [39, 46, 12])
  const covered = new Map()
  for (const { color, opacity, d } of art.paths) {
    assert.match(color, /^#[0-9a-f]{6}$/); assert.ok(opacity > 0 && opacity <= 1)
    for (const [, x, y, run] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
      for (let i = 0; i < Number(run); i++) {
        const key = `${Number(x) + i},${y}`
        assert.ok(!covered.has(key), `${key} drawn twice`)
        covered.set(key, color)
      }
    }
  }
  assert.equal(covered.size, 1011)
  // Pikachu's ear tip, black at (38, 24) in the sprite.
  assert.equal(covered.get('3,0'), '#000000')
  assert.deepEqual(pixelArt({ width: 2, height: 2, rgba: new Uint8Array(16) }), { width: 0, height: 0, paths: [] })
})
