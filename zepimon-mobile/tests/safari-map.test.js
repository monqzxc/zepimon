import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { resolve } from 'node:path'
import { safariMap } from '../src/generated/safari-map.js'

const load = () => vm.runInNewContext(
  fs.readFileSync('src/generated/safari-assets.js', 'utf8').replace(/export const /g, 'const ') + '\n;({ safariSprites, safariChunks })',
  { require(path) { assert.ok(path.startsWith('../../assets/safari/'), path); return path } })
const size = path => { const png = fs.readFileSync(resolve('src/generated', path)); return [png.readUInt32BE(16), png.readUInt32BE(20)] }
const positions = char => safariMap.tiles.flatMap((row, y) => [...row].flatMap((c, x) => c === char ? [{ x, y }] : []))
const count = char => positions(char).length
const areaOf = ({ x, y }) => safariMap.areas[y][x]
// 4-connected groups of tall grass inside one area.
function grassPatches(letter) {
  const seen = new Set()
  let patches = 0
  for (const start of positions('g').filter(p => areaOf(p) === letter)) {
    if (seen.has(`${start.x},${start.y}`)) continue
    patches++
    const queue = [start]
    seen.add(`${start.x},${start.y}`)
    while (queue.length) {
      const { x, y } = queue.pop()
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const next = { x: x + dx, y: y + dy }, key = `${next.x},${next.y}`
        if (seen.has(key) || safariMap.tiles[next.y]?.[next.x] !== 'g' || areaOf(next) !== letter) continue
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return patches
}

test('the Safari map is a 44 x 44 grid of known tiles with matching areas', () => {
  assert.deepEqual([safariMap.cols, safariMap.rows, safariMap.chunk], [44, 44, 8])
  assert.equal(safariMap.tiles.length, 44)
  assert.equal(safariMap.areas.length, 44)
  for (let y = 0; y < 44; y++) {
    assert.match(safariMap.tiles[y], /^[.gT~RFv<>oSG#@1234]{44}$/, `tiles row ${y}`)
    assert.match(safariMap.areas[y], /^[gmlkn]{44}$/, `areas row ${y}`)
  }
})

test('each area has its start, sign, one or two items and 3-5 grass patches; the gate area has none', () => {
  const area = { meadow: 'm', lake: 'l', mountain: 'k', night: 'n' }
  const digit = { meadow: '1', lake: '2', mountain: '3', night: '4' }
  assert.equal(count('o'), 6)
  for (const [name, letter] of Object.entries(area)) {
    assert.deepEqual(positions(digit[name]), [safariMap.starts[name]])
    assert.equal(areaOf(safariMap.starts[name]), letter)
    assert.equal(positions('S').filter(p => areaOf(p) === letter).length, 1, `${name} sign`)
    const items = positions('o').filter(p => areaOf(p) === letter).length
    assert.ok(items >= 1 && items <= 2, `${name} items`)
    const patches = grassPatches(letter)
    assert.ok(patches >= 3 && patches <= 5, `${name} has ${patches} grass patches`)
  }
  assert.deepEqual(positions('@'), [safariMap.starts.gate])
  assert.equal(areaOf(safariMap.starts.gate), 'g')
  assert.ok(positions('G').length >= 1 && positions('G').every(p => areaOf(p) === 'g'))
  assert.equal(positions('g').filter(p => areaOf(p) === 'g').length, 0, 'no grass in the gate area')
  assert.ok(positions('~').filter(p => areaOf(p) === 'l').length >= 40, 'Lakeside has a lake')
  assert.ok(count('v') + count('<') + count('>') >= 3, 'ledges')
})

test('every chunk has a ground image of the right size, and a top image only when flagged', () => {
  const { safariChunks } = load()
  const keys = []
  for (let cy = 0; cy < 6; cy++) for (let cx = 0; cx < 6; cx++) keys.push(`${cx},${cy}`)
  assert.deepEqual(Object.keys(safariMap.chunks).sort(), keys.sort())
  assert.deepEqual(Object.keys(safariChunks).sort(), keys.sort())
  for (const key of keys) {
    const [cx, cy] = key.split(',').map(Number)
    const expected = [Math.min(8, 44 - cx * 8) * 64, Math.min(8, 44 - cy * 8) * 64]
    assert.deepEqual(size(safariChunks[key].ground), expected, key)
    assert.equal(!!safariChunks[key].top, safariMap.chunks[key].top, key)
    if (safariChunks[key].top) assert.deepEqual(size(safariChunks[key].top), expected, key)
  }
})
