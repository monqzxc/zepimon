import { Platform, Vibration } from 'react-native'
import * as Speech from 'expo-speech'
import { clearCue, nativeCues, showCue } from '../modules/zepimon-live'
import type { ActiveAdventure } from './phone-adventure'
import { getPreferences } from './preferences'
import { duckMusic, resetMusicDuck } from './music'
import { findSession } from './training-plans'
import { cueAt, isEffort, remainingText, stepLabel, walkBreak } from './training-cues'
import type { Cue } from './training-cues'
import { cueEvents } from './cue-events'
import type { AlertState } from './cue-events'

// Carries out a Gym session's cues (src/cue-events.ts decides them): a buzz, the spoken step (expo-speech, with the
// phone's text-to-speech voice), and on Android the cue in the live notification, whose native side buzzes timed steps
// on the second. Called by the recording screen every second and by the GPS task on every fix, also with the screen
// off, so whichever comes first announces a change and the other finds it already done.
let state: AlertState | null = null
const native = nativeCues && Platform.OS === 'android'

export function alertCue(active: ActiveAdventure | null, now: number): { cue: Cue | null, changed: boolean } {
  const session = active?.training ? findSession(active.training.session) : undefined
  if (!active || !session) { resetCueAlerts(); return { cue: null, changed: false } }
  const cue = cueAt(session, active, now, active.training?.marks)
  const seconds = Math.max(0, (now - active.startedAt) / 1000)
  const preferences = getPreferences()
  const pause = walkBreak(active.training?.breaks, seconds)
  const events = cueEvents(state, active.startedAt, cue, active.meters, seconds, { native, splits: preferences.voiceSplits },
    index => !!session.steps[index]?.seconds, pause ? pause.walking : undefined)
  state = events.state
  if (events.buzz) Vibration.vibrate(events.buzz)
  if (preferences.voiceCues) for (const line of events.speech) {
    // The background music drops while each line is spoken (src/music.ts).
    duckMusic(true)
    const release = () => duckMusic(false)
    Speech.speak(line, { onDone: release, onStopped: release, onError: release })
  }
  if (cue.done) clearCue()
  else if (pause?.walking) showCue({ label: 'Walk break', until: Math.round(now + pause.remaining * 1000), remaining: '', next: 'run again', nextEffort: true })
  else showCue({ label: stepLabel(cue.step), remaining: remainingText(cue), next: cue.next ? stepLabel(cue.next) : null,
    until: cue.remainingSeconds !== null ? Math.round(now + cue.remainingSeconds * 1000) : 0, nextEffort: !!cue.next && isEffort(cue.next) })
  return { cue, changed: events.changed }
}

// The session ended (saved, discarded or handed to the watch): forget it and stop talking.
export function resetCueAlerts() {
  if (!state) return
  state = null
  clearCue()
  Speech.stop().catch(() => {})
  resetMusicDuck()
}
