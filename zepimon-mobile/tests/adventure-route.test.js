import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { metersAt, placeAt, placeFor, pointAt, reachedBy, regions, routeLayout, stripAt, tourLength } from '../src/adventure-route.ts'

// The strip shapes as scripts/build-adventure-route.py writes them, read from the generated file without its images.
const generated = readFileSync(new URL('../src/generated/adventure-route.js', import.meta.url), 'utf8')
const shapes = Object.fromEntries([...generated.matchAll(/(\w+): \{ source: [^,]+, rows: (\d+), pads: (\[.*?\]) \}/g)]
  .map(([, kind, rows, pads]) => [kind, { rows: Number(rows), pads: JSON.parse(pads) }]))

test('the generated strips have the milestones the layout expects', () => {
  assert.deepEqual(Object.keys(shapes).sort(), ['a', 'b', 'start'])
  assert.equal(shapes.start.pads.length, 1)
  assert.equal(shapes.a.pads.length, 4)
  assert.equal(shapes.b.pads.length, 4)
  // Bottom to top, so the path climbs.
  for (const kind of ['a', 'b']) assert.ok(shapes[kind].pads.every((pad, i, all) => i === 0 || pad.y < all[i - 1].y), kind)
})

test('a new trainer stands at the trailhead, Pallet Town, under the first two strips', () => {
  const layout = routeLayout(0, shapes)
  assert.deepEqual(layout.strips.map(strip => [strip.kind, strip.index]), [['b', 1], ['a', 0], ['start', -1]])
  assert.deepEqual(layout.milestones.map(mark => mark.meters / 1000), [0, 5, 10, 15, 20, 25, 30, 35, 40])
  const start = layout.milestones[0]
  assert.deepEqual(pointAt(0, layout.milestones), { x: start.x, y: start.y })
  assert.equal(layout.rows, shapes.b.rows + shapes.a.rows + shapes.start.rows)
})

test('the trainer stands between the milestones on either side of the distance walked', () => {
  const layout = routeLayout(18000, shapes)
  const [fifteen, twenty] = [15000, 20000].map(meters => layout.milestones.find(mark => mark.meters === meters))
  const here = pointAt(18000, layout.milestones)
  assert.ok(here.y < fifteen.y && here.y > twenty.y, 'above 15 km, below 20 km')
  assert.ok(Math.abs(here.y - (fifteen.y + (twenty.y - fifteen.y) * 0.6)) < 1e-9)
})

test('far along, the map shows the route behind, the route you are on and the one ahead', () => {
  const layout = routeLayout(123400, shapes)
  assert.deepEqual(layout.strips.map(strip => strip.index), [7, 6, 5])
  assert.equal(layout.milestones[0].meters, 100000, 'the step below the lowest strip')
  assert.ok(layout.milestones[0].y > layout.rows, 'just below the bottom edge')
  assert.equal(layout.milestones.at(-1).meters, 160000)
  const here = pointAt(123400, layout.milestones)
  assert.equal(stripAt(here.y, layout).index, 6)
})

test('beyond the drawn milestones a distance holds at the last one', () => {
  const layout = routeLayout(0, shapes)
  const last = layout.milestones.at(-1)
  assert.deepEqual(pointAt(999999, layout.milestones), { x: last.x, y: last.y })
})

test('milestones are the towns, cities and routes of Kanto, Johto, Hoenn, Sinnoh and Unova in turn', () => {
  assert.deepEqual(regions.map(region => region.name), ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'])
  assert.equal(placeFor(0).name, 'Pallet Town')
  assert.deepEqual(placeAt(3200), { index: 1, name: 'Route 1', region: 'Kanto', regionIndex: 0, tour: 1, meters: 5000 })
  assert.equal(placeAt(5000).name, 'Route 1', 'standing on a milestone is being there')
  const johto = regions[0].places.length
  assert.deepEqual([placeFor(johto).name, placeFor(johto).region], ['New Bark Town', 'Johto'])
  assert.equal(placeFor(tourLength - 1).region, 'Unova')
  assert.deepEqual([placeFor(tourLength).name, placeFor(tourLength).tour], ['Pallet Town', 2])
})

test('a height on the map reads back as the distance there', () => {
  const layout = routeLayout(123400, shapes)
  for (const meters of [101000, 123400, 139999, 155000]) {
    assert.ok(Math.abs(metersAt(pointAt(meters, layout.milestones).y, layout.milestones) - meters) < 1e-6, String(meters))
  }
  assert.equal(metersAt(-50, layout.milestones), 160000, 'above the drawn path')
  assert.equal(metersAt(layout.rows + 50, layout.milestones), 100000, 'below it')
})

test('a milestone is reached by the adventure that took the running total past it', () => {
  const run = (id, meters, day) => ({ id, record: { meters, finishedAt: `2026-10-${day}T08:00:00Z` } })
  const adventures = [run('c', 4000, 12), run('a', 3000, 10), run('b', 2500, 11)]
  assert.equal(reachedBy(0, adventures).run.id, 'a', 'your first adventure starts the journey')
  assert.deepEqual([reachedBy(5000, adventures).run.id, reachedBy(5000, adventures).before], ['b', 3000])
  assert.equal(reachedBy(9500, adventures).run.id, 'c')
  assert.equal(reachedBy(10000, adventures), undefined)
})
