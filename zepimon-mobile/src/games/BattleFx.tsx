import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import { typeColors } from '../catalog'
import { fonts } from '../ui'
import { EVOLVE_MS } from './battle'

// Trail Defense's bigger moments, each a native animation that starts when it happens, so it plays smoothly between
// the game's 100 ms steps: an evolution, and the impact of a move on a foe.
const native = Platform.OS !== 'web'

function useRun(duration: number) {
  const [t] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const run = Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [t, duration])
  return (points: number[], values: number[]) => t.interpolate({ inputRange: points, outputRange: values, extrapolate: 'clamp' })
}

// Show times for the two forms' white silhouettes, swapping faster and faster as in the games: old, new, old, new...
const SWAPS = [0, 0.2, 0.33, 0.43, 0.51, 0.57, 0.62, 0.66, 0.69, 0.72, 0.745, 0.765, 0.78]
const SPARKLES = 8

// An evolution over 1.5 s (EVOLVE_MS), drawn in place of the Pokemon (draw(form, white) draws a form, white as a
// silhouette): a white glow builds while the old and new forms flash in turn, faster and faster, with sparkles rising
// around them; a burst of light, and the new form stands there in colour with its name popping above. Reduced motion:
// the new form in a soft glow that fades, nothing flashing.
export function EvolveFx({ to, size, reduced, draw }: { to: string, size: number, reduced: boolean, draw: (form: 'from' | 'to', white: boolean) => ReactNode }) {
  const at = useRun(EVOLVE_MS)
  if (reduced) return <View style={{ width: size, height: size }}>
    <Animated.View style={[look.glow, { width: size, height: size, borderRadius: size, opacity: at([0, 0.2, 1], [0, 0.6, 0]) }]} />
    {draw('to', false)}
  </View>
  // Opacity of one form's silhouette: on in its own turns, off in the other's.
  const turns = (mine: 0 | 1) => {
    const points: number[] = [], values: number[] = []
    SWAPS.forEach((start, i) => { points.push(start, start + 0.004); values.push(i % 2 === mine ? 0 : 1, i % 2 === mine ? 1 : 0) })
    points.push(0.8, 0.84); values.push(mine ? 1 : 0, 0)
    return at(points, values)
  }
  return <View style={{ width: size, height: size }}>
    <Animated.View style={[look.glow, { width: size * 1.3, height: size * 1.3, borderRadius: size, left: -size * 0.15, top: -size * 0.15,
      opacity: at([0, 0.15, 0.78, 0.84, 1], [0, 0.55, 0.85, 1, 0]), transform: [{ scale: at([0, 0.78, 0.86, 1], [0.6, 1.05, 1.4, 1]) }] }]} />
    {Array.from({ length: SPARKLES }, (_, i) => {
      const angle = (i / SPARKLES) * Math.PI * 2, r = size * (0.42 + 0.12 * (i % 2))
      const start = 0.05 + (i % 4) * 0.12
      return <Animated.Text key={i} style={[look.sparkle, { left: size / 2 + Math.cos(angle) * r - 6, top: size / 2 + Math.sin(angle) * r - 9,
        fontSize: i % 2 ? 11 : 15, opacity: at([start, start + 0.06, start + 0.2, start + 0.26, 0.86, 0.95], [0, 1, 0.3, 1, 1, 0]),
        transform: [{ translateY: at([0, 1], [0, -size * 0.25]) }, { scale: at([start, start + 0.08, 0.84, 0.9], [0.4, 1, 1, 1.5]) }] }]}>✦</Animated.Text>
    })}
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: turns(0) }]}>{draw('from', true)}</Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: turns(1) }]}>{draw('to', true)}</Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: at([0.8, 0.84, 1], [0, 1, 1]) }]}>{draw('to', false)}</Animated.View>
    <Animated.View style={[look.burst, { width: size, height: size, borderRadius: size, opacity: at([0.8, 0.83, 1], [0, 0.95, 0]),
      transform: [{ scale: at([0.8, 1], [0.3, 1.9]) }] }]} />
    <Animated.Text style={[look.name, { width: size * 4, left: -size * 1.5, top: -size * 0.36, fontSize: Math.max(11, size * 0.26),
      opacity: at([0.82, 0.86, 0.97, 1], [0, 1, 1, 0]), transform: [{ translateY: at([0.82, 1], [0, -size * 0.2]) }] }]}>{to}!</Animated.Text>
  </View>
}

const SPARKS = 6
// A move landing on a foe, in the move's type colour: a white flash, a ring swelling out and sparks flying off, over
// the battle-animation strip (src/games/MoveFx.tsx). `small` is a splash or chain catching a foe beside the target.
// Drawn around its anchor (a 0 x 0 Mover), like the strips. Reduced motion: only a faint ring, no sparks.
export function Impact({ move, cell, small, reduced }: { move: string, cell: number, small: boolean, reduced: boolean }) {
  const at = useRun(small ? 340 : 440)
  const colour = typeColors[move] ?? '#ffffff'
  const r = cell * (small ? 0.32 : 0.45)
  if (reduced) return <Animated.View pointerEvents="none" style={[look.ring, { left: -r, top: -r, width: r * 2, height: r * 2, borderRadius: r,
    borderColor: colour, opacity: at([0, 1], [0.7, 0]) }]} />
  return <View pointerEvents="none">
    <Animated.View style={[look.flash, { left: -r * 0.7, top: -r * 0.7, width: r * 1.4, height: r * 1.4, borderRadius: r,
      opacity: at([0, 0.35], [0.95, 0]), transform: [{ scale: at([0, 0.35], [0.4, 1.1]) }] }]} />
    <Animated.View style={[look.ring, { left: -r, top: -r, width: r * 2, height: r * 2, borderRadius: r, borderColor: colour,
      borderWidth: Math.max(2, cell * 0.06), opacity: at([0, 0.15, 1], [0, 1, 0]), transform: [{ scale: at([0, 1], [0.35, 1.25]) }] }]} />
    {Array.from({ length: small ? 4 : SPARKS }, (_, i) => {
      const angle = (i / (small ? 4 : SPARKS)) * 360 + 15
      return <Animated.View key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: at([0, 0.1, 0.8, 1], [0, 1, 1, 0]),
        transform: [{ rotate: `${angle}deg` }, { translateX: at([0, 1], [r * 0.3, r * 1.25]) }] }}>
        <View style={{ position: 'absolute', left: 0, top: -Math.max(1.5, cell * 0.025), width: r * 0.42, height: Math.max(3, cell * 0.05),
          borderRadius: cell, backgroundColor: i % 2 ? '#ffffff' : colour }} />
      </Animated.View>
    })}
  </View>
}

const look = StyleSheet.create({
  glow: { position: 'absolute', backgroundColor: '#ffffff', shadowColor: '#ffffff', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  burst: { position: 'absolute', left: 0, top: 0, borderWidth: 4, borderColor: '#FFE58A', backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  sparkle: { position: 'absolute', color: '#FFF4B8', fontFamily: fonts.black, textShadowColor: 'rgba(255, 210, 90, 0.9)', textShadowRadius: 4 },
  name: { position: 'absolute', textAlign: 'center', fontFamily: fonts.black, color: '#FFE58A', textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 } },
  flash: { position: 'absolute', backgroundColor: '#ffffff' },
  ring: { position: 'absolute', borderWidth: 2 }
})
