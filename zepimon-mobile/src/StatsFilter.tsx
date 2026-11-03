import { useEffect, useState } from 'react'
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dayKey } from './progress'
import { monthGrid, startOfDay } from './journal-calendar'
import { addMonths, canGoForward, monthStart, rangePresets, rangeWindow, shiftWindow, statsKinds, switchKind, windowFor, windowName } from './stats-window'
import type { Window } from './stats-window'
import { Squish } from './JournalDashboard'
import { Button, Icon, colors, displayFont, fonts, retro, themedStyles } from './ui'

// Picking what Your stats and Compare look at: tabs for Week, Month, Year and Range, a bar that steps back and forward
// ("‹ October 2026 ›") and opens a sheet to pick any week, month, year or range of days. The future cannot be picked.

const native = Platform.OS !== 'web'
const ease = Easing.bezier(0.16, 1, 0.3, 1)

// A segmented control whose thumb slides to the choice.
export function SegmentedTabs<T extends string>({ options, value, onChange, reduced }: {
  options: [T, string][], value: T, onChange: (value: T) => void, reduced: boolean
}) {
  const [width, setWidth] = useState(0)
  const index = Math.max(0, options.findIndex(([option]) => option === value))
  const [slide] = useState(() => new Animated.Value(index))
  useEffect(() => {
    if (reduced) slide.setValue(index)
    else Animated.spring(slide, { toValue: index, speed: 18, bounciness: 4, useNativeDriver: native }).start()
  }, [index, reduced, slide])
  const cell = (width - 8) / options.length
  return <View accessibilityRole="radiogroup" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={look.track}>
    {width > 0 && <Animated.View style={[look.thumb, { width: cell, transform: [{ translateX: Animated.multiply(slide, cell) }] }]} />}
    {options.map(([option, label]) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: option === value }}
      onPress={() => onChange(option)} style={look.cell}>
      <Text numberOfLines={1} textBreakStrategy="simple" style={[look.tabLabel, option === value && look.tabOn]}>{label}</Text>
    </Pressable>)}
  </View>
}

// "‹ October 2026 ›": the arrows step to the window before or after, the name opens the picker.
export function WindowBar({ window, now, onChange, onOpen, reduced }: {
  window: Window, now: number, onChange: (window: Window) => void, onOpen: () => void, reduced: boolean
}) {
  const forward = canGoForward(window, now)
  const name = windowName(window, now)
  return <View style={look.bar}>
    <Squish reduced={reduced} onPress={() => onChange(shiftWindow(window, -1))} accessibilityLabel="Previous" style={look.step}>
      <Icon name="back" size={20} color={colors.edge} />
    </Squish>
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}. Choose another ${window.kind === 'range' ? 'range' : window.kind}`}
      onPress={onOpen} style={({ pressed }) => [look.name, pressed && { opacity: 0.7 }]}>
      <Text numberOfLines={1} textBreakStrategy="simple" style={look.nameText}>{name}</Text>
      <Icon name="chevronDown" size={18} color={colors.muted} />
    </Pressable>
    <Squish reduced={reduced} onPress={() => forward && onChange(shiftWindow(window, 1))} accessibilityLabel="Next"
      style={[look.step, !forward && { opacity: 0.35 }]}>
      <Icon name="chevron" size={20} color={colors.edge} />
    </Squish>
  </View>
}

// The picker, as a sheet from the bottom. kinds adds the Week / Month / Year / Range tabs to the sheet itself, for
// Compare, where there is no tab row above. walked holds the days (dayKey) with an adventure, marked in the calendars.
export function PeriodSheet({ visible, window, years, walked, now, kinds = false, title, onPick, onClose, reduced }: {
  visible: boolean, window: Window, years: number[], walked: Set<string>, now: number, kinds?: boolean, title?: string,
  onPick: (window: Window) => void, onClose: () => void, reduced: boolean
}) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [draft, setDraft] = useState(window)
  const [slide] = useState(() => new Animated.Value(0))
  // Opening resets the sheet to what is showing; closing keeps the modal up (leaving) while the sheet slides away.
  const [opened, setOpened] = useState(visible)
  const [leaving, setLeaving] = useState(false)
  if (visible !== opened) {
    setOpened(visible)
    if (visible) setDraft(window)
    else if (!reduced) setLeaving(true)
  }
  useEffect(() => {
    if (reduced) { slide.setValue(visible ? 1 : 0); return }
    if (!visible && !leaving) return
    const run = Animated.timing(slide, { toValue: visible ? 1 : 0, duration: visible ? 320 : 200, easing: visible ? ease : Easing.in(Easing.quad), useNativeDriver: native })
    run.start(({ finished }) => { if (finished && !visible) setLeaving(false) })
    return () => run.stop()
  }, [visible, leaving, reduced, slide])
  const pick = (next: Window) => { onPick(next); onClose() }
  const heading = title ?? { week: 'Choose a week', month: 'Choose a month', year: 'Choose a year', range: 'Choose dates' }[draft.kind]
  return <Modal visible={visible || leaving} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Animated.View style={[look.scrim, { opacity: slide }]}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal style={[look.sheet, { maxHeight: height * 0.88, paddingBottom: insets.bottom + 16,
      transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] }) }] }]}>
      <View style={look.grabber} />
      <View style={look.sheetHead}>
        <Text accessibilityRole="header" style={look.sheetTitle}>{heading}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={look.close}>
          <Icon name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
        {kinds && <SegmentedTabs options={statsKinds} value={draft.kind} onChange={kind => setDraft(switchKind(draft, kind, now))} reduced={reduced} />}
        {draft.kind === 'month' && <MonthPicker window={draft} now={now} onPick={pick} reduced={reduced} />}
        {draft.kind === 'year' && <YearPicker window={draft} years={years} onPick={pick} reduced={reduced} />}
        {draft.kind === 'week' && <DayCalendar mode="week" window={draft} walked={walked} now={now} onPick={pick} reduced={reduced} />}
        {draft.kind === 'range' && <DayCalendar mode="range" window={draft} walked={walked} now={now} onPick={pick} reduced={reduced} />}
      </ScrollView>
    </Animated.View>
  </Modal>
}

// A year to step through and its twelve months; months still to come are faint.
function MonthPicker({ window, now, onPick, reduced }: { window: Window, now: number, onPick: (window: Window) => void, reduced: boolean }) {
  const [year, setYear] = useState(new Date(window.start).getFullYear())
  const thisYear = new Date(now).getFullYear()
  const current = monthStart(window.start)
  return <View style={{ gap: 12 }}>
    <Stepper label={String(year)} onBack={() => setYear(year - 1)} onNext={year < thisYear ? () => setYear(year + 1) : undefined} reduced={reduced} />
    <View style={look.grid}>
      {Array.from({ length: 12 }, (_, month) => {
        const start = new Date(year, month, 1).getTime()
        const future = start > now
        const on = start === current
        return <Pressable key={month} disabled={future} accessibilityRole="button" accessibilityState={{ selected: on, disabled: future }}
          onPress={() => onPick(windowFor('month', start))} style={({ pressed }) => [look.option, on && look.optionOn, { opacity: future ? 0.35 : pressed ? 0.7 : 1 }]}>
          <Text style={[look.optionText, on && look.optionTextOn]}>{new Date(start).toLocaleDateString([], { month: 'short' })}</Text>
        </Pressable>
      })}
    </View>
  </View>
}

function YearPicker({ window, years, onPick }: { window: Window, years: number[], onPick: (window: Window) => void, reduced: boolean }) {
  const current = new Date(window.start).getFullYear()
  return <View style={look.grid}>
    {years.map(year => <Pressable key={year} accessibilityRole="button" accessibilityState={{ selected: year === current }}
      onPress={() => onPick(windowFor('year', new Date(year, 0, 1).getTime()))}
      style={({ pressed }) => [look.option, year === current && look.optionOn, pressed && { opacity: 0.7 }]}>
      <Text style={[look.optionText, year === current && look.optionTextOn]}>{year}</Text>
    </Pressable>)}
  </View>
}

function Stepper({ label, onBack, onNext, reduced }: { label: string, onBack: () => void, onNext?: () => void, reduced: boolean }) {
  return <View style={look.stepper}>
    <Squish reduced={reduced} onPress={onBack} accessibilityLabel="Previous" style={look.step}><Icon name="back" size={20} color={colors.edge} /></Squish>
    <Text accessibilityRole="header" style={look.stepperLabel}>{label}</Text>
    <Squish reduced={reduced} onPress={() => onNext?.()} accessibilityLabel="Next" style={[look.step, !onNext && { opacity: 0.35 }]}>
      <Icon name="chevron" size={20} color={colors.edge} />
    </Squish>
  </View>
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY = 86400000

// A month of days. In week mode a tap picks the whole week (Monday to Sunday) at once. In range mode the first tap sets
// the start, the second the end (either order), and Apply shows it; presets fill in common ranges. A dot marks a day
// with an adventure; days to come are faint and cannot be picked.
function DayCalendar({ mode, window, walked, now, onPick, reduced }: {
  mode: 'week' | 'range', window: Window, walked: Set<string>, now: number, onPick: (window: Window) => void, reduced: boolean
}) {
  const today = startOfDay(now)
  const [month, setMonth] = useState(monthStart(Math.min(window.end - 1, now)))
  const [ends, setEnds] = useState<[number, number | null]>([window.start, startOfDay(window.end - 1)])
  const [width, setWidth] = useState(0)
  const cell = width / 7
  const [from, to] = ends
  const low = to === null ? from : Math.min(from, to)
  const high = to === null ? from : Math.max(from, to)
  const inWindow = (day: number) => mode === 'week' ? day >= window.start && day < window.end : day >= low && day <= high
  function tap(day: number) {
    if (mode === 'week') return onPick(windowFor('week', day))
    setEnds(to === null ? [from, day] : [day, null])
  }
  const days = Math.round((high - low) / DAY) + 1
  return <View style={{ gap: 12 }}>
    {mode === 'range' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {rangePresets(now).map(([label, preset]) => <Pressable key={label} accessibilityRole="button" onPress={() => onPick(preset)}
        style={({ pressed }) => [look.preset, pressed && { opacity: 0.7 }]}>
        <Text style={look.presetText}>{label}</Text>
      </Pressable>)}
    </ScrollView>}
    <Stepper label={new Date(month).toLocaleDateString([], { month: 'long', year: 'numeric' })} onBack={() => setMonth(addMonths(month, -1))}
      onNext={addMonths(month, 1) <= now ? () => setMonth(addMonths(month, 1)) : undefined} reduced={reduced} />
    <View style={look.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {WEEKDAYS.map((label, i) => <Text key={i} style={look.weekday}>{label}</Text>)}
    </View>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap: 4 }}>
      {width > 0 && monthGrid(month).map((week, row) => <View key={row} style={look.week}>
        {week.map((day, i) => {
          if (day === null) return <View key={i} style={{ width: cell, height: 44 }} />
          const future = day > today
          const on = inWindow(day)
          const end = mode === 'range' && (day === low || day === high)
          const edgeLeft = on && (mode === 'week' ? i === 0 : day === low || i === 0)
          const edgeRight = on && (mode === 'week' ? i === 6 : day === high || i === 6)
          return <Pressable key={i} disabled={future} onPress={() => tap(day)} accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: future }}
            accessibilityLabel={`${new Date(day).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}${walked.has(dayKey(day)) ? ', has adventures' : ''}`}
            style={{ width: cell, height: 44, justifyContent: 'center', opacity: future ? 0.3 : 1 }}>
            {on && <View style={[look.band, edgeLeft && look.bandLeft, edgeRight && look.bandRight]} />}
            <View style={[look.day, (end || (mode === 'week' && on && (i === 0 || i === 6))) && look.dayEnd]}>
              <Text style={[look.dayText, on && look.dayTextOn, (end || (mode === 'week' && on && (i === 0 || i === 6))) && look.dayTextEnd,
                day === today && !on && { color: colors.edge }]}>{new Date(day).getDate()}</Text>
            </View>
            {walked.has(dayKey(day)) && <View style={look.dot} />}
          </Pressable>
        })}
      </View>)}
    </View>
    {mode === 'range' && <View style={look.apply}>
      <Text style={look.applyText}>{to === null ? 'Tap an end date' : `${days} ${days === 1 ? 'day' : 'days'}`}</Text>
      <View style={{ flex: 1 }}><Button title="Show these dates" disabled={to === null} onPress={() => onPick(rangeWindow(low, high))} /></View>
    </View>}
  </View>
}

const look = themedStyles(() => ({
  track: { flexDirection: 'row', padding: 4, borderRadius: retro() ? 8 : 999, backgroundColor: colors.sunken, minHeight: 48 },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: retro() ? 6 : 999, backgroundColor: colors.edge,
    boxShadow: `0px 4px 12px ${colors.glow}` },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  tabLabel: { flexShrink: 0, fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 19 },
  tabOn: { fontFamily: fonts.heavy, color: colors.onEdge },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: retro() ? 8 : 22,
    backgroundColor: colors.sunken, paddingHorizontal: 12 },
  nameText: { flexShrink: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.panel, paddingHorizontal: 18, paddingTop: 10, gap: 12,
    borderTopLeftRadius: retro() ? 12 : 28, borderTopRightRadius: retro() ? 12 : 28, boxShadow: `0px -10px 30px ${colors.shadow}`,
    ...(retro() ? { borderWidth: 2, borderBottomWidth: 0, borderColor: colors.frameOuter } : null) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 18 : 20, lineHeight: 26 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { flexBasis: '30%', flexGrow: 1, minHeight: 52, borderRadius: retro() ? 8 : 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.sunken },
  optionOn: { backgroundColor: colors.edge },
  optionText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 16, lineHeight: 21 },
  optionTextOn: { fontFamily: fonts.heavy, color: colors.onEdge },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperLabel: { flex: 1, textAlign: 'center', fontFamily: fonts.heavy, color: colors.ink, fontSize: 17, lineHeight: 22 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  band: { position: 'absolute', left: 0, right: 0, top: 4, bottom: 4, backgroundColor: colors.mint },
  bandLeft: { left: 4, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  bandRight: { right: 4, borderTopRightRadius: 18, borderBottomRightRadius: 18 },
  day: { alignSelf: 'center', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayEnd: { backgroundColor: colors.edge },
  dayText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  dayTextOn: { fontFamily: fonts.heavy, color: colors.edge },
  dayTextEnd: { color: colors.onEdge },
  dot: { position: 'absolute', bottom: 2, alignSelf: 'center', width: 5, height: 5, borderRadius: 3, backgroundColor: colors.gold },
  preset: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.sunken },
  presetText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  apply: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  applyText: { fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 19, minWidth: 90 }
}))
