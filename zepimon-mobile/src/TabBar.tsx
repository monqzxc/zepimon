import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native'
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { BottomTabBarProps } from 'expo-router/tabs'
import { useReducedMotion } from './games/hooks'
import { colors, fonts, gradient } from './ui'

// A floating glass tab bar. The middle tab (Adventure) is a violet Poke Ball sitting in a notch cut into the bar.
// The open tab shows in a deep violet with a heavier label, and a Gengar peeks over the bar's top edge above it: the
// head is drawn behind the bar and the paws in front. That art (scripts/build-nav-gengar.mjs) sits on a 120 x 100 grid
// whose row 72 meets the edge. Gengar bobs and blinks while idle, ducks behind the bar when you switch tabs and pops up
// wide-eyed on the new one, and the labels change over as it passes. Tapping the ball spins it and Gengar pops out of
// it, floating and smiling until you leave the tab, when it goes back in. Tapping an open tab makes Gengar peek or
// twirl. With reduced motion everything holds still and jumps.
const art: Record<'grin' | 'blink' | 'boo' | 'paws' | 'float' | 'floatBlink', ImageSourcePropType> = {
  grin: require('../assets/nav/body-grin.png'), blink: require('../assets/nav/body-blink.png'),
  boo: require('../assets/nav/body-boo.png'), paws: require('../assets/nav/paws.png'),
  float: require('../assets/nav/float-smile.png'), floatBlink: require('../assets/nav/float-blink.png')
}
// On the bar's darkest tint labels keep 4.5:1 when inactive and 7.8:1 when open.
const tint = { inactive: '#6B5F8E', active: '#4527A8', mark: '#8A6FD0' }
// Page content fades into the page color just above the bar instead of ending on a hard edge.
const FADE_GRADIENT = `linear-gradient(180deg, ${colors.bg}00 0%, ${colors.bg} 100%)`
const BAR = 66
const INSET = 6          // between the bar's edge and its tabs
const ROW = BAR - 2 * INSET
const HEADROOM = 18      // the head's clip box reaches this far above the art, so bobbing never cuts the ears
const CLIP_BELOW = 10    // and this far below the bar's top edge, where the bar still covers it
const BUTTON = 62        // the Poke Ball in the middle
const BUTTON_Y = 6       // its center sits this far below the bar's top edge
const NOTCH = BUTTON / 2 + 6   // the notch leaves a 6-point ring of page around the ball
const SHOULDER = 10      // and curves into the top edge over this distance
const MEET = Math.sqrt(NOTCH ** 2 - BUTTON_Y ** 2)   // where the notch's circle crosses the top edge
const CENTER_SLOT = Math.ceil(2 * (MEET + SHOULDER))  // the middle tab's share of the row: the whole notch
const TOP_ROOM = BUTTON / 2 - BUTTON_Y + 2            // space above the bar, so the whole ball is tappable
const FLOAT = 70         // the floating Gengar, drawn a little above the ball's center
const FLOAT_Y = -8
const useNativeDriver = Platform.OS !== 'web'

// Ducks behind the bar, waits, then springs back up with a surprised face and two alert marks.
function peek(duck: Animated.Value, boo: Animated.Value, wait: number) {
  Animated.sequence([
    Animated.timing(duck, { toValue: 1, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver }),
    Animated.delay(wait),
    Animated.spring(duck, { toValue: 0, stiffness: 220, damping: 16, mass: 1, useNativeDriver })
  ]).start()
  Animated.sequence([
    Animated.delay(180 + wait),
    Animated.timing(boo, { toValue: 1, duration: 80, useNativeDriver }),
    Animated.delay(750),
    Animated.timing(boo, { toValue: 0, duration: 160, useNativeDriver })
  ]).start()
}

// The bar's outline: a stadium whose top edge dips around the middle ball with rounded shoulders.
function outline(width: number, notched: boolean) {
  const t = 0.75, r = BAR / 2 - t, cx = width / 2
  const ends = `L${width - BAR / 2} ${t} A${r} ${r} 0 0 1 ${width - BAR / 2} ${BAR - t} L${BAR / 2} ${BAR - t} A${r} ${r} 0 0 1 ${BAR / 2} ${t} Z`
  if (!notched) return `M${BAR / 2} ${t} ${ends}`
  // The shoulder joins the notch's circle a little below the top edge, along the circle's tangent there.
  const angle = Math.acos(-BUTTON_Y / NOTCH) - 0.35
  const jx = cx - NOTCH * Math.sin(angle), jy = BUTTON_Y + NOTCH * Math.cos(angle)
  const hx = jx - 7 * Math.cos(angle), hy = jy - 7 * Math.sin(angle)
  const start = cx - MEET - SHOULDER
  return `M${BAR / 2} ${t} L${start} ${t} C${start + 6} ${t} ${hx} ${hy} ${jx} ${jy} A${NOTCH} ${NOTCH} 0 0 0 ${2 * cx - jx} ${jy} ` +
    `C${2 * cx - hx} ${hy} ${2 * cx - start - 6} ${t} ${2 * cx - start} ${t} ${ends}`
}

// How far the bar's top edge sits below its straight part at x: it curves down into the rounded ends.
function edgeDrop(x: number, width: number) {
  const r = BAR / 2
  const d = x < r ? r - x : x > width - r ? x - (width - r) : 0
  return d ? r - Math.sqrt(Math.max(0, r * r - d * d)) : 0
}

// A violet take on the Cherish Ball: a dark band with a bright stripe and a ringed button. The band and button turn
// with the ball; the shading and shine stay put, as if lit from the top left.
function PokeBall({ size, roll }: { size: number, roll: Animated.Value }) {
  const ink = '#2E1A4A'
  return <View style={{ width: size, height: size }}>
    <Animated.View style={{ position: 'absolute', width: size, height: size,
      transform: [{ rotate: roll.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><ClipPath id="zepimon-ball"><Circle cx="50" cy="50" r="47" /></ClipPath></Defs>
        <Circle cx="50" cy="50" r="47" fill="#8A5CDB" />
        <G clipPath="url(#zepimon-ball)">
          <Rect x="0" y="40.5" width="100" height="19" fill={ink} />
          <Rect x="0" y="47.5" width="100" height="5" fill="#9E72EC" />
        </G>
        <Circle cx="50" cy="50" r="16.5" fill={ink} />
        <Circle cx="50" cy="50" r="12.5" fill="#8A5CDB" stroke={ink} strokeWidth="1.5" />
        <Circle cx="50" cy="50" r="8" fill="#A47EEE" stroke={ink} strokeWidth="1.5" />
        <Circle cx="50" cy="50" r="4" fill="#C2A4F6" stroke={ink} strokeWidth="1.2" />
      </Svg>
    </Animated.View>
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id="zepimon-ball-light" cx="0.38" cy="0.32" r="0.75">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.3" />
        <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        <Stop offset="1" stopColor="#1A0B33" stopOpacity="0.55" />
      </RadialGradient></Defs>
      <Circle cx="50" cy="50" r="47" fill="url(#zepimon-ball-light)" />
      <Ellipse cx="33" cy="24" rx="13" ry="6.5" fill="#FFFFFF" opacity="0.55" transform="rotate(-35 33 24)" />
      <Ellipse cx="22.5" cy="37" rx="3" ry="2" fill="#FFFFFF" opacity="0.4" transform="rotate(-60 22.5 37)" />
      <Circle cx="50" cy="50" r="47" fill="none" stroke="#2A1745" strokeWidth="1.5" />
    </Svg>
  </View>
}

function useKeyboardShown(enabled: boolean) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const ios = Platform.OS === 'ios'
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true))
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false))
    return () => { show.remove(); hide.remove(); setShown(false) }
  }, [enabled])
  return enabled && shown
}

function TabFace({ icon, label, active, width }: { icon: React.ReactNode, label: string, active: boolean, width: number }) {
  return <View style={[styles.face, { width }]}>
    <View style={active && { transform: [{ scale: 1.12 }] }}>{icon}</View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.2}
      style={[styles.label, active && styles.activeLabel, { maxWidth: width - 8 }]}>{label}</Text>
  </View>
}

export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [width, setWidth] = useState(0)
  const [x] = useState(() => new Animated.Value(0))
  const [duck] = useState(() => new Animated.Value(1))
  const [bob] = useState(() => new Animated.Value(0))
  const [blink] = useState(() => new Animated.Value(0))
  const [boo] = useState(() => new Animated.Value(0))
  const [center] = useState(() => new Animated.Value(0))   // 1 while the middle tab is open
  const [twirl] = useState(() => new Animated.Value(0))
  const [roll] = useState(() => new Animated.Value(0))     // the ball's spin, two turns from 0 to 1
  const placed = useRef<{ index: number, width: number } | null>(null)
  const reduced = useReducedMotion()
  const focusedOptions = descriptors[state.routes[state.index].key].options
  const keyboard = useKeyboardShown(!!focusedOptions.tabBarHideOnKeyboard)
  // A screen hides the bar the usual React Navigation way, with tabBarStyle: { display: 'none' } (full-screen battles).
  const barHidden = keyboard || StyleSheet.flatten(focusedOptions.tabBarStyle as StyleProp<ViewStyle>)?.display === 'none'
  const count = state.routes.length
  // With an odd number of tabs the middle one is the ball; otherwise every tab is a plain slot.
  const middle = count % 2 ? (count - 1) / 2 : -1
  const rowWidth = width - 2 * INSET
  // At least 1 even before the bar is measured, so the tab positions the animations interpolate between stay in order.
  const side = Math.max(1, middle < 0 ? rowWidth / count : (rowWidth - CENTER_SLOT) / (count - 1))
  const slotLeft = (index: number) => middle < 0 || index <= middle ? index * side : middle * side + CENTER_SLOT + (index - middle - 1) * side
  const sides = state.routes.map((_, index) => index).filter(index => index !== middle)

  // Idle: a slow bob with a head tilt, and a blink now and then (every third one doubled).
  useEffect(() => {
    if (reduced) { bob.setValue(0); blink.setValue(0); return }
    const ease = Easing.inOut(Easing.sin)
    const shut = (wait: number) => [Animated.delay(wait), Animated.timing(blink, { toValue: 1, duration: 60, useNativeDriver }),
      Animated.delay(90), Animated.timing(blink, { toValue: 0, duration: 80, useNativeDriver })]
    const loops = [
      Animated.loop(Animated.sequence([Animated.timing(bob, { toValue: 1, duration: 1400, easing: ease, useNativeDriver }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: ease, useNativeDriver })])),
      Animated.loop(Animated.sequence([...shut(2800), ...shut(3600), ...shut(160)]))
    ]
    loops.forEach(loop => loop.start())
    return () => loops.forEach(loop => loop.stop())
  }, [reduced, bob, blink])

  // Move to the focused tab. Side to side, Gengar slides along the bar and peeks up on arrival. Onto the middle tab it
  // ducks, the ball finishes its spin and Gengar pops out of it; back off it, Gengar returns and the ball spins back.
  // The first layout lets Gengar say hello; a resize just snaps.
  useEffect(() => {
    if (!width) return
    const onMiddle = state.index === middle
    const target = slotLeft(state.index)
    const last = placed.current
    placed.current = { index: state.index, width }
    if (reduced) { if (!onMiddle) x.setValue(target); center.setValue(onMiddle ? 1 : 0); duck.setValue(onMiddle ? 1 : 0); boo.setValue(0); return }
    if (!last || last.width !== width) {
      if (!onMiddle) x.setValue(target)
      if (last) { center.setValue(onMiddle ? 1 : 0); return }
      if (onMiddle) Animated.spring(center, { toValue: 1, stiffness: 160, damping: 12, useNativeDriver }).start()
      else peek(duck, boo, 250)
      return
    }
    if (last.index === state.index) return
    if (onMiddle) {
      Animated.timing(duck, { toValue: 1, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver }).start()
      Animated.sequence([Animated.delay(240), Animated.spring(center, { toValue: 1, stiffness: 180, damping: 12, useNativeDriver })]).start()
    } else if (last.index === middle) {
      x.setValue(target)
      duck.setValue(1)
      Animated.timing(center, { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver }).start()
      roll.setValue(1)
      Animated.timing(roll, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver }).start()
      peek(duck, boo, 160)
    } else {
      Animated.spring(x, { toValue: target, stiffness: 180, damping: 18, mass: 1, useNativeDriver }).start()
      peek(duck, boo, 200)
    }
    // slotLeft only changes with width and count, which are dependencies already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, width, count, reduced, x, duck, boo, center, roll])

  const size = Math.min(68, Math.round((side - 4) * 0.95))
  const unit = size / 120
  const artLeft = (side - size) / 2
  const artTop = -72 * unit
  const hidden = 72 * unit + CLIP_BELOW + 4
  const headY = Animated.add(duck.interpolate({ inputRange: [0, 1], outputRange: [0, hidden] }),
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }))
  const tilt = bob.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] })
  const pawFade = duck.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' })
  const pawDrop = duck.interpolate({ inputRange: [0, 1], outputRange: [0, 8], extrapolate: 'clamp' })
  const markScale = boo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] })
  const artBox = { position: 'absolute', left: 0, top: 0, width: size, height: 100 * unit } as const
  // Over the rounded ends of the bar, Gengar sits lower and leans so both paws stay on the edge.
  const seat = sides.map(index => {
    const left = INSET + slotLeft(index) + artLeft
    const [low, high] = [edgeDrop(left + 17 * unit, width), edgeDrop(left + 103 * unit, width)]
    return { at: slotLeft(index), drop: (low + high) / 2, lean: -Math.atan2(low - high, 86 * unit) * 180 / Math.PI }
  })
  const seats = seat.map(item => item.at)
  const drop = seat.length > 1 ? x.interpolate({ inputRange: seats, outputRange: seat.map(item => item.drop), extrapolate: 'clamp' }) : seat[0]?.drop ?? 0
  const lean = seat.length > 1 ? x.interpolate({ inputRange: seats, outputRange: seat.map(item => `${item.lean}deg`), extrapolate: 'clamp' })
    : `${seat[0]?.lean ?? 0}deg`
  const perch = [{ translateX: x }, { translateY: drop }, { rotate: lean }]
  // Each side tab turns violet and bold as Gengar arrives over it; none does while the ball's tab is open.
  const sideOn = center.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' })
  const lit = (index: number) => {
    const at = sides.indexOf(index)
    const points = [at > 0 ? slotLeft(sides[at - 1]) : slotLeft(index) - side, slotLeft(index), at < sides.length - 1 ? slotLeft(sides[at + 1]) : slotLeft(index) + side]
    return Animated.multiply(x.interpolate({ inputRange: points, outputRange: [0, 1, 0], extrapolate: 'clamp' }), sideOn)
  }
  // The floating Gengar grows out of the ball, hovers a little higher than the peeking one bobs, and twirls on a tap.
  const floatY = Animated.add(Animated.add(center.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] })), twirl.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -12, 0] }))
  const floatBox = { position: 'absolute', left: 0, top: 0, width: FLOAT, height: FLOAT } as const

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key]
    const label = options.title ?? route.name
    const icon = (focused: boolean) => options.tabBarIcon?.({ focused, color: focused ? tint.active : tint.inactive, size: 24 })
    const focused = index === state.index
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
      if (index === middle && !focused && !reduced) {
        roll.setValue(0)
        Animated.timing(roll, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver }).start()
      }
      if (focused) {
        if (reduced) return
        if (index !== middle) peek(duck, boo, 260)
        else { twirl.setValue(0); Animated.timing(twirl, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver }).start() }
      } else if (!event.defaultPrevented) navigation.navigate(route.name, route.params)
    }
    const press = { accessibilityRole: 'tab', accessibilityState: { selected: focused }, accessibilityLabel: options.tabBarAccessibilityLabel ?? label,
      testID: options.tabBarButtonTestID, onPress, onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }) } as const
    return { route, index, label, icon, focused, press }
  })
  const middleTab = middle >= 0 ? tabs[middle] : null

  return <View style={[styles.wrap, { paddingTop: middle >= 0 ? TOP_ROOM : 6, paddingBottom: Math.max(insets.bottom, 10),
    paddingHorizontal: 14 + Math.max(insets.left, insets.right) }, barHidden && { display: 'none' }]}>
    <View pointerEvents="none" style={[styles.fade, gradient(FADE_GRADIENT, 'transparent')]} />
    <View style={styles.bar} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && sides.length > 0 && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.perch, { width: side, transform: perch }]}>
        <View style={{ position: 'absolute', left: artLeft - 8, top: artTop - HEADROOM, width: size + 16,
          height: HEADROOM - artTop + CLIP_BELOW, overflow: 'hidden' }}>
          <Animated.View style={{ position: 'absolute', left: 8, top: HEADROOM, width: size, height: 100 * unit,
            transform: [{ translateY: headY }, { rotate: tilt }] }}>
            <Image source={art.grin} fadeDuration={0} style={artBox} />
            <Animated.Image source={art.boo} fadeDuration={0} style={[artBox, { opacity: boo }]} />
            <Animated.Image source={art.blink} fadeDuration={0} style={[artBox, { opacity: blink }]} />
          </Animated.View>
        </View>
      </Animated.View>}
      {width > 0 && <Svg pointerEvents="none" width={width} height={BAR} style={StyleSheet.absoluteFill}>
        <Defs><LinearGradient id="zepimon-bar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F7F4FF" /><Stop offset="1" stopColor="#E7E0FB" />
        </LinearGradient></Defs>
        <Path d={outline(width, middle >= 0)} fill="none" stroke="rgba(118, 92, 205, 0.18)" strokeWidth={3} />
        <Path d={outline(width, middle >= 0)} fill="url(#zepimon-bar)" stroke="rgba(255, 255, 255, 0.95)" strokeWidth={1.5} />
      </Svg>}
      <View accessibilityRole="tablist" style={[styles.row, { width: Math.max(0, rowWidth) }]}>
        {width > 0 && tabs.map(({ route, index, label, icon, focused, press }) => {
          if (index === middle) return <View key={route.key} style={{ width: CENTER_SLOT }} />
          const on = lit(index)
          return <Pressable key={route.key} {...press} style={({ pressed }) => ({ width: side, height: ROW, opacity: pressed && !focused ? 0.6 : 1 })}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.subtract(1, on) }]}>
              <TabFace icon={icon(false)} label={label} active={false} width={side} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: on }]}>
              <TabFace icon={icon(true)} label={label} active width={side} />
            </Animated.View>
          </Pressable>
        })}
      </View>
      {width > 0 && sides.length > 0 && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.perch, { width: side, transform: perch }]}>
        <Animated.Image source={art.paws} fadeDuration={0}
          style={[artBox, { left: artLeft, top: artTop, opacity: pawFade, transform: [{ translateY: pawDrop }] }]} />
        <Animated.View style={{ position: 'absolute', left: artLeft + size * 0.86, top: artTop, width: size * 0.3, height: size * 0.3,
          opacity: boo, transform: [{ scale: markScale }] }}>
          <View style={[styles.mark, { left: size * 0.05, top: 0, transform: [{ rotate: '35deg' }] }]} />
          <View style={[styles.mark, { left: size * 0.12, top: size * 0.12, transform: [{ rotate: '100deg' }] }]} />
        </Animated.View>
      </Animated.View>}
      {width > 0 && middleTab && <>
        <Pressable {...middleTab.press} style={({ pressed }) => [styles.button, { left: width / 2 - BUTTON / 2, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
          <Animated.View style={[styles.shadow, { opacity: center.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scaleX: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }] }]} />
          <Animated.View style={[styles.ball, { opacity: center.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
            transform: [{ scale: center.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45], extrapolate: 'clamp' }) }] }]}>
            <PokeBall size={BUTTON} roll={roll} />
          </Animated.View>
        </Pressable>
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: width / 2 - FLOAT / 2, top: BUTTON_Y - FLOAT / 2 + FLOAT_Y, width: FLOAT, height: FLOAT,
            opacity: center.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: floatY }, { scale: center.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { rotate: twirl.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <Image source={art.float} fadeDuration={0} style={floatBox} />
          <Animated.Image source={art.floatBlink} fadeDuration={0} style={[floatBox, { opacity: blink }]} />
        </Animated.View>
      </>}
    </View>
  </View>
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.bg },
  fade: { position: 'absolute', left: 0, right: 0, top: -16, height: 16 },
  bar: { width: '100%', maxWidth: 520, alignSelf: 'center', height: BAR, borderRadius: BAR / 2,
    boxShadow: '0px 10px 20px rgba(94, 66, 180, 0.16)' },
  row: { position: 'absolute', left: INSET, top: INSET, height: ROW, flexDirection: 'row' },
  face: { height: ROW, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: tint.inactive },
  activeLabel: { fontFamily: fonts.black, color: tint.active },
  // Gengar's seat: a thin strip along the bar's top edge over one tab. It turns about the middle of that edge.
  perch: { position: 'absolute', left: INSET, top: 0, height: 1 },
  mark: { position: 'absolute', width: 3, height: 9, borderRadius: 2, backgroundColor: tint.mark },
  button: { position: 'absolute', top: BUTTON_Y - BUTTON / 2, width: BUTTON, height: BUTTON, alignItems: 'center', justifyContent: 'center' },
  ball: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, boxShadow: '0px 8px 18px rgba(74, 40, 150, 0.38)' },
  shadow: { position: 'absolute', bottom: 8, width: 26, height: 5, borderRadius: 3, backgroundColor: 'rgba(43, 24, 56, 0.2)' }
})
