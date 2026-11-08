import test from 'node:test'
import assert from 'node:assert/strict'
import { teamChoices } from '../src/games/roster.ts'
import { conditionsOf, enemyPoint, startBattle, tickBattle } from '../src/games/battle.ts'
import { BOSS_MAX, CALM_MS, DOT, LASTS, MIN_PACE, immunities, inflictText, rollCondition } from '../src/games/status.ts'

const seeded = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const loaners = teamChoices([])
const always = () => 0, never = () => 0.999
// Ticks 100 ms at a time with the given dice for status rolls.
const tick = (game, ms, random = never) => { let g = game; const end = g.lastTick + ms; while (g.lastTick < end) g = tickBattle(g, g.lastTick + 100, random); return g }
const foeOf = game => game.enemies[0]
const has = (game, condition) => conditionsOf(game, foeOf(game)).includes(condition)

// One sturdy foe on the trail, just arrived (a boss if asked, with that name and type), and the given Pokemon beside it,
// ready to attack.
function arena(units = [], boss = null) {
  let game = startBattle({ layout: 'trail', waves: 1, difficulty: 1, habitat: 'normal', foes: ['normal'], path: 'switchback' }, loaners, {}, 0, seeded())
  while (!game.enemies.length) game = tickBattle(game, game.lastTick + 100, seeded(game.lastTick))
  const foe = { ...game.enemies[0], hp: 1e6, maxHp: 1e6, progress: 1.5, ...boss ? { boss: true, name: boss.name, type: boss.type } : {} }
  game = { ...game, enemies: [foe], spawns: [] }
  const at = enemyPoint(game, foe)
  return { ...game, units: units.map((name, i) => ({ id: 900 + i, name, shiny: false, col: Math.floor(at.x), row: Math.floor(at.y) + 1, hp: 100, maxHp: 100,
    ready: 0, family: [name], evolves: false, spent: 0, egg: false })) }
}
// The foe with these conditions, each lasting ms from now.
const holding = (game, conditions, ms = 5000) => ({ ...game, enemies: game.enemies.map(enemy => ({ ...enemy,
  conditions: Object.fromEntries(Object.entries(conditions).map(([condition, dps]) => [condition, { until: game.elapsed + ms, dps }])) })) })

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
  assert.deepEqual([LASTS.burn, LASTS.poison, LASTS.frostbite, LASTS.paralysis, LASTS.freeze, LASTS.sleep, LASTS.confusion],
    [5000, 5000, 5000, 3500, 2000, 2000, 2000], 'Nothing lasts over 5 seconds')
})

test('a hit can leave a status condition, called out on the board', () => {
  const burned = tick(arena(['Charmander']), 800, always)
  assert.ok(has(burned, 'burn'))
  assert.ok(burned.effects.some(fx => fx.kind === 'status' && fx.text === 'Burned!'))
  const lucky = tick(arena(['Charmander']), 800, never)
  assert.equal(conditionsOf(lucky, foeOf(lucky)).length, 0)
})

test('a foe carries several conditions at once', () => {
  const game = tick(arena(['Charmander', 'Pikachu', 'Abra']), 1500, always)
  assert.deepEqual(conditionsOf(game, foeOf(game)), ['burn', 'paralysis', 'confusion'], 'Strongest first')
})

test('another burn resets the burn to its full time, without doubling its damage', () => {
  const base = holding(arena(['Charmander']), { burn: 1000 }, 300)
  const hit = tick(base, 800, always)
  const burn = foeOf(hit).conditions.burn
  assert.ok(burn.until > hit.elapsed + LASTS.burn - 1000, 'Reset to about 5 seconds')
  assert.equal(burn.dps, 1000, 'The stronger of the two hits, not their sum')
  assert.equal(hit.effects.filter(fx => fx.text === 'Burned!').length, 0, 'A reset is not called out again')
})

test('burn, frostbite and poison hurt over time, together, and wear off', () => {
  const base = holding(arena(), { burn: 40, poison: 20 }, 1000)
  assert.ok(Math.abs(foeOf(base).hp - foeOf(tick(base, 500)).hp - 30) < 1e-6, '40 + 20 damage a second')
  assert.equal(conditionsOf(tick(base, 1500), foeOf(base)).length, 0)
  assert.ok(DOT.burn > 0 && DOT.frostbite > 0 && DOT.poison > 0)
})

test('frozen or asleep, a foe stands still; it never resets, and after it the foe is calm for a while', () => {
  const frozen = holding(arena(), { freeze: 0 }, 1000)
  assert.equal(foeOf(tick(frozen, 600)).progress, foeOf(frozen).progress)
  // An Ice Pokemon beside it with every roll landing cannot keep it frozen.
  const iced = { ...frozen, units: arena(['Swinub']).units }
  const after = tick(iced, 1300, always)
  assert.ok(!has(after, 'freeze'), 'It thaws on time')
  assert.ok(foeOf(after).calmUntil > after.elapsed && foeOf(after).calmUntil <= after.elapsed + CALM_MS)
  assert.ok(foeOf(after).progress > foeOf(frozen).progress, 'and walks on')
  const asleep = holding(arena(), { sleep: 0 }, 1000)
  assert.equal(foeOf(tick(asleep, 600)).progress, foeOf(asleep).progress)
  // Asleep, it cannot be frozen too.
  const both = tick({ ...asleep, units: arena(['Swinub']).units }, 600, always)
  assert.ok(!has(both, 'freeze'))
})

test('a Fire hit thaws a frozen foe', () => {
  const frozen = holding(arena(['Charmander']), { freeze: 0 })
  const hit = tick(frozen, 800, never)
  assert.ok(!has(hit, 'freeze'))
  assert.ok(foeOf(hit).progress > foeOf(frozen).progress)
})

test('slows add up but never below MIN_PACE; confusion sends a foe back and does not reset', () => {
  const base = arena()
  const walked = (conditions, extra = {}) => {
    const game = holding(base, conditions)
    const ready = { ...game, enemies: game.enemies.map(enemy => ({ ...enemy, ...extra })) }
    return foeOf(tick(ready, 500)).progress - foeOf(ready).progress
  }
  const free = walked({})
  assert.ok(Math.abs(walked({ paralysis: 0 }) - free * 0.5) < 1e-9)
  assert.ok(Math.abs(walked({ paralysis: 0, frostbite: 0 }) - free * 0.375) < 1e-9)
  assert.ok(Math.abs(walked({ paralysis: 0, frostbite: 0 }, { slowUntil: 1e9 }) - free * MIN_PACE) < 1e-9, 'Never below MIN_PACE')
  assert.ok(Math.abs(walked({ confusion: 0 }) + free * 0.5) < 1e-9)
  const confused = holding(arena(['Abra']), { confusion: 0 }, 300)
  const later = tick(confused, 1200, always)
  assert.ok(!has(later, 'confusion'), 'Not reset while it lasted, and calm after')
  assert.ok(foeOf(later).unconfusedUntil > later.elapsed)
})

test('bosses shake conditions off twice as fast and carry at most two', () => {
  const boss = tick(arena(['Charmander', 'Pikachu', 'Abra'], { name: 'Pidgeot', type: 'flying' }), 1500, always)
  const held = conditionsOf(boss, foeOf(boss))
  assert.equal(held.length, BOSS_MAX)
  assert.ok(foeOf(boss).conditions[held[0]].until - boss.elapsed <= LASTS[held[0]] / 2)
})

test('bosses are immune to some conditions, Legendaries and Mythicals to several', () => {
  const set = list => [...list].sort()
  assert.deepEqual(immunities('Rattata', 'normal', false, false), [], 'A Normal foe is immune to nothing')
  assert.deepEqual(set(immunities('Charmander', 'fire', false, false)), ['burn', 'freeze'], 'Every Fire foe: no burns, no freezing')
  assert.deepEqual(set(immunities('Magnemite', 'steel', false, false)), ['poison'])
  assert.deepEqual(set(immunities('Diglett', 'ground', false, false)), [], 'A Ground foe...')
  assert.deepEqual(set(immunities('Dugtrio', 'ground', true, false)), ['paralysis'], '...and a Ground boss, which stays grounded')
  assert.deepEqual(set(immunities('Raichu', 'electric', true, false)), ['paralysis'])
  assert.deepEqual(set(immunities('Moltres', 'fire', true, true)), ['burn', 'freeze', 'frostbite'])
  assert.equal(immunities('Arceus', 'normal', true, true).length, 4)
  for (const name of ['Celebi', 'Lugia', 'Mewtwo', 'Giratina']) assert.ok(immunities(name, 'psychic', true, true).length >= 3, name)
  const other = immunities('Kyogre', 'water', true, true)
  assert.ok(['burn', 'sleep', 'confusion'].every(item => other.includes(item)), 'An unlisted Legendary: its type, sleep and confusion')
  // Moltres in battle: Fire hits never burn it, and it shows it is immune.
  const moltres = tick(arena(['Charmander'], { name: 'Moltres', type: 'fire' }), 700, always)
  assert.ok(!has(moltres, 'burn'))
  assert.ok(moltres.effects.some(fx => fx.text === 'Immune!'))
})

test('every foe is immune to the conditions its type rules out', () => {
  const fiery = arena(['Charmander'])
  const game = tick({ ...fiery, enemies: fiery.enemies.map(enemy => ({ ...enemy, type: 'fire' })) }, 700, always)
  assert.ok(!has(game, 'burn'), 'A Fire foe is never burned')
  assert.ok(game.effects.some(fx => fx.text === 'Immune!'))
})

test('a Pokemon leaves alone a foe its moves cannot touch', () => {
  const base = arena(['Pikachu'])
  const ground = tick({ ...base, enemies: base.enemies.map(enemy => ({ ...enemy, type: 'ground' })) }, 800, always)
  assert.equal(ground.units[0].ready, 0, 'Electric moves do nothing to Ground: Pikachu holds its fire')
  assert.equal(ground.shots.length + ground.strikes.filter(strike => strike.kind === 'hit').length, 0)
  const normal = tick(base, 800, always)
  assert.ok(normal.units[0].ready > 0, 'and attacks a Normal foe as usual')
})
