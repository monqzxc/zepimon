// Reads a Pokemon sprite PNG into pixels and turns them into vector squares, so a share image can show the sprite
// enlarged with hard pixel edges. Phones smooth an enlarged <Image> and offer no nearest-neighbour option.

export type Pixels = { width: number, height: number, rgba: Uint8Array }
// One path per colour; together they cover the opaque pixels of a width × height box cropped to the sprite.
export type PixelArt = { width: number, height: number, paths: { color: string, opacity: number, d: string }[] }

// Deflate (RFC 1951) inside a zlib wrapper (RFC 1950), after Mark Adler's puff: small and slow, which is plenty
// for 96 × 96 sprites.
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
  4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

type Huffman = { counts: Uint16Array, symbols: Uint16Array }
function huffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Uint16Array(16), offsets = new Uint16Array(16), symbols = new Uint16Array(lengths.length)
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++
  counts[0] = 0
  for (let length = 1; length < 16; length++) offsets[length] = offsets[length - 1] + counts[length - 1]
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offsets[lengths[i]]++] = i
  return { counts, symbols }
}
let fixedCodes: [Huffman, Huffman] | undefined

export function inflate(data: Uint8Array): Uint8Array {
  if (data.length < 2 || (data[0] & 0x0f) !== 8 || ((data[0] << 8) | data[1]) % 31 || data[1] & 0x20) throw new Error('Not zlib data')
  let position = 2, bitBuffer = 0, bitCount = 0, size = 0
  let out = new Uint8Array(Math.max(1024, data.length * 4))
  const reserve = (more: number) => {
    if (size + more <= out.length) return
    const grown = new Uint8Array(Math.max(out.length * 2, size + more))
    grown.set(out.subarray(0, size))
    out = grown
  }
  const bits = (count: number) => {
    let value = bitBuffer
    while (bitCount < count) {
      if (position >= data.length) throw new Error('Image data ends early')
      value |= data[position++] << bitCount
      bitCount += 8
    }
    bitBuffer = value >>> count
    bitCount -= count
    return value & ((1 << count) - 1)
  }
  const decode = ({ counts, symbols }: Huffman) => {
    let code = 0, first = 0, index = 0
    for (let length = 1; length < 16; length++) {
      code |= bits(1)
      const count = counts[length]
      if (code - count < first) return symbols[index + code - first]
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new Error('Invalid image data')
  }
  let last = 0
  do {
    last = bits(1)
    const type = bits(2)
    if (type === 0) {
      bitBuffer = 0; bitCount = 0
      if (position + 4 > data.length) throw new Error('Image data ends early')
      const length = data[position] | data[position + 1] << 8
      if (length !== (~(data[position + 2] | data[position + 3] << 8) & 0xffff)) throw new Error('Invalid image data')
      position += 4
      if (position + length > data.length) throw new Error('Image data ends early')
      reserve(length)
      out.set(data.subarray(position, position + length), size)
      size += length; position += length
      continue
    }
    if (type === 3) throw new Error('Invalid image data')
    let literals: Huffman, distances: Huffman
    if (type === 1) {
      if (!fixedCodes) {
        const lengths = new Uint8Array(288)
        lengths.fill(8, 0, 144); lengths.fill(9, 144, 256); lengths.fill(7, 256, 280); lengths.fill(8, 280, 288)
        fixedCodes = [huffman(lengths), huffman(new Uint8Array(30).fill(5))]
      }
      [literals, distances] = fixedCodes
    } else {
      const literalCount = bits(5) + 257, distanceCount = bits(5) + 1, codeCount = bits(4) + 4
      if (literalCount > 286 || distanceCount > 30) throw new Error('Invalid image data')
      const codeLengths = new Uint8Array(19)
      for (let i = 0; i < codeCount; i++) codeLengths[CODE_LENGTH_ORDER[i]] = bits(3)
      const lengthCode = huffman(codeLengths)
      const lengths = new Uint8Array(literalCount + distanceCount)
      for (let i = 0; i < lengths.length;) {
        const symbol = decode(lengthCode)
        if (symbol < 16) { lengths[i++] = symbol; continue }
        if (symbol === 16 && i === 0) throw new Error('Invalid image data')
        const value = symbol === 16 ? lengths[i - 1] : 0
        let repeat = symbol === 16 ? 3 + bits(2) : symbol === 17 ? 3 + bits(3) : 11 + bits(7)
        if (i + repeat > lengths.length) throw new Error('Invalid image data')
        while (repeat--) lengths[i++] = value
      }
      if (!lengths[256]) throw new Error('Invalid image data')
      literals = huffman(lengths.subarray(0, literalCount))
      distances = huffman(lengths.subarray(literalCount))
    }
    for (;;) {
      let symbol = decode(literals)
      if (symbol < 256) { reserve(1); out[size++] = symbol; continue }
      if (symbol === 256) break
      symbol -= 257
      if (symbol >= 29) throw new Error('Invalid image data')
      const length = LENGTH_BASE[symbol] + bits(LENGTH_EXTRA[symbol])
      const code = decode(distances)
      if (code >= 30) throw new Error('Invalid image data')
      const distance = DISTANCE_BASE[code] + bits(DISTANCE_EXTRA[code])
      if (distance > size) throw new Error('Invalid image data')
      reserve(length)
      for (let i = 0; i < length; i++, size++) out[size] = out[size - distance]
    }
  } while (!last)
  return out.slice(0, size)
}

// 8-bit RGBA, not interlaced: the format of every sprite in assets/pokemon. Anything else throws, and the caller
// falls back to a plain <Image>.
export function decodePng(bytes: Uint8Array): Pixels {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 8 || signature.some((value, i) => bytes[i] !== value)) throw new Error('Not a PNG image')
  const word = (at: number) => (bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0
  let position = 8, width = 0, height = 0, format = ''
  const parts: Uint8Array[] = []
  while (position + 8 <= bytes.length) {
    const length = word(position), start = position + 8, end = start + length
    const type = String.fromCharCode(...bytes.subarray(position + 4, start))
    if (end + 4 > bytes.length) throw new Error('PNG image ends early')
    if (type === 'IHDR') { width = word(start); height = word(start + 4); format = bytes.subarray(start + 8, start + 13).join(',') }
    else if (type === 'IDAT') parts.push(bytes.subarray(start, end))
    else if (type === 'IEND') break
    position = end + 4
  }
  if (format !== '8,6,0,0,0' || !(width > 0 && width <= 1024 && height > 0 && height <= 1024)) throw new Error('Unsupported PNG image')
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((at, part) => { joined.set(part, at); return at + part.length }, 0)
  const filtered = inflate(joined)
  const stride = width * 4
  if (filtered.length < height * (stride + 1)) throw new Error('PNG image ends early')
  const rgba = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)], from = y * (stride + 1) + 1, row = y * stride, above = row - stride
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[row + x - 4] : 0, up = y ? rgba[above + x] : 0, corner = x >= 4 && y ? rgba[above + x - 4] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const estimate = left + up - corner
        const [a, b, c] = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - corner)]
        predictor = a <= b && a <= c ? left : b <= c ? up : corner
      } else if (filter !== 0) throw new Error('Unsupported PNG image')
      rgba[row + x] = (filtered[from + x] + predictor) & 0xff
    }
  }
  return { width, height, rgba }
}

// One frame of a sprite sheet, such as a single pose of a walking strip.
export function crop({ width, height, rgba }: Pixels, left: number, top: number, cropWidth: number, cropHeight: number): Pixels {
  if (left < 0 || top < 0 || cropWidth <= 0 || cropHeight <= 0 || left + cropWidth > width || top + cropHeight > height) {
    throw new Error('The frame is outside the image')
  }
  const out = new Uint8Array(cropWidth * cropHeight * 4)
  for (let y = 0; y < cropHeight; y++) {
    out.set(rgba.subarray(((top + y) * width + left) * 4, ((top + y) * width + left + cropWidth) * 4), y * cropWidth * 4)
  }
  return { width: cropWidth, height: cropHeight, rgba: out }
}

// Crops to the opaque pixels and draws each colour as one path of horizontal runs, one unit per pixel.
export function pixelArt({ width, height, rgba }: Pixels): PixelArt {
  // RGBA as one number; 0 for every fully transparent pixel.
  const colorAt = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return rgba[i + 3] ? (rgba[i] << 24 | rgba[i + 1] << 16 | rgba[i + 2] << 8 | rgba[i + 3]) >>> 0 : 0
  }
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!colorAt(x, y)) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < 0) return { width: 0, height: 0, paths: [] }
  const paths = new Map<number, string>()
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right;) {
      const color = colorAt(x, y)
      let end = x + 1
      while (end <= right && colorAt(end, y) === color) end++
      if (color) paths.set(color, `${paths.get(color) ?? ''}M${x - left} ${y - top}h${end - x}v1h${x - end}z`)
      x = end
    }
  }
  return { width: right - left + 1, height: bottom - top + 1, paths: [...paths].map(([color, d]) =>
    ({ color: `#${(color >>> 8).toString(16).padStart(6, '0')}`, opacity: (color & 0xff) / 255, d })) }
}
