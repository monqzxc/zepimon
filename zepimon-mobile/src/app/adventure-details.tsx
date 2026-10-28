import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { averagePace, km, recordForm } from '../journal'
import { adventureFacts, bestLabels, findAdventure } from '../adventures'
import type { Adventure } from '../adventures'
import { pokemonType, typeColors, typeTints } from '../catalog'
import { describeAdventure, shortDuration } from '../journal-calendar'
import { RouteMap } from '../RouteMap'
import { cardTitle } from '../ShareCard'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Copy, Icon, Panel, Screen, Title, colors, fonts, shadows } from '../ui'
import type { IconName } from '../ui'

// One saved adventure, opened from a Journal tile: a pastel header in its Pokemon's type colour with the date, then a
// sheet with what happened, its times and stats, the Pokemon it reached, the route (phone adventures) and a Share
// button. id is a Journal run's id or a phone adventure's own id.
export default function AdventureDetailsScreen() {
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

function Details({ adventure }: { adventure: Adventure }) {
  const { id, family, record, device, path } = adventure
  const { journal } = useJournal()
  const insets = useSafeAreaInsets()
  const facts = adventureFacts(adventure, journal)
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const ink = typeColors[type] || colors.edge
  const finished = new Date(record.finishedAt)
  const started = facts.started != null ? new Date(facts.started) : null
  const running = record.activity === 'running'
  const share = () => router.push({ pathname: '/share', params: { id } })
  return <ScrollView style={{ flex: 1, backgroundColor: typeTints[type] || colors.sunken }} contentContainerStyle={{ flexGrow: 1 }}>
    <View style={[page.header, { paddingTop: insets.top + 10 }]}>
      <View style={page.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={6}
          style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="back" size={22} />
        </Pressable>
        <View accessible accessibilityLabel={device === 'phone' ? 'Recorded on this phone' : 'Recorded on your watch'} style={page.round}>
          <Icon name={device} size={20} color={ink} />
        </View>
      </View>
      <View style={page.hero}>
        <View style={{ flex: 1 }}>
          <Text style={page.day}>{finished.toLocaleDateString([], { month: 'long', day: 'numeric' })}</Text>
          <Text style={page.weekday}>{finished.toLocaleDateString([], { weekday: 'long' })}
            {finished.getFullYear() !== new Date().getFullYear() ? `, ${finished.getFullYear()}` : ''}</Text>
        </View>
        <PixelSprite name={form} shiny={record.shiny} size={112} />
      </View>
    </View>

    <View style={[page.sheet, { paddingBottom: insets.bottom + 36 }]}>
      <View style={page.inner}>
        <Pressable accessibilityRole="button" accessibilityLabel="Share image" onPress={share}
          style={({ pressed }) => [page.fab, { backgroundColor: ink, opacity: pressed ? 0.85 : 1 }]}>
          <Icon name="share" size={24} color={colors.onBrand} />
        </Pressable>
        <Text accessibilityRole="header" style={page.title}>{cardTitle(family, record)}</Text>
        <Text style={page.description}>{describeAdventure(adventure, facts)}</Text>
        <View style={page.divider} />

        <Row lead={<View style={[page.dot, { backgroundColor: ink }]} />} label="Type" value={type.charAt(0).toUpperCase() + type.slice(1)} />
        <Row icon="clock" label="Time" value={started ? `${time(started)}  →  ${time(finished)}` : `Finished at ${time(finished)}`}
          side={shortDuration(record.elapsedSeconds)} />
        <Row icon="location" label="Distance" value={km(record.meters)} side={averagePace(record.elapsedSeconds, record.meters)} />
        <Row icon={running ? 'run' : 'walk'} label="Activity" value={record.activity ? running ? 'Run' : 'Walk' : 'Adventure'}
          side={facts.steps ? `${facts.steps.toLocaleString()} steps` : undefined} />
        <Row icon={device} label="Recorded on" value={device === 'phone' ? 'This phone' : 'Your watch'}
          side={device === 'phone' ? 'GPS route' : 'Step count'} />
        <Row icon="egg" label="Egg" value={facts.evolution.length ? facts.hatchSeconds ? `Hatched at ${shortDuration(facts.hatchSeconds)}` : 'Hatched'
          : `${km(5000 - record.meters)} short of hatching`} />
        {facts.bests.length > 0 && <Row icon="trophy" label="Personal best" value={facts.bests.map(metric => bestLabels[metric]).join(', ')} />}

        <View style={page.divider} />
        <Text style={page.label}>Pokemon reached</Text>
        {facts.evolution.length ? <View style={page.avatars}>
          {facts.evolution.map((name, i) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`View ${name} in your Dex`}
            onPress={() => router.push({ pathname: '/pokemon', params: { name } })}
            style={({ pressed }) => [page.avatar, { marginLeft: i ? -12 : 0, zIndex: facts.evolution.length - i, opacity: pressed ? 0.7 : 1 }]}>
            <PixelSprite name={name} shiny={record.shiny} size={50} />
          </Pressable>)}
          <Text style={page.chain} numberOfLines={2}>{facts.evolution.join(' › ')}</Text>
        </View> : <Copy small>The egg did not hatch this time: it needs 5 km in one adventure.</Copy>}

        {path ? <>
          <View style={page.divider} />
          <Text style={page.label}>Route</Text>
          <RouteMap path={path} height={240} label={`Map of the route, ${km(record.meters)}`} />
        </> : <Copy small>No route: watches count your steps and distance without GPS, so only adventures recorded on this phone have a map.</Copy>}
      </View>
    </View>
  </ScrollView>
}

// A row like a calendar event's: an icon in a soft circle, what it is, and a value on the right.
function Row({ icon, lead, label, value, side }: { icon?: IconName, lead?: ReactNode, label: string, value: string, side?: string }) {
  return <View accessible accessibilityLabel={`${label}: ${value}${side ? `, ${side}` : ''}`} style={page.row}>
    <View style={page.rowIcon}>{lead ?? (icon && <Icon name={icon} size={20} color={colors.muted} />)}</View>
    <View style={{ flex: 1 }}>
      <Text style={page.label}>{label}</Text>
      <Text style={page.value}>{value}</Text>
    </View>
    {!!side && <Text style={page.side}>{side}</Text>}
  </View>
}

const page = StyleSheet.create({
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 30, gap: 18 },
  bar: { flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255, 255, 255, 0.75)', alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  day: { fontFamily: fonts.black, color: colors.ink, fontSize: 40, lineHeight: 46 },
  weekday: { fontFamily: fonts.body, color: colors.ink, fontSize: 24, lineHeight: 30, opacity: 0.75 },
  sheet: { flexGrow: 1, backgroundColor: colors.panel, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingHorizontal: 22, paddingTop: 26 },
  inner: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 16 },
  // The round Share button sits on the sheet's edge, like the edit button on a calendar event.
  fab: { position: 'absolute', right: 4, top: -58, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    ...shadows.card },
  title: { fontFamily: fonts.black, color: colors.ink, fontSize: 28, lineHeight: 34, marginRight: 64 },
  description: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23 },
  divider: { height: 1, backgroundColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8 },
  label: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  value: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 22 },
  side: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19, backgroundColor: colors.sunken, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.sunken, borderWidth: 3, borderColor: colors.panel,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chain: { flex: 1, marginLeft: 12, fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 }
})
