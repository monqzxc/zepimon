import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react'
import type { View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { freshTour, restoreTour } from './tour-plan.ts'
import type { Box, TourScreen, TourState } from './tour-plan.ts'

// The welcome tour and the first-visit tips: what has been seen, kept on this phone, and what is showing now. The
// welcome slides (src/WelcomeTour.tsx) open the first time the app does, and again from Settings → Welcome tour, which
// also lets every screen show its tips once more. A screen's tips (src/CoachMarks.tsx) show the first time it is opened,
// once the welcome slides are out of the way.
const KEY = 'zepimon-tour-v1'

// welcome: the slides are open. focused: the tab on screen that has tips, if it can show them now. coach: the screen
// whose tips are due.
type Live = { loaded: boolean, state: TourState, welcome: boolean, focused: TourScreen | null, coach: TourScreen | null }
let live: Live = { loaded: false, state: freshTour, welcome: false, focused: null, coach: null }
const listeners = new Set<() => void>()
function update(next: Partial<Live>) {
  const merged = { ...live, ...next }
  const due = merged.loaded && !merged.welcome && merged.focused && !merged.state.seen.includes(merged.focused) ? merged.focused : null
  live = { ...merged, coach: due }
  listeners.forEach(listener => listener())
}
function save(state: TourState) {
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {})
}

// If what was seen cannot be read, the tour stays away rather than opening on every launch.
AsyncStorage.getItem(KEY)
  .then(text => { const state = restoreTour(text ? JSON.parse(text) : null); update({ loaded: true, state, welcome: !state.welcomed }) })
  .catch(() => update({ loaded: true, state: { welcomed: true, seen: [] } }))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useTour(): Live {
  return useSyncExternalStore(subscribe, () => live)
}
// False until what was seen is read, so the app can open straight into the welcome slides.
export function useTourLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => live.loaded)
}

// Settings → Welcome tour: the slides again, and each screen's tips once more after them.
export function replayTour() {
  const state: TourState = { welcomed: live.state.welcomed, seen: [] }
  save(state)
  update({ state, welcome: true })
}
export function closeWelcome() {
  const state: TourState = { ...live.state, welcomed: true }
  save(state)
  update({ state, welcome: false })
}
export function finishCoach(screen: TourScreen) {
  if (live.state.seen.includes(screen)) return
  const state: TourState = { ...live.state, seen: [...live.state.seen, screen] }
  save(state)
  update({ state })
}

// Called by a tab's screen: its tips may show while it is on screen and enabled (not in the middle of a game or a
// recording, say).
export function useCoach(screen: TourScreen, enabled = true) {
  useFocusEffect(useCallback(() => {
    if (!enabled) return
    update({ focused: screen })
    return () => { if (live.focused === screen) update({ focused: null }) }
  }, [screen, enabled]))
}

// What the tips point at. Each target can say where it is on screen; one inside a scrolling page (Screen in src/ui.tsx)
// can also scroll itself into view.
type Target = { attached: () => boolean, measure: () => Promise<Box | null>, scrollBy?: (dy: number) => void }
const targets = new Map<string, Target>()
// Whether a target is drawn right now: the Dex has no search until it has a Pokemon, say.
export const hasTarget = (id: string) => targets.get(id)?.attached() ?? false
export const targetScroller = (id: string) => targets.get(id)?.scrollBy
export const measureTarget = (id: string) => targets.get(id)?.measure() ?? Promise.resolve(null)

// Scrolls the page a view is on by dy, without animation. Screen provides it.
export const ScrollByContext = createContext<((dy: number) => void) | undefined>(undefined)

// A view's place in the window, or null when it is not laid out (a tab that is not showing).
export function measureView(view: View | null): Promise<Box | null> {
  return new Promise(resolve => {
    if (!view) { resolve(null); return }
    view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null))
  })
}

// A ref for the view a tip points at. The view must not be flattened away (collapsable={false} on a plain View).
export function useCoachTarget(id: string) {
  const ref = useRef<View>(null)
  const scrollBy = useContext(ScrollByContext)
  useEffect(() => {
    const target: Target = { attached: () => !!ref.current, measure: () => measureView(ref.current), scrollBy }
    targets.set(id, target)
    return () => { if (targets.get(id) === target) targets.delete(id) }
  }, [id, scrollBy])
  return ref
}
