import test from 'node:test'
import assert from 'node:assert/strict'
import { FILL_MS, MIN_MS, RUN_AT, WALK_END, canLeave, fillAt, fillEasing, phaseAt, rampEasing, strideMs, travelAt } from '../src/launch-intro.ts'

test('the intro plays for at least three seconds and waits for the app', () => {
  assert.ok(MIN_MS >= 3000)
  assert.equal(canLeave(MIN_MS - 1, true), false)
  assert.equal(canLeave(MIN_MS, false), false)
  assert.equal(canLeave(MIN_MS, true), true)
})

test('the pace rises smoothly from a walk to a run', () => {
  const pace = ms => travelAt(ms + 1) - travelAt(ms)
  assert.equal(pace(0), 1)
  assert.equal(pace(RUN_AT + 10), 3)
  for (let ms = 0; ms < RUN_AT + 200; ms += 10) assert.ok(pace(ms + 10) >= pace(ms) - 1e-9, `pace drops at ${ms} ms`)
  // No jump where the walk ends or the run starts.
  assert.ok(Math.abs(pace(WALK_END) - pace(WALK_END - 1)) < 0.01)
  assert.ok(Math.abs(pace(RUN_AT) - pace(RUN_AT - 1)) < 0.01)
})

test('the easings start at 0, end at 1 and only rise', () => {
  for (const ease of [rampEasing, fillEasing]) {
    assert.equal(ease(0), 0)
    assert.ok(Math.abs(ease(1) - 1) < 1e-9)
    for (let u = 0; u < 1; u += 0.01) assert.ok(ease(u + 0.01) >= ease(u))
  }
  assert.equal(fillAt(FILL_MS * 2), 1)
})

test('walk, run, then adventure, with quicker strides', () => {
  assert.equal(phaseAt(0), 'walk')
  assert.equal(phaseAt(WALK_END), 'run')
  assert.equal(phaseAt(MIN_MS), 'adventure')
  assert.ok(strideMs(RUN_AT) < strideMs(0))
})
