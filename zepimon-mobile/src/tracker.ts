import { useSyncExternalStore } from 'react'
import { AppState, Linking, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { addFix, newAdventure, restoreActive, saveActive } from './phone-adventure'
import type { ActiveAdventure, Activity } from './phone-adventure'

// Records the adventure in progress from GPS. On phones the updates come through a location task backed by Android's
// foreground service (with its notification) or iOS background location, so recording goes on with the screen off.
// Both need only "while using the app" permission, because recording always starts from the open app. The web build
// and Expo Go (no background tasks on Android) watch only while the app is open. This module is imported by the root
// layout: tasks must be defined at load.
const TASK = 'zepimon-adventure-route'
const KEY = 'zepimon-active-adventure-v1'
const background = Platform.OS !== 'web'

// off: location services are off. denied: permission refused, but the app may ask again. blocked: only Settings can
// allow it now. approximate: only approximate location was allowed, too coarse to draw a route.
export type LocationIssue = 'off' | 'denied' | 'blocked' | 'approximate'
export type TrackerState = { ready: boolean, active: ActiveAdventure | null, recording: boolean }

let state: TrackerState = { ready: false, active: null, recording: false }
const listeners = new Set<() => void>()
function update(change: Partial<TrackerState>) {
  state = { ...state, ...change }
  listeners.forEach(listener => listener())
}

let writes = Promise.resolve()
function persist(active: ActiveAdventure | null) {
  writes = writes.then(() => active ? AsyncStorage.setItem(KEY, saveActive(active)) : AsyncStorage.removeItem(KEY)).catch(() => {})
  return writes
}

// Watches in the foreground only: on the web, and in Expo Go, which has no background tasks on Android.
let webWatch: Location.LocationSubscription | null = null
async function isRecording() {
  if (webWatch) return true
  if (!background) return false
  try { return await Location.hasStartedLocationUpdatesAsync(TASK) } catch { return false }
}

const loaded = AsyncStorage.getItem(KEY)
  .then(async text => { const active = text ? restoreActive(text) : null; update({ active, recording: active ? await isRecording() : false }) })
  .catch(() => {})
  .finally(() => update({ ready: true }))

async function receive(locations: Location.LocationObject[]) {
  await loaded
  let active = state.active
  if (!active) return
  for (const { coords, timestamp } of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
    active = addFix(active, { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, at: timestamp })
  }
  update({ active })
  await persist(active)
}

if (background) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (!error && data?.locations?.length) await receive(data.locations)
  })
  // A recording that the system stopped (a restart, a force stop) shows as paused when the app comes back.
  AppState.addEventListener('change', next => { if (next === 'active') void isRecording().then(recording => update({ recording })) })
}

// The current problem with location, without asking for anything. null means it is fine or not asked yet.
export async function checkLocation(): Promise<LocationIssue | null> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return 'off'
    const permission = await Location.getForegroundPermissionsAsync()
    if (permission.status === 'undetermined') return null
    if (!permission.granted) return permission.canAskAgain ? 'denied' : 'blocked'
    return permission.android?.accuracy === 'coarse' || permission.ios?.accuracy === 'reduced' ? 'approximate' : null
  } catch {
    return null
  }
}

// Turns location on (Android offers its own dialog) and asks for permission when it still can.
async function prepare(): Promise<LocationIssue | null> {
  if (!(await Location.hasServicesEnabledAsync())) {
    if (Platform.OS !== 'android') return 'off'
    try { await Location.enableNetworkProviderAsync() } catch { return 'off' }
  }
  let permission = await Location.getForegroundPermissionsAsync()
  if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) return permission.canAskAgain ? 'denied' : 'blocked'
  return permission.android?.accuracy === 'coarse' || permission.ios?.accuracy === 'reduced' ? 'approximate' : null
}

async function startUpdates() {
  if (!background || !(await TaskManager.isAvailableAsync())) {
    webWatch?.remove()
    webWatch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, distanceInterval: 3 }, location => { void receive([location]) })
    return
  }
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000,
    activityType: Location.ActivityType.Fitness, pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: 'Adventure in progress', notificationBody: 'Zepimon is recording your distance and route.',
      notificationColor: '#6E52C8', killServiceOnDestroy: false }
  })
}

// Starts a new adventure. Returns the location problem that stopped it, if any; other failures throw.
export async function startAdventure(family: string[], activity: Activity, mega: string | null): Promise<LocationIssue | null> {
  await loaded
  if (state.active) return resumeAdventure()
  const issue = await prepare()
  if (issue && issue !== 'approximate') return issue
  const active = newAdventure(family, activity, mega, Date.now())
  update({ active })
  await persist(active)
  try { await startUpdates() } catch (error) { update({ active: null }); await persist(null); throw error }
  update({ recording: true })
  return issue
}

export async function resumeAdventure(): Promise<LocationIssue | null> {
  await loaded
  if (!state.active) return null
  const issue = await prepare()
  if (issue && issue !== 'approximate') return issue
  await startUpdates()
  update({ recording: true })
  return issue
}

// Stops recording but keeps the adventure, so it can be saved (or recording resumed if saving fails). Returns the
// adventure as it stands once the last GPS batch is in.
export async function stopAdventure(): Promise<ActiveAdventure | null> {
  webWatch?.remove()
  webWatch = null
  if (background) {
    try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK) } catch { /* already stopped */ }
  }
  update({ recording: false })
  await writes
  return state.active
}

// Forgets the adventure in progress: after it is saved, or when it is discarded.
export async function clearAdventure() {
  await stopAdventure()
  update({ active: null })
  await persist(null)
}

// Android opens its location switch when location is off; otherwise (and on iOS, which has no direct link to
// Location Services) this opens Zepimon's own settings, where location permission and precise location live.
export function openLocationSettings(issue: LocationIssue | null) {
  if (Platform.OS === 'android' && issue === 'off') return Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings())
  return Linking.openSettings().catch(() => {})
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useTracker(): TrackerState {
  return useSyncExternalStore(subscribe, () => state)
}
