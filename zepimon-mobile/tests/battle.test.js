import test from 'node:test'
import assert from 'node:assert/strict'
import { LOANERS, autoTeam, battleType, cardKey, eggMovesOf, familyOf, legendaryAssists, stageOf, teamChoices, wildPool } from '../src/games/roster.ts'
import { ASSIST_DAMAGE, EGG_HARVEST, EGG_POWER, EGG_TOUGHNESS, LANES, PATHS, PLACE_COOLDOWN, ROWS, START_BERRIES, START_LIVES, battleScore, battleStars,
  callAssist, canPlace, collectDrop, effectiveness, eggPerk, evolveUnit, kitFor, nextForm, nextWaveIn, pathPoint, pauseBattle, placeUnit, planWaves,
  removeUnit, resumeBattle, sendNextWave, startBattle, tickBattle, pathHeading, enemyHeading, facingToward, unitTarget, actedRecently, MOVES, moveOf } from '../src/games/battle.ts'
import { STOPS, freePlaySpec } from '../src/games/adventure.ts'

const seeded = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const lanes = (extra = {}) => ({ layout: 'lanes', waves: 2, difficulty: 1, habitat: 'normal', foes: ['normal'], path: 'switchback', ...extra })
const trail = (extra = {}) => ({ ...lanes(), layout: 'trail', ...extra })
const loaners = teamChoices([])
const own = names => teamChoices(names).filter(item => !item.loaner)
const card = name => cardKey(loaners.find(item => item.name === name))
const run = (game, until, step = 100, act = g => g) => {
  let now = game.lastTick
  while (game.status === 'playing' && now < until) { now += step; game = act(tickBattle(game, now, seeded(now))) }
  return game
}
const enemy = (extra = {}) => ({ id: 900, name: 'Rattata', type: 'normal', wave: 0, boss: false, hp: 50, maxHp: 50, speed: 0.26,
  lane: 0, progress: 0, slowUntil: 0, poisonUntil: 0, poisonDps: 0, reward: 0, ...extra })

test('teams start with loaners and add every non-Legendary Dex form', () => {
  assert.deepEqual(loaners.map(item => item.name), LOANERS)
  assert.ok(loaners.every(item => item.loaner && !item.hatched))
  const choices = teamChoices(['Charizard', 'Shiny Charmander', 'Mewtwo', 'Egg', 'Mega Venusaur', 'Ivysaur'])
  assert.ok(!choices.some(item => item.name === 'Mewtwo' || item.name === 'Egg'), 'Legendaries assist instead of joining the team')
  assert.ok(choices.some(item => item.name === 'Charmander' && item.loaner) && choices.some(item => item.name === 'Charmander' && item.shiny))
  assert.equal(stageOf('Mega Venusaur'), 3)
  assert.equal(battleType('Mega Venusaur'), 'grass')
  assert.deepEqual(familyOf('Shiny Ivysaur'), ['Bulbasaur', 'Ivysaur', 'Venusaur'])
  assert.deepEqual(legendaryAssists(['Mewtwo', 'Shiny Mewtwo', 'Articuno', 'Pikachu']), ['Articuno', 'Mewtwo'])
  const team = autoTeam(choices)
  assert.equal(team.length, 6)
  const ghosts = autoTeam(teamChoices(['Gastly', 'Gengar'])).map(item => item.name)
  assert.ok(ghosts.includes('Gengar') && !ghosts.includes('Gastly'), 'Owned evolved forms beat their first stage')
  assert.ok(team.some(item => battleType(item.name) === 'grass') && team.some(item => ['rock', 'ground', 'steel'].includes(battleType(item.name))))
})

test('hatched Pokemon know their family’s real Gen II-IV egg moves; Safari catches and loaners do not', () => {
  const choices = teamChoices(['Charmander', 'Bulbasaur', 'Geodude', 'Ivysaur', 'Shiny Pidgey'], ['Ivysaur', 'Shiny Pidgey'])
  const find = key => choices.find(item => cardKey(item) === key)
  assert.equal(find('Charmander').hatched, true)
  assert.equal(find('Shiny Pidgey').hatched, false)
  assert.equal(find('Pikachu').hatched, undefined, 'Loaners never hatched')
  const names = list => list.map(move => move.name)
  assert.deepEqual(eggMovesOf('Charizard'), eggMovesOf('Charmander'), 'The whole chain shares its egg moves')
  assert.ok(names(eggMovesOf('Charmander')).includes('Dragon Rush'))
  assert.deepEqual(eggMovesOf('Mega Charizard X'), eggMovesOf('Charmander'))
  assert.deepEqual(eggMovesOf('Magnemite'), [], 'Some families have no egg moves')
  assert.ok(eggMovesOf('Gastly').some(move => move.name === 'Fire Punch' && move.type === 'fire' && move.power === 75))

  assert.deepEqual(eggPerk('Charmander', 'trail'), { move: 'Crunch', type: 'dark', kind: 'coverage', text: 'Dark coverage: each hit uses whichever type is stronger' },
    'The egg move that improves the most matchups wins')
  assert.equal(eggPerk('Bulbasaur', 'lanes').kind, 'harvest')
  assert.equal(eggPerk('Geodude', 'lanes').kind, 'toughness')
  assert.equal(eggPerk('Geodude', 'trail').kind, 'coverage', 'Blockers quake on a trail, so their egg move attacks')
  assert.equal(eggPerk('Eevee', 'trail').kind, 'power', 'Only same-type damaging egg moves: harder hits')
  assert.equal(eggPerk('Chatot', 'trail').kind, 'guard', 'Only status egg moves: more health')
  assert.equal(eggPerk('Magnemite', 'trail'), null)
  assert.ok(autoTeam(choices).some(item => item.name === 'Charmander' && item.hatched), 'Hatched cards beat the matching loaner')

  const damageFrom = (team, foe) => {
    let game = placeUnit(startBattle(trail({ waves: 1 }), team, {}, 0), cardKey(team[0]), 1, 0)
    game = run({ ...game, spawns: [], enemies: [enemy({ type: foe, hp: 1000, maxHp: 1000, speed: 0, progress: 1.2 })] }, 400)
    return 1000 - game.enemies[0].hp
  }
  const hatched = name => teamChoices([name]).filter(item => item.hatched)
  assert.equal(damageFrom(teamChoices([]).filter(item => item.name === 'Charmander'), 'psychic'), 22)
  assert.equal(damageFrom(hatched('Charmander'), 'psychic'), 22 * 2, 'Crunch (Dark) hits Psychic for double')
  assert.equal(damageFrom(hatched('Eevee'), 'normal'), 20 * EGG_POWER)

  const grower = placeUnit(startBattle(lanes(), hatched('Bulbasaur'), {}, 0), 'Bulbasaur', 2, 5)
  assert.equal(run(grower, 3900).drops.find(drop => drop.col === 2).value, 25 + EGG_HARVEST.lanes)
  const wall = placeUnit(startBattle(lanes(), hatched('Geodude'), {}, 0), 'Geodude', 0, 0)
  assert.equal(wall.units[0].maxHp, Math.round(kitFor('Geodude', 'lanes').hp * EGG_TOUGHNESS))
  assert.equal(placeUnit(startBattle(lanes(), loaners, {}, 0), card('Geodude'), 0, 0).units[0].maxHp, kitFor('Geodude', 'lanes').hp)
  const magnet = placeUnit(startBattle(trail(), hatched('Magnemite'), {}, 0), 'Magnemite', 5, 0)
  assert.equal(magnet.units[0].egg, true)
  assert.equal(magnet.units[0].maxHp, kitFor('Magnemite', 'trail').hp, 'Hatched without egg moves: no perk')
})

test('kits follow type, scale with stage, and Route Guard prices evolved forms higher', () => {
  assert.equal(kitFor('Bulbasaur', 'lanes').effect, 'produce')
  assert.equal(kitFor('Geodude', 'lanes').effect, 'wall')
  assert.equal(kitFor('Geodude', 'trail').label, 'Quake', 'Blockers shake the ground on a trail')
  assert.equal(kitFor('Charizard', 'lanes').damage, kitFor('Charmander', 'lanes').damage * 2.1)
  assert.ok(kitFor('Charizard', 'lanes').cost > kitFor('Charmander', 'lanes').cost)
  assert.equal(kitFor('Charizard', 'trail').cost, kitFor('Charmander', 'trail').cost)
  assert.equal(effectiveness('water', 'fire'), 2)
  assert.equal(effectiveness('fire', 'water'), 0.5)
  assert.equal(effectiveness('normal', 'ghost'), 0.5, 'Immunities are softened')
  assert.equal(effectiveness('normal', 'normal'), 1)
})

test('wild pools stay within Gen 1-4, skip Legendaries and make evolved forms rarer', () => {
  const pool = wildPool(['psychic'])
  assert.ok(pool.some(wild => wild.name === 'Abra') && !pool.some(wild => wild.name === 'Mewtwo'))
  assert.ok(pool.find(wild => wild.name === 'Abra').weight > pool.find(wild => wild.name === 'Alakazam').weight)
  assert.equal(wildPool(['not-a-type']).length, 0)
})

test('waves are seeded, grow in size, hold back evolved foes and end with a boss', () => {
  const spec = lanes({ waves: 6, foes: ['grass', 'fire'] })
  const waves = planWaves(spec, seeded(3))
  assert.deepEqual(planWaves(spec, seeded(3)), waves)
  const count = wave => waves.filter(spawn => spawn.wave === wave && !spawn.boss).length
  assert.ok(count(5) > count(0))
  assert.ok(waves.filter(spawn => spawn.wave < 2).every(spawn => stageOf(spawn.name) === 1))
  assert.deepEqual(waves.filter(spawn => spawn.boss).map(spawn => spawn.wave), [5])
  assert.equal(planWaves(trail({ waves: 3, boss: 'Mewtwo' }), seeded()).at(-1).name, 'Mewtwo')
  assert.ok(planWaves(lanes({ foes: ['nothing'] }), seeded()).length > 0, 'An empty foe list falls back to Normal types')
  assert.ok(waves.every((spawn, i) => !i || spawn.at >= waves[i - 1].at))
})

test('placing costs berries, respects the grid, cooldowns and the trail itself', () => {
  const game = startBattle(lanes(), loaners, { bonus: 25 }, 0)
  assert.equal(game.berries, START_BERRIES.lanes + 25)
  const placed = placeUnit(game, card('Bulbasaur'), 0, 5)
  assert.equal(placed.units.length, 1)
  assert.equal(placed.berries, game.berries - kitFor('Bulbasaur', 'lanes').cost)
  assert.strictEqual(placeUnit(placed, card('Charmander'), 0, 5), placed, 'Occupied cell')
  assert.strictEqual(placeUnit(placed, card('Bulbasaur'), 1, 5), placed, 'Card is recharging')
  assert.strictEqual(placeUnit(placed, card('Charmander'), LANES, 0), placed)
  assert.strictEqual(placeUnit(placed, card('Charmander'), 0, ROWS), placed)
  assert.strictEqual(placeUnit(placed, 'Mewtwo', 1, 1), placed)
  const broke = { ...placed, berries: 10 }
  assert.strictEqual(placeUnit(broke, card('Charmander'), 1, 1), broke, 'Not enough berries')
  const recharged = { ...placed, elapsed: PLACE_COOLDOWN }
  assert.equal(placeUnit(recharged, card('Bulbasaur'), 1, 5).units.length, 2)
  assert.equal(removeUnit(placed, placed.units[0].id).berries, placed.berries + 25, 'Half the cost is refunded')

  const path = startBattle(trail(), loaners, {}, 0)
  const { cols, rows, cells } = PATHS.switchback
  const [onPath] = [...cells]
  const [col, row] = onPath.split(',').map(Number)
  assert.equal(canPlace(path, col, row), false)
  assert.equal(canPlace(path, cols - 1, rows - 1), true)
  assert.equal(canPlace(path, cols, 0), false, 'Off the board')
  assert.equal(placeUnit(path, card('Charmander'), cols - 1, rows - 1).units[0].name, 'Charmander')
  const shiny = startBattle(trail(), own(['Shiny Charizard']), {}, 0)
  const fire = placeUnit(shiny, 'Shiny Charizard', 5, 0)
  assert.equal(fire.units[0].name, 'Charmander', 'Trail Defense starts every family at its first stage')
  assert.equal(fire.units[0].shiny, true)
})

test('every Trail Defense family can evolve to its final stage; Route Guard units keep their form', () => {
  let game = startBattle(trail(), loaners, { bonus: 1000 }, 0)
  game = placeUnit(game, card('Charmander'), 5, 0)
  const unit = game.units[0]
  assert.deepEqual(nextForm(unit), { name: 'Charmeleon', cost: 125 }, 'Loaners evolve too')
  game = evolveUnit(game, unit.id)
  assert.equal(game.units[0].name, 'Charmeleon')
  assert.equal(game.units[0].hp, kitFor('Charmeleon', 'trail').hp)
  assert.deepEqual(nextForm(game.units[0]), { name: 'Charizard', cost: 190 })
  game = evolveUnit(game, game.units[0].id)
  assert.equal(game.units[0].name, 'Charizard')
  assert.equal(nextForm(game.units[0]), null, 'Fully evolved')
  assert.strictEqual(evolveUnit(game, game.units[0].id), game)
  assert.equal(refund(game), Math.floor((125 + 125 + 190) / 10) * 5)
  const single = placeUnit(startBattle(trail(), own(["Farfetch'd"]), { bonus: 500 }, 0), "Farfetch'd", 5, 0)
  assert.equal(nextForm(single.units[0]), null, 'Single-stage Pokemon have nothing to evolve into')
  const poor = placeUnit(startBattle(trail(), own(['Charizard']), {}, 0), 'Charizard', 5, 0)
  assert.strictEqual(evolveUnit({ ...poor, berries: 0 }, poor.units[0].id).units[0].name, 'Charmander')
  const guard = placeUnit(startBattle(lanes(), own(['Charizard']), { bonus: 500 }, 0), 'Charizard', 0, 4)
  assert.equal(guard.units[0].name, 'Charizard')
  assert.equal(nextForm(placeUnit(startBattle(lanes(), loaners, {}, 0), card('Charmander'), 0, 4).units[0]), null)
})
const refund = game => removeUnit(game, game.units[0].id).berries - game.berries

test('lane foes stop at a Pokemon and bite it; each Snorlax wakes once, then a breach loses', () => {
  let game = startBattle(lanes({ waves: 1 }), loaners, {}, 0)
  game = placeUnit(game, card('Geodude'), 0, 2)
  game = { ...game, spawns: [], enemies: [enemy({ progress: 1.6 })] }
  game = run(game, 3000)
  assert.equal(game.enemies[0].progress, 1.7, 'The foe waits in front of the blocker')
  assert.ok(game.units[0].hp < kitFor('Geodude', 'lanes').hp)

  game = startBattle(lanes({ waves: 1 }), loaners, {}, 0)
  game = { ...game, spawns: [{ at: 99999, name: 'Rattata', wave: 0, boss: false, lane: 1 }],
    enemies: [enemy({ progress: ROWS - 0.05, speed: 1 }), enemy({ id: 901, progress: 2, speed: 0 })] }
  game = tickBattle(game, 100)
  assert.deepEqual(game.guards, [false, true, true, true, true])
  assert.equal(game.enemies.length, 0, 'Snorlax clears every foe in its lane')
  assert.equal(game.status, 'playing')
  game = tickBattle({ ...game, enemies: [enemy({ progress: ROWS - 0.05, speed: 1 })] }, 200)
  assert.equal(game.status, 'lost')
  assert.equal(battleStars(game), 0)
})

test('a brawler behind a blocker still reaches the foe nibbling that blocker', () => {
  let game = startBattle(lanes({ waves: 1 }), teamChoices(['Machop', 'Geodude']).filter(item => !item.loaner), { bonus: 500 }, 0)
  game = placeUnit(placeUnit(game, 'Geodude', 0, 1), 'Machop', 0, 2)
  game = run({ ...game, spawns: [], enemies: [enemy({ hp: 200, maxHp: 200, progress: 0.6 })] }, 6000)
  assert.equal(game.status, 'won', 'The foe at the blocker is two rows above Machop and still in reach')
})

test('foes face the way the trail runs, and walk south down Route Guard lanes', () => {
  // switchback: down 2, right 4, down 2, left 3, down 2, right 3, down 3
  assert.deepEqual([0, 1.9, 2.1, 5.9, 6.5, 8.5, 11, 13, 16.5, 30].map(d => pathHeading('switchback', d)),
    ['S', 'S', 'E', 'E', 'S', 'W', 'S', 'E', 'S', 'S'])
  assert.equal(pathHeading('spiral', 0), 'E')
  assert.equal(pathHeading('spiral', 12), 'W')
  assert.equal(pathHeading('canyon', 11.5), 'N', 'The canyon climbs back up before its last turn')
  assert.equal(enemyHeading({ layout: 'lanes', spec: lanes() }, enemy({ progress: 3 })), 'S')
  assert.equal(enemyHeading({ layout: 'trail', spec: trail() }, enemy({ progress: 3 })), 'E')
})

test('placed Pokemon look at the foe they attack and lunge right after acting', () => {
  assert.deepEqual([[1, 0], [-1, 0.2], [0.2, -1], [0, 1]].map(([x, y]) => facingToward({ x: 0, y: 0 }, { x, y })), ['E', 'W', 'N', 'S'])
  let game = placeUnit(startBattle(trail({ waves: 1 }), loaners, {}, 0), card('Squirtle'), 1, 0)
  const near = enemy({ id: 901, hp: 1000, maxHp: 1000, speed: 0, progress: 1.2 })
  game = { ...game, spawns: [], enemies: [enemy({ hp: 1000, maxHp: 1000, speed: 0, progress: 18 }), near] }
  assert.equal(unitTarget(game, game.units[0]).id, 901, 'The same foe the engine shoots at')
  assert.equal(actedRecently(game, game.units[0]), false)
  game = run(game, 300)
  assert.equal(actedRecently(game, game.units[0]), true, 'Just attacked')
  assert.equal(actedRecently({ ...game, elapsed: game.elapsed + 300 }, game.units[0]), false, 'The lunge lasts only a moment')
  const grower = placeUnit(startBattle(lanes(), loaners, {}, 0), card('Bulbasaur'), 0, 5)
  assert.equal(unitTarget({ ...grower, enemies: [enemy({ lane: 0, progress: 2 })] }, grower.units[0]), null, 'Growers watch no one')
  const wall = placeUnit(startBattle(lanes(), loaners, {}, 0), card('Geodude'), 0, 3)
  assert.equal(unitTarget({ ...wall, enemies: [enemy({ lane: 0, progress: 2.7 })] }, wall.units[0]).lane, 0, 'A blocker watches the foe nibbling it')
  assert.equal(unitTarget({ ...wall, enemies: [enemy({ lane: 0, progress: 0.5 })] }, wall.units[0]), null)
})

test('trail leaks cost lives, a boss costs three, and running out of lives loses', () => {
  let game = startBattle(trail({ waves: 1 }), loaners, {}, 0)
  const end = PATHS.switchback.length
  game = { ...game, spawns: [{ at: 99999, name: 'Rattata', wave: 0, boss: false, lane: 0 }],
    enemies: [enemy({ progress: end - 0.01, speed: 1 }), enemy({ id: 901, boss: true, progress: end - 0.01, speed: 1 })] }
  game = tickBattle(game, 100)
  assert.equal(game.lives, START_LIVES - 4)
  assert.equal(game.enemies.length, 0)
  game = tickBattle({ ...game, lives: 1, enemies: [enemy({ progress: end, speed: 1 })] }, 200)
  assert.equal(game.status, 'lost')
  assert.deepEqual(pathPoint('switchback', 0), { x: 0.5, y: -0.5 })
  assert.deepEqual(pathPoint('switchback', end + 5), { x: 4.5, y: 8.5 })
})

test('shots use type matchups and effects; defeated trail foes pay berries', () => {
  let game = startBattle(trail({ waves: 1 }), loaners, {}, 0)
  game = placeUnit(game, card('Squirtle'), 1, 0)
  game = { ...game, spawns: [], berries: 0, enemies: [enemy({ type: 'fire', hp: 1000, maxHp: 1000, speed: 0, progress: 1.2, reward: 15 })] }
  game = run(game, 500)
  assert.ok(game.effects.some(fx => fx.kind === 'super'), 'Super-effective hits are called out')
  game = run(game, 1400)
  assert.equal(game.enemies[0].hp, 1000 - 16 * 2, 'Water is super effective against fire')
  assert.ok(game.enemies[0].progress < 1.2, 'Water pushes foes back')
  game = run({ ...game, enemies: [{ ...game.enemies[0], hp: 1 }] }, 4000)
  assert.equal(game.status, 'won')
  assert.equal(game.berries, 15)
  assert.equal(game.defeated, 1)
  assert.equal(battleStars(game), 3)
  assert.equal(battleScore(game), 1)
})

test('Pokemon attack with their type’s move: shots carry it and each hit leaves a strike that follows its foe, then fades', () => {
  const types = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock',
    'ghost', 'dragon', 'dark', 'steel', 'fairy']
  assert.deepEqual(Object.keys(MOVES).sort(), types.sort(), 'Every type has a move')
  assert.equal(moveOf('Charmander', 'trail'), 'Ember')
  assert.equal(moveOf('Geodude', 'trail'), 'Rock Throw', 'Blockers quake on a trail')
  assert.equal(moveOf('Geodude', 'lanes'), null, 'Blockers and growers do not attack')
  assert.equal(moveOf('Bulbasaur', 'trail'), null)

  const foes = [enemy({ hp: 1000, maxHp: 1000, speed: 0, progress: 1.2 }), enemy({ id: 901, hp: 1000, maxHp: 1000, speed: 0, progress: 1.6 })]
  const fight = (key, team = loaners) => ({ ...placeUnit(startBattle(trail({ waves: 1 }), team, {}, 0), key, 1, 0), spawns: [], enemies: foes })
  let game = run(fight(card('Charmander')), 300)
  assert.equal(game.shots[0].move, 'fire')
  game = run(game, 500)
  const hit = game.strikes.find(strike => strike.kind === 'hit')
  assert.deepEqual([hit.move, hit.foe], ['fire', 901], 'Ember lands on the foe it was thrown at')
  assert.ok(game.strikes.some(strike => strike.kind === 'spread' && strike.move === 'fire' && strike.foe === 900), 'The splash catches the foe beside it')
  const moved = run({ ...game, enemies: game.enemies.map(foe => ({ ...foe, progress: foe.progress + 0.25 })) }, game.lastTick + 100)
  const { x, y } = moved.strikes.find(strike => strike.id === hit.id)
  assert.deepEqual({ x, y }, pathPoint('switchback', 1.85), 'The hit stays on its foe')
  assert.deepEqual(run({ ...moved, units: [] }, moved.lastTick + 600).strikes, [], 'Strikes fade within half a second')

  const zap = run(fight(card('Pikachu')), 500)
  assert.ok(zap.strikes.some(strike => strike.kind === 'spread' && strike.move === 'electric' && strike.foe === 900), 'Thunder Shock chains to a second foe')
  const quake = run(fight(card('Geodude')), 300)
  const wave = quake.strikes.find(strike => strike.kind === 'wave')
  assert.deepEqual([wave.move, wave.x, wave.y, wave.reach], ['rock', 1.5, 0.5, kitFor('Geodude', 'trail').range])
  assert.equal(quake.strikes.filter(strike => strike.kind === 'hit').length, 2, 'A quake lands on every foe within reach')
  const grown = run(placeUnit(startBattle(lanes(), loaners, {}, 0), card('Bulbasaur'), 2, 5), 3500)
  assert.ok(grown.strikes.some(strike => strike.kind === 'wave' && strike.move === 'grass' && strike.reach === 0 && strike.x === 2.5), 'Growers glow as they harvest')

  const hatched = teamChoices(['Charmander']).filter(item => item.hatched)
  const shotAt = type => run({ ...fight('Charmander', hatched), enemies: [enemy({ type, hp: 1000, maxHp: 1000, speed: 0, progress: 1.6 })] }, 300).shots[0].move
  assert.equal(shotAt('psychic'), 'dark', 'Its egg move Crunch, where that hits harder')
  assert.equal(shotAt('grass'), 'fire')
  const helped = callAssist({ ...startBattle(trail({ waves: 2 }), loaners, { assist: 'Kyogre' }, 0), enemies: foes })
  assert.deepEqual(helped.strikes.map(strike => [strike.move, strike.foe]), [['water', 900], ['water', 901]], 'The Legendary’s move lands on every foe')
})

test('producers drop berries in lanes; tapping collects each drop once', () => {
  let game = placeUnit(startBattle(lanes(), loaners, {}, 0), card('Bulbasaur'), 2, 5)
  game = run(game, 3900)
  const drop = game.drops.find(item => item.col === 2 && item.row === 5)
  assert.ok(drop, 'Bulbasaur grows a berry')
  const collected = collectDrop(game, drop.id)
  assert.equal(collected.berries, game.berries + drop.value)
  assert.strictEqual(collectDrop(collected, drop.id), collected)
  assert.ok(game.drops.length >= 1)
})

test('pause freezes the field, resume ignores background time, and catch-up is capped', () => {
  const game = startBattle(lanes(), loaners, {}, 1000)
  const paused = pauseBattle(tickBattle(game, 1500), 2000)
  assert.equal(paused.elapsed, 1000)
  assert.strictEqual(tickBattle(paused, 50000), paused)
  assert.strictEqual(placeUnit(paused, card('Bulbasaur'), 0, 0), paused)
  const resumed = resumeBattle(paused, 60000)
  assert.equal(tickBattle(resumed, 60100).elapsed, 1100)
  assert.equal(tickBattle(game, 1000000).elapsed, 3000)
})

test('a Legendary assist strikes every foe once; calling a wave early shifts the schedule', () => {
  let game = startBattle(trail({ waves: 2 }), loaners, { assist: 'Kyogre' }, 0)
  game = { ...game, enemies: [enemy({ type: 'fire', hp: 600, maxHp: 600 }), enemy({ id: 901, hp: 100 })] }
  const helped = callAssist(game)
  assert.equal(helped.enemies.length, 1)
  assert.equal(helped.enemies[0].hp, 600 - ASSIST_DAMAGE * 2)
  assert.equal(helped.assist.used, true)
  assert.strictEqual(callAssist(helped), helped)
  const alone = startBattle(trail(), loaners, {}, 0)
  assert.strictEqual(callAssist(alone), alone, 'No befriended Legendary, no assist')

  const fresh = startBattle(trail({ waves: 2 }), loaners, {}, 0, seeded())
  const wait = nextWaveIn(fresh)
  assert.equal(wait, fresh.spawns[0].at)
  const early = sendNextWave(fresh)
  assert.equal(early.spawns[0].at, 0)
  assert.equal(early.berries, fresh.berries + 10)
  assert.strictEqual(sendNextWave(early), early, 'The wave is already arriving')
})

test('doing nothing loses; a simple player clears Route 1 and Pewter Trail with loaners', () => {
  for (const stop of STOPS.filter(item => item.mode !== 'safari').slice(0, 2)) {
    const idle = run(startBattle(stop.spec, loaners, {}, 0, seeded()), 600000)
    assert.equal(idle.status, 'lost', stop.id)
  }
  const route1 = STOPS[0].spec
  const kind = name => ({ grass: 'grass', rock: 'wall' })[battleType(name)] || 'attack'
  let turn = 0
  const player = game => {
    for (const drop of game.drops) game = collectDrop(game, drop.id)
    const free = game.team.filter(item => game.cooldowns[cardKey(item)] === undefined || game.cooldowns[cardKey(item)] <= game.elapsed)
    const growers = game.units.filter(unit => kind(unit.name) === 'grass').length
    const threat = [0, 1, 2, 3, 4].find(lane => game.enemies.some(foe => foe.lane === lane) && !game.units.some(unit => unit.col === lane && kind(unit.name) === 'attack'))
    const attackers = free.filter(item => kind(item.name) === 'attack')
    if (threat !== undefined && attackers.length) return placeUnit(game, cardKey(attackers[turn++ % attackers.length]), threat, 4)
    const grower = free.find(item => kind(item.name) === 'grass')
    if (growers < 5 && grower) return placeUnit(game, cardKey(grower), growers, 5)
    return attackers.length ? placeUnit(game, cardKey(attackers[turn++ % attackers.length]), turn % LANES, 3) : game
  }
  const guarded = run(startBattle(route1, loaners, {}, 0, seeded()), 600000, 100, player)
  assert.equal(guarded.status, 'won')
  assert.ok(battleStars(guarded) >= 2)

  const spots = []
  for (let col = 0; col < PATHS.switchback.cols; col++) for (let row = 0; row < PATHS.switchback.rows; row++) spots.push([col, row])
  const near = ([col, row]) => [...PATHS.switchback.cells].filter(cell => { const [c, r] = cell.split(',').map(Number); return Math.hypot(c - col, r - row) <= 2 }).length
  spots.sort((a, b) => near(b) - near(a))
  const builder = game => {
    const spot = spots.find(([col, row]) => canPlace(game, col, row))
    const cards = game.team.filter(item => battleType(item.family[0]) !== 'grass')
    return spot ? placeUnit(game, cardKey(cards[game.units.length % cards.length]), spot[0], spot[1]) : game
  }
  const defended = run(startBattle(STOPS[2].spec, loaners, {}, 0, seeded()), 600000, 100, builder)
  assert.equal(defended.status, 'won')
  assert.ok(freePlaySpec('trail', seeded()).waves > STOPS[2].spec.waves)
})
