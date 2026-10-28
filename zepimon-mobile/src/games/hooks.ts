import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Platform } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { usePreferences } from '../preferences'

// Runs onTick every interval while the screen is focused. Leaving the tab or the app calls onPause, like Berry Catch.
export function useGameLoop(onTick: () => void, onPause: () => void, interval = 100) {
  const tick = useRef(onTick)
  const pause = useRef(onPause)
  useEffect(() => { tick.current = onTick; pause.current = onPause })
  useFocusEffect(useCallback(() => {
    const stop = () => pause.current()
    const timer = setInterval(() => tick.current(), interval)
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') stop() })
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', stop) : null
    return () => { clearInterval(timer); subscription.remove(); blur?.remove(); stop() }
  }, [interval]))
}

// The phone's reduce-motion setting, or always on when Settings asks this app to reduce motion.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  const { motion } = usePreferences()
  useEffect(() => {
    let mounted = true
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value) }).catch(() => {})
    return () => { mounted = false; listener.remove() }
  }, [])
  return reduced || motion === 'reduced'
}
