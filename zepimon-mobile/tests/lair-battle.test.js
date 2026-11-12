import test from 'node:test'
import assert from 'node:assert/strict'
import { legendarySpecies } from '../src/generated/expedition.js'
import { LAIRS } from '../src/games/lairs.ts'
import { isWalkable, pointKey, tileAt } from '../src/games/safari-zone.ts'
import { CAPTURE, CAPTURE_MS, FIRST_ATTACK_MS, FOE_HP, LAYOUTS, MOVE_GAP_MS, RECOVER_MS, STAGGER_MS, STRIKE_MS, WARN_MS, battleOver, battleTick,
  battleWalk, facingToward, lairFor, legendaryHeight, legendarySize, maxHearts, moveWait, partnerMoves, pauseBattle, resumeBattle, startBattle, strikeWith,
  throwBall, weakened } from '../src/games/lair-battle.ts'

// The Legendary battle, fought in the lair itself on a test clock.
const T0 = 1000000
const HIGH = () => 0.99
const LOW = () => 0
const begin = (name = 'Rayquaza', options) => startBattle({ name, shiny: false }, 'Pikachu', 3, T0, options)
const BACK = { north: 'south', south: 'north', west: 'east', east: 'west' }
// Runs the clock forward in 100 ms ticks, as the screen does.
// Wears the Legendary down to nothing, one move every five seconds.
const weaken = (battle, from = T0) => { let now = from; while (battle.foe.hp > 0) { now += 5000; battle = strikeWith(battle, 0, now, HIGH).battle } return { battle, now } }
const run = (battle, from, to, random = HIGH) => { for (let now = from; now <= to; now += 100) battle = battleTick(battle, now, random); return battle }

test('every Legendary has a lair to fight in, a height and a size beside the trainer', () => {
  for (const name of legendarySpecies) {
    const layout = lairFor(name)
    assert.ok(layout.ground.length >= 12, `${name}: room to walk`)
    assert.ok(isWalkable(tileAt(layout.start, layout.map)), `${name}: you start on open ground`)
    assert.equal(isWalkable(tileAt(layout.legendary, layout.map)), false, `${name}: the Legendary's tile is its own`)
    assert.ok(legendaryHeight(name) > 0 && legendaryHeight(name) <= 7, `${name}: a real height`)
    assert.ok(legendarySize(name) >= 0.8 && legendarySize(name) <= 6, `${name}: fits the lair`)
  }
  assert.deepEqual(Object.keys(LAYOUTS).sort(), Object.keys(LAIRS).sort())
  // True to size: the order of heights is the order on screen, between the smallest and the tallest that can be drawn.
  assert.ok(legendarySize('Rayquaza') > legendarySize('Lugia') && legendarySize('Lugia') > legendarySize('Groudon'))
  assert.ok(legendarySize('Groudon') > legendarySize('Mewtwo') && legendarySize('Mewtwo') > legendarySize('Latias'))
  assert.equal(legendarySize('Mewtwo'), 1.8, 'Two metres beside a 1.5 m trainer of about 1.3 tiles')
  assert.equal(legendarySize('Shaymin'), 0.8, 'The smallest can still be seen')
  assert.equal(legendarySize('Rayquaza'), 6, 'The tallest still leaves the lair in view')
})

test('the partner brings its type move, False Swipe and its strongest egg moves, four at most', () => {
  for (const name of ['Pikachu', 'Charizard', 'Gengar', 'Mewtwo', 'Egg']) {
    const moves = partnerMoves(name)
    assert.ok(moves.length >= 2 && moves.length <= 4, name)
    assert.equal(moves[1].name, 'False Swipe')
    assert.equal(new Set(moves.map(move => move.name)).size, moves.length, `${name}: no move twice`)
    for (const move of moves) assert.ok(move.min >= 1 && move.max >= move.min && move.cooldown >= 1000, `${name}: ${move.name}`)
  }
  assert.equal(partnerMoves('Pikachu')[0].type, 'electric')
  assert.deepEqual([maxHearts(0), maxHearts(1.9), maxHearts(40), maxHearts(NaN)], [3, 4, 5, 3])
})

test('until the first move the Legendary only watches, and the portal is the shiny reset', () => {
  const battle = begin()
  const { layout } = battle
  assert.deepEqual([battle.phase, battle.foe.hp, battle.hearts], ['watch', FOE_HP, 3])
  assert.deepEqual(battle.at, layout.start)
  assert.equal(battle.facing, BACK[layout.out], 'Facing into the lair')
  const waited = run(battle, T0, T0 + 60000)
  assert.equal(waited.danger, null, 'No attack while it watches')
  assert.equal(waited.hearts, 3)
  assert.equal(battleWalk(battle, layout.out, T0).move, 'reset')
  // Once begun, the portal is only a wall.
  const begun = strikeWith(battle, 0, T0, LOW)
  assert.equal(begun.began, true)
  assert.equal(battleWalk(begun.battle, layout.out, T0 + 100).move, 'bump')
  // Coming back to a battle already begun, and a revisit, start past the watch.
  assert.equal(begin('Rayquaza', { engaged: true }).phase, 'fight')
  assert.equal(battleWalk(begin('Rayquaza', { engaged: true }), layout.out, T0).move, 'bump')
})

test('walking follows the lair: open ground only, the buddy a step behind', () => {
  for (const name of ['Kyogre', 'Groudon', 'Mewtwo', 'Deoxys']) {
    let battle = begin(name)
    const { layout } = battle
    const inward = BACK[layout.out]
    const stepped = battleWalk(battle, inward, T0)
    if (stepped.move === 'step') {
      assert.ok(isWalkable(tileAt(stepped.battle.at, layout.map)), name)
      assert.deepEqual(stepped.battle.buddy, layout.start)
    }
    // A long random walk never leaves the ground or stands on the Legendary.
    let seed = 7
    for (let i = 0; i < 400; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      const direction = ['north', 'south', 'west', 'east'][seed % 4]
      const result = battleWalk(battle, direction, T0 + i * 250)
      if (result.move === 'reset') continue
      battle = result.battle
      assert.ok(layout.ground.some(point => pointKey(point) === pointKey(battle.at)), `${name}: on the ground`)
    }
  }
})

test('moves wear the Legendary down to nothing, each with its own wait; then it is weakened and stops', () => {
  let battle = begin()
  const first = strikeWith(battle, 0, T0, HIGH)
  assert.deepEqual([first.began, first.battle.phase], [true, 'fight'])
  assert.equal(first.battle.foe.hp, FOE_HP - battle.moves[0].max)
  assert.equal(first.battle.strike.id, 1)
  assert.match(first.battle.message, /Pikachu used/)
  battle = first.battle
  assert.equal(strikeWith(battle, 0, T0 + 100, HIGH).battle, battle, 'The move needs its wait')
  assert.equal(strikeWith(battle, 1, T0 + 100, HIGH).battle, battle, 'And no other move lands in the same breath')
  assert.equal(moveWait(battle, 0, T0), battle.moves[0].cooldown)
  assert.equal(moveWait(battle, 1, T0), MOVE_GAP_MS)
  const second = strikeWith(battle, 1, T0 + MOVE_GAP_MS, HIGH)
  assert.equal(second.began, false, 'Only the first begins the battle')
  assert.equal(second.battle.foe.hp, battle.foe.hp - battle.moves[1].max)
  assert.equal(strikeWith(battle, 9, T0 + 9000, HIGH).battle, battle, 'No such move')
  // The last HP: an attack it was charging is dropped, and it never attacks again.
  let now = T0
  while (battle.foe.hp > battle.moves[0].max) { now += 5000; battle = strikeWith(battle, 0, now, HIGH).battle; assert.equal(weakened(battle), false) }
  battle = { ...battle, nextAttackAt: now }
  battle = battleTick(battle, now, LOW)
  assert.ok(battle.danger, 'Still fighting')
  const down = strikeWith(battle, 0, now + 5000, HIGH).battle
  assert.deepEqual([down.foe.hp, down.phase, down.danger, weakened(down)], [0, 'down', null, true])
  assert.match(down.message, /weakened/)
  const later = run(down, now + 5000, now + 60000, LOW)
  assert.deepEqual([later.danger, later.hearts, later.phase], [null, 3, 'down'], 'Weakened, it stays down and holds still')
  assert.equal(strikeWith(down, 1, now + 30000, HIGH).battle, down, 'No more moves once it is down')
  assert.equal(battleWalk(down, BACK[down.layout.out], now + 30000).move !== 'none', true, 'You can still walk around it')
})

test('the Legendary answers with marked attacks that can always be walked out of', () => {
  for (const name of legendarySpecies) {
    let battle = strikeWith(begin(name), 0, T0, LOW).battle
    for (const roll of [0.1, 0.6, 0.9]) {
      battle = { ...battle, danger: null, nextAttackAt: T0 }
      const warned = battleTick(battle, T0, () => roll)
      assert.ok(warned.danger, `${name}: it attacks once the battle is on`)
      assert.equal(warned.feedback, 'warn')
      assert.ok(warned.danger.tiles.includes(pointKey(warned.at)), `${name}: aimed where you stand`)
      // An unmarked tile is two steps away at most.
      const marked = new Set(warned.danger.tiles)
      const near = warned.layout.ground.filter(point => Math.abs(point.x - warned.at.x) + Math.abs(point.y - warned.at.y) <= 2)
      assert.ok(near.some(point => !marked.has(pointKey(point))) || warned.layout.ground.some(point => !marked.has(pointKey(point))), `${name}: somewhere to go`)
    }
  }
})

test('standing in a marked attack costs a heart; stepping off dodges; out of hearts you rest in full', () => {
  let battle = strikeWith(begin('Mewtwo'), 0, T0, LOW).battle
  let now = T0 + FIRST_ATTACK_MS
  battle = battleTick(battle, now, LOW)
  assert.ok(battle.danger && !battle.danger.struck)
  assert.match(battle.message, /Mewtwo is charging Psystrike/)
  // Standing still: hit as it lands, and staggered.
  const hit = battleTick(battle, now + WARN_MS, LOW)
  assert.deepEqual([hit.hearts, hit.feedback], [2, 'hit'])
  assert.equal(battleWalk(hit, 'north', now + WARN_MS + STAGGER_MS - 1).move, 'none', 'Staggered')
  // Moved off every marked tile: dodged.
  const marked = new Set(battle.danger.tiles)
  const safe = battle.layout.ground.find(point => !marked.has(pointKey(point)))
  const dodged = battleTick({ ...battle, at: safe }, now + WARN_MS, LOW)
  assert.deepEqual([dodged.hearts, dodged.feedback], [3, 'dodge'])
  const cleared = battleTick(dodged, now + WARN_MS + STRIKE_MS, LOW)
  assert.equal(cleared.danger, null)
  assert.ok(cleared.nextAttackAt > now + WARN_MS + STRIKE_MS, 'A breath before the next one')
  // The last heart: it holds back while you recover, and moves wait too.
  const last = battleTick({ ...battle, hearts: 1 }, now + WARN_MS, LOW)
  assert.equal(last.hearts, 0)
  const resting = run(last, now + WARN_MS + 100, now + WARN_MS + RECOVER_MS - 100, LOW)
  assert.equal(resting.danger?.struck ?? true, true, 'No new attack while you recover')
  assert.equal(strikeWith(resting, 1, now + WARN_MS + 1000, LOW).battle, resting)
  const back = battleTick(resting, now + WARN_MS + RECOVER_MS, LOW)
  assert.deepEqual([back.hearts, back.feedback], [3, 'recover'])
  assert.equal(battleOver(back), false, 'Nothing faints')
})

test('a Poké Ball only works on a weakened Legendary, is thrown from where you stand, and always holds', () => {
  const fresh = begin('Rayquaza', { engaged: true })
  // Too soon: nothing is thrown, at full HP or with 1 HP left, and it says why.
  for (const battle of [begin(), fresh, { ...fresh, foe: { ...fresh.foe, hp: 1 } }]) {
    const refused = throwBall(battle, T0)
    assert.deepEqual([refused.phase, refused.ball, refused.foe.hp], [battle.phase, null, battle.foe.hp])
    assert.match(refused.message, /too strong for a Poké Ball/)
  }
  let { battle, now } = weaken(fresh)
  // Walk somewhere else first: the ball comes from there, and the trainer turns to the Legendary.
  for (let i = 0; i < 3; i++) { now += 300; battle = battleWalk(battle, BACK[battle.layout.out], now).battle }
  const thrown = throwBall(battle, now)
  assert.equal(thrown.phase, 'throw')
  assert.deepEqual(thrown.ball, { from: battle.at, since: now, until: now + CAPTURE_MS })
  assert.equal(thrown.facing, facingToward(battle.at, battle.layout.legendary))
  assert.equal(CAPTURE_MS, CAPTURE.fly + CAPTURE.bounce + CAPTURE.beam + CAPTURE.drop + 3 * CAPTURE.swing + CAPTURE.star, 'Three swings, then the star')
  // Nothing else happens while the capture plays, and it cannot be held up.
  assert.equal(strikeWith(thrown, 1, now + 100, LOW).battle, thrown)
  assert.equal(battleWalk(thrown, 'north', now + 100).move, 'none')
  assert.equal(throwBall(thrown, now + 100), thrown)
  assert.equal(pauseBattle(thrown, now + 100), thrown)
  assert.equal(battleTick(thrown, thrown.ball.until - 1, HIGH).phase, 'throw')
  for (const random of [HIGH, LOW]) {
    const caught = battleTick(thrown, thrown.ball.until, random)
    assert.equal(caught.phase, 'caught', 'It always holds')
    assert.match(caught.message, /Gotcha! Rayquaza was caught/)
    assert.equal(battleOver(caught), true)
    for (const action of [b => strikeWith(b, 0, now + 99000, LOW).battle, b => throwBall(b, now + 99000), b => battleTick(b, now + 99000, LOW),
      b => battleWalk(b, 'north', now + 99000).battle, b => pauseBattle(b, now + 99000)]) assert.equal(action(caught), caught, 'Caught is final')
  }
  const shiny = weaken(startBattle({ name: 'Mew', shiny: true }, 'Pikachu', 3, T0))
  assert.match(battleTick(throwBall(shiny.battle, shiny.now), shiny.now + CAPTURE_MS, LOW).message, /Gotcha! Shiny Mew/)
  assert.deepEqual([facingToward({ x: 0, y: 0 }, { x: 3, y: 1 }), facingToward({ x: 3, y: 0 }, { x: 0, y: 1 }), facingToward({ x: 0, y: 5 }, { x: 1, y: 0 }),
    facingToward({ x: 0, y: 0 }, { x: 1, y: 5 })], ['east', 'west', 'north', 'south'])
})

test('pausing drops an attack in flight and holds every clock', () => {
  let battle = strikeWith(begin('Mewtwo'), 0, T0, LOW).battle
  battle = battleTick(battle, T0 + FIRST_ATTACK_MS, LOW)
  assert.ok(battle.danger)
  const paused = pauseBattle(battle, T0 + FIRST_ATTACK_MS + 500)
  assert.deepEqual([paused.paused, paused.danger], [true, null])
  assert.equal(battleTick(paused, T0 + 99000, LOW), paused)
  assert.equal(battleWalk(paused, 'north', T0 + 99000).move, 'none')
  assert.equal(strikeWith(paused, 1, T0 + 99000, LOW).battle, paused)
  const resumed = resumeBattle(paused, T0 + 60000)
  assert.equal(resumed.paused, false)
  assert.equal(resumed.nextAttackAt, T0 + 60000 + FIRST_ATTACK_MS, 'A breath before it attacks again')
  assert.equal(moveWait(resumed, 0, T0 + 60000), moveWait(battle, 0, T0 + FIRST_ATTACK_MS + 500), 'A move waits as long as it still had to')
  assert.deepEqual([resumed.foe.hp, resumed.hearts], [battle.foe.hp, battle.hearts])
})
