import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold'
import { PixelifySans_600SemiBold } from '@expo-google-fonts/pixelify-sans/600SemiBold'
import { routeRunners } from './generated/adventure-route.js'
import { safariSprites } from './generated/safari-assets.js'
import { Frame } from './games/TileWorld'
import type { Strip } from './games/TileWorld'
import { trainerFrame } from './games/safari-view'
import { OverworldSprite } from './games/OverworldSprite'
import { useReducedMotion } from './games/hooks'
import { getPreferences, usePreferencesLoaded } from './preferences'
import { useJournal } from './store'
import { walkingFrames } from './generated/walking.js'
import { FILL_MS, RAMP_TRAVEL, RUN_AT, WALK_END, canLeave, fillEasing, phaseAt, rampEasing, strideMs } from './launch-intro'
import type { IntroPhase } from './launch-intro'

// The opening animation, over the app while it loads: your trainer heads out along a Hoenn trail at dawn with your
// buddy at their heels, setting off at a walk and breaking into a run as the scenery races past (src/launch-intro.ts
// has the timeline). It plays for at least three seconds and until the app is ready, then closes like a Poke Ball and
// opens onto the app. With reduced motion the scene holds still and simply fades away.
//
// The scene is an illustration with its own dawn palette, like a game's title screen, so it looks the same in every
// theme; the theme takes over once it opens. Every scenery layer is drawn three times side by side and slides by the
// distance covered (a native-driver modulo), so the loop never shows a seam and the pace can rise smoothly.

const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' } as object : {}
const walkers = safariSprites as Record<'brendan' | 'may', Strip>
const runners = routeRunners as Record<'brendan' | 'may', Strip>
const dust = (safariSprites as Record<'dust', Strip>).dust
const poses = walkingFrames as Record<string, unknown>
const STRIDE = [0, 1, 0, 2] as const
// The buddy who runs along when you have not picked one yet.
const DEFAULT_BUDDY = 'Pikachu'

// Screen widths per unit of travel (src/launch-intro.ts): a third of the screen a second at a walk, all of it at a run.
const WIDTHS_PER_UNIT = 1 / 3000
// The running loop covers this many units, a whole number of screen widths for every layer's speed below.
const CRUISE_UNITS = 30000

const sky = { top: '#163a73', mid: '#3d86d1', low: '#a6d7f2', horizon: '#ffe0ae' }
const ink = '#0b1f3a'

const words: Record<IntroPhase, string> = { walk: 'Walk.', run: 'Run.', adventure: 'Adventure!' }
const notes: Record<IntroPhase, string> = { walk: 'Lacing up your shoes…', run: 'Picking up the pace…', adventure: 'Every step counts toward a hatch' }

type Scene = { width: number, height: number, ground: number, path: number, unit: number }
type Layer = { speed: number, draw: (scene: Scene) => ReactNode }

// A ridge stepped into pixel blocks `cell` wide: `waves` whole humps across the width (so it tiles), rising `amp`
// above `base`, filled down to `bottom`.
function pixelRidge(width: number, bottom: number, base: number, amp: number, waves: number, phase: number, cell: number) {
  const steps = Math.max(1, Math.round(width / cell))
  const size = width / steps
  let d = `M0,${bottom.toFixed(1)}`
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps
    const wave = 0.5 + 0.35 * Math.sin(2 * Math.PI * waves * t + phase) + 0.15 * Math.sin(2 * Math.PI * waves * 3 * t + phase * 2)
    const y = Math.round((base - amp * wave) / cell) * cell
    d += ` L${(i * size).toFixed(1)},${y} L${((i + 1) * size).toFixed(1)},${y}`
  }
  return `${d} L${width.toFixed(1)},${bottom.toFixed(1)} Z`
}

function Cloud({ x, y, s }: { x: number, y: number, s: number }) {
  return <G x={x} y={y}>
    <Rect x={-30 * s} y={-6 * s} width={60 * s} height={12 * s} fill="#ffffff" opacity={0.9} />
    <Rect x={-18 * s} y={-14 * s} width={30 * s} height={8 * s} fill="#ffffff" opacity={0.9} />
    <Rect x={-6 * s} y={-20 * s} width={16 * s} height={6 * s} fill="#ffffff" opacity={0.9} />
    <Rect x={-30 * s} y={4 * s} width={60 * s} height={4 * s} fill="#cfe6f7" opacity={0.9} />
  </G>
}

function Pine({ x, y, s }: { x: number, y: number, s: number }) {
  return <G x={x} y={y}>
    <Rect x={-3 * s} y={-10 * s} width={6 * s} height={10 * s} fill="#6e4a2a" />
    <Rect x={-14 * s} y={-26 * s} width={28 * s} height={16 * s} fill="#256f3d" />
    <Rect x={-10 * s} y={-38 * s} width={20 * s} height={12 * s} fill="#2c8248" />
    <Rect x={-6 * s} y={-48 * s} width={12 * s} height={10 * s} fill="#35964f" />
    <Rect x={-14 * s} y={-26 * s} width={6 * s} height={6 * s} fill="#3aa35a" />
    <Rect x={-10 * s} y={-38 * s} width={5 * s} height={5 * s} fill="#46b366" />
  </G>
}

// Slow to fast: clouds, mountains, hills with pines, the trail you run on and, once running, streaks of wind. Speeds
// are tenths so CRUISE_UNITS moves each layer a whole number of widths.
const layers: Layer[] = [
  { speed: 0.1, draw: ({ width, ground, unit }) => <>
    <Cloud x={width * 0.15} y={ground * 0.5} s={unit * 1.1} />
    <Cloud x={width * 0.55} y={ground * 0.62} s={unit * 0.8} />
    <Cloud x={width * 0.85} y={ground * 0.44} s={unit * 0.9} />
  </> },
  { speed: 0.3, draw: ({ width, ground, unit }) => <>
    <Path d={pixelRidge(width, ground, ground - unit * 70, unit * 110, 2, 0.6, unit * 6)} fill="#86a6dc" />
    <Path d={pixelRidge(width, ground, ground - unit * 40, unit * 80, 3, 2.1, unit * 6)} fill="#5e83c4" />
  </> },
  { speed: 0.6, draw: ({ width, ground, unit }) => <>
    <Path d={pixelRidge(width, ground + unit * 2, ground - unit * 10, unit * 34, 2, 4, unit * 4)} fill="#4caf62" />
    {[0.08, 0.2, 0.27, 0.46, 0.62, 0.7, 0.88].map((x, i) =>
      <Pine key={i} x={width * x} y={ground + unit * 2} s={unit * (i % 3 === 1 ? 1.25 : 1)} />)}
  </> },
  { speed: 1, draw: ({ width, height, ground, path, unit }) => <>
    <Rect x={-1} y={ground} width={width + 2} height={height - ground} fill="#4aa84a" />
    <Rect x={-1} y={ground} width={width + 2} height={unit * 5} fill="#7ad06a" />
    <Rect x={-1} y={path} width={width + 2} height={unit * 34} fill="#e4c584" />
    <Rect x={-1} y={path} width={width + 2} height={unit * 3} fill="#c79f5e" />
    <Rect x={-1} y={path + unit * 31} width={width + 2} height={unit * 3} fill="#c79f5e" />
    {Array.from({ length: 8 }, (_, i) => <Rect key={`p${i}`} x={width * (i / 8 + 0.03)} y={path + unit * (i % 2 ? 11 : 20)}
      width={unit * 10} height={unit * 3} fill="#cfa96a" />)}
    {Array.from({ length: 6 }, (_, i) => <G key={`t${i}`} x={width * (i / 6 + 0.05)} y={path + unit * (48 + (i % 3) * 14)}>
      <Rect x={0} y={0} width={unit * 3} height={unit * 7} fill="#3a8f3d" />
      <Rect x={unit * 5} y={-unit * 3} width={unit * 3} height={unit * 10} fill="#3a8f3d" />
      <Rect x={unit * 10} y={unit} width={unit * 3} height={unit * 6} fill="#3a8f3d" />
    </G>)}
    {Array.from({ length: 5 }, (_, i) => <G key={`f${i}`} x={width * (i / 5 + 0.13)} y={ground + unit * (11 + (i % 2) * 2)}>
      <Rect x={0} y={0} width={unit * 4} height={unit * 4} fill={i % 2 ? '#ffffff' : '#ff8fa8'} />
      <Rect x={unit} y={unit} width={unit * 2} height={unit * 2} fill="#ffd34d" />
    </G>)}
  </> },
  { speed: 1.6, draw: ({ width, ground, unit }) => <>
    {[0.4, 0.56, 0.7, 0.82, 0.93].map((y, i) => <Rect key={i} x={width * ((i * 0.37) % 1)} y={ground * y}
      width={unit * (40 + (i % 3) * 22)} height={Math.max(2, unit * 2)} fill="#ffffff" opacity={0.55} />)}
  </> }
]

export function LaunchIntro({ ready, onDone }: { ready: boolean, onDone: () => void }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const [fontsLoaded, fontError] = useFonts({ Nunito_800ExtraBold, PixelifySans_600SemiBold })
  const text = fontsLoaded || !!fontError
  const { ready: journalReady, buddy } = useJournal()
  const preferencesLoaded = usePreferencesLoaded()

  const unit = Math.min(width / 390, height / 760) * 1.15
  const ground = Math.round(height * 0.6)
  const scene: Scene = { width, height, ground, path: ground + unit * 16, unit }
  const feet = scene.path + unit * 22
  const person = { height: Math.min(unit * 120, height * 0.2), width: Math.min(unit * 60, height * 0.1) }
  const friend = person.height * 0.62
  const trainerX = width * 0.58
  const buddyX = trainerX - person.width * 0.5 - friend * 0.75

  // Who runs: chosen once, as each of them first appears, so nobody swaps mid-stride.
  const [trainer, setTrainer] = useState<'brendan' | 'may' | null>(null)
  const [friendName, setFriendName] = useState<string | null>(null)

  const [elapsed, setElapsed] = useState(0)
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [sceneGone, setSceneGone] = useState(false)

  const [values] = useState(() => ({
    fade: new Animated.Value(0), travel: new Animated.Value(0), cruise: new Animated.Value(0), enter: new Animated.Value(0),
    friendEnter: new Animated.Value(0), bounce: new Animated.Value(0), fill: new Animated.Value(0), wobble: new Animated.Value(0),
    word: new Animated.Value(1), sun: new Animated.Value(0), close: new Animated.Value(0), flash: new Animated.Value(0),
    open: new Animated.Value(0), letters: Array.from({ length: 7 }, () => new Animated.Value(0))
  }))

  // One clock for what changes in steps: the word, the stride and when to leave.
  const phase = phaseAt(elapsed)
  const running = elapsed >= RUN_AT
  useEffect(() => {
    const started = Date.now()
    let stride = 0
    let last = 0
    const timer = setInterval(() => {
      const ms = Date.now() - started
      stride += (ms - last) / strideMs(ms)
      last = ms
      setElapsed(ms)
      setStep(Math.floor(stride) % STRIDE.length)
    }, 40)
    return () => clearInterval(timer)
  }, [])

  if (trainer === null && (preferencesLoaded || elapsed > 400)) setTrainer(getPreferences().safariTrainer)
  if (friendName === null && (journalReady || elapsed > 900) && elapsed > 500) {
    const name = buddy && poses[buddy.replace(/^Shiny /, '')] ? buddy : DEFAULT_BUDDY
    setFriendName(name)
  }

  // The scene: fades in, the logo drops in letter by letter, the sun glows, the world starts moving.
  useEffect(() => {
    const { fade, travel, cruise, letters, sun, fill } = values
    if (reduced) {
      fade.setValue(1); letters.forEach(letter => letter.setValue(1))
      const filling = Animated.timing(fill, { toValue: 1, duration: FILL_MS, easing: Easing.linear, useNativeDriver: native })
      filling.start()
      return () => filling.stop()
    }
    const run = [
      Animated.timing(fade, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.stagger(70, letters.map(letter => Animated.spring(letter, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: native }))),
      Animated.loop(Animated.sequence([
        Animated.timing(sun, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(sun, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native })
      ])),
      Animated.timing(fill, { toValue: 1, duration: FILL_MS, easing: fillEasing, useNativeDriver: native }),
      Animated.sequence([
        Animated.timing(travel, { toValue: WALK_END, duration: WALK_END, easing: Easing.linear, useNativeDriver: native }),
        Animated.timing(travel, { toValue: WALK_END + RAMP_TRAVEL, duration: RUN_AT - WALK_END, easing: rampEasing, useNativeDriver: native }),
        Animated.loop(Animated.timing(cruise, { toValue: CRUISE_UNITS, duration: CRUISE_UNITS / 3, easing: Easing.linear, useNativeDriver: native }))
      ])
    ]
    run[1] = Animated.sequence([Animated.delay(150), run[1]])
    run.forEach(animation => animation.start())
    return () => run.forEach(animation => animation.stop())
  }, [reduced, values])

  // The trainer jogs in from the left; the buddy follows a moment later and catches up.
  useEffect(() => {
    if (!trainer) return
    if (reduced) { values.enter.setValue(1); return }
    const entering = Animated.timing(values.enter, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: native })
    entering.start()
    return () => entering.stop()
  }, [trainer, reduced, values])
  useEffect(() => {
    if (!friendName) return
    if (reduced) { values.friendEnter.setValue(1); return }
    const entering = Animated.timing(values.friendEnter, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native })
    entering.start()
    return () => entering.stop()
  }, [friendName, reduced, values])

  // Running: a bounce in every stride. The word under the logo pops each time it changes.
  useEffect(() => {
    if (!running || reduced) return
    const hop = Animated.loop(Animated.sequence([
      Animated.timing(values.bounce, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(values.bounce, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: native })
    ]))
    hop.start()
    return () => { hop.stop(); values.bounce.setValue(0) }
  }, [running, reduced, values])
  useEffect(() => {
    if (reduced) return
    values.word.setValue(0)
    const pop = Animated.spring(values.word, { toValue: 1, speed: 16, bounciness: 14, useNativeDriver: native })
    pop.start()
    return () => pop.stop()
  }, [phase, reduced, values])

  // The egg at the end of the trail wobbles once the trail is full, as if about to hatch.
  const full = elapsed >= FILL_MS
  useEffect(() => {
    if (!full || reduced) return
    const wobble = Animated.loop(Animated.sequence([
      Animated.timing(values.wobble, { toValue: 1, duration: 90, useNativeDriver: native }),
      Animated.timing(values.wobble, { toValue: -1, duration: 180, useNativeDriver: native }),
      Animated.timing(values.wobble, { toValue: 0, duration: 90, useNativeDriver: native }),
      Animated.delay(380)
    ]))
    wobble.start()
    return () => wobble.stop()
  }, [full, reduced, values])

  // Leaving: a Poke Ball snaps shut over the scene, its button flashes, then it opens onto the app.
  if (!leaving && canLeave(elapsed, ready)) setLeaving(true)
  useEffect(() => {
    if (!leaving) return
    const { close, flash, open, fade } = values
    if (reduced) {
      const out = Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: native })
      out.start(({ finished }) => { if (finished) onDone() })
      return () => out.stop()
    }
    const shut = Animated.sequence([
      Animated.timing(close, { toValue: 1, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
      Animated.timing(flash, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(flash, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: native })
    ])
    let opening: Animated.CompositeAnimation | null = null
    shut.start(({ finished }) => {
      if (!finished) return
      setSceneGone(true)
      opening = Animated.timing(open, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: native })
      opening.start(({ finished: done }) => { if (done) onDone() })
    })
    return () => { shut.stop(); opening?.stop() }
  }, [leaving, reduced, values, onDone])

  // Built once per size, so the clock's renders neither rebuild the native animation nodes nor redraw the scenery.
  const shifts = useMemo(() => {
    const total = Animated.add(values.travel, values.cruise)
    return layers.map(layer => Animated.modulo(Animated.multiply(total, width * WIDTHS_PER_UNIT * layer.speed), width)
      .interpolate({ inputRange: [0, width], outputRange: [0, -width] }))
  }, [width, values])
  const drawn = useMemo(() => layers.map((layer, i) => <G key={i}>
    <G x={-width}>{layer.draw(scene)}</G>
    {layer.draw(scene)}
    <G x={width}>{layer.draw(scene)}</G>
  </G>), [width, height]) // eslint-disable-line react-hooks/exhaustive-deps -- scene follows width and height

  const [trackWidth, setTrackWidth] = useState(0)
  const ball = 22
  const pose = STRIDE[step]
  const strip = running ? runners : walkers
  const half = height / 2 + 2

  return <View style={StyleSheet.absoluteFill} accessible accessibilityRole="progressbar" accessibilityLabel="Zepimon is opening"
    accessibilityState={{ busy: !leaving }} importantForAccessibility="yes">
    <StatusBar style="light" />
    {!sceneGone && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: sky.top, opacity: values.fade }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="intro-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={sky.top} />
            <Stop offset="0.45" stopColor={sky.mid} />
            <Stop offset="0.8" stopColor={sky.low} />
            <Stop offset="1" stopColor={sky.horizon} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={ground} fill="url(#intro-sky)" />
      </Svg>
      <Animated.View style={{ position: 'absolute', left: width * 0.72 - unit * 60, top: ground - unit * 175, width: unit * 120, height: unit * 120,
        opacity: values.sun.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
        transform: [{ scale: values.sun.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <Svg width={unit * 120} height={unit * 120}>
          <Circle cx={unit * 60} cy={unit * 60} r={unit * 58} fill="#fff4c2" opacity={0.25} />
          <Circle cx={unit * 60} cy={unit * 60} r={unit * 44} fill="#fff4c2" opacity={0.35} />
          <Circle cx={unit * 60} cy={unit * 60} r={unit * 30} fill="#ffe680" />
        </Svg>
      </Animated.View>
      {layers.map((layer, i) => <Animated.View key={i} style={{ position: 'absolute', left: 0, top: 0, width: width * 2, height,
        opacity: layer.speed > 1 ? values.travel.interpolate({ inputRange: [WALK_END + 300, WALK_END + RAMP_TRAVEL], outputRange: [0, 1], extrapolate: 'clamp' }) : 1,
        transform: [{ translateX: shifts[i] }] }}>
        <Svg width={width * 2} height={height}>{drawn[i]}</Svg>
      </Animated.View>)}

      {friendName && <Animated.View style={{ position: 'absolute', left: buddyX - friend / 2, top: feet - friend * 0.92,
        transform: [{ translateX: values.friendEnter.interpolate({ inputRange: [0, 1], outputRange: [-buddyX - friend, 0] }) },
          { translateY: values.bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -unit * 5] }) }] }}>
        <OverworldSprite name={friendName.replace(/^Shiny /, '')} shiny={friendName.startsWith('Shiny ')} size={friend} facing="east"
          stepMs={running ? 110 : elapsed > WALK_END ? 170 : 260} />
      </Animated.View>}
      {trainer && <Animated.View style={{ position: 'absolute', left: trainerX - person.width / 2, top: feet - person.height,
        transform: [{ translateX: values.enter.interpolate({ inputRange: [0, 1], outputRange: [-trainerX - person.width, 0] }) }] }}>
        {running && !reduced && pose !== 0 && <View style={{ position: 'absolute', left: -person.width * 0.55, top: person.height - unit * 16 }}>
          <Frame strip={dust} frame={step % 3} width={person.width * 0.9} height={person.width * 0.45} />
        </View>}
        <Animated.View style={{ transform: [{ translateY: values.bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -unit * 7] }) }] }}>
          <Frame strip={strip[trainer]} frame={trainerFrame('east', reduced ? (running ? 1 : 0) : pose)} width={person.width} height={person.height} />
        </Animated.View>
      </Animated.View>}

      <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + height * 0.08, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row' }}>
          {'ZEPIMON'.split('').map((letter, i) => <Animated.Text key={i} style={[look.logo, text ? { fontFamily: 'PixelifySans_600SemiBold' } : look.bold,
            { fontSize: Math.round(Math.min(width * 0.15, 68)), opacity: values.letters[i],
              transform: [{ translateY: values.letters[i].interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }] }]}>{letter}</Animated.Text>)}
        </View>
        <Animated.Text key={phase} style={[look.word, text ? { fontFamily: 'PixelifySans_600SemiBold' } : look.bold, {
          opacity: values.word.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: values.word.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>{words[phase]}</Animated.Text>
      </View>

      <View style={[look.panel, { left: 20, right: 20, bottom: insets.bottom + 28 }]}>
        <View style={look.panelInner}>
          <Text numberOfLines={1} style={[look.note, text ? { fontFamily: 'Nunito_800ExtraBold' } : look.bold]}>{notes[phase]}</Text>
          <View style={look.trailRow}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={look.track} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}>
              {trackWidth > 0 && <Animated.View style={[look.fill, { width: trackWidth,
                transform: [{ translateX: values.fill.interpolate({ inputRange: [0, 1], outputRange: [-trackWidth, 0] }) }] }]} />}
              {Array.from({ length: 9 }, (_, i) => <View key={i} style={[look.tick, { left: `${(i + 1) * 10}%` }]} />)}
            </View>
            {trackWidth > 0 && <Animated.View style={{ position: 'absolute', left: -ball / 2, top: '50%', marginTop: -ball / 2,
              transform: [{ translateX: values.fill.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] }) },
                { rotate: values.fill.interpolate({ inputRange: [0, 1], outputRange: ['0deg', reduced ? '0deg' : '1080deg'] }) }] }}>
              <MiniBall size={ball} />
            </Animated.View>}
            </View>
            <Animated.View style={{ marginLeft: 14, transform: [{ rotate: values.wobble.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) }] }}>
              <Image source={require('../assets/pokemon/egg.png')} fadeDuration={0} style={[{ width: 34, height: 34 }, pixelated]} />
            </Animated.View>
          </View>
        </View>
      </View>
    </Animated.View>}

    {leaving && !reduced && <PokeballShutter values={values} width={width} half={half} height={height} />}
  </View>
}

// The two halves of a Poke Ball meeting in the middle, then parting to show the app.
function PokeballShutter({ values, width, half, height }: {
  values: { close: Animated.Value, flash: Animated.Value, open: Animated.Value }, width: number, half: number, height: number
}) {
  const { close, flash, open } = values
  const button = Math.min(width * 0.24, 96)
  const band = Math.max(12, button * 0.16)
  const top = Animated.add(close.interpolate({ inputRange: [0, 1], outputRange: [-half, 0] }),
    open.interpolate({ inputRange: [0, 1], outputRange: [0, -half - band] }))
  const bottom = Animated.add(close.interpolate({ inputRange: [0, 1], outputRange: [half, 0] }),
    open.interpolate({ inputRange: [0, 1], outputRange: [0, half + band] }))
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, width, height: half, transform: [{ translateY: top }] }}>
      <View style={{ flex: 1, backgroundColor: '#e2453c' }} />
      <View style={{ position: 'absolute', left: width * 0.1, top: half * 0.3, width: width * 0.18, height: half * 0.12, borderRadius: 999,
        backgroundColor: 'rgba(255, 255, 255, 0.25)' }} />
      <View style={{ height: band / 2, backgroundColor: '#1d1d26' }} />
      <View style={{ position: 'absolute', left: (width - button) / 2, top: half - button / 2, width: button, height: button / 2, overflow: 'hidden' }}>
        <ButtonFace size={button} flash={flash} />
      </View>
    </Animated.View>
    <Animated.View style={{ position: 'absolute', left: 0, top: height - half, width, height: half, transform: [{ translateY: bottom }] }}>
      <View style={{ height: band / 2, backgroundColor: '#1d1d26' }} />
      <View style={{ flex: 1, backgroundColor: '#f4f1e8' }} />
      <View style={{ position: 'absolute', left: (width - button) / 2, top: 0, width: button, height: button / 2, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: -button / 2 }}><ButtonFace size={button} flash={flash} /></View>
      </View>
    </Animated.View>
  </View>
}

function ButtonFace({ size, flash }: { size: number, flash: Animated.Value }) {
  const inner = size * 0.46
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#f4f1e8', borderWidth: size * 0.1, borderColor: '#1d1d26',
    alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: inner, height: inner, borderRadius: inner / 2, borderWidth: 3, borderColor: '#cfc9b8', backgroundColor: '#ffffff' }} />
    <Animated.View style={{ position: 'absolute', width: inner, height: inner, borderRadius: inner / 2, backgroundColor: '#fff7b0', opacity: flash,
      transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }} />
  </View>
}

// The Poke Ball rolling along the trail meter.
function MiniBall({ size }: { size: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2, borderColor: ink, backgroundColor: '#f4f1e8' }}>
    <View style={{ height: size / 2 - 2, backgroundColor: '#e2453c' }} />
    <View style={{ position: 'absolute', left: 0, right: 0, top: size / 2 - 2.5, height: 2, backgroundColor: ink }} />
    <View style={{ position: 'absolute', left: size / 2 - 5, top: size / 2 - 5, width: 6, height: 6, borderRadius: 3, borderWidth: 1.5,
      borderColor: ink, backgroundColor: '#ffffff' }} />
  </View>
}

const look = StyleSheet.create({
  // Only when the app's fonts failed to load: a bold weight with a custom family can drop the family on Android.
  bold: { fontWeight: '800' },
  logo: { color: '#ffd84a', letterSpacing: 2, textShadowColor: ink, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  word: { marginTop: 6, color: '#ffffff', fontSize: 28, letterSpacing: 1, textShadowColor: 'rgba(11, 31, 58, 0.55)',
    textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  // Emerald's text box: a dark outer border around a white inner one.
  panel: { position: 'absolute', borderRadius: 12, borderWidth: 3, borderColor: '#3b5a4a', backgroundColor: '#fffcef',
    boxShadow: '0px 6px 0px rgba(11, 31, 58, 0.35)' },
  panelInner: { margin: 2, borderRadius: 8, borderWidth: 2, borderColor: '#ffffff', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  note: { color: '#1b2a22', fontSize: 15 },
  trailRow: { flexDirection: 'row', alignItems: 'center' },
  track: { height: 14, borderRadius: 7, backgroundColor: '#e5ddbf', overflow: 'hidden', borderWidth: 2, borderColor: '#3b5a4a' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#1f9a55' },
  tick: { position: 'absolute', top: 3, width: 2, height: 4, backgroundColor: 'rgba(59, 90, 74, 0.35)' }
})
