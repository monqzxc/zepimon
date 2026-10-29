import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAYOUTS, PULSE_PERIOD, PULSE_WINDOW, RECOVER_MS, STAGGER_MS, WARN_MS, WAVE_WARN_MS, FIRST_ATTACK_MS, arenaFor, arenaTick, arenaWalk,
  dangerTiles, maxResonance, objective, pauseArena, pulsePhase, resonate, resumeArena, routeTo, startArena } from '../src/games/resonance.ts'
import { LAIRS, LAIR_OF, lairOf } from '../src/games/lairs.ts'
import { STEPS, isWalkable, pointKey, planWalk, reachableFrom, tileAt } from '../src/games/safari-zone.ts'
import { STEP_MS } from '../src/games/safari-view.ts'
import { legendarySpecies } from '../src/generated/expedition.js'

const T0 = 1_000_000
const MID = () => 0.5
const LAIR_LIST = Object.values(LAYOUTS)
const points = keys => [...keys].map(key => key.split(',').map(Number)).map(([x, y]) => ({ x, y }))
const same = (a, b) => a.x === b.x && a.y === b.y
// Walks a route one press at a time, a step every STEP_MS, as the step walker does; returns the arena and the time.
function walkRoute(arena, route, now, random = MID) {
  let completed = null
  for (const direction of route) {
    now += STEP_MS
    const result = arenaWalk(arena, direction, now, random)
    arena = result.arena
    completed = result.completed ?? completed
  }
  return { arena, now, completed }
}
// As tap-to-walk does: round the other seals where there is another way.
const walkTo = (arena, to, now, random) => walkRoute(arena, routeTo(arena, to), now, random)
const tick = (arena, now, random = MID) => arenaTick(arena, now, random).arena
// A direction that is a plain step from where the trainer stands (not a bump, not the way out).
const stepAway = arena => Object.keys(STEPS).find(direction => arenaWalk(arena, direction, 8e15, MID).move === 'step')
// Whether target can be reached from the start without crossing any seal.
const planWalkAvoiding = (layout, target) => planWalk(layout.start, target, { ...layout.map, tiles: layout.map.tiles.map((row, y) =>
  [...row].map((tile, x) => Object.values(layout.seals).some(seal => seal.x === x && seal.y === y) ? '#' : tile).join('')) })
// A PNG's width and height, from its header.
const pngSize = path => { const png = readFileSync(path); return [png.readUInt32BE(16), png.readUInt32BE(20)] }

test('every Legendary has a lair from Emerald, by its story where Emerald has one', () => {
  assert.deepEqual(Object.keys(LAIR_OF).sort(), [...legendarySpecies].sort(), 'Each of the 39 Legendaries is placed')
  for (const lair of Object.values(LAIR_OF)) assert.ok(LAIRS[lair], lair)
  const homes = { Kyogre: 'seafloor-cavern', Groudon: 'cave-of-origin', Rayquaza: 'sky-pillar', Regirock: 'regi-chamber', Regice: 'regi-chamber',
    Registeel: 'regi-chamber', Regigigas: 'sealed-chamber', Latias: 'southern-island', Latios: 'southern-island', Mew: 'faraway-island',
    Deoxys: 'birth-island', Articuno: 'shoal-cave', Zapdos: 'new-mauville', Dialga: 'mt-pyre-summit', Giratina: 'mt-pyre', Mewtwo: 'crystal-cavern' }
  for (const [name, lair] of Object.entries(homes)) assert.equal(lairOf(name), lair, name)
  assert.equal(arenaFor('Shiny Kyogre'), arenaFor('Kyogre'), 'A Shiny lives where its kind does')
  assert.equal(lairOf('Pikachu'), 'new-mauville', 'A Pokemon no lair lists meets in the lair of its type')
  assert.equal(lairOf('Missingno'), 'regi-chamber', 'An unknown name still gets a lair')
  assert.ok(Object.keys(LAIRS).length >= 10)
})

for (const layout of LAIR_LIST) {
  test(`${layout.label}: the art, the play area and every mark fit together`, () => {
    const lair = LAIRS[layout.lair]
    assert.equal(lair.tiles.length, lair.rows)
    for (const row of lair.tiles) assert.equal(row.length, lair.cols)
    for (const layer of ['ground', 'top']) {
      assert.deepEqual(pngSize(new URL(`../assets/lairs/${layout.lair}-${layer}.png`, import.meta.url)), [lair.cols * 64, lair.rows * 64], layer)
    }
    assert.match(layout.background, /^#[0-9a-f]{6}$/)
    const reach = reachableFrom(layout.start, layout.map)
    assert.deepEqual([...reach].sort(), layout.ground.map(pointKey).sort(), 'Every open tile can be reached from the entrance')
    assert.ok(!isWalkable(tileAt(layout.legendary, layout.map)), 'The Legendary blocks its own tile')
    assert.ok(!isWalkable(tileAt(layout.entrance, layout.map)), 'The entrance is outside the play area')
    assert.ok(same(layout.entrance, { x: layout.start.x + STEPS[layout.out].x, y: layout.start.y + STEPS[layout.out].y }), 'One step out from the start')
    const marks = [layout.start, ...Object.values(layout.seals), ...layout.runes, ...layout.stones, ...layout.waveSafe]
    assert.equal(new Set(marks.map(pointKey)).size, marks.length, 'Every mark has its own tile')
    for (const point of marks) assert.ok(reach.has(pointKey(point)), `${pointKey(point)} is reachable ground`)
    for (const safe of layout.waveSafe) {
      const steps = planWalk(layout.seals.wave, safe, layout.map).length
      assert.ok(steps >= 3 && steps * STEP_MS < WAVE_WARN_MS - STEP_MS, `${pointKey(safe)} is a short walk from the Wave Seal`)
    }
  })

  test(`${layout.label}: the Legendary only watches until the first seal is on, then attacks after a moment`, () => {
    let arena = startArena(layout, [], 3, T0)
    assert.match(arena.message, /calm/)
    for (const t of [T0 + FIRST_ATTACK_MS, T0 + 60000]) assert.equal(tick(arena, t).danger, null, 'No attack before any seal')
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.runes, now))
    for (const rune of layout.runes) ({ arena, now } = walkTo(arena, rune, now))
    assert.deepEqual(arena.seals, ['runes'])
    assert.equal(tick(arena, now + FIRST_ATTACK_MS - 1).danger, null, 'A moment to get ready')
    assert.ok(tick(arena, Math.max(now, T0) + FIRST_ATTACK_MS).danger, 'Then the first attack')
    assert.doesNotMatch(objective(arena), /calm/)
  })

  test(`${layout.label}: a tapped route goes round the seals on the way where it can`, () => {
    const arena = startArena(layout, [], 3, T0)
    for (const target of [...layout.runes, ...layout.stones, ...layout.waveSafe]) {
      const route = routeTo(arena, target)
      assert.ok(route, `${pointKey(target)} can be reached`)
      let at = arena.at
      for (const direction of route) {
        at = { x: at.x + STEPS[direction].x, y: at.y + STEPS[direction].y }
        if (!same(at, target)) assert.ok(!Object.values(layout.seals).some(seal => same(seal, at)) || !planWalkAvoiding(layout, target), `${pointKey(target)} passes a seal only when it must`)
      }
    }
  })

  test(`${layout.label}: walking out of the entrance leaves; anywhere else it is just a wall`, () => {
    let arena = startArena(layout, [], 3, T0)
    assert.equal(arenaWalk(arena, layout.out, T0, MID).move, 'exit')
    assert.equal(arenaWalk(pauseArena(arena), layout.out, T0, MID).move, 'none', 'Not while paused')
    const away = stepAway(arena)
    arena = walkRoute(arena, [away], T0).arena
    assert.notEqual(arenaWalk(arena, layout.out, T0 + 1000, MID).move, 'exit', 'Only from the doorway')
    const bump = arenaWalk({ ...startArena(layout, [], 3, T0), at: layout.legendary.y > 0 ? { ...layout.legendary, y: layout.legendary.y + 1 } : layout.legendary }, 'north', T0, MID)
    if (bump.move === 'bump') assert.match(bump.arena.message, /Legendary/)
  })

  test(`an attack is telegraphed for a readable while, aimed where you stand, and stepping off dodges it (${layout.label})`, () => {
    let arena = startArena(layout, ['stones'], 3, T0)
    let now = arena.nextAttackAt
    arena = tick(arena, now)
    assert.ok(arena.danger, 'An attack is marked')
    assert.equal(arena.feedback, 'warn')
    assert.ok(WARN_MS >= 1500 && arena.danger.warnUntil - now === WARN_MS)
    assert.ok(dangerTiles(arena).has(pointKey(arena.at)), 'Aimed at the trainer')
    arena = tick(arena, now + WARN_MS / 2)
    assert.equal(arena.resonance, 3)
    const safe = points(reachableFrom(arena.at, layout.map)).filter(point => !dangerTiles(arena).has(pointKey(point)))
      .sort((a, b) => (Math.abs(a.x - arena.at.x) + Math.abs(a.y - arena.at.y)) - (Math.abs(b.x - arena.at.x) + Math.abs(b.y - arena.at.y)))[0]
    ;({ arena, now } = walkTo(arena, safe, now))
    assert.ok(now < arena.danger.warnUntil)
    arena = tick(arena, arena.danger.warnUntil)
    assert.equal(arena.feedback, 'dodge')
    assert.equal(arena.resonance, 3)
  })

  test(`every telegraphed ring or line leaves time to walk out of it from anywhere in the lair (${layout.label})`, () => {
    const steps = Math.floor(WARN_MS / STEP_MS)
    for (const at of layout.ground) {
      for (const roll of [0.1, 0.4, 0.6, 0.9]) {
        let arena = { ...startArena(layout, ['stones'], 3, T0), at }
        arena = tick(arena, arena.nextAttackAt, () => roll)
        const danger = dangerTiles(arena)
        const escape = points(reachableFrom(at, layout.map)).filter(point => !danger.has(pointKey(point))).map(point => planWalk(at, point, layout.map).length)
        assert.ok(escape.length && Math.min(...escape) <= 2, `From ${pointKey(at)}, out in at most 2 steps`)
        assert.ok(Math.min(...escape) < steps)
      }
    }
  })

  test(`a hit costs one resonance and a short stagger; at zero there is a safe recovery, never a loss (${layout.label})`, () => {
    let arena = startArena(layout, ['wave'], 3, T0)
    const inward = Object.keys(STEPS).find(direction => direction !== layout.out)
    let now = T0
    for (let hit = 1; hit <= 3; hit++) {
      now = Math.max(now, arena.nextAttackAt)
      arena = tick(arena, now)
      now = arena.danger.warnUntil
      arena = tick(arena, now)
      assert.equal(arena.feedback, 'hit')
      assert.equal(arena.resonance, 3 - hit)
      assert.equal(arena.staggerUntil, now + STAGGER_MS)
      assert.equal(arenaWalk(arena, inward, now + 100, MID).move, 'none', 'Staggered for a moment')
      now = arena.danger.strikeUntil
      arena = tick(arena, now)
      assert.equal(arena.danger, null)
    }
    assert.equal(arena.resonance, 0)
    assert.equal(arena.recoverUntil, arena.staggerUntil - STAGGER_MS + RECOVER_MS)
    assert.deepEqual(arena.seals, ['wave'], 'Seals already on stay on')
    assert.equal(arenaWalk(arena, layout.out, now + 100, MID).move, 'exit', 'Walking out is always possible from the doorway')
    for (let t = now; t < arena.recoverUntil; t += 250) assert.equal(tick(arena, t).danger, null)
    arena = tick(arena, arena.recoverUntil)
    assert.equal(arena.resonance, 3)
    assert.equal(arena.feedback, 'recover')
  })

  test(`wave seal: reach the safe tile before the wave and the seal switches on; miss it and simply try again (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.wave, now))
    assert.ok(arena.wave)
    const safe = arena.wave.safe
    assert.ok(layout.waveSafe.some(point => pointKey(point) === pointKey(safe)))
    assert.equal(arena.danger.kind, 'wave')
    assert.ok(!dangerTiles(arena).has(pointKey(safe)) && dangerTiles(arena).has(pointKey(arena.at)))
    assert.ok(arena.danger.warnUntil - now >= WAVE_WARN_MS - STEP_MS)
    let missed = tick(arena, arena.danger.warnUntil)
    assert.equal(missed.feedback, 'hit')
    assert.equal(missed.wave, null)
    assert.deepEqual(missed.seals, [])
    ;({ arena, now } = walkTo(arena, safe, now))
    assert.ok(now < arena.danger.warnUntil, 'The safe tile is a few steps away')
    const result = arenaTick(arena, arena.danger.warnUntil, MID)
    assert.equal(result.completed, 'wave')
    assert.deepEqual(result.arena.seals, ['wave'])
    assert.equal(result.arena.feedback, 'seal')
    missed = tick(missed, missed.danger.strikeUntil)
    const later = (missed.danger?.strikeUntil ?? now) + 4000
    let retry = walkRoute(missed, [stepAway(missed)], later).arena
    retry = walkTo(retry, layout.seals.wave, later + 1000).arena
    assert.ok(retry.wave, 'The wave starts again')
  })

  test(`runes seal: touching the seal lights three runes; walk them in order, and a rune out of turn just does not count (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    assert.equal(walkTo(arena, layout.runes[0], now).arena.runes, null, 'Runes do nothing until their seal is touched')
    ;({ arena, now } = walkTo(arena, layout.seals.runes, now))
    assert.equal(arena.runes, 0)
    ;({ arena, now } = walkTo(arena, layout.runes[1], now))
    assert.equal(arena.runes, 0, 'Rune 2 first does not count')
    assert.match(arena.message, /rune 1/)
    ;({ arena, now } = walkTo(arena, layout.runes[0], now))
    assert.equal(arena.runes, 1)
    ;({ arena, now } = walkTo(arena, layout.runes[1], now))
    let completed
    ;({ arena, now, completed } = walkTo(arena, layout.runes[2], now))
    assert.equal(completed, 'runes')
    assert.deepEqual(arena.seals, ['runes'])
    assert.equal(arena.runes, null)
  })

  test(`pulse seal: press Resonate while the ring is in the gold band; early or late just tries again (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.pulse, now))
    assert.ok(arena.pulse)
    assert.equal(arena.danger, null, 'The Legendary is still while you focus')
    assert.equal(tick(arena, now + 10000).danger, null)
    const [from, to] = PULSE_WINDOW
    assert.ok(to - from >= 0.3, 'A generous window')
    const at = phase => arena.pulse.since + PULSE_PERIOD * phase
    const early = resonate(arena, at(from - 0.2))
    assert.equal(early.completed, null)
    assert.equal(early.arena.feedback, 'miss')
    assert.equal(early.arena.resonance, 3, 'A miss costs nothing')
    assert.equal(pulsePhase(arena.pulse, at(from + 0.05)) > from, true)
    const hit = resonate(early.arena, at(1 + (from + to) / 2))
    assert.equal(hit.completed, 'pulse')
    assert.deepEqual(hit.arena.seals, ['pulse'])
    const off = arenaWalk(arena, stepAway(arena), now + 300, MID).arena
    assert.equal(off.pulse, null)
    assert.equal(resonate(off, now + 400).completed, null)
  })

  test(`stones seal: wake all three guardian stones in any order (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.stones, now))
    assert.deepEqual(arena.stones, [])
    ;({ arena, now } = walkTo(arena, layout.stones[2], now))
    assert.ok(arena.stones.includes(2), 'The far stone first is fine')
    let completed = null
    for (const stone of [1, 0]) {
      if (arena.stones === null) break
      const walked = walkTo(arena, layout.stones[stone], now)
      ;({ arena, now } = walked)
      completed = walked.completed ?? completed
    }
    assert.equal(completed, 'stones')
    assert.deepEqual(arena.seals, ['stones'])
  })

  test(`a seal that is already on cannot be started again, and saved seals carry in (${layout.label})`, () => {
    let arena = startArena(layout, ['runes', 'wave'], 3, T0)
    const { arena: there } = walkTo(arena, layout.seals.wave, T0)
    assert.equal(there.wave, null)
    assert.match(there.message, /already/)
    arena = startArena(layout, ['wave', 'runes', 'pulse', 'stones'], 3, T0)
    assert.equal(tick(arena, arena.nextAttackAt + 10000).danger, null, 'With every seal on the Legendary stops attacking')
    assert.match(arena.message, /every seal/i)
  })

  test(`pausing drops the attack in flight and a running wave, and resuming waits before the next attack (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.wave, now))
    const paused = pauseArena(arena)
    assert.equal(paused.danger, null)
    assert.equal(paused.wave, null, 'The wave is tried again later')
    assert.equal(tick(paused, now + 60000).danger, null, 'Nothing happens while paused')
    assert.equal(arenaWalk(paused, stepAway(arena), now + 100, MID).move, 'none')
    const resumed = resumeArena(paused, now + 60000)
    assert.equal(resumed.paused, false)
    assert.ok(resumed.nextAttackAt >= now + 60000 + 2000)
  })
}

test('saved walks this week add resonance, up to two more', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(maxResonance), [3, 4, 5, 5, 5])
  assert.equal(maxResonance(Number.NaN), 3)
  assert.equal(maxResonance(-4), 3)
})
