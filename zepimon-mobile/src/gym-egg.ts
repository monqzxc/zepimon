import { useSyncExternalStore } from 'react'

// The egg picked for a new Gym's plan egg in the egg list (src/app/eggs.tsx opened with for=gym), until the Gym starts.
// It lives only while the app is open, like the egg list's filters.
let picked: string[] | null = null
const listeners = new Set<() => void>()
export function pickGymEgg(family: string[] | null) {
  picked = family ? [...family] : null
  listeners.forEach(listener => listener())
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const usePickedGymEgg = () => useSyncExternalStore(subscribe, () => picked)
