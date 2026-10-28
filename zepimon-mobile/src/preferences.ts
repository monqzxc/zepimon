import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Activity } from './phone-adventure.ts'

// App settings chosen in Settings, kept on this phone. activity: what the Adventure tab starts with. motion: follow
// the phone's reduce-motion setting, or always reduce animations in this app.
export type Preferences = { activity: Activity, motion: 'system' | 'reduced' }
export const defaultPreferences: Preferences = { activity: 'walking', motion: 'system' }
const KEY = 'zepimon-preferences-v1'

// Anything unreadable falls back to the default, one setting at a time.
export function restorePreferences(raw: unknown): Preferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<Preferences> : {}
  return {
    activity: value.activity === 'running' ? 'running' : 'walking',
    motion: value.motion === 'reduced' ? 'reduced' : 'system'
  }
}

let state = defaultPreferences
const listeners = new Set<() => void>()
function update(next: Preferences) {
  state = next
  listeners.forEach(listener => listener())
}

AsyncStorage.getItem(KEY)
  .then(text => { if (text) update(restorePreferences(JSON.parse(text))) })
  .catch(() => {})

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  update(restorePreferences({ ...state, [key]: value }))
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {})
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, () => state)
}
