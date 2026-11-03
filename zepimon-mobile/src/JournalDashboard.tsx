import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Animated, Easing, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { router } from 'expo-router'
import type { Adventure } from './adventures'
import { km, recordForm } from './journal'
import { periods, shortDuration } from './journal-calendar'
import type { Period } from './journal-calendar'
import type { Slice } from './journal-stats'
import { clock, paceText, races } from './running'
import type { Achievement, RaceId, RaceRecord } from './running'
import { pokemonType } from './catalog'
import { cardTitle } from './ShareCard'
import { PixelSprite } from './games/TeamPicker'
import { Sprite } from './Sprite'
import { GradientFill, Icon, PokeballIcon, RetroFrame, colors, displayFont, fonts, glass, retro, themedStyles, typeInks, typeTints } from './ui'
import type { IconName } from './ui'

// The Journal's pieces (src/app/(tabs)/index.tsx): a greeting with your buddy over the distance you've travelled, the
// progress card (a ring of the period's days, the distance and what it adds up to), the weekly streak, recent adventures
// as tiles in their Pokemon's colours, the stats chart, which you scrub to read any day, with the period's pacing under
// it, the running records and the latest achievements (src/running.ts). Motion explains what
// changed: the ring fills day by day, figures count to their new values, the chart rises when the period changes and its
// marker glides to the day you touch. With reduced motion everything lands at once.

const native = Platform.OS !== 'web'
const ease = Easing.bezier(0.16, 1, 0.3, 1)

// A card: soft and raised in the modern themes, Emerald's text box in the retro one.
export function Card({ children, style }: { children: ReactNode, style?: StyleProp<ViewStyle> }) {
  if (retro()) return <RetroFrame style={[{ padding: 16, gap: 14 }, style]}>{children}</RetroFrame>
  return <View style={[look.card, style]}>{children}</View>
}

// A press that gives way under the thumb and springs back. Reduced motion keeps a plain dim.
export function Squish({ children, style, onPress, reduced, ...a11y }: {
  children: ReactNode, style?: StyleProp<ViewStyle>, onPress: () => void, reduced: boolean,
  accessibilityLabel?: string, accessibilityHint?: string, accessibilityRole?: 'button' | 'radio', accessibilityState?: { checked?: boolean }
}) {
  const [scale] = useState(() => new Animated.Value(1))
  const [dim, setDim] = useState(false)
  const to = (value: number, bounciness: number) => reduced ? setDim(value < 1)
    : Animated.spring(scale, { toValue: value, speed: 40, bounciness, useNativeDriver: native }).start()
  return <Pressable accessibilityRole="button" {...a11y} onPress={onPress} onPressIn={() => to(0.97, 0)} onPressOut={() => to(1, 8)}>
    <Animated.View style={[style, { transform: [{ scale }], opacity: dim ? 0.75 : 1 }]}>{children}</Animated.View>
  </Pressable>
}

// A figure that counts from its last value to the new one.
function useCounting(value: number, reduced: boolean) {
  const [shown, setShown] = useState(value)
  const [tween] = useState(() => new Animated.Value(value))
  useEffect(() => {
    if (reduced) { tween.setValue(value); return }
    const id = tween.addListener(({ value: next }) => setShown(next))
    const run = Animated.timing(tween, { toValue: value, duration: 650, easing: ease, useNativeDriver: false })
    run.start()
    return () => { run.stop(); tween.removeListener(id) }
  }, [value, reduced, tween])
  return reduced ? value : shown
}
function Counting({ value, format, style, reduced }: { value: number, format: (value: number) => string, style: StyleProp<any>, reduced: boolean }) {
  return <Text style={style}>{format(useCounting(value, reduced))}</Text>
}

// Distance as a figure and its unit: two decimals under 10 km, one under 100, none beyond.
export const distance = (meters: number) => (meters / 1000).toFixed(meters < 10000 ? 2 : meters < 100000 ? 1 : 0)
// A duration short enough for a third of the strip: 45m, 1h 35m, 32h.
const compactDuration = (seconds: number) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  return minutes < 60 ? `${minutes}m` : minutes < 600 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.round(minutes / 60)}h`
}

// The top of the Journal: the greeting, with your Pokemon and weekly streak as two pills, your buddy front and centre,
// and a card in the brand colours with the distance you've travelled all told, this week's share of it, and the calendar
// and a new adventure a thumb away. The card rises over the buddy's feet, as if it stood just behind.
export function Greeting({ name, greeting, buddy, pokemon, weeks, meters, week, onCalendar, reduced }: {
  name: string, greeting: string, buddy: string | null, pokemon: number, weeks: number, meters: number,
  week: { meters: number, count: number }, onCalendar: () => void, reduced: boolean
}) {
  const [whole, cents] = (useCounting(meters, reduced) / 1000).toFixed(2).split('.')
  return <View>
    <View pointerEvents="none" accessible={false} style={hello.mark}><PokeballIcon size={280} color={colors.edge} stroke={24} /></View>
    <View style={hello.top}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={hello.title}>{greeting}</Text>
        <Text numberOfLines={1} style={hello.name}>{name}</Text>
      </View>
      <Squish reduced={reduced} onPress={() => router.push('/dex')} accessibilityLabel={`${pokemon} Pokemon caught`} accessibilityHint="Opens the Dex"
        style={hello.pill}>
        <View style={[hello.coin, { backgroundColor: colors.goldTint }]}><PokeballIcon size={17} color={colors.gold} /></View>
        <Text style={hello.pillText}>{pokemon}</Text>
      </Squish>
      <Squish reduced={reduced} onPress={onCalendar} accessibilityLabel={`${weeks}-week streak`} accessibilityHint="Opens the calendar" style={hello.pill}>
        <View style={[hello.coin, { backgroundColor: colors.dangerTint }]}><Icon name="flame" size={17} color={colors.danger} /></View>
        <Text style={hello.pillText}>{weeks}</Text>
      </Squish>
    </View>
    <Buddy buddy={buddy} reduced={reduced} />
    <View style={[hello.card, retro() && hello.retroCard]}>
      <GradientFill radius={retro() ? 8 : 30} />
      <View pointerEvents="none" style={hello.cardMark}><PokeballIcon size={150} color={colors.onBrand} stroke={12} /></View>
      <Text style={hello.eyebrow}>Distance travelled</Text>
      <Text accessible accessibilityLabel={`${km(meters)} travelled in all`} numberOfLines={1} adjustsFontSizeToFit style={hello.big}>
        {Number(whole).toLocaleString()}<Text style={hello.cents}>.{cents} km</Text>
      </Text>
      <Text style={hello.week}>{week.count
        ? `+${distance(week.meters)} km this week · ${week.count} ${week.count === 1 ? 'adventure' : 'adventures'}` : 'No adventures yet this week'}</Text>
      <View style={hello.actions}>
        <View style={{ flex: 1 }}>
          <Squish reduced={reduced} onPress={onCalendar} accessibilityLabel="Open the calendar" style={[hello.action, hello.soft]}>
            <Icon name="calendar" size={20} color={colors.onBrand} />
            <Text {...oneLine} style={[hello.actionText, { color: colors.onBrand }]}>Calendar</Text>
          </Squish>
        </View>
        <View style={{ flex: 1 }}>
          <Squish reduced={reduced} onPress={() => router.push('/adventure')} accessibilityLabel="Start an adventure" style={[hello.action, hello.solid]}>
            <Icon name="run" size={20} color={colors.brandFrom} />
            <Text {...oneLine} style={[hello.actionText, { color: colors.brandFrom }]}>Adventure</Text>
          </Squish>
        </View>
      </View>
    </View>
  </View>
}

// Your buddy facing front, as in its record, breathing gently (still with reduced motion). Tap it to say hello; hold it
// to open its record. Without a buddy an Egg waits in its place.
function Buddy({ buddy, reduced }: { buddy: string | null, reduced: boolean }) {
  const [bob] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) { bob.setValue(0); return }
    const breathe = (toValue: number) => Animated.timing(bob, { toValue, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native })
    const loop = Animated.loop(Animated.sequence([breathe(1), breathe(0)]))
    loop.start()
    return () => loop.stop()
  }, [bob, reduced])
  const species = buddy?.replace(/^Shiny /, '') ?? null
  return <View style={hello.buddy}>
    <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }}>
      {species ? <Sprite name={species} shiny={buddy!.startsWith('Shiny ')} size={BUDDY}
        onLongPress={() => router.push({ pathname: '/pokemon', params: { name: species } })} />
        : <View accessible accessibilityLabel="No buddy yet"><PixelSprite name="Egg" size={BUDDY} /></View>}
    </Animated.View>
  </View>
}
// Four times the 44 px overworld frame, so its pixels stay even.
const BUDDY = 176

// The period's days (a year's months) around a ring: filled where you walked, faint where the day is still to come.
function DayRing({ slices, size, reduced }: { slices: Slice[], size: number, reduced: boolean }) {
  const [fill] = useState(() => new Animated.Value(reduced ? 1 : 0))
  const key = slices.map(slice => slice.count ? 1 : 0).join('') + slices[0]?.start
  useEffect(() => {
    if (reduced) { fill.setValue(1); return }
    fill.setValue(0)
    const run = Animated.timing(fill, { toValue: 1, duration: 720, easing: ease, useNativeDriver: native })
    run.start()
    return () => run.stop()
  }, [key, reduced, fill])
  const stroke = size * 0.1
  const r = (size - stroke) / 2
  const n = Math.max(1, slices.length)
  const gap = n > 12 ? 2.4 : 5
  const walked = slices.filter(slice => slice.count).length
  const unit = slices.length === 12 ? 'months' : 'days'
  return <View accessible accessibilityLabel={`${walked} of ${n} ${unit} with an adventure`} style={{ width: size, height: size }}>
    <Svg width={size} height={size}>
      {slices.map((slice, i) => {
        const d = arc(size / 2, r, i * 360 / n + gap / 2, (i + 1) * 360 / n - gap / 2)
        return <Path key={i} d={d} stroke={colors.track} strokeWidth={stroke} fill="none" strokeOpacity={slice.future ? 0.45 : 1} />
      })}
    </Svg>
    {/* Each walked day is its own layer, so its fade runs on the native driver. */}
    {slices.map((slice, i) => slice.count ? <Animated.View key={`on${i}`} pointerEvents="none" style={[ring.layer,
      { opacity: fill.interpolate({ inputRange: [i / n, (i + 1) / n], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
      <Svg width={size} height={size}>
        <Path d={arc(size / 2, r, i * 360 / n + gap / 2, (i + 1) * 360 / n - gap / 2)} stroke={colors.edge} strokeWidth={stroke} fill="none" />
      </Svg>
    </Animated.View> : null)}
    <View style={ring.middle}>
      <Text style={ring.count}>{walked}<Text style={ring.of}>/{n}</Text></Text>
      <Text style={ring.unit}>{unit}</Text>
    </View>
  </View>
}
function arc(c: number, r: number, from: number, to: number) {
  const point = (deg: number) => { const rad = (deg - 90) * Math.PI / 180; return `${(c + r * Math.cos(rad)).toFixed(2)} ${(c + r * Math.sin(rad)).toFixed(2)}` }
  return `M ${point(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`
}

// A change against the stretch before, named: green when you walked further, grey otherwise, a dash with nothing to compare.
function Change({ value, against }: { value: number | 'new' | null, against: string }) {
  if (value === null) return <Text style={sum.change}>— {against}</Text>
  const up = value === 'new' || value > 0
  const color = up ? colors.success : colors.muted
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    {value !== 0 && <Icon name={up ? 'trendUp' : 'trendDown'} size={16} color={color} />}
    <Text style={[sum.change, { color }]}>{value === 'new' ? 'New' : `${value > 0 ? '+' : ''}${value}%`}<Text style={sum.against}> {against}</Text></Text>
  </View>
}

export type Totals = { meters: number, seconds: number, count: number, kcal: number, steps: number | null, hatched: number }

// The progress card: the ring of days, the distance with its change, then energy, time and steps (or hatches) in a strip.
export function ProgressCard({ slices, totals, change, against, period, onPeriod, reduced }: {
  slices: Slice[], totals: Totals, change: number | 'new' | null, against: string, period: Period, onPeriod: (period: Period) => void, reduced: boolean
}) {
  const facts: [IconName, string, string, string][] = [
    ['flame', totals.kcal.toLocaleString(), 'kcal est.', `About ${totals.kcal} kilocalories, estimated from distance`],
    ['clock', compactDuration(totals.seconds), 'time', totals.count ? shortDuration(totals.seconds) : '0 minutes'],
    totals.steps !== null ? ['steps', totals.steps.toLocaleString(), 'steps', ''] : ['egg', String(totals.hatched), 'hatched', `${totals.hatched} ${totals.hatched === 1 ? 'egg' : 'eggs'} hatched`]
  ]
  return <Card style={{ gap: 16 }}>
    <View style={sum.band}>
      <Icon name="chart" size={22} color={colors.edge} />
      <Text style={sum.bandTitle}>Your progress</Text>
      <PeriodMenu value={period} onChange={onPeriod} reduced={reduced} />
    </View>
    <View style={sum.main}>
      <DayRing slices={slices} size={96} reduced={reduced} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Counting value={totals.meters} format={distance} style={sum.big} reduced={reduced} />
          <Text style={sum.km}>km</Text>
        </View>
        <Text style={sum.label}>Total distance · {totals.count} {totals.count === 1 ? 'adventure' : 'adventures'}</Text>
        <Change value={change} against={against} />
      </View>
    </View>
    <View style={sum.strip}>
      {facts.map(([icon, value, label, a11y], i) => <View key={label} accessible accessibilityLabel={a11y || `${value} ${label}`}
        style={[sum.fact, i > 0 && sum.divided]}>
        <View style={sum.factHead}><Icon name={icon} size={16} color={icon === 'flame' ? colors.gold : colors.edge} /><Text style={sum.factLabel}>{label}</Text></View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={sum.factValue}>{value}</Text>
      </View>)}
    </View>
  </Card>
}

const periodNames: Record<Period, string> = { week: 'This week', month: 'This month', year: 'This year' }
// Android's default (high quality) line breaking can measure a bold Nunito label a few pixels narrower than it draws,
// so "This week" wrapped its last word onto a second line that the one-line box then hid, leaving "This". One line and
// the simple strategy keep measuring and drawing in step.
const oneLine = { numberOfLines: 1, textBreakStrategy: 'simple' } as const

// "This week ▾": opens a small menu under itself to choose the week, month or year.
function PeriodMenu({ value, onChange, reduced }: { value: Period, onChange: (period: Period) => void, reduced: boolean }) {
  const anchor = useRef<View>(null)
  const [at, setAt] = useState<{ top: number, right: number } | null>(null)
  const [show] = useState(() => new Animated.Value(0))
  const { width } = useWindowDimensions()
  function open() {
    anchor.current?.measureInWindow((x, y, w, h) => {
      setAt({ top: y + h + 6, right: Math.max(8, width - x - w) })
      show.setValue(reduced ? 1 : 0)
      if (!reduced) Animated.timing(show, { toValue: 1, duration: 200, easing: ease, useNativeDriver: native }).start()
    })
  }
  const close = () => setAt(null)
  return <>
    {/* Android drops plain wrapper views it can flatten, which would leave nothing to measure. */}
    <View ref={anchor} collapsable={native ? false : undefined}>
      <Squish reduced={reduced} onPress={open} accessibilityLabel={`${periodNames[value]}. Choose week, month or year`} style={sum.pill}>
        <Text {...oneLine} style={sum.pillText}>{periodNames[value]}</Text>
        <Icon name="chevronDown" size={18} color={colors.edge} />
      </Squish>
    </View>
    <Modal visible={!!at} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={close} />
      {at && <Animated.View accessibilityRole="radiogroup" style={[menu.box, { top: at.top, right: at.right, opacity: show,
        transform: [{ translateY: show.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
          { scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}>
        {periods.map(([period]) => <Pressable key={period} accessibilityRole="radio" accessibilityState={{ checked: period === value }}
          onPress={() => { onChange(period); close() }} style={({ pressed }) => [menu.row, period === value && menu.on, pressed && { opacity: 0.7 }]}>
          <Text {...oneLine} style={[menu.text, period === value && menu.onText]}>{periodNames[period]}</Text>
          {period === value && <Icon name="check" size={18} color={colors.edge} />}
        </Pressable>)}
      </Animated.View>}
    </Modal>
  </>
}

// The weekly streak, opening the calendar, on the theme's brand gradient so it stands apart from the cards around it.
// A week still running keeps the streak alive until it ends empty.
export function StreakBanner({ weeks, since, thisWeek, onPress, reduced }: { weeks: number, since: number | null, thisWeek: boolean, onPress: () => void, reduced: boolean }) {
  const title = weeks ? `You're on a ${weeks}-week streak` : 'Start a weekly streak'
  const line = !weeks ? 'One adventure a week keeps it going.'
    : !thisWeek ? 'Walk this week to keep it going.'
    : weeks === 1 ? 'Walk next week to make it two.'
    : `An adventure every week since ${new Date(since!).toLocaleDateString([], { day: 'numeric', month: 'short' })}.`
  return <Squish reduced={reduced} onPress={onPress} accessibilityLabel={`${title}. ${line}`} accessibilityHint="Opens the calendar"
    style={[retro() ? look.retroBanner : look.banner]}>
    <GradientFill radius={retro() ? 8 : 999} />
    <View pointerEvents="none" style={look.bannerMark}><PokeballIcon size={110} color={colors.onBrand} stroke={10} /></View>
    <View style={look.ball}>
      {weeks ? <Text style={look.weeks}>{weeks}</Text> : <PokeballIcon size={26} color={colors.brandFrom} stroke={3} />}
    </View>
    <View style={{ flex: 1, gap: 1 }}>
      <Text style={look.bannerTitle}>{title}</Text>
      <Text style={look.bannerLine}>{line}</Text>
    </View>
    <Icon name="chevron" size={24} color={colors.onBrand} />
  </Squish>
}

export function SectionHead({ title, action, onAction }: { title: string, action?: string, onAction?: () => void }) {
  return <View style={look.head}>
    <PokeballIcon size={22} color={colors.edge} />
    <Text accessibilityRole="header" style={look.headTitle}>{title}</Text>
    {action && <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={({ pressed }) => [look.headAction, pressed && { opacity: 0.6 }]}>
      <Text style={look.link}>{action}</Text>
      <Icon name="chevron" size={18} color={colors.edge} />
    </Pressable>}
  </View>
}

// One recent adventure, in its Pokemon's type colour: the Pokemon, the date, what it was and how far. Tiles rise in
// one after another the first time they appear.
export function ActivityTile({ adventure, index, wide, reduced }: { adventure: Adventure, index: number, wide: boolean, reduced: boolean }) {
  const { family, record, device } = adventure
  const form = recordForm(family, record)
  const type = pokemonType(form === 'Egg' ? family[0] : form)
  const ink = typeInks[type] || colors.edge
  const title = cardTitle(family, record)
  const finished = new Date(record.finishedAt)
  const [rise] = useState(() => new Animated.Value(reduced ? 1 : 0))
  useEffect(() => {
    if (reduced) return
    Animated.timing(rise, { toValue: 1, duration: 420, delay: 60 + index * 70, easing: ease, useNativeDriver: native }).start()
  }, [rise, index, reduced])
  return <Animated.View style={{ flexBasis: wide ? '100%' : '47%', flexGrow: 1, opacity: rise,
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
    <Squish reduced={reduced} accessibilityLabel={`${title}, ${km(record.meters)}, ${finished.toLocaleDateString([], { day: 'numeric', month: 'long' })}`}
      accessibilityHint="Opens this adventure" onPress={() => router.push({ pathname: '/adventure-details', params: { id: adventure.id } })}
      style={[tile.tile, { backgroundColor: typeTints[type] || colors.sunken }]}>
      <View pointerEvents="none" style={tile.mark}><PokeballIcon size={92} color={ink} stroke={9} /></View>
      <View style={tile.badge}><Icon name={device === 'phone' ? 'phone' : 'watch'} size={15} color={ink} /></View>
      <View style={tile.sprite}><PixelSprite name={form} shiny={record.shiny} size={76} /></View>
      <View style={{ gap: 1 }}>
        <Text numberOfLines={1} style={[tile.date, { color: ink }]}>{finished.toLocaleDateString([], { day: 'numeric', month: 'short' })}
          <Text style={tile.distance}> · {km(record.meters)}</Text></Text>
        <Text numberOfLines={1} style={tile.title}>{title}</Text>
      </View>
    </Squish>
  </Animated.View>
}

// The window's distance by day, week or month as a soft line. Touch or drag to read a slice: the marker glides there and
// the line under the chart names it. Screen readers step through the slices with swipe up and down. The chart rises
// into place whenever windowKey changes.
export function DistanceChart({ slices, selected, onSelect, windowKey, reduced }: {
  slices: Slice[], selected: number, onSelect: (index: number) => void, windowKey: string, reduced: boolean
}) {
  const [width, setWidth] = useState(0)
  const height = 156
  const top = 40
  const base = height - 10
  const pad = 14
  const n = slices.length
  const last = Math.max(0, slices.filter(slice => !slice.future).length - 1)
  const peak = Math.max(1000, ...slices.map(slice => slice.meters)) * 1.08
  const x = (i: number) => pad + (n > 1 ? i * (width - pad * 2) / (n - 1) : (width - pad * 2) / 2)
  const y = (meters: number) => base - meters / peak * (base - top)
  const points = slices.slice(0, last + 1).map((slice, i) => [x(i), y(slice.meters)] as [number, number])
  const line = smooth(points)
  const area = points.length > 1 ? `${line} L ${points[points.length - 1][0]} ${base} L ${points[0][0]} ${base} Z` : ''

  // The chart rises into place when the window changes; the marker glides between slices.
  const [rise] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (reduced) return
    rise.setValue(0)
    Animated.timing(rise, { toValue: 1, duration: 520, easing: ease, useNativeDriver: native }).start()
  }, [windowKey, rise, reduced])
  const at = slices[selected] ? x(selected) : 0
  const [glide] = useState(() => new Animated.Value(at))
  useEffect(() => {
    if (reduced || !width) glide.setValue(at)
    else Animated.spring(glide, { toValue: at, speed: 22, bounciness: 3, useNativeDriver: native }).start()
  }, [at, reduced, width, glide])

  const pick = (px: number) => {
    if (!width || n < 2) return
    const index = Math.round((px - pad) / ((width - pad * 2) / (n - 1)))
    const next = Math.max(0, Math.min(last, index))
    if (next !== selected) onSelect(next)
  }
  // Every label up to twelve slices, a month's days weekly (1, 8, 15, 22, 29), otherwise about five spread across.
  const every = n <= 12 ? 1 : n >= 28 && n <= 31 ? 7 : Math.ceil(n / 5)
  const labels = slices.map((slice, i) => i % every === 0 ? slice.short : '')
  const chosen = slices[selected]
  const tip = 96
  // The bubble stays inside the chart at its ends; its guide and dot still mark the slice itself.
  const nudge = Math.min(Math.max(at - tip / 2, 0), Math.max(0, width - tip)) - (at - tip / 2)
  return <View>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height }}
      accessible accessibilityRole="adjustable" accessibilityLabel="Distance chart"
      accessibilityValue={{ text: chosen ? `${chosen.label}, ${km(chosen.meters)}` : '' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => onSelect(Math.max(0, Math.min(last, selected + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => true}
      onResponderGrant={event => pick(event.nativeEvent.locationX)} onResponderMove={event => pick(event.nativeEvent.locationX)}>
      {width > 0 && <>
        <Animated.View pointerEvents="none" style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
          <Svg width={width} height={height}>
            <Line x1={pad} x2={width - pad} y1={base} y2={base} stroke={colors.line} strokeWidth={1} />
            {!!area && <Path d={area} fill={colors.edge} fillOpacity={0.14} />}
            {points.length > 1 && <Path d={line} stroke={colors.edge} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            {n <= 12 && points.map(([px, py], i) => <Circle key={i} cx={px} cy={py} r={4.5} fill={colors.panel} stroke={colors.edge} strokeWidth={2.5} />)}
          </Svg>
        </Animated.View>
        {chosen && <Animated.View pointerEvents="none" style={[chart.marker, { height, transform: [{ translateX: Animated.add(glide, -tip / 2) }] }]}>
          <View style={[chart.tip, { width: tip, marginLeft: nudge }]}><Text numberOfLines={1} style={chart.tipText}>{distance(chosen.meters)} km</Text></View>
          <View style={[chart.guide, { left: tip / 2 - 0.75, top: 30, height: Math.max(0, y(chosen.meters) - 30) }]} />
          <View style={[chart.dot, { left: tip / 2 - 8, top: y(chosen.meters) - 8 }]} />
        </Animated.View>}
      </>}
    </View>
    <View style={{ height: 20 }} pointerEvents="none" accessible={false}>
      {width > 0 && labels.map((label, i) => label ? <Text key={i} style={[chart.label, { left: x(i) - 28 }, i === selected && chart.labelOn]}>{label}</Text> : null)}
    </View>
  </View>
}

// The period's pacing under the chart: average pace and moving time, then the fastest pace held for a kilometre.
export function PaceStrip({ pace, moving, fastest }: { pace: number | null, moving: number, fastest: number | null }) {
  const facts: [IconName, string, string, string][] = [
    ['run', paceText(pace), 'avg /km', pace === null ? 'No average pace yet' : `Average pace ${paceText(pace)} per kilometre, over moving time`],
    ['clock', compactDuration(moving), 'moving', `${moving ? shortDuration(moving) : '0 minutes'} moving, without stops`],
    ['flame', paceText(fastest), 'fastest /km', fastest === null ? 'No fastest pace yet' : `Fastest pace ${paceText(fastest)} per kilometre`]
  ]
  return <View style={sum.strip}>
    {facts.map(([icon, value, label, a11y], i) => <View key={label} accessible accessibilityLabel={a11y} style={[sum.fact, i > 0 && sum.divided]}>
      <View style={sum.factHead}><Icon name={icon} size={16} color={icon === 'flame' ? colors.gold : colors.edge} /><Text style={sum.factLabel}>{label}</Text></View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={sum.factValue}>{value}</Text>
    </View>)}
  </View>
}

const shortDate = (time: number) => new Date(time).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const openAdventure = (adventure: Adventure) => router.push({ pathname: '/adventure-details', params: { id: adventure.id } })
const raceGoal: Record<RaceId, string> = { '5k': '5 km', '10k': '10 km', '15k': '15 km', half: '21.1 km', marathon: '42.2 km' }

// Fastest 5 km, 10 km, 15 km, half marathon and marathon: the time, its pace and when, each opening its adventure.
// Distances not covered yet say what it takes.
export function RaceRecords({ records }: { records: Record<RaceId, RaceRecord | null> }) {
  return <Card style={{ gap: 4, paddingVertical: 10 }}>
    {races.map((race, i) => {
      const record = records[race.id]
      const pace = record ? paceText(record.seconds / race.meters * 1000) : ''
      const date = record ? shortDate(Date.parse(record.adventure.record.finishedAt)) : ''
      const body = <>
        <View style={[best.medal, { backgroundColor: record ? colors.goldTint : colors.sunken }]}>
          <Icon name="trophy" size={20} color={record ? colors.gold : colors.muted} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={best.name}>{race.name}</Text>
          <Text numberOfLines={1} style={best.detail}>{record ? `${pace} /km · ${date}` : `Cover ${raceGoal[race.id]} in one adventure`}</Text>
        </View>
        <Text style={[best.time, !record && { color: colors.muted }]}>{record ? clock(record.seconds) : '—'}</Text>
        {record && <Icon name="chevron" size={18} color={colors.muted} />}
      </>
      return record
        ? <Pressable key={race.id} accessibilityRole="button" onPress={() => openAdventure(record.adventure)} accessibilityHint="Opens this adventure"
          accessibilityLabel={`Fastest ${race.name}: ${clock(record.seconds)}, ${pace} per kilometre, ${date}`}
          style={({ pressed }) => [best.row, i > 0 && best.divided, pressed && { opacity: 0.7 }]}>{body}</Pressable>
        : <View key={race.id} accessible accessibilityLabel={`Fastest ${race.name}: no record yet`} style={[best.row, i > 0 && best.divided]}>{body}</View>
    })}
  </Card>
}

// How many achievements are earned, as a bar, and the latest few, each opening the adventure that earned it.
export function AchievementsPreview({ items, onAll }: { items: Achievement[], onAll: () => void }) {
  const earned = items.filter(item => item.earned).sort((a, b) => b.earned!.at - a.earned!.at)
  return <Card style={{ gap: 12 }}>
    <View accessible accessibilityLabel={`${earned.length} of ${items.length} achievements earned`} style={{ gap: 8 }}>
      <Text style={best.count}>{earned.length}<Text style={best.of}> / {items.length} earned</Text></Text>
      <View style={best.track}><View style={[best.fill, { width: `${Math.round(earned.length / Math.max(1, items.length) * 100)}%` }]} /></View>
    </View>
    {earned.length ? earned.slice(0, 3).map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => openAdventure(item.earned!.adventure)}
      accessibilityLabel={`${item.title}, earned ${shortDate(item.earned!.at)}`} accessibilityHint="Opens the adventure that earned it"
      style={({ pressed }) => [best.row, pressed && { opacity: 0.7 }]}>
      <View style={[best.medal, { backgroundColor: colors.goldTint }]}><Icon name={item.icon} size={20} color={colors.gold} /></View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={best.name}>{item.title}</Text>
        <Text numberOfLines={1} style={best.detail}>{shortDate(item.earned!.at)}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>)
      : <Text style={best.detail}>Feats of pace and milestones of distance appear here as you earn them.</Text>}
    <Pressable accessibilityRole="button" onPress={onAll} style={({ pressed }) => [best.all, pressed && { opacity: 0.7 }]}>
      <Text style={look.link}>See every achievement</Text>
      <Icon name="chevron" size={18} color={colors.edge} />
    </Pressable>
  </Card>
}

// A monotone curve through the points (Fritsch–Carlson), so the line never dips below a day with no distance.
function smooth(points: [number, number][]): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`
  const slopes = points.slice(1).map(([x1, y1], i) => (y1 - points[i][1]) / (x1 - points[i][0]))
  const tangents = points.map((_, i) => i === 0 ? slopes[0] : i === points.length - 1 ? slopes[i - 1]
    : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2)
  slopes.forEach((slope, i) => {
    if (slope === 0) { tangents[i] = 0; tangents[i + 1] = 0; return }
    const a = tangents[i] / slope, b = tangents[i + 1] / slope, h = a * a + b * b
    if (h > 9) { const t = 3 / Math.sqrt(h); tangents[i] = t * a * slope; tangents[i + 1] = t * b * slope }
  })
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], dx = (x1 - x0) / 3
    d += ` C ${(x0 + dx).toFixed(1)} ${(y0 + tangents[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)} ${(y1 - tangents[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  return d
}

const look = themedStyles(() => ({
  card: { backgroundColor: colors.panel, borderRadius: 26, padding: 16, gap: 14, boxShadow: `0px 10px 28px ${colors.shadow}` },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingVertical: 14, paddingLeft: 14, paddingRight: 12,
    borderRadius: 999, overflow: 'hidden', boxShadow: `0px 8px 20px ${colors.glow}` },
  retroBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingVertical: 12, paddingLeft: 12, paddingRight: 10,
    borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter ?? colors.edge, overflow: 'hidden',
    boxShadow: `0px 3px 0px ${colors.frameOuter ?? colors.edge}` },
  bannerMark: { position: 'absolute', right: 34, top: -22, opacity: 0.14 },
  // The streak's count in a light coin, the one solid shape on the gradient.
  ball: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.onBrand, alignItems: 'center', justifyContent: 'center' },
  weeks: { fontFamily: fonts.black, color: colors.brandFrom, fontSize: 22, lineHeight: 26, fontVariant: ['tabular-nums'] },
  bannerTitle: { fontFamily: displayFont(fonts.heavy), color: colors.onBrand, fontSize: retro() ? 16 : 17, lineHeight: 22 },
  bannerLine: { fontFamily: fonts.body, color: colors.onBrand, opacity: 0.88, fontSize: 13, lineHeight: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  headTitle: { flex: 1, fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 19 : 21, lineHeight: 27 },
  headAction: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  link: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 15, lineHeight: 20 }
}))

const hello = themedStyles(() => ({
  mark: { position: 'absolute', right: -96, top: -120, opacity: 0.07 },
  // Above the buddy, whose sprite margin reaches up under the pills.
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 1 },
  title: { fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: retro() ? 24 : 26, lineHeight: 32, letterSpacing: retro() ? 0 : -0.4 },
  name: { fontFamily: fonts.bold, color: colors.muted, fontSize: 16, lineHeight: 22 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingLeft: 5, paddingRight: 13, borderRadius: retro() ? 8 : 999,
    backgroundColor: colors.panel, ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter } : { boxShadow: `0px 4px 14px ${colors.shadow}` }) },
  coin: { width: 30, height: 30, borderRadius: retro() ? 6 : 15, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: fonts.black, color: colors.ink, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  // The card's top edge covers the buddy's feet.
  buddy: { alignItems: 'center', height: BUDDY, marginTop: 2, marginBottom: -30 },
  card: { alignItems: 'center', gap: 4, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 16, borderRadius: 30, overflow: 'hidden',
    boxShadow: `0px 12px 28px ${colors.glow}` },
  retroCard: { borderRadius: 10, borderWidth: 2, borderColor: colors.frameOuter ?? colors.edge, boxShadow: `0px 3px 0px ${colors.frameOuter ?? colors.edge}` },
  cardMark: { position: 'absolute', right: -40, top: -50, opacity: 0.12 },
  eyebrow: { fontFamily: displayFont(fonts.heavy), color: colors.onBrand, fontSize: 15, lineHeight: 20, opacity: 0.92 },
  big: { fontFamily: fonts.black, color: colors.onBrand, fontSize: 50, lineHeight: 60, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  cents: { fontFamily: fonts.heavy, fontSize: 28, letterSpacing: -0.4, opacity: 0.6 },
  week: { fontFamily: fonts.bold, color: colors.onBrand, fontSize: 14, lineHeight: 19, opacity: 0.85, textAlign: 'center' },
  actions: { flexDirection: 'row', alignSelf: 'stretch', gap: 10, marginTop: 14 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 52, borderRadius: retro() ? 8 : 999 },
  // A frosted button and a solid one, readable on every theme's gradient (Pikachu's is light with dark text).
  soft: { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.3)' },
  solid: { backgroundColor: colors.onBrand },
  actionText: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 21 }
}))

const ring = themedStyles(() => ({
  layer: { position: 'absolute', top: 0, left: 0 },
  middle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: fonts.black, color: colors.ink, fontSize: 24, lineHeight: 28 },
  of: { fontFamily: fonts.bold, color: colors.muted, fontSize: 15 },
  unit: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 15 }
}))

const sum = themedStyles(() => ({
  band: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.mint, borderRadius: retro() ? 6 : 18,
    paddingLeft: 14, paddingRight: 6, paddingVertical: 6, minHeight: 52 },
  bandTitle: { flex: 1, fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 16 : 17, lineHeight: 22 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40, paddingLeft: 14, paddingRight: 10, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.mintLine },
  pillText: { flexShrink: 0, fontFamily: fonts.heavy, color: colors.edge, fontSize: 14, lineHeight: 19 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 2 },
  big: { fontFamily: fonts.black, color: colors.ink, fontSize: 40, lineHeight: 46, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  km: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 18, lineHeight: 24 },
  label: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  change: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 14, lineHeight: 19 },
  against: { fontFamily: fonts.body, color: colors.muted },
  strip: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: retro() ? 6 : 18, paddingVertical: 12 },
  fact: { flex: 1, paddingHorizontal: 12, gap: 3 },
  divided: { borderLeftWidth: 1, borderLeftColor: colors.line },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  factValue: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'] }
}))

const menu = themedStyles(() => ({
  box: { position: 'absolute', minWidth: 180, padding: 6, borderRadius: retro() ? 8 : 20, backgroundColor: colors.panel,
    borderWidth: retro() ? 2 : 1, borderColor: retro() ? (colors.frameOuter ?? colors.edge) : colors.line, boxShadow: `0px 14px 34px ${colors.shadow}` },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 14, borderRadius: retro() ? 4 : 14 },
  on: { backgroundColor: colors.mint },
  text: { flexShrink: 0, fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 20 },
  onText: { fontFamily: fonts.heavy, color: colors.edge }
}))

const tile = themedStyles(() => ({
  tile: { height: 140, borderRadius: retro() ? 10 : 24, padding: 14, justifyContent: 'flex-end', overflow: 'hidden',
    ...(retro() ? { borderWidth: 2, borderColor: colors.frameOuter, boxShadow: `0px 3px 0px ${colors.frameOuter}` } : { boxShadow: `0px 6px 16px ${colors.shadow}` }) },
  mark: { position: 'absolute', right: -22, bottom: -24, opacity: 0.1 },
  badge: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: glass(0.85), alignItems: 'center', justifyContent: 'center' },
  sprite: { position: 'absolute', top: 6, left: 0, right: 0, alignItems: 'center' },
  date: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 21 },
  distance: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14 },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 18 }
}))


const chart = themedStyles(() => ({
  marker: { position: 'absolute', top: 0, left: 0, width: 96 },
  tip: { height: 30, borderRadius: retro() ? 6 : 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  tipText: { fontFamily: fonts.heavy, color: colors.panel, fontSize: 14, lineHeight: 19, fontVariant: ['tabular-nums'] },
  guide: { position: 'absolute', width: 1.5, backgroundColor: colors.ink, opacity: 0.25 },
  dot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.edge, borderWidth: 3, borderColor: colors.panel,
    boxShadow: `0px 2px 6px ${colors.shadow}` },
  label: { position: 'absolute', width: 56, textAlign: 'center', fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  labelOn: { fontFamily: fonts.heavy, color: colors.ink }
}))

const best = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  divided: { borderTopWidth: 1, borderTopColor: colors.line },
  medal: { width: 40, height: 40, borderRadius: retro() ? 8 : 20, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  detail: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  time: { fontFamily: fonts.black, color: colors.ink, fontSize: 18, lineHeight: 23, fontVariant: ['tabular-nums'] },
  count: { fontFamily: fonts.black, color: colors.ink, fontSize: 28, lineHeight: 34, fontVariant: ['tabular-nums'] },
  of: { fontFamily: fonts.bold, color: colors.muted, fontSize: 15 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.sunken, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.gold },
  all: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 }
}))
