import { useCallback, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Image, Platform, Pressable, Text } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { spriteSource } from './catalog'
import { walkingFrames } from './generated/walking.js'

const poses = walkingFrames as Record<string, ImageSourcePropType[]>

export function Sprite({ name, shiny = false, size = 88 }: { name: string, shiny?: boolean, size?: number }) {
  const isShiny = shiny || name.startsWith('Shiny ')
  const base = name.replace(/^Shiny /, '')
  const label = (isShiny ? 'Shiny ' : '') + base
  const frames = poses[label]
  const [frame, setFrame] = useState(0)
  const [happy, setHappy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const react = useRef<() => void>(() => {})
  const supported = !!frames && failed !== label

  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    let mounted = true
    let active = AppState.currentState === 'active'
    let reduced = true
    function stop() { clearInterval(timer); timer = undefined; setFrame(0); setHappy(false) }
    react.current = () => {
      if (!active) return
      stop()
      setHappy(true)
      if (supported && !reduced) setFrame(1)
      let ticks = 0
      timer = setInterval(() => {
        if (++ticks >= 6) { stop(); return }
        if (supported && !reduced) setFrame(value => 1 - value)
      }, 180)
    }
    const app = AppState.addEventListener('change', state => { active = state === 'active'; stop() })
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced = value; stop() })
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) reduced = value
    }).catch(() => {})
    return () => { mounted = false; stop(); react.current = () => {}; app.remove(); motion.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- A different Pokemon/variant must cancel the previous reaction.
  }, [supported, label]))

  return <Pressable accessibilityRole="button" accessibilityLabel={`Say hello to ${label}`}
    accessibilityHint="Tap for a reaction" onPress={() => react.current()}
    style={{ width: size, height: size, alignSelf: 'center' }}>
    <Image source={supported ? frames[frame] : spriteSource(base, isShiny)}
      accessibilityLabel={label} resizeMode="contain" fadeDuration={0} onError={() => setFailed(label)}
      style={{ width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
    {happy && <Text pointerEvents="none" accessibilityLiveRegion="polite" accessibilityLabel={`${label} is happy!`}
      style={{ position: 'absolute', top: 0, right: 2, color: '#ff92af', fontSize: Math.max(18, size / 6) }}>♥</Text>}
  </Pressable>
}
