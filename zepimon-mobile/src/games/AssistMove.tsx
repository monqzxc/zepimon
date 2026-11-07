import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native'
import { typeColors } from '../catalog'
import { fonts } from '../ui'
import { PixelSprite } from './TeamPicker'
import { OverworldSprite } from './OverworldSprite'
import { battleType } from './roster'
import { signatureMove } from './legendary-moves'

const native = Platform.OS !== 'web'
export const ASSIST_MOVE_MS = 2600
// Where the two beats meet: the cut-in closes and the Legendary is on the field.
const CUT = 0.38
const LINES = 7

// The Legendary's answer to your call, played over the board (it never blocks a tap), the way a field move plays in
// Pokemon Emerald. First the cut-in: a dark band opens across the board with speed lines streaking through it, the
// Legendary slides in and its move is called out ("Lugia used Aeroblast!"). Then the band snaps shut and the Legendary
// is there on the field, its overworld sprite landing near the top of the board; it powers up in a glow and fires,
// a flash of the move's type colour and a shockwave rolling out from where it stands as every foe is struck.
// With reduced motion: the Legendary standing on the field under a still banner and a soft tint.
export function AssistMove({ name, width, height, reduced, onDone }: { name: string, width: number, height: number, reduced: boolean, onDone: () => void }) {
  const colour = typeColors[battleType(name)] ?? '#F2C230'
  const [t] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const run = Animated.timing(t, { toValue: 1, duration: ASSIST_MOVE_MS, easing: Easing.linear, useNativeDriver: native })
    run.start(({ finished }) => { if (finished) onDone() })
    return () => run.stop()
  }, [t, onDone])
  const at = (points: number[], values: number[]) => t.interpolate({ inputRange: points, outputRange: values, extrapolate: 'clamp' })
  const banner = `${name} used ${signatureMove(name)}!`
  // Where the Legendary stands on the field: near the top, in the middle, above the foes' approach.
  const stand = Math.min(width, height) * 0.3
  const spot = { x: width / 2, y: height * 0.24 }

  if (reduced) return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colour, opacity: at([0, 0.1, 0.85, 1], [0, 0.2, 0.2, 0]) }]} />
    <Animated.View style={{ position: 'absolute', left: spot.x - stand / 2, top: spot.y - stand / 2, opacity: at([0, 0.08, 0.85, 1], [0, 1, 1, 0]) }}>
      <OverworldSprite name={name} size={stand} still />
    </Animated.View>
    <Animated.View style={[look.banner, { top: height * 0.55, borderColor: colour, opacity: at([0, 0.08, 0.85, 1], [0, 1, 1, 0]) }]}>
      <Text style={look.bannerText}>{banner}</Text>
    </Animated.View>
  </View>

  const band = Math.min(height * 0.34, width * 0.55)
  const portrait = band * 0.86
  const wave = Math.hypot(width, height) * 1.2
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessibilityLiveRegion="polite">
    {/* Beat 1: the cut-in. The band opens, speed lines streak through it, the Legendary slides in and calls its move. */}
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: height / 2 - band / 2, height: band, overflow: 'hidden',
      backgroundColor: '#0c0a1c', borderColor: colour, borderTopWidth: 3, borderBottomWidth: 3,
      transform: [{ scaleY: at([0, 0.06, CUT - 0.06, CUT], [0, 1, 1, 0]) }] }}>
      {Array.from({ length: LINES }, (_, i) => {
        const y = band * (0.1 + 0.8 * i / (LINES - 1))
        const long = width * (0.25 + 0.2 * ((i * 37) % 3))
        return <Animated.View key={i} style={{ position: 'absolute', top: y, left: 0, width: long, height: i % 2 ? 2 : 3, backgroundColor: i % 3 ? '#ffffff' : colour,
          opacity: 0.55, transform: [{ translateX: at([0, CUT], [width * (1 + (i % 3) * 0.2), -long * 1.5 - width * 0.4]) }] }} />
      })}
      <Animated.View style={{ position: 'absolute', top: (band - portrait) / 2, left: width * 0.08, width: portrait, height: portrait,
        transform: [{ translateX: at([0, 0.12, CUT], [width, 0, -width * 0.04]) }] }}>
        <View style={[look.glow, { width: portrait, height: portrait, borderRadius: portrait, backgroundColor: colour }]} />
        <PixelSprite name={name} size={portrait} />
      </Animated.View>
      <Animated.Text numberOfLines={2} style={[look.cutText, { left: width * 0.08 + portrait, right: 10, top: band / 2 - 26,
        opacity: at([0.1, 0.16], [0, 1]), transform: [{ translateX: at([0.1, 0.18], [width * 0.3, 0]) }] }]}>{banner}</Animated.Text>
    </Animated.View>
    {/* Beat 2: on the field. The Legendary lands near the top of the board, powers up and fires. */}
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#05030c', opacity: at([CUT - 0.02, CUT + 0.04, 0.88, 1], [0, 0.35, 0.35, 0]) }]} />
    <Animated.View style={{ position: 'absolute', left: spot.x - stand, top: spot.y - stand, width: stand * 2, height: stand * 2, borderRadius: stand * 2,
      backgroundColor: colour, opacity: at([CUT, CUT + 0.08, 0.6, 0.64, 0.9], [0, 0.25, 0.5, 0.15, 0]),
      transform: [{ scale: at([CUT, 0.6, 0.64], [0.4, 1.1, 0.8]) }] }} />
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colour, opacity: at([0.6, 0.63, 0.75], [0, 0.5, 0]) }]} />
    <Animated.View style={{ position: 'absolute', left: spot.x - wave / 2, top: spot.y - wave / 2, width: wave, height: wave, borderRadius: wave,
      borderWidth: Math.max(6, stand * 0.1), borderColor: colour, opacity: at([0.6, 0.62, 0.95], [0, 0.9, 0]),
      transform: [{ scale: at([0.6, 0.95], [0.04, 1]) }] }} />
    <Animated.View style={{ position: 'absolute', left: spot.x - stand / 2, top: spot.y - stand / 2, width: stand, height: stand,
      opacity: at([CUT, CUT + 0.03, 0.9, 1], [0, 1, 1, 0]),
      transform: [{ translateY: at([CUT, CUT + 0.07, CUT + 0.11, CUT + 0.14], [-stand * 0.5, 0, -stand * 0.12, 0]) }, { scale: at([0.56, 0.61, 0.66], [1, 1.2, 1]) }] }}>
      <View style={[look.shadow, { left: stand * 0.2, top: stand * 0.86, width: stand * 0.6, height: stand * 0.14, borderRadius: stand }]} />
      <OverworldSprite name={name} size={stand} />
    </Animated.View>
  </View>
}

const look = StyleSheet.create({
  glow: { position: 'absolute', opacity: 0.3 },
  shadow: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  cutText: { position: 'absolute', fontFamily: fonts.black, color: '#FFFFFF', fontSize: 18, lineHeight: 24 },
  banner: { position: 'absolute', left: 12, right: 12, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 2, borderColor: '#F2C230', backgroundColor: 'rgba(8, 6, 20, 0.86)' },
  bannerText: { fontFamily: fonts.black, color: '#FFFFFF', fontSize: 18, lineHeight: 24, textAlign: 'center' }
})
