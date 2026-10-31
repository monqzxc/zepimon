import { useState } from 'react'
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Path } from 'react-native-svg'
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

// One saved adventure, opened from a Journal tile, as a single floating card. The route's live map heads it and stays
// put while only the details below scroll: its highlight, the Pokemon it reached, when it happened, its stats and a
// description. The details' top edge sweeps up into the map in an asymmetric curve. Watch adventures have no route, so
// their header is the Pokemon on its type's tint. The Dex and Share buttons close the card. id is a Journal run's id or a phone adventure's own id.
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

// How far the content's organic edge reaches up into the map, and the card's corner radius.
const CURVE = 56
const RADIUS = 30

// The content's top edge cutting into the map: low and nearly flat on the left, under the highlight ribbon, then one
// long asymmetric sweep up to the right, where it meets the map's edge. Drawn white over the map, below everything
// that can be touched, so the map still pans and zooms underneath.
function boundary(width: number, height: number): string {
  const x = (fraction: number) => (width * fraction).toFixed(1)
  const low = height - 12
  return `M0 ${height} L0 ${low} C${x(0.38)} ${low} ${x(0.52)} ${low} ${x(0.64)} ${(height * 0.5).toFixed(1)} `
    + `C${x(0.71)} ${(height * 0.14).toFixed(1)} ${x(0.77)} 0 ${x(0.9)} 0 L${width} 0 L${width} ${height} Z`
}

function Details({ adventure }: { adventure: Adventure }) {
  const { dark } = useTheme()
  const { id, family, record, device, path } = adventure
  const { journal } = useJournal()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [cardWidth, setCardWidth] = useState(0)
  const facts = adventureFacts(adventure, journal)
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const ink = typeInks[type] || colors.edge
  // Inks are deep in light mode and pale in dark, so what sits on them flips too.
  const onInk = dark ? colors.panel : '#FFFFFF'
  const finished = new Date(record.finishedAt)
  const started = facts.started != null ? new Date(facts.started) : null
  // The map heads the card at a steady height, part of which the content's edge covers.
  const mapHeight = Math.round(Math.min(Math.max(height * 0.26, 180), 240)) + CURVE
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

  return <View style={[page.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
    <View style={page.card} onLayout={event => setCardWidth(event.nativeEvent.layout.width)}>
      {/* The map stays put; only the content below it scrolls. */}
      <View style={{ height: mapHeight, backgroundColor: typeTints[type] || colors.sunken }}>
        {path ? <RouteMap path={path} height={mapHeight} bare top={44} bottom={CURVE} zoomAt="topright"
          label={`Map of the route, ${km(record.meters)}`} />
          : <View accessible accessibilityLabel={device === 'watch' ? 'No route: watches count steps without GPS' : 'No route recorded'}
            style={[page.still, { paddingBottom: CURVE }]}>
            <PixelSprite name={form} shiny={record.shiny} size={Math.round(mapHeight * 0.5)} />
          </View>}

        {cardWidth > 0 && <Svg pointerEvents="none" width={cardWidth} height={CURVE} style={page.curve}>
          <Path d={boundary(cardWidth, CURVE)} fill={colors.panel} />
        </Svg>}
        <View pointerEvents="none" accessible accessibilityLabel={highlight[1]} style={[page.ribbon, { backgroundColor: ink }]}>
          <View style={[page.ribbonIcon, { backgroundColor: onInk }]}><Icon name={highlight[0]} size={14} color={ink} /></View>
          <Text style={[page.ribbonText, { color: onInk }]} numberOfLines={1}>{highlight[1]}</Text>
        </View>
        <View pointerEvents="none" accessible accessibilityLabel={`${typeLabel(type)} type, recorded ${device === 'phone' ? 'on this phone' : 'on your watch'}`}
          style={page.aside}>
          <View style={page.typeLine}>
            <View style={[page.dot, { backgroundColor: ink }]} />
            <Text style={page.typeText}>{typeLabel(type)}</Text>
          </View>
          <Text style={page.device}>{device === 'phone' ? 'This phone' : 'Your watch'}</Text>
        </View>

        <View style={page.bar} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={6}
            style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
            <Icon name="back" size={20} />
          </Pressable>
          <View pointerEvents="none" style={page.pill}><Text style={page.pillText}>Details</Text></View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={page.content} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 4 }}>
          <Text accessibilityRole="header" style={page.title}>{cardTitle(family, record)}</Text>
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

      <View style={page.footer}>
        {reached && <Pressable accessibilityRole="button" accessibilityLabel={`View ${reached} in your Dex`}
          onPress={() => router.push({ pathname: '/pokemon', params: { name: reached } })}
          style={({ pressed }) => [page.dex, { opacity: pressed ? 0.7 : 1 }]}>
          <PokeballIcon size={22} color={colors.ink} />
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Share image" onPress={share}
          style={({ pressed }) => [page.share, { backgroundColor: ink, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <Icon name="share" size={18} color={onInk} />
          <Text style={[page.shareText, { color: onInk }]}>Share</Text>
        </Pressable>
      </View>
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
  screen: { flex: 1, backgroundColor: colors.sunken, paddingHorizontal: 10 },
  // One floating card: the map and its details read as a single piece.
  card: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: colors.panel, borderRadius: RADIUS, overflow: 'hidden',
    boxShadow: '0px 10px 30px rgba(31, 61, 89, 0.10)' },
  still: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  curve: { position: 'absolute', left: 0, bottom: 0 },
  bar: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center' },
  round: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  // Centred on the card, not between the back and zoom buttons.
  pill: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pillText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18, backgroundColor: colors.panel, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7, overflow: 'hidden' },
  // The highlight hangs off the card's left edge, on the map just above the content's low edge.
  ribbon: { position: 'absolute', left: 0, bottom: 14, maxWidth: '62%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14,
    paddingRight: 14, paddingVertical: 6, borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  ribbonIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ribbonText: { flexShrink: 1, fontFamily: fonts.black, fontSize: 14, lineHeight: 19 },
  // The type and device sit on the white where the edge sweeps up, like the rating beside the reference's ribbon.
  aside: { position: 'absolute', right: 20, bottom: 0, alignItems: 'flex-end' },
  typeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  typeText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19 },
  device: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 17 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 18 },
  title: { fontFamily: fonts.black, color: colors.ink, fontSize: 21, lineHeight: 27 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { flex: 1, fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: 18, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.line },
  statValue: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  statLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  heading: { fontFamily: fonts.black, color: colors.ink, fontSize: 16, lineHeight: 22 },
  description: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 21 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.sunken, borderWidth: 3, borderColor: colors.panel,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chain: { flex: 1, marginLeft: 12, fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  dex: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  share: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  shareText: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21 }
}))
