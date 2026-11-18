import test from 'node:test'
import assert from 'node:assert/strict'
import { SINNOH_HEIGHT, SINNOH_WIDTH, nearestSinnoh, sinnohPlaces, sinnohPoint, sinnohRoad, sinnohStops, sinnohTrail } from '../src/sinnoh-map.ts'
import { kantoRoad } from '../src/kanto-map.ts'
import { johtoRoad } from '../src/johto-map.ts'
import { hoennRoad } from '../src/hoenn-map.ts'
import { MILESTONE, placeFor, regions } from '../src/adventure-route.ts'

test('Sinnoh runs the journey from Twinleaf Town to Route 223, each town, city and route once', () => {
  assert.deepEqual(sinnohPlaces, ['Twinleaf Town', 'Route 201', 'Sandgem Town', 'Route 202', 'Jubilife City', 'Route 203', 'Oreburgh City',
    'Route 204', 'Floaroma Town', 'Route 205', 'Eterna City', 'Route 206', 'Route 207', 'Route 208', 'Hearthome City', 'Route 209',
    'Solaceon Town', 'Route 210', 'Celestic Town', 'Route 211', 'Route 212', 'Pastoria City', 'Route 213', 'Route 214', 'Veilstone City',
    'Route 215', 'Route 218', 'Canalave City', 'Route 216', 'Route 217', 'Snowpoint City', 'Route 222', 'Sunyshore City', 'Route 223'])
  assert.equal(new Set(sinnohPlaces).size, sinnohPlaces.length)
  assert.deepEqual(regions[3].places, sinnohPlaces)
  assert.ok(sinnohStops.every(item => item.city === !item.name.startsWith('Route ')))
  const first = kantoRoad.stops.length + johtoRoad.stops.length + hoennRoad.stops.length
  assert.deepEqual([placeFor(first).name, placeFor(first + sinnohPlaces.length - 1).name], ['Twinleaf Town', 'Route 223'])
  assert.equal(placeFor(first + sinnohPlaces.length).region, 'Unova', 'Unova follows on the route trail')
})

test('every Sinnoh stop and road lies on the map art', () => {
  for (const item of sinnohStops) {
    for (const [x, y] of [item.at, ...item.via]) assert.ok(x >= 0 && x <= SINNOH_WIDTH && y >= 0 && y <= SINNOH_HEIGHT, `${item.name} ${x},${y}`)
  }
  assert.equal(sinnohRoad.start[1], SINNOH_HEIGHT, 'the walk from Hoenn comes in off the south edge')
})

test('the walk from Hoenn comes in at the edge and reaches Twinleaf Town one milestone later', () => {
  assert.equal(sinnohRoad.legs.length, sinnohStops.length, 'one leg in, then one between each stop')
  assert.deepEqual(sinnohPoint(0, MILESTONE), sinnohRoad.start)
  sinnohStops.forEach((item, i) => {
    const [x, y] = sinnohPoint((i + 1) * MILESTONE, MILESTONE)
    assert.ok(Math.abs(x - item.at[0]) < 1e-9 && Math.abs(y - item.at[1]) < 1e-9, item.name)
  })
  assert.deepEqual(sinnohPoint(10 ** 7, MILESTONE), sinnohStops.at(-1).at)
  const middle = sinnohTrail(MILESTONE * 15.5, MILESTONE)
  assert.deepEqual(middle.walked[0], sinnohRoad.start)
  assert.deepEqual(middle.walked.at(-1), middle.ahead[0])
})

test('the place in view on Sinnoh is the stop nearest the middle of the screen', () => {
  assert.equal(sinnohPlaces[nearestSinnoh([730, 160])], 'Snowpoint City')
  assert.equal(sinnohPlaces[nearestSinnoh([320, 480])], 'Canalave City')
})
