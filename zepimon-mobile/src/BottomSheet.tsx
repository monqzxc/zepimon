import { useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import type { PanResponderGestureState } from 'react-native'
import { useReducedMotion } from './games/hooks'
import { colors, shadows, themedStyles } from './ui'

// A sheet over a backdrop that stays usable, like a map: the sheet rests with its top at low, leaving everything above
// it uncovered and touchable, and drags or flicks up to high, where its content scrolls. Pulling down while the content
// is at its top brings the sheet back down. The grabber toggles it for taps and screen readers, and a screen reader
// opens it straight away, since content below the screen's edge cannot be reached while it rests. low and high are
// distances from the top of the screen.
const native = Platform.OS !== 'web'
const RADIUS = 32

export function BottomSheet({ low, high, children }: PropsWithChildren<{ low: number, high: number }>) {
  const { height } = useWindowDimensions()
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [y] = useState(() => new Animated.Value(low))
  const scroll = useRef<ScrollView>(null)
  // What the gesture handlers read: they are made once, so they see the latest values through here.
  const state = useRef({ open: false, low, high, reduced, start: low, scrollTop: 0 })

  function settle(toOpen: boolean, velocity = 0) {
    const { low, high, reduced } = state.current
    state.current.open = toOpen
    setOpen(toOpen)
    if (!toOpen) scroll.current?.scrollTo({ y: 0, animated: false })
    const toValue = toOpen ? high : low
    if (reduced) y.setValue(toValue)
    else Animated.spring(y, { toValue, velocity, bounciness: 0, speed: 16, useNativeDriver: native }).start()
  }
  const release = (gesture: PanResponderGestureState) => {
    const { start, low, high } = state.current
    settle(gesture.vy < -0.5 || (gesture.vy < 0.5 && start + gesture.dy < (low + high) / 2), gesture.vy)
  }
  // The handlers read the refs only while a finger moves, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => PanResponder.create({
    // A mostly vertical drag moves the sheet while it rests, or while open only to pull it down from the content's top.
    onMoveShouldSetPanResponderCapture: (_, { dx, dy }) => Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2
      && (!state.current.open || (state.current.scrollTop <= 0 && dy > 0)),
    onPanResponderGrant: () => {
      y.stopAnimation()
      state.current.start = state.current.open ? state.current.high : state.current.low
    },
    onPanResponderMove: (_, { dy }) => {
      const { start, low, high } = state.current
      y.setValue(Math.min(low, Math.max(high, start + dy)))
    },
    onPanResponderRelease: (_, gesture) => release(gesture),
    onPanResponderTerminate: (_, gesture) => release(gesture),
    onPanResponderTerminationRequest: () => false
  }))

  // A new size (the phone turned) moves the resting places.
  useEffect(() => {
    Object.assign(state.current, { low, high, reduced })
    y.setValue(state.current.open ? high : low)
  }, [low, high, reduced, y])
  useEffect(() => {
    // The web always reports a screen reader, so it is asked only on phones.
    if (!native) return
    let mounted = true
    AccessibilityInfo.isScreenReaderEnabled().then(on => { if (mounted && on && !state.current.open) settle(true) }).catch(() => {})
    return () => { mounted = false }
    // Checked once, when the sheet opens; settle only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Animated.View {...responder.panHandlers} style={[sheet.body, { height: height - high, transform: [{ translateY: y }] }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Show the map' : 'Show all details'} hitSlop={8}
      onPress={() => settle(!open)} style={sheet.grab}>
      <View style={sheet.grabber} />
    </Pressable>
    <ScrollView ref={scroll} style={{ flex: 1 }} scrollEnabled={open} bounces={false} overScrollMode="never"
      showsVerticalScrollIndicator={false} scrollEventThrottle={16}
      onScroll={event => { state.current.scrollTop = event.nativeEvent.contentOffset.y }}>
      {children}
    </ScrollView>
  </Animated.View>
}

const sheet = themedStyles(() => ({
  body: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.panel, borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS, userSelect: 'none', ...shadows.card },
  grab: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line }
}))
