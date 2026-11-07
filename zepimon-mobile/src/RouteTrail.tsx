import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import type { ImageSourcePropType, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import Svg, { Circle, Path, Polyline } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomTabBarHeightContext } from 'expo-router/tabs'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Reanimated, { Easing as Ease, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated'
import type { SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { routeCols, routeRunners, routeStrips } from './generated/adventure-route.js'
import { safariSprites } from './generated/safari-assets.js'
import { MILESTONE, metersAt, placeAt, placeFor, pointAt, regions, routeLayout, tourLength } from './adventure-route'
import type { Place, StripKind, StripShape } from './adventure-route'
import type { Activity } from './phone-adventure'
import { KANTO_HEIGHT, KANTO_WIDTH, kantoRoad } from './kanto-map'
import { JOHTO_HEIGHT, JOHTO_WIDTH, johtoRoad } from './johto-map'
import { cameraBounds, clampCamera, nearestOf, roadPoint, roadTrail } from './town-map'
import type { Camera, Point, TownRoad } from './town-map'
import { Frame } from './games/TileWorld'
import type { Strip } from './games/TileWorld'
import { trainerFrame } from './games/safari-view'
import { OverworldSprite } from './games/OverworldSprite'
import { Icon, colors, displayFont, fonts, gradient, retro, themedStyles, useTheme } from './ui'
import { FLOAT_REACH } from './TabBar'

// The Adventure tab's map: your distance as a place on one long route (src/adventure-route.ts). A stone pad marks every
// 2 km, named for a town, city or route of Kanto, Johto, Hoenn, Sinnoh and Unova, ticked once you have walked that far
// and locked ahead; tapping one shows what happened there (`tip`, for milestones reached) or how far it still is. You
// stand on a glowing pad of your own at your total, walking or running in place as `activity` says, your buddy beside
// you; `card` (what to do next) floats just above the bottom, with `notice` above it. `folded` shrinks the card into its
// bottom right corner, where `bubble` pops up in its place, and back. The place in view floats at the top left, the
// journey's mini-map and change-map buttons at the top right and `rail` under them; when you scroll your trainer out of
// view a button brings them back. Change map shows another region's town map to look around, without your trainer,
// until you go back. The map is daylight pixel art in every theme, dimmed a little in dark mode; everything floating
// over it follows the theme.
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
const NAMED = MILESTONE * 0.7
// Nearer than this, a milestone is under your trainer and left out.
const UNDERFOOT = MILESTONE * 0.24
// Room above the farthest route for its sign, below the floating header.
const AHEAD = 150
// How far the card floats above the bottom of the map, or, on the tab, above the Pokemon floating over the tab bar's
// ball, which the map runs on behind.
const LIFT = 24
const FLOAT_GAP = 16
// The folded card's bubble, and how the card folds into it and opens again.
const BUBBLE = 58
const FOLD = { duration: 340, easing: Ease.bezier(0.2, 0, 0, 1) }
// Kanto and Johto are drawn on their own town maps (src/kanto-map.ts, src/johto-map.ts), from Pallet Town to Johto's
// Route 26; the regions after them walk the strips. The road still ahead is part of the art
// (scripts/build-town-map.py); only the stretch walked is drawn here. Around the edges is the map's own open sea, a
// seamless tile laid out 4 x 4 into one block (seaBlock), in its colour (seaColor) beyond. first is the milestone of
// the map's first stop; Johto's walk comes in from Kanto's last stop at its edge.
type TownMap = { region: string, art: ImageSourcePropType, sea: ImageSourcePropType, seaBlock: { width: number, height: number },
  seaColor: string, width: number, height: number, road: TownRoad, first: number }
const townMaps: TownMap[] = [
  { region: 'Kanto', art: require('../assets/route/kanto.jpg'), sea: require('../assets/route/kanto-sea.jpg'), seaBlock: { width: 1520, height: 1280 },
    seaColor: '#0E62DC', width: KANTO_WIDTH, height: KANTO_HEIGHT, road: kantoRoad, first: 0 },
  { region: 'Johto', art: require('../assets/route/johto.jpg'), sea: require('../assets/route/johto-sea.jpg'), seaBlock: { width: 1520, height: 720 },
    seaColor: '#1778E3', width: JOHTO_WIDTH, height: JOHTO_HEIGHT, road: johtoRoad, first: kantoRoad.stops.length }
]
// The distances a town map's walk starts and ends at: its first stop, or its entry the milestone before, to its last.
const roadStart = (map: TownMap) => (map.first - (map.road.legs.length - map.road.stops.length + 1)) * MILESTONE
const roadEnd = (map: TownMap) => (map.first + map.road.stops.length - 1) * MILESTONE
// The town map a distance is on, the first time round; on a stop where two meet, the one it ends.
const townMapAt = (meters: number) => townMaps.find(map => meters >= roadStart(map) && meters <= roadEnd(map))
// Places reached on a town map.
const reachedOn = (map: TownMap, meters: number) => Math.max(0, Math.min(map.road.stops.length, Math.floor(meters / MILESTONE) - map.first + 1))
// A town map is drawn this many times the screen's height, so a few stops are in view at once.
const TOWN_ZOOM = 1.45
// Pinching zooms in up to this many times that, and out until the whole map is in view.
const TOWN_MAX_ZOOM = 2
// Zoomed out further than this, only towns and cities keep their names, as on the games' Town Map.
const ROUTE_NAMES = 0.7
const GLIDE = { duration: 380, easing: Ease.out(Ease.cubic) }
// About how tall a milestone's tip stands, to keep it in view above its marker.
const TIP_ROOM = 230

export function RouteTrail({ meters, trainer, activity, buddy, reduced, card, cardWidth, folded = false, bubble, rail, notice, tip }: {
  meters: number, trainer: 'brendan' | 'may', activity: Activity, buddy: string | null, reduced: boolean,
  card: ReactNode, cardWidth: number, folded?: boolean, bubble?: ReactNode, rail: ReactNode, notice?: ReactNode,
  tip?: (meters: number) => ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0
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
  const [maps, setMaps] = useState(false)
  const [recenter, setRecenter] = useState(0)
  // The town map you are on, if any, and the one shown: another picked to look around, or yours.
  const current = townMapAt(meters)
  const [viewing, setViewing] = useState<string | null>(null)
  const shown = viewing === null ? current : townMaps.find(map => map.region === viewing)
  const browsing = viewing !== null
  const fold = useSharedValue(folded ? 1 : 0)
  useEffect(() => { fold.set(reduced ? (folded ? 1 : 0) : withTiming(folded ? 1 : 0, FOLD)) }, [folded, reduced, fold])

  const width = size?.width ?? screen
  const height = size?.height ?? 0
  const tile = Math.min(width, MAX_WIDTH) * ZOOM / routeCols
  const left = (width - tile * routeCols) / 2
  const top = insets.top + AHEAD
  const spot = pointAt(meters, layout.milestones)
  const here = { x: left + spot.x * tile, y: top + spot.y * tile }
  const pad = { width: tile * 3, height: tile * 1.5 }
  const mapBottom = top + layout.rows * tile
  // The card floats over the map, so the map scrolls on far enough to bring the trailhead above it. Folded, only its
  // bubble does.
  const lift = tabBar > 0 ? FLOAT_REACH + FLOAT_GAP : LIFT
  const room = folded && bubble ? BUBBLE : dockHeight
  const content = mapBottom + lift + room + 24
  // The map in view runs from under the place's name to the top of the card; your trainer stands a little below its
  // middle, with the milestones on either side in view.
  const viewTop = insets.top + 60, viewBottom = height - lift - room - 12
  const focus = Math.max(0, Math.min(content - height, here.y - (viewTop + (viewBottom - viewTop) * 0.55)))

  // Place the map on your trainer once it has a size, and again when your distance moves them or you come back to it.
  useEffect(() => {
    if (!size || shown) return
    scroll.current?.scrollTo({ y: focus, animated: placed.current && !reduced })
    placed.current = true
  }, [size?.height, meters, room, shown]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shows a town map (a region's name), or the map you are on (null). The new one starts where it focuses, untouched.
  function view(region: string | null) {
    setViewing(region === current?.region ? null : region)
    setPicked(null); setInView(null); setAway(false)
    placed.current = false
  }

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
  const milestones = layout.milestones.filter(mark => mark.y * tile + top < mapBottom && Math.abs(mark.meters - meters) >= UNDERFOOT)
  const tapped = milestones.find(mark => mark.meters === picked)
  // Folding, the card shrinks towards its bottom right corner as it fades, ending where the bubble grows in.
  const cardSize = Math.min(cardWidth, width - 24)
  const shift = (width - 24 - cardSize) / 2
  const cardMotion = useAnimatedStyle(() => ({ opacity: interpolate(fold.get(), [0, 0.7], [1, 0], 'clamp'),
    transform: [{ translateX: shift * fold.get() }, { scale: 1 - 0.82 * fold.get() }] }), [shift])
  const bubbleMotion = useAnimatedStyle(() => ({ opacity: interpolate(fold.get(), [0.4, 0.85], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(fold.get(), [0.4, 1], [0.4, 1], 'clamp') }] }))

  return <View style={[look.screen, shown && { backgroundColor: shown.seaColor }]}
    onLayout={event => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
    {size && shown && <TownMapBody key={shown.region} map={shown} meters={meters} width={width} height={height} viewTop={viewTop} viewBottom={viewBottom}
      trainer={trainer} activity={activity} buddy={buddy} reduced={reduced} dark={theme.dark} picked={picked} onPick={setPicked} tip={tip}
      recenter={recenter} onPlace={setInView} onAway={setAway} />}
    {size && !shown && <ScrollView ref={scroll} style={look.map} contentContainerStyle={{ height: content }} showsVerticalScrollIndicator={false}
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
        style={look.header}>
        <View pointerEvents="none" style={look.rule} />
        <View style={look.headerIcon}><Icon name="location" size={16} color={colors.edge} /></View>
        <View style={look.headerRule} />
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={look.headerEyebrow}>{place.region.toUpperCase()}{place.tour > 1 ? ` ${place.tour}` : ''} · {stretch(place)} KM</Text>
          <Text numberOfLines={1} style={look.headerTitle}>{place.name}</Text>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 10 }} />
      <View style={look.topButtons}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change map" accessibilityHint="Shows another region's map to look around"
          hitSlop={4} onPress={() => setMaps(true)} style={({ pressed }) => [look.mini, browsing && look.miniOn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
          <Icon name="layers" size={20} color={browsing ? colors.onEdge : colors.edge} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Journey map" accessibilityHint="Shows every region and how far you have come"
          hitSlop={4} onPress={() => setJourney(true)} style={({ pressed }) => [look.mini, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
          <Icon name="map" size={20} color={colors.edge} />
        </Pressable>
      </View>
    </View>
    {/* Out of the way while a milestone's tip is open, which it would cover. */}
    <View pointerEvents={picked === null ? 'box-none' : 'none'} style={[look.rail, { top: insets.top + 62, opacity: picked === null ? 1 : 0 }]}>{rail}</View>
    {away && size && !browsing && <Pressable accessibilityRole="button" accessibilityLabel="Back to your trainer" hitSlop={6}
      onPress={() => {
        if (!shown) { scroll.current?.scrollTo({ y: focus, animated: !reduced }); return }
        setPicked(null)
        setRecenter(count => count + 1)
      }}
      style={({ pressed }) => [look.recenter, { bottom: lift + room + 14, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <Icon name="locate" size={20} color={colors.edge} />
    </Pressable>}
    {/* Looking around another region's map: which one, and the way back to yours. */}
    {browsing && size && <View pointerEvents="box-none" style={[look.viewingRow, { bottom: lift + room + 14 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Viewing ${viewing}. Back to your map`} hitSlop={6}
        onPress={() => view(null)} style={({ pressed }) => [look.viewing, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
        <View pointerEvents="none" style={look.rule} />
        <Text numberOfLines={1} style={look.viewingText}>Viewing {viewing}</Text>
        <View style={look.headerRule} />
        <Icon name="locate" size={16} color={colors.edge} />
        <Text style={look.viewingBack}>Back to you</Text>
      </Pressable>
    </View>}
    <View pointerEvents="box-none" style={[look.dock, { bottom: lift }]} onLayout={event => setDockHeight(event.nativeEvent.layout.height)}>
      {notice}
      <Reanimated.View pointerEvents={folded ? 'none' : 'auto'} aria-hidden={folded} importantForAccessibility={folded ? 'no-hide-descendants' : 'auto'}
        style={[look.card, { width: cardSize }, cardMotion]}>
        <View pointerEvents="none" style={look.rule} />
        {card}
      </Reanimated.View>
    </View>
    {bubble && <Reanimated.View pointerEvents={folded ? 'box-none' : 'none'} aria-hidden={!folded}
      importantForAccessibility={folded ? 'auto' : 'no-hide-descendants'} style={[look.bubble, { bottom: lift }, bubbleMotion]}>
      {bubble}
    </Reanimated.View>}
    <MapSheet visible={journey} title="Journey" onClose={() => setJourney(false)} reduced={reduced}>
      <JourneyMap meters={meters} map={current} />
    </MapSheet>
    <MapSheet visible={maps} title="Change map" onClose={() => setMaps(false)} reduced={reduced}>
      <MapPicker meters={meters} current={current} shown={shown} onPick={region => { setMaps(false); view(region) }} />
    </MapSheet>
  </View>
}

// The kilometres a place covers: the milestone's distance leading up to it, or 0 where it all starts.
const stretch = (place: Place) => place.meters ? `${(place.meters - MILESTONE) / 1000}–${place.meters / 1000}` : '0'

// A tapped milestone's tip: its place, region and distance, then what happened there (children) or, ahead, how far it
// still is. The latest milestone reached says so. x is the pad's centre; bottom places the tip above it, or top below it,
// pointing at it either way.
function Tip({ place, latest, togo, x, width, bottom, top, children }: {
  place: Place, latest: boolean, togo: number | null, x: number, width: number, bottom?: number, top?: number, children?: ReactNode
}) {
  const tipWidth = Math.min(264, width - 24)
  const left = Math.max(12, Math.min(width - tipWidth - 12, x - tipWidth / 2))
  const below = top !== undefined
  return <View style={[look.tip, below ? { left, width: tipWidth, top } : { left, width: tipWidth, bottom }]}>
    <View pointerEvents="none" style={look.rule} />
    <View style={look.tipHead}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={look.tipRegion}>{place.region.toUpperCase()} · {place.meters / 1000} KM</Text>
        <Text numberOfLines={1} style={look.tipName}>{place.name}</Text>
      </View>
      {latest ? <View style={look.latest}><Icon name="star" size={13} color={colors.gold} /><Text style={look.latestText}>Latest</Text></View>
        : togo !== null && <Icon name="lock" size={18} color={colors.muted} />}
    </View>
    {togo !== null ? <Text style={look.tipLine}>{(togo / 1000).toFixed(1)} km to go</Text> : children}
    <View style={[look.tipArrow, below && look.tipArrowUp, { left: Math.max(14, Math.min(tipWidth - 28, x - left - 7)) }]} />
  </View>
}

// A town map: drag it about and pinch to zoom, like the games' Town Map. The road ahead is part of the art; the
// stretch walked is drawn over it in gold, with a marker at every stop: a square for a town or city, a dot for a route,
// lit once reached. Your trainer stands on the road at your total, if it is on this map; on a map you are only looking
// around, the view starts at the stop nearest where you have been (its last, or first). Markers and your trainer keep
// their size at any zoom, and zoomed out only towns and cities keep their names. The camera moves on the UI thread, so
// nothing here renders again while you drag or pinch: it starts on your trainer and comes back with `recenter`; a
// gesture closes a tip, and where it settles names the place in view (onPlace, a milestone; null is where you are) and
// says whether you are out of view (onAway). The art is the map's own; dark mode dims it a little.
type Shot = Camera & { zoom: number }
const TownMapBody = memo(function TownMapBody({ map, meters, width, height, viewTop, viewBottom, trainer, activity, buddy, reduced, dark, picked, onPick, tip, recenter, onPlace, onAway }: {
  map: TownMap, meters: number, width: number, height: number, viewTop: number, viewBottom: number, trainer: 'brendan' | 'may', activity: Activity,
  buddy: string | null, reduced: boolean, dark: boolean, picked: number | null, onPick: (meters: number | null) => void,
  tip?: (meters: number) => ReactNode, recenter: number, onPlace: (index: number | null) => void, onAway: (away: boolean) => void
}) {
  const { stops } = map.road
  const scale = Math.max(width / map.width, height * TOWN_ZOOM / map.height)
  const W = map.width * scale, H = map.height * scale
  // Your distance along this map's road, and whether you stand on it.
  const along = meters - roadStart(map)
  const here = meters >= roadStart(map) && meters <= roadEnd(map)
  const [hx, hy] = roadPoint(map.road, along, MILESTONE)
  const [fx, fy] = here ? [hx, hy] : (along < 0 ? stops[0] : stops[stops.length - 1]).at
  // The map may be dragged until its edges meet the screen's, its top below the place's name and its bottom above the
  // card, and zoomed out until all of it fits between them.
  const view = { width, top: viewTop - 24, bottom: viewBottom }
  const least = Math.min(1, width / W, (view.bottom - view.top) / H)
  const bounds = (zoom: number) => cameraBounds(zoom, { width: W, height: H }, view)
  const focus = (zoom: number): Shot => ({ ...clampCamera({ x: width / 2 - fx * scale * zoom,
    y: viewTop + (viewBottom - viewTop) * 0.55 - fy * scale * zoom }, bounds(zoom)), zoom })
  const start = focus(1)
  const x = useSharedValue(start.x), y = useSharedValue(start.y), zoom = useSharedValue(1)
  // Where the camera was headed when a tip opened, so the tip stands by its marker while the map glides there.
  const [shot, setShot] = useState(start)
  const placed = useRef(false)
  const tile = 14 * scale
  // A pill a little deeper than the strips', so the total reads below your trainer's feet.
  const pad = { width: 72, height: 32, labelTop: 15 }
  const walked = useMemo(() => roadTrail(map.road, along, MILESTONE).walked, [map, along])
  const reached = Math.floor(meters / MILESTONE) * MILESTONE

  // Where the camera came to rest: a drag names the stop nearest the middle of the view; otherwise it is on your
  // trainer, and the place is yours, or on a map you are not on, the stop it starts at.
  function report(at: Shot, dragged: boolean) {
    const s = scale * at.zoom
    onPlace(dragged ? map.first + nearestOf(stops, [(width / 2 - at.x) / s, ((viewTop + viewBottom) / 2 - at.y) / s])
      : here ? null : map.first + (along < 0 ? 0 : stops.length - 1))
    const px = hx * s + at.x, py = hy * s + at.y
    onAway(here && dragged && (px < 0 || px > width || py < viewTop || py > viewBottom))
  }
  // Gestures, glides and the markers (memos) reach the latest render through these.
  const latest = useRef<{ report: (at: Shot, dragged: boolean) => void, open: (at: number) => void }>(null)
  const [settled] = useState(() => (cx: number, cy: number, z: number, dragged: boolean) => latest.current?.report({ x: cx, y: cy, zoom: z }, dragged))
  const [onOpen] = useState(() => (at: number) => latest.current?.open(at))

  function glide(to: Shot, animated: boolean, dragged: boolean) {
    cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom)
    if (!animated) { x.set(to.x); y.set(to.y); zoom.set(to.zoom); report(to, dragged); return }
    zoom.set(withTiming(to.zoom, GLIDE))
    y.set(withTiming(to.y, GLIDE))
    x.set(withTiming(to.x, GLIDE, finished => {
      'worklet'
      if (finished) scheduleOnRN(settled, to.x, to.y, to.zoom, dragged)
    }))
  }
  // Tapping a marker opens its tip, or closes it again. One too near the top or the sides for its tip glides into view
  // first, the tip's height below the place's name.
  function open(at: number) {
    if (picked === at) { onPick(null); return }
    const item = stops[at / MILESTONE - map.first]
    cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom)
    const now = { x: x.get(), y: y.get(), zoom: zoom.get() }, s = scale * now.zoom
    const px = item.at[0] * s + now.x, py = item.at[1] * s + now.y
    const fits = py - viewTop - 20 > TIP_ROOM && px > 60 && px < width - 60
    const to = fits ? now : { ...clampCamera({ x: width / 2 - item.at[0] * s, y: viewTop + TIP_ROOM + 40 - item.at[1] * s }, bounds(now.zoom)), zoom: now.zoom }
    setShot(to)
    if (!fits) glide(to, !reduced, true)
    onPick(at)
  }
  useEffect(() => { latest.current = { report, open } })
  // Onto your trainer when the map first has its size, and again when your distance or the room for it changes, at the
  // zoom you left; an open tip closes, as its marker moves away.
  useEffect(() => {
    const z = Math.max(least, zoom.get())
    glide(focus(z), placed.current && !reduced, false)
    if (placed.current && picked !== null) onPick(null)
    placed.current = true
  }, [meters, width, height, viewTop, viewBottom]) // eslint-disable-line react-hooks/exhaustive-deps
  // Back to your trainer at the map's own zoom (RouteTrail closes any tip).
  useEffect(() => {
    if (recenter) glide(focus(1), !reduced, false)
  }, [recenter]) // eslint-disable-line react-hooks/exhaustive-deps

  // One finger drags and flings the map, two pinch it about the point between them; a gesture closes a tip.
  const gesture = useMemo(() => {
    const size = { width: W, height: H }, frame = { width, top: viewTop - 24, bottom: viewBottom }
    const move = (cx: number, cy: number, z: number) => {
      'worklet'
      const at = clampCamera({ x: cx, y: cy }, cameraBounds(z, size, frame))
      x.set(at.x); y.set(at.y); zoom.set(z)
    }
    const grab = () => {
      'worklet'
      cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom)
      scheduleOnRN(onPick, null)
    }
    const rest = (finished?: boolean) => {
      'worklet'
      if (finished !== false) scheduleOnRN(settled, x.get(), y.get(), zoom.get(), true)
    }
    const pan = Gesture.Pan().minDistance(6).averageTouches(true)
      .onStart(grab)
      .onChange(event => { move(x.get() + event.changeX, y.get() + event.changeY, zoom.get()) })
      .onEnd(event => {
        if (reduced) { rest(); return }
        const limits = cameraBounds(zoom.get(), size, frame)
        x.set(withDecay({ velocity: event.velocityX, clamp: [limits.minX, limits.maxX] }, rest))
        y.set(withDecay({ velocity: event.velocityY, clamp: [limits.minY, limits.maxY] }, rest))
      })
    const pinch = Gesture.Pinch()
      .onStart(grab)
      .onChange(event => {
        const z = Math.max(least, Math.min(TOWN_MAX_ZOOM, zoom.get() * event.scaleChange)), k = z / zoom.get()
        move(event.focalX - (event.focalX - x.get()) * k, event.focalY - (event.focalY - y.get()) * k, z)
      })
      .onEnd(() => rest())
    return Gesture.Simultaneous(pan, pinch)
  }, [W, H, width, viewTop, viewBottom, least, reduced, onPick, settled, x, y, zoom])
  const camera = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }] }))

  // The sea in whole blocks from the map's corner, as far as the screen reaches zoomed all the way out, leaving out the
  // blocks the map covers.
  const block = map.seaBlock
  const sea = useMemo(() => {
    const far = cameraBounds(least, { width: W, height: H }, { width, top: viewTop - 24, bottom: viewBottom })
    const blocks: { left: number, top: number }[] = []
    for (let row = Math.floor(-far.maxY / least / block.height); row * block.height < (height - far.minY) / least; row++) {
      for (let col = Math.floor(-far.maxX / least / block.width); col * block.width < (width - far.minX) / least; col++) {
        const left = col * block.width, top = row * block.height
        if (left >= 0 && top >= 0 && left + block.width <= W && top + block.height <= H) continue
        blocks.push({ left, top })
      }
    }
    return blocks
  }, [W, H, width, height, viewTop, viewBottom, least, block])

  const tapped = picked === null ? null : stops[picked / MILESTONE - map.first] ?? null
  const tipAt = tapped ? { x: tapped.at[0] * scale * shot.zoom + shot.x, y: tapped.at[1] * scale * shot.zoom + shot.y } : null
  // Above the marker if there is room under the place's name, else below it (only at the very top of the map).
  const roomAbove = tipAt ? tipAt.y - 20 - viewTop > TIP_ROOM : true
  const close = picked !== null && <Pressable accessibilityLabel="Close" style={look.fill} onPress={() => onPick(null)} />
  return <GestureDetector gesture={gesture}>
    <View style={look.fill}>
      {close}
      <Reanimated.View style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: 'left top' }, camera]}>
        {sea.map(item => <Image key={`${item.left},${item.top}`} source={map.sea} resizeMode="stretch" fadeDuration={0} accessible={false}
          style={{ position: 'absolute', left: item.left, top: item.top, ...block }} />)}
        <Image source={map.art} fadeDuration={0} resizeMode="stretch" accessible={false} style={{ width: W, height: H }} />
        {dark && <View pointerEvents="none" style={[look.fill, { backgroundColor: 'rgba(8, 14, 32, 0.3)' }]} />}
        <Road points={walked} scale={scale} />
        {close}
        {stops.map((item, i) => {
          const at = (map.first + i) * MILESTONE
          // The stop you stand on is under your trainer; one close by keeps its marker but not its name.
          if (here && Math.abs(at - meters) < MILESTONE * 0.15) return null
          return <TownMarker key={item.name} name={item.name} city={item.city} at={at} done={at <= meters} picked={picked === at}
            named={!here || Math.abs(at - meters) >= MILESTONE * 0.3} x={item.at[0] * scale} y={item.at[1] * scale} zoom={zoom} onOpen={onOpen} />
        })}
        {here && <Upright x={hx * scale} y={hy * scale} zoom={zoom}>
          <Here meters={meters} x={0} y={0} tile={tile} pad={pad} trainer={trainer} activity={activity} buddy={buddy} reduced={reduced} />
        </Upright>}
      </Reanimated.View>
      {tapped && tipAt && <Tip place={placeFor(picked! / MILESTONE)} latest={picked === reached && picked! > 0}
        togo={picked! > meters ? picked! - meters : null} x={tipAt.x} width={width}
        {...roomAbove ? { bottom: height - tipAt.y + 18 } : { top: tipAt.y + 22 }}>
        {picked! <= meters ? tip?.(picked!) : null}
      </Tip>}
    </View>
  </GestureDetector>
})

// Keeps what it holds at its own size on the zoomed map, standing at x, y.
function Upright({ x, y, zoom, children }: { x: number, y: number, zoom: SharedValue<number>, children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 / zoom.get() }] }))
  return <Reanimated.View pointerEvents="box-none" style={[{ position: 'absolute', left: x, top: y, width: 0, height: 0 }, style]}>{children}</Reanimated.View>
}

// The road walked, gold on a dark edge: a View per stretch, whose rounded ends make round joins where they meet.
const ROAD = [[9, '#283040'], [5, '#F8D030']] as const
const Road = memo(function Road({ points, scale }: { points: Point[], scale: number }) {
  return <View pointerEvents="none" style={look.fill}>
    {ROAD.map(([size, color]) => points.slice(1).map((to, i) => {
      const [ax, ay] = [points[i][0] * scale, points[i][1] * scale], [bx, by] = [to[0] * scale, to[1] * scale]
      const length = Math.hypot(bx - ax, by - ay), thick = size * scale
      return <View key={`${size}-${i}`} style={{ position: 'absolute', left: (ax + bx - length - thick) / 2, top: (ay + by - thick) / 2,
        width: length + thick, height: thick, borderRadius: thick / 2, backgroundColor: color,
        transform: [{ rotate: `${Math.atan2(by - ay, bx - ax)}rad` }] }} />
    }))}
  </View>
})

// A stop on a town map, like the Town Map's: a square for a town or city, a dot for a route, lit once reached (red for
// a town, gold for a route) and grey ahead, with its name on a dark plate below; zoomed out, a route's name hides. Tap
// it for its tip.
const TownMarker = memo(function TownMarker({ name, city, at, done, picked, named, x, y, zoom, onOpen }: {
  name: string, city: boolean, at: number, done: boolean, picked: boolean, named: boolean, x: number, y: number,
  zoom: SharedValue<number>, onOpen: (meters: number) => void
}) {
  const size = city ? 18 : 14
  // The marker's reach for a finger, wider than the marker.
  const reach = size + 24
  const upright = useAnimatedStyle(() => ({ transform: [{ scale: 1 / zoom.get() }] }))
  const label = useAnimatedStyle(() => ({ opacity: city || zoom.get() >= ROUTE_NAMES ? 1 : 0 }))
  return <Reanimated.View style={[{ position: 'absolute', left: x - reach / 2, top: y - reach / 2, width: reach, height: reach }, upright]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${at / 1000} km milestone, ${done ? 'reached' : 'still ahead'}`}
      accessibilityState={{ expanded: picked }} onPress={() => onOpen(at)}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed || picked ? 1.25 : 1 }] })}>
      <View style={[look.stop, { width: size, height: size, borderRadius: city ? 3 : size / 2,
        backgroundColor: done ? (city ? '#E8483C' : '#F8C830') : '#9AA4AE' }, picked && { borderColor: '#F8D030' }]}>
        {!done && <Icon name="lock" size={city ? 10 : 8} color="#FFFFFF" />}
      </View>
      {named && <Reanimated.View pointerEvents="none" style={[look.placeTag, { top: (reach + size) / 2 + 3, width: 120, left: reach / 2 - 60 }, label]}>
        <Text numberOfLines={1} style={[look.placeText, !done && look.placeTextLocked]}>{name}</Text>
      </Reanimated.View>}
    </Pressable>
  </Reanimated.View>
})

const line = (points: Point[]) => points.map(([x, y]) => `${x},${y}`).join(' ')

// A town map in small, for the journey sheet and the map picker: the walkthrough (the road ahead is in the art), gold
// as far as you have walked, and you on it if you are there.
function TownThumb({ map, meters, width }: { map: TownMap, meters: number, width: number }) {
  const height = width * map.height / map.width
  const along = meters - roadStart(map)
  const trail = roadTrail(map.road, along, MILESTONE)
  const [x, y] = roadPoint(map.road, along, MILESTONE)
  const here = meters >= roadStart(map) && meters <= roadEnd(map)
  // Lines and the dot keep about the same weight on screen whatever the map's size.
  const k = map.width / width
  return <View accessible={false} style={[look.thumb, { width, height }]}>
    <Image source={map.art} fadeDuration={0} resizeMode="stretch" style={{ width, height }} />
    <View pointerEvents="none" style={look.fill}>
      <Svg width={width} height={height} viewBox={`0 0 ${map.width} ${map.height}`}>
        {trail.walked.length > 1 && <>
          <Polyline points={line(trail.walked)} fill="none" stroke="#283040" strokeWidth={4.5 * k} strokeLinejoin="round" />
          <Polyline points={line(trail.walked)} fill="none" stroke="#F8D030" strokeWidth={2.5 * k} strokeLinejoin="round" />
        </>}
        {here && <Circle cx={x} cy={y} r={7 * k} fill={colors.edge} stroke="#FFFFFF" strokeWidth={2.2 * k} />}
      </Svg>
    </View>
  </View>
}

// The town maps to look around, side by side: each in small with how far you have come there, the one shown marked.
// Picking yours, or the strips past them (your trail), goes back to where you are.
function MapPicker({ meters, current, shown, onPick }: {
  meters: number, current: TownMap | undefined, shown: TownMap | undefined, onPick: (region: string | null) => void
}) {
  const { width: screen } = useWindowDimensions()
  const card = Math.floor((Math.min(screen - 36, 460) - 12) / 2)
  const later = placeAt(meters)
  return <View style={{ gap: 14 }}>
    <Text style={look.tipLine}>Look around the map of any region. Your trainer stays where you are, and Back to you returns there.</Text>
    <View style={look.pickerGrid}>
      {townMaps.map(map => {
        const on = map === shown, yours = map === current
        const done = reachedOn(map, meters), total = map.road.stops.length
        const state = yours ? 'You are here' : done === total ? 'Completed' : done ? 'Passed through' : 'Not reached yet'
        return <Pressable key={map.region} accessibilityRole="button" accessibilityState={{ selected: on }}
          accessibilityLabel={`${map.region} map. ${state}. ${done} of ${total} places`} onPress={() => onPick(map.region)}
          style={({ pressed }) => [look.pickerCard, { width: card }, on && look.pickerCardOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <TownThumb map={map} meters={meters} width={card - 16} />
          <View style={look.pickerHead}>
            <Text numberOfLines={1} style={look.pickerName}>{map.region}</Text>
            {on && <View style={look.pickerCheck}><Icon name="check" size={14} color={colors.onEdge} /></View>}
          </View>
          <Text numberOfLines={1} style={[look.pickerState, yours && { color: colors.edge }]}>{state}</Text>
          <Text style={look.legendCount}>{done}/{total} places</Text>
        </Pressable>
      })}
    </View>
    {!current && <Pressable accessibilityRole="button" accessibilityState={{ selected: !shown }} onPress={() => onPick(null)}
      accessibilityLabel={`Your trail in ${later.region}`}
      style={({ pressed }) => [look.nextRow, !shown && look.pickerCardOn, { opacity: pressed ? 0.8 : 1 }]}>
      <Icon name="locate" size={18} color={colors.edge} />
      <Text numberOfLines={1} style={look.nextText}>Your trail · {later.region}</Text>
      {!shown ? <Icon name="check" size={18} color={colors.edge} /> : <Icon name="chevron" size={18} color={colors.edge} />}
    </Pressable>}
    <Text style={look.tipLine}>Hoenn, Sinnoh and Unova are walked on the route trail.</Text>
  </View>
}

// Each region's colour on the journey map.
const REGION_COLORS = ['#E0533F', '#C9971A', '#2E9C62', '#3B78E0', '#6A6E7C']
const PER_ROW = 12

// The mini-map: the whole journey at a glance. Every milestone of the tour is a dot on a path that snakes down row by
// row, coloured by region and filled once reached, with you on it; then the next place and each region's tally.
function JourneyMap({ meters, map }: { meters: number, map: TownMap | undefined }) {
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
    {map && <TownThumb map={map} meters={meters} width={width} />}
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

// A stone pad every 2 km, its place's name below (named, unless it is so close to you that your trainer stands over
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
  meters: number, x: number, y: number, tile: number, pad: { width: number, height: number, labelTop?: number }, trainer: 'brendan' | 'may', activity: Activity,
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
        paddingTop: pad.labelTop ?? pad.height * 0.42 }]}>
      <Text numberOfLines={1} style={[look.hereText, { fontSize: Math.max(11, Math.round(tile * 0.5)) }]}>{label}</Text>
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

// The GBA look for everything over the map, in every theme, like the games' text boxes: a hard frame (Emerald's own
// colour, else the theme's ink), a light rule inside it (look.rule), small corners and a hard drop shadow. Words on
// the map are in the pixel face. Exported for the buttons the Adventure tab lays over it.
export function gbaBox(radius = 8) {
  const frame = colors.frameOuter ?? colors.ink
  return { backgroundColor: colors.panel, borderWidth: 2, borderColor: frame, borderRadius: radius,
    boxShadow: `0px 3px 0px ${colors.frameOuter ?? 'rgba(16, 24, 40, 0.45)'}` }
}

const look = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: GROUND, overflow: 'hidden' },
  rule: { position: 'absolute', left: 2, top: 2, right: 2, bottom: 2, borderRadius: 5, borderWidth: 1.5, borderColor: colors.frameInner ?? colors.line },
  stop: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', boxShadow: '0px 2px 0px #283040' },
  thumb: { alignSelf: 'center', overflow: 'hidden', ...gbaBox(6) },
  map: { flex: 1 },
  side: { position: 'absolute', top: 0, bottom: 0, backgroundColor: GROUND },
  dim: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(8, 14, 32, 0.3)' },
  ahead: { position: 'absolute', top: 0, left: 0, right: 0, paddingLeft: 12, alignItems: 'flex-start' },
  behind: { position: 'absolute', left: 0, right: 0 },
  sign: { gap: 2, paddingHorizontal: 14, paddingVertical: 8, ...gbaBox(6) },
  signText: { fontFamily: fonts.pixel, fontSize: 13, letterSpacing: 1, color: colors.ink },
  pad: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderBottomWidth: 5, boxShadow: '0px 3px 0px rgba(30, 60, 45, 0.28)' },
  padDone: { backgroundColor: '#F3F6F9', borderColor: '#C3CDD8' },
  padLocked: { backgroundColor: '#AEB7C1', borderColor: '#808B97' },
  padPicked: { borderColor: colors.brandFrom },
  placeTag: { position: 'absolute', alignItems: 'center' },
  // A place's name on the map: white pixel letters on a dark plate, dimmer ahead.
  placeText: { fontFamily: fonts.pixel, fontSize: 11, lineHeight: 15, color: '#FFFFFF', backgroundColor: 'rgba(24, 32, 48, 0.82)', overflow: 'hidden',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  placeTextLocked: { color: '#D8DEE6', backgroundColor: 'rgba(24, 32, 48, 0.55)' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tip: { position: 'absolute', padding: 12, gap: 10, ...gbaBox() },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipRegion: { fontFamily: fonts.pixel, fontSize: 11, letterSpacing: 1, color: colors.muted },
  tipName: { fontFamily: fonts.pixel, fontSize: 17, lineHeight: 22, color: colors.ink },
  tipLine: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  tipArrow: { position: 'absolute', bottom: -8, width: 14, height: 14, backgroundColor: colors.panel, transform: [{ rotate: '45deg' }],
    borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.frameOuter ?? colors.ink },
  tipArrowUp: { bottom: undefined, top: -8, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: colors.goldTint },
  latestText: { fontFamily: fonts.pixel, fontSize: 11, color: colors.gold },
  mini: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', ...gbaBox(8) },
  miniOn: { backgroundColor: colors.edge },
  topButtons: { flexDirection: 'row', gap: 8 },
  // Looking around another map: a pill above the card, the way back.
  viewingRow: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  viewing: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, maxWidth: '100%', paddingHorizontal: 14, ...gbaBox(8) },
  viewingText: { flexShrink: 1, fontFamily: fonts.pixel, fontSize: 13, color: colors.ink },
  viewingBack: { fontFamily: fonts.heavy, fontSize: 13, color: colors.edge },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignSelf: 'center', maxWidth: 460 },
  pickerCard: { padding: 8, gap: 4, borderRadius: 12, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.panel },
  pickerCardOn: { borderColor: colors.edge, backgroundColor: colors.mint },
  pickerHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pickerName: { flex: 1, fontFamily: fonts.pixel, fontSize: 16, lineHeight: 21, color: colors.ink },
  pickerCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.edge },
  pickerState: { fontFamily: fonts.heavy, fontSize: 12, color: colors.muted },
  journeyHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  journeyPlace: { fontFamily: fonts.pixel, fontSize: 20, lineHeight: 26, color: colors.ink },
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
  padText: { fontFamily: fonts.pixel, color: '#2E3B48' },
  padTextLocked: { color: '#F5F7FA' },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
    boxShadow: '0px 2px 4px rgba(20, 40, 60, 0.3)' },
  badgeDone: { backgroundColor: '#2F8BEA' },
  badgeLocked: { backgroundColor: '#6D7884' },
  ring: { position: 'absolute', borderWidth: 4, borderColor: colors.brandFrom },
  here: { position: 'absolute', alignItems: 'center', borderWidth: 3, borderColor: '#FFFFFF', boxShadow: `0px 3px 0px ${colors.frameOuter ?? 'rgba(16, 24, 40, 0.45)'}` },
  hereText: { fontFamily: fonts.pixel, color: colors.onBrand, letterSpacing: 0.2 },
  tag: { position: 'absolute', width: 80, alignItems: 'center' },
  tagText: { fontFamily: fonts.pixel, fontSize: 13, color: colors.onEdge, backgroundColor: colors.edge, overflow: 'hidden',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  tagTail: { width: 10, height: 10, marginTop: -6, backgroundColor: colors.edge, transform: [{ rotate: '45deg' }] },
  // The notice, if any, and the card, floating over the map (bottom is set by LIFT); folded, the card's bubble.
  dock: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 10 },
  card: { alignSelf: 'center', padding: 10, gap: 8, transformOrigin: 'right bottom', ...gbaBox(10) },
  bubble: { position: 'absolute', right: 12, width: BUBBLE, height: BUBBLE },
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row' },
  // The place's name, like the sign that pops up as you enter a town in the games.
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minHeight: 46, paddingLeft: 8, paddingRight: 14, paddingVertical: 5,
    ...gbaBox(8) },
  headerIcon: { width: 26, height: 26, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  headerRule: { width: 2, alignSelf: 'stretch', marginVertical: 3, backgroundColor: colors.line },
  headerEyebrow: { fontFamily: fonts.pixel, fontSize: 10, lineHeight: 13, letterSpacing: 1, color: colors.edge },
  headerTitle: { fontFamily: fonts.pixel, fontSize: 15, lineHeight: 19, color: colors.ink },
  rail: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 8 },
  recenter: { position: 'absolute', right: 12, bottom: 16, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', ...gbaBox(8) },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.panel, paddingHorizontal: 18, paddingTop: 10, gap: 12,
    borderTopLeftRadius: retro() ? 12 : 28, borderTopRightRadius: retro() ? 12 : 28, boxShadow: `0px -10px 30px ${colors.shadow}`,
    ...(retro() ? { borderWidth: 2, borderBottomWidth: 0, borderColor: colors.frameOuter } : null) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 18 : 20, lineHeight: 26 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }
}))
