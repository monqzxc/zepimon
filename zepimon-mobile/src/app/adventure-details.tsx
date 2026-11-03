import { useMemo, useState } from 'react'
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { km, recordForm } from '../journal'
import { adventureFacts, allAdventures, bestLabels, findAdventure } from '../adventures'
import type { Adventure } from '../adventures'
import { averagePace, clock, earnedBy, fastestPace, movingTime, paceText, splits } from '../running'
import type { Split } from '../running'
import { pokemonType } from '../catalog'
import { describeAdventure, shortDuration } from '../journal-calendar'
import { RouteMap } from '../RouteMap'
import { BottomSheet } from '../BottomSheet'
import { cardTitle } from '../ShareCard'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Copy, Icon, Panel, PokeballIcon, Screen, Title, colors, fonts, shadows, themedStyles, typeInks, typeLabel, typeTints, useTheme } from '../ui'
import type { IconName } from '../ui'

// One saved adventure, opened from a Journal tile. The route's live map fills the top of the screen and stays put; the
// details below it (src/BottomSheet.tsx) drag up over it until they cover the screen, then scroll: what the adventure
// earned (records, feats and milestones from src/running.ts too), when it happened, its stats, its pace per km, a
// description and the Pokemon it reached. The details'
// white panel meets the map with a stepped edge, its right side higher; what the adventure earned leads the details.
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
// are rounded, and one smooth S-shaped slope joins the two levels. The map shows through the notch the lower left leaves.
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
  const { journal, progress, phoneRuns } = useJournal()
  const everyone = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
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
  const step = Math.round(width * 0.42)
  // Open, the sheet's own top edge tucks under the bar, so its content starts just below the bar.
  const high = insets.top + BAR - 2 - (STEP + 14)
  const [y] = useState(() => new Animated.Value(edge))
  const [open, setOpen] = useState(false)
  const covered = y.interpolate({ inputRange: [high, high + 80], outputRange: [1, 0], extrapolate: 'clamp' })
  const uncovered = y.interpolate({ inputRange: [high, high + 80], outputRange: [0, 1], extrapolate: 'clamp' })
  const reached = facts.evolution.at(-1)
  const share = () => router.push({ pathname: '/share', params: { id } })
  // What this adventure earned, each with the number behind it: records first, then the egg, then feats and milestones.
  // A long list shows its first few until opened, so the stats stay in reach.
  const bestValues = { distance: km(record.meters), elapsed: shortDuration(record.elapsedSeconds), hatch: shortDuration(facts.hatchSeconds) }
  const running = earnedBy(adventure, everyone)
  const achievements: { icon: IconName, title: string, detail: string }[] = [
    ...facts.bests.map(metric => ({ icon: 'trophy' as const, title: bestLabels[metric], detail: `Personal best · ${bestValues[metric]}` })),
    ...running.filter(item => item.id.startsWith('record-')),
    ...record.shiny ? [{ icon: 'sparkle' as const, title: 'Shiny', detail: 'A rare colour variant' }] : [],
    ...facts.evolution.length ? [{ icon: 'egg' as const, title: 'Hatched',
      detail: facts.hatchSeconds ? `Into ${facts.evolution[0]} after ${shortDuration(facts.hatchSeconds)}` : `Into ${facts.evolution[0]}` }] : [],
    ...running.filter(item => !item.id.startsWith('record-'))
  ]
  const [allEarned, setAllEarned] = useState(false)
  const FEW = 4
  const listed = allEarned ? achievements : achievements.slice(0, FEW)
  const year = finished.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } as const : {}
  const when = `${finished.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', ...year })} · `
    + (started ? `${time(started)} – ${time(finished)}` : time(finished))
  const kilometres = splits(adventure)
  const distance = Number.isFinite(record.meters) && record.meters >= 0 ? (record.meters / 1000).toFixed(2) : '--'

  return <View style={{ flex: 1, backgroundColor: colors.panel }}>
    <StatusBar style={open && !dark ? 'dark' : 'light'} />
    {/* The map stays put and keeps its gestures above the details, which drag up over it and then scroll. */}
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

    <BottomSheet low={edge} high={high} y={y} onOpen={setOpen} contentStyle={[page.content, { paddingBottom: insets.bottom + 100 }]}
      header={<View style={page.sheetTop}>
        <Svg pointerEvents="none" width={width} height={STEP + RADIUS} style={page.edge}>
          <Path d={panelTop(width, step)} fill={colors.panel} />
        </Svg>
        <View accessible accessibilityLabel={`${typeLabel(type)} type, recorded ${device === 'phone' ? 'on this phone' : 'on your watch'}`}
          style={page.aside}>
          <View style={page.typeLine}>
            <View style={[page.dot, { backgroundColor: ink }]} />
            <Text style={page.typeText}>{typeLabel(type)}</Text>
          </View>
          <Text style={page.device}>{device === 'phone' ? 'This phone' : 'Your watch'}</Text>
        </View>
      </View>}>
        <View style={{ gap: 4 }}>
          <Text style={page.title}>{cardTitle(family, record)}</Text>
          <View style={page.when}>
            <Icon name="calendar" size={16} color={colors.muted} />
            <Text style={page.whenText}>{when}</Text>
          </View>
        </View>

        {achievements.length > 0 && <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={page.heading}>Achievements</Text>
          {listed.map(({ icon, title, detail }) => <View key={title} accessible accessibilityLabel={`${title}. ${detail}`}
            style={[page.achievement, { backgroundColor: typeTints[type] || colors.sunken }]}>
            <View style={[page.medal, { backgroundColor: ink }]}><Icon name={icon} size={20} color={onInk} /></View>
            <View style={{ flex: 1 }}>
              <Text style={page.achievementTitle}>{title}</Text>
              <Text style={page.achievementDetail}>{detail}</Text>
            </View>
          </View>)}
          {achievements.length > FEW && <Pressable accessibilityRole="button" onPress={() => setAllEarned(shown => !shown)}
            style={({ pressed }) => [page.more, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={[page.moreText, { color: ink }]}>{allEarned ? 'Show fewer' : `Show ${achievements.length - FEW} more`}</Text>
            <View style={allEarned && { transform: [{ rotate: '180deg' }] }}><Icon name="chevronDown" size={18} color={ink} /></View>
          </Pressable>}
        </View>}

        <View style={page.stats}>
          <View style={page.statRow}>
            <Stat value={distance} label="Km" />
            <Stat value={clock(movingTime(adventure))} label="Moving time" divided />
            <Stat value={clock(record.elapsedSeconds ?? null)} label="Elapsed" divided />
          </View>
          <View style={[page.statRow, page.statRowDivided]}>
            <Stat value={paceText(averagePace(adventure))} label="Avg pace /km" />
            <Stat value={paceText(fastestPace(adventure))} label="Fastest /km" divided />
            <Stat value={facts.steps ? facts.steps.toLocaleString() : '--'} label="Steps" divided />
          </View>
        </View>

        {kilometres.length > 0 && <Splits splits={kilometres} ink={ink} />}

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
    </BottomSheet>

    {/* Once the details cover the screen, the bar becomes a plain header over them. */}
    <Animated.View pointerEvents="none" style={[page.barFill, { height: insets.top + BAR - 2, opacity: covered }]} />
    <View style={[page.bar, { top: insets.top + 10 }]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={6}
        style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="back" size={20} />
      </Pressable>
      <View>
        <Animated.Text accessibilityRole="header" style={[page.barTitle, { opacity: uncovered }]}>Details</Animated.Text>
        <Animated.Text accessible={false} style={[page.barTitle, page.barTitleCovered, { opacity: covered }]}>Details</Animated.Text>
      </View>
      {open ? <View style={page.round0} /> : path ? <Pressable accessibilityRole="button" accessibilityLabel="Recenter the map on the route" onPress={() => setFit(count => count + 1)}
        hitSlop={6} style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="locate" size={20} />
      </Pressable> : <View style={page.round} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name={device} size={18} color={ink} />
      </View>}
    </View>


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

// The splits, as a runner's table: each kilometre's number, its pace, a bar as long as it was fast and, when the GPS
// gave altitude, its climb in metres (below zero for a drop). The fastest whole kilometre's pace is in the type's ink.
// A part kilometre at the end shows its distance.
function Splits({ splits, ink }: { splits: Split[], ink: string }) {
  const whole = splits.filter(split => split.meters === 1000)
  const fastest = whole.length > 1 ? Math.min(...whole.map(split => split.pace)) : null
  const slowest = Math.max(...splits.map(split => split.pace))
  const quickest = Math.min(...splits.map(split => split.pace))
  const elevation = splits.some(split => split.elev !== null)
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={page.heading}>Splits</Text>
    <View>
      <View style={[page.split, page.splitHead]} accessible={false} importantForAccessibility="no-hide-descendants">
        <Text style={[page.splitKm, page.splitLabel]}>Km</Text>
        <Text style={[page.splitPace, page.splitLabel]}>Pace</Text>
        <View style={{ flex: 1 }} />
        {elevation && <Text style={[page.splitElev, page.splitLabel]}>Elev</Text>}
      </View>
      {splits.map(split => {
        const best = split.pace === fastest
        // Bars run from a third of the width for the slowest kilometre to all of it for the fastest.
        const share = slowest === quickest ? 1 : 0.35 + 0.65 * (slowest - split.pace) / (slowest - quickest)
        const label = split.meters === 1000 ? String(split.km) : (split.meters / 1000).toFixed(1)
        const climb = split.elev === null ? null : Math.round(split.elev)
        return <View key={split.km} accessible style={page.split}
          accessibilityLabel={`${split.meters === 1000 ? `Kilometre ${split.km}` : `Last ${km(split.meters)}`}: ${paceText(split.pace)} per kilometre${best ? ', fastest' : ''}`
            + (climb === null ? '' : climb === 0 ? ', flat' : `, ${Math.abs(climb)} metres ${climb > 0 ? 'up' : 'down'}`)}>
          <Text style={page.splitKm}>{label}</Text>
          <Text style={[page.splitPace, best && { color: ink }]}>{paceText(split.pace)}</Text>
          <View style={page.splitTrack}>
            <View style={[page.splitBar, { width: `${Math.round(share * 100)}%`, backgroundColor: ink }]} />
          </View>
          {elevation && <Text style={page.splitElev}>{climb === null ? '--' : String(climb)}</Text>}
        </View>
      })}
    </View>
    <Copy small>{`Pace in moving time, so stops do not count${elevation ? '; elevation in metres gained or lost over each split, from GPS' : ''}.`
      + (fastest !== null ? ' Your fastest kilometre is in colour.' : '')}</Copy>
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
  edge: { position: 'absolute', top: 0, left: 0 },
  // The sheet's top: the stepped edge, whose lower part the panel below continues.
  sheetTop: { height: STEP + 14 },
  barFill: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.panel },
  barTitleCovered: { position: 'absolute', color: colors.ink },
  round0: { width: 44, height: 44 },
  bar: { position: 'absolute', left: 20, right: 20, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  barTitle: { fontFamily: fonts.heavy, color: '#FFFFFF', fontSize: 17, lineHeight: 22 },
  // Each achievement on a tile in its Pokemon's type tint, behind a medal in the type's ink.
  achievement: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  medal: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  achievementTitle: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  achievementDetail: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  moreText: { fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20 },
  // Type and device stand on the raised right, like the reference's rating and delivery fee.
  aside: { position: 'absolute', top: 18, right: 20, alignItems: 'flex-end', gap: 2 },
  typeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  typeText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19 },
  device: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 6, gap: 20 },
  title: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 20, lineHeight: 26 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { flex: 1, fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  stats: { backgroundColor: colors.sunken, borderRadius: 18 },
  statRow: { flexDirection: 'row', paddingVertical: 14 },
  statRowDivided: { borderTopWidth: 1, borderTopColor: colors.line },
  split: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 },
  splitHead: { minHeight: 32, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 6 },
  splitLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13 },
  splitKm: { width: 30, fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  splitTrack: { flex: 1, height: 26, justifyContent: 'center' },
  splitBar: { height: 26, borderRadius: 4 },
  splitElev: { width: 40, textAlign: 'right', fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  splitPace: { width: 48, fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
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
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.panel },
  dex: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  share: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareText: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 22 }
}))
