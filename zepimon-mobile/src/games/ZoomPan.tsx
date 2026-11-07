import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { fonts } from '../ui'

// A camera over a board drawn once at full size (width x height): one finger pans, two pinch about the point between
// them, and the − / + / fit buttons do the same for a mouse or a screen reader. Taps still reach the board: a pan only
// starts once a finger has moved a few pixels. Zoom runs from `least` (the whole board in view) to `most`, starting at
// `start`; the board never leaves the frame, and centres when it is smaller than it. Reduced motion jumps instead of
// gliding on the buttons.
export function ZoomPan({ frame, width, height, start, least, most, reduced, children }: {
  frame: { width: number, height: number }, width: number, height: number, start: number, least: number, most: number, reduced: boolean,
  children: ReactNode
}) {
  const x = useSharedValue(0), y = useSharedValue(0), zoom = useSharedValue(start)
  // Keeps the board's top-left corner where the board covers the frame, or centred along an axis it does not fill.
  const clampTo = (cx: number, cy: number, z: number) => {
    'worklet'
    const w = width * z, h = height * z
    const nx = w <= frame.width ? (frame.width - w) / 2 : Math.min(0, Math.max(frame.width - w, cx))
    const ny = h <= frame.height ? (frame.height - h) / 2 : Math.min(0, Math.max(frame.height - h, cy))
    return { x: nx, y: ny }
  }
  // Starts centred on the board at `start`; again whenever the board or the frame changes size.
  useEffect(() => {
    const z = Math.min(most, Math.max(least, start))
    const at = clampTo((frame.width - width * z) / 2, (frame.height - height * z) / 2, z)
    x.set(at.x); y.set(at.y); zoom.set(z)
  }, [frame.width, frame.height, width, height, start, least, most]) // eslint-disable-line react-hooks/exhaustive-deps

  const gesture = useMemo(() => {
    const move = (cx: number, cy: number, z: number) => {
      'worklet'
      const at = clampTo(cx, cy, z)
      x.set(at.x); y.set(at.y); zoom.set(z)
    }
    const stop = () => {
      'worklet'
      cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom)
    }
    const pan = Gesture.Pan().minDistance(8).averageTouches(true)
      .onStart(stop)
      .onChange(event => { move(x.get() + event.changeX, y.get() + event.changeY, zoom.get()) })
    const pinch = Gesture.Pinch()
      .onStart(stop)
      .onChange(event => {
        const z = Math.max(least, Math.min(most, zoom.get() * event.scaleChange)), k = z / zoom.get()
        move(event.focalX - (event.focalX - x.get()) * k, event.focalY - (event.focalY - y.get()) * k, z)
      })
    return Gesture.Simultaneous(pan, pinch)
  }, [frame.width, frame.height, width, height, least, most]) // eslint-disable-line react-hooks/exhaustive-deps

  // The buttons zoom about the middle of the frame.
  const step = (to: number) => {
    const z = Math.max(least, Math.min(most, to)), k = z / zoom.get()
    const at = clampTo(frame.width / 2 - (frame.width / 2 - x.get()) * k, frame.height / 2 - (frame.height / 2 - y.get()) * k, z)
    const glide = (value: typeof x, target: number) => value.set(reduced ? target : withTiming(target, { duration: 180 }))
    glide(x, at.x); glide(y, at.y); glide(zoom, z)
  }
  const camera = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }] }))
  // Nothing worth zooming on a board that already shows near its largest.
  const fits = most / least < 1.15

  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill}>
        <Reanimated.View style={[{ position: 'absolute', left: 0, top: 0, width, height, transformOrigin: 'left top' }, camera]}>{children}</Reanimated.View>
      </View>
    </GestureDetector>
    {!fits && <View style={look.controls}>
      <Zoom label="Zoom out" text="−" onPress={() => step(zoom.get() / 1.35)} />
      <Zoom label="Zoom in" text="+" onPress={() => step(zoom.get() * 1.35)} />
      <Zoom label="Show the whole map" text="⤢" onPress={() => step(least)} />
    </View>}
  </View>
}

function Zoom({ label, text, onPress }: { label: string, text: string, onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress}
    style={({ pressed }) => [look.button, { opacity: pressed ? 0.7 : 1 }]}>
    <Text style={look.buttonText}>{text}</Text>
  </Pressable>
}

const look = StyleSheet.create({
  controls: { position: 'absolute', right: 8, bottom: 8, gap: 6 },
  button: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8, 14, 24, 0.72)',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' },
  buttonText: { color: '#FFFFFF', fontSize: 20, lineHeight: 24, fontFamily: fonts.black }
})
