import test from 'node:test'
import assert from 'node:assert/strict'
import { ARENAS, ARENA_SIZE, LORE_HOMES, PULSE_PERIOD, PULSE_WINDOW, RECOVER_MS, STAGGER_MS, WARN_MS, WAVE_WARN_MS, arenaFor, arenaTick, arenaWalk, dangerTiles,
  insideArena, maxResonance, pauseArena, pulsePhase, resonate, resumeArena, startArena } from '../src/games/resonance.ts'
import { ZONES } from '../src/games/safari.ts'
import { STEPS, areaAt, isWalkable, pointKey, planWalk, reachableFrom, safariMap, tileAt } from '../src/games/safari-zone.ts'
import { STEP_MS } from '../src/games/safari-view.ts'
import { pokemonTypes } from '../src/generated/types.js'
import { legendarySpecies } from '../src/generated/expedition.js'

const T0 = 1_000_000
const MID = () => 0.5
const LAKE = ARENAS.lake
const HABITATS = Object.values(ARENAS)
const points = keys => [...keys].map(key => key.split(',').map(Number)).map(([x, y]) => ({ x, y }))
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
const walkTo = (arena, to, now, random) => walkRoute(arena, planWalk(arena.at, to, arena.layout.map), now, random)
const tick = (arena, now, random = MID) => arenaTick(arena, now, random).arena

test('each Legendary meets where its story places it, or else in the Safari Zone area its type lives in', () => {
  assert.deepEqual(Object.keys(ARENAS).sort(), Object.keys(ZONES).sort(), 'One arena per area')
  const zoneOf = name => arenaFor(name).zone
  assert.deepEqual(['Kyogre', 'Suicune', 'Lugia', 'Latias', 'Latios', 'Uxie', 'Mesprit', 'Azelf'].map(zoneOf), Array(8).fill('lake'))
  assert.deepEqual(['Groudon', 'Rayquaza', 'Dialga', 'Palkia', 'Arceus', 'Mewtwo', 'Regigigas'].map(zoneOf), Array(7).fill('mountain'))
  assert.deepEqual(['Darkrai', 'Giratina', 'Celebi', 'Jirachi', 'Zeraora'].map(zoneOf), Array(5).fill('night'))
  assert.deepEqual(['Shaymin', 'Mew', 'Zapdos', 'Raikou'].map(zoneOf), Array(4).fill('meadow'))
  assert.equal(arenaFor('Shiny Lugia'), arenaFor('Lugia'), 'A Shiny lives where its kind does')
  for (const [name, zone] of Object.entries(LORE_HOMES)) {
    assert.ok(legendarySpecies.includes(name), `${name} is a Legendary`)
    assert.ok(!ZONES[zone].types.includes(pokemonTypes[name]), `${name}'s story moves it somewhere its type would not`)
  }
  for (const name of legendarySpecies) {
    const arena = arenaFor(name)
    assert.ok(LORE_HOMES[name] === arena.zone || ZONES[arena.zone].types.includes(pokemonTypes[name]), `${name} is at home in the ${arena.label}`)
  }
  assert.equal(arenaFor('Missingno').zone, 'meadow', 'An unknown name still gets an arena')
})

for (const layout of HABITATS) {
  test(`the ${layout.label} arena is a 9 × 9 clearing of that area, walled off around it and at the Legendary`, () => {
    const map = layout.map
    assert.equal(map.cols, safariMap.cols)
    assert.equal(map.chunks, safariMap.chunks, 'Drawn with the Safari Zone’s own terrain')
    for (let y = 0; y < safariMap.rows; y++) {
      for (let x = 0; x < safariMap.cols; x++) {
        const point = { x, y }
        const inside = insideArena(layout, point)
        if (inside) assert.equal(areaAt(point), layout.zone, `${x},${y} lies in the ${layout.label}`)
        const original = tileAt(point, safariMap)
        const expected = inside && pointKey(point) !== pointKey(layout.legendary) && !'v<>'.includes(original) ? original : '#'
        assert.equal(tileAt(point, map), expected, `${x},${y}`)
      }
    }
    assert.ok(isWalkable(tileAt(layout.legendary, safariMap)), 'The Legendary stands on open ground')
    assert.deepEqual(layout.legendary, { x: layout.left + 4, y: layout.top + 4 }, 'In the middle')
    const reach = reachableFrom(layout.start, map)
    const marks = [layout.start, ...Object.values(layout.seals), ...layout.runes, ...layout.stones, ...layout.waveSafe]
    assert.equal(new Set(marks.map(pointKey)).size, marks.length, 'Every mark has its own tile')
    for (const point of marks) assert.ok(isWalkable(tileAt(point, map)) && reach.has(pointKey(point)), `${pointKey(point)} is reachable ground`)
    assert.ok(layout.legendary.y >= layout.top && Object.values(STEPS).some(step =>
      reach.has(pointKey({ x: layout.legendary.x + step.x, y: layout.legendary.y + step.y }))), 'You can walk up to the Legendary')
    assert.equal(ARENA_SIZE, 9)
  })
}

test('the lakeside arena keeps the layout it has always had', () => {
  assert.deepEqual([LAKE.left, LAKE.top, LAKE.legendary, LAKE.start], [32, 20, { x: 36, y: 24 }, { x: 36, y: 28 }])
  assert.deepEqual(LAKE.seals, { wave: { x: 33, y: 21 }, runes: { x: 39, y: 21 }, pulse: { x: 33, y: 27 }, stones: { x: 39, y: 27 } })
  assert.deepEqual(LAKE.runes, [{ x: 35, y: 26 }, { x: 37, y: 22 }, { x: 38, y: 25 }])
  assert.deepEqual(LAKE.stones, [{ x: 32, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 28 }])
  assert.deepEqual(LAKE.waveSafe, [{ x: 36, y: 20 }, { x: 33, y: 24 }, { x: 35, y: 23 }])
})

test('walking is the Safari Zone’s: rocks, the arena’s edge and the Legendary block a step', () => {
  let arena = startArena(LAKE, [], 3, T0)
  assert.deepEqual(arena.at, LAKE.start)
  // Straight south leaves the arena: the masked map stops it, like a Safari Zone tree.
  const out = arenaWalk(arena, 'south', T0 + 100, MID)
  assert.equal(out.move, 'bump')
  assert.deepEqual(out.arena.at, LAKE.start)
  ;({ arena } = walkRoute(arena, ['north', 'north', 'north'], T0))
  assert.deepEqual(arena.at, { x: 36, y: 25 })
  const blocked = arenaWalk(arena, 'north', T0 + 5000, MID)
  assert.equal(blocked.move, 'bump', 'The Legendary stands its ground')
  assert.match(blocked.arena.message, /Legendary/)
})

for (const layout of HABITATS) {
  test(`an attack is telegraphed for a readable while, aimed where you stand, and stepping off dodges it (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = arena.nextAttackAt
    arena = tick(arena, now)
    assert.ok(arena.danger, 'An attack is marked')
    assert.equal(arena.feedback, 'warn')
    assert.ok(WARN_MS >= 1500 && arena.danger.warnUntil - now === WARN_MS)
    assert.ok(dangerTiles(arena).has(pointKey(arena.at)), 'Aimed at the trainer')
    // Halfway through the warning nothing has happened yet.
    arena = tick(arena, now + WARN_MS / 2)
    assert.equal(arena.resonance, 3)
    // Step clear of every marked tile, well inside the warning.
    const safe = [...reachableFrom(arena.at, layout.map)].map(key => key.split(',').map(Number)).map(([x, y]) => ({ x, y }))
      .filter(point => !dangerTiles(arena).has(pointKey(point)))
      .sort((a, b) => (Math.abs(a.x - arena.at.x) + Math.abs(a.y - arena.at.y)) - (Math.abs(b.x - arena.at.x) + Math.abs(b.y - arena.at.y)))[0]
    ;({ arena, now } = walkTo(arena, safe, now))
    assert.ok(now < arena.danger.warnUntil)
    arena = tick(arena, arena.danger.warnUntil)
    assert.equal(arena.feedback, 'dodge')
    assert.equal(arena.resonance, 3)
  })

  test(`every telegraphed ring or line leaves time to walk out of it from anywhere in the arena (${layout.label})`, () => {
    const steps = Math.floor(WARN_MS / STEP_MS)
    for (const at of points(reachableFrom(layout.start, layout.map))) {
      for (const roll of [0.1, 0.4, 0.6, 0.9]) {
        let arena = { ...startArena(layout, [], 3, T0), at }
        arena = tick(arena, arena.nextAttackAt, () => roll)
        const danger = dangerTiles(arena)
        const escape = [...reachableFrom(at, layout.map)].map(key => key.split(',').map(Number)).map(([x, y]) => ({ x, y }))
          .filter(point => !danger.has(pointKey(point))).map(point => planWalk(at, point, layout.map).length)
        assert.ok(escape.length && Math.min(...escape) <= 2, `From ${pointKey(at)}, out in at most 2 steps`)
        assert.ok(Math.min(...escape) < steps)
      }
    }
  })

  test(`a hit costs one resonance and a short stagger; at zero there is a safe recovery, never a loss (${layout.label})`, () => {
    let arena = startArena(layout, ['wave'], 3, T0)
    let now = T0
    for (let hit = 1; hit <= 3; hit++) {
      now = Math.max(now, arena.nextAttackAt)
      arena = tick(arena, now)
      now = arena.danger.warnUntil
      arena = tick(arena, now)
      assert.equal(arena.feedback, 'hit')
      assert.equal(arena.resonance, 3 - hit)
      assert.equal(arena.staggerUntil, now + STAGGER_MS)
      assert.equal(arenaWalk(arena, 'west', now + 100, MID).move, 'none', 'Staggered for a moment')
      now = arena.danger.strikeUntil
      arena = tick(arena, now)
      assert.equal(arena.danger, null)
    }
    assert.equal(arena.resonance, 0)
    assert.equal(arena.recoverUntil, arena.staggerUntil - STAGGER_MS + RECOVER_MS)
    assert.deepEqual(arena.seals, ['wave'], 'Seals already on stay on')
    // While recovering the Legendary holds back entirely.
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
    // Standing still: the wave hits, the challenge ends, nothing is lost.
    let missed = tick(arena, arena.danger.warnUntil)
    assert.equal(missed.feedback, 'hit')
    assert.equal(missed.wave, null)
    assert.deepEqual(missed.seals, [])
    // Reaching the safe tile in time switches the seal on.
    ;({ arena, now } = walkTo(arena, safe, now))
    assert.ok(now < arena.danger.warnUntil, 'The safe tile is a few steps away')
    const result = arenaTick(arena, arena.danger.warnUntil, MID)
    assert.equal(result.completed, 'wave')
    assert.deepEqual(result.arena.seals, ['wave'])
    assert.equal(result.arena.feedback, 'seal')
    // Retrying after a miss: off the seal and back on starts it again.
    missed = tick(missed, missed.danger.strikeUntil)
    let retry = walkRoute(missed, ['south'], missed.danger?.strikeUntil ?? now + 4000).arena
    retry = walkTo(retry, layout.seals.wave, now + 6000).arena
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
    // Stepping off the seal stops the focus; stepping back starts it again.
    const away = Object.keys(STEPS).find(direction => arenaWalk(arena, direction, now + 300, MID).move === 'step')
    const off = arenaWalk(arena, away, now + 300, MID).arena
    assert.equal(off.pulse, null)
    assert.equal(resonate(off, now + 400).completed, null)
  })

  test(`stones seal: wake all three guardian stones in any order (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.stones, now))
    assert.deepEqual(arena.stones, [])
    ;({ arena, now } = walkTo(arena, layout.stones[2], now))
    assert.equal(arena.stones[0], 2, 'The far stone first is fine')
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

  test(`runes and stones keep their progress while you roam, even across another seal (${layout.label})`, () => {
    let arena = startArena(layout, [], 3, T0)
    let now = T0
    ;({ arena, now } = walkTo(arena, layout.seals.stones, now))
    ;({ arena, now } = walkTo(arena, layout.stones[2], now))
    ;({ arena, now } = walkTo(arena, layout.seals.runes, now))
    ;({ arena, now } = walkTo(arena, layout.runes[0], now))
    assert.deepEqual([arena.stones, arena.runes], [[2], 1])
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
    assert.equal(arenaWalk(paused, 'south', now + 100, MID).move, 'none')
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
