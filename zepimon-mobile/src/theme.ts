import { useSyncExternalStore } from 'react'
import { Appearance, StyleSheet } from 'react-native'
import { themes, typeTintsFor } from './palettes'
import type { Mode, Palette, ThemeName } from './palettes'
import { getPreferences, subscribePreferences } from './preferences'

// The active theme (Gengar, Deoxys or Pikachu, src/palettes.ts) in light or dark, both chosen in Settings → Theme.
// Appearance follows the phone's dark mode unless it is set to always light or dark.
//
// colors, typeTints and every themedStyles sheet are live: reading a value gives the active palette's. Values are read
// while rendering, so a component shows a new theme when it renders again. Each screen calls useTheme(), which renders
// it again when the theme changes, and the screen's children with it. A component that skips those renders (memo, or
// a navigator's own UI like the tab bar) calls useTheme() itself.

export type { Mode, Palette, ThemeName } from './palettes'
type Active = { theme: ThemeName, mode: Mode, dark: boolean, colors: Palette }

const systemMode = (): Mode => Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
let system = systemMode()
function resolve(): Active {
  const { theme, appearance } = getPreferences()
  const mode = appearance === 'system' ? system : appearance
  return { theme, mode, dark: mode === 'dark', colors: themes[theme][mode] }
}
let active = resolve()
const listeners = new Set<() => void>()
function refresh() {
  const next = resolve()
  if (next.colors === active.colors) return
  active = next
  listeners.forEach(listener => listener())
}
Appearance.addChangeListener(() => { system = systemMode(); refresh() })
subscribePreferences(refresh)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useTheme(): Active {
  return useSyncExternalStore(subscribe, () => active)
}

// An object with the same keys as current() whose values always come from it.
function live<T extends object>(current: () => T): T {
  const view = {} as T
  for (const key of Object.keys(current()) as (keyof T)[]) Object.defineProperty(view, key, { enumerable: true, get: () => current()[key] })
  return view
}
export const colors: Palette = live(() => active.colors)
const tints = new Map<Palette, Record<string, string>>()
export const typeTints: Record<string, string> = live(() => {
  let value = tints.get(active.colors)
  if (!value) tints.set(active.colors, value = typeTintsFor(active.colors, active.mode))
  return value
})
// A frosted layer over a tinted card, like a badge on a pastel tile: white at alpha in light, a faint lift in dark.
export const glass = (alpha: number) => `rgba(255, 255, 255, ${active.dark ? +(alpha * 0.12).toFixed(3) : alpha})`

// StyleSheet.create for styles that use theme colors. make runs once per palette, the first time it is shown, and
// reads the live colors above.
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(make: () => T & StyleSheet.NamedStyles<any>): T {
  const sheets = new Map<Palette, T>()
  return live(() => {
    let sheet = sheets.get(active.colors)
    if (!sheet) sheets.set(active.colors, sheet = StyleSheet.create(make()))
    return sheet
  })
}
