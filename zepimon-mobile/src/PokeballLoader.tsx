import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native'

const dark = '#082638'
const red = '#d95a5d'
const cream = '#e5efdb'
const shine = '#f3b8b0'
// The watch loader's 14 x 14 pixel Pokeball (hatdog-app/page/loader.js) as [x, y, w, h, color],
// painted back to front. Rows 6-7 keep the dark outline layer as the center band.
const ball: [number, number, number, number, string][] = [
  [4, 0, 6, 14, dark], [2, 1, 10, 12, dark], [1, 2, 12, 10, dark], [0, 4, 14, 6, dark],
  [4, 1, 6, 5, red], [3, 2, 8, 4, red], [2, 3, 10, 3, red], [1, 4, 12, 2, red],
  [4, 8, 6, 5, cream], [3, 8, 8, 4, cream], [2, 8, 10, 3, cream], [1, 8, 12, 2, cream],
  [5, 4, 4, 6, dark], [4, 5, 6, 4, dark], [6, 5, 2, 4, cream], [5, 6, 4, 2, cream],
  [4, 2, 2, 1, shine], [3, 3, 1, 2, shine]
]

// Pulses between full size and 40% for as long as it is mounted. Decorative: pair it with text or
// accessibilityState.busy. Reduced motion shows a still ball.
export function PokeballLoader({ size = 84 }: { size?: number }) {
  const [scale] = useState(() => new Animated.Value(1))
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    let mounted = true
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value) })
      .catch(() => { if (mounted) setReduced(false) })
    return () => { mounted = false; motion.remove() }
  }, [])
  useEffect(() => {
    scale.setValue(1)
    if (reduced) return
    const useNativeDriver = Platform.OS !== 'web'
    const easing = Easing.inOut(Easing.quad)
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 0.4, duration: 450, easing, useNativeDriver }),
      Animated.timing(scale, { toValue: 1, duration: 450, easing, useNativeDriver })
    ]))
    loop.start()
    return () => loop.stop()
  }, [reduced, scale])
  const unit = size / 14
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size }}>
    <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}>
      {ball.map(([x, y, w, h, color], i) => <View key={i}
        style={{ position: 'absolute', left: x * unit, top: y * unit, width: w * unit, height: h * unit, backgroundColor: color }} />)}
    </Animated.View>
  </View>
}
