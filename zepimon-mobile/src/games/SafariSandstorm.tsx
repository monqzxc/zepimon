import { memo, useEffect, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

const native = Platform.OS !== 'web'
const SAND = '#c99a58'
// How thick the storm is beyond the clear circle (0-1), and how far the clear circle's edge fades, in tiles.
const THICK = 0.88, FADE = 0.7
// The clear circle around the trainer, as a radius in tiles from the middle of their tile. Goggles clear the trainer's
// tile and the eight around it; during an encounter it opens wider so the Pokemon you're facing (up to two tiles
// away) stays in sight. Without goggles you can barely see yourself.
export const AURA = { goggles: 1.5, encounter: 2.6, none: 0.45 }
// The blowing sand: STREAKS pieces on two clocks, a fast gust and a slower drift, looping forever.
const STREAKS = 54, GUST_MS = 850, DRIFT_MS = 1500
const spread = (i: number, salt: number) => { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v) }

// The sandstorm over the view while the trainer is in the desert, fixed to the screen (the trainer is always in the
// middle). A thick sand wash covers everything but a soft-edged clear circle `aura` tiles round the trainer, and streaks
// of sand blow across, fading out where they cross the clear circle so it stays clear. Reduced motion: the wash alone.
export const Sandstorm = memo(function Sandstorm({ width, height, tile, aura, reduced }: {
  width: number, height: number, tile: number, aura: number, reduced: boolean
}) {
  const [gust] = useState(() => new Animated.Value(0))
  const [drift] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) return
    const loops = [[gust, GUST_MS], [drift, DRIFT_MS]].map(([clock, duration]) =>
      Animated.loop(Animated.timing(clock as Animated.Value, { toValue: 1, duration: duration as number, easing: Easing.linear, useNativeDriver: native })))
    loops.forEach(loop => loop.start())
    return () => loops.forEach(loop => loop.stop())
  }, [gust, drift, reduced])
  const cx = width / 2, cy = height / 2
  const reach = Math.hypot(cx, cy) + tile
  const clear = aura * tile, edge = (aura + FADE) * tile
  const streaks = reduced ? [] : Array.from({ length: STREAKS }, (_, i) => {
    const fast = i % 3 !== 0
    const length = tile * (fast ? 0.6 + spread(i, 4) * 0.9 : 1.2 + spread(i, 4) * 1.4)
    const y = spread(i, 3) * height, travel = width + length * 2
    const p = Animated.modulo(Animated.add(fast ? gust : drift, spread(i, 1)), 1)
    // Where (in its cycle) this streak overlaps the clear circle's chord at its height, if it crosses it at all.
    const radius = (aura + FADE / 2) * tile, dy = Math.abs(y - cy)
    const half = dy < radius ? Math.sqrt(radius * radius - dy * dy) : 0
    const enter = (cx - half) / travel, leave = (cx + half + length) / travel
    const opacity = half > 0 ? p.interpolate({ inputRange: [0, Math.max(0, enter - 0.03), Math.max(0, enter), Math.min(1, leave), Math.min(1, leave + 0.03), 1],
      outputRange: [1, 1, 0, 0, 1, 1], extrapolate: 'clamp' }) : 1
    return <Animated.View key={i} style={{ position: 'absolute', left: -length, top: y, width: length, height: fast ? 2 : 3, borderRadius: 2,
      backgroundColor: fast ? 'rgba(252, 228, 176, 0.75)' : 'rgba(236, 200, 140, 0.6)', opacity,
      transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }, { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, tile * 0.6] }) }] }} />
  })
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="sandstorm-aura" cx={cx} cy={cy} r={reach} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={SAND} stopOpacity={0} />
          <Stop offset={clear / reach} stopColor={SAND} stopOpacity={0} />
          <Stop offset={edge / reach} stopColor={SAND} stopOpacity={THICK} />
          <Stop offset={1} stopColor={SAND} stopOpacity={Math.min(1, THICK + 0.06)} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#sandstorm-aura)" />
    </Svg>
    {streaks}
  </View>
})
