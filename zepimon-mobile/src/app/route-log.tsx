import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { km, recordForm } from '../journal'
import { allAdventures } from '../adventures'
import type { Adventure } from '../adventures'
import { MILESTONE, placeAt, routeLog } from '../adventure-route'
import type { Stretch } from '../adventure-route'
import { summary } from '../journal-calendar'
import { pokemonType } from '../catalog'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Chip, Copy, Eyebrow, Heading, Icon, Panel, colors, fonts, styles, themedStyles, typeTints, useTheme } from '../ui'

// The route log, opened from the Adventure tab: every stretch of the journey walked so far, newest first, each with its
// place and kilometres and the Pokemon whose adventures walked it, with how far each one went there. A stretch can take
// several adventures, and a long adventure shows on every stretch it walked; each opens its details. Shows the region
// you are in to begin with; the chips switch region, or show them all.
type Log = Stretch<Adventure>
const regionOf = (stretch: Log) => stretch.place.tour > 1 ? `${stretch.place.region} ${stretch.place.tour}` : stretch.place.region

export default function RouteLogScreen() {
  useTheme()
  const { progress, phoneRuns } = useJournal()
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const log = useMemo(() => routeLog(adventures), [adventures])
  const total = summary(adventures).meters
  const regions = useMemo(() => [...new Set(log.map(regionOf))], [log])
  const [picked, setPicked] = useState<string | null>(null)
  const region = picked ?? regions.at(-1) ?? 'all'
  const shown = useMemo(() => log.filter(stretch => region === 'all' || regionOf(stretch) === region).reverse(), [log, region])
  const reached = Math.floor(total / MILESTONE)
  const next = placeAt(total + 1)
  const first = adventures.at(-1)
  const species = new Set(adventures.map(run => recordForm(run.family, run.record) === 'Egg' ? run.family[0] : recordForm(run.family, run.record))).size

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <FlatList data={shown} keyExtractor={stretch => String(stretch.to)} windowSize={7} initialNumToRender={6} maxToRenderPerBatch={6}
      contentContainerStyle={[styles.content, { gap: 0 }]} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={<View style={{ gap: 12, marginBottom: 16 }}>
        <Panel>
          <Eyebrow>ROUTE LOG</Eyebrow>
          <Text style={styles.stat}>{km(total)}</Text>
          <Copy>{reached} {reached === 1 ? 'place' : 'places'} reached · {adventures.length} {adventures.length === 1 ? 'adventure' : 'adventures'} · {species} Pokemon</Copy>
          {total > 0 && <View accessible accessibilityLabel={`Next, ${next.name} in ${km(next.meters - total)}`} style={log_.next}>
            <Icon name="missions" size={18} color={colors.edge} />
            <Text numberOfLines={1} style={log_.nextText}>Next: {next.name}</Text>
            <Text style={log_.nextKm}>{km(next.meters - total)}</Text>
          </View>}
        </Panel>
        {regions.length > 1 && <View style={styles.row}>
          {regions.map(name => <Chip key={name} label={name} selected={region === name} onPress={() => setPicked(name)} />)}
          <Chip label="All" selected={region === 'all'} onPress={() => setPicked('all')} />
        </View>}
      </View>}
      ListEmptyComponent={<Panel>
        <Copy>Every {MILESTONE / 1000} km you walk or run reaches a new place, starting with Route 1. Each one shows here with the Pokemon that walked it.</Copy>
        <Button title="Start an adventure" onPress={() => router.navigate('/adventure')} />
      </Panel>}
      renderItem={({ item, index }) => <View style={{ gap: 12 }}>
        {region === 'all' && (index === 0 || regionOf(item) !== regionOf(shown[index - 1])) &&
          <View style={{ paddingTop: index ? 8 : 0 }}><Heading>{regionOf(item)}</Heading></View>}
        <StretchCard stretch={item} />
      </View>}
      ListFooterComponent={first ? <View style={{ paddingTop: 16 }}><Copy small>
        Your journey began in Pallet Town on {new Date(first.record.finishedAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}.
        Each place is the {MILESTONE / 1000} km leading up to it.</Copy></View> : null} />
  </SafeAreaView>
}

// One stretch: its kilometres, place and region, how far of it is walked if it is still under way, then each adventure
// that walked it.
function StretchCard({ stretch }: { stretch: Log }) {
  const { place, from, to, walked, runs } = stretch
  const open = walked < to - from
  const label = `${from / 1000}–${to / 1000}`
  return <Panel style={open ? { borderColor: colors.edge, borderWidth: 1.5 } : undefined}>
    <View style={log_.head}>
      <View style={[log_.badge, open && { backgroundColor: colors.mint }]}>
        <Text style={log_.badgeKm} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
        <Text style={log_.badgeUnit}>KM</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Eyebrow color={open ? colors.edge : colors.muted}>{open ? 'UNDER WAY' : `${place.region.toUpperCase()}${place.tour > 1 ? ` · TOUR ${place.tour}` : ''}`}</Eyebrow>
        <Text accessibilityRole="header" numberOfLines={1} style={log_.place}>{place.name}</Text>
        <Copy small>{open ? `${km(walked)} of ${km(to - from)} walked` : `${runs.length} Pokemon walked it`}</Copy>
      </View>
    </View>
    {open && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(walked / (to - from) * 100) }} style={styles.track}>
      <View style={[styles.fill, { width: `${walked / (to - from) * 100}%`, backgroundColor: colors.edge }]} />
    </View>}
    <View style={log_.runs}>
      {runs.map(({ run, meters }, i) => <RunRow key={`${run.id}-${i}`} run={run} meters={meters} share={meters / (to - from)} />)}
    </View>
  </Panel>
}

// An adventure on a stretch: its Pokemon, when, walk or run, and how far of the stretch it walked, as a bar too.
function RunRow({ run, meters, share }: { run: Adventure, meters: number, share: number }) {
  const form = recordForm(run.family, run.record)
  const name = (run.record.shiny ? 'Shiny ' : '') + (form === 'Egg' ? `${run.family[0]} egg` : form)
  const when = new Date(run.record.finishedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
  const running = run.record.activity === 'running'
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${km(meters)} of this stretch, ${running ? 'running' : 'walking'} on ${when}`}
    accessibilityHint="Opens this adventure's details" onPress={() => router.push({ pathname: '/adventure-details', params: { id: run.id } })}
    style={({ pressed }) => [log_.run, { opacity: pressed ? 0.7 : 1 }]}>
    <View style={[log_.art, { backgroundColor: typeTints[pokemonType(form === 'Egg' ? run.family[0] : form)] || colors.sunken }]}>
      <PixelSprite name={form} shiny={run.record.shiny} size={36} />
    </View>
    <View style={{ flex: 1, gap: 4 }}>
      <View style={log_.runTop}>
        <Text numberOfLines={1} style={log_.runName}>{name}</Text>
        <Text style={log_.runKm}>{km(meters)}</Text>
      </View>
      <View style={log_.runTop}>
        <View style={log_.share}><View style={[log_.shareFill, { width: `${Math.max(4, share * 100)}%` }]} /></View>
        <Icon name={running ? 'run' : 'walk'} size={13} color={colors.muted} />
        <Text style={log_.runWhen}>{when}</Text>
      </View>
    </View>
    <Icon name="chevron" size={18} color={colors.muted} />
  </Pressable>
}

const log_ = themedStyles(() => ({
  next: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: 14, backgroundColor: colors.mint },
  nextText: { flex: 1, fontFamily: fonts.heavy, fontSize: 14, color: colors.ink },
  nextKm: { fontFamily: fonts.black, fontSize: 14, color: colors.edge },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // The stretch's kilometres, like a route sign.
  badge: { width: 64, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: colors.sunken },
  badgeKm: { fontFamily: fonts.black, fontSize: 16, lineHeight: 20, color: colors.ink },
  badgeUnit: { fontFamily: fonts.heavy, fontSize: 10, letterSpacing: 1, color: colors.muted },
  place: { fontFamily: fonts.pixel, fontSize: 18, lineHeight: 23, color: colors.ink },
  runs: { gap: 2, marginTop: 2 },
  run: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line },
  art: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  runTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  runName: { flex: 1, fontFamily: fonts.heavy, fontSize: 14, color: colors.ink },
  runKm: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  share: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 3, backgroundColor: colors.edge },
  runWhen: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted }
}))
