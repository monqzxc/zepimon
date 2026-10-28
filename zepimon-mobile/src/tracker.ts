import { useSyncExternalStore } from 'react'
import { AppState, Linking, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { lastCrash } from '../modules/zepimon-diagnostics'
import { cloudClient } from './cloud-client'
import { addFix, newAdventure, restoreActive, saveActive } from './phone-adventure'
import type { ActiveAdventure, Activity } from './phone-adventure'
import { followShared, fromShared, restoreShared, sharedFrom, takenOver } from './shared-adventure'
import type { SharedAdventure, SharedTrail } from './shared-adventure'

// Records the adventure in progress from GPS. On phones the updates come through a location task backed by Android's
// foreground service (with its notification) or iOS background location, so recording goes on with the screen off.
// Both need only "while using the app" permission, because recording always starts from the open app. The web build
// and Expo Go (no background tasks on Android) watch only while the app is open. This module is imported by the app
// entry (index.js): tasks must be defined at load, also when Android starts the app in the background to deliver
// locations, which never renders the screens.
const TASK = 'zepimon-adventure-route'
const KEY = 'zepimon-active-adventure-v1'
// Set when the app crashed during an adventure: recording then watches only while the app is open, which needs no
// foreground service, until screen-off recording is turned back on.
const SCREEN_ONLY_KEY = 'zepimon-screen-only-v1'
const background = Platform.OS !== 'web'
// The adventure is shared with the watch about this often while it records (see src/shared-adventure.ts).
const SHARE_MS = 30000

// off: location services are off. denied: permission refused, but the app may ask again. blocked: only Settings can
// allow it now. approximate: only approximate location was allowed, too coarse to draw a route.
export type LocationIssue = 'off' | 'denied' | 'blocked' | 'approximate'
// shared: the adventure shared with the watch, as the cloud last had it. trail: the distances the watch shared while
// it records, for its current pace. handedOver: the adventure this phone was recording until the watch took it over,
// for the Adventure tab to say so. shareError: why the last share did not reach the cloud ('' once one does, null
// before the first).
export type TrackerState = { ready: boolean, active: ActiveAdventure | null, recording: boolean, screenOnly: boolean,
  shared: SharedAdventure | null, trail: SharedTrail | null, handedOver: SharedAdventure | null, shareError: string | null }

let state: TrackerState = { ready: false, active: null, recording: false, screenOnly: false, shared: null, trail: null, handedOver: null, shareError: null }
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

const loaded = Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(SCREEN_ONLY_KEY)])
  .then(async ([text, screenOnly]) => {
    const active = text ? restoreActive(text) : null
    // A crash with an adventure in progress most likely came from recording in the background.
    const crashed = !!active && background && !!lastCrash()
    if (crashed && !screenOnly) void AsyncStorage.setItem(SCREEN_ONLY_KEY, '1').catch(() => {})
    update({ active, screenOnly: crashed || !!screenOnly, recording: active ? await isRecording() : false })
  })
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
  void share()
}

// Shares the adventure recorded here (as it starts, every half minute, and when it ends), also from the background
// location task, so the watch and Zepp follow it. The answer says whether the watch took it over. Without a
// signed-in account the cloud refuses and nothing changes.
let sharedAt = 0
let sharing = false
async function sendShare(active: ActiveAdventure, ended = false) {
  if (!cloudClient) return
  try {
    const { data, error } = await cloudClient.rpc('zepimon_share_adventure', { adventure: sharedFrom(active, Date.now(), ended) })
    if (state.shareError !== (error ? error.message || 'the cloud refused it' : '')) update({ shareError: error ? error.message || 'the cloud refused it' : '' })
    if (!error && data) await receiveShared((data as { adventure?: unknown }).adventure)
  } catch (caught) {
    // Offline: the next share or sync catches up.
    update({ shareError: caught instanceof Error && caught.message ? caught.message : 'no connection' })
  }
}
async function share(force = false) {
  const active = state.active
  const now = Date.now()
  if (!active || sharing || (!force && now >= sharedAt && now - sharedAt < SHARE_MS)) return
  sharing = true
  sharedAt = now
  try { await sendShare(active) } finally { sharing = false }
}

// Takes in the shared adventure from the cloud (a share's answer or a sync). If the watch took over the adventure
// recorded here, recording stops without saving: the watch continues it and saves it.
export async function receiveShared(raw: unknown) {
  await loaded
  const shared = restoreShared(raw)
  update({ shared, trail: followShared(state.trail, shared) })
  if (!takenOver(state.active, shared)) return
  await stopUpdates()
  update({ active: null, recording: false, handedOver: shared })
  await persist(null)
}

// Clears the note that the watch took the last adventure over.
export const dismissHandOver = () => update({ handedOver: null })

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
  if (!background || state.screenOnly || !(await TaskManager.isAvailableAsync())) {
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
  return begin(newAdventure(family, activity, mega, Date.now()), issue)
}

// Continue here: takes over the adventure the watch is recording, with its egg, start and distance so far. The watch
// stops when it next hears from the cloud.
export async function continueAdventure(shared: SharedAdventure): Promise<LocationIssue | null> {
  await loaded
  if (state.active) return resumeAdventure()
  const issue = await prepare()
  if (issue && issue !== 'approximate') return issue
  return begin(fromShared(shared, Date.now()), issue)
}

async function begin(active: ActiveAdventure, issue: LocationIssue | null) {
  update({ active, handedOver: null })
  await persist(active)
  try { await startUpdates() } catch (error) { update({ active: null }); await persist(null); throw error }
  update({ recording: true })
  void share(true)
  return issue
}

export async function resumeAdventure(): Promise<LocationIssue | null> {
  await loaded
  if (!state.active) return null
  const issue = await prepare()
  if (issue && issue !== 'approximate') return issue
  await startUpdates()
  update({ recording: true })
  void share(true)
  return issue
}

async function stopUpdates() {
  webWatch?.remove()
  webWatch = null
  if (background) {
    try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK) } catch { /* already stopped */ }
  }
}

// Stops recording but keeps the adventure, so it can be saved (or recording resumed if saving fails). Returns the
// adventure as it stands once the last GPS batch is in.
export async function stopAdventure(): Promise<ActiveAdventure | null> {
  await stopUpdates()
  update({ recording: false })
  await writes
  return state.active
}

// Turns screen-off recording back on (or off), switching a recording in progress over.
export async function setScreenOnly(screenOnly: boolean) {
  await loaded
  update({ screenOnly })
  await (screenOnly ? AsyncStorage.setItem(SCREEN_ONLY_KEY, '1') : AsyncStorage.removeItem(SCREEN_ONLY_KEY)).catch(() => {})
  if (!state.recording) return
  await stopUpdates()
  try { await startUpdates() } catch (error) { update({ recording: false }); throw error }
}

// Forgets the adventure in progress: after it is saved, or when it is discarded. Either way it ends for the watch too.
export async function clearAdventure() {
  const ended = await stopAdventure()
  update({ active: null })
  await persist(null)
  if (ended) void sendShare(ended, true)
}

// Android opens its location switch when location is off; otherwise (and on iOS, which has no direct link to
// Location Services) this opens Zepimon's own settings, where location permission and precise location live.
export function openLocationSettings(issue: LocationIssue | null) {
  if (Platform.OS === 'android' && issue === 'off') return Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings())
  return Linking.openSettings().catch(() => {})
}

// The adventure in progress right now, for code that has just started one.
export const currentAdventure = () => state.active

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useTracker(): TrackerState {
  return useSyncExternalStore(subscribe, () => state)
}
