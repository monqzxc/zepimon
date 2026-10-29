import test from 'node:test'
import assert from 'node:assert/strict'
import { DPAD_BUTTON, DPAD_SIZE, OVERLAY_IDLE, OVERLAY_PRESSED, bottom, inside, isLandscape, overlaps, playLayout, promptArea, right } from '../src/games/immersive.ts'

const SIZES = [[360, 740], [390, 844], [740, 360], [844, 390], [320, 568], [568, 320]]
const parts = layout => ({ hud: layout.hud, dpad: layout.dpad, actions: layout.actions, corner: layout.corner })

test('landscape is wider than tall', () => {
  assert.equal(isLandscape(844, 390), true)
  assert.equal(isLandscape(390, 844), false)
  assert.equal(isLandscape(500, 500), false)
})

test('the D-pad fades only its look: full-size buttons, faint idle and nearly solid pressed', () => {
  assert.ok(DPAD_BUTTON >= 52)
  assert.equal(DPAD_SIZE, DPAD_BUTTON * 3)
  assert.ok(OVERLAY_IDLE > 0.2 && OVERLAY_IDLE < 0.5)
  assert.ok(OVERLAY_PRESSED > 0.7 && OVERLAY_PRESSED <= 1)
})

test('the map fills the whole area', () => {
  for (const [width, height] of SIZES) assert.deepEqual(playLayout(width, height).map, { x: 0, y: 0, width, height })
})

test('portrait puts the D-pad bottom-left; landscape centres it on the left', () => {
  for (const [width, height] of SIZES) {
    const layout = playLayout(width, height)
    assert.equal(layout.landscape, width > height)
    assert.equal(layout.dpad.width, DPAD_SIZE)
    assert.equal(layout.dpad.height, DPAD_SIZE)
    assert.ok(layout.dpad.x < width / 4, `${width}x${height}: D-pad on the left`)
    if (layout.landscape) assert.ok(Math.abs(layout.dpad.y + DPAD_SIZE / 2 - height / 2) <= 1, `${width}x${height}: D-pad centred`)
    else assert.ok(bottom(layout.dpad) > height - 20, `${width}x${height}: D-pad at the bottom`)
  }
})

test('the actions sit in the corner opposite the D-pad, the exit button top-right', () => {
  for (const [width, height] of SIZES) {
    const layout = playLayout(width, height)
    assert.ok(right(layout.actions) > width - 20 && layout.actions.x > right(layout.dpad), `${width}x${height}: actions on the right`)
    assert.ok(bottom(layout.actions) > height - 20, `${width}x${height}: actions at the bottom`)
    assert.ok(right(layout.corner) > width - 20 && layout.corner.y < 20, `${width}x${height}: corner top-right`)
  }
})

test('nothing overlaps and everything fits on screen, in both orientations', () => {
  for (const [width, height] of SIZES) {
    for (const buttons of [1, 2]) {
      const layout = playLayout(width, height, { buttons })
      const entries = Object.entries(parts(layout))
      for (const [name, rect] of entries) {
        assert.ok(inside(rect, layout.map), `${width}x${height}: ${name} on screen`)
        assert.ok(rect.width > 0 && rect.height > 0, `${width}x${height}: ${name} has room`)
      }
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          assert.ok(!overlaps(entries[i][1], entries[j][1]), `${width}x${height}: ${entries[i][0]} overlaps ${entries[j][0]}`)
        }
      }
    }
  }
})

test('the HUD strip keeps room for its line and status, and the actions for five chips', () => {
  for (const [width, height] of SIZES.slice(0, 4)) {
    const layout = playLayout(width, height)
    assert.ok(layout.hud.height >= 80, `${width}x${height}: HUD ${layout.hud.height}`)
    assert.ok(layout.hud.width >= 200, `${width}x${height}: HUD ${layout.hud.width}`)
    assert.ok(layout.actions.height >= 5 * 40 + 4 * 6, `${width}x${height}: actions ${layout.actions.height}`)
    assert.ok(layout.actions.width >= 160, `${width}x${height}: actions ${layout.actions.width}`)
  }
})

test('everything stays inside the safe area that is passed in', () => {
  const insets = { top: 24, right: 48, bottom: 16, left: 48 }
  for (const [width, height] of SIZES) {
    const layout = playLayout(width, height, { insets })
    assert.deepEqual(layout.map, { x: 48, y: 24, width: width - 96, height: height - 40 })
    const entries = Object.entries(parts(layout))
    for (const [name, rect] of entries) assert.ok(inside(rect, layout.map), `${width}x${height}: ${name} inside the safe area`)
    for (const [name, rect] of entries.filter(([name]) => name !== 'dpad')) assert.ok(!overlaps(rect, layout.dpad), `${width}x${height}: ${name} overlaps the D-pad`)
  }
})

test('a prompt goes under the HUD strip, on screen', () => {
  for (const [width, height] of SIZES) {
    const layout = playLayout(width, height)
    const area = promptArea(layout)
    assert.ok(inside(area, layout.map))
    assert.ok(!overlaps(area, layout.hud) && !overlaps(area, layout.corner))
  }
})
