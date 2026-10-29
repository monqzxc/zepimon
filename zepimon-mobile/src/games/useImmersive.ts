import { useEffect, useMemo, useState } from 'react'
import { AppState, BackHandler, Platform } from 'react-native'
import { useNavigation } from 'expo-router'
import { setStatusBarHidden } from 'expo-status-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { setPreference, usePreferences } from '../preferences'
import type { GameScreen, PlayOrientation } from './fullscreen'

// The browser can't be rotated: on the web immersive play is a layout only (see immersive.ts).
export const canRotate = Platform.OS !== 'web'
const lock = (orientation: PlayOrientation) => {
  if (!canRotate) return
  ScreenOrientation.lockAsync(orientation === 'landscape' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP)
    .catch(() => {})
}
// The app is portrait everywhere; only immersive play turns it (src/app/_layout.tsx locks this at start).
export const lockPortrait = () => lock('portrait')
const setOrientation = (orientation: PlayOrientation) => setPreference('playOrientation', orientation)

// Full-screen play for a screen that hosts games: the arcade tab ('tabs') or a stack screen ('header'). Gives the
// GameScreenContext value, and while full screen is on and `allowed` (a game is open) it hides the tab bar or header and
// the status bar, makes the back button leave full screen, and leaves it when the screen loses focus or the app goes to
// the background. While a walking game draws PlayOverlay it also turns the phone to the remembered playOrientation.
// Every one of these is undone by the same effect's cleanup, so exiting by any route, or unmounting, puts them all back.
export function useImmersive(allowed: boolean, chrome: 'tabs' | 'header') {
  const [full, setFull] = useState(false)
  const [fill, setFill] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const { playOrientation } = usePreferences()
  const navigation = useNavigation()
  const active = full && allowed
  const landscape = active && overlay && playOrientation === 'landscape'

  // Leaving the game (back to a menu, on to a Legendary's lair) ends full screen, so the next game opens normally.
  const [wasAllowed, setWasAllowed] = useState(allowed)
  if (wasAllowed !== allowed) {
    setWasAllowed(allowed)
    if (!allowed) setFull(false)
  }
  useEffect(() => {
    if (!active) return
    const hide = (hidden: boolean) => navigation.setOptions(chrome === 'tabs'
      ? { tabBarStyle: hidden ? { display: 'none' } : undefined } : { headerShown: !hidden })
    const exit = () => setFull(false)
    hide(true)
    setStatusBarHidden(true, 'fade')
    const back = BackHandler.addEventListener('hardwareBackPress', () => { exit(); return true })
    const blur = navigation.addListener('blur', exit)
    const app = AppState.addEventListener('change', state => { if (state === 'background') exit() })
    return () => {
      back.remove(); blur(); app.remove()
      setStatusBarHidden(false, 'fade')
      hide(false)
    }
  }, [active, chrome, navigation])
  useEffect(() => {
    if (!landscape) return
    lock('landscape')
    return () => lock('portrait')
  }, [landscape])

  const screen = useMemo<GameScreen>(() => ({ full: active, setFull, setFill, setOverlay, orientation: playOrientation, setOrientation }),
    [active, playOrientation])
  return { screen, full: active, fill, overlay: active && overlay, setFull }
}
