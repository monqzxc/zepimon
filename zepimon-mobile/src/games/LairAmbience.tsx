import { memo, useEffect, useState } from 'react'
import { Animated, Easing, Platform, View } from 'react-native'
import { AMBIENCE } from './lairs'
import type { LairId } from './lairs'

const native = Platform.OS !== 'web'

// The lair's air over Emerald's art (AMBIENCE in src/games/lairs.ts): bubbles and embers rise, snow and petals fall,
// dust and mist drift across, motes twinkle in place. A few soft particles on the native driver, set out the same way
// every time, and nothing at all with reduced motion.
export const LairAmbience = memo(function LairAmbience({ lair, width, height, reduced }: { lair: LairId, width: number, height: number, reduced: boolean }) {
  if (reduced || width <= 0 || height <= 0) return null
  const { kind, colors, count, size } = AMBIENCE[lair]
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
    {Array.from({ length: count }, (_, i) => <Particle key={`${lair}-${i}`} kind={kind} color={colors[i % colors.length]}
      size={size * (0.7 + ((i * 37) % 10) / 15)} x={((i * 0.618034) % 1) * width} y={((i * 0.381966 + 0.1) % 1) * height}
      width={width} height={height} delay={(i * 911) % 4000} duration={kind === 'twinkle' ? 1600 + (i * 263) % 1400 : 6000 + (i * 1237) % 5000} />)}
  </View>
})

function Particle({ kind, color, size, x, y, width, height, delay, duration }: {
  kind: 'rise' | 'fall' | 'drift' | 'twinkle', color: string, size: number, x: number, y: number, width: number, height: number, delay: number, duration: number
}) {
  const [progress] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, { toValue: 1, duration, easing: kind === 'twinkle' ? Easing.inOut(Easing.sin) : Easing.linear, useNativeDriver: native }),
      Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: native })
    ]))
    loop.start()
    return () => loop.stop()
  }, [progress, delay, duration, kind])
  const travel = (from: number, to: number) => progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] })
  // Rising and falling particles cross the whole height in their column, drifting ones the whole width in their row.
  const transform = kind === 'rise' ? [{ translateY: travel(height + size, -size) }, { translateX: travel(0, size * 2) }]
    : kind === 'fall' ? [{ translateY: travel(-size, height + size) }, { translateX: travel(0, -size * 3) }]
    : kind === 'drift' ? [{ translateX: travel(-size * 3, width + size) }] : []
  const opacity = kind === 'twinkle' ? progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.9, 0] })
    : progress.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.75, 0.75, 0] })
  const round = kind !== 'drift'
  return <Animated.View style={{ position: 'absolute', left: kind === 'drift' ? 0 : x, top: kind === 'rise' || kind === 'fall' ? 0 : y,
    width: round ? size : size * 3, height: size, borderRadius: size, backgroundColor: color, opacity, transform }} />
}
