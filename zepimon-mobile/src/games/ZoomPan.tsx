import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { fonts } from '../ui'

// A camera over a board drawn once at full size (width x height): one finger pans, two pinch about the point between
// them, and the − / + / fit buttons do the same for a mouse or a screen reader. Taps still reach the board: a pan only
// starts once a finger has moved a few pixels. Zoom runs from `least` (the whole board in view) to `most`, starting at
// `start`; the board never leaves the frame, and centres when it is smaller than it. Reduced motion jumps instead of
// gliding on the buttons.
// focus is the board point (in board pixels) it first centres on. onCamera is handed the camera to move and read (and null
// when it goes); onUserMove runs whenever a finger moves it.
export type Camera = {
  centerOn: (x: number, y: number) => void,
  // What part of the board is in view, in board pixels, and the zoom.
  view: () => { left: number, top: number, width: number, height: number, zoom: number }
}
export function ZoomPan({ frame, width, height, start, least, most, reduced, focus, onCamera, onUserMove, children }: {
  frame: { width: number, height: number }, width: number, height: number, start: number, least: number, most: number, reduced: boolean,
  focus?: { x: number, y: number }, onCamera?: (camera: Camera | null) => void, onUserMove?: () => void, children: ReactNode
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
  // Starts at `start`, centred on `focus` (or the board's middle); again whenever the board or the frame changes size.
  const focusX = focus?.x ?? width / 2, focusY = focus?.y ?? height / 2
  useEffect(() => {
    const z = Math.min(most, Math.max(least, start))
    const at = clampTo(frame.width / 2 - focusX * z, frame.height / 2 - focusY * z, z)
    x.set(at.x); y.set(at.y); zoom.set(z)
  }, [frame.width, frame.height, width, height, start, least, most]) // eslint-disable-line react-hooks/exhaustive-deps

  // The game's handle: glide to centre a board point, or read what is in view.
  useEffect(() => {
    if (!onCamera) return
    onCamera({
      centerOn: (px, py) => {
        const z = zoom.get()
        const at = clampTo(frame.width / 2 - px * z, frame.height / 2 - py * z, z)
        x.set(reduced ? at.x : withTiming(at.x, { duration: 260 })); y.set(reduced ? at.y : withTiming(at.y, { duration: 260 }))
      },
      view: () => {
        const z = zoom.get()
        return { left: -x.get() / z, top: -y.get() / z, width: frame.width / z, height: frame.height / z, zoom: z }
      }
    })
    return () => onCamera(null)
  }, [onCamera, frame.width, frame.height, width, height, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  const gesture = useMemo(() => {
    const move = (cx: number, cy: number, z: number) => {
      'worklet'
      const at = clampTo(cx, cy, z)
      x.set(at.x); y.set(at.y); zoom.set(z)
    }
    const stop = () => {
      'worklet'
      cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom)
      if (onUserMove) scheduleOnRN(onUserMove)
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
  }, [frame.width, frame.height, width, height, least, most, onUserMove]) // eslint-disable-line react-hooks/exhaustive-deps

  // The buttons zoom about the middle of the frame.
  const step = (to: number) => {
    const z = Math.max(least, Math.min(most, to)), k = z / zoom.get()
    const at = clampTo(frame.width / 2 - (frame.width / 2 - x.get()) * k, frame.height / 2 - (frame.height / 2 - y.get()) * k, z)
    const glide = (value: typeof x, target: number) => value.set(reduced ? target : withTiming(target, { duration: 180 }))
    glide(x, at.x); glide(y, at.y); glide(zoom, z)
  }
  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }] }))
  // Nothing worth zooming on a board that already shows near its largest.
  const fits = most / least < 1.15

  return <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill}>
        <Reanimated.View style={[{ position: 'absolute', left: 0, top: 0, width, height, transformOrigin: 'left top' }, lens]}>{children}</Reanimated.View>
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
