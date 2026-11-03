import { useCallback, useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useJournal } from '../store'
import { dayKey } from '../progress'
import { allAdventures } from '../adventures'
import type { Adventure } from '../adventures'
import { adventuresIn, shortDuration, summary } from '../journal-calendar'
import { change, estimatedKcal, hatched, steps } from '../journal-stats'
import { daysSoFar, shiftWindow, statsYears, windowFromParams, windowName } from '../stats-window'
import type { Window } from '../stats-window'
import { paceSummary, paceText } from '../running'
import { Card, Squish, distance } from '../JournalDashboard'
import { PeriodSheet } from '../StatsFilter'
import { useReducedMotion } from '../games/hooks'
import { Copy, Icon, Screen, colors, displayFont, fonts, retro, themedStyles, useTheme } from '../ui'

// Compare, opened from Your stats: two periods side by side, A (what Your stats showed) and B (by default the one
// before it, the same length). Each can be any week, month, year or range of days. Every figure gets a pair of bars and
// the change from B to A, green where A did better (further, longer, more; a faster pace) and grey where it did not.

const native = Platform.OS !== 'web'
const kindNames = { week: 'Week', month: 'Month', year: 'Year', range: 'Range' }

type Figures = { meters: number, perDay: number, count: number, seconds: number, pace: number | null, hatched: number, kcal: number, steps: number | null }
function figures(adventures: Adventure[], window: Window, now: number): Figures {
  const inside = adventuresIn(adventures, [window.start, window.end])
  const total = summary(inside)
  return { meters: total.meters, perDay: total.meters / daysSoFar(window, now), count: total.count, seconds: total.seconds,
    pace: paceSummary(inside).pace, hatched: hatched(inside), kcal: estimatedKcal(inside), steps: steps(inside) }
}

// Each row: its name, how to read the value, and whether less is better (only pace).
type Row = { key: keyof Figures, label: string, show: (value: number) => string, lowerIsBetter?: boolean }
const rows: Row[] = [
  { key: 'meters', label: 'Distance', show: value => `${distance(value)} km` },
  { key: 'perDay', label: 'Average a day', show: value => `${distance(value)} km` },
  { key: 'count', label: 'Adventures', show: value => String(value) },
  { key: 'seconds', label: 'Time', show: value => value ? shortDuration(value) : '0 min' },
  { key: 'pace', label: 'Average pace', show: value => `${paceText(value)} /km`, lowerIsBetter: true },
  { key: 'hatched', label: 'Eggs hatched', show: value => String(value) },
  { key: 'kcal', label: 'Energy (est.)', show: value => `${value.toLocaleString()} kcal` },
  { key: 'steps', label: 'Steps', show: value => value.toLocaleString() }
]

export default function CompareScreen() {
  useTheme()
  const reduced = useReducedMotion()
  const params = useLocalSearchParams<{ kind?: string, start?: string, end?: string }>()
  const { progress, phoneRuns } = useJournal()
  const runs = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const [now, setNow] = useState(Date.now)
  useFocusEffect(useCallback(() => setNow(Date.now()), []))
  const [a, setA] = useState(() => windowFromParams(params, Date.now()))
  const [b, setB] = useState(() => shiftWindow(windowFromParams(params, Date.now()), -1))
  const [editing, setEditing] = useState<'a' | 'b' | null>(null)
  const walked = useMemo(() => new Set(runs.map(run => dayKey(Date.parse(run.record.finishedAt)))), [runs])
  const years = useMemo(() => statsYears(runs, now), [runs, now])
  const first = useMemo(() => figures(runs, a, now), [runs, a, now])
  const second = useMemo(() => figures(runs, b, now), [runs, b, now])
  const nameA = windowName(a, now), nameB = windowName(b, now)
  const shown = rows.filter(row => row.key !== 'steps' || first.steps !== null || second.steps !== null)
  const gap = first.meters - second.meters

  return <Screen>
    <View style={{ gap: 8 }}>
      <PeriodButton tag="A" color={colors.edge} window={a} name={nameA} onPress={() => setEditing('a')} reduced={reduced} />
      <View style={look.swapRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Swap A and B" hitSlop={8} onPress={() => { setA(b); setB(a) }}
          style={({ pressed }) => [look.swap, pressed && { opacity: 0.7 }]}>
          <Icon name="swap" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <PeriodButton tag="B" color={colors.alt} window={b} name={nameB} onPress={() => setEditing('b')} reduced={reduced} />
    </View>

    <Card style={{ gap: 6 }}>
      <Text style={look.verdict}>{!first.meters && !second.meters ? 'No adventures in either period yet'
        : gap === 0 ? 'The same distance in both'
        : `${distance(Math.abs(gap))} km ${gap > 0 ? 'more' : 'less'} in A`}</Text>
      <Copy small>{nameA} against {nameB}{a.kind === 'range' || b.kind === 'range' || a.kind !== b.kind
        ? `, ${daysSoFar(a, now)} and ${daysSoFar(b, now)} days so far` : ''}.</Copy>
    </Card>

    <Card style={{ gap: 18 }}>
      {shown.map(row => <CompareRow key={row.key} row={row} a={first[row.key]} b={second[row.key]} reduced={reduced} windows={`${a.start}${b.start}${a.end}${b.end}`} />)}
    </Card>
    <Copy small>Energy is an estimate from distance (about 50 kcal a km walking, 70 running). Steps come from watch adventures only.</Copy>

    <PeriodSheet visible={editing !== null} window={editing === 'b' ? b : a} years={years} walked={walked} now={now} kinds
      title={editing === 'b' ? 'Choose period B' : 'Choose period A'} onPick={editing === 'b' ? setB : setA} onClose={() => setEditing(null)} reduced={reduced} />
  </Screen>
}

function PeriodButton({ tag, color, window, name, onPress, reduced }: { tag: string, color: string, window: Window, name: string, onPress: () => void, reduced: boolean }) {
  return <Squish reduced={reduced} onPress={onPress} accessibilityLabel={`Period ${tag}: ${name}. Change`} style={look.period}>
    <View style={[look.tag, { backgroundColor: color }]}><Text style={look.tagText}>{tag}</Text></View>
    <View style={{ flex: 1 }}>
      <Text style={look.kind}>{kindNames[window.kind]}</Text>
      <Text numberOfLines={1} textBreakStrategy="simple" style={look.periodName}>{name}</Text>
    </View>
    <Text style={look.changeLink}>Change</Text>
    <Icon name="chevron" size={20} color={colors.muted} />
  </Squish>
}

// One figure: its two values on bars scaled to the larger, and the change from B to A.
function CompareRow({ row, a, b, windows, reduced }: { row: Row, a: number | null, b: number | null, windows: string, reduced: boolean }) {
  const max = Math.max(a ?? 0, b ?? 0) || 1
  const delta = a === null || b === null ? null : change(a, b)
  const better = delta !== null && delta !== 'new' && delta !== 0 && (row.lowerIsBetter ? delta < 0 : delta > 0)
  const label = delta === null ? '—' : delta === 'new' ? 'New' : `${delta > 0 ? '+' : ''}${delta}%`
  return <View accessible accessibilityLabel={`${row.label}: A ${a === null ? 'none' : row.show(a)}, B ${b === null ? 'none' : row.show(b)}, ${label}`} style={{ gap: 8 }}>
    <View style={look.rowHead}>
      <Text style={look.rowLabel}>{row.label}</Text>
      <View style={[look.delta, better && { backgroundColor: colors.mint }]}>
        {delta !== null && delta !== 'new' && delta !== 0 && <Icon name={delta > 0 ? 'trendUp' : 'trendDown'} size={14} color={better ? colors.success : colors.muted} />}
        <Text style={[look.deltaText, better && { color: colors.success }]}>{label}</Text>
      </View>
    </View>
    <Bar value={a} max={max} color={colors.edge} text={a === null ? '—' : row.show(a)} windows={windows} reduced={reduced} />
    <Bar value={b} max={max} color={colors.alt} text={b === null ? '—' : row.show(b)} windows={windows} reduced={reduced} />
  </View>
}

// A bar that grows to its share when the periods change.
function Bar({ value, max, color, text, windows, reduced }: { value: number | null, max: number, color: string, text: string, windows: string, reduced: boolean }) {
  const [width, setWidth] = useState(0)
  const share = Math.max(value ? 0.02 : 0, (value ?? 0) / max)
  const [grow] = useState(() => new Animated.Value(reduced ? 1 : 0))
  useEffect(() => {
    if (reduced) { grow.setValue(1); return }
    grow.setValue(0)
    Animated.timing(grow, { toValue: 1, duration: 600, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: native }).start()
  }, [windows, reduced, grow])
  return <View style={look.barRow}>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={look.track}>
      {width > 0 && <Animated.View style={[look.fill, { backgroundColor: color, width: width * share,
        transform: [{ translateX: grow.interpolate({ inputRange: [0, 1], outputRange: [-width * share / 2, 0] }) }, { scaleX: grow }] }]} />}
    </View>
    <Text numberOfLines={1} style={look.barText}>{text}</Text>
  </View>
}

const look = themedStyles(() => ({
  period: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.panel, borderRadius: retro() ? 10 : 22,
    ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` } : { boxShadow: `0px 6px 18px ${colors.shadow}` }) },
  tag: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontFamily: fonts.black, color: colors.onEdge, fontSize: 16, lineHeight: 20 },
  kind: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  periodName: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  changeLink: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 14, lineHeight: 19 },
  swapRow: { alignItems: 'center', marginVertical: -20, zIndex: 1 },
  swap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
    borderWidth: 3, borderColor: colors.bg },
  verdict: { fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: retro() ? 20 : 22, lineHeight: 28 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowLabel: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.sunken },
  deltaText: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 12, borderRadius: 6 },
  barText: { width: 104, textAlign: 'right', fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] }
}))
