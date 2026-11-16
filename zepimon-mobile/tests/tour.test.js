import test from 'node:test'
import assert from 'node:assert/strict'
import { coachSteps, freshTour, hopTrack, placeTip, restoreTour, scrollNeeded, slides, spotlight, stepsFor, tourScreens } from '../src/tour-plan.ts'

test('a fresh install has seen nothing, and saved progress is restored one part at a time', () => {
  assert.deepEqual(freshTour, { welcomed: false, seen: [] })
  assert.deepEqual(restoreTour(null), freshTour)
  assert.deepEqual(restoreTour('nonsense'), freshTour)
  assert.deepEqual(restoreTour({ welcomed: true, seen: ['dex', 'journal'] }), { welcomed: true, seen: ['journal', 'dex'] })
  assert.deepEqual(restoreTour({ welcomed: 1, seen: ['dex', 'shop', 7] }), { welcomed: false, seen: ['dex'] })
  assert.deepEqual(restoreTour({ welcomed: true, seen: 'dex' }), { welcomed: true, seen: [] })
})

test('the welcome tour has at least four slides, each with words and a landing spot on its picture', () => {
  assert.ok(slides.length >= 4)
  assert.equal(new Set(slides.map(slide => slide.id)).size, slides.length)
  for (const slide of slides) {
    assert.ok(slide.eyebrow && slide.title && slide.body, slide.id)
    assert.ok(slide.spot.x > 0 && slide.spot.x < 1 && slide.spot.y > 0 && slide.spot.y <= 1, slide.id)
  }
  // The guide has somewhere new to hop to on every slide.
  slides.slice(1).forEach((slide, index) => assert.notDeepEqual(slide.spot, slides[index].spot, slide.id))
})

test('every tab has tips, and a tip whose target is not on screen is left out', () => {
  for (const screen of tourScreens) assert.ok(coachSteps[screen].length >= 2, screen)
  assert.equal(stepsFor('dex', () => true).length, 3)
  // An empty Dex has no search or filters to point at.
  assert.deepEqual(stepsFor('dex', target => target !== 'dex.filters').map(step => step.title), ['Your Pokedex', 'Say hello'])
  assert.deepEqual(stepsFor('journal', () => false), [])
  assert.deepEqual(stepsFor('adventure', () => false).map(step => step.title), ['Your trail'])
})

const frame = { width: 390, top: 50, bottom: 700 }

test('a page scrolls just far enough to bring a target into view', () => {
  assert.equal(scrollNeeded({ x: 16, y: 200, width: 358, height: 300 }, frame), 0)
  assert.equal(scrollNeeded({ x: 16, y: 600, width: 358, height: 300 }, frame), 212)
  assert.equal(scrollNeeded({ x: 16, y: -80, width: 358, height: 100 }, frame), -142)
  // Taller than the frame: its top lines up, rather than its bottom.
  assert.equal(scrollNeeded({ x: 16, y: 400, width: 358, height: 900 }, frame), 338)
})

test('the lit area is padded, stays in the frame, and gives up when too little shows', () => {
  assert.deepEqual(spotlight({ x: 100, y: 200, width: 80, height: 40 }, frame), { x: 94, y: 194, width: 92, height: 52 })
  assert.deepEqual(spotlight({ x: 0, y: 600, width: 390, height: 300 }, frame), { x: 4, y: 594, width: 382, height: 106 })
  assert.equal(spotlight({ x: 16, y: 690, width: 358, height: 300 }, frame), null)
  assert.equal(spotlight(null, frame), null)
})

test('a tip goes under its target, over it, or in the middle, and always stays on screen', () => {
  const low = { x: 16, y: 500, width: 358, height: 150 }
  const high = { x: 16, y: 60, width: 358, height: 50 }
  assert.deepEqual(placeTip(high, frame, 180, 70), { top: 194, side: 'below' })
  assert.deepEqual(placeTip(low, frame, 180, 70), { top: 306, side: 'above' })
  assert.equal(placeTip(null, frame, 180, 70).side, 'middle')
  // No room on either side of a tall target: the roomier side, kept in the frame with the guide's headroom.
  for (const hole of [high, low, { x: 4, y: 60, width: 382, height: 600 }, { x: 4, y: 300, width: 382, height: 400 }, null]) {
    const { top } = placeTip(hole, frame, 180, 70)
    assert.ok(top - 70 >= frame.top && top + 180 <= frame.bottom, JSON.stringify(hole))
  }
})

test('the guide lands on each spot and rises over the gap between two slides', () => {
  const spots = slides.map(slide => slide.spot)
  const track = hopTrack(spots, 390, 0.3)
  // Offsets only go up, as an interpolation needs.
  track.input.slice(1).forEach((value, index) => assert.ok(value > track.input[index]))
  spots.forEach((spot, index) => {
    const at = track.input.indexOf(index * 390)
    assert.ok(at >= 0)
    assert.equal(track.x[at], spot.x)
    assert.equal(track.y[at], spot.y)
    assert.equal(track.air[at], 0)
  })
  const mid = track.input.indexOf(195)
  assert.equal(track.air[mid], 1)
  assert.ok(Math.abs(track.y[mid] - ((spots[0].y + spots[1].y) / 2 - 0.3)) < 1e-9)
  // Reduced motion: no arc, it steps straight across.
  assert.deepEqual(hopTrack(spots, 390, 0).y, hopTrack(spots, 390, 0).ground)
})
