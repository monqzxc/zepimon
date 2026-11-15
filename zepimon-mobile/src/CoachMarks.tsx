import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { finishCoach, hasTarget, measureTarget, measureView, targetScroller, useCoachTarget, useTour } from './tour'
import { placeTip, screenNames, scrollNeeded, spotlight, stepsFor } from './tour-plan'
import type { Box, CoachStep, TourScreen } from './tour-plan'
import { FEET, GUIDE, TourGuide } from './TourGuide'
import { useReducedMotion } from './games/hooks'
import { GradientFill, colors, displayFont, fonts, retro, themedStyles, useTheme } from './ui'

// A screen's first-visit tips, one at a time: the screen dims except for what the tip is about, and a card beside it
// says what that is, with the guide Pokemon standing on the card. Next and Back move through them, Skip ends them, and
// a tap on the dimmed screen moves on too. A tip whose target is off the page scrolls to it; one with no target, or
// whose target cannot be shown, sits in the middle of the screen. src/tour-plan.ts has the tips and src/tour.ts
// decides when a screen's are due.

// What a tip points at. style is for a target that must keep its place in a row.
export function CoachTarget({ id, style, children }: React.PropsWithChildren<{ id: string, style?: StyleProp<ViewStyle> }>) {
  const ref = useCoachTarget(id)
  return <View ref={ref} collapsable={false} style={style}>{children}</View>
}

const native = Platform.OS !== 'web'
// The screen settles (its cards pop in, the tab bar's Pokemon arrives) before the first tip looks for its target.
const SETTLE = 650
// Room above a tip for the guide standing on it.
const HEADROOM = GUIDE - FEET - 14
const RADIUS = 16
const DIM = 'rgba(6, 10, 18, 0.72)'
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function CoachMarks() {
  const { coach } = useTour()
  return coach ? <Coach key={coach} screen={coach} /> : null
}

// The lit area for a target, in the overlay's own coordinates. A target on the page stays above the tab bar and scrolls
// into view first; the tab bar's own targets may use the whole screen.
async function locate(target: string | undefined, host: View | null, size: { width: number, height: number }, top: number, bottom: number): Promise<Box | null> {
  if (!target) return null
  const origin = await measureView(host) ?? { x: 0, y: 0 }
  const place = async () => {
    const box = await measureTarget(target)
    return box && { ...box, x: box.x - origin.x, y: box.y - origin.y }
  }
  let box = await place()
  if (!box) return null
  if (target.startsWith('tab.')) return spotlight(box, { width: size.width, top: 0, bottom: size.height })
  const bar = await measureTarget('tab.bar')
  const frame = { width: size.width, top, bottom: bar ? Math.min(bottom, bar.y - origin.y - 4) : bottom }
  const dy = scrollNeeded(box, frame)
  const scrollBy = targetScroller(target)
  if (dy && scrollBy) {
    scrollBy(dy)
    await wait(120)
    box = await place() ?? box
  }
  return spotlight(box, frame)
}

// The lit area gliding from one target to the next. Appearing, leaving and reduced motion jump.
function useGlide(target: Box | null, reduced: boolean): Box | null {
  const [box, setBox] = useState(target)
  const at = useRef(target)
  useEffect(() => {
    const from = at.current
    if (!target || !from || reduced) {
      at.current = target
      const frame = requestAnimationFrame(() => setBox(target))
      return () => cancelAnimationFrame(frame)
    }
    const began = Date.now()
    let frame = requestAnimationFrame(function tick() {
      const t = Math.min(1, (Date.now() - began) / 280)
      const eased = 1 - Math.pow(1 - t, 3)
      const mix = (a: number, b: number) => a + (b - a) * eased
      at.current = { x: mix(from.x, target.x), y: mix(from.y, target.y), width: mix(from.width, target.width), height: mix(from.height, target.height) }
      setBox(at.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, reduced])
  return box
}

function Coach({ screen }: { screen: TourScreen }) {
  useTheme()
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()
  const size = useWindowDimensions()
  const host = useRef<View>(null)
  const [steps, setSteps] = useState<CoachStep[] | null>(null)
  const [index, setIndex] = useState(0)
  // The lit area of the tip at `index`, once found; until then the last tip stays up.
  const [found, setFound] = useState<{ index: number, hole: Box | null } | null>(null)
  const [tipHeight, setTipHeight] = useState(0)
  const [pop] = useState(() => new Animated.Value(0))
  const [hop] = useState(() => new Animated.Value(0))

  useEffect(() => {
    const timer = setTimeout(() => setSteps(stepsFor(screen, hasTarget)), SETTLE)
    return () => clearTimeout(timer)
  }, [screen])

  const top = insets.top + 8
  const bottom = size.height - insets.bottom - 8
  const step = steps?.[index]
  useEffect(() => {
    if (!step) return
    let current = true
    void locate(step.target, host.current, { width: size.width, height: size.height }, top, bottom).then(hole => { if (current) setFound({ index, hole }) })
    return () => { current = false }
  }, [step, index, size.width, size.height, top, bottom])

  const shown = found ? steps?.[found.index] : undefined
  const hole = useGlide(found?.hole ?? null, reduced)
  // Each tip slides in while the guide hops onto it.
  useEffect(() => {
    if (!shown) return
    AccessibilityInfo.announceForAccessibility(`${shown.title}. ${shown.body}`)
    if (reduced) { pop.setValue(1); hop.setValue(0); return }
    pop.setValue(0)
    hop.setValue(0)
    Animated.timing(pop, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start()
    Animated.sequence([
      Animated.timing(hop, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(hop, { toValue: 0, duration: 210, easing: Easing.in(Easing.quad), useNativeDriver: native })
    ]).start()
  }, [shown, reduced, pop, hop])

  // Android's back button ends the tips rather than leaving the app from under them.
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { finishCoach(screen); return true })
    return () => back.remove()
  }, [screen])

  // Nothing to say on this screen as it is now; it is asked again on the next visit.
  if (steps && !steps.length) return null
  const count = steps?.length ?? 0
  const last = index >= count - 1
  const next = () => last ? finishCoach(screen) : setIndex(index + 1)
  const width = Math.min(size.width - 32, 440)
  const placed = placeTip(found?.hole ?? null, { width: size.width, top, bottom }, tipHeight, HEADROOM)
  // The ball is lit as a circle.
  const ring = !hole ? 0 : shown?.target === 'tab.adventure' ? Math.min(hole.width, hole.height) / 2 : Math.min(retro() ? 8 : RADIUS, hole.height / 2)
  const cut = hole ? roundedRect(hole, ring) : ''

  return <View ref={host} collapsable={false} style={StyleSheet.absoluteFill} accessibilityViewIsModal>
    {shown && <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
      <Path d={`M0 0H${size.width}V${size.height}H0Z${cut}`} fill={DIM} fillRule="evenodd" />
      {hole && <Rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={ring} fill="none" stroke={colors.star} strokeWidth={2.5} />}
    </Svg>}
    {/* Blocks the screen under the tips from the first moment; a tap moves on. */}
    <Pressable accessible={false} importantForAccessibility="no" onPress={shown ? next : undefined} style={StyleSheet.absoluteFill} />
    {shown && found && <Animated.View onLayout={event => setTipHeight(event.nativeEvent.layout.height)}
      style={[look.tip, { left: (size.width - width) / 2, width, top: placed.top, opacity: tipHeight ? pop : 0,
        transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [placed.side === 'above' ? -10 : 10, 0] }) }] }]}>
      <Animated.View pointerEvents="none" style={[look.guide, { transform: [{ translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) }] }]}>
        <TourGuide />
      </Animated.View>
      {retro() && <View pointerEvents="none" style={look.inner} />}
      <Text style={look.eyebrow}>{screenNames[screen]} · {found.index + 1} of {count}</Text>
      <Text accessibilityRole="header" style={look.title}>{shown.title}</Text>
      <Text style={look.body}>{shown.body}</Text>
      <View style={look.actions}>
        {!last && <Pressable accessibilityRole="button" accessibilityLabel="Skip these tips" hitSlop={8} onPress={() => finishCoach(screen)}
          style={({ pressed }) => [look.skip, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={look.skipText}>Skip</Text>
        </Pressable>}
        <View style={{ flex: 1 }} />
        {index > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={4} onPress={() => setIndex(index - 1)}
          style={({ pressed }) => [look.button, look.back, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[look.buttonText, { color: colors.edge }]}>Back</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" hitSlop={4} onPress={next} style={({ pressed }) => [look.button, { opacity: pressed ? 0.85 : 1 }]}>
          <GradientFill radius={999} />
          <Text style={look.buttonText}>{last ? 'Got it' : 'Next'}</Text>
        </Pressable>
      </View>
    </Animated.View>}
  </View>
}

// A rounded rectangle as a path, drawn the other way round from the screen's so it cuts a hole in it.
function roundedRect({ x, y, width, height }: Box, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  return `M${x + r} ${y}H${x + width - r}A${r} ${r} 0 0 1 ${x + width} ${y + r}V${y + height - r}A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + height - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}

const look = themedStyles(() => ({
  // In Emerald, the game's text box (as RetroFrame in src/ui.tsx).
  tip: retro()
    ? { position: 'absolute', backgroundColor: colors.panel, borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter ?? colors.edge,
      paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, gap: 6, boxShadow: `0px 3px 0px ${colors.frameOuter ?? colors.edge}, 0px 12px 28px rgba(0, 0, 0, 0.35)` }
    : { position: 'absolute', backgroundColor: colors.panel, borderRadius: 22, borderWidth: 1, borderColor: colors.line,
      paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, gap: 6, boxShadow: '0px 12px 28px rgba(0, 0, 0, 0.35)' },
  inner: { position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: 7, borderWidth: 2, borderColor: colors.frameInner ?? colors.line },
  guide: { position: 'absolute', right: 14, top: FEET - GUIDE },
  eyebrow: { fontFamily: displayFont(), fontSize: 12, lineHeight: 16, letterSpacing: retro() ? 1.4 : 1.1, color: colors.edge, textTransform: 'uppercase',
    paddingRight: GUIDE },
  title: { fontFamily: displayFont(), fontSize: retro() ? 18 : 19, lineHeight: 25, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  skip: { minHeight: 40, justifyContent: 'center', paddingRight: 10 },
  skipText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.muted },
  button: { minHeight: 40, minWidth: 84, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, borderRadius: 999 },
  back: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  buttonText: { fontFamily: fonts.heavy, fontSize: 14, lineHeight: 19, color: colors.onBrand }
}))
