import test from 'node:test'
import assert from 'node:assert/strict'
import { KANTO_HEIGHT, KANTO_WIDTH, cameraBounds, clampCamera, kantoPlaces, kantoPoint, kantoStops, kantoTrail, nearestStop } from '../src/kanto-map.ts'
import { placeFor, regions } from '../src/adventure-route.ts'

const KM5 = 5000

test('Kanto runs the story from Pallet Town to the Indigo Plateau, each town, city and route once', () => {
  assert.equal(kantoPlaces[0], 'Pallet Town')
  assert.equal(kantoPlaces.at(-1), 'Indigo Plateau')
  assert.equal(new Set(kantoPlaces).size, kantoPlaces.length)
  // The Gyms in the story's order.
  const gyms = ['Pewter City', 'Cerulean City', 'Vermilion City', 'Celadon City', 'Fuchsia City', 'Saffron City', 'Cinnabar Island']
  assert.deepEqual(gyms.map(name => kantoPlaces.indexOf(name)), [...gyms.map(name => kantoPlaces.indexOf(name))].sort((a, b) => a - b))
  assert.ok(kantoStops.every(item => item.city === !item.name.startsWith('Route ')))
  assert.deepEqual(regions[0].places, kantoPlaces)
  assert.equal(placeFor(1).name, 'Route 1')
  assert.equal(placeFor(kantoPlaces.length).region, 'Johto')
})

test('every stop and road lies on the map art', () => {
  for (const item of kantoStops) {
    for (const [x, y] of [item.at, ...item.via]) assert.ok(x >= 0 && x <= KANTO_WIDTH && y >= 0 && y <= KANTO_HEIGHT, `${item.name} ${x},${y}`)
  }
})

test('a distance stands at its milestone, or along the road to the next', () => {
  assert.deepEqual(kantoPoint(0, KM5), kantoStops[0].at)
  kantoStops.forEach((item, i) => {
    const [x, y] = kantoPoint(i * KM5, KM5)
    assert.ok(Math.abs(x - item.at[0]) < 1e-9 && Math.abs(y - item.at[1]) < 1e-9, item.name)
  })
  // Halfway along Route 1, between Pallet Town and the Route 1 marker.
  const [, y] = kantoPoint(2500, KM5)
  assert.ok(y < kantoStops[0].at[1] && y > kantoStops[1].at[1])
  assert.deepEqual(kantoPoint(10 ** 7, KM5), kantoStops.at(-1).at)
})

test('the trail splits where you stand: walked behind, the rest ahead', () => {
  const start = kantoTrail(0, KM5)
  assert.deepEqual(start.walked, [kantoStops[0].at])
  assert.deepEqual(start.ahead[0], kantoStops[0].at)
  const middle = kantoTrail(57300, KM5)
  const here = kantoPoint(57300, KM5)
  assert.deepEqual(middle.walked.at(-1), here)
  assert.deepEqual(middle.ahead[0], here)
  assert.deepEqual(middle.walked[0], kantoStops[0].at)
  assert.deepEqual(middle.ahead.at(-1), kantoStops.at(-1).at)
  for (const item of kantoStops.slice(0, 12)) assert.ok(middle.walked.some(([x, y]) => x === item.at[0] && y === item.at[1]), item.name)
  assert.deepEqual(kantoTrail(10 ** 7, KM5).ahead, [])
})

test('the place in view is the stop nearest the middle of the screen', () => {
  assert.equal(kantoPlaces[nearestStop([950, 390])], 'Saffron City')
  assert.equal(kantoPlaces[nearestStop([140, 40])], 'Indigo Plateau')
})

test('the camera keeps the map on screen at any zoom, and centres it once it is smaller than the view', () => {
  const map = { width: 1800, height: 1300 }, view = { width: 400, top: 100, bottom: 500 }
  // Zoomed in: the map's edges stop at the screen's, its top under the header and its bottom at the card.
  assert.deepEqual(cameraBounds(1, map, view), { minX: -1400, maxX: 0, minY: -800, maxY: 100 })
  assert.deepEqual(clampCamera({ x: 50, y: -900 }, cameraBounds(1, map, view)), { x: 0, y: -800 })
  assert.deepEqual(cameraBounds(2, map, view), { minX: -3200, maxX: 0, minY: -2100, maxY: 100 })
  // Zoomed out until it is narrower and shorter than the view: held in the middle of it.
  const small = cameraBounds(0.2, map, view)
  assert.deepEqual([small.minX, small.maxX], [20, 20])
  assert.deepEqual([small.minY, small.maxY], [170, 170])
  assert.deepEqual(clampCamera({ x: -500, y: 900 }, small), { x: 20, y: 170 })
})
