import { useCallback, useMemo, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../../store'
import { usePreferences } from '../../preferences'
import { dexEntries, duration, km, personalBests, recordForm } from '../../journal'
import type { Metric } from '../../journal'
import { dayKey } from '../../progress'
import { allAdventures, bestLabels } from '../../adventures'
import { adventuresIn, periodRange, summary } from '../../journal-calendar'
import type { Period } from '../../journal-calendar'
import { change, estimatedKcal, greeting, hatched, previousRange, slices as sliceUp, steps, streak } from '../../journal-stats'
import { daysSoFar, sliceName, statsKinds, statsYears, switchKind, unitFor, windowFor, windowParams, windowSlices } from '../../stats-window'
import type { Window } from '../../stats-window'
import { AchievementsPreview, ActivityTile, Card, DistanceChart, Greeting, PaceStrip, ProgressCard, RaceRecords, SectionHead, StreakBanner, distance } from '../../JournalDashboard'
import { PeriodSheet, SegmentedTabs, WindowBar } from '../../StatsFilter'
import { achievements, paceSummary, raceRecords } from '../../running'
import { PixelSprite } from '../../games/TeamPicker'
import { useReducedMotion } from '../../games/hooks'
import { LegendaryGate } from '../../LegendaryGate'
import { Button, Copy, Icon, Panel, Screen, Title, colors, displayFont, fonts, themedStyles, useTheme } from '../../ui'

// The Journal: a greeting with your buddy over the distance you've travelled, your progress over this week, month or year (a ring of the days
// you walked, the distance and what it adds up to), your weekly streak, the Legendary Gate (src/LegendaryGate.tsx),
// your latest adventures, the period day by day as a chart you scrub to read any day with its pacing, your running
// records (fastest 5 km to marathon), your latest achievements and your personal bests. The pieces live in
// src/JournalDashboard.tsx and the figures in src/journal-stats.ts and src/running.ts. The calendar button opens the
// Calendar (src/app/calendar.tsx) to pick any day of any month.

// Recent activity shows this many adventures; All adventures lists every one.
const RECENT = 4
const against: Record<Period, string> = { week: 'last week', month: 'last month', year: 'last year' }

export default function JournalScreen() {
  useTheme()
  const reduced = useReducedMotion()
  const { journal, buddy, progress, error, phoneRuns } = useJournal()
  const { name } = usePreferences()
  const runs = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  // Today moves on if the app stays open past midnight.
  const [now, setNow] = useState(Date.now)
  useFocusEffect(useCallback(() => setNow(Date.now()), []))
  const [period, setPeriod] = useState<Period>('week')

  const days = useMemo(() => sliceUp(runs, now, period, now), [runs, now, period])
  const inPeriod = useMemo(() => adventuresIn(runs, periodRange(now, period)), [runs, now, period])
  const before = useMemo(() => adventuresIn(runs, previousRange(now, period, now)), [runs, now, period])
  const total = summary(inPeriod)
  const totals = { meters: total.meters, seconds: total.seconds, count: total.count, kcal: estimatedKcal(inPeriod), steps: steps(inPeriod), hatched: hatched(inPeriod) }
  const previous = summary(before).meters
  const walking = streak(runs, now)
  const records = useMemo(() => raceRecords(runs), [runs])
  const earned = useMemo(() => achievements(runs), [runs])

  // Your stats look at their own window (any week, month, year or range of days), apart from the progress card.
  const [win, setWin] = useState<Window>(() => windowFor('week', Date.now()))
  const [picking, setPicking] = useState(false)
  const statSlices = useMemo(() => windowSlices(runs, win, now), [runs, win, now])
  const inWindow = useMemo(() => adventuresIn(runs, [win.start, win.end]), [runs, win])
  const windowTotal = summary(inWindow)
  const pacing = useMemo(() => paceSummary(inWindow), [inWindow])
  const walked = useMemo(() => new Set(runs.map(run => dayKey(Date.parse(run.record.finishedAt)))), [runs])
  const years = useMemo(() => statsYears(runs, now), [runs, now])
  const unit = unitFor(win)
  const windowKey = `${win.kind}:${win.start}:${win.end}`

  // The chart reads the latest slice (today, in a running window) until you touch another.
  const today = Math.max(0, statSlices.filter(slice => !slice.future).length - 1)
  const [touched, setTouched] = useState<{ key: string, index: number } | null>(null)
  const picked = touched && touched.key === windowKey ? touched.index : today
  const setPicked = (index: number) => setTouched({ key: windowKey, index })
  const chosen = statSlices[picked] ?? statSlices[today]

  // The greeting's card: every adventure's distance, and this week's share whatever period the progress card shows.
  const lifetime = useMemo(() => summary(runs).meters, [runs])
  const thisWeek = useMemo(() => summary(adventuresIn(runs, periodRange(now, 'week'))), [runs, now])
  const pokemon = journal ? dexEntries(journal).length : 0
  const openCalendar = (day = now) => router.push({ pathname: '/calendar', params: { day: String(day) } })

  return <Screen>
    <Greeting name={name || 'Trainer'} greeting={greeting(now)} buddy={buddy} pokemon={pokemon} weeks={walking.weeks}
      meters={lifetime} week={thisWeek} onCalendar={() => openCalendar()} reduced={reduced} />
    {!!error && <Copy color={colors.danger}>{error}</Copy>}

    <ProgressCard slices={days} totals={totals} change={change(total.meters, previous)} against={`vs ${period === 'week' ? 'this time ' : ''}${against[period]}`}
      period={period} onPeriod={setPeriod} reduced={reduced} />
    <StreakBanner {...walking} reduced={reduced} onPress={() => openCalendar()} />
    <LegendaryGate variant="strip" pulse />

    <SectionHead title="Recent activity" action={runs.length ? 'View all' : undefined} onAction={() => router.push('/adventures')} />
    {runs.length ? <View style={page.tiles}>
      {runs.slice(0, RECENT).map((adventure, i, shown) => <ActivityTile key={adventure.id} adventure={adventure} index={i} reduced={reduced}
        wide={shown.length % 2 === 1 && i === shown.length - 1} />)}
    </View> : <Panel>
      <Title>A fresh page</Title>
      <Copy>Start a walk or run in the Adventure tab, or link your watch in Settings, to fill your journal.</Copy>
      <Button title="Start an adventure" onPress={() => router.push('/adventure')} />
      <Button title="Sync my journal" secondary onPress={() => router.push('/import')} />
    </Panel>}

    <SectionHead title="Your stats" />
    <Card>
      <SegmentedTabs options={statsKinds} value={win.kind} onChange={kind => setWin(switchKind(win, kind, now))} reduced={reduced} />
      <WindowBar window={win} now={now} onChange={setWin} onOpen={() => setPicking(true)} reduced={reduced} />
      <View style={page.total}>
        <Text style={page.totalValue}>{distance(windowTotal.meters)}<Text style={page.totalUnit}> km</Text></Text>
        <Text style={page.totalFacts}>{windowTotal.count} {windowTotal.count === 1 ? 'adventure' : 'adventures'} · {distance(windowTotal.meters / daysSoFar(win, now))} km a day</Text>
      </View>
      <DistanceChart slices={statSlices} selected={picked} onSelect={setPicked} windowKey={windowKey} reduced={reduced} />
      {chosen && <View style={page.day}>
        <View style={{ flex: 1 }}>
          <Text style={page.dayName}>{sliceName(chosen.start, chosen.end, unit)}</Text>
          <Text style={page.dayFacts}>{km(chosen.meters)} · {chosen.count} {chosen.count === 1 ? 'adventure' : 'adventures'}</Text>
        </View>
        {unit === 'day' && <Button title="Open day" secondary onPress={() => openCalendar(chosen.start)} />}
      </View>}
      <PaceStrip {...pacing} />
      <Button title="Compare with another period" secondary onPress={() => router.push({ pathname: '/compare', params: windowParams(win) })} />
    </Card>
    <PeriodSheet visible={picking} window={win} years={years} walked={walked} now={now} onPick={setWin} onClose={() => setPicking(false)}
      reduced={reduced} />

    <SectionHead title="Running records" />
    <RaceRecords records={records} />

    <SectionHead title="Achievements" action="View all" onAction={() => router.push('/achievements')} />
    <AchievementsPreview items={earned} onAll={() => router.push('/achievements')} />

    {journal && <PersonalBests journal={journal} />}
  </Screen>
}

// The three personal bests as small cards: the Pokemon, the record and what it is.
function PersonalBests({ journal }: { journal: NonNullable<ReturnType<typeof useJournal>['journal']> }) {
  const bests = personalBests(journal)
  return <>
    <View style={page.bestsHead}>
      <Icon name="trophy" size={22} color={colors.gold} />
      <Text accessibilityRole="header" style={page.bestsTitle}>Personal bests</Text>
    </View>
    <View style={page.bests}>
      {(['distance', 'elapsed', 'hatch'] as Metric[]).map(metric => {
        const record = bests[metric]
        const pokemon = record ? recordForm(journal.routes[record.route], record) : 'Egg'
        const value = record ? metric === 'distance' ? km(record.meters) : duration(metric === 'elapsed' ? record.elapsedSeconds : record.hatchSeconds) : '—'
        return <Card key={metric} style={page.best}>
          <View accessible accessibilityLabel={`${bestLabels[metric]}: ${record ? `${pokemon}, ${value}` : 'no record yet'}`} style={{ gap: 4 }}>
            <PixelSprite name={pokemon} shiny={!!record?.shiny} size={48} />
            <Text numberOfLines={1} adjustsFontSizeToFit style={page.bestValue}>{value}</Text>
            <Text numberOfLines={2} style={page.bestLabel}>{bestLabels[metric]}</Text>
          </View>
        </Card>
      })}
    </View>
  </>
}

const page = themedStyles(() => ({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  total: { gap: 2, paddingHorizontal: 2 },
  totalValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] },
  totalUnit: { fontFamily: fonts.heavy, fontSize: 16 },
  totalFacts: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  day: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  dayName: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  dayFacts: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  bestsHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  bestsTitle: { flex: 1, fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: 21, lineHeight: 27 },
  bests: { flexDirection: 'row', gap: 10 },
  best: { flex: 1, padding: 12, gap: 4 },
  bestValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 17, lineHeight: 22 },
  bestLabel: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 16 }
}))
