import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import type { AudioPlayer } from 'expo-audio'
import { getPreferences, subscribePreferences } from './preferences'

// The background theme: loops while the app is open with Music on in Settings, and pauses when the app leaves the
// screen (locked, switched away, a call). One player for the whole app, kept outside React so voice cues can duck it
// from the GPS task too (src/cue-alerts.ts).

const THEME = require('../assets/audio/home-theme.mp3')
// Under a spoken cue the music drops to this share of its volume, so the words come through.
const DUCKED = 0.2

let player: AudioPlayer | null = null
let foreground = AppState.currentState === 'active'
let ducked = 0

function volume() {
  return getPreferences().musicVolume * (ducked > 0 ? DUCKED : 1)
}

// Brings the player in line with the setting, the volume and whether the app is on screen.
function apply() {
  const { music } = getPreferences()
  const playing = music && foreground && getPreferences().musicVolume > 0
  if (!playing) { player?.pause(); return }
  if (!player) {
    player = createAudioPlayer(THEME)
    player.loop = true
  }
  player.volume = volume()
  if (!player.playing) player.play()
}

// Preview a volume while the Settings slider moves, before it is saved.
export function previewMusicVolume(value: number) {
  if (player) player.volume = value * (ducked > 0 ? DUCKED : 1)
}

// A cue starts (true) or finishes (false) speaking. Counted, so back-to-back lines keep the music low between them.
export function duckMusic(on: boolean) {
  ducked = on ? ducked + 1 : Math.max(0, ducked - 1)
  if (player) player.volume = volume()
}

// Speech was cut off (the session ended): bring the music back up whatever was still queued.
export function resetMusicDuck() {
  ducked = 0
  if (player) player.volume = volume()
}

// Started by the root layout once the saved settings are read, so Music turned off never plays a moment at launch.
export function useBackgroundMusic(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    // Ambient: mixes with other apps' audio instead of stopping it, and follows the phone's silent mode.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false })
      .catch(() => {})
      .finally(apply)
    const unsubscribe = subscribePreferences(apply)
    const appState = AppState.addEventListener('change', state => {
      foreground = state === 'active'
      apply()
    })
    // Browsers block sound until the page is touched, so the web build tries again on the first tap or key.
    let unlock: (() => void) | undefined
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      unlock = apply
      document.addEventListener('pointerdown', unlock, { once: true })
      document.addEventListener('keydown', unlock, { once: true })
    }
    return () => {
      unsubscribe()
      appState.remove()
      if (unlock) {
        document.removeEventListener('pointerdown', unlock)
        document.removeEventListener('keydown', unlock)
      }
      player?.remove()
      player = null
    }
  }, [ready])
}
