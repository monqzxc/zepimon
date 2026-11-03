import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import type { ImageSourcePropType, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { routeCols, routeRunners, routeStrips } from './generated/adventure-route.js'
import { safariSprites } from './generated/safari-assets.js'
import { MILESTONE, metersAt, placeAt, placeFor, pointAt, regions, routeLayout, tourLength } from './adventure-route'
import type { Place, StripKind, StripShape } from './adventure-route'
import type { Activity } from './phone-adventure'
import { Frame } from './games/TileWorld'
import type { Strip } from './games/TileWorld'
import { trainerFrame } from './games/safari-view'
import { OverworldSprite } from './games/OverworldSprite'
import { Icon, colors, displayFont, fonts, gradient, retro, shadows, themedStyles, useTheme } from './ui'

// The Adventure tab's map: your distance as a place on one long route (src/adventure-route.ts). A stone pad marks every
// 5 km, named for a town, city or route of Kanto, Johto, Hoenn, Sinnoh and Unova, ticked once you have walked that far
// and locked ahead; tapping one shows what happened there (`tip`, for milestones reached) or how far it still is. You
// stand on a glowing pad of your own at your total, walking or running in place as `activity` says, your buddy beside
// you; `card` (what to do next) floats a fifth of the way up from the bottom, with `notice` above it. The place in view
// floats at the top left, the journey's mini-map button at the top right and `rail` under it; when you scroll your
// trainer out of view a button brings them back. The map is daylight pixel art in every theme, dimmed a little in dark
// mode; everything floating over it follows the theme.
const strips = routeStrips as Record<StripKind, StripShape & { source: ImageSourcePropType }>
const trainers = safariSprites as Record<'brendan' | 'may', Strip>
const runners = routeRunners as Record<'brendan' | 'may', Strip>
const effects = safariSprites as Record<'dust', Strip>
const native = Platform.OS !== 'web'
const pixelated = Platform.OS === 'web' ? { imageRendering: 'pixelated' as const } : {}
// The route's own ground and river, for the space around the strips.
const GROUND = '#73C5A4'
const WATER = '#73BDF6'
const MAX_WIDTH = 540
// The map is drawn a little narrower than the screen, so more of the route is in view.
const ZOOM = 0.95
// Milestones nearer you than this go unnamed on the map: your trainer and their tag stand over the name.
const NAMED = 3500
// Room above the farthest route for its sign, below the floating header.
const AHEAD = 150
// How far up from the bottom the card floats, as a share of the map's height: near the middle, the route still showing
// below it.
const LIFT = 0.2

export function RouteTrail({ meters, trainer, activity, buddy, reduced, card, cardWidth, rail, notice, tip }: {
  meters: number, trainer: 'brendan' | 'may', activity: Activity, buddy: string | null, reduced: boolean,
  card: ReactNode, cardWidth: number, rail: ReactNode, notice?: ReactNode, tip?: (meters: number) => ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: screen } = useWindowDimensions()
  const [size, setSize] = useState<{ width: number, height: number } | null>(null)
  const [dockHeight, setDockHeight] = useState(240)
  const layout = useMemo(() => routeLayout(meters, strips), [meters])
  const scroll = useRef<ScrollView>(null)
  const placed = useRef(false)
  const [inView, setInView] = useState<number | null>(null)
  const [away, setAway] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [journey, setJourney] = useState(false)

  const width = size?.width ?? screen
  const height = size?.height ?? 0
  const tile = Math.min(width, MAX_WIDTH) * ZOOM / routeCols
  const left = (width - tile * routeCols) / 2
  const top = insets.top + AHEAD
  const spot = pointAt(meters, layout.milestones)
  const here = { x: left + spot.x * tile, y: top + spot.y * tile }
  const pad = { width: tile * 3, height: tile * 1.5 }
  const mapBottom = top + layout.rows * tile
  // The card floats over the map, so the map scrolls on far enough to bring the trailhead above it.
  const lift = Math.round(height * LIFT)
  const content = mapBottom + lift + dockHeight + 24
  // The map in view runs from under the place's name to the top of the card; your trainer stands a little below its
  // middle, with the milestones on either side in view.
  const viewTop = insets.top + 70, viewBottom = height - lift - dockHeight - 12
  const focus = Math.max(0, Math.min(content - height, here.y - (viewTop + (viewBottom - viewTop) * 0.55)))

  // Place the map on your trainer once it has a size, and again when your distance moves them.
  useEffect(() => {
    if (!size) return
    scroll.current?.scrollTo({ y: focus, animated: placed.current && !reduced })
    placed.current = true
  }, [size?.height, meters, dockHeight]) // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y
    const index = placeAt(metersAt((y + (viewTop + viewBottom) / 2 - top) / tile, layout.milestones)).index
    if (index !== inView) setInView(index)
    const gone = here.y < y + viewTop || here.y > y + viewBottom
    if (gone !== away) setAway(gone)
  }

  const place = inView === null ? placeAt(meters) : placeFor(inView)
  const ahead = placeFor(layout.milestones.at(-1)!.meters / MILESTONE + 1)
  const reached = Math.floor(meters / MILESTONE) * MILESTONE
  const milestones = layout.milestones.filter(mark => mark.y * tile + top < mapBottom && Math.abs(mark.meters - meters) >= 1200)
  const tapped = milestones.find(mark => mark.meters === picked)

  return <View style={look.screen} onLayout={event => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
    {size && <ScrollView ref={scroll} style={look.map} contentContainerStyle={{ height: content }} showsVerticalScrollIndicator={false}
      scrollEventThrottle={32} onScroll={onScroll}>
      {left > 0 && <>
        <View style={[look.side, { left: 0, width: left, backgroundColor: WATER }]} />
        <View style={[look.side, { right: 0, width: left }]} />
      </>}
      {layout.strips.map(strip => <Image key={`${strip.kind}-${strip.index}`} source={strips[strip.kind].source} fadeDuration={0}
        resizeMode="stretch" accessible={false}
        style={{ position: 'absolute', left, top: top + strip.top * tile, width: tile * routeCols, height: strip.rows * tile, ...pixelated }} />)}
      {theme.dark && <View pointerEvents="none" style={[look.dim, { top, height: layout.rows * tile }]} />}
      <View pointerEvents="none" style={[look.ahead, { height: top + tile * 5 }, gradient(`linear-gradient(180deg, ${GROUND} 0%, ${GROUND} 45%, rgba(115, 197, 164, 0) 100%)`, 'transparent')]}>
        <View style={[look.sign, { marginTop: insets.top + 80, maxWidth: width - 140 }]}>
          <Text numberOfLines={1} style={look.signText}>{ahead.name.toUpperCase()} AND BEYOND</Text>
        </View>
      </View>
      {layout.strips.at(-1)!.kind !== 'start' && <View pointerEvents="none" style={[look.behind, { top: mapBottom - tile * 3, height: tile * 3 },
        gradient(`linear-gradient(180deg, rgba(115, 197, 164, 0) 0%, ${GROUND} 100%)`, 'transparent')]} />}
      {picked !== null && <Pressable accessibilityLabel="Close" style={look.fill} onPress={() => setPicked(null)} />}
      {milestones.map(mark => <Milestone key={mark.meters} meters={mark.meters} done={mark.meters <= meters} picked={picked === mark.meters}
        x={left + mark.x * tile} y={top + mark.y * tile} tile={tile} named={Math.abs(mark.meters - meters) >= NAMED}
        onPress={() => setPicked(was => was === mark.meters ? null : mark.meters)} />)}
      <Here meters={meters} x={here.x} y={here.y} tile={tile} pad={pad} trainer={trainer} activity={activity} buddy={buddy} reduced={reduced} />
      {/* Above the tapped pad and its badge, pointing down at it, over everything else on the map. */}
      {tapped && <Tip place={placeFor(tapped.meters / MILESTONE)} latest={tapped.meters === reached && tapped.meters > 0}
        togo={tapped.meters > meters ? tapped.meters - meters : null} x={left + tapped.x * tile} width={width}
        bottom={content - (top + tapped.y * tile - tile * 1.2) + 6}>
        {tapped.meters <= meters ? tip?.(tapped.meters) : null}
      </Tip>}
    </ScrollView>}
    <View pointerEvents="box-none" style={[look.top, { top: insets.top + 8 }]}>
      <View accessible accessibilityRole="header" accessibilityLabel={`${place.name}, ${place.region}, ${stretch(place)} kilometres`}
        style={[look.header, gradient(), shadows.raised]}>
        <View style={look.headerIcon}><Icon name="location" size={20} color={colors.onBrand} /></View>
        <View style={look.headerRule} />
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={look.headerEyebrow}>{place.region.toUpperCase()}{place.tour > 1 ? ` ${place.tour}` : ''} · {stretch(place)} KM</Text>
          <Text numberOfLines={1} style={look.headerTitle}>{place.name}</Text>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 10 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Journey map" accessibilityHint="Shows every region and how far you have come"
        hitSlop={4} onPress={() => setJourney(true)} style={({ pressed }) => [look.mini, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <Icon name="map" size={24} color={colors.edge} />
      </Pressable>
    </View>
    {/* Out of the way while a milestone's tip is open, which it would cover. */}
    <View pointerEvents={picked === null ? 'box-none' : 'none'} style={[look.rail, { top: insets.top + 76, opacity: picked === null ? 1 : 0 }]}>{rail}</View>
    {away && size && <Pressable accessibilityRole="button" accessibilityLabel="Back to your trainer" hitSlop={6}
      onPress={() => scroll.current?.scrollTo({ y: focus, animated: !reduced })}
      style={({ pressed }) => [look.recenter, { bottom: lift + dockHeight + 24, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <Icon name="locate" size={24} color={colors.edge} />
    </Pressable>}
    <View pointerEvents="box-none" style={[look.dock, { bottom: lift }]} onLayout={event => setDockHeight(event.nativeEvent.layout.height)}>
      {notice}
      <View style={[look.card, { width: Math.min(cardWidth, width - 24) }]}>{card}</View>
    </View>
    <MapSheet visible={journey} title="Journey" onClose={() => setJourney(false)} reduced={reduced}>
      <JourneyMap meters={meters} />
    </MapSheet>
  </View>
}

// The kilometres a place covers: the 5 km leading up to its milestone, or 0 where it all starts.
const stretch = (place: Place) => place.meters ? `${place.meters / 1000 - 5}–${place.meters / 1000}` : '0'

// A tapped milestone's tip: its place, region and distance, then what happened there (children) or, ahead, how far it
// still is. The latest milestone reached says so. x is the pad's centre; bottom places the tip above it in the map.
function Tip({ place, latest, togo, x, width, bottom, children }: {
  place: Place, latest: boolean, togo: number | null, x: number, width: number, bottom: number, children?: ReactNode
}) {
  const tipWidth = Math.min(264, width - 24)
  const left = Math.max(12, Math.min(width - tipWidth - 12, x - tipWidth / 2))
  return <View style={[look.tip, { left, width: tipWidth, bottom }]}>
    <View style={look.tipHead}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={look.tipRegion}>{place.region.toUpperCase()} · {place.meters / 1000} KM</Text>
        <Text numberOfLines={1} style={look.tipName}>{place.name}</Text>
      </View>
      {latest ? <View style={look.latest}><Icon name="star" size={13} color={colors.gold} /><Text style={look.latestText}>Latest</Text></View>
        : togo !== null && <Icon name="lock" size={18} color={colors.muted} />}
    </View>
    {togo !== null ? <Text style={look.tipLine}>{(togo / 1000).toFixed(1)} km to go</Text> : children}
    <View style={[look.tipArrow, { left: Math.max(14, Math.min(tipWidth - 28, x - left - 7)) }]} />
  </View>
}

// Each region's colour on the journey map.
const REGION_COLORS = ['#E0533F', '#C9971A', '#2E9C62', '#3B78E0', '#6A6E7C']
const PER_ROW = 12

// The mini-map: the whole journey at a glance. Every milestone of the tour is a dot on a path that snakes down row by
// row, coloured by region and filled once reached, with you on it; then the next place and each region's tally.
function JourneyMap({ meters }: { meters: number }) {
  const { width: screen } = useWindowDimensions()
  const width = Math.min(screen - 36, 460)
  const step = Math.floor(meters / MILESTONE)
  const here = step % tourLength
  const place = placeAt(meters)
  const next = placeFor(step + 1)
  const gapX = (width - 28) / (PER_ROW - 1), gapY = 24
  const rows = Math.ceil(tourLength / PER_ROW)
  const pos = (i: number) => {
    const row = Math.floor(i / PER_ROW), col = i % PER_ROW
    return { x: 14 + (row % 2 ? PER_ROW - 1 - col : col) * gapX, y: 14 + row * gapY }
  }
  const starts = regions.map((_, r) => regions.slice(0, r).reduce((sum, region) => sum + region.places.length, 0))
  const regionOf = (i: number) => starts.filter(start => i >= start).length - 1
  const from = pos(here), to = pos(Math.min(tourLength - 1, here + 1))
  const share = (meters % MILESTONE) / MILESTONE
  const you = from.y === to.y ? { x: from.x + (to.x - from.x) * share, y: from.y } : from
  const togo = ((next.meters - meters) / 1000).toFixed(1)
  return <View style={{ gap: 14 }}>
    <View style={look.journeyHead}>
      <View style={{ flex: 1 }}>
        <Text style={look.tipRegion}>{place.region.toUpperCase()}{place.tour > 1 ? ` · TOUR ${place.tour}` : ''}</Text>
        <Text numberOfLines={1} style={look.journeyPlace}>{place.name}</Text>
      </View>
      <Text style={look.journeyKm}>{(Math.floor(meters / 100) / 10).toFixed(1)}<Text style={look.journeyUnit}> km</Text></Text>
    </View>
    <View accessible accessibilityLabel={`Journey map: ${here + 1} of ${tourLength} places reached. Next, ${next.name} in ${togo} km`} style={{ alignSelf: 'center' }}>
      <Svg width={width} height={28 + (rows - 1) * gapY}>
        {Array.from({ length: tourLength - 1 }, (_, i) => {
          const a = pos(i), b = pos(i + 1)
          const d = a.y === b.y ? `M${a.x} ${a.y} L${b.x} ${b.y}` : `M${a.x} ${a.y} A${gapY / 2} ${gapY / 2} 0 0 ${a.x > width / 2 ? 1 : 0} ${b.x} ${b.y}`
          return <Path key={i} d={d} stroke={i < here ? REGION_COLORS[regionOf(i + 1)] : colors.line} strokeWidth={4} strokeLinecap="round" fill="none" />
        })}
        {Array.from({ length: tourLength }, (_, i) => {
          const { x, y } = pos(i), color = REGION_COLORS[regionOf(i)], first = starts.includes(i), done = i <= here
          return <Circle key={i} cx={x} cy={y} r={first ? 6 : 4} fill={done ? color : colors.panel} stroke={done ? colors.panel : color} strokeWidth={first ? 2.5 : 1.5} />
        })}
        <Circle cx={you.x} cy={you.y} r={9} fill={colors.edge} stroke="#FFFFFF" strokeWidth={3} />
      </Svg>
    </View>
    <View style={look.nextRow}>
      <Icon name="missions" size={18} color={colors.edge} />
      <Text numberOfLines={1} style={look.nextText}>{next.name}</Text>
      <Text style={look.nextKm}>{togo} km</Text>
    </View>
    <View style={look.legend}>
      {regions.map((region, r) => {
        const total = region.places.length
        const done = Math.max(0, Math.min(total, here - starts[r] + 1))
        return <View key={region.name} accessible accessibilityLabel={`${region.name}: ${done} of ${total} places`} style={look.legendItem}>
          <View style={[look.legendDot, { backgroundColor: REGION_COLORS[r] }]} />
          <Text style={look.legendName}>{region.name}</Text>
          <Text style={look.legendCount}>{done}/{total}</Text>
        </View>
      })}
    </View>
  </View>
}

// A stone pad every 5 km, its place's name below (named, unless it is so close to you that your trainer stands over
// it; the header names that one): ticked once you have come that far, locked ahead. Tap it for its tip.
function Milestone({ meters, done, picked, x, y, tile, named, onPress }: {
  meters: number, done: boolean, picked: boolean, x: number, y: number, tile: number, named: boolean, onPress: () => void
}) {
  const width = tile * 2.3, height = tile * 1.2, badge = Math.round(tile * 0.72)
  const km = meters / 1000
  const name = placeFor(meters / MILESTONE).name
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${km} km milestone, ${done ? 'reached' : 'still ahead'}`}
    accessibilityState={{ expanded: picked }} onPress={onPress} hitSlop={6}
    style={({ pressed }) => ({ position: 'absolute', left: x - width / 2, top: y - height / 2, width, height, alignItems: 'center',
      transform: [{ scale: pressed || picked ? 1.08 : 1 }] })}>
    <View style={[look.pad, done ? look.padDone : look.padLocked, picked && look.padPicked, { width, height, borderRadius: height / 2 }]}>
      <Text style={[look.padText, { fontSize: Math.round(tile * 0.5), lineHeight: Math.round(tile * 0.62) }, !done && look.padTextLocked]}>
        {km}<Text style={{ fontSize: Math.round(tile * 0.32) }}> km</Text></Text>
    </View>
    <View style={[look.badge, done ? look.badgeDone : look.badgeLocked, { width: badge, height: badge, borderRadius: badge / 2, top: -badge * 0.62 }]}>
      {done ? <Svg width={badge * 0.6} height={badge * 0.6} viewBox="0 0 24 24">
        <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg> : <Icon name="lock" size={Math.round(badge * 0.58)} color="#FFFFFF" />}
    </View>
    {named && <View pointerEvents="none" style={[look.placeTag, { top: height + 3, width: tile * 4.6, left: width / 2 - tile * 2.3 }]}>
      <Text numberOfLines={1} style={[look.placeText, !done && look.placeTextLocked, { fontSize: Math.max(10, Math.round(tile * 0.34)) }]}>{name}</Text>
    </View>}
  </Pressable>
}

// You: your total on a glowing pad, the trainer standing on it with your buddy at their side, and a bobbing "You" tag.
function Here({ meters, x, y, tile, pad, trainer, activity, buddy, reduced }: {
  meters: number, x: number, y: number, tile: number, pad: { width: number, height: number }, trainer: 'brendan' | 'may', activity: Activity,
  buddy: string | null, reduced: boolean
}) {
  const [pulse] = useState(() => new Animated.Value(0))
  const [bob] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) { pulse.setValue(0); bob.setValue(0); return }
    const loops = [
      Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: native })),
      Animated.loop(Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native })
      ]))
    ]
    loops.forEach(loop => loop.start())
    return () => loops.forEach(loop => loop.stop())
  }, [reduced, pulse, bob])
  const person = { width: tile * 1.5, height: tile * 3 }
  const feet = y - pad.height * 0.12
  const species = buddy?.replace(/^Shiny /, '') ?? null
  const friend = tile * 2
  const label = `${(Math.floor(meters / 100) / 10).toFixed(1)} km`
  return <>
    <Animated.View pointerEvents="none" style={[look.ring, { left: x - pad.width / 2, top: y - pad.height / 2, width: pad.width, height: pad.height,
      borderRadius: pad.height / 2, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 0.55, 0] }),
      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] }]} />
    <View accessible accessibilityLabel={`You are here: ${label} walked and run in all`}
      style={[look.here, gradient(), { left: x - pad.width / 2, top: y - pad.height / 2, width: pad.width, height: pad.height, borderRadius: pad.height / 2,
        paddingTop: pad.height * 0.42 }]}>
      <Text numberOfLines={1} style={[look.hereText, { fontSize: Math.round(tile * 0.5) }]}>{label}</Text>
    </View>
    {species && <View pointerEvents="none" style={{ position: 'absolute', left: x - person.width / 2 - friend * 0.92, top: feet - friend * 0.88 }}>
      <OverworldSprite name={species} shiny={buddy!.startsWith('Shiny ')} size={friend} />
    </View>}
    <Trainer trainer={trainer} activity={activity} reduced={reduced} x={x} feet={feet} tile={tile} person={person} />
    <Animated.View pointerEvents="none" style={[look.tag, { left: x - 40, top: feet - person.height - 34,
      transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}>
      <Text style={look.tagText}>You</Text>
      <View style={look.tagTail} />
    </Animated.View>
  </>
}

// The trainer stepping in place, facing you, as the activity picked: an unhurried walk on the Safari Zone's walking
// strip, or the running strip at more than twice the pace, bouncing, with dust kicked up at each stride. Still with
// reduced motion: standing to walk, mid-stride to run.
const WALK_MS = 320
const RUN_MS = 120
const STRIDE = [0, 1, 0, 2] as const
function Trainer({ trainer, activity, reduced, x, feet, tile, person }: {
  trainer: 'brendan' | 'may', activity: Activity, reduced: boolean, x: number, feet: number, tile: number, person: { width: number, height: number }
}) {
  const running = activity === 'running'
  const [step, setStep] = useState(0)
  const [bounce] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) { bounce.setValue(0); return }
    const timer = setInterval(() => setStep(value => (value + 1) % STRIDE.length), running ? RUN_MS : WALK_MS)
    const hop = running ? Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: RUN_MS, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(bounce, { toValue: 0, duration: RUN_MS, easing: Easing.in(Easing.quad), useNativeDriver: native })
    ])) : null
    hop?.start()
    return () => { clearInterval(timer); hop?.stop(); bounce.setValue(0) }
  }, [running, reduced, bounce])
  const phase = reduced ? (running ? 1 : 0) : STRIDE[step]
  const dust = tile * 1.1
  return <>
    {running && !reduced && phase !== 0 && <View pointerEvents="none" style={{ position: 'absolute', top: feet - dust * 0.42,
      left: x + (phase === 1 ? -person.width / 2 - dust * 0.35 : person.width / 2 - dust * 0.65) }}>
      <Frame strip={effects.dust} frame={step % 3} width={dust} height={dust / 2} />
    </View>}
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - person.width / 2, top: feet - person.height,
      transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -tile * 0.18] }) }] }}>
      <Frame strip={running ? runners[trainer] : trainers[trainer]} frame={trainerFrame('south', phase)} width={person.width} height={person.height} />
    </Animated.View>
  </>
}

// A sheet over the map, sliding up from the bottom: the egg, or where your location stands.
export function MapSheet({ visible, title, onClose, reduced, children }: {
  visible: boolean, title: string, onClose: () => void, reduced: boolean, children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [slide] = useState(() => new Animated.Value(0))
  const [opened, setOpened] = useState(visible)
  const [leaving, setLeaving] = useState(false)
  if (visible !== opened) {
    setOpened(visible)
    if (!visible && !reduced) setLeaving(true)
  }
  useEffect(() => {
    if (reduced) { slide.setValue(visible ? 1 : 0); return }
    if (!visible && !leaving) return
    const run = visible ? Animated.spring(slide, { toValue: 1, speed: 14, bounciness: 4, useNativeDriver: native })
      : Animated.timing(slide, { toValue: 0, duration: 190, easing: Easing.in(Easing.quad), useNativeDriver: native })
    run.start(({ finished }) => { if (finished && !visible) setLeaving(false) })
    return () => run.stop()
  }, [visible, leaving, reduced, slide])
  return <Modal visible={visible || leaving} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Animated.View style={[look.scrim, { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal style={[look.sheet, { maxHeight: height * 0.88, paddingBottom: insets.bottom + 18,
      transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] }) }] }]}>
      <View style={look.grabber} />
      <View style={look.sheetHead}>
        <Text accessibilityRole="header" style={look.sheetTitle}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={look.close}>
          <Icon name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
    </Animated.View>
  </Modal>
}

const look = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: GROUND, overflow: 'hidden' },
  map: { flex: 1 },
  side: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GROUND },
  dim: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(8, 14, 32, 0.3)' },
  ahead: { position: 'absolute', top: 0, left: 0, right: 0, paddingLeft: 12, alignItems: 'flex-start' },
  behind: { position: 'absolute', left: 0, right: 0 },
  sign: { gap: 2, paddingHorizontal: 16, paddingVertical: 10, borderRadius: retro() ? 8 : 18,
    backgroundColor: 'rgba(255, 255, 255, 0.82)', borderWidth: 2, borderColor: 'rgba(60, 120, 95, 0.35)' },
  signText: { fontFamily: displayFont(fonts.black), fontSize: 13, letterSpacing: 1, color: '#2D5444' },
  pad: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderBottomWidth: 5, boxShadow: '0px 3px 0px rgba(30, 60, 45, 0.28)' },
  padDone: { backgroundColor: '#F3F6F9', borderColor: '#C3CDD8' },
  padLocked: { backgroundColor: '#AEB7C1', borderColor: '#808B97' },
  padPicked: { borderColor: colors.brandFrom },
  placeTag: { position: 'absolute', alignItems: 'center' },
  placeText: { fontFamily: fonts.heavy, color: '#24402F', backgroundColor: 'rgba(255, 255, 255, 0.85)', overflow: 'hidden', paddingHorizontal: 7,
    paddingVertical: 1, borderRadius: retro() ? 4 : 999 },
  placeTextLocked: { color: '#4D5A66', backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tip: { position: 'absolute', backgroundColor: colors.panel, borderRadius: retro() ? 10 : 20, padding: 12, gap: 10,
    ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` } : { boxShadow: `0px 10px 28px ${colors.shadow}` }) },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipRegion: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1, color: colors.muted },
  tipName: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 16 : 18, lineHeight: 23, color: colors.ink },
  tipLine: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  tipArrow: { position: 'absolute', bottom: -7, width: 14, height: 14, backgroundColor: colors.panel, transform: [{ rotate: '45deg' }],
    ...(retro() ? { borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.frameOuter } : null) },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.goldTint },
  latestText: { fontFamily: fonts.black, fontSize: 11, color: colors.gold },
  mini: { width: 52, height: 52, borderRadius: retro() ? 12 : 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel,
    ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` } : { boxShadow: `0px 6px 16px ${colors.shadow}` }) },
  journeyHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  journeyPlace: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 18 : 21, lineHeight: 27, color: colors.ink },
  journeyKm: { fontFamily: fonts.black, fontSize: 24, lineHeight: 30, color: colors.ink },
  journeyUnit: { fontFamily: fonts.heavy, fontSize: 14, color: colors.muted },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: 14, backgroundColor: colors.mint },
  nextText: { flex: 1, fontFamily: fonts.heavy, fontSize: 14, color: colors.ink },
  nextKm: { fontFamily: fonts.black, fontSize: 14, color: colors.edge },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.sunken },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { fontFamily: fonts.heavy, fontSize: 12, color: colors.ink },
  legendCount: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  padText: { fontFamily: fonts.black, color: '#2E3B48' },
  padTextLocked: { color: '#F5F7FA' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
    boxShadow: '0px 2px 4px rgba(20, 40, 60, 0.3)' },
  badgeDone: { backgroundColor: '#2F8BEA' },
  badgeLocked: { backgroundColor: '#6D7884' },
  ring: { position: 'absolute', borderWidth: 4, borderColor: colors.brandFrom },
  here: { position: 'absolute', alignItems: 'center', borderWidth: 3, borderColor: '#FFFFFF', boxShadow: `0px 4px 14px ${colors.glow}` },
  hereText: { fontFamily: fonts.black, color: colors.onBrand, letterSpacing: 0.2 },
  tag: { position: 'absolute', width: 80, alignItems: 'center' },
  tagText: { fontFamily: displayFont(fonts.black), fontSize: 13, color: colors.onEdge, backgroundColor: colors.edge, overflow: 'hidden',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: retro() ? 6 : 999 },
  tagTail: { width: 10, height: 10, marginTop: -6, backgroundColor: colors.edge, transform: [{ rotate: '45deg' }] },
  // The notice, if any, and the card, floating over the map (bottom is set by LIFT).
  dock: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 10 },
  card: { alignSelf: 'center', backgroundColor: colors.panel, borderRadius: retro() ? 12 : 22, padding: 12, gap: 10,
    ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` } : { boxShadow: `0px 10px 28px ${colors.shadow}` }) },
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minHeight: 58, paddingLeft: 12, paddingRight: 18, paddingVertical: 8,
    borderRadius: retro() ? 12 : 20, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.55)' },
  headerIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  headerRule: { width: 1.5, alignSelf: 'stretch', marginVertical: 4, backgroundColor: 'rgba(255, 255, 255, 0.4)' },
  headerEyebrow: { fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1, color: colors.onBrand, opacity: 0.88 },
  headerTitle: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 17 : 19, lineHeight: 24, color: colors.onBrand },
  rail: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 10 },
  recenter: { position: 'absolute', right: 16, bottom: 16, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.panel, boxShadow: `0px 6px 16px ${colors.shadow}`, ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter } : null) },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.panel, paddingHorizontal: 18, paddingTop: 10, gap: 12,
    borderTopLeftRadius: retro() ? 12 : 28, borderTopRightRadius: retro() ? 12 : 28, boxShadow: `0px -10px 30px ${colors.shadow}`,
    ...(retro() ? { borderWidth: 2, borderBottomWidth: 0, borderColor: colors.frameOuter } : null) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 18 : 20, lineHeight: 26 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }
}))
