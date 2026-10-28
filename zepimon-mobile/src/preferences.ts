import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Activity } from './phone-adventure.ts'
import { themeNames } from './palettes.ts'
import type { ThemeName } from './palettes.ts'

// App settings chosen in Settings, kept on this phone. activity: what the Adventure tab starts with. motion: follow
// the phone's reduce-motion setting, or always reduce animations in this app. theme: Gengar, Deoxys or Pikachu, and
// appearance: follow the phone's dark mode, or always light or dark (src/theme.ts). name: the trainer name on your
// Settings profile, blank until you set one. safariControls: walk the Safari Zone with the D-pad or by tapping a tile.
// safariTrainer: Brendan or May.
export type Appearance = 'system' | 'light' | 'dark'
export type Preferences = { activity: Activity, motion: 'system' | 'reduced', theme: ThemeName, appearance: Appearance, name: string,
  safariControls: 'dpad' | 'tap', safariTrainer: 'brendan' | 'may' }
export const defaultPreferences: Preferences = { activity: 'walking', motion: 'system', theme: 'gengar', appearance: 'system', name: '',
  safariControls: 'dpad', safariTrainer: 'brendan' }
export const NAME_LIMIT = 24
const KEY = 'zepimon-preferences-v1'

// Anything unreadable falls back to the default, one setting at a time.
export function restorePreferences(raw: unknown): Preferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<Preferences> : {}
  return {
    activity: value.activity === 'running' ? 'running' : 'walking',
    motion: value.motion === 'reduced' ? 'reduced' : 'system',
    theme: themeNames.includes(value.theme!) ? value.theme! : 'gengar',
    appearance: value.appearance === 'light' || value.appearance === 'dark' ? value.appearance : 'system',
    name: typeof value.name === 'string' ? value.name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT) : '',
    safariControls: value.safariControls === 'tap' ? 'tap' : 'dpad',
    safariTrainer: value.safariTrainer === 'may' ? 'may' : 'brendan'
  }
}

let state = defaultPreferences
// False until the saved settings are read, so the app can wait instead of flashing the default theme.
let loaded = false
const listeners = new Set<() => void>()
function update(next: Preferences) {
  state = next
  listeners.forEach(listener => listener())
}

AsyncStorage.getItem(KEY)
  .then(text => { if (text) state = restorePreferences(JSON.parse(text)) })
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
