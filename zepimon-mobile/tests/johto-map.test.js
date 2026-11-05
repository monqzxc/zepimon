import test from 'node:test'
import assert from 'node:assert/strict'
import { JOHTO_HEIGHT, JOHTO_WIDTH, johtoPlaces, johtoPoint, johtoRoad, johtoStops, johtoTrail, nearestJohto } from '../src/johto-map.ts'
import { kantoRoad } from '../src/kanto-map.ts'
import { MILESTONE, placeFor, regions } from '../src/adventure-route.ts'

test('Johto runs the story from New Bark Town to Route 26, each town, city and route once', () => {
  assert.deepEqual(johtoPlaces, ['New Bark Town', 'Route 29', 'Cherrygrove City', 'Route 30', 'Route 31', 'Violet City', 'Route 32',
    'Route 33', 'Azalea Town', 'Route 34', 'Goldenrod City', 'Route 35', 'Route 36', 'Route 37', 'Ecruteak City', 'Route 38',
    'Route 39', 'Olivine City', 'Route 40', 'Route 41', 'Cianwood City', 'Route 42', 'Mahogany Town', 'Route 43', 'Route 44',
    'Blackthorn City', 'Route 45', 'Route 46', 'Route 27', 'Route 26'])
  assert.deepEqual(regions[1].places, johtoPlaces)
  assert.ok(johtoStops.every(item => item.city === !item.name.startsWith('Route ')))
  const first = kantoRoad.stops.length
  assert.deepEqual([placeFor(first).name, placeFor(first + johtoPlaces.length - 1).name], ['New Bark Town', 'Route 26'])
})

test('every Johto stop and road lies on the map art', () => {
  for (const item of johtoStops) {
    for (const [x, y] of [item.at, ...item.via]) assert.ok(x >= 0 && x <= JOHTO_WIDTH && y >= 0 && y <= JOHTO_HEIGHT, `${item.name} ${x},${y}`)
  }
  assert.equal(johtoRoad.start[0], JOHTO_WIDTH, 'the walk comes in from Kanto off the east edge')
})

test('the walk from Kanto comes in at the edge and reaches New Bark Town one milestone later', () => {
  assert.equal(johtoRoad.legs.length, johtoStops.length, 'one leg in, then one between each stop')
  assert.deepEqual(johtoPoint(0, MILESTONE), johtoRoad.start)
  johtoStops.forEach((item, i) => {
    const [x, y] = johtoPoint((i + 1) * MILESTONE, MILESTONE)
    assert.ok(Math.abs(x - item.at[0]) < 1e-9 && Math.abs(y - item.at[1]) < 1e-9, item.name)
  })
  assert.deepEqual(johtoPoint(10 ** 7, MILESTONE), johtoStops.at(-1).at)
  const middle = johtoTrail(MILESTONE * 12.5, MILESTONE)
  assert.deepEqual(middle.walked[0], johtoRoad.start)
  assert.deepEqual(middle.walked.at(-1), middle.ahead[0])
  assert.deepEqual(johtoTrail(-500, MILESTONE).walked, [johtoRoad.start], 'not there yet: nothing walked')
})

test('the place in view on Johto is the stop nearest the middle of the screen', () => {
  assert.equal(johtoPlaces[nearestJohto([1170, 255])], 'Blackthorn City')
  assert.equal(johtoPlaces[nearestJohto([150, 400])], 'Cianwood City')
})
