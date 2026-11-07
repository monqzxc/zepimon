import test from 'node:test'
import assert from 'node:assert/strict'
import { battleType, cardKey, teamChoices } from '../src/games/roster.ts'
import { PATHS, WEATHER, WEATHER_HEALTH, WEATHER_POWER, WEATHER_WEAK, boostedBy, unitWeather, weatherPower, callAssist, canPlace, gridSize, placeUnit, planWaves, startBattle, tickBattle, tileAt } from '../src/games/battle.ts'
import { LEVELS, LEVELS_PER_STAGE, STAGES, levelUnlocked, restoreLevelStars, saveLevelStars } from '../src/games/levels.ts'

const seeded = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const loaners = teamChoices([])
const run = (game, act = g => g) => {
  let now = game.lastTick
  while (game.status === 'playing' && now < 1200000) { now += 100; game = act(tickBattle(game, now, seeded(now))) }
  return game
}
const size = level => PATHS[level.spec.path]

test('twenty-five levels in five stages of five, on maps that grow from 6 x 8 to 12 x 20', () => {
  assert.equal(LEVELS.length, 25)
  assert.equal(STAGES.length, 5)
  assert.equal(new Set(LEVELS.map(level => level.id)).size, LEVELS.length)
  assert.equal(new Set(LEVELS.map(level => level.spec.path)).size, LEVELS.length, 'Every level has its own map')
  LEVELS.forEach((level, index) => {
    assert.equal(level.number, index + 1)
    assert.equal(level.stage, Math.floor(index / LEVELS_PER_STAGE))
    assert.equal(level.spec.layout, 'trail')
    assert.deepEqual(level.spec.foes.slice(0, STAGES[level.stage].foes.length), STAGES[level.stage].foes, 'The stage’s foes, then any the weather brings')
    assert.equal(level.name, size(level).name)
    if (!index) return
    const before = LEVELS[index - 1]
    assert.ok(size(level).cols >= size(before).cols && size(level).rows >= size(before).rows, `Level ${level.number} map never shrinks`)
    assert.ok(level.spec.waves >= before.spec.waves, `Level ${level.number} has at least as many waves`)
  })
  assert.deepEqual([size(LEVELS[0]).cols, size(LEVELS[0]).rows], [6, 8])
  assert.deepEqual([size(LEVELS.at(-1)).cols, size(LEVELS.at(-1)).rows], [12, 20])
  assert.ok(!['switchback', 'canyon', 'spiral'].some(path => LEVELS.some(level => level.spec.path === path)), 'Classic trails stay with the Adventure Map')
})

test('each stage ends on a spiral with a named Legendary boss in its last wave', () => {
  const finales = LEVELS.filter(level => level.number % LEVELS_PER_STAGE === 0)
  assert.deepEqual(finales.map(level => level.spec.boss), ['Celebi', 'Lugia', 'Moltres', 'Giratina', 'Arceus'])
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
  assert.equal(levelUnlocked({ 'level-20': 1 }, 20), true, 'Stage 5 opens after the Distortion World')
  assert.equal(levelUnlocked({}, LEVELS.length), false)
  const saved = saveLevelStars({}, 'level-1', 2)
  assert.strictEqual(saveLevelStars(saved, 'level-1', 1), saved)
  assert.deepEqual(saveLevelStars(saved, 'level-1', 3), { 'level-1': 3 })
  assert.strictEqual(saveLevelStars(saved, 'level-2', 0), saved, 'A loss saves nothing')
  for (const [id, stars] of [['level-26', 1], ['route-1', 1], ['level-1', 4], ['level-1', 1.5], ['level-1', -1]]) {
    assert.throws(() => saveLevelStars(saved, id, stars), /Invalid/)
  }
  assert.deepEqual(restoreLevelStars({ 'level-1': 3, 'level-2': 0, 'level-3': 2.5, 'level-20': '3', 'level-26': 3, 'level-4': 1 }), { 'level-1': 3, 'level-4': 1 })
  assert.deepEqual(restoreLevelStars({ 'level-25': 2 }), { 'level-25': 2 })
  assert.deepEqual(restoreLevelStars([3]), {})
  assert.deepEqual(restoreLevelStars(undefined), {})
})

test('bigger maps use their whole board for placement and the Legendary assist', () => {
  const finale = LEVELS[19]
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

test('element tiles: only stage 5 has them, near the trail, and only their own type may stand there', () => {
  for (const level of LEVELS) {
    const { tiles, cells, cols, rows } = size(level)
    if (level.stage < 4) { assert.equal(tiles.size, 0, `${level.name} keeps its plain squares`); continue }
    assert.ok(tiles.size >= 5, `${level.name} has element tiles`)
    for (const [key, type] of tiles) {
      const [col, row] = key.split(',').map(Number)
      assert.ok(col >= 0 && col < cols && row >= 0 && row < rows && !cells.has(key), `${level.name}: ${type} tile ${key} is a free square`)
      const near = [...cells].some(cell => { const [c, r] = cell.split(',').map(Number); return Math.max(Math.abs(c - col), Math.abs(r - row)) <= 2 })
      assert.ok(near, `${level.name}: ${type} tile ${key} is within two squares of the trail, where Pokemon on it can reach`)
    }
    assert.ok([...tiles.values()].some(type => loaners.some(card => battleType(card.family[0]) === type)),
      `${level.name}: a new player's loaners can use at least one kind of tile`)
  }
  const delta = LEVELS.find(level => level.spec.path === 'verdant-delta')
  const game = startBattle(delta.spec, loaners, {}, 0, seeded())
  assert.equal(tileAt(game, 3, 3), 'water')
  assert.equal(tileAt(game, 0, 0), null)
  assert.equal(canPlace(game, 3, 3), true, 'Free, before a Pokemon is chosen')
  assert.equal(canPlace(game, 3, 3, 'Squirtle'), true)
  assert.equal(canPlace(game, 3, 3, 'Charmander'), false, 'Only Water types stand on water')
  assert.equal(canPlace(game, 0, 0, 'Charmander'), true, 'Plain squares take anyone')
  const card = type => cardKey(loaners.find(item => battleType(item.family[0]) === type))
  assert.strictEqual(placeUnit(game, card('fire'), 3, 3), game, 'Refused, nothing changes')
  assert.deepEqual(placeUnit(game, card('water'), 3, 3).units.map(unit => [unit.name, unit.col, unit.row]), [['Squirtle', 3, 3]])
  assert.equal(tileAt(startBattle(LEVELS[0].spec, loaners, {}, 0), 1, 1), null)
})

test('the suggested team covers the map’s tiles it can, grows berries, blocks and hits the stage’s foes', async () => {
  const { suggestTeam } = await import('../src/games/suggest.ts')
  const delta = LEVELS.find(level => level.spec.path === 'verdant-delta')
  const { team, notes, missing } = suggestTeam(loaners, delta.spec)
  const types = team.map(card => battleType(card.family[0]))
  assert.equal(team.length, 6)
  assert.ok(types.includes('water') && types.includes('grass'), 'Water and Grass for Verdant Delta’s tiles')
  assert.ok(types.some(type => ['rock', 'ground', 'steel'].includes(type)), 'A blocker')
  assert.deepEqual(missing, [], 'The loaners cover both tile types')
  assert.ok(notes.some(note => /Water tiles/.test(note)), notes.join(' | '))
  const glacier = suggestTeam(loaners, LEVELS.find(level => level.spec.path === 'glacier-pass').spec)
  assert.deepEqual(glacier.missing, ['ice'], 'No Ice Pokemon among the loaners: those tiles stay empty')
  assert.ok(glacier.team.some(card => battleType(card.family[0]) === 'fire'), 'A Fire Pokemon for the Fire tiles')
  const small = suggestTeam(loaners.slice(0, 2), delta.spec)
  assert.equal(small.team.length, 2, 'Never more cards than you have')
  assert.equal(new Set(team).size, team.length, 'No card twice')
})

test('weather from stage 3 on powers up foes of its types, and brings them into the waves', () => {
  for (const level of LEVELS) {
    const { weather } = level.spec
    if (level.stage < 2) { assert.equal(weather, undefined, `${level.name} has clear skies`); continue }
    assert.ok(weather && WEATHER[weather], `${level.name} has weather`)
    assert.ok(WEATHER[weather].types.some(type => level.spec.foes.includes(type)), `${level.name}: its ${weather} has foes to power up`)
  }
  const glacier = LEVELS.find(level => level.spec.path === 'glacier-pass')
  assert.equal(glacier.spec.weather, 'hail')
  assert.ok(glacier.spec.foes.includes('ice'), 'Hail brings Ice foes to a stage that has none')
  assert.equal(boostedBy('sun', 'fire'), true)
  assert.equal(boostedBy('sun', 'water'), false)
  assert.equal(boostedBy(undefined, 'fire'), false)
  // Same waves with and without the sun: Fire foes come with more health, others are unchanged.
  const ember = LEVELS.find(level => level.spec.path === 'ember-climb')
  const run = spec => { let game = startBattle(spec, loaners, {}, 0, seeded(7)); let now = 0
    while (game.enemies.length < 10 && now < 90000) { now += 100; game = tickBattle(game, now, seeded(now)) } return game.enemies }
  const sunny = run(ember.spec), clear = run({ ...ember.spec, weather: undefined })
  for (const [a, b] of sunny.map((enemy, i) => [enemy, clear[i]])) {
    assert.equal(a.name, b.name)
    if (a.type === 'fire') { assert.equal(a.boosted, true); assert.equal(a.maxHp, Math.round(b.maxHp * WEATHER_HEALTH)); assert.ok(a.speed > b.speed) }
    else { assert.equal(a.boosted, undefined); assert.equal(a.maxHp, b.maxHp) }
  }
  assert.ok(sunny.some(enemy => enemy.type === 'fire'), 'Ember Climb sends Fire foes')
})

test('weather powers up your Pokemon of its types and weakens those it is hard on, all but growers and blockers', () => {
  for (const [weather, { types, weakens }] of Object.entries(WEATHER)) {
    assert.ok(weakens.length, `${weather} weakens some types`)
    assert.ok(!weakens.some(type => types.includes(type)), `${weather} never both powers up and weakens a type`)
  }
  assert.equal(weatherPower('sun', 'fire'), WEATHER_POWER)
  assert.equal(weatherPower('sun', 'water'), WEATHER_WEAK)
  assert.equal(weatherPower('rain', 'fire'), WEATHER_WEAK)
  assert.equal(weatherPower('sun', 'normal'), 1)
  assert.equal(weatherPower(undefined, 'fire'), 1)
  assert.equal(unitWeather('rain', 'Squirtle', 'trail'), 'boosted')
  assert.equal(unitWeather('sun', 'Squirtle', 'trail'), 'weakened')
  assert.equal(unitWeather(undefined, 'Squirtle', 'trail'), null)
  // The Legendary helper feels it too: Kyogre's strike under rain, clear skies and harsh sunlight.
  const ember = LEVELS.find(level => level.spec.path === 'ember-climb')
  const strike = weather => {
    let game = startBattle({ ...ember.spec, weather }, loaners, { assist: 'Kyogre' }, 0, seeded(7)); let now = 0
    while (game.enemies.length < 3 && now < 90000) { now += 100; game = tickBattle(game, now, seeded(now)) }
    // Foes too tough to faint, so each one's loss can be read after the strike.
    game = { ...game, enemies: game.enemies.map(enemy => ({ ...enemy, hp: 10000, maxHp: 10000 })) }
    const after = callAssist(game)
    return game.enemies.map((enemy, i) => enemy.hp - after.enemies[i].hp)
  }
  const clear = strike(undefined), rain = strike('rain'), sun = strike('sun')
  assert.ok(clear.length >= 3 && clear.every(loss => loss > 0))
  clear.forEach((loss, i) => {
    assert.ok(Math.abs(rain[i] - loss * WEATHER_POWER) < 1e-6, 'Rain powers up a Water strike')
    assert.ok(Math.abs(sun[i] - loss * WEATHER_WEAK) < 1e-6, 'Harsh sunlight weakens it')
  })
})
