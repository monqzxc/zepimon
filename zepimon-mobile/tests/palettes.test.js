import test from 'node:test'
import assert from 'node:assert/strict'
import { themeNames, themes, typeInksFor, typeTintsFor } from '../src/palettes.ts'

// WCAG contrast between two #RRGGBB colors.
function contrast(a, b) {
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}
const every = (fn) => { for (const name of themeNames) for (const mode of ['light', 'dark']) fn(`${name} ${mode}`, themes[name][mode], mode) }
// Pairs below need 4.5:1 (normal text); icons and large glyphs need 3:1.
function check(failures, label, fg, bg, need = 4.5) {
  const ratio = contrast(fg, bg)
  if (ratio < need) failures.push(`${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}, needs ${need}`)
}

test('text colors stay readable on every surface of every theme', () => {
  const failures = []
  every((label, p) => {
    for (const text of ['ink', 'muted', 'edge', 'gold', 'danger', 'success'])
      for (const surface of ['bg', 'panel', 'sunken', 'mint']) check(failures, `${label} ${text} on ${surface}`, p[text], p[surface])
    for (const surface of ['bg', 'panel', 'altTint']) check(failures, `${label} alt on ${surface}`, p.alt, p[surface])
    check(failures, `${label} gold on goldTint`, p.gold, p.goldTint)
    check(failures, `${label} danger icon on dangerTint`, p.danger, p.dangerTint, 3)
    check(failures, `${label} star glyph on panel`, p.star, p.panel, 3)
  })
  assert.deepEqual(failures, [])
})

test('text on accent fills, the brand gradient and the tab bar stays readable', () => {
  const failures = []
  every((label, p) => {
    check(failures, `${label} onEdge on edge`, p.onEdge, p.edge)
    for (const stop of ['brandFrom', 'brandTo']) check(failures, `${label} onBrand on ${stop}`, p.onBrand, p[stop])
    for (const bar of ['tabTop', 'tabBottom']) {
      check(failures, `${label} tab label on ${bar}`, p.tabInk, p[bar])
      check(failures, `${label} open tab label on ${bar}`, p.tabActive, p[bar], 7)
    }
  })
  assert.deepEqual(failures, [])
})

test('text on type-tinted cards stays readable in every theme', () => {
  const failures = []
  every((label, p, mode) => {
    for (const [type, tint] of Object.entries(typeTintsFor(p, mode)))
      for (const text of ['ink', 'muted', 'edge', 'success']) check(failures, `${label} ${text} on ${type} tint`, p[text], tint)
  })
  assert.deepEqual(failures, [])
})

test('type colors stay readable as bold text on their own card tints', () => {
  const failures = []
  every((label, p, mode) => {
    const tints = typeTintsFor(p, mode), inks = typeInksFor(mode)
    for (const type of Object.keys(tints)) check(failures, `${label} ${type} ink on its tint`, inks[type], tints[type], 3)
  })
  assert.deepEqual(failures, [])
})

test('Emerald is a theme in light and dark, and every check above covers it', () => {
  assert.ok(themeNames.includes('emerald'))
  assert.equal(themeNames[0], 'emerald', 'Listed first, as the default')
  for (const mode of ['light', 'dark']) assert.ok(themes.emerald[mode], `emerald ${mode}`)
  // GBA menus: cream paper by day, deep teal at night; emerald green with Hoenn sea blue.
  const day = themes.emerald.light, night = themes.emerald.dark
  const hue = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    return { r, g, b }
  }
  assert.ok(hue(day.bg).r > 230 && hue(day.bg).g > 225 && hue(day.bg).b < hue(day.bg).r, 'Cream paper')
  assert.ok(hue(night.bg).r < 30 && hue(night.bg).b > hue(night.bg).r, 'Deep teal night')
  for (const p of [day, night]) {
    assert.ok(hue(p.edge).g > hue(p.edge).r && hue(p.edge).g > hue(p.edge).b, 'Emerald green accent')
    assert.ok(hue(p.alt).b > hue(p.alt).r && hue(p.alt).b > hue(p.alt).g, 'Sea blue second accent')
  }
})

test('the Emerald menu frame keeps its light inner and dark outer borders apart', () => {
  const failures = []
  for (const mode of ['light', 'dark']) {
    const p = themes.emerald[mode]
    check(failures, `emerald ${mode} outer frame on page`, p.frameOuter, p.bg, 3)
    check(failures, `emerald ${mode} outer frame against inner`, p.frameOuter, p.frameInner, 3)
  }
  assert.deepEqual(failures, [])
})
