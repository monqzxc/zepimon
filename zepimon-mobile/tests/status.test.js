import test from 'node:test'
import assert from 'node:assert/strict'
import { teamChoices } from '../src/games/roster.ts'
import { conditionOf, enemyPoint, startBattle, tickBattle } from '../src/games/battle.ts'
import { CALM_MS, DOT, LASTS, inflictText, rollCondition } from '../src/games/status.ts'

const seeded = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const loaners = teamChoices([])
const always = () => 0, never = () => 0.999
// Ticks 100 ms at a time with the given dice for status rolls.
const tick = (game, ms, random = never) => { let g = game; const end = g.lastTick + ms; while (g.lastTick < end) g = tickBattle(g, g.lastTick + 100, random); return g }
const foeOf = game => game.enemies[0]

// One sturdy foe on the trail, just arrived, and the given Pokemon (by name) beside it, ready to attack.
function arena(units = [], { boss = false } = {}) {
  let game = startBattle({ layout: 'trail', waves: 1, difficulty: 1, habitat: 'normal', foes: ['normal'], path: 'switchback' }, loaners, {}, 0, seeded())
  while (!game.enemies.length) game = tickBattle(game, game.lastTick + 100, seeded(game.lastTick))
  const foe = { ...game.enemies[0], hp: 1e6, maxHp: 1e6, boss, progress: 1.5 }
  game = { ...game, enemies: [foe], spawns: [] }
  const at = enemyPoint(game, foe)
  return { ...game, units: units.map((name, i) => ({ id: 900 + i, name, shiny: false, col: Math.floor(at.x), row: Math.floor(at.y) + 1, hp: 100, maxHp: 100,
    ready: 0, family: [name], evolves: false, spent: 0, egg: false })) }
}
const withFoe = (game, change) => ({ ...game, enemies: game.enemies.map(enemy => ({ ...enemy, ...change(enemy) })) })

test('each move type causes its own conditions, at its own odds', () => {
  assert.equal(rollCondition('fire', always), 'burn')
  assert.equal(rollCondition('fire', never), null)
  const dice = [0.5, 0]
  assert.equal(rollCondition('ice', () => dice.shift()), 'frostbite', 'Freeze (10%) missed, frostbite (20%) landed')
  assert.equal(rollCondition('ice', always), 'freeze')
  assert.equal(rollCondition('electric', always), 'paralysis')
  assert.equal(rollCondition('psychic', always), 'confusion')
  assert.equal(rollCondition('water', always), null, 'Water Gun causes nothing')
  assert.equal(inflictText('fire'), 'may burn (20%)')
  assert.equal(inflictText('ice'), 'may freeze (10%) or frostbite (20%)')
  assert.equal(inflictText('water'), '')
})

test('a hit can leave a status condition, called out on the board', () => {
  const burned = tick(arena(['Charmander']), 800, always)
  assert.equal(conditionOf(burned, foeOf(burned)), 'burn')
  assert.ok(burned.effects.some(fx => fx.kind === 'status' && fx.text === 'Burned!'))
  const lucky = tick(arena(['Charmander']), 800, never)
  assert.equal(conditionOf(lucky, foeOf(lucky)), null)
})

test('a foe has one condition at a time; confusion comes on top', () => {
  let game = withFoe(arena(['Pikachu', 'Abra']), () => ({ status: 'burn', statusUntil: 1e9, statusDps: 0 }))
  game = tick(game, 1500, always)
  assert.equal(foeOf(game).status, 'burn', 'Still burned, not paralyzed')
  assert.ok(foeOf(game).confusedUntil > game.elapsed, 'but confused as well')
})

test('burn, frostbite and poison hurt over time, and wear off', () => {
  const game = withFoe(arena(), enemy => ({ status: 'burn', statusUntil: enemy.statusUntil ?? 0, statusDps: 40 }))
  const burning = withFoe(game, () => ({ statusUntil: game.elapsed + 1000 }))
  const after = tick(burning, 500)
  assert.ok(Math.abs(foeOf(burning).hp - foeOf(after).hp - 20) < 1e-6, '40 damage a second')
  const over = tick(burning, 1500)
  assert.equal(foeOf(over).status, undefined)
  assert.ok(DOT.burn > 0 && DOT.frostbite > 0 && DOT.poison > 0)
})

test('frozen or asleep, a foe stands still; after, it cannot be frozen or put to sleep again for a moment', () => {
  const base = arena()
  const frozen = withFoe(base, () => ({ status: 'freeze', statusUntil: base.elapsed + 1000, statusDps: 0 }))
  const held = tick(frozen, 600)
  assert.equal(foeOf(held).progress, foeOf(frozen).progress)
  const thawed = tick(frozen, 1300)
  assert.ok(foeOf(thawed).progress > foeOf(frozen).progress, 'and walks on once it thaws')
  assert.ok(foeOf(thawed).calmUntil > thawed.elapsed && foeOf(thawed).calmUntil <= thawed.elapsed + CALM_MS)
  // An Ice Pokemon beside it with every roll landing: freeze comes up first, and the calm foe shrugs it off.
  const calm = { ...thawed, units: arena(['Swinub']).units }
  assert.notEqual(conditionOf(tick(calm, 600, always), foeOf(calm)), 'freeze')
  const asleep = withFoe(base, () => ({ status: 'sleep', statusUntil: base.elapsed + 1000, statusDps: 0 }))
  assert.equal(foeOf(tick(asleep, 600)).progress, foeOf(asleep).progress)
})

test('a Fire hit thaws a frozen foe', () => {
  const base = arena(['Charmander'])
  const frozen = withFoe(base, () => ({ status: 'freeze', statusUntil: base.elapsed + 5000, statusDps: 0 }))
  const hit = tick(frozen, 800, never)
  assert.equal(conditionOf(hit, foeOf(hit)), null)
  assert.ok(foeOf(hit).progress > foeOf(frozen).progress)
})

test('paralysis halves its pace, frostbite slows it a little, confusion sends it back', () => {
  const base = arena()
  const walked = (change) => { const game = withFoe(base, () => ({ statusUntil: base.elapsed + 5000, statusDps: 0, ...change })); return foeOf(tick(game, 500)).progress - foeOf(game).progress }
  const free = walked({})
  assert.ok(Math.abs(walked({ status: 'paralysis' }) - free * 0.5) < 1e-9)
  assert.ok(Math.abs(walked({ status: 'frostbite' }) - free * 0.75) < 1e-9)
  assert.ok(Math.abs(walked({ confusedUntil: base.elapsed + 5000 }) + free * 0.5) < 1e-9)
})

test('a boss shakes conditions off twice as fast', () => {
  const boss = tick(arena(['Charmander'], { boss: true }), 800, always)
  const foe = foeOf(boss)
  assert.equal(foe.status, 'burn')
  assert.ok(foe.statusUntil - boss.elapsed <= LASTS.burn / 2)
})
