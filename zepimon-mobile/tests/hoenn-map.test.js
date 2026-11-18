import test from 'node:test'
import assert from 'node:assert/strict'
import { HOENN_HEIGHT, HOENN_WIDTH, hoennPlaces, hoennPoint, hoennRoad, hoennStops, hoennTrail, nearestHoenn } from '../src/hoenn-map.ts'
import { kantoRoad } from '../src/kanto-map.ts'
import { johtoRoad } from '../src/johto-map.ts'
import { MILESTONE, placeFor, regions } from '../src/adventure-route.ts'

test('Hoenn runs the journey from Littleroot Town to Ever Grande City, each town, city and route once', () => {
  assert.deepEqual(hoennPlaces, ['Littleroot Town', 'Route 101', 'Oldale Town', 'Route 103', 'Route 102', 'Petalburg City', 'Route 104',
    'Rustboro City', 'Route 116', 'Route 105', 'Route 106', 'Dewford Town', 'Route 107', 'Route 108', 'Route 109', 'Slateport City',
    'Route 110', 'Mauville City', 'Route 117', 'Verdanturf Town', 'Route 111', 'Route 112', 'Route 113', 'Fallarbor Town', 'Route 114',
    'Lavaridge Town', 'Route 118', 'Route 119', 'Fortree City', 'Route 120', 'Route 121', 'Lilycove City', 'Route 124', 'Mossdeep City',
    'Route 125', 'Route 127', 'Route 128', 'Sootopolis City', 'Route 129', 'Route 130', 'Route 131', 'Pacifidlog Town', 'Route 132',
    'Route 133', 'Route 134', 'Ever Grande City'])
  assert.equal(new Set(hoennPlaces).size, hoennPlaces.length)
  assert.deepEqual(regions[2].places, hoennPlaces)
  assert.ok(hoennStops.every(item => item.city === !item.name.startsWith('Route ')))
  const first = kantoRoad.stops.length + johtoRoad.stops.length
  assert.deepEqual([placeFor(first).name, placeFor(first + hoennPlaces.length - 1).name], ['Littleroot Town', 'Ever Grande City'])
})

test('every Hoenn stop and road lies on the map art', () => {
  for (const item of hoennStops) {
    for (const [x, y] of [item.at, ...item.via]) assert.ok(x >= 0 && x <= HOENN_WIDTH && y >= 0 && y <= HOENN_HEIGHT, `${item.name} ${x},${y}`)
  }
  assert.equal(hoennRoad.start[1], HOENN_HEIGHT, 'the walk from Johto comes in off the south edge')
})

test('the walk from Johto comes in at the edge and reaches Littleroot Town one milestone later', () => {
  assert.equal(hoennRoad.legs.length, hoennStops.length, 'one leg in, then one between each stop')
  assert.deepEqual(hoennPoint(0, MILESTONE), hoennRoad.start)
  hoennStops.forEach((item, i) => {
    const [x, y] = hoennPoint((i + 1) * MILESTONE, MILESTONE)
    assert.ok(Math.abs(x - item.at[0]) < 1e-9 && Math.abs(y - item.at[1]) < 1e-9, item.name)
  })
  assert.deepEqual(hoennPoint(10 ** 7, MILESTONE), hoennStops.at(-1).at)
  const middle = hoennTrail(MILESTONE * 20.5, MILESTONE)
  assert.deepEqual(middle.walked[0], hoennRoad.start)
  assert.deepEqual(middle.walked.at(-1), middle.ahead[0])
})

test('the place in view on Hoenn is the stop nearest the middle of the screen', () => {
  assert.equal(hoennPlaces[nearestHoenn([1100, 450])], 'Sootopolis City')
  assert.equal(hoennPlaces[nearestHoenn([150, 905])], 'Dewford Town')
})
