import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { router } from 'expo-router'
import { useJournal } from './store'
import { usePreferences } from './preferences'
import { gateStatus } from './legendary-gate'
import type { GateState, GateStatus } from './legendary-gate'
import { Parallax } from './Parallax'
import { OverworldSprite } from './games/OverworldSprite'
import { Frame } from './games/TileWorld'
import type { Strip } from './games/TileWorld'
import { trainerFrame } from './games/safari-view'
import { useReducedMotion } from './games/hooks'
import { safariSprites } from './generated/safari-assets.js'
import { Button, Copy, Eyebrow, Icon, Panel, Title, colors, displayFont, fonts, gradient, pressDepth, retro, shadows, styles, themedStyles } from './ui'

// The Legendary Gate: the way into Legendary Expeditions, drawn as a Sky Pillar-style stone gate under Hoenn's sky
// (layered, drifting parallax; src/Parallax.tsx) with the trainer from the Safari Zone at its foot. What it shows comes
// from gateStatus (src/legendary-gate.ts):
// - waiting: the gate glows and gently pulses, and the waiting Legendary stands in it in full.
// - otherwise: the gate is dim and the last Legendary caught is a dark silhouette in it (an empty gate before any catch).
// With reduced motion nothing drifts or pulses; the glow, the silhouette and the words still tell the states apart.
// Variants: hero (the featured card at the top of Home, with Enter the Gate), strip (a smaller row on Adventure) and
// banner (the Expeditions header, seen from inside the gate, looking out between its pillars).
const sprites = safariSprites as Record<'brendan' | 'may', Strip>
const native = Platform.OS !== 'web'

const HEADLINES: Record<GateState, string> = {
  waiting: 'A Legendary is waiting', permit: 'Your permit can open the gate', walking: 'The gate is sealed', none: 'A gate on the horizon'
}
const BADGES: Record<GateState, string> = { waiting: '✦ ENCOUNTER WAITING', permit: '◆ PERMIT READY', walking: 'ON THE TRAIL', none: 'NO TRAIL YET' }

export function useGateStatus(): GateStatus {
  const { expeditions, quest, progress } = useJournal()
  return useMemo(() => gateStatus(expeditions, quest, progress), [expeditions, quest, progress])
}

const enter = () => router.push('/expeditions')

export function LegendaryGate({ variant, title, children }: { variant: 'hero' | 'strip' | 'banner', title?: string, children?: ReactNode }) {
  const status = useGateStatus()
  const label = `Legendary Gate. ${HEADLINES[status.state]}. ${status.line}.`
  if (variant === 'strip') return <Pressable accessibilityRole="button" accessibilityLabel={`${label} Enter the Gate.`} onPress={enter}
    style={({ pressed }) => [retro() ? styles.frame : styles.panel, look.strip, { opacity: pressed ? 0.9 : 1 }, pressDepth(pressed)]}>
    <View style={look.stripScene}><GateScene status={status} framing="front" still /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Eyebrow>LEGENDARY GATE</Eyebrow>
      <Text style={look.stripLine}>{status.line}</Text>
    </View>
    <Icon name="chevron" size={22} color={colors.muted} />
  </Pressable>

  if (variant === 'banner') return <View style={[look.banner, gradient(), shadows.raised]}>
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={look.bannerScene}>
      <GateScene status={status} framing="inside" />
    </View>
    <View style={look.bannerText}>
      <Text style={look.bannerEyebrow}>LEGENDARY EXPEDITIONS · INSIDE THE GATE</Text>
      {!!title && <Text accessibilityRole="header" style={look.bannerTitle}>{title}</Text>}
      {children}
      <StateBadge state={status.state} />
      <Text accessibilityLiveRegion="polite" style={look.bannerLine}>{status.line}</Text>
    </View>
  </View>

  return <Panel style={look.hero}>
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={look.heroScene}>
      <GateScene status={status} framing="front" trainer />
      <View style={look.heroBadge}><StateBadge state={status.state} /></View>
    </View>
    <View style={look.heroText}>
      <Eyebrow>LEGENDARY GATE</Eyebrow>
      <Title>{HEADLINES[status.state]}</Title>
      <Copy color={colors.ink}>{status.line}</Copy>
      <Button title="Enter the Gate" onPress={enter} />
    </View>
  </Panel>
}

function StateBadge({ state }: { state: GateState }) {
  return <View style={[look.badge, state === 'waiting' && look.badgeLit]}>
    <Text style={[look.badgeText, state === 'waiting' && look.badgeTextLit]}>{BADGES[state]}</Text>
  </View>
}

// The scene fills its parent. front: the gate stands in the middle on the near ground. inside: its pillars and lintel
// frame the view, as seen from within, with the Legendary out on the ground beyond. still: no drift or pulse (the small
// strip), as with reduced motion.
function GateScene({ status, framing, trainer = false, still = false }: { status: GateStatus, framing: 'front' | 'inside', trainer?: boolean, still?: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const reduced = useReducedMotion() || still
  const lit = status.state === 'waiting'
  const { safariTrainer } = usePreferences()
  const [pulse] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (!lit || reduced) { pulse.setValue(1); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native })]))
    loop.start()
    return () => loop.stop()
  }, [lit, reduced, pulse])

  const { width, height } = size
  // The gate's drawing is 120 × 110 units; front sits it on the near ground, inside spreads it across the whole view.
  const scale = framing === 'front' ? Math.min(height * 0.82, width * 0.9) / 110 : 0
  const gate = { width: 120 * scale, height: 110 * scale, left: (width - 120 * scale) / 2, top: height - 110 * scale - height * 0.04 }
  // Where the Legendary stands: in the doorway (front), or out on the ground in the middle of the view (inside).
  const spriteSize = framing === 'front' ? Math.round(50 * scale) : Math.round(height * 0.5)
  const spriteAt = framing === 'front'
    ? { left: width / 2 - spriteSize / 2, top: gate.top + 94 * scale - spriteSize }
    : { left: width / 2 - spriteSize / 2, top: height * 0.86 - spriteSize }
  const glowSize = framing === 'front' ? gate.width * 1.25 : height * 1.1
  const tile = 15 * scale

  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, gradient(`linear-gradient(180deg, ${colors.brandTo} 0%, ${colors.brandFrom} 100%)`, colors.brandFrom)]}
    onLayout={event => { const layout = event.nativeEvent.layout; setSize({ width: layout.width, height: layout.height }) }}>
    {width > 0 && <>
      <Parallax still={reduced} />
      {/* Sealed: the whole scene sinks into shadow. */}
      {!lit && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(2, 12, 10, 0.34)' }]} />}
      {lit && <Animated.View style={{ position: 'absolute', left: width / 2 - glowSize / 2, top: spriteAt.top + spriteSize / 2 - glowSize / 2,
        width: glowSize, height: glowSize, opacity: pulse }}>
        <Svg width={glowSize} height={glowSize}>
          <Defs><RadialGradient id="gate-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFF4B8" stopOpacity="0.95" /><Stop offset="0.45" stopColor="#F2C230" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#5FD49A" stopOpacity="0" />
          </RadialGradient></Defs>
          <Rect width={glowSize} height={glowSize} fill="url(#gate-glow)" />
        </Svg>
      </Animated.View>}
      {framing === 'front' && <View style={{ position: 'absolute', left: gate.left, top: gate.top }}>
        <Svg width={gate.width} height={gate.height} viewBox="0 0 120 110"><FrontGate lit={lit} /></Svg>
      </View>}
      {status.name ? <View style={{ position: 'absolute', ...spriteAt }}>
        <OverworldSprite name={status.name} shiny={status.shiny} size={spriteSize} still={reduced || !lit} tint={lit ? undefined : '#06110D'} />
      </View> : <Text style={[look.unknown, { position: 'absolute', left: spriteAt.left, top: spriteAt.top, width: spriteSize, height: spriteSize,
        fontSize: spriteSize * 0.5, lineHeight: spriteSize }]}>?</Text>}
      {framing === 'inside' && <Svg style={StyleSheet.absoluteFill} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <InsideGate width={width} height={height} lit={lit} />
      </Svg>}
      {trainer && framing === 'front' && <View style={{ position: 'absolute', left: gate.left - tile * 0.2, top: gate.top + 110 * scale - tile * 2 }}>
        <Frame strip={sprites[safariTrainer]} frame={trainerFrame('north', 0)} width={tile} height={tile * 2} />
      </View>}
    </>}
  </View>
}

// Stone blocks in three shades with a dark outline: lit face, mid and the shadow side.
const STONE = { light: '#C3CDBF', mid: '#93A196', dark: '#5D6B62', line: '#2C3833' }
function Pillar({ x, y, width, height }: { x: number, y: number, width: number, height: number }) {
  const rows = Math.floor(height / 11)
  return <G>
    <Rect x={x} y={y} width={width} height={height} fill={STONE.mid} stroke={STONE.line} strokeWidth={1.5} />
    <Rect x={x + 2} y={y + 1} width={width * 0.45} height={height - 2} fill={STONE.light} />
    <Rect x={x + width * 0.72} y={y + 1} width={width * 0.28 - 1} height={height - 2} fill={STONE.dark} />
    {Array.from({ length: rows }, (_, i) => <Path key={i} d={`M${x} ${y + (i + 1) * 11} H${x + width}`} stroke={STONE.line} strokeWidth={1} opacity={0.6} />)}
  </G>
}

// The gate seen from the front: stepped base, two pillars, a lintel with a cap, and the doorway between them. Lit, the
// doorway glows and a gold ✦ shines on the lintel.
function FrontGate({ lit }: { lit: boolean }) {
  return <G>
    <Rect x={40} y={28} width={40} height={66} fill={lit ? 'rgba(255, 236, 160, 0.28)' : '#0A1418'} />
    <Pillar x={18} y={26} width={22} height={68} />
    <Pillar x={80} y={26} width={22} height={68} />
    <Rect x={12} y={14} width={96} height={14} fill={STONE.mid} stroke={STONE.line} strokeWidth={1.5} />
    <Rect x={13} y={15} width={94} height={4} fill={STONE.light} />
    <Rect x={22} y={5} width={76} height={10} fill={STONE.light} stroke={STONE.line} strokeWidth={1.5} />
    <Path d="M60 6 L64 10 L60 14 L56 10 Z" fill={lit ? '#F2C230' : STONE.dark} stroke={STONE.line} strokeWidth={1} />
    <Rect x={14} y={94} width={92} height={8} fill={STONE.mid} stroke={STONE.line} strokeWidth={1.5} />
    <Rect x={6} y={101} width={108} height={8} fill={STONE.dark} stroke={STONE.line} strokeWidth={1.5} />
  </G>
}

// From inside the gate: its pillars at both edges and the lintel across the top, in shadow, framing the sky beyond.
function InsideGate({ width, height, lit }: { width: number, height: number, lit: boolean }) {
  const pillar = Math.max(26, width * 0.1)
  const lintel = Math.max(18, height * 0.14)
  const shade = lit ? 0 : 0.25
  return <G>
    <Pillar x={-2} y={lintel - 2} width={pillar} height={height - lintel + 4} />
    <Pillar x={width - pillar + 2} y={lintel - 2} width={pillar} height={height - lintel + 4} />
    <Rect x={-2} y={-2} width={width + 4} height={lintel} fill={STONE.mid} stroke={STONE.line} strokeWidth={1.5} />
    <Rect x={0} y={lintel - 6} width={width} height={4} fill={STONE.dark} />
    <Path d={`M${width / 2} ${lintel * 0.2} l${lintel * 0.28} ${lintel * 0.28} l${-lintel * 0.28} ${lintel * 0.28} l${-lintel * 0.28} ${-lintel * 0.28} Z`}
      fill={lit ? '#F2C230' : STONE.dark} stroke={STONE.line} strokeWidth={1} />
    {shade > 0 && <Rect x={0} y={0} width={width} height={height} fill={`rgba(0, 0, 0, ${shade})`} />}
  </G>
}

const look = themedStyles(() => ({
  hero: { padding: 6, gap: 0, overflow: 'hidden' },
  heroScene: { height: 184, borderRadius: retro() ? 6 : 14, overflow: 'hidden' },
  heroBadge: { position: 'absolute', left: 10, top: 10 },
  heroText: { padding: 12, paddingTop: 14, gap: 8 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 88 },
  stripScene: { width: 72, height: 72, borderRadius: retro() ? 6 : 14, overflow: 'hidden' },
  stripLine: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 20 },
  banner: { borderRadius: retro() ? 12 : 24, overflow: 'hidden' },
  bannerScene: { height: 150 },
  bannerText: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, gap: 8 },
  bannerEyebrow: { fontFamily: displayFont(), color: colors.onBrand, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, opacity: 0.92 },
  bannerTitle: { fontFamily: displayFont(fonts.black), color: colors.onBrand, fontSize: retro() ? 25 : 27, lineHeight: 33 },
  bannerLine: { fontFamily: fonts.bold, color: colors.onBrand, fontSize: 15, lineHeight: 21 },
  // The state, on a dark glass chip so it reads on any sky; lit in Rayquaza gold when an encounter waits.
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: retro() ? 4 : 999, backgroundColor: 'rgba(4, 16, 12, 0.62)' },
  badgeLit: { backgroundColor: '#F2C230' },
  badgeText: { fontFamily: displayFont(), color: '#FFFFFF', fontSize: 11, lineHeight: 15, letterSpacing: 1 },
  badgeTextLit: { color: '#1A1200' },
  unknown: { textAlign: 'center', fontFamily: fonts.black, color: 'rgba(255, 255, 255, 0.55)' }
}))
