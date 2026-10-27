import type { PropsWithChildren } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { sortOrders } from './pokedex'
import type { SortOrder } from './pokedex'
import { typeColors, typeTints } from './catalog'
import { Chip, Eyebrow, Icon, colors, fonts, styles, typeLabel } from './ui'

// The Pokedex-style controls of the Dex tab and the egg picker: search, sort, and filter rows.

export function SearchBox({ value, onChange, label, placeholder }: { value: string, onChange: (text: string) => void, label: string, placeholder: string }) {
  return <View style={filters.search}>
    <Icon name="search" size={20} color={colors.muted} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={colors.muted}
      value={value} onChangeText={onChange} style={filters.searchInput} autoCorrect={false} />
  </View>
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
        <Text numberOfLines={1} style={[filters.sortText, value === sort && { color: colors.onBrand }]}>{label}</Text>
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
        <Text style={[styles.chipText, { color: selected ? colors.onBrand : colors.ink }]}>{typeLabel(type)}</Text>
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

const filters = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
  strip: { gap: 8, paddingRight: 8 },
  sorts: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  sort: { flexGrow: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999 },
  sortOn: { backgroundColor: colors.edge },
  sortText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 18 },
  typeChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5 },
  count: { flex: 1, fontFamily: fonts.bold, color: colors.muted, fontSize: 14, lineHeight: 19 },
  link: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 14, lineHeight: 19 }
})
