import test from 'node:test'
import assert from 'node:assert/strict'
import { battleType, cardKey, teamChoices } from '../src/games/roster.ts'
import { PATHS, callAssist, canPlace, gridSize, placeUnit, planWaves, startBattle, tickBattle } from '../src/games/battle.ts'
import { LEVELS, LEVELS_PER_STAGE, STAGES, levelUnlocked, restoreLevelStars, saveLevelStars } from '../src/games/levels.ts'

const seeded = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const loaners = teamChoices([])
const run = (game, act = g => g) => {
  let now = game.lastTick
  while (game.status === 'playing' && now < 1200000) { now += 100; game = act(tickBattle(game, now, seeded(now))) }
  return game
}
const size = level => PATHS[level.spec.path]

test('twenty levels in four stages of five, on maps that grow from 6 x 8 to 9 x 16', () => {
  assert.equal(LEVELS.length, 20)
  assert.equal(STAGES.length, 4)
  assert.equal(new Set(LEVELS.map(level => level.id)).size, LEVELS.length)
  assert.equal(new Set(LEVELS.map(level => level.spec.path)).size, LEVELS.length, 'Every level has its own map')
  LEVELS.forEach((level, index) => {
    assert.equal(level.number, index + 1)
    assert.equal(level.stage, Math.floor(index / LEVELS_PER_STAGE))
    assert.equal(level.spec.layout, 'trail')
    assert.deepEqual(level.spec.foes, STAGES[level.stage].foes)
    assert.equal(level.name, size(level).name)
    if (!index) return
    const before = LEVELS[index - 1]
    assert.ok(size(level).cols >= size(before).cols && size(level).rows >= size(before).rows, `Level ${level.number} map never shrinks`)
    assert.ok(level.spec.waves >= before.spec.waves, `Level ${level.number} has at least as many waves`)
  })
  assert.deepEqual([size(LEVELS[0]).cols, size(LEVELS[0]).rows], [6, 8])
  assert.deepEqual([size(LEVELS.at(-1)).cols, size(LEVELS.at(-1)).rows], [9, 16])
  assert.ok(!['switchback', 'canyon', 'spiral'].some(path => LEVELS.some(level => level.spec.path === path)), 'Classic trails stay with the Adventure Map')
})

test('each stage ends on a spiral with a named Legendary boss in its last wave', () => {
  const finales = LEVELS.filter(level => level.number % LEVELS_PER_STAGE === 0)
  assert.deepEqual(finales.map(level => level.spec.boss), ['Celebi', 'Lugia', 'Moltres', 'Giratina'])
  for (const level of finales) {
    const { points, cols, rows } = size(level)
    const end = points.at(-1)
    assert.ok(end.x > 0 && end.x < cols && end.y > 0 && end.y < rows, `${level.name} ends in the middle of the board`)
    const last = planWaves(level.spec, seeded()).at(-1)
    assert.deepEqual([last.name, last.boss, last.wave], [level.spec.boss, true, level.spec.waves - 1])
  }
  assert.ok(LEVELS.filter(level => level.number % LEVELS_PER_STAGE).every(level => !level.spec.boss))
})

test('every trail map enters from outside, stays on its board, and never crosses or touches itself', () => {
  for (const [id, { points, cols, rows, cells, length }] of Object.entries(PATHS)) {
    const inside = (col, row) => col >= 0 && col < cols && row >= 0 && row < rows
    assert.ok(!inside(Math.floor(points[0].x), Math.floor(points[0].y)), `${id} starts off the board`)
    const walk = [[Math.floor(points[0].x), Math.floor(points[0].y)]]
    let total = 0
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      assert.ok(a.x === b.x || a.y === b.y, `${id} segment ${i} is straight`)
      const steps = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
      total += steps
      for (let s = 1; s <= steps; s++) walk.push([Math.floor(a.x + (b.x - a.x) * s / steps), Math.floor(a.y + (b.y - a.y) * s / steps)])
    }
    assert.equal(length, total)
    const order = new Map()
    walk.forEach(([col, row], index) => {
      if (!inside(col, row)) return
      assert.ok(!order.has(col + ',' + row), `${id} crosses itself at ${col},${row}`)
      order.set(col + ',' + row, index)
    })
    const steps = [...order.values()]
    assert.equal(steps.at(-1) - steps[0] + 1, order.size, `${id} never leaves the board and comes back`)
    assert.ok(walk.length - 1 - steps.at(-1) <= 1, `${id} ends on the board or just past its edge`)
    for (const [key, index] of order) {
      const [col, row] = key.split(',').map(Number)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const other = order.get((col + dc) + ',' + (row + dr))
        assert.ok(other === undefined || Math.abs(other - index) === 1, `${id} touches itself beside ${key}`)
      }
    }
    assert.deepEqual([...cells].sort(), [...order.keys()].sort(), `${id} trail squares match the walk`)
    assert.ok(cols * rows - cells.size >= cols * rows * 0.4, `${id} leaves plenty of room to build`)
  }
})

test('levels unlock one at a time and keep the best stars', () => {
  assert.equal(levelUnlocked({}, 0), true)
  assert.equal(levelUnlocked({}, 1), false)
  assert.equal(levelUnlocked({ 'level-1': 1 }, 1), true)
  assert.equal(levelUnlocked({ 'level-1': 3 }, 2), false)
  assert.equal(levelUnlocked({ 'level-19': 1 }, 19), true)
  assert.equal(levelUnlocked({}, LEVELS.length), false)
  const saved = saveLevelStars({}, 'level-1', 2)
  assert.strictEqual(saveLevelStars(saved, 'level-1', 1), saved)
  assert.deepEqual(saveLevelStars(saved, 'level-1', 3), { 'level-1': 3 })
  assert.strictEqual(saveLevelStars(saved, 'level-2', 0), saved, 'A loss saves nothing')
  for (const [id, stars] of [['level-21', 1], ['route-1', 1], ['level-1', 4], ['level-1', 1.5], ['level-1', -1]]) {
    assert.throws(() => saveLevelStars(saved, id, stars), /Invalid/)
  }
  assert.deepEqual(restoreLevelStars({ 'level-1': 3, 'level-2': 0, 'level-3': 2.5, 'level-20': '3', 'level-21': 3, 'level-4': 1 }), { 'level-1': 3, 'level-4': 1 })
  assert.deepEqual(restoreLevelStars([3]), {})
  assert.deepEqual(restoreLevelStars(undefined), {})
})

test('bigger maps use their whole board for placement and the Legendary assist', () => {
  const finale = LEVELS.at(-1)
  const game = startBattle(finale.spec, loaners, { assist: 'Kyogre' }, 0, seeded())
  assert.deepEqual(gridSize(game), { cols: 9, rows: 16 })
  assert.deepEqual(gridSize(startBattle(LEVELS[0].spec, loaners, {}, 0)), { cols: 6, rows: 8 })
  assert.equal(canPlace(game, 8, 15), true, 'The far corner of a 9 x 16 map')
  assert.equal(canPlace(game, 9, 0), false)
  assert.equal(canPlace(game, 0, 16), false)
  assert.equal(canPlace(game, 7, 5), false, 'On the trail')
  assert.deepEqual(placeUnit(game, cardKey(loaners[1]), 8, 15).units.map(unit => [unit.col, unit.row]), [[8, 15]])
  const helped = callAssist(game)
  assert.deepEqual(helped.effects.map(fx => [fx.kind, fx.x, fx.y]), [['assist', 4.5, 8]], 'The assist bursts in the middle of the big map')
})

test('doing nothing loses every level; a simple builder clears level 1 but not the final level', () => {
  for (const level of LEVELS) assert.equal(run(startBattle(level.spec, loaners, {}, 0, seeded())).status, 'lost', level.name)
  const builder = spec => {
    const { cols, rows, cells } = PATHS[spec.path]
    const path = [...cells].map(cell => cell.split(',').map(Number))
    const spots = []
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) spots.push([col, row])
    const near = ([col, row]) => path.filter(([c, r]) => Math.hypot(c - col, r - row) <= 2).length
    spots.sort((a, b) => near(b) - near(a))
    return game => {
      const spot = spots.find(([col, row]) => canPlace(game, col, row))
      const cards = game.team.filter(item => battleType(item.family[0]) !== 'grass')
      return spot ? placeUnit(game, cardKey(cards[game.units.length % cards.length]), spot[0], spot[1]) : game
    }
  }
  const first = LEVELS[0].spec, last = LEVELS.at(-1).spec
  assert.equal(run(startBattle(first, loaners, {}, 0, seeded()), builder(first)).status, 'won')
  assert.equal(run(startBattle(last, loaners, {}, 0, seeded()), builder(last)).status, 'lost', 'The last stage needs evolving and type matchups')
})
