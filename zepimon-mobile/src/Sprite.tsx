import { useCallback, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Image, Platform, Pressable, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { isDynamax, spriteSource } from './catalog'
import { spriteForm } from './generated/forms.js'
import { walkingFrames } from './generated/walking.js'

const poses = walkingFrames as Record<string, ImageSourcePropType[]>

// The red glow of a Dynamax form, which otherwise looks like its species. Goes first inside a box of this size.
export function DynamaxAura({ size }: { size: number }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(230, 30, 80, 0.16)' }} />
    <View style={{ position: 'absolute', width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36, backgroundColor: 'rgba(255, 60, 110, 0.24)' }} />
  </View>
}

// The front-facing overworld pose (the battle sprite where there is none), which hops and shows a heart when tapped.
// onLongPress adds a second action, like opening the Pokemon's record.
export function Sprite({ name, shiny = false, size = 88, onLongPress }: { name: string, shiny?: boolean, size?: number, onLongPress?: () => void }) {
  const isShiny = shiny || name.startsWith('Shiny ')
  const base = name.replace(/^Shiny /, '')
  const label = (isShiny ? 'Shiny ' : '') + base
  const frames = poses[(isShiny ? 'Shiny ' : '') + spriteForm(base)]
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
    accessibilityHint={onLongPress ? 'Tap for a reaction. Hold to open its record' : 'Tap for a reaction'} onPress={() => react.current()}
    onLongPress={onLongPress} accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Open its record' }] : undefined}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'longpress') onLongPress?.() }}
    style={{ width: size, height: size, alignSelf: 'center' }}>
    {isDynamax(base) && <DynamaxAura size={size} />}
    <Image source={supported ? frames[frame] : spriteSource(base, isShiny)}
      accessibilityLabel={label} resizeMode="contain" fadeDuration={0} onError={() => setFailed(label)}
      style={{ width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
    {happy && <Text pointerEvents="none" accessibilityLiveRegion="polite" accessibilityLabel={`${label} is happy!`}
      style={{ position: 'absolute', top: 0, right: 2, color: '#ff92af', fontSize: Math.max(18, size / 6) }}>♥</Text>}
  </Pressable>
}
