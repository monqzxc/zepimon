import { useRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { Adventure } from './adventures'
import { km, recordForm } from './journal'
import { periods, shortDuration, summary } from './journal-calendar'
import type { Period } from './journal-calendar'
import { pokemonType, typeColors } from './catalog'
import { cardTitle } from './ShareCard'
import { PixelSprite } from './games/TeamPicker'
import { Icon, colors, fonts, themedStyles, typeTints, glass } from './ui'

// The Journal's calendar pieces: a strip of days whose open tab joins the day card below it, the day card itself
// (with your buddy standing on its edge), Week / Month / Year chips and pastel bento tiles, one per adventure.

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
  const ink = typeColors[type] || colors.edge
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
  tile: { borderRadius: 26, padding: 16, justifyContent: 'space-between', gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { width: 30, height: 30, borderRadius: 15, backgroundColor: glass(0.85), alignItems: 'center', justifyContent: 'center' },
  dateTall: { fontFamily: fonts.heavy, fontSize: 28, lineHeight: 34 },
  date: { fontFamily: fonts.heavy, fontSize: 17, lineHeight: 22 },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 }
}))
