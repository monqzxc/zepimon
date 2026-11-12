import { useEffect, useState } from 'react'
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { pokemonType, typeColors } from '../catalog'
import { Backdrop, habitatTheme } from '../HabitatScene'
import { trailWalkers } from '../generated/trail-walkers.js'
import { Button, Copy, HabitatScene, Icon, IconButton, Panel, PokeballIcon, colors, displayFont, fonts, pressDepth, retro, themedStyles } from '../ui'
import { BallButton, BigName, FactRow, Footnote, SceneFrame, StatusLine } from './ExpeditionParts'
import { useReducedMotion } from './hooks'
import { Frame } from './TileWorld'
import { PixelSprite } from './TeamPicker'
import { buddyFrame } from './safari-view'
import { ShinyStars } from './ShinyAura'
import { KIND_NAMES, trialFor } from './trials'
import { caughtLegendaries, roomsExplored } from './revisits'
import type { Revisit } from './revisits'

const walkers = trailWalkers as Record<string, ImageSourcePropType>
const native = Platform.OS !== 'web'
const STEP_EVERY = 500
// The white die-cut edge around a standee's figure: the sprite drawn one edge out in each direction, under itself.
const OUTLINE: [x: number, y: number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

type Pick = (name: string, shiny: boolean) => void
type Actions = { busy: boolean, onJourney: Pick, onRevisit: Pick, onRematch: Pick }

// Shrine Revisits: every Legendary caught on an expedition, in species order (a Shiny catch is its own stop), as little
// action figures along a winding path. Each stands on its stand in a bubble of its habitat, facing you and stepping in
// place; the ring around the bubble fills with the shrine rooms explored. Tapping one opens its sheet: relive the whole
// journey (trial room, then the portal into its lair for a rematch), practice a trial room, or battle it again in its
// lair, any time. All practice: nothing is caught. With reduced motion the figures hold still. Under the path, caught
// Legendaries can be released for permits (onRelease; src/games/ReleaseLegendaries.tsx).
export function ShrineRevisits({ busy, onJourney, onRevisit, onRematch, onRelease }: Actions & { onRelease: () => void }) {
  const { expeditions } = useJournal()
  const reduced = useReducedMotion()
  const caught = caughtLegendaries(expeditions.dex)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<Revisit | null>(null)
  const step = useSteps(!reduced)
  return <>
    <ShrineHeader count={caught.length} open={open} onToggle={() => setOpen(value => !value)} />
    <ShrinePath caught={caught} step={step} reduced={reduced} onChoose={setChosen} />
    <ShrineSheet revisit={chosen} reduced={reduced} busy={busy} onClose={() => setChosen(null)}
      onJourney={(name, shiny) => { setChosen(null); onJourney(name, shiny) }}
      onRevisit={(name, shiny) => { setChosen(null); onRevisit(name, shiny) }}
      onRematch={(name, shiny) => { setChosen(null); onRematch(name, shiny) }} />
    {caught.length > 0 && <Panel style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={look.headerTitle}>Release for permits</Text>
      <Copy small>Send Legendaries you’ve caught back to the wild. Each one gives an Expedition Permit, and you can meet it again on a later expedition.</Copy>
      <Button title="Choose Legendaries to release" secondary disabled={busy} onPress={onRelease} />
    </Panel>}
  </>
}

// The figures share one walking clock, so a long path runs a single timer.
function useSteps(moving: boolean): 0 | 1 {
  const [step, setStep] = useState<0 | 1>(0)
  useEffect(() => {
    if (!moving) return
    const timer = setInterval(() => setStep(value => value ? 0 : 1), STEP_EVERY)
    return () => clearInterval(timer)
  }, [moving])
  return moving ? step : 0
}

// A breathing value from 0 to 1 and back; phase staggers neighbours so they never move in step.
function useBreath(duration: number, phase: number, reduced: boolean) {
  const [value] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) { value.setValue(0); return }
    const half = (toValue: number) => Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native })
    const loop = Animated.sequence([Animated.delay(phase), Animated.loop(Animated.sequence([half(1), half(0)]))])
    loop.start()
    return () => loop.stop()
  }, [value, duration, phase, reduced])
  return value
}

// The section's header card: the shrine mark, how many shrines are open, and a chevron that shows how revisits work.
// The whole card toggles; a screen reader reads the heading and reaches the chevron as its own button.
function ShrineHeader({ count, open, onToggle }: { count: number, open: boolean, onToggle: () => void }) {
  const line = count ? `${count} Legendar${count === 1 ? 'y waits' : 'ies wait'} at ${count === 1 ? 'its shrine' : 'their shrines'}. Tap one to revisit.`
    : 'Catch a Legendary to open its shrine.'
  return <Pressable accessible={false} onPress={onToggle}>
    <Panel style={look.header}>
      <View style={look.headerRow}>
        <ShrineMark size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={look.headerTitle}>Shrine Revisits</Text>
          <Text style={look.headerLine}>{line}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="How revisits work" accessibilityState={{ expanded: open }} hitSlop={10}
          onPress={onToggle} style={({ pressed }) => [look.chevron, pressed && { opacity: 0.6 }]}>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="chevronDown" size={22} color={colors.edge} /></View>
        </Pressable>
      </View>
      {open && <Copy small>Come back to any Legendary you’ve caught: relive the whole journey from its trial room through the portal into its lair for a rematch, practice a trial room or battle it again in its lair. Revisits are practice: nothing is caught. They need no permit and never change your Dex; a cleared room can only improve your best moves. The ring around each figure fills as you explore its shrine’s rooms.</Copy>}
    </Panel>
  </Pressable>
}

// A small stepped shrine with a glowing orb on top, after the reference's crystal mound.
function ShrineMark({ size }: { size: number }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <RadialGradient id="orb" cx="24" cy="13" r="13" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE58A" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#FFE58A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="24" cy="13" r="13" fill="url(#orb)" />
      <Rect x="21" y="18" width="6" height="7" rx="1" fill={colors.edge} opacity={0.6} />
      <Rect x="14" y="24" width="20" height="6" rx="1.5" fill={colors.edge} opacity={0.72} />
      <Rect x="9" y="30" width="30" height="6" rx="1.5" fill={colors.edge} opacity={0.86} />
      <Rect x="4" y="36" width="40" height="7" rx="2" fill={colors.edge} />
      <Rect x="6" y="37" width="36" height="1.5" rx="0.75" fill="#ffffff" opacity={0.45} />
      <Circle cx="24" cy="13" r="4.5" fill="#FFD23F" stroke="#FFF4C7" strokeWidth="1.5" />
    </Svg>
  </View>
}

// The winding path: stops alternate left and right, each tucked up under the one before, as in a world map.
function ShrinePath({ caught, step, reduced, onChoose }: { caught: Revisit[], step: 0 | 1, reduced: boolean, onChoose: (revisit: Revisit) => void }) {
  const { width } = useWindowDimensions()
  const lane = Math.min(width - 32, 420)
  const size = Math.round(Math.min(156, lane * 0.4))
  const inset = Math.round(lane * 0.06)
  return <View style={[look.path, { width: lane }]}>
    <View pointerEvents="none" style={look.watermarks}>
      <View style={[look.watermark, { right: -size * 0.55, top: size * 0.2 }]}><PokeballIcon size={size * 1.5} color={colors.edge} stroke={size / 9} /></View>
      <View style={[look.watermark, { left: -size * 0.6, top: size * 2.2 }]}><PokeballIcon size={size * 1.4} color={colors.edge} stroke={size / 9} /></View>
    </View>
    {caught.length ? caught.map((revisit, i) => <View key={revisit.key}
      style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', marginHorizontal: inset, marginTop: i ? -size * 0.36 : 0 }}>
      <PathStop revisit={revisit} index={i} size={size} step={i % 2 ? (step ? 0 : 1) : step} reduced={reduced} onPress={() => onChoose(revisit)} />
    </View>) : <View style={look.empty}>
      <View style={[look.emptyBubble, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[look.emptyMark, { fontSize: size * 0.36, lineHeight: size * 0.44 }]}>?</Text>
      </View>
      <Copy>Catch a Legendary on an expedition to revisit its shrine here.</Copy>
    </View>}
  </View>
}

function PathStop({ revisit, index, size, step, reduced, onPress }: {
  revisit: Revisit, index: number, size: number, step: 0 | 1, reduced: boolean, onPress: () => void
}) {
  const { trialRecords, rematchWins } = useJournal()
  const { name, shiny, key } = revisit
  const trial = trialFor(name, trialRecords)
  const { explored, rooms } = roomsExplored(name, trialRecords)
  const wins = rematchWins[key] || 0
  const right = index % 2 === 1
  const label = `${shiny ? 'Shiny ' : ''}${name}. ${trial.title}. ${explored} of ${rooms} room${rooms === 1 ? '' : 's'} explored.${wins ? ` Rematch wins: ${wins}.` : ''}`
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens its trial and rematch"
    onPress={onPress} style={({ pressed }) => [look.stop, { width: size }, pressed && !reduced && { transform: [{ scale: 0.95 }] }, pressDepth(pressed)]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Standee name={name} shiny={shiny} size={size} step={step} phase={index * 260} progress={rooms ? explored / rooms : 0} reduced={reduced} />
      <Sparkle shiny={shiny} size={size} side={right ? 'left' : 'right'} phase={index * 330} reduced={reduced} />
    </View>
    <View accessible={false} style={look.nameTag}>
      <Text numberOfLines={1} style={look.name}>{name}</Text>
      {shiny && <Text style={look.shinyMark}>✦</Text>}
    </View>
  </Pressable>
}

// A caught Legendary as a little action figure in a glass bubble. Inside the bubble: its habitat (src/HabitatScene.tsx),
// a round stand, and on it the Pokemon facing you, cut out with a white edge like a standee and a dark sliver behind for
// its thickness. It steps in place and gently bobs over its contact shadow. progress (0 to 1) fills the ring in its type
// color, starting at the top.
function Standee({ name, shiny, size, step, phase, progress, reduced }: {
  name: string, shiny: boolean, size: number, step: 0 | 1, phase: number, progress: number, reduced: boolean
}) {
  const theme = habitatTheme(name)
  const tone = typeColors[pokemonType(name)] || typeColors.normal
  const bob = useBreath(720, phase, reduced)
  const rim = Math.round(size * 0.075)
  const inner = size - rim * 2
  const figure = Math.round(inner * 0.72)
  const base = { width: inner * 0.62, height: inner * 0.17, top: inner * 0.74 }
  const stroke = Math.max(3, Math.round(rim * 0.5))
  const radius = (size - stroke) / 2
  const around = 2 * Math.PI * radius
  return <View style={[look.bubble, { width: size, height: size, borderRadius: size / 2, boxShadow: `0px 10px 24px ${tone}40` }]}>
    <View style={[look.inner, { left: rim, top: rim, width: inner, height: inner, borderRadius: inner / 2, backgroundColor: theme.sky }]}>
      <Backdrop theme={theme} platform={false} />
      <View style={[look.gloss, { left: inner * 0.13, top: inner * 0.08, width: inner * 0.36, height: inner * 0.17 }]} />
      {/* The stand: its rim, a little lower and darker, shows under the top face as the stand's thickness. */}
      <View style={[look.ellipse, { left: (inner - base.width) / 2, top: base.top + base.height * 0.3, width: base.width, height: base.height, backgroundColor: theme.near }]} />
      <View style={[look.ellipse, look.standTop, { left: (inner - base.width) / 2, top: base.top, width: base.width, height: base.height, backgroundColor: theme.platform }]} />
      <Animated.View style={[look.ellipse, { left: (inner - base.width * 0.56) / 2, top: base.top + base.height * 0.28, width: base.width * 0.56,
        height: base.height * 0.44, backgroundColor: '#12263c', opacity: bob.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.18] }),
        transform: [{ scaleX: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) }] }]} />
      <Animated.View style={{ position: 'absolute', left: (inner - figure) / 2, top: base.top + base.height * 0.55 - figure,
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -inner * 0.045] }) }] }}>
        <Figure name={name} shiny={shiny} size={figure} step={step} />
        {shiny && <ShinyStars size={figure} reduced={reduced} />}
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, look.innerEdge, { borderRadius: inner / 2 }]} />
    </View>
    {progress > 0 && <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={[around * Math.min(1, progress), around]} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>}
  </View>
}

// The front-facing overworld sprite as a standee cut-out: a dark copy nudged down and right for the card's thickness,
// white copies one edge out all round for the die-cut border, then the sprite itself.
function Figure({ name, shiny, size, step }: { name: string, shiny: boolean, size: number, step: 0 | 1 }) {
  const strip = walkers[(shiny ? 'Shiny ' : '') + name]
  const edge = Math.max(1.5, size / 30)
  const draw = (tint?: string) => strip
    ? <Frame strip={{ source: strip, frames: 8, width: 44, height: 44 }} frame={buddyFrame('south', step)} width={size} height={size} tint={tint} />
    : <PixelSprite name={name} shiny={shiny} size={size} tint={tint} />
  return <View style={{ width: size, height: size }}>
    <View style={{ position: 'absolute', left: edge, top: edge * 1.6 }}>{draw('#1b2e4a59')}</View>
    {OUTLINE.map(([x, y]) => <View key={`${x},${y}`} style={{ position: 'absolute', left: x * edge, top: y * edge }}>{draw('#ffffff')}</View>)}
    {draw()}
  </View>
}

// A four-point star by the bubble, twinkling; gold and larger for a Shiny.
function Sparkle({ shiny, size, side, phase, reduced }: { shiny: boolean, size: number, side: 'left' | 'right', phase: number, reduced: boolean }) {
  const twinkle = useBreath(1100, phase, reduced)
  const glyph = shiny ? 22 : 16
  return <Animated.Text style={{ position: 'absolute', top: size * 0.02, [side]: -glyph * 0.4, fontSize: glyph, lineHeight: glyph * 1.2,
    color: shiny ? colors.star : colors.edge, opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: shiny ? [1, 0.55] : [0.55, 0.2] }),
    transform: [{ scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }) }] }}>✦</Animated.Text>
}

// The chosen Legendary's sheet, rising from the bottom over a scrim and laid out like a waiting encounter
// (src/games/ExpeditionParts.tsx): its shrine's status and name, the Pokemon in its habitat (tap it to say hello), its
// trial, rooms explored and rematch wins as rows, and the two ways back in. It scrolls when it is taller than the screen.
function ShrineSheet({ revisit, reduced, busy, onClose, onJourney, onRevisit, onRematch }: Actions & {
  revisit: Revisit | null, reduced: boolean, onClose: () => void
}) {
  const { trialRecords, rematchWins } = useJournal()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [rise] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!revisit) return
    rise.setValue(reduced ? 1 : 0)
    if (!reduced) Animated.timing(rise, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start()
  }, [revisit, reduced, rise])
  if (!revisit) return null
  const { name, shiny, key } = revisit
  const trial = trialFor(name, trialRecords)
  const { explored, rooms } = roomsExplored(name, trialRecords)
  const wins = rematchWins[key] || 0
  return <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: rise }]}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal style={[look.sheet, { maxHeight: height - insets.top - 24, opacity: rise,
      transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }] }]}>
      <View style={look.sheetTop}>
        <View style={look.grabber} />
        <View style={look.close}><IconButton name="close" label="Close" size={40} onPress={onClose} /></View>
      </View>
      <ScrollView contentContainerStyle={[look.sheetBody, { paddingBottom: insets.bottom + 20 }]}>
        <StatusLine eyebrow="SHRINE REVISIT" status={KIND_NAMES[trial.kind].toUpperCase()} />
        <BigName>{shiny ? `Shiny ${name} ✦` : name}</BigName>
        <SceneFrame><HabitatScene name={name} shiny={shiny} /></SceneFrame>
        <View style={{ gap: 10 }}>
          <FactRow label={`THE TRIAL · ${trial.title.toUpperCase()}`} text={trial.lore} />
          <FactRow dim={!explored} label={`ROOMS EXPLORED · ${explored} / ${rooms}`}
            text={explored === rooms ? 'Every room has a best. Clear one in fewer moves to beat it.' : 'A cleared room saves your best moves.'} />
          <FactRow dim={!wins} label={`REMATCH WINS · ${wins}`} text={wins ? `You have beaten ${name} again ${wins === 1 ? 'once' : `${wins} times`}.` : `Battle ${name} again to win your first rematch.`} />
        </View>
        <BallButton title="Relive the journey" disabled={busy} onPress={() => onJourney(name, shiny)} />
        <Footnote>{`${trial.title}, then the portal into ${name}’s lair to face it in a rematch. Nothing is caught.`}</Footnote>
        <Button title="Practice a trial room" secondary disabled={busy} onPress={() => onRevisit(name, shiny)} />
        <Button title="Battle again" secondary disabled={busy} onPress={() => onRematch(name, shiny)} />
        <Footnote>Revisits are practice. They need no permit and never change your Dex.</Footnote>
      </ScrollView>
    </Animated.View>
  </Modal>
}

const look = themedStyles(() => ({
  header: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontFamily: displayFont(), color: colors.ink, fontSize: retro() ? 19 : 20, lineHeight: 26 },
  headerLine: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  chevron: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  path: { alignSelf: 'center', paddingVertical: 4 },
  watermarks: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden' },
  watermark: { position: 'absolute', opacity: 0.06 },
  stop: { alignItems: 'center', gap: 8 },
  bubble: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  inner: { position: 'absolute', overflow: 'hidden' },
  innerEdge: { borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.5)' },
  gloss: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.14)', transform: [{ rotate: '-26deg' }] },
  ellipse: { position: 'absolute', borderRadius: 999 },
  standTop: { borderTopWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.55)' },
  nameTag: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: retro() ? 6 : 999, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  name: { flexShrink: 1, fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: 13, lineHeight: 18 },
  shinyMark: { color: colors.star, fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  emptyBubble: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.sunken },
  emptyMark: { fontFamily: fonts.black, color: colors.muted },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', maxWidth: 560, alignSelf: 'center', paddingTop: 10,
    backgroundColor: colors.bg, borderTopLeftRadius: retro() ? 12 : 28, borderTopRightRadius: retro() ? 12 : 28,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, boxShadow: `0px -8px 28px ${colors.shadow}` },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetBody: { gap: 14, paddingHorizontal: 20 },
  sheetTop: { height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 14, top: 0 }
}))
