import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { Adventure } from './adventures'
import { km, recordForm } from './journal'
import { dayKey } from './progress'
import { monthGrid, periods, shortDuration, summary } from './journal-calendar'
import type { Period } from './journal-calendar'
import { pokemonType } from './catalog'
import { cardTitle } from './ShareCard'
import { PixelSprite } from './games/TeamPicker'
import { Icon, colors, fonts, themedStyles, typeInks, typeTints, glass } from './ui'

// The Journal's calendar pieces: a strip of days whose open tab joins the day card below it, the day card itself
// (with your buddy standing on its edge), Week / Month / Year chips and pastel bento tiles, one per adventure. The
// Calendar screen adds a month card to pick any day from, and a row per adventure for the day's history.

const two = (value: number) => String(value).padStart(2, '0')

// onAtStart says whether the strip is scrolled to its start, where the first tab sits on the card's corner.
export function DayStrip({ days, selected, onSelect, onAtStart }: {
  days: { key: string, start: number, has: boolean }[], selected: string, onSelect: (start: number) => void,
  onAtStart: (atStart: boolean) => void
}) {
  const scroll = useRef<ScrollView>(null)
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={strip.row}
    scrollEventThrottle={32} onScroll={event => onAtStart(event.nativeEvent.contentOffset.x < 4)}>
    {days.map((day, i) => {
      const open = day.key === selected
      const date = new Date(day.start)
      return <Pressable key={day.key} accessibilityRole="tab" accessibilityState={{ selected: open }}
        accessibilityLabel={`${i === 0 ? 'Today' : date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}${day.has ? ', has adventures' : ''}`}
        onPress={() => onSelect(day.start)} style={({ pressed }) => [open ? strip.open : strip.day, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[strip.label, open && strip.openLabel]}>{i === 0 ? 'Today' : String(date.getDate())}</Text>
        <View style={[strip.dot, { backgroundColor: day.has ? colors.edge : 'transparent' }]} />
      </Pressable>
    })}
  </ScrollView>
}

// The chosen day: its date and distance like a clock card, how many adventures and how long, and your buddy on top.
// Joined when the open tab sits on its top-left corner, which is then square so the two read as one.
export function DayCard({ day, adventures, buddy, today, joined }: {
  day: number, adventures: Adventure[], buddy: string | null, today: boolean, joined: boolean
}) {
  const date = new Date(day)
  const { meters, seconds, count } = summary(adventures)
  const name = buddy?.replace(/^Shiny /, '') ?? null
  return <View style={[card.card, joined && { borderTopLeftRadius: 0 }]}>
    {name && <Pressable accessibilityRole="button" accessibilityLabel={`Your buddy ${buddy}. Opens its record`}
      onPress={() => router.push({ pathname: '/pokemon', params: { name } })} style={card.buddy}>
      <PixelSprite name={name} shiny={buddy!.startsWith('Shiny ')} size={76} />
    </Pressable>}
    <View style={card.top}>
      <View style={{ flex: 1 }}>
        <Text style={card.month}>{date.toLocaleDateString([], { month: 'long' })}</Text>
        <Text style={card.date}>{two(date.getDate())}.{two(date.getMonth() + 1)}.{String(date.getFullYear()).slice(2)}</Text>
      </View>
      <View style={card.divider} />
      <View style={card.distance}>
        <Text style={card.big}>{(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)}</Text>
        <Text style={card.unit}>KM</Text>
      </View>
    </View>
    <View style={card.bottom}>
      <Text style={card.fact}>Adventures <Text style={card.factValue}>– {count}</Text></Text>
      <Text style={card.fact}>Time <Text style={card.factValue}>– {count ? shortDuration(seconds) : '0 min'}</Text></Text>
    </View>
    <Text style={card.buddyLine}>{!name ? 'Choose a buddy in your Dex to walk with you.'
      : count ? `${name} walked ${km(meters)} with you${today ? ' today' : ''}.` : today ? `${name} is ready for a walk.` : `${name} rested this day.`}</Text>
  </View>
}

export function PeriodChips({ value, onChange }: { value: Period, onChange: (period: Period) => void }) {
  return <View accessibilityRole="radiogroup" style={chips.row}>
    {periods.map(([period, label]) => <Pressable key={period} accessibilityRole="radio" accessibilityState={{ checked: value === period }}
      onPress={() => onChange(period)} style={({ pressed }) => [chips.chip, value === period && chips.on, { opacity: pressed ? 0.7 : 1 }]}>
      <Text style={[chips.label, value === period && chips.onLabel]}>{label}</Text>
    </Pressable>)}
  </View>
}

// One adventure as a pastel tile in its Pokemon's type colour: the Pokemon, where it was recorded, the date and what
// it became. Tall tiles give the date room to be big.
export function BentoTile({ adventure, tall }: { adventure: Adventure, tall: boolean }) {
  const { family, record, device } = adventure
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const ink = typeInks[type] || colors.edge
  const finished = new Date(record.finishedAt)
  const title = cardTitle(family, record)
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${km(record.meters)}, ${finished.toLocaleDateString()}`}
    accessibilityHint="Opens this adventure" onPress={() => router.push({ pathname: '/adventure-details', params: { id: adventure.id } })}
    style={({ pressed }) => [tile.tile, { backgroundColor: typeTints[type] || colors.sunken, minHeight: tall ? 196 : 118, opacity: pressed ? 0.8 : 1 }]}>
    <View style={tile.head}>
      <PixelSprite name={form} shiny={record.shiny} size={tall ? 96 : 68} />
      <View style={tile.badge}><Icon name={device === 'phone' ? 'phone' : 'watch'} size={15} color={ink} /></View>
    </View>
    <View style={{ gap: 2 }}>
      <Text numberOfLines={1} style={[tall ? tile.dateTall : tile.date, { color: ink }]}>
        {finished.toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
      <Text numberOfLines={2} style={tile.title}>{title} · {km(record.meters)}</Text>
    </View>
  </Pressable>
}

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

const strip = themedStyles(() => ({
  row: { alignItems: 'flex-end', gap: 6, paddingRight: 8 },
  day: { minWidth: 46, height: 44, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: glass(0.55), marginBottom: 6 },
  // The open day is a tab: the card color, square at the bottom where it meets it.
  open: { minWidth: 72, height: 56, paddingHorizontal: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.panel },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, lineHeight: 21 },
  openLabel: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 17 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 }
}))

const card = themedStyles(() => ({
  card: { backgroundColor: colors.panel, borderRadius: 28, padding: 20, paddingTop: 22, gap: 14,
    boxShadow: '0px 10px 24px rgba(31, 61, 89, 0.08)' },
  // Your buddy stands on the card's top edge, like Gengar on the tab bar.
  buddy: { position: 'absolute', right: 14, top: -58, zIndex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  month: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 30, lineHeight: 36 },
  date: { fontFamily: fonts.body, color: colors.ink, fontSize: 24, lineHeight: 30 },
  divider: { width: 1.5, alignSelf: 'stretch', backgroundColor: colors.line },
  distance: { flexDirection: 'row', alignItems: 'flex-start' },
  big: { fontFamily: fonts.black, color: colors.ink, fontSize: 52, lineHeight: 60 },
  unit: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 8, marginLeft: 2 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  fact: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 19 },
  factValue: { fontFamily: fonts.body, color: colors.muted },
  buddyLine: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 }
}))

const chips = themedStyles(() => ({
  row: { flexDirection: 'row', gap: 10 },
  chip: { minHeight: 40, paddingHorizontal: 20, borderRadius: 999, justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line },
  on: { backgroundColor: colors.panel, borderColor: colors.panel, boxShadow: '0px 4px 12px rgba(31, 61, 89, 0.08)' },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 20 },
  onLabel: { fontFamily: fonts.heavy, color: colors.ink }
}))

const tile = themedStyles(() => ({
  // Each tile sits a little above the page on a soft shadow.
  tile: { borderRadius: 26, padding: 16, justifyContent: 'space-between', gap: 10, boxShadow: `0px 6px 16px ${colors.shadow}` },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { width: 30, height: 30, borderRadius: 15, backgroundColor: glass(0.85), alignItems: 'center', justifyContent: 'center' },
  dateTall: { fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  date: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 22 },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 }
}))
