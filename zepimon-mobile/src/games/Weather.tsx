import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import type { Weather } from './battle'

const native = Platform.OS !== 'web'
// Each weather's wash over the board, and what moves through it.
const LOOKS: Record<Weather, { wash: string, count: number, period: number }> = {
  sun: { wash: 'rgba(255, 186, 72, 0.14)', count: 4, period: 5200 },
  rain: { wash: 'rgba(40, 70, 120, 0.2)', count: 28, period: 900 },
  sandstorm: { wash: 'rgba(196, 150, 84, 0.22)', count: 22, period: 1600 },
  hail: { wash: 'rgba(210, 232, 255, 0.16)', count: 18, period: 1800 },
  fog: { wash: 'rgba(120, 110, 150, 0.24)', count: 4, period: 16000 }
}
// Stable per-piece spread, so pieces never reshuffle between renders.
const spread = (i: number, salt: number) => { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v) }

// The weather over Trail Defense's board, drawn in board units (width x height): a wash in its colour and rain streaks,
// blowing sand, hail, slow sunbeams or drifting fog banks, all looping on the native driver. It never takes a tap.
// Reduced motion: the wash alone.
export function WeatherLayer({ weather, width, height, reduced }: { weather: Weather, width: number, height: number, reduced: boolean }) {
  const look = LOOKS[weather]
  const [t] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: look.period, easing: Easing.linear, useNativeDriver: native }))
    loop.start()
    return () => loop.stop()
  }, [t, look.period, reduced])
  // Where piece i is in its own cycle: the shared clock, offset per piece and wrapped.
  const phase = (i: number) => Animated.modulo(Animated.add(t, spread(i, 1)), 1)
  const pieces = reduced ? [] : Array.from({ length: look.count }, (_, i) => {
    const x = spread(i, 2) * width, y = spread(i, 3) * height, p = phase(i)
    if (weather === 'rain') return <Animated.View key={i} style={[look2.piece, { left: x, top: -40, width: 2, height: 22, backgroundColor: 'rgba(200, 225, 255, 0.55)',
      transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) }, { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.18] }) },
        { rotate: '12deg' }] }]} />
    if (weather === 'hail') return <Animated.View key={i} style={[look2.piece, { left: x, top: -12, width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.85)',
      transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, height + 24] }) }] }]} />
    if (weather === 'sandstorm') return <Animated.View key={i} style={[look2.piece, { left: -60, top: y, width: 26 + spread(i, 4) * 30, height: 2, borderRadius: 2,
      backgroundColor: 'rgba(240, 210, 150, 0.55)', transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, width + 120] }) }] }]} />
    if (weather === 'fog') return <Animated.View key={i} style={[look2.piece, { left: -width * 0.6, top: y - height * 0.12, width: width * 0.8, height: height * 0.24,
      borderRadius: height, backgroundColor: 'rgba(225, 220, 240, 0.22)',
      transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, width * 1.6] }) }] }]} />
    // Sun: broad, slanted beams that brighten and fade in turn.
    return <Animated.View key={i} style={[look2.piece, { left: (i / look.count) * width - width * 0.1, top: -height * 0.2, width: width * 0.12, height: height * 1.4,
      backgroundColor: 'rgba(255, 236, 170, 0.5)', opacity: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.35, 0] }), transform: [{ rotate: '-18deg' }] }]} />
  })
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: look.wash }]}>{pieces}</View>
}

const look2 = StyleSheet.create({ piece: { position: 'absolute' } })
