import test from 'node:test'
import assert from 'node:assert/strict'
import { teamChoices } from '../src/games/roster.ts'
import { ASSIST_DAMAGE, bossCharging, callAssist, enemyPoint, startBattle, tickBattle } from '../src/games/battle.ts'
import { BLAST_DAMAGE, BLAST_REACH, BOSS_CHARGE, BOSS_DASH, BOSS_EVERY, BOSS_FIRST, HEAL_SHARE, SHIELD_SHARE, STUN_MS, SUMMONS, bossMoves } from '../src/games/boss.ts'
import { LEVELS } from '../src/games/levels.ts'

const seeded = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const loaners = teamChoices([])
const spec = (boss, extra = {}) => ({ layout: 'trail', waves: 1, difficulty: 1, habitat: 'fire', foes: ['fire'], path: 'switchback', boss, ...extra })
const tick = (game, ms) => { let g = game; const end = g.lastTick + ms; while (g.lastTick < end) g = tickBattle(g, g.lastTick + 100, seeded(g.lastTick)); return g }
const bossOf = game => game.enemies.find(enemy => enemy.boss)

// A battle with only its boss on the field, just arrived, and the given Pokemon placed (as [name, col, row], col and
// row relative to the boss's square).
function arena(name, units = [], options = {}) {
  let game = startBattle(spec(name), loaners, options, 0, seeded())
  while (!bossOf(game)) game = tickBattle(game, game.lastTick + 100, seeded(game.lastTick))
  const boss = bossOf(game)
  const at = enemyPoint(game, boss)
  return { ...game, enemies: [boss], units: units.map(([unit, dx, dy], i) => ({ id: 900 + i, name: unit, shiny: false, col: Math.floor(at.x) + dx,
    row: Math.floor(at.y) + dy, hp: 100, maxHp: 100, ready: Infinity, family: [unit], evolves: false, spent: 0, egg: false })) }
}
// Has the boss use one of its moves now: due at once, then charged.
function use(game, skill) {
  const boss = bossOf(game)
  const index = bossMoves(boss.name).findIndex(move => move.skill === skill)
  assert.ok(index >= 0, `${boss.name} knows ${skill}`)
  const due = { ...game, enemies: game.enemies.map(enemy => enemy.boss ? { ...enemy, skillIndex: index, nextSkill: game.elapsed } : enemy) }
  return tick(due, BOSS_CHARGE + 200)
}

test('every boss knows moves of its own, Legendary bosses three or more', () => {
  for (const level of LEVELS.filter(item => item.spec.boss)) {
    const moves = bossMoves(level.spec.boss)
    assert.ok(moves.length >= 3, `${level.spec.boss} has its own moves`)
    assert.equal(new Set(moves.map(move => move.skill)).size, moves.length, 'No skill twice')
  }
  assert.deepEqual(bossMoves('Charizard').map(move => move.move), ['Flamethrower', 'Agility'])
  assert.deepEqual(bossMoves('Gengar').map(move => move.skill), ['stun', 'dash'])
  assert.equal(bossMoves('Arceus').length, 4)
})

test('a boss charges its moves in turn: it stands still, then acts, and charges the next one later', () => {
  let game = arena('Moltres')
  const due = bossOf(game).nextSkill - BOSS_FIRST
  assert.ok(due <= game.elapsed && due > game.elapsed - 200, 'Its first move comes BOSS_FIRST after it arrives')
  game = tick(game, bossOf(game).nextSkill - game.elapsed + 100)
  const charging = bossOf(game)
  assert.deepEqual(bossCharging(game, charging), bossMoves('Moltres')[0])
  const held = tick(game, BOSS_CHARGE / 2)
  assert.equal(bossOf(held).progress, charging.progress, 'It stands still while charging')
  game = tick(game, BOSS_CHARGE + 100)
  const boss = bossOf(game)
  assert.equal(bossCharging(game, boss), null)
  assert.equal(boss.lastSkill.move, 'Heat Wave')
  assert.equal(boss.skillIndex, 1)
  assert.ok(boss.nextSkill > game.elapsed && boss.nextSkill <= game.elapsed + BOSS_EVERY)
  assert.ok(game.effects.some(fx => fx.kind === 'boss' && fx.text === 'Heat Wave!'))
})

test('a blast strikes your Pokemon nearby, and can make them faint', () => {
  const game = use(arena('Moltres', [['Squirtle', 0, 1], ['Bulbasaur', 1, 0], ['Charmander', 9, 9]]), 'blast')
  const damage = Math.round(BLAST_DAMAGE * (1 + 0.1 * bossOf(game).wave))
  const hp = Object.fromEntries(game.units.map(unit => [unit.name, unit.hp]))
  assert.equal(hp.Squirtle, 100 - damage)
  assert.equal(hp.Bulbasaur, 100 - damage)
  assert.equal(hp.Charmander, 100, `Beyond ${BLAST_REACH} squares: untouched`)
  const frail = arena('Moltres', [['Squirtle', 0, 1]])
  const fainted = use({ ...frail, units: frail.units.map(unit => ({ ...unit, hp: 5 })) }, 'blast')
  assert.equal(fainted.units.length, 0, 'A Pokemon with little health left faints')
})

test('a stun stops your Pokemon nearby from attacking until it wears off', () => {
  let game = arena('Celebi', [['Charmander', 0, 1], ['Squirtle', 9, 9]])
  game = use(game, 'stun')
  // Ready to attack the moment the stun lands.
  game = { ...game, units: game.units.map(unit => ({ ...unit, ready: 0 })) }
  const [near, far] = game.units
  assert.ok(near.stunnedUntil > game.elapsed && near.stunnedUntil <= game.elapsed + STUN_MS)
  assert.equal(far.stunnedUntil, undefined)
  const quiet = tick(game, 600)
  assert.equal(quiet.units[0].ready, 0, 'A stunned Pokemon does not attack')
  assert.equal(quiet.shots.length, 0)
  const awake = tick(game, STUN_MS + 200)
  assert.ok(awake.units[0].ready > 0, 'and attacks again once it wears off')
})

test('a shield soaks up hits until it breaks; it never stops poison', () => {
  const plain = arena('Lugia', [], { assist: 'Rayquaza' })
  const shielded = use(plain, 'shield')
  const boss = bossOf(shielded)
  assert.equal(boss.shield, Math.round(boss.maxHp * SHIELD_SHARE))
  const struck = callAssist(shielded)
  const after = bossOf(struck)
  assert.ok(after.shield < boss.shield, 'The strike wears the shield down')
  const loss = boss.hp - after.hp, unshielded = bossOf(plain).hp - bossOf(callAssist(plain)).hp
  assert.ok(loss < unshielded, 'and the boss loses less than without one')
  assert.ok(unshielded <= ASSIST_DAMAGE * 2)
  const poisoned = tick({ ...shielded, enemies: shielded.enemies.map(enemy => ({ ...enemy, poisonUntil: 1e9, poisonDps: 50 })) }, 500)
  assert.equal(bossOf(poisoned).shield, boss.shield, 'Poison leaves the shield alone')
  assert.ok(bossOf(poisoned).hp < boss.hp - 20, 'and seeps through it')
})

test('a heal restores health and shakes off slow and poison', () => {
  let game = arena('Lugia')
  game = { ...game, enemies: game.enemies.map(enemy => ({ ...enemy, hp: enemy.maxHp / 2, slowUntil: 1e9, poisonUntil: 1e9, poisonDps: 0 })) }
  game = use(game, 'heal')
  const boss = bossOf(game)
  assert.ok(Math.abs(boss.hp - boss.maxHp * (0.5 + HEAL_SHARE)) <= 1)
  assert.equal(boss.slowUntil, 0)
  assert.equal(boss.poisonUntil, 0)
})

test('a dash rushes the boss ahead', () => {
  const game = use(arena('Moltres'), 'dash')
  const fast = tick(game, 500), calm = tick({ ...game, enemies: game.enemies.map(enemy => ({ ...enemy, dashUntil: 0 })) }, 500)
  const gained = bossOf(fast).progress - bossOf(game).progress, normal = bossOf(calm).progress - bossOf(game).progress
  assert.ok(Math.abs(gained - normal * BOSS_DASH) < 1e-6)
})

test('a summon calls foes of the battle’s kinds just behind the boss', () => {
  const game = use(arena('Celebi'), 'summon')
  const boss = bossOf(game)
  const called = game.enemies.filter(enemy => !enemy.boss)
  assert.equal(called.length, SUMMONS)
  for (const foe of called) {
    assert.equal(foe.type, 'fire')
    assert.ok(foe.progress < boss.progress)
  }
})
