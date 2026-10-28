import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { constants, crc32, deflateSync, inflateSync } from 'node:zlib'
import { crop, decodePng, inflate, pixelArt } from '../src/pixel-art.ts'

const sprites = new URL('../assets/pokemon/', import.meta.url)
const sprite = name => readFileSync(new URL(name, sprites))
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
// A PNG from raw (unfiltered) scanline bytes, every row stored through one filter type, so each filter is checked
// against its own encoder. palette and transparency become PLTE and tRNS; interlace marks the image as interlaced.
function png({ width, height, lines, colorType = 6, depth = 8, filter = 0, palette, transparency, interlace = 0 }) {
  const stride = Math.ceil(width * CHANNELS[colorType] * depth / 8), step = Math.max(1, CHANNELS[colorType] * depth >> 3)
  const rows = Buffer.alloc(height * (stride + 1))
  const at = (x, y) => (x < 0 || y < 0 ? 0 : lines[y * stride + x])
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = filter
    for (let x = 0; x < stride; x++) {
      const left = at(x - step, y), up = at(x, y - 1), corner = at(x - step, y - 1), estimate = left + up - corner
      const paeth = [left, up, corner].sort((a, b) => Math.abs(estimate - a) - Math.abs(estimate - b))[0]
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter]
      rows[y * (stride + 1) + 1 + x] = (lines[y * stride + x] - predictor) & 0xff
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const length = Buffer.alloc(4), crc = Buffer.alloc(4)
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = depth; header[9] = colorType; header[12] = interlace
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    ...(palette ? [chunk('PLTE', Buffer.from(palette))] : []), ...(transparency ? [chunk('tRNS', Buffer.from(transparency))] : []),
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
  for (const filter of [0, 1, 2, 3, 4]) assert.deepEqual(decodePng(png({ width: 7, height: 5, lines: rgba, filter })), { width: 7, height: 5, rgba: new Uint8Array(rgba) })
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

// Android release builds re-save bundled PNGs: in the 1.9.15 APK most sprites are 8-bit palette images, with some grey
// with alpha and 4-bit palettes. Each format here decodes to the pixels written into it.
test('every colour type and bit depth decodes, as Android release builds re-save sprites', () => {
  const decoded = options => [...decodePng(png(options)).rgba]
  const rgb = [255, 0, 0, 0, 255, 0, 0, 0, 255, 250, 250, 250]
  // 8-bit palette with per-entry alpha (the second entry clear), through each filter.
  for (const filter of [0, 1, 2, 3, 4]) {
    assert.deepEqual(decoded({ width: 4, height: 2, colorType: 3, palette: rgb, transparency: [255, 0], filter, lines: [0, 1, 2, 3, 3, 2, 1, 0] }),
      [255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 255, 250, 250, 250, 255, 250, 250, 250, 255, 0, 0, 255, 255, 0, 255, 0, 0, 255, 0, 0, 255])
  }
  // 4-bit and 2-bit palettes pack several pixels into a byte, high bits first.
  assert.deepEqual(decoded({ width: 3, height: 1, colorType: 3, depth: 4, palette: rgb, filter: 1, lines: [0x10, 0x20] }),
    [0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255])
  assert.deepEqual(decoded({ width: 5, height: 1, colorType: 3, depth: 2, palette: rgb, lines: [0xe4, 0xc0] }),
    [250, 250, 250, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 250, 250, 250, 255])
  // 1-bit grey with black named transparent.
  assert.deepEqual(decoded({ width: 8, height: 1, colorType: 0, depth: 1, transparency: [0, 0], lines: [0xb2] }),
    [1, 0, 1, 1, 0, 0, 1, 0].flatMap(bit => bit ? [255, 255, 255, 255] : [0, 0, 0, 0]))
  // Grey with alpha, and RGB with one colour named transparent.
  assert.deepEqual(decoded({ width: 2, height: 1, colorType: 4, filter: 4, lines: [10, 200, 90, 0] }), [10, 10, 10, 200, 90, 90, 90, 0])
  assert.deepEqual(decoded({ width: 2, height: 1, colorType: 2, transparency: [0, 4, 0, 5, 0, 6], lines: [1, 2, 3, 4, 5, 6] }),
    [1, 2, 3, 255, 4, 5, 6, 0])
  // 16 bits per sample keep the high byte.
  assert.deepEqual(decoded({ width: 1, height: 1, depth: 16, lines: [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xff, 0xff] }), [0x12, 0x56, 0x9a, 0xff])
  assert.deepEqual(decoded({ width: 2, height: 2, colorType: 0, depth: 16, filter: 4, lines: [1, 2, 3, 4, 5, 6, 7, 8] }),
    [1, 1, 1, 255, 3, 3, 3, 255, 5, 5, 5, 255, 7, 7, 7, 255])
})

test('the running pose is a sharp stride frame cut from a Trail Defense sheet', () => {
  const sheet = decodePng(readFileSync(new URL('../assets/trail/charizard.png', import.meta.url)))
  assert.deepEqual([sheet.width, sheet.height], [352, 44], 'eight 44 × 44 frames')
  // The share image's running pose is the first east-facing frame, the seventh.
  const stride = pixelArt(crop(sheet, 6 * 44, 0, 44, 44))
  assert.ok(stride.width > 20 && stride.width <= 44 && stride.height > 20 && stride.height <= 44)
})

test('crop copies one frame and refuses one outside the image', () => {
  const image = { width: 4, height: 3, rgba: new Uint8Array(4 * 3 * 4).map((_, i) => i) }
  assert.deepEqual(crop(image, 1, 1, 2, 2), { width: 2, height: 2, rgba: new Uint8Array([20, 21, 22, 23, 24, 25, 26, 27, 36, 37, 38, 39, 40, 41, 42, 43]) })
  assert.throws(() => crop(image, 3, 0, 2, 1), /outside/)
  assert.throws(() => crop(image, 0, 0, 0, 1), /outside/)
})

test('decodePng rejects other files and formats it cannot read', () => {
  assert.throws(() => decodePng(Buffer.from('GIF89a')), /Not a PNG/)
  const rgba = { width: 1, height: 1, lines: [1, 2, 3, 4] }
  assert.throws(() => decodePng(png({ ...rgba, interlace: 1 })), /Unsupported PNG/)
  assert.throws(() => decodePng(png({ ...rgba, colorType: 2, depth: 4 })), /Unsupported PNG/)
  assert.throws(() => decodePng(png({ width: 1, height: 1, colorType: 3, lines: [0] })), /Unsupported PNG/, 'a palette image without its palette')
  assert.throws(() => decodePng(png({ width: 1, height: 1, colorType: 3, palette: [1, 2, 3], lines: [4] })), /Damaged PNG/)
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
