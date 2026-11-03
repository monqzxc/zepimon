import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { Adventure } from './adventures'
import { km, recordForm } from './journal'
import { dayKey } from './progress'
import { monthGrid, shortDuration } from './journal-calendar'
import { pokemonType } from './catalog'
import { cardTitle } from './ShareCard'
import { PixelSprite } from './games/TeamPicker'
import { Icon, colors, fonts, themedStyles, typeTints } from './ui'

// The Calendar screen's pieces: a month card to pick any day from, and a row per adventure for the day's history.

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// A month to pick a day from: its name with a button to choose another month, then the days in round cells from
// Monday. A day with adventures shows its latest Pokemon in the circle with the date over it, and a dot per adventure
// (up to three) below. The chosen day is a dark circle, or a dark ring around a Pokemon; today has an accent ring.
// Days still to come are faint and cannot be picked.
export function MonthCard({ month, title, selected, today, byDay, onSelect, onPickMonth }: {
  month: number, title: string, selected: number, today: number, byDay: Map<string, Adventure[]>,
  onSelect: (day: number) => void, onPickMonth: () => void
}) {
  // Cells share the card's width; the circles fit inside them, up to 42 points.
  const [width, setWidth] = useState(0)
  const size = Math.max(28, Math.min(42, width / 7 - 6))
  return <View style={grid.card}>
    <View style={grid.head}>
      <Text accessibilityRole="header" style={grid.name}>{new Date(month).toLocaleDateString([], { month: 'long', year: 'numeric' })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. Choose another month`} hitSlop={8} onPress={onPickMonth}
        style={({ pressed }) => [grid.pick, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={grid.pickText}>{title}</Text>
        <Icon name="chevronDown" size={18} color={colors.muted} />
      </Pressable>
    </View>
    <View style={grid.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {WEEKDAYS.map((label, i) => <Text key={i} style={grid.weekday}>{label}</Text>)}
    </View>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap: 4 }}>
      {width > 0 && monthGrid(month).map((week, row) => <View key={row} style={grid.week}>
        {week.map((day, i) => day === null ? <View key={i} style={grid.cell} />
          : <DayCell key={i} day={day} size={size} selected={day === selected} today={day === today} future={day > today}
            adventures={byDay.get(dayKey(day)) ?? []} onPress={() => onSelect(day)} />)}
      </View>)}
    </View>
  </View>
}

function DayCell({ day, size, selected, today, future, adventures, onPress }: {
  day: number, size: number, selected: boolean, today: boolean, future: boolean, adventures: Adventure[], onPress: () => void
}) {
  const latest = adventures[0]
  const form = latest ? recordForm(latest.family, latest.record) : null
  const type = latest ? pokemonType(form === 'Egg' ? latest.family[0] : form!) : null
  const date = new Date(day)
  const count = adventures.length
  return <Pressable disabled={future} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected, disabled: future }}
    accessibilityLabel={`${date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${today ? ', today' : ''}${count
      ? `, ${count} ${count === 1 ? 'adventure' : 'adventures'}` : ''}`}
    style={({ pressed }) => [grid.cell, { opacity: future ? 0.4 : pressed ? 0.7 : 1 }]}>
    <View style={[grid.circle, { width: size, height: size, borderRadius: size / 2 },
      latest ? { backgroundColor: typeTints[type!] || colors.sunken } : selected ? { backgroundColor: colors.ink } : null,
      selected && latest ? grid.ring : today && !selected ? grid.today : null]}>
      {latest && <View style={grid.sprite}><PixelSprite name={form!} shiny={latest.record.shiny} size={Math.round(size * 1.15)} /></View>}
      <Text style={[grid.number, latest ? grid.onSprite : selected ? { color: colors.panel } : today ? { color: colors.edge } : null]}>
        {date.getDate()}</Text>
    </View>
    <View style={grid.dots}>
      {Array.from({ length: Math.min(count, 3) }, (_, i) => <View key={i} style={grid.dot} />)}
    </View>
  </Pressable>
}

// One adventure in a day's history: its Pokemon, what it was and where it was recorded, and its time on a dark pill
// (the start time when the record has one, otherwise the finish). Opens its details.
export function AdventureRow({ adventure }: { adventure: Adventure }) {
  const { family, record, device } = adventure
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const title = cardTitle(family, record)
  const finished = Date.parse(record.finishedAt)
  const started = typeof record.startedAt === 'number' && record.startedAt <= finished ? record.startedAt : null
  const time = new Date(started ?? finished).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  // Walk or Run when the record says (watch adventures do not), then distance and time.
  const kind = record.activity === 'running' ? 'Run' : record.activity === 'walking' ? 'Walk' : null
  const detail = [kind, km(record.meters), record.elapsedSeconds ? shortDuration(record.elapsedSeconds) : null].filter(Boolean).join(' · ')
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${detail}, ${started ? 'started' : 'finished'} at ${time}, ${device === 'phone' ? 'on this phone' : 'on your watch'}`}
    accessibilityHint="Opens this adventure" onPress={() => router.push({ pathname: '/adventure-details', params: { id: adventure.id } })}
    style={({ pressed }) => [row.row, { opacity: pressed ? 0.8 : 1 }]}>
    <View style={[row.icon, { backgroundColor: typeTints[type] || colors.sunken }]}>
      <PixelSprite name={form} shiny={record.shiny} size={50} />
    </View>
    <View style={{ flex: 1, gap: 5 }}>
      <Text numberOfLines={1} style={row.title}>{title}</Text>
      <View style={row.meta}>
        <View style={row.device}><Icon name={device === 'phone' ? 'phone' : 'watch'} size={12} color={colors.muted} /></View>
        <Text numberOfLines={1} style={row.detail}>{detail}</Text>
      </View>
    </View>
    <View style={row.pill}><Text style={row.time}>{time}</Text></View>
  </Pressable>
}

const grid = themedStyles(() => ({
  card: { backgroundColor: colors.panel, borderRadius: 28, padding: 16, paddingTop: 18, gap: 10, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 2 },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 22 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  pickText: { fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 19 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  cell: { flex: 1, alignItems: 'center', gap: 3 },
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.bg },
  ring: { borderWidth: 2.5, borderColor: colors.ink },
  today: { borderWidth: 2, borderColor: colors.edge },
  sprite: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18 },
  // Over a Pokemon the date is white with a soft dark edge, as over a photo.
  onSprite: { color: '#FFFFFF', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.edge }
}))

const row = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.panel, borderRadius: 26, padding: 14,
    borderWidth: 1, borderColor: colors.line },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  device: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
    borderWidth: 1, borderColor: colors.line },
  detail: { flexShrink: 1, fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', backgroundColor: colors.ink },
  time: { fontFamily: fonts.heavy, color: colors.panel, fontSize: 15, lineHeight: 20 }
}))
