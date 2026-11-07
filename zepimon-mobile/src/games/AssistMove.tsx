import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native'
import { typeColors } from '../catalog'
import { fonts } from '../ui'
import { PixelSprite } from './TeamPicker'
import { battleType } from './roster'
import { signatureMove } from './legendary-moves'

const native = Platform.OS !== 'web'
export const ASSIST_MOVE_MS = 2100
const RAYS = 12

// The Legendary's answer to your call, played over the board (it never blocks a tap): the field dims and flashes in the
// move's type colour, the Legendary rises from below in a burst of turning light rays, its move is called out in a
// banner ("Lugia used Aeroblast!"), and a shockwave rolls out across the field as every foe is struck. With reduced
// motion it is a still banner over a soft tint, for the same moment.
export function AssistMove({ name, width, height, reduced, onDone }: { name: string, width: number, height: number, reduced: boolean, onDone: () => void }) {
  const colour = typeColors[battleType(name)] ?? '#F2C230'
  const [t] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const run = Animated.timing(t, { toValue: 1, duration: ASSIST_MOVE_MS, easing: Easing.linear, useNativeDriver: native })
    run.start(({ finished }) => { if (finished) onDone() })
    return () => run.stop()
  }, [t, onDone])
  const at = (points: number[], values: number[]) => t.interpolate({ inputRange: points, outputRange: values, extrapolate: 'clamp' })
  const size = Math.min(width, height) * 0.46
  const banner = `${name} used ${signatureMove(name)}!`

  if (reduced) return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colour, opacity: at([0, 0.1, 0.85, 1], [0, 0.22, 0.22, 0]) }]} />
    <Animated.View style={[look.banner, { top: height * 0.4, opacity: at([0, 0.08, 0.85, 1], [0, 1, 1, 0]) }]}>
      <Text style={look.bannerText}>{banner}</Text>
    </Animated.View>
  </View>

  const ray = Math.hypot(width, height) * 0.6
  const centre = { x: width / 2, y: height * 0.42 }
  const wave = Math.hypot(width, height)
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessibilityLiveRegion="polite">
    {/* The field dims, then a flash of the move's colour as it lands. */}
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#05030c', opacity: at([0, 0.12, 0.8, 1], [0, 0.6, 0.6, 0]) }]} />
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colour, opacity: at([0, 0.42, 0.47, 0.62], [0, 0, 0.55, 0]) }]} />
    {/* Light rays turning slowly behind the Legendary. */}
    <Animated.View style={{ position: 'absolute', left: centre.x - ray, top: centre.y - ray, width: ray * 2, height: ray * 2,
      opacity: at([0, 0.15, 0.75, 0.95], [0, 0.85, 0.85, 0]), transform: [{ rotate: at([0, 1], [0, 40]).interpolate({ inputRange: [0, 40], outputRange: ['0deg', '40deg'] }) }] }}>
      {Array.from({ length: RAYS }, (_, i) => <View key={i} style={{ position: 'absolute', left: ray - size * 0.07, top: 0, width: size * 0.14, height: ray,
        backgroundColor: colour, opacity: i % 2 ? 0.22 : 0.4, borderBottomLeftRadius: size, borderBottomRightRadius: size,
        transform: [{ translateY: ray / 2 }, { rotate: `${(360 / RAYS) * i}deg` }, { translateY: -ray / 2 }] }} />)}
    </Animated.View>
    {/* The shockwave rolls out from the Legendary as the move lands. */}
    <Animated.View style={{ position: 'absolute', left: centre.x - wave / 2, top: centre.y - wave / 2, width: wave, height: wave, borderRadius: wave,
      borderWidth: Math.max(6, size * 0.08), borderColor: colour, opacity: at([0, 0.45, 0.5, 0.85], [0, 0, 0.9, 0]),
      transform: [{ scale: at([0, 0.45, 0.85], [0.05, 0.05, 1.1]) }] }} />
    {/* The Legendary rises in, swells as it strikes, and lifts away. */}
    <Animated.View style={{ position: 'absolute', left: centre.x - size / 2, top: centre.y - size / 2, width: size, height: size,
      opacity: at([0, 0.1, 0.8, 0.95], [0, 1, 1, 0]),
      transform: [{ translateY: at([0, 0.2, 0.8, 1], [height * 0.5, 0, 0, -height * 0.25]) }, { scale: at([0, 0.2, 0.45, 0.52, 0.8], [0.6, 1, 1, 1.18, 1]) }] }}>
      <View style={[look.halo, { width: size * 1.2, height: size * 1.2, borderRadius: size, left: -size * 0.1, top: -size * 0.1, backgroundColor: colour }]} />
      <PixelSprite name={name} size={size} />
    </Animated.View>
    <Animated.View style={[look.banner, { top: height * 0.72, opacity: at([0, 0.18, 0.26, 0.85, 1], [0, 0, 1, 1, 0]),
      transform: [{ translateX: at([0.18, 0.28], [-width * 0.3, 0]) }], borderColor: colour }]}>
      <Text style={look.bannerText}>{banner}</Text>
    </Animated.View>
  </View>
}

const look = StyleSheet.create({
  halo: { position: 'absolute', opacity: 0.35 },
  banner: { position: 'absolute', left: 12, right: 12, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 2, borderColor: '#F2C230', backgroundColor: 'rgba(8, 6, 20, 0.86)' },
  bannerText: { fontFamily: fonts.black, color: '#FFFFFF', fontSize: 18, lineHeight: 24, textAlign: 'center' }
})
