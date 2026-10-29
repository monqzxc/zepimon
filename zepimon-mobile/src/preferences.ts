import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Activity } from './phone-adventure.ts'
import { themeNames } from './palettes.ts'
import type { ThemeName } from './palettes.ts'

// App settings chosen in Settings, kept on this phone. activity: what the Adventure tab starts with. motion: follow
// the phone's reduce-motion setting, or always reduce animations in this app. theme: Emerald, Gengar, Deoxys or Pikachu, and
// appearance: follow the phone's dark mode, or always light or dark (src/theme.ts). name: the trainer name on your
// Settings profile, blank until you set one. safariControls: walk the Safari Zone with the D-pad or by tapping a tile.
// safariTrainer: Brendan or May. playOrientation: how the walking games open in full screen, so the next immersive session
// turns the same way (the rest of the app stays portrait).
export type Appearance = 'system' | 'light' | 'dark'
export type Preferences = { activity: Activity, motion: 'system' | 'reduced', theme: ThemeName, appearance: Appearance, name: string,
  safariControls: 'dpad' | 'tap', safariTrainer: 'brendan' | 'may', playOrientation: 'portrait' | 'landscape' }
export const defaultPreferences: Preferences = { activity: 'walking', motion: 'system', theme: 'emerald', appearance: 'system', name: '',
  safariControls: 'dpad', safariTrainer: 'brendan', playOrientation: 'portrait' }
export const NAME_LIMIT = 24
const KEY = 'zepimon-preferences-v1'

// Gengar was the only look before Emerald became the default, so anyone who had the app then keeps it.
const BEFORE_EMERALD: ThemeName = 'gengar'

// Anything unreadable falls back to the default, one setting at a time. Saved settings come from an earlier install,
// so a missing or retired theme there means the Gengar look that install was showing.
export function restorePreferences(raw: unknown): Preferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<Preferences> : {}
  return {
    activity: value.activity === 'running' ? 'running' : 'walking',
    motion: value.motion === 'reduced' ? 'reduced' : 'system',
    theme: themeNames.includes(value.theme!) ? value.theme! : BEFORE_EMERALD,
    appearance: value.appearance === 'light' || value.appearance === 'dark' ? value.appearance : 'system',
    name: typeof value.name === 'string' ? value.name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT) : '',
    safariControls: value.safariControls === 'tap' ? 'tap' : 'dpad',
    safariTrainer: value.safariTrainer === 'may' ? 'may' : 'brendan',
    playOrientation: value.playOrientation === 'landscape' ? 'landscape' : 'portrait'
  }
}

// The settings the app opens with. saved: what this phone stored, or null if nothing was. returning: this phone already
// holds a journal, so the app was installed before; with no settings saved it was showing Gengar. Only a fresh install
// opens in Emerald.
export function startingPreferences(saved: unknown, returning: boolean): Preferences {
  if (saved != null) return restorePreferences(saved)
  return returning ? { ...defaultPreferences, theme: BEFORE_EMERALD } : defaultPreferences
}

let state = defaultPreferences
// False until the saved settings are read, so the app can wait instead of flashing the default theme.
let loaded = false
const listeners = new Set<() => void>()
function update(next: Preferences) {
  state = next
  listeners.forEach(listener => listener())
}

// The journal's own key (src/store.tsx) tells a returning phone from a fresh install.
Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem('zepimon-mobile-v1')])
  .then(([text, journal]) => { state = startingPreferences(text ? JSON.parse(text) : null, !!journal) })
  .catch(() => {})
  .finally(() => { loaded = true; update(state) })

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  update(restorePreferences({ ...state, [key]: value }))
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {})
}

export function getPreferences(): Preferences {
  return state
}
export function subscribePreferences(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, () => state)
}
export function usePreferencesLoaded(): boolean {
  return useSyncExternalStore(subscribePreferences, () => loaded)
}
