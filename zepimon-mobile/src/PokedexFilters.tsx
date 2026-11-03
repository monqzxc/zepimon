import { useEffect, useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { sortOrders } from './pokedex'
import type { SortOrder } from './pokedex'
import { typeColors } from './catalog'
import { useReducedMotion } from './games/hooks'
import { Chip, Eyebrow, Icon, colors, displayFont, fonts, retro, styles, typeLabel, themedStyles, typeTints } from './ui'

// The Pokedex-style controls of the Dex tab and the egg picker: search, sort, and filter rows, and the Dex tab's
// dropdown pills with the sheet each one opens.

const native = Platform.OS !== 'web'

export function SearchBox({ value, onChange, label, placeholder }: { value: string, onChange: (text: string) => void, label: string, placeholder: string }) {
  return <View style={filters.search}>
    <Icon name="search" size={20} color={colors.muted} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.muted}
      value={value} onChangeText={onChange} style={filters.searchInput} autoCorrect={false} />
    {value.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChange('')}
      style={({ pressed }) => [filters.clear, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="close" size={16} color={colors.muted} />
    </Pressable>}
  </View>
}

// A dropdown pill: what it filters by, shown as its current value, with a chevron. It fills with the accent while its
// filter is on, so a glance says which filters narrow the list.
// Pills share their row and shrink, ending a long label with an ellipsis, so all three fit on a small phone.
export function FilterPill({ mark, label, name, on, onPress }: { mark: ReactNode, label: string, name: string, on: boolean, onPress: () => void }) {
  const reduced = useReducedMotion()
  const [scale] = useState(() => new Animated.Value(1))
  const squeeze = (toValue: number, bounciness: number) => reduced ? scale.setValue(toValue)
    : Animated.spring(scale, { toValue, speed: 40, bounciness, useNativeDriver: native }).start()
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name}: ${label}`} accessibilityHint="Opens the choices"
    onPress={onPress} onPressIn={() => squeeze(0.95, 0)} onPressOut={() => squeeze(1, 9)} style={filters.pillSlot}>
    <Animated.View style={[filters.pill, on && filters.pillOn, { transform: [{ scale }] }]}>
      {mark}
      <Text numberOfLines={1} style={[filters.pillText, on && { color: colors.onEdge }]}>{label}</Text>
      <Icon name="chevronDown" size={14} color={on ? colors.onEdge : colors.muted} />
    </Animated.View>
  </Pressable>
}

// One choice in a PickerSheet. count is how many Pokemon the list would show with it. color and tint draw a type's
// tile; wide keeps an option (like All) as a full row above a grid.
export type PickerOption<T> = { value: T, label: string, detail?: string, count?: number, mark?: ReactNode, color?: string, tint?: string, wide?: boolean }

// The choices of one pill, as a sheet from the bottom. A tap picks and closes. grid lays the options out three across.
export function PickerSheet<T>({ visible, title, options, value, grid = false, onPick, onClose }: {
  visible: boolean, title: string, options: PickerOption<T>[], value: T, grid?: boolean, onPick: (value: T) => void, onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const reduced = useReducedMotion()
  const [slide] = useState(() => new Animated.Value(0))
  // Closing keeps the modal up (leaving) while the sheet slides away.
  const [opened, setOpened] = useState(visible)
  const [leaving, setLeaving] = useState(false)
  if (visible !== opened) {
    setOpened(visible)
    if (!visible && !reduced) setLeaving(true)
  }
  useEffect(() => {
    if (reduced) { slide.setValue(visible ? 1 : 0); return }
    if (!visible && !leaving) return
    const run = visible ? Animated.spring(slide, { toValue: 1, speed: 14, bounciness: 5, useNativeDriver: native })
      : Animated.timing(slide, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: native })
    run.start(({ finished }) => { if (finished && !visible) setLeaving(false) })
    return () => run.stop()
  }, [visible, leaving, reduced, slide])
  const pick = (next: T) => { onPick(next); onClose() }
  const tile = Math.floor((width - 36 - 16) / 3)
  const rows = options.filter(option => !grid || option.wide)
  const tiles = grid ? options.filter(option => !option.wide) : []
  return <Modal visible={visible || leaving} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <Animated.View style={[filters.scrim, { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal style={[filters.sheet, { maxHeight: height * 0.82, paddingBottom: insets.bottom + 16,
      transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, 0] }) }] }]}>
      <View style={filters.grabber} />
      <View style={filters.sheetHead}>
        <Text accessibilityRole="header" style={filters.sheetTitle}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={filters.close}>
          <Icon name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
        {rows.map(option => {
          const on = option.value === value
          return <Pressable key={String(option.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={[option.label, option.detail, option.count !== undefined && `${option.count} Pokemon`].filter(Boolean).join(', ')}
            onPress={() => pick(option.value)} style={({ pressed }) => [filters.row, on && filters.rowOn, { opacity: pressed ? 0.7 : 1 }]}>
            {option.mark && <View style={filters.rowMark}>{option.mark}</View>}
            <View style={{ flex: 1 }}>
              <Text style={[filters.rowLabel, on && { color: colors.edge }]}>{option.label}</Text>
              {option.detail && <Text style={filters.rowDetail}>{option.detail}</Text>}
            </View>
            {option.count !== undefined && <Text style={filters.rowCount}>{option.count}</Text>}
            <View style={filters.check}>{on && <Icon name="check" size={20} color={colors.edge} />}</View>
          </Pressable>
        })}
        {tiles.length > 0 && <View style={filters.tiles}>{tiles.map(option => {
          const on = option.value === value
          const color = option.color || colors.edge
          return <Pressable key={String(option.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={`${option.label}${option.count !== undefined ? `, ${option.count} Pokemon` : ''}`}
            onPress={() => pick(option.value)}
            style={({ pressed }) => [filters.tile, { width: tile, backgroundColor: on ? color : option.tint || colors.sunken,
              opacity: option.count === 0 && !on ? 0.5 : pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <View style={[filters.dot, { backgroundColor: on ? '#FFFFFF' : color }]} />
            <Text numberOfLines={1} style={[filters.tileLabel, on && { color: '#FFFFFF' }]}>{option.label}</Text>
            {option.count !== undefined && <Text style={[filters.tileCount, on && { color: '#FFFFFF' }]}>{option.count}</Text>}
          </Pressable>
        })}</View>}
      </ScrollView>
    </Animated.View>
  </Modal>
}

// A labelled row of choices. A strip scrolls sideways instead of wrapping, for long lists like the types.
export function FilterSection({ label, strip = false, children }: PropsWithChildren<{ label: string, strip?: boolean }>) {
  return <View style={{ gap: 8 }}>
    <Eyebrow color={colors.muted}>{label}</Eyebrow>
    {strip ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filters.strip}>{children}</ScrollView>
      : <View style={styles.row}>{children}</View>}
  </View>
}

export function SortSwitch({ value, onChange }: { value: SortOrder, onChange: (sort: SortOrder) => void }) {
  return <View style={{ gap: 8 }}>
    <Eyebrow color={colors.muted}>SORT BY</Eyebrow>
    <View accessibilityRole="radiogroup" style={filters.sorts}>{sortOrders.map(([sort, label]) =>
      <Pressable key={sort} accessibilityRole="radio" accessibilityState={{ checked: value === sort }} onPress={() => onChange(sort)}
        style={({ pressed }) => [filters.sort, value === sort && filters.sortOn, { opacity: pressed ? 0.8 : 1 }]}>
        <Text numberOfLines={1} style={[filters.sortText, value === sort && { color: colors.onEdge }]}>{label}</Text>
      </Pressable>)}</View>
  </View>
}

export function GenerationFilter({ generations, value, onChange }: {
  generations: { generation: number, label: string }[], value: number, onChange: (generation: number) => void
}) {
  return <FilterSection label="GENERATION" strip>
    <Chip label="All" selected={!value} onPress={() => onChange(0)} />
    {generations.map(({ generation, label }) => <Chip key={generation} label={label} selected={value === generation} onPress={() => onChange(generation)} />)}
  </FilterSection>
}

export function TypeFilter({ types, value, onChange }: { types: string[], value: string | null, onChange: (type: string | null) => void }) {
  return <FilterSection label="TYPE" strip>
    <Chip label="All" selected={!value} onPress={() => onChange(null)} />
    {types.map(type => {
      const color = typeColors[type] || typeColors.normal
      const selected = value === type
      return <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${typeLabel(type)} type`} hitSlop={4}
        onPress={() => onChange(type)}
        style={({ pressed }) => [filters.typeChip, { backgroundColor: selected ? color : typeTints[type] || colors.panel, borderColor: color, opacity: pressed ? 0.8 : 1 }]}>
        <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.ink }]}>{typeLabel(type)}</Text>
      </Pressable>
    })}
  </FilterSection>
}

// How many match, with Clear when a filter is on and, where it fits, Random.
export function ResultLine({ text, onClear, onRandom }: { text: string, onClear?: () => void, onRandom?: () => void }) {
  return <View style={[styles.row, { flexWrap: 'nowrap', gap: 16 }]}>
    <Text style={filters.count}>{text}</Text>
    {onClear && <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" hitSlop={8} onPress={onClear}>
      <Text style={filters.link}>Clear</Text>
    </Pressable>}
    {onRandom && <Pressable accessibilityRole="button" accessibilityLabel="Random pick from these" hitSlop={8} onPress={onRandom}>
      <Text style={filters.link}>Random</Text>
    </Pressable>}
  </View>
}

const filters = themedStyles(() => ({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
  clear: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  pillSlot: { flexShrink: 1, minWidth: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 11, borderRadius: retro() ? 10 : 999,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  pillOn: { backgroundColor: colors.edge, borderColor: colors.edge, boxShadow: `0px 4px 12px ${colors.glow}` },
  pillText: { flexShrink: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.panel, paddingHorizontal: 18, paddingTop: 10, gap: 10,
    borderTopLeftRadius: retro() ? 12 : 28, borderTopRightRadius: retro() ? 12 : 28, boxShadow: `0px -10px 30px ${colors.shadow}`,
    ...(retro() ? { borderWidth: 2, borderBottomWidth: 0, borderColor: colors.frameOuter } : null) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: displayFont(fonts.heavy), color: colors.ink, fontSize: retro() ? 18 : 20, lineHeight: 26 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: retro() ? 8 : 18,
    backgroundColor: colors.sunken },
  rowOn: { backgroundColor: colors.mint },
  rowMark: { width: 28, alignItems: 'center' },
  rowLabel: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  rowDetail: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  rowCount: { fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 19, fontVariant: ['tabular-nums'] },
  check: { width: 20, alignItems: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { minHeight: 64, borderRadius: retro() ? 8 : 18, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tileLabel: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18 },
  tileCount: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 15, fontVariant: ['tabular-nums'] },
  strip: { gap: 8, paddingRight: 8 },
  sorts: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  sort: { flexGrow: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999 },
  sortOn: { backgroundColor: colors.edge },
  sortText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 18 },
  typeChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5 },
  count: { flex: 1, fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 19 },
  link: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 14, lineHeight: 19 }
}))
