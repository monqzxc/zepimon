import test from 'node:test'
import assert from 'node:assert/strict'
import { startRoom, stepRoom } from '../src/games/trial.ts'
import { trialStages } from '../src/generated/trial-maps.js'
import { STAR } from './star-fixture.js'
import { crystalPresses, solveRoom } from './trial-solver.js'

const KINDS = ['switch', 'crumble', 'dark', 'temple', 'warp']
const solved = new Map()
const solve = stage => {
  if (!solved.has(stage.id)) solved.set(stage.id, solveRoom(stage))
  return solved.get(stage.id)
}
const replay = (stage, route) => route.reduce((room, direction) => stepRoom(room, stage, direction).room, startRoom(stage))

test('every room can be cleared, within par', () => {
  for (const stage of Object.values(trialStages)) {
    const { min, tooBig } = solve(stage)
    assert.ok(!tooBig, `${stage.id} is too big to check; make it smaller`)
    assert.ok(min !== undefined, `${stage.id} cannot be cleared`)
    assert.ok(min <= stage.par && stage.par <= Math.ceil(min * 1.25) + 5, `${stage.id}: par ${stage.par} for a ${min}-move route`)
  }
})

test('rooms are sized for a 3–5 minute trial', () => {
  for (const kind of KINDS) {
    for (const tier of ['tutorial', '1', '2', '3']) assert.ok(trialStages[`${kind}-${tier}`], `${kind}-${tier} is missing`)
  }
  assert.ok(trialStages.star, 'star is missing')
  for (const stage of Object.values(trialStages)) {
    const { min } = solve(stage)
    const [low, high] = stage.id === 'star' ? [30, 100] : stage.id.endsWith('-tutorial') ? [8, 30] : [40, 120]
    assert.ok(low <= min && min <= high, `${stage.id}: ${min} moves, wants ${low}–${high}`)
  }
})

test('the minimum route really clears', () => {
  for (const stage of [...Object.values(trialStages), STAR]) {
    const { min, route } = solve(stage)
    const room = replay(stage, route)
    assert.equal(room.status, 'cleared', `${stage.id}: the solver's route does not clear`)
    assert.equal(room.moves, min, `${stage.id}: the route takes ${room.moves} moves, not ${min}`)
  }
})

test("the star's clues cover its whole target", () => {
  const { star } = trialStages.star
  const revealed = new Set(star.clues.flatMap(clue => clue.reveals))
  for (const id of [...star.nodes.map(node => node.id), 'pattern']) assert.ok(revealed.has(id), `no clue reveals ${id}`)
})

test('the star needs real reasoning', () => {
  const { star } = trialStages.star
  const sorted = ids => [...ids].sort().join(';')
  assert.ok(sorted(star.startLit) !== sorted(star.target.lit) || star.target.pattern !== 0, 'the target is the start state')
  const presses = crystalPresses(star)
  assert.ok(presses !== undefined && presses >= 3, `the target takes ${presses} crystal presses`)
})
