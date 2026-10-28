import { useCallback, useMemo, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useJournal } from '../../store'
import { dexEntries, duration, km, personalBests, recordForm } from '../../journal'
import type { Metric } from '../../journal'
import { missions } from '../../progress'
import { allAdventures, bestLabels } from '../../adventures'
import { adventuresIn, adventuresOn, bento, periodRange, recentDays, shortDuration, summary } from '../../journal-calendar'
import type { Period } from '../../journal-calendar'
import { BentoTile, DayCard, DayStrip, PeriodChips } from '../../JournalCalendar'
import { PixelSprite } from '../../games/TeamPicker'
import { Button, Copy, Eyebrow, Panel, Screen, Title, colors, fonts } from '../../ui'

// The Journal is a calendar. Pick a day for its distance and time (your buddy stands on that card), then browse the
// adventures of its week, month or year as bento tiles; each opens its details. Personal bests follow. Missions and
// Legendary Expeditions live on the Adventure tab.

// The most tiles a period shows; All adventures lists every one.
const TILES = 12
const periodNames: Record<Period, string> = { week: 'This week', month: 'This month', year: 'This year' }

export default function JournalScreen() {
  const { journal, buddy, progress, error, phoneRuns } = useJournal()
  const runs = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  // Today moves on if the app stays open past midnight.
  const [now, setNow] = useState(Date.now)
  useFocusEffect(useCallback(() => setNow(Date.now()), []))
  const days = useMemo(() => recentDays(runs, now), [runs, now])
  const [chosen, setChosen] = useState<number | null>(null)
  const [period, setPeriod] = useState<Period>('week')
  const [atStart, setAtStart] = useState(true)
  const day = chosen ?? days[0].start
  const open = days.findIndex(item => item.start === day)
  const onDay = useMemo(() => adventuresOn(runs, day), [runs, day])
  const inPeriod = useMemo(() => adventuresIn(runs, periodRange(day, period)), [runs, day, period])
  const [left, right] = bento(inPeriod.slice(0, TILES))
  const total = summary(inPeriod)
  const badges = missions(journal, progress).filter(mission => !mission.weekly && progress.unlocked[mission.id]).length
  const pokemon = journal ? dexEntries(journal).length : 0
  // A period is named from the chosen day: "This week" for the current one, its dates otherwise.
  const thisPeriod = periodRange(now, period)[0] === periodRange(day, period)[0]
  const periodName = thisPeriod ? periodNames[period] : period === 'year' ? String(new Date(day).getFullYear())
    : period === 'month' ? new Date(day).toLocaleDateString([], { month: 'long', year: 'numeric' })
    : `Week of ${new Date(periodRange(day, 'week')[0]).toLocaleDateString([], { month: 'short', day: 'numeric' })}`

  return <Screen>
    <View style={page.header}>
      <View style={{ flex: 1, gap: 2 }}>
        <Eyebrow>ZEPIMON · FIELD JOURNAL</Eyebrow>
        <Text accessibilityRole="header" style={page.title}>Journal</Text>
      </View>
      <View style={page.counts}>
        <Text style={page.count}>{pokemon}<Text style={page.countLabel}> Pokemon</Text></Text>
        <Text style={page.count}>{badges}<Text style={page.countLabel}> badges</Text></Text>
      </View>
    </View>
    {!!error && <Copy color={colors.danger}>{error}</Copy>}

    <View>
      {/* Room on the right for your buddy, who stands on the day card's edge. */}
      <View style={{ marginRight: buddy ? 92 : 0 }}>
        <DayStrip days={days} selected={days[open]?.key ?? ''} onSelect={setChosen} onAtStart={setAtStart} />
      </View>
      <DayCard day={day} adventures={onDay} buddy={buddy} today={open === 0} joined={open === 0 && atStart} />
    </View>

    <View style={page.sectionRow}>
      <Text style={page.section}>Adventures</Text>
      {runs.length > 0 && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/adventures')}>
        <Text style={page.link}>View all</Text>
      </Pressable>}
    </View>
    <PeriodChips value={period} onChange={setPeriod} />
    <Copy small>{periodName} · {total.count} {total.count === 1 ? 'adventure' : 'adventures'} · {km(total.meters)}{total.count ? ` · ${shortDuration(total.seconds)}` : ''}</Copy>
    {inPeriod.length ? <View style={page.bento}>
      {[left, right].map((column, i) => <View key={i} style={page.column}>
        {column.map(item => <BentoTile key={item.adventure.id} adventure={item.adventure} tall={item.tall} />)}
      </View>)}
    </View> : <Panel>
      <Title>{runs.length ? `No adventures ${thisPeriod ? periodNames[period].toLowerCase() : 'then'}` : 'A fresh page'}</Title>
      <Copy>{runs.length ? 'Walk or run with an egg, on this phone or your watch, and it lands here.'
        : 'Start a walk or run in the Adventure tab, or link your watch in Settings, to fill your journal.'}</Copy>
      <Button title="Start an adventure" onPress={() => router.push('/adventure')} />
      {!runs.length && <Button title="Sync my journal" secondary onPress={() => router.push('/import')} />}
    </Panel>}
    {inPeriod.length > TILES && <Button title={`View all ${inPeriod.length} from ${periodName.toLowerCase()}`} secondary onPress={() => router.push('/adventures')} />}

    {journal && <PersonalBests journal={journal} />}
  </Screen>
}

// The three personal bests as small tiles: the Pokemon, the record and what it is.
function PersonalBests({ journal }: { journal: NonNullable<ReturnType<typeof useJournal>['journal']> }) {
  const bests = personalBests(journal)
  return <View style={{ gap: 10 }}>
    <Text style={page.section}>Personal bests</Text>
    <View style={page.bests}>
      {(['distance', 'elapsed', 'hatch'] as Metric[]).map(metric => {
        const record = bests[metric]
        const pokemon = record ? recordForm(journal.routes[record.route], record) : 'Egg'
        return <View key={metric} style={page.best} accessible
          accessibilityLabel={`${bestLabels[metric]}: ${record ? `${pokemon}, ${metric === 'distance' ? km(record.meters) : duration(metric === 'elapsed' ? record.elapsedSeconds : record.hatchSeconds)}` : 'no record yet'}`}>
          <PixelSprite name={pokemon} shiny={!!record?.shiny} size={44} />
          <Text numberOfLines={1} style={page.bestValue}>{record ? metric === 'distance' ? km(record.meters)
            : duration(metric === 'elapsed' ? record.elapsedSeconds : record.hatchSeconds) : '—'}</Text>
          <Text numberOfLines={2} style={page.bestLabel}>{bestLabels[metric]}</Text>
        </View>
      })}
    </View>
  </View>
}

const page = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  title: { fontFamily: fonts.black, color: colors.ink, fontSize: 34, lineHeight: 40 },
  counts: { alignItems: 'flex-end', paddingBottom: 4 },
  count: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  countLabel: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  section: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 22, lineHeight: 28 },
  link: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 15, lineHeight: 20 },
  bento: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  column: { flex: 1, gap: 12 },
  bests: { flexDirection: 'row', gap: 10 },
  best: { flex: 1, backgroundColor: colors.panel, borderRadius: 22, padding: 12, gap: 4, alignItems: 'flex-start' },
  bestValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 18, lineHeight: 24 },
  bestLabel: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 16 }
})
