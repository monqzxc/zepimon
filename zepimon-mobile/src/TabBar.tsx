import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType, StyleProp, ViewStyle } from 'react-native'
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { BottomTabBarProps } from 'expo-router/tabs'
import { useReducedMotion } from './games/hooks'
import { useTracker } from './tracker'
import { onWatch } from './shared-adventure'
import type { Activity } from './phone-adventure'
import { walkingFrames } from './generated/walking.js'
import { colors, fonts, gradient, themedStyles, useTheme } from './ui'
import type { ThemeName } from './palettes'
import { useJournal } from './store'
import { waitingEncounters } from './legendary-gate'

// A floating glass tab bar. The middle tab (Adventure) is a Poke Ball sitting in a notch cut into the bar.
// The open tab shows in the bar's accent with a heavier label, and the theme's Pokemon (Gengar, Deoxys or Pikachu; see
// mascots) peeks over the bar's top edge above it: the head is drawn behind the bar and the paws in front.
// That art sits on a 120 x 100 grid whose row 72 meets the edge. The Pokemon bobs and blinks while idle, ducks behind
// the bar when you switch tabs and pops up wide-eyed on the new one, and the labels change over as it passes. Tapping
// another open tab makes it peek. Tapping the ball spins it and the Pokemon pops out of it in its training gear,
// floating inside a pulsing aura until you leave the tab, when it goes back in. Floating, it works out: standing,
// waving, lifting, push-ups, sit-ups and worn out, the next pose every 3 seconds or when you tap the ball again, each
// arriving with a hop as the aura flares. The poses (scripts/build-nav-poses.py) share one canvas with the ground on
// one line, so the Pokemon keeps its size between them. While an adventure goes on, here or on the watch, the Pokemon
// leaves its perch and steps on top of the ball as its pixel sprite while the ball rolls (twice as fast when running);
// on the ball's tab it steps in place of the floating art. With reduced motion everything holds still and jumps, and
// the poses change only on a tap.
type Mascot = {
  walker: string,
  art: Record<'grin' | 'blink' | 'boo' | 'paws', ImageSourcePropType>,
  // The floating poses over the ball, in the order they take turns.
  floats: ImageSourcePropType[],
  // The ball's body, band and stripe, its button's rings from the outside in, its outline and its shading's dark side.
  ball: { body: string, band: string, stripe: string, rings: [string, string, string], rim: string, shade: string },
  // The aura's and the wisps' colors from the middle out.
  aura: [string, string, string, string, string], wisp: [string, string, string]
}
const gengar: Mascot = {
  walker: 'Gengar',
  art: {
    grin: require('../assets/nav/body-grin.png'), blink: require('../assets/nav/body-blink.png'),
    boo: require('../assets/nav/body-boo.png'), paws: require('../assets/nav/paws.png')
  },
  floats: [require('../assets/nav/gengar/float-stand.png'), require('../assets/nav/gengar/float-wave.png'),
    require('../assets/nav/gengar/float-lift.png'), require('../assets/nav/gengar/float-pushup.png'),
    require('../assets/nav/gengar/float-situp.png'), require('../assets/nav/gengar/float-tired.png')],
  ball: { body: '#8A5CDB', band: '#2E1A4A', stripe: '#9E72EC', rings: ['#8A5CDB', '#A47EEE', '#C2A4F6'], rim: '#2A1745', shade: '#1A0B33' },
  aura: ['#1B0833', '#3D1872', '#5A2DA3', '#7B4CCB', '#8A5CDB'], wisp: ['#2A0F4F', '#4B2289', '#6B3BB8']
}
// All of Deoxys's art, the peeking head too, is cut from pokemon_data/deoxys-fitness.png. Its ball is orange-red with a
// teal stripe.
const deoxys: Mascot = {
  walker: 'Deoxys',
  art: {
    grin: require('../assets/nav/deoxys/head-idle.png'), blink: require('../assets/nav/deoxys/head-blink.png'),
    boo: require('../assets/nav/deoxys/head-boo.png'), paws: require('../assets/nav/deoxys/paws.png')
  },
  floats: [require('../assets/nav/deoxys/float-stand.png'), require('../assets/nav/deoxys/float-wave.png'),
    require('../assets/nav/deoxys/float-lift.png'), require('../assets/nav/deoxys/float-pushup.png'),
    require('../assets/nav/deoxys/float-situp.png'), require('../assets/nav/deoxys/float-tired.png')],
  ball: { body: '#D4502E', band: '#3A1A12', stripe: '#3FB6C8', rings: ['#D4502E', '#E8785A', '#F5AE95'], rim: '#35160E', shade: '#2A0C06' },
  aura: ['#0E4450', '#177A8A', '#2FA3B8', '#4FD3E3', '#7FE3EE'], wisp: ['#0F4A57', '#1F8CA0', '#4FD3E3']
}
// Pikachu's art is all cut from pokemon_data/pikachu-fitness.png; its blink is drawn, as no pose there shuts its eyes.
// Its ball is yellow with a stripe as red as its cheeks, and its aura an electric yellow glow.
const pikachu: Mascot = {
  walker: 'Pikachu',
  art: {
    grin: require('../assets/nav/pikachu/head-idle.png'), blink: require('../assets/nav/pikachu/head-blink.png'),
    boo: require('../assets/nav/pikachu/head-boo.png'), paws: require('../assets/nav/pikachu/paws.png')
  },
  floats: [require('../assets/nav/pikachu/float-stand.png'), require('../assets/nav/pikachu/float-wave.png'),
    require('../assets/nav/pikachu/float-lift.png'), require('../assets/nav/pikachu/float-pushup.png'),
    require('../assets/nav/pikachu/float-situp.png'), require('../assets/nav/pikachu/float-tired.png')],
  ball: { body: '#F2C21B', band: '#3B2A0A', stripe: '#E0483A', rings: ['#F2C21B', '#FFD95A', '#FFF0A6'], rim: '#3B2A0A', shade: '#4A3300' },
  aura: ['#5C4500', '#A07800', '#E8B800', '#FFDA4A', '#FFE98A'], wisp: ['#7A5A00', '#D9A800', '#FFE066']
}
// Emerald's mascot is Deoxys too, met on Birth Island in Pokemon Emerald: the same art, with a ball in emerald green and
// Rayquaza gold and an aura that glows like the Legendary Gate. No other Hoenn Pokemon has the cut-out training poses.
const emerald: Mascot = { ...deoxys,
  ball: { body: '#1F9E5C', band: '#0B2A1A', stripe: '#F2C230', rings: ['#1F9E5C', '#4CC383', '#9BE3BC'], rim: '#0B2A1A', shade: '#06180E' },
  aura: ['#063A24', '#0E6E3E', '#1F9E5C', '#5FD49A', '#F2C230'], wisp: ['#0B4A2E', '#1F9E5C', '#F2C230'] }
const mascots: Record<ThemeName, Mascot> = { emerald, gengar, deoxys, pikachu }
// The bar's colors (colors.tab*) come with the theme, like the lilac glass bar of Gengar's light theme.
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
const FLOAT = 74         // the floating Pokemon, drawn a little above the ball's center
const POSE_W = FLOAT * 1.25   // its poses are 320 x 256, wider than tall, so lifted dumbbells fit
const FLOAT_Y = -10
const AURA = 98          // the shadow aura around it
const WISPS = [{ x: -20, size: 14, delay: 0 }, { x: 17, size: 12, delay: 900 }, { x: -2, size: 10, delay: 1700 }]
const STRIDER = 46       // the stepping Pokemon on the ball during an adventure
const useNativeDriver = Platform.OS !== 'web'
const strides = walkingFrames as Record<string, ImageSourcePropType[]>

// The Pokemon's overworld sprite stepping in place, like Pokemon on the Adventure tab while recording.
function Strider({ name, activity, size, reduced }: { name: string, activity: Activity, size: number, reduced: boolean }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setFrame(value => 1 - value), activity === 'running' ? 200 : 400)
    return () => clearInterval(timer)
  }, [activity, reduced])
  return <Image source={strides[name][reduced ? 0 : frame]} fadeDuration={0} resizeMode="contain"
    style={{ width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
}

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

// A take on the Cherish Ball in the Pokemon's colors: a dark band with a bright stripe and a ringed button. The band
// and button turn with the ball; the shading and shine stay put, as if lit from the top left.
function PokeBall({ size, roll, paint }: { size: number, roll: Animated.Value | Animated.AnimatedAddition<number>, paint: Mascot['ball'] }) {
  const ink = paint.band
  return <View style={{ width: size, height: size }}>
    <Animated.View style={{ position: 'absolute', width: size, height: size,
      transform: [{ rotate: roll.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><ClipPath id="zepimon-ball"><Circle cx="50" cy="50" r="47" /></ClipPath></Defs>
        <Circle cx="50" cy="50" r="47" fill={paint.body} />
        <G clipPath="url(#zepimon-ball)">
          <Rect x="0" y="40.5" width="100" height="19" fill={ink} />
          <Rect x="0" y="47.5" width="100" height="5" fill={paint.stripe} />
        </G>
        <Circle cx="50" cy="50" r="16.5" fill={ink} />
        <Circle cx="50" cy="50" r="12.5" fill={paint.rings[0]} stroke={ink} strokeWidth="1.5" />
        <Circle cx="50" cy="50" r="8" fill={paint.rings[1]} stroke={ink} strokeWidth="1.5" />
        <Circle cx="50" cy="50" r="4" fill={paint.rings[2]} stroke={ink} strokeWidth="1.2" />
      </Svg>
    </Animated.View>
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id="zepimon-ball-light" cx="0.38" cy="0.32" r="0.75">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.3" />
        <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        <Stop offset="1" stopColor={paint.shade} stopOpacity="0.55" />
      </RadialGradient></Defs>
      <Circle cx="50" cy="50" r="47" fill="url(#zepimon-ball-light)" />
      <Ellipse cx="33" cy="24" rx="13" ry="6.5" fill="#FFFFFF" opacity="0.55" transform="rotate(-35 33 24)" />
      <Ellipse cx="22.5" cy="37" rx="3" ry="2" fill="#FFFFFF" opacity="0.4" transform="rotate(-60 22.5 37)" />
      <Circle cx="50" cy="50" r="47" fill="none" stroke={paint.rim} strokeWidth="1.5" />
    </Svg>
  </View>
}

// Ghostly shadow around the floating Gengar: a dark violet glow that breathes, with wisps of shadow drifting up out
// of it (in Deoxys's teal, a psychic glow). It flares as each new pose arrives.
function ShadowAura({ bob, flare, reduced, aura, wisp: tint }: {
  bob: Animated.Value, flare: Animated.Value, reduced: boolean, aura: Mascot['aura'], wisp: Mascot['wisp']
}) {
  const [wisps] = useState(() => WISPS.map(() => new Animated.Value(0)))
  useEffect(() => {
    if (reduced) { wisps.forEach(wisp => wisp.setValue(0)); return }
    const loops = wisps.map((wisp, i) => Animated.loop(Animated.sequence([Animated.delay(WISPS[i].delay),
      Animated.timing(wisp, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver }),
      Animated.timing(wisp, { toValue: 0, duration: 0, useNativeDriver })])))
    loops.forEach(loop => loop.start())
    return () => loops.forEach(loop => loop.stop())
  }, [reduced, wisps])
  const breathe = Animated.add(bob.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.03] }),
    flare.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }))
  return <View pointerEvents="none" style={{ position: 'absolute', left: (FLOAT - AURA) / 2, top: (FLOAT - AURA) / 2 + 6, width: AURA, height: AURA }}>
    <Animated.View style={{ position: 'absolute', width: AURA, height: AURA, transform: [{ scale: breathe }],
      opacity: Animated.add(bob.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.7] }), flare.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] })) }}>
      <Svg width={AURA} height={AURA} viewBox="0 0 100 100">
        <Defs><RadialGradient id="zepimon-aura" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={aura[0]} stopOpacity="0.55" />
          <Stop offset="0.5" stopColor={aura[1]} stopOpacity="0.35" />
          <Stop offset="0.75" stopColor={aura[2]} stopOpacity="0.15" />
          <Stop offset="0.92" stopColor={aura[3]} stopOpacity="0.04" />
          <Stop offset="1" stopColor={aura[4]} stopOpacity="0" />
        </RadialGradient></Defs>
        <Ellipse cx="50" cy="52" rx="50" ry="46" fill="url(#zepimon-aura)" />
      </Svg>
    </Animated.View>
    {wisps.map((wisp, i) => <Animated.View key={i} style={{ position: 'absolute', left: AURA / 2 + WISPS[i].x - WISPS[i].size / 2, top: AURA * 0.32,
      width: WISPS[i].size, height: WISPS[i].size,
      opacity: wisp.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.6, 0.3, 0] }),
      transform: [{ translateY: wisp.interpolate({ inputRange: [0, 1], outputRange: [0, -AURA * 0.36] }) },
        { scale: wisp.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }] }}>
      <Svg width={WISPS[i].size} height={WISPS[i].size} viewBox="0 0 10 10">
        <Defs><RadialGradient id="zepimon-wisp" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={tint[0]} stopOpacity="0.75" />
          <Stop offset="0.6" stopColor={tint[1]} stopOpacity="0.35" />
          <Stop offset="1" stopColor={tint[2]} stopOpacity="0" />
        </RadialGradient></Defs>
        <Circle cx="5" cy="5" r="5" fill="url(#zepimon-wisp)" />
      </Svg>
    </Animated.View>)}
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

// badge: a ✦ on the icon, on Home while a Legendary encounter waits (src/legendary-gate.ts).
function TabFace({ icon, label, active, width, badge = false }: { icon: React.ReactNode, label: string, active: boolean, width: number, badge?: boolean }) {
  return <View style={[styles.face, { width }]}>
    <View style={[styles.iconSlot, active && styles.pill]}>
      {icon}
      {badge && <View style={styles.badge}><Text style={styles.badgeMark}>✦</Text></View>}
    </View>
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
  const [flare] = useState(() => new Animated.Value(0))   // up to 1 as a new floating pose arrives
  const [shake] = useState(() => new Animated.Value(0))
  const [roll] = useState(() => new Animated.Value(0))     // the ball's spin, two turns from 0 to 1
  const [spin] = useState(() => new Animated.Value(0))     // its roll under the Pokemon's feet during an adventure
  const rolling = useMemo(() => Animated.add(roll, spin), [roll, spin])
  const placed = useRef<{ index: number, width: number } | null>(null)
  const reduced = useReducedMotion()
  // The navigator does not render this bar again when the theme changes, so it listens itself.
  const mascot = mascots[useTheme().theme]
  const { art, floats } = mascot
  // Walking or running while an adventure goes on here, or on the watch as the cloud last had it.
  const tracker = useTracker()
  const moving = tracker.active?.activity ?? onWatch(tracker.shared)?.activity ?? null
  const { expeditions, quest } = useJournal()
  const waiting = waitingEncounters(expeditions, quest) > 0

  useEffect(() => {
    if (!moving || reduced) { spin.setValue(0); return }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: moving === 'running' ? 1400 : 2800, easing: Easing.linear, useNativeDriver }))
    loop.start()
    return () => loop.stop()
  }, [moving, reduced, spin])
  // Meanwhile the Pokemon has left its perch; when the adventure ends it pops back up there, surprised.
  const wasMoving = useRef(moving)
  useEffect(() => {
    if (wasMoving.current && !moving && !reduced) peek(duck, boo, 200)
    wasMoving.current = moving
  }, [moving, reduced, duck, boo])
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
  // Which floating pose shows, counting up from 0 each time the ball's tab opens (shown modulo the number of poses).
  const ballOpen = state.index === middle
  const [cycle, setCycle] = useState({ open: ballOpen, pose: 0 })
  if (cycle.open !== ballOpen) setCycle({ open: ballOpen, pose: 0 })
  const nextPose = () => setCycle(value => ({ ...value, pose: value.pose + 1 }))
  // With several poses the next shows every 3 seconds while they are on screen; a tap shows it early and starts the
  // wait again. With reduced motion they change only on a tap.
  useEffect(() => {
    if (!cycle.open || floats.length < 2 || moving || reduced) return
    const timer = setTimeout(() => setCycle(value => ({ ...value, pose: value.pose + 1 })), 3000)
    return () => clearTimeout(timer)
  }, [cycle.open, cycle.pose, floats.length, moving, reduced])
  // Each new pose arrives with a little hop while the aura flares.
  useEffect(() => {
    if (!cycle.pose || reduced) return
    flare.setValue(0)
    Animated.sequence([
      Animated.timing(flare, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver }),
      Animated.timing(flare, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver })
    ]).start()
  }, [cycle.pose, reduced, flare])

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

  // Move to the focused tab. Side to side, the Pokemon slides along the bar and peeks up on arrival. Onto the middle
  // tab it ducks, the ball finishes its spin and it pops out of the ball; back off it, it returns and the ball spins
  // back. The first layout lets the Pokemon say hello; a resize just snaps.
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
  // Over the rounded ends of the bar, the Pokemon sits lower and leans so both paws stay on the edge.
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
  // Each side tab turns to the accent and bold as the Pokemon arrives over it; none does while the ball's tab is open.
  const sideOn = center.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' })
  const lit = (index: number) => {
    const at = sides.indexOf(index)
    const points = [at > 0 ? slotLeft(sides[at - 1]) : slotLeft(index) - side, slotLeft(index), at < sides.length - 1 ? slotLeft(sides[at + 1]) : slotLeft(index) + side]
    return Animated.multiply(x.interpolate({ inputRange: points, outputRange: [0, 1, 0], extrapolate: 'clamp' }), sideOn)
  }
  // The floating Pokemon grows out of the ball, hovers a little higher than the peeking one bobs, and hops as a new pose
  // arrives.
  const floatY = Animated.add(Animated.add(center.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] })), flare.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }))
  const floatBox = { position: 'absolute', left: 0, top: 0, width: FLOAT, height: FLOAT } as const
  const poseBox = { position: 'absolute', left: (FLOAT - POSE_W) / 2, top: 0, width: POSE_W, height: FLOAT } as const
  // Tapping the open ball shows the next pose with a cheeky wobble.
  const tease = () => {
    nextPose()
    if (reduced) return
    shake.setValue(0)
    const step = (toValue: number) => Animated.timing(shake, { toValue, duration: 85, easing: Easing.inOut(Easing.sin), useNativeDriver })
    Animated.sequence([Animated.delay(110), step(1), step(-1), step(1), step(-1), step(0.5), step(0)]).start()
  }

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key]
    const label = options.title ?? route.name
    const icon = (focused: boolean) => options.tabBarIcon?.({ focused, color: focused ? colors.tabActive : colors.tabInk, size: 24 })
    const focused = index === state.index
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
      if (index === middle && !focused && !reduced) {
        roll.setValue(0)
        Animated.timing(roll, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver }).start()
      }
      if (focused) {
        if (index === middle) tease()
        else if (!reduced) peek(duck, boo, 260)
      } else if (!event.defaultPrevented) navigation.navigate(route.name, route.params)
    }
    const badge = route.name === 'index' && waiting
    const press = { accessibilityRole: 'tab', accessibilityState: { selected: focused },
      accessibilityLabel: (options.tabBarAccessibilityLabel ?? label) + (index === middle && moving ? ', adventure in progress' : '')
        + (badge ? ', a Legendary encounter is waiting' : ''),
      testID: options.tabBarButtonTestID, onPress, onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }) } as const
    return { route, index, label, icon, focused, press, badge }
  })
  const middleTab = middle >= 0 ? tabs[middle] : null

  return <View style={[styles.wrap, { paddingTop: middle >= 0 ? TOP_ROOM : 6, paddingBottom: Math.max(insets.bottom, 10),
    paddingHorizontal: 14 + Math.max(insets.left, insets.right) }, barHidden && { display: 'none' }]}>
    {/* Page content fades into the page color just above the bar instead of ending on a hard edge. */}
    <View pointerEvents="none" style={[styles.fade, gradient(`linear-gradient(180deg, ${colors.bg}00 0%, ${colors.bg} 100%)`, 'transparent')]} />
    <View style={styles.bar} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && sides.length > 0 && !moving && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
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
          <Stop offset="0" stopColor={colors.tabTop} /><Stop offset="1" stopColor={colors.tabBottom} />
        </LinearGradient></Defs>
        <Path d={outline(width, middle >= 0)} fill="none" stroke={colors.tabHalo} strokeWidth={3} />
        <Path d={outline(width, middle >= 0)} fill="url(#zepimon-bar)" stroke={colors.tabRim} strokeWidth={1.5} />
      </Svg>}
      <View accessibilityRole="tablist" style={[styles.row, { width: Math.max(0, rowWidth) }]}>
        {width > 0 && tabs.map(({ route, index, label, icon, focused, press, badge }) => {
          if (index === middle) return <View key={route.key} style={{ width: CENTER_SLOT }} />
          const on = lit(index)
          return <Pressable key={route.key} {...press} style={({ pressed }) => ({ width: side, height: ROW, opacity: pressed && !focused ? 0.6 : 1 })}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.subtract(1, on) }]}>
              <TabFace icon={icon(false)} label={label} active={false} width={side} badge={badge} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: on }]}>
              <TabFace icon={icon(true)} label={label} active width={side} badge={badge} />
            </Animated.View>
          </Pressable>
        })}
      </View>
      {width > 0 && sides.length > 0 && !moving && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
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
            <PokeBall size={BUTTON} roll={moving ? rolling : roll} paint={mascot.ball} />
          </Animated.View>
        </Pressable>
        {moving && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: width / 2 - STRIDER / 2, top: BUTTON_Y - BUTTON / 2 - STRIDER + 8,
            opacity: center.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp' }) }}>
          <Strider name={mascot.walker} activity={moving} size={STRIDER} reduced={reduced} />
        </Animated.View>}
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: width / 2 - FLOAT / 2, top: BUTTON_Y - FLOAT / 2 + FLOAT_Y, width: FLOAT, height: FLOAT,
            opacity: center.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ translateY: floatY }, { scale: center.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
          <ShadowAura bob={bob} flare={flare} reduced={reduced} aura={mascot.aura} wisp={mascot.wisp} />
          <Animated.View style={[floatBox, { transform: [{ rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) },
            { scale: flare.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}>
            {moving ? <Strider name={mascot.walker} activity={moving} size={FLOAT} reduced={reduced} /> : <>
              {/* Every pose stays mounted, so each is loaded before its turn and the change is instant. */}
              {floats.map((source, index) => <Image key={index} source={source} fadeDuration={0}
                style={[poseBox, { opacity: index === cycle.pose % floats.length ? 1 : 0 }]} />)}
            </>}
          </Animated.View>
        </Animated.View>
      </>}
    </View>
  </View>
}

const styles = themedStyles(() => ({
  wrap: { backgroundColor: colors.bg },
  fade: { position: 'absolute', left: 0, right: 0, top: -16, height: 16 },
  bar: { width: '100%', maxWidth: 520, alignSelf: 'center', height: BAR, borderRadius: BAR / 2,
    boxShadow: `0px 10px 20px ${colors.tabShadow}` },
  row: { position: 'absolute', left: INSET, top: INSET, height: ROW, flexDirection: 'row' },
  face: { height: ROW, alignItems: 'center', justifyContent: 'center', gap: 2 },
  // The open tab's icon sits on a soft violet pill; every icon keeps the same box, so nothing shifts as it moves.
  iconSlot: { height: 28, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: colors.tabPill },
  // Rayquaza gold with a dark mark, ringed in the bar's color so it stands off the icon.
  badge: { position: 'absolute', top: -5, right: 4, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.star, borderWidth: 1.5, borderColor: colors.tabTop },
  badgeMark: { color: '#1A1200', fontSize: 10, lineHeight: 12, fontFamily: fonts.black },
  label: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: colors.tabInk, textAlign: 'center' },
  activeLabel: { fontFamily: fonts.black, color: colors.tabActive },
  // The Pokemon's seat: a thin strip along the bar's top edge over one tab. It turns about the middle of that edge.
  perch: { position: 'absolute', left: INSET, top: 0, height: 1 },
  mark: { position: 'absolute', width: 3, height: 9, borderRadius: 2, backgroundColor: colors.tabMark },
  button: { position: 'absolute', top: BUTTON_Y - BUTTON / 2, width: BUTTON, height: BUTTON, alignItems: 'center', justifyContent: 'center' },
  ball: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, boxShadow: '0px 8px 18px rgba(74, 40, 150, 0.38)' },
  shadow: { position: 'absolute', bottom: 8, width: 26, height: 5, borderRadius: 3, backgroundColor: 'rgba(43, 24, 56, 0.2)' }
}))
