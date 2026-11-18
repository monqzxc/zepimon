import { requireOptionalNativeModule } from 'expo'

// The live adventure notification in android/ (LiveNotification.kt). Elsewhere (iOS, the web) there is none.
export type LiveOptions = { activity: string, startedAt: number, distance: string, pokemon: string, icon: string | null }
// The Gym cue in the notification. until: when a timed step ends (ms), 0 for a measured step, whose remaining
// distance is `remaining`. The native side buzzes when a timed step ends and 10 s before (LiveNotification.kt).
export type CueOptions = { label: string, until: number, remaining: string, next: string | null, nextEffort: boolean }
type Live = { show(options: LiveOptions): void, stop(): void, cue?(options: CueOptions): void, clearCue?(): void }
const native = requireOptionalNativeModule<Live>('ZepimonLive')

export function showLive(options: LiveOptions) {
  try { native?.show(options) } catch { /* no notification: recording goes on */ }
}

export function stopLive() {
  try { native?.stop() } catch { /* nothing to stop */ }
}

// Whether this build buzzes timed steps natively (Android with this module), so JavaScript leaves those to it.
export const nativeCues = !!native?.cue

export function showCue(options: CueOptions) {
  try { native?.cue?.(options) } catch { /* no cue in the notification: the screen and voice still cue */ }
}

export function clearCue() {
  try { native?.clearCue?.() } catch { /* nothing to clear */ }
}
