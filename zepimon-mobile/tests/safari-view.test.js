import test from 'node:test'
import assert from 'node:assert/strict'
import { buddyFrame, cameraOffset, chunksAround, followPath, noInput, pressDirection, releaseDirection, takeInput, tileFromTap,
  tileSizeFor, trainerFrame } from '../src/games/safari-view.ts'
import { safariMap } from '../src/games/safari-zone.ts'

test('tile size fits about 9 tiles across, between 40 and 64', () => {
  assert.deepEqual([320, 390, 600, 1280].map(tileSizeFor), [40, 43, 64, 64])
})

test("the camera centres the trainer's tile", () => {
  assert.deepEqual(cameraOffset({ x: 10, y: 4 }, 40, 400, 600), { x: -220, y: 120 })
  assert.deepEqual(tileFromTap({ x: 200, y: 300 }, { x: 10, y: 4 }, 40, 400, 600), { x: 10, y: 4 })
  assert.deepEqual(tileFromTap({ x: 240, y: 300 }, { x: 10, y: 4 }, 40, 400, 600), { x: 11, y: 4 })
})

test('loaded chunks always cover the visible window', () => {
  for (const width of [320, 390, 768, 1280]) {
    for (const height of [480, 700, 1024]) {
      for (const at of [{ x: 0, y: 0 }, { x: 43, y: 43 }, { x: 21, y: 30 }, safariMap.starts.gate]) {
        const tile = tileSizeFor(width)
        const offset = cameraOffset(at, tile, width, height)
        const keys = new Set(chunksAround(at, tile, width, height))
        for (const key of keys) assert.ok(safariMap.chunks[key], `${key} is not a chunk`)
        for (let y = 0; y < safariMap.rows; y++) {
          for (let x = 0; x < safariMap.cols; x++) {
            const visible = offset.x + x * tile < width && offset.x + (x + 1) * tile > 0 && offset.y + y * tile < height && offset.y + (y + 1) * tile > 0
            if (visible) assert.ok(keys.has(`${Math.floor(x / 8)},${Math.floor(y / 8)}`), `${width}x${height} at ${at.x},${at.y}: tile ${x},${y}`)
          }
        }
        if (width === 390 && height === 700) assert.ok(keys.size <= 12, `${keys.size} chunks`)
      }
    }
  }
})

test('frame indexes follow the strip orders', () => {
  assert.equal(trainerFrame('south', 0), 0)
  assert.equal(trainerFrame('east', 2), 11)
  assert.equal(buddyFrame('north', 0), 2)
  assert.equal(buddyFrame('west', 1), 5)
})

test('a quick tap takes exactly one step, holding keeps walking, one step per take', () => {
  const tapped = releaseDirection(pressDirection(noInput, 'north'), 'north')
  const first = takeInput(tapped)
  assert.equal(first.direction, 'north')
  assert.equal(takeInput(first.input).direction, null)

  let held = pressDirection(noInput, 'east')
  for (let i = 0; i < 3; i++) {
    const taken = takeInput(held)
    assert.equal(taken.direction, 'east')
    held = taken.input
  }

  const twice = pressDirection(pressDirection(noInput, 'west'), 'west')
  const once = takeInput(twice)
  assert.equal(once.direction, 'west')
  const holding = takeInput(once.input)
  assert.equal(holding.direction, 'west')
  assert.equal(takeInput(releaseDirection(holding.input, 'west')).direction, null)
})

test('a D-pad press replaces a tap path, and a new path replaces holding', () => {
  let path = followPath(noInput, ['north', 'east'])
  const steps = []
  for (let i = 0; i < 3; i++) {
    const taken = takeInput(path)
    steps.push(taken.direction)
    path = taken.input
  }
  assert.deepEqual(steps, ['north', 'east', null])
  assert.deepEqual(pressDirection(followPath(noInput, ['south']), 'west').path, [])
  const following = followPath(pressDirection(noInput, 'west'), ['south'])
  assert.deepEqual([following.held, following.queued], [null, null])
  assert.deepEqual(noInput, { held: null, queued: null, path: [] })
})
