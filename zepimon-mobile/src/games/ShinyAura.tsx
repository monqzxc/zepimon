import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, Text, View } from 'react-native'

const native = Platform.OS !== 'web'

// Where the little stars twinkle around a Shiny, as fractions of its sprite box, with their size and phase.
const STARS: [x: number, y: number, scale: number, delay: number][] = [
  [0.14, 0.3, 1, 0], [0.86, 0.22, 0.8, 400], [0.9, 0.62, 1.1, 800], [0.1, 0.7, 0.75, 1200], [0.5, 0.04, 0.9, 1600]
]
const GOLD = '#FFD23F'

// A Shiny's flex in its lair, on top of the Emerald sparkle burst: a soft gold glow on the ground under it (drawn
// behind the sprite) and little stars twinkling around it (in front), all the time. With reduced motion they hold still.
export function ShinyGlow({ size, reduced }: { size: number, reduced: boolean }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
    <Glow size={size} reduced={reduced} />
  </View>
}

export function ShinyStars({ size, reduced }: { size: number, reduced: boolean }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
    {STARS.map(([x, y, scale, delay], i) => <Star key={i} x={x * size} y={y * size} side={size * 0.24 * scale} delay={delay} reduced={reduced} />)}
  </View>
}

function useLoop(duration: number, delay: number, reduced: boolean) {
  const [progress] = useState(() => new Animated.Value(reduced ? 0.5 : 0))
  useEffect(() => {
    if (reduced) { progress.setValue(0.5); return }
    // The delay only sets the phase, so the stars keep taking turns instead of drifting into step.
    const loop = Animated.sequence([Animated.delay(delay), Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: native })
    ]))])
    loop.start()
    return () => loop.stop()
  }, [progress, duration, delay, reduced])
  return progress
}

function Glow({ size, reduced }: { size: number, reduced: boolean }) {
  const progress = useLoop(2200, 0, reduced)
  const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.8, 0.35] })
  return <Animated.View style={{ position: 'absolute', left: size * 0.1, top: size * 0.8, width: size * 0.8, height: size * 0.24,
    borderRadius: size, borderWidth: 2, borderColor: GOLD, backgroundColor: 'rgba(255, 226, 122, 0.25)', opacity }} />
}

function Star({ x, y, side, delay, reduced }: { x: number, y: number, side: number, delay: number, reduced: boolean }) {
  const progress = useLoop(2000, delay, reduced)
  const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] })
  const scale = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] })
  return <Animated.View style={{ position: 'absolute', left: x - side / 2, top: y - side / 2, width: side, height: side, alignItems: 'center',
    justifyContent: 'center', opacity, transform: [{ scale }] }}>
    <Text style={{ color: GOLD, fontSize: side, lineHeight: side * 1.1, textShadowColor: 'rgba(150, 90, 0, 0.95)', textShadowRadius: 2,
      textShadowOffset: { width: 0, height: 0 } }}>✦</Text>
  </Animated.View>
}
