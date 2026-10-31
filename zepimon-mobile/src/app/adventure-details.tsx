import { Pressable, Text, View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { averagePace, km, recordForm } from '../journal'
import { adventureFacts, bestLabels, findAdventure } from '../adventures'
import type { Adventure } from '../adventures'
import { pokemonType } from '../catalog'
import { describeAdventure, shortDuration } from '../journal-calendar'
import { RouteMap } from '../RouteMap'
import { BottomSheet } from '../BottomSheet'
import { cardTitle } from '../ShareCard'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Copy, Icon, Panel, PokeballIcon, Screen, Title, colors, fonts, shadows, themedStyles, typeInks, typeLabel, typeTints, useTheme } from '../ui'
import type { IconName } from '../ui'

// One saved adventure, opened from a Journal tile. The route's map fills the top of the screen and stays put, still
// draggable and zoomable, while a sheet (src/BottomSheet.tsx) slides up over it: its highlight, the Pokemon it reached,
// when it happened, its stats and a description. Watch adventures have no route, so their backdrop is the Pokemon on its
// type's tint. Back and the title float above everything; the Dex and Share buttons stay pinned to the bottom. id is a Journal run's id or a phone adventure's own id.
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

// How far the sheet's rounded top reaches up over the backdrop.
const OVERLAP = 32

function Details({ adventure }: { adventure: Adventure }) {
  const { dark } = useTheme()
  const { id, family, record, device, path } = adventure
  const { journal } = useJournal()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const facts = adventureFacts(adventure, journal)
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const ink = typeInks[type] || colors.edge
  // Inks are deep in light mode and pale in dark, so what sits on them flips too.
  const onInk = dark ? colors.panel : '#FFFFFF'
  const finished = new Date(record.finishedAt)
  const started = facts.started != null ? new Date(facts.started) : null
  const hero = Math.round(Math.min(height * 0.5, 460))
  const bar = insets.top + 10
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
    {/* The backdrop stays still behind the sheet. */}
    <View style={[page.backdrop, { height: hero + OVERLAP, backgroundColor: typeTints[type] || colors.sunken }]}>
      {path ? <RouteMap path={path} height={hero + OVERLAP} bare top={bar + 46} bottom={OVERLAP * 2}
        label={`Map of the route, ${km(record.meters)}`} />
        : <View style={[page.still, { paddingTop: bar + 46, paddingBottom: OVERLAP * 2 }]}>
          <PixelSprite name={form} shiny={record.shiny} size={Math.min(176, hero * 0.5)} />
          <Text style={page.note}>{device === 'watch' ? 'Watches count steps without GPS, so there is no route map.' : 'No route recorded.'}</Text>
        </View>}
    </View>

    <BottomSheet low={hero - OVERLAP} high={bar + 54}>
      <View style={[page.sheet, { paddingBottom: insets.bottom + 110 }]}>
        <View style={page.ribbonRow}>
          <View accessible accessibilityLabel={highlight[1]} style={[page.ribbon, { backgroundColor: ink }]}>
            <View style={[page.ribbonIcon, { backgroundColor: onInk }]}><Icon name={highlight[0]} size={16} color={ink} /></View>
            <Text style={[page.ribbonText, { color: onInk }]} numberOfLines={1}>{highlight[1]}</Text>
          </View>
          <View accessible accessibilityLabel={`${typeLabel(type)} type, recorded ${device === 'phone' ? 'on this phone' : 'on your watch'}`}
            style={page.aside}>
            <View style={page.typeLine}>
              <View style={[page.dot, { backgroundColor: ink }]} />
              <Text style={page.typeText}>{typeLabel(type)}</Text>
            </View>
            <Text style={page.device}>{device === 'phone' ? 'This phone' : 'Your watch'}</Text>
          </View>
        </View>

        <View style={page.inner}>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={page.title}>{cardTitle(family, record)}</Text>
            <View style={page.when}>
              <Icon name="calendar" size={18} color={colors.muted} />
              <Text style={page.whenText}>{when}</Text>
            </View>
          </View>

          <View style={page.stats}>
            <Stat value={distance} label="Km" />
            <Stat value={shortDuration(record.elapsedSeconds)} label="Time" divided />
            <Stat value={pace} label="Pace /km" divided />
            <Stat value={facts.steps ? facts.steps.toLocaleString() : '--'} label="Steps" divided />
          </View>

          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header" style={page.heading}>Description</Text>
            <Text style={page.description}>{describeAdventure(adventure, facts)}</Text>
          </View>

          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={page.heading}>Pokemon reached</Text>
            {facts.evolution.length ? <View style={page.avatars}>
              {facts.evolution.map((name, i) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`View ${name} in your Dex`}
                onPress={() => router.push({ pathname: '/pokemon', params: { name } })}
                style={({ pressed }) => [page.avatar, { marginLeft: i ? -12 : 0, zIndex: facts.evolution.length - i, opacity: pressed ? 0.7 : 1 }]}>
                <PixelSprite name={name} shiny={record.shiny} size={50} />
              </Pressable>)}
              <Text style={page.chain} numberOfLines={2}>{facts.evolution.join(' › ')}</Text>
            </View> : <Copy small>The egg did not hatch this time: it needs 5 km in one adventure.</Copy>}
          </View>
        </View>
      </View>
    </BottomSheet>

    <View style={[page.bar, { paddingTop: bar }]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={6}
        style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="back" size={22} />
      </Pressable>
      <View pointerEvents="none" style={page.pill}><Text style={page.pillText}>Details</Text></View>
      <View accessible accessibilityLabel={device === 'phone' ? 'Recorded on this phone' : 'Recorded on your watch'} style={page.round}>
        <Icon name={device} size={20} color={ink} />
      </View>
    </View>

    <View style={[page.footer, { paddingBottom: insets.bottom + 12 }]}>
      {reached && <Pressable accessibilityRole="button" accessibilityLabel={`View ${reached} in your Dex`}
        onPress={() => router.push({ pathname: '/pokemon', params: { name: reached } })}
        style={({ pressed }) => [page.dex, { opacity: pressed ? 0.7 : 1 }]}>
        <PokeballIcon size={24} color={colors.ink} />
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Share image" onPress={share}
        style={({ pressed }) => [page.share, { backgroundColor: ink, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        <Icon name="share" size={20} color={onInk} />
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
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  still: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  note: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18, opacity: 0.7, textAlign: 'center' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  pill: { backgroundColor: colors.panel, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, ...shadows.card },
  pillText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 20 },
  sheet: { paddingTop: 4, gap: 16 },
  ribbonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingRight: 22 },
  // The highlight hangs off the sheet's left edge like a ribbon.
  ribbon: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 22, paddingRight: 18, paddingVertical: 8,
    borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  ribbonIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ribbonText: { flexShrink: 1, fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
  aside: { alignItems: 'flex-end', gap: 2 },
  typeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  typeText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  device: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 },
  inner: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 22, gap: 22 },
  title: { fontFamily: fonts.black, color: colors.ink, fontSize: 24, lineHeight: 30 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { flex: 1, fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 19 },
  stats: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: 18, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.line },
  statValue: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 17, lineHeight: 22 },
  statLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  heading: { fontFamily: fonts.black, color: colors.ink, fontSize: 18, lineHeight: 24 },
  description: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.sunken, borderWidth: 3, borderColor: colors.panel,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chain: { flex: 1, marginLeft: 12, fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20,
    paddingTop: 12, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.line },
  dex: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  share: { flex: 1, height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...shadows.card },
  shareText: { fontFamily: fonts.black, fontSize: 17, lineHeight: 22 }
}))
