import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { resolve } from 'node:path'
import { decodePng } from '../src/pixel-art.ts'

// The generated manifest, with each require() replaced by its path so the PNGs can be read from disk.
const load = () => vm.runInNewContext(
  fs.readFileSync('src/generated/safari-assets.js', 'utf8').replace(/export const /g, 'const ') + '\n;({ safariSprites, safariChunks })',
  { require(path) { assert.ok(path.startsWith('../../assets/safari/'), path); return path } })
const file = path => fs.readFileSync(resolve('src/generated', path))
const size = path => { const png = file(path); return [png.readUInt32BE(16), png.readUInt32BE(20)] }
const hex = (rgba, i) => '#' + [0, 1, 2].map(c => rgba[i + c].toString(16).padStart(2, '0')).join('')
// Colours of the opaque pixels in one 64 x 128 trainer frame, between two source rows (each source row is 4 output rows).
function colours(name, frame, top, bottom) {
  const { width, rgba } = decodePng(file(load().safariSprites[name].source))
  const found = new Set()
  for (let y = top * 4; y < (bottom + 1) * 4; y++) {
    for (let x = frame * 64; x < frame * 64 + 64; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3]) found.add(hex(rgba, i))
    }
  }
  return found
}

test('every Safari sprite is a strip of its declared frames, enlarged 4x', () => {
  const { safariSprites } = load()
  assert.deepEqual(Object.keys(safariSprites).sort(),
    ['battleGrass', 'battlePond', 'brendan', 'dust', 'grass', 'item', 'may', 'safariBall', 'shadow'])
  for (const [key, { source, frames, width, height }] of Object.entries(safariSprites)) {
    assert.deepEqual(size(source), [frames * width, height], key)
    assert.ok(width % 4 === 0 && height % 4 === 0, key)
  }
  const shape = ({ frames, width, height }) => ({ frames, width, height })
  assert.deepEqual(shape(safariSprites.brendan), { frames: 12, width: 64, height: 128 })
  assert.deepEqual(shape(safariSprites.may), { frames: 12, width: 64, height: 128 })
  assert.deepEqual(shape(safariSprites.grass), { frames: 5, width: 64, height: 64 })
  assert.deepEqual(shape(safariSprites.item), { frames: 1, width: 64, height: 64 })
  assert.deepEqual(shape(safariSprites.battleGrass), { frames: 1, width: 960, height: 448 })
  assert.deepEqual(shape(safariSprites.battlePond), { frames: 1, width: 960, height: 448 })
})

test('Brendan and May wear purple caps and black-and-white shirts, and keep their green bags', () => {
  const cases = {
    brendan: { cap: [0, 19], greens: ['#73cd73', '#4a9452'] },
    may: { cap: [0, 17], greens: ['#6ad541', '#41ac20'] }
  }
  for (const [name, { cap, greens }] of Object.entries(cases)) {
    const capColours = colours(name, 0, ...cap)
    assert.ok(capColours.has('#6a3fc8') || capColours.has('#a474ee'), `${name}: purple cap`)
    assert.ok(greens.every(green => !capColours.has(green)), `${name}: no green on the cap`)
    const shirt = colours(name, 0, 21, 27)
    assert.ok(shirt.has('#282830'), `${name}: black shirt`)
    assert.ok(!shirt.has('#c54141') && !shirt.has('#ff625a'), `${name}: no red on the shirt`)
    assert.ok(greens.some(green => colours(name, 3, 21, 31).has(green)), `${name}: bag stays green (back view)`)
  }
})
