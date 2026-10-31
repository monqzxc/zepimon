import { useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { averagePace, km, recordForm } from '../journal'
import { adventureFacts, bestLabels, findAdventure } from '../adventures'
import type { Adventure } from '../adventures'
import { pokemonType } from '../catalog'
import { describeAdventure, shortDuration } from '../journal-calendar'
import { RouteMap } from '../RouteMap'
import { cardTitle } from '../ShareCard'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Copy, Icon, Panel, PokeballIcon, Screen, Title, colors, fonts, shadows, themedStyles, typeInks, typeLabel, typeTints, useTheme } from '../ui'
import type { IconName } from '../ui'

// One saved adventure, opened from a Journal tile. The route's live map fills the top of the screen and stays put while
// only the details below it scroll: the Pokemon it reached, when it happened, its stats and a description. The details'
// white panel meets the map with a stepped edge, its right side higher, and the highlight sits in the notch on the left.
// Watch adventures have no route, so the map's place shows the Pokemon on its type's tint. Dex and Share close the screen. id is a Journal run's id or a phone adventure's own id.
export default function AdventureDetailsScreen() {
  useTheme()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { progress, phoneRuns } = useJournal()
  const adventure = findAdventure(id, progress, phoneRuns)
  if (!adventure) return <Screen><Panel>
    <Title>Adventure not found</Title>
    <Copy>This adventure is no longer saved on this phone.</Copy>
    <Button title="Back" secondary onPress={back} />
  </Panel></Screen>
  return <Details key={adventure.id} adventure={adventure} />
}

// Opened from a link with nothing behind it, Back goes to the Journal.
const back = () => router.canGoBack() ? router.back() : router.replace('/')
const time = (date: Date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// The details panel's top edge, as in the reference: its right side stands STEP higher than its left, both outer corners
// are rounded, and one smooth S-shaped slope joins the two levels. The highlight ribbon fills the notch the lower left
// leaves over the map.
const STEP = 52
const RADIUS = 28
const SLOPE = 56
const BAR = 64

// The panel's top as a path: lower left from 0 to `step` (the slope's foot), up the slope, then the raised right.
function panelTop(width: number, step: number): string {
  const h = STEP + RADIUS, k = 0.45, top = step + SLOPE, f = (n: number) => n.toFixed(1)
  return `M0 ${h} L0 ${STEP + RADIUS} C0 ${f(STEP + RADIUS * k)} ${f(RADIUS * k)} ${STEP} ${RADIUS} ${STEP} `
    + `L${f(step)} ${STEP} C${f(step + SLOPE / 2)} ${STEP} ${f(top - SLOPE / 2)} 0 ${f(top)} 0 `
    + `L${f(width - RADIUS)} 0 C${f(width - RADIUS * k)} 0 ${width} ${f(RADIUS * k)} ${width} ${RADIUS} L${width} ${h} Z`
}

function Details({ adventure }: { adventure: Adventure }) {
  const { dark } = useTheme()
  const { id, family, record, device, path } = adventure
  const { journal } = useJournal()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [ribbonWidth, setRibbonWidth] = useState(0)
  const [fit, setFit] = useState(0)
  const facts = adventureFacts(adventure, journal)
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const ink = typeInks[type] || colors.edge
  // Inks are deep in light mode and pale in dark, so what sits on them flips too.
  const onInk = dark ? colors.panel : '#FFFFFF'
  const finished = new Date(record.finishedAt)
  const started = facts.started != null ? new Date(facts.started) : null
  // Where the panel's raised right side meets the map; the map runs on under the panel's curves.
  const edge = Math.round(height * 0.46)
  const mapHeight = edge + STEP + RADIUS
  // The slope starts just past the ribbon, within reason, so a long highlight keeps its notch.
  const step = Math.round(Math.min(Math.max(width * 0.4, ribbonWidth + 12), width * 0.62))
  const reached = facts.evolution.at(-1)
  const share = () => router.push({ pathname: '/share', params: { id } })
  const highlight: [IconName, string] = facts.bests.length > 1 ? ['trophy', `${facts.bests.length} personal bests`]
    : facts.bests.length ? ['trophy', bestLabels[facts.bests[0]]]
    : record.shiny ? ['sparkle', 'Shiny']
    : facts.evolution.length ? ['egg', 'Hatched'] : ['egg', 'Unhatched']
  const year = finished.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } as const : {}
  const when = `${finished.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', ...year })} · `
    + (started ? `${time(started)} – ${time(finished)}` : time(finished))
  const pace = averagePace(record.elapsedSeconds, record.meters).replace(' /km', '')
  const distance = Number.isFinite(record.meters) && record.meters >= 0 ? (record.meters / 1000).toFixed(2) : '--'

  return <View style={{ flex: 1, backgroundColor: colors.panel }}>
    <StatusBar style="light" />
    {/* The map stays put and keeps its gestures; only the details below scroll. */}
    <View style={[page.map, { height: mapHeight, backgroundColor: typeTints[type] || colors.sunken }]}>
      {path ? <RouteMap path={path} height={mapHeight} bare top={insets.top + BAR} bottom={STEP + RADIUS} zoomAt="bottomright" fit={fit}
        label={`Map of the route, ${km(record.meters)}`} />
        : <View accessible accessibilityLabel={device === 'watch' ? 'No route: watches count steps without GPS' : 'No route recorded'}
          style={[page.still, { paddingTop: insets.top + BAR, paddingBottom: STEP + RADIUS }]}>
          <PixelSprite name={form} shiny={record.shiny} size={Math.round(edge * 0.45)} />
        </View>}
    </View>

    {/* A soft shade under the status bar and title, so white text reads on light streets. */}
    <Svg pointerEvents="none" width={width} height={insets.top + BAR + 40} style={page.shade}>
      <Defs>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.42" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={insets.top + BAR + 40} fill="url(#shade)" />
    </Svg>

    {/* The notch's wash of the type's colour, fading up and to the right into the map, then the panel's white edge. */}
    <Svg pointerEvents="none" width={width} height={STEP + RADIUS + 28} style={[page.edge, { top: edge - 28 }]}>
      <Defs>
        <LinearGradient id="wash" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={ink} stopOpacity="0.9" />
          <Stop offset="0.6" stopColor={ink} stopOpacity="0.55" />
          <Stop offset="1" stopColor={ink} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="rise" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="1" />
        </LinearGradient>
        <Mask id="fade"><Rect width={step + SLOPE} height={STEP + 28} fill="url(#rise)" /></Mask>
      </Defs>
      <Rect width={step + SLOPE} height={STEP + 28} fill="url(#wash)" mask="url(#fade)" />
      <G y={28}><Path d={panelTop(width, step)} fill={colors.panel} /></G>
    </Svg>

    <View pointerEvents="none" accessible accessibilityLabel={highlight[1]} style={[page.ribbon, { top: edge, maxWidth: width * 0.62 - 12 }]}
      onLayout={event => setRibbonWidth(event.nativeEvent.layout.width)}>
      <View style={[page.ribbonIcon, { backgroundColor: onInk }]}><Icon name={highlight[0]} size={16} color={ink} /></View>
      <Text style={[page.ribbonText, { color: onInk }]} numberOfLines={1}>{highlight[1]}</Text>
    </View>
    <View pointerEvents="none" accessible accessibilityLabel={`${typeLabel(type)} type, recorded ${device === 'phone' ? 'on this phone' : 'on your watch'}`}
      style={[page.aside, { top: edge + 18 }]}>
      <View style={page.typeLine}>
        <View style={[page.dot, { backgroundColor: ink }]} />
        <Text style={page.typeText}>{typeLabel(type)}</Text>
      </View>
      <Text style={page.device}>{device === 'phone' ? 'This phone' : 'Your watch'}</Text>
    </View>

    <View style={[page.bar, { top: insets.top + 10 }]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={6}
        style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="back" size={20} />
      </Pressable>
      <Text accessibilityRole="header" style={page.barTitle}>Details</Text>
      {path ? <Pressable accessibilityRole="button" accessibilityLabel="Recenter the map on the route" onPress={() => setFit(count => count + 1)}
        hitSlop={6} style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="locate" size={20} />
      </Pressable> : <View style={page.round} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name={device} size={18} color={ink} />
      </View>}
    </View>

    <ScrollView style={{ flex: 1, marginTop: edge + STEP + 14 }} contentContainerStyle={page.content} showsVerticalScrollIndicator={false}>
      <View style={{ gap: 4 }}>
        <Text style={page.title}>{cardTitle(family, record)}</Text>
        <View style={page.when}>
          <Icon name="calendar" size={16} color={colors.muted} />
          <Text style={page.whenText}>{when}</Text>
        </View>
      </View>

      <View style={page.stats}>
        <Stat value={distance} label="Km" />
        <Stat value={shortDuration(record.elapsedSeconds)} label="Time" divided />
        <Stat value={pace} label="Pace /km" divided />
        <Stat value={facts.steps ? facts.steps.toLocaleString() : '--'} label="Steps" divided />
      </View>

      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={page.heading}>Description</Text>
        <Text style={page.description}>{describeAdventure(adventure, facts)}</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={page.heading}>Pokemon reached</Text>
        {facts.evolution.length ? <View style={page.avatars}>
          {facts.evolution.map((name, i) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`View ${name} in your Dex`}
            onPress={() => router.push({ pathname: '/pokemon', params: { name } })}
            style={({ pressed }) => [page.avatar, { marginLeft: i ? -12 : 0, zIndex: facts.evolution.length - i, opacity: pressed ? 0.7 : 1 }]}>
            <PixelSprite name={name} shiny={record.shiny} size={44} />
          </Pressable>)}
          <Text style={page.chain} numberOfLines={2}>{facts.evolution.join(' › ')}</Text>
        </View> : <Copy small>The egg did not hatch this time: it needs 5 km in one adventure.</Copy>}
      </View>
    </ScrollView>

    <View style={[page.footer, { paddingBottom: insets.bottom + 14 }]}>
      {reached && <Pressable accessibilityRole="button" accessibilityLabel={`View ${reached} in your Dex`}
        onPress={() => router.push({ pathname: '/pokemon', params: { name: reached } })}
        style={({ pressed }) => [page.dex, { opacity: pressed ? 0.7 : 1 }]}>
        <PokeballIcon size={24} color={colors.ink} />
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Share image" onPress={share}
        style={({ pressed }) => [page.share, { backgroundColor: ink, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <Icon name="share" size={18} color={onInk} />
        <Text style={[page.shareText, { color: onInk }]}>Share</Text>
      </Pressable>
    </View>
  </View>
}

// One cell of the stats strip: a big value over a small label, split from its neighbour by a hairline.
function Stat({ value, label, divided = false }: { value: string, label: string, divided?: boolean }) {
  return <View accessible accessibilityLabel={`${label}: ${value}`} style={[page.stat, divided && page.statDivided]}>
    <Text style={page.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={page.statLabel} numberOfLines={1}>{label}</Text>
  </View>
}

const page = themedStyles(() => ({
  map: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  still: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', top: 0, left: 0 },
  edge: { position: 'absolute', left: 0 },
  bar: { position: 'absolute', left: 20, right: 20, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  barTitle: { fontFamily: fonts.heavy, color: '#FFFFFF', fontSize: 17, lineHeight: 22, textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  // The highlight sits in the notch the panel's lower left leaves, on the wash of the type's colour.
  ribbon: { position: 'absolute', left: 20, height: STEP, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ribbonIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ribbonText: { flexShrink: 1, fontFamily: fonts.black, fontSize: 19, lineHeight: 25 },
  // Type and device stand on the raised right, like the reference's rating and delivery fee.
  aside: { position: 'absolute', right: 20, alignItems: 'flex-end', gap: 2 },
  typeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  typeText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19 },
  device: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, gap: 20 },
  title: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 20, lineHeight: 26 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { flex: 1, fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: 18, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.line },
  statValue: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  statLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  heading: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 17, lineHeight: 23 },
  description: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 21 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.sunken, borderWidth: 3, borderColor: colors.panel,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chain: { flex: 1, marginLeft: 12, fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.panel },
  dex: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  share: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareText: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 22 }
}))
