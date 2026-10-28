import { useCallback, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useJournal } from '../store'
import { km } from '../journal'
import { dayKey } from '../progress'
import { allAdventures } from '../adventures'
import { adventuresByDay, adventuresIn, calendarMonths, shortDuration, startOfDay, summary } from '../journal-calendar'
import { AdventureRow, MonthCard } from '../JournalCalendar'
import { ChoiceSheet } from '../SettingsList'
import { Button, Copy, Icon, Panel, Screen, Title, colors, fonts, themedStyles, useTheme } from '../ui'

// The Journal's calendar, opened from its header on the day the Journal shows: pick any day of any month to see its
// history, every adventure that finished that day with its time. The header is the screen's own, with Back, Today and
// a plus that starts an adventure.

const monthStart = (day: number) => { const date = new Date(day); return new Date(date.getFullYear(), date.getMonth(), 1).getTime() }
const back = () => router.canGoBack() ? router.back() : router.replace('/')

export default function CalendarScreen() {
  useTheme()
  const { day: param } = useLocalSearchParams<{ day?: string }>()
  const { progress, phoneRuns } = useJournal()
  // Today moves on if the app stays open past midnight.
  const [now, setNow] = useState(Date.now)
  useFocusEffect(useCallback(() => setNow(Date.now()), []))
  const today = startOfDay(now)
  const start = Number(param) > 0 && Number(param) <= now ? startOfDay(Number(param)) : today
  const [selected, setSelected] = useState(start)
  const [month, setMonth] = useState(monthStart(start))
  const [choosing, setChoosing] = useState(false)
  const runs = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const byDay = useMemo(() => adventuresByDay(runs), [runs])
  const months = useMemo(() => calendarMonths(runs, now), [runs, now])
  const onDay = byDay.get(dayKey(selected)) ?? []
  const total = summary(onDay)
  const monthName = (value: number) => value === monthStart(now) ? 'This month' : new Date(value).toLocaleDateString([], { month: 'long', year: 'numeric' })

  // Another month opens on today if it holds today, otherwise on its latest day with adventures, otherwise on the 1st.
  function showMonth(value: number) {
    setMonth(value)
    const next = new Date(value); next.setMonth(next.getMonth() + 1)
    const latest = adventuresIn(runs, [value, next.getTime()])[0]
    setSelected(value === monthStart(today) ? today : latest ? startOfDay(Date.parse(latest.record.finishedAt)) : value)
  }

  return <Screen>
    <View style={page.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={6} onPress={back}
        style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="back" size={22} />
      </Pressable>
      <Text accessibilityRole="header" style={page.title} numberOfLines={1} adjustsFontSizeToFit>Calendar</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Go to today" hitSlop={6} disabled={selected === today}
        onPress={() => { setMonth(monthStart(today)); setSelected(today) }}
        style={({ pressed }) => [page.today, { opacity: selected === today ? 0.45 : pressed ? 0.7 : 1 }]}>
        <Text style={page.todayText}>Today</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Start an adventure" hitSlop={6} onPress={() => router.navigate('/adventure')}
        style={({ pressed }) => [page.round, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="plus" size={24} />
      </Pressable>
    </View>

    <MonthCard month={month} title={monthName(month)} selected={selected} today={today} byDay={byDay}
      onSelect={setSelected} onPickMonth={() => setChoosing(true)} />

    <View style={{ gap: 4 }}>
      <View style={page.dayRow}>
        <Text accessibilityRole="header" style={page.day} numberOfLines={1}>{selected === today ? 'Today'
          : new Date(selected).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric',
            ...(new Date(selected).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })}</Text>
        <Text style={page.count}>{total.count} {total.count === 1 ? 'adventure' : 'adventures'}</Text>
      </View>
      {total.count > 0 && <Copy small>{km(total.meters)}{total.seconds ? ` · ${shortDuration(total.seconds)}` : ''}</Copy>}
    </View>
    {onDay.length ? <View style={{ gap: 12 }}>{onDay.map(run => <AdventureRow key={run.id} adventure={run} />)}</View>
      : <Panel>
        <Title>{selected === today ? 'Nothing yet today' : 'No adventures this day'}</Title>
        <Copy>{selected === today ? 'Walk or run with an egg, on this phone or your watch, and it shows up here.'
          : 'Days with adventures show their Pokemon in the calendar.'}</Copy>
        {selected === today && <Button title="Start an adventure" onPress={() => router.navigate('/adventure')} />}
      </Panel>}

    <ChoiceSheet title="Choose a month" open={choosing} value={String(month)} onClose={() => setChoosing(false)}
      onChoose={value => showMonth(Number(value))}
      options={months.map(value => {
        const next = new Date(value); next.setMonth(next.getMonth() + 1)
        const count = adventuresIn(runs, [value, next.getTime()]).length
        return { value: String(value), label: monthName(value), detail: count ? `${count} ${count === 1 ? 'adventure' : 'adventures'}` : undefined }
      })} />
  </Screen>
}

const page = themedStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line },
  title: { flex: 1, fontFamily: fonts.black, color: colors.ink, fontSize: 34, lineHeight: 40 },
  today: { minHeight: 46, paddingHorizontal: 16, borderRadius: 23, justifyContent: 'center', backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line },
  todayText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19 },
  dayRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  day: { flexShrink: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 24, lineHeight: 31 },
  count: { fontFamily: fonts.bold, color: colors.muted, fontSize: 15, lineHeight: 20 }
}))
