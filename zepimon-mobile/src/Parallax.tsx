import { useEffect, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import Svg, { Ellipse, G, Path } from 'react-native-svg'
import { useReducedMotion } from './games/hooks'

// Emerald's 2.5D backdrop: layers over a banner's sky (its own background), each drifting sideways at its own speed so
// the scene has depth, like Hoenn seen from a cliff. far: clouds and a distant sea-blue ridge, slow. near: rolling ground,
// faster. Each layer is drawn twice side by side and slides one width before starting over, so the loop never shows a
// seam; its shapes repeat a whole number of times across the width. Shades are dark and translucent, so light text on
// the sky stays as readable as on the plain banner. With reduced motion the layers hold still.
const native = Platform.OS !== 'web'
type Layer = { duration: number, draw: (width: number, height: number) => React.ReactNode }

// A ridge rising `amp` above `base`, `waves` whole humps across the width, filled to the bottom.
function ridge(width: number, height: number, base: number, amp: number, waves: number, phase = 0): string {
  const steps = 48
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const x = (i / steps) * width
    const y = base - amp * (0.5 + 0.5 * Math.sin((2 * Math.PI * waves * i) / steps + phase))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M0,${height} L${points.join(' L')} L${width},${height} Z`
}

const layers: Layer[] = [
  { duration: 90000, draw: (width, height) => <>
    {[0.18, 0.52, 0.8].map((x, i) => <Ellipse key={i} cx={width * x} cy={height * (0.18 + 0.1 * (i % 2))} rx={width * 0.07} ry={height * 0.045}
      fill="rgba(255, 255, 255, 0.12)" />)}
    <Path d={ridge(width, height, height * 0.72, height * 0.14, 3, 1)} fill="rgba(6, 40, 70, 0.32)" />
  </> },
  { duration: 45000, draw: (width, height) => <Path d={ridge(width, height, height * 0.9, height * 0.1, 2)} fill="rgba(3, 40, 22, 0.4)" /> }
]

export function Parallax({ still = false }: { still?: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const reduced = useReducedMotion() || still
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}
    onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize({ width, height }) }}>
    {size.width > 0 && layers.map((layer, i) => <Drift key={i} layer={layer} width={size.width} height={size.height} reduced={reduced} />)}
  </View>
}

function Drift({ layer, width, height, reduced }: { layer: Layer, width: number, height: number, reduced: boolean }) {
  const [shift] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) { shift.setValue(0); return }
    const loop = Animated.loop(Animated.timing(shift, { toValue: 1, duration: layer.duration, easing: Easing.linear, useNativeDriver: native }))
    loop.start()
    return () => loop.stop()
  }, [reduced, shift, layer.duration])
  return <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: width * 2, height,
    transform: [{ translateX: shift.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] }}>
    <Svg width={width * 2} height={height}>
      {layer.draw(width, height)}
      <G x={width}>{layer.draw(width, height)}</G>
    </Svg>
  </Animated.View>
}
