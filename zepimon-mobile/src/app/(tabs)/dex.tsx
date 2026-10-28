import { useState } from 'react'
import { router } from 'expo-router'
import { FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../../store'
import { entriesFromDex } from '../../journal'
import { defaultDexFilter, filterDex, fromSafari, generationsOf, isFiltered, typesOf } from '../../pokedex'
import type { DexFilter, DexVariant } from '../../pokedex'
import { FilterSection, GenerationFilter, ResultLine, SearchBox, SortSwitch, TypeFilter } from '../../PokedexFilters'
import { dexNumber, pokemonType } from '../../catalog'
import { Chip, Copy, Hero, Sprite, TypeBadge, colors, fonts, shadows, styles, themedStyles, typeTints, useTheme } from '../../ui'

// Your collection as a Pokedex: sort by number or name, filter by generation, type and variant, or search a name,
// type or number. A variant caught in the Safari Zone keeps its ◎ mark until the watch hatches the same variant.
const GAP = 5
const variants: [DexVariant, string][] = [['all', 'All'], ['normal', 'Normal'], ['shiny', 'Shiny'], ['safari', 'Safari']]

export default function DexScreen() {
  useTheme()
  const { journal, dex } = useJournal()
  const [filter, setFilter] = useState<DexFilter>(defaultDexFilter)
  const change = (next: Partial<DexFilter>) => setFilter(value => ({ ...value, ...next }))
  const entries = entriesFromDex(dex)
  const names = entries.map(entry => entry.name)
  const safariCount = entries.filter(fromSafari).length
  const filtered = filterDex(entries, filter)
  const filtering = isFiltered(filter)
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
    <FlatList data={filtered} keyExtractor={item => item.name} numColumns={3}
      windowSize={5} initialNumToRender={12} maxToRenderPerBatch={12}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: 0, paddingHorizontal: 16 - GAP }]}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 12, paddingHorizontal: GAP }}>
        <Hero eyebrow="YOUR COLLECTION" title="The field Dex">
          <Copy color={colors.onBrand}>{entries.length} Pokemon · Normal and Shiny records kept separately</Copy>
        </Hero>
        {safariCount > 0 && <Copy small color={colors.gold}>◎ {safariCount} caught in the Safari Zone · no walking record</Copy>}
        {entries.length > 0 && <>
          <SearchBox label="Search Pokemon by name, type or number" placeholder="Search a name, type or No.…"
            value={filter.query} onChange={query => change({ query })} />
          <SortSwitch value={filter.sort} onChange={sort => change({ sort })} />
          <GenerationFilter generations={generationsOf(names)} value={filter.generation} onChange={generation => change({ generation })} />
          <TypeFilter types={typesOf(names)} value={filter.type} onChange={type => change({ type })} />
          <FilterSection label="SHOW">{variants.filter(([variant]) => variant !== 'safari' || safariCount > 0 || filter.variant === 'safari').map(([variant, label]) =>
            <Chip key={variant} label={label} selected={filter.variant === variant} onPress={() => change({ variant })} />)}</FilterSection>
          <ResultLine text={filtering ? `${filtered.length} of ${entries.length} Pokemon` : `${entries.length} Pokemon`}
            onClear={filtering ? () => change({ ...defaultDexFilter, sort: filter.sort }) : undefined} />
          <Copy small>Tap a Pokemon to say hello. Tap its name to view records.</Copy>
        </>}
      </View>}
      ListEmptyComponent={<View style={{ paddingHorizontal: GAP }}><Copy>{journal || entries.length ? 'No Pokemon match these filters. Try another name, number, generation or type.' : 'Import your Zepp journal, or catch Pokemon in the Safari Zone, to meet your team.'}</Copy></View>}
      renderItem={({ item }) => {
        const type = pokemonType(item.name)
        return <View style={{ width: '33.333%', padding: GAP }}>
          <View style={dexStyles.card}>
            <Text style={dexStyles.number}>{dexNumber(item.name)}</Text>
            <View style={[dexStyles.platform, { backgroundColor: typeTints[type] || colors.sunken }]}>
              <Sprite name={item.name} shiny={filter.variant === 'shiny' || !item.normal} size={72} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name} record`}
              onPress={() => router.push({ pathname: '/pokemon', params: { name: item.name } })}
              style={({ pressed }) => [dexStyles.details, { opacity: pressed ? 0.7 : 1 }]}>
              <Text numberOfLines={2} style={dexStyles.name}>{item.name}</Text>
              <View style={{ alignSelf: 'center' }}><TypeBadge type={type} /></View>
              <Text style={dexStyles.marks}>{[item.normal && `Normal${item.normal.source === 'safari' ? ' ◎' : ''}`,
                item.shiny && `✦ Shiny${item.shiny.source === 'safari' ? ' ◎' : ''}`].filter(Boolean).join(' · ')}</Text>
              {fromSafari(item) && <Text style={dexStyles.badge}>◎ SAFARI</Text>}
            </Pressable>
          </View>
        </View>
      }} />
  </SafeAreaView>
}

const dexStyles = themedStyles(() => ({
  card: { flex: 1, alignItems: 'center', gap: 6, padding: 8, paddingTop: 10, borderRadius: 18, backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line, ...shadows.card },
  number: { alignSelf: 'flex-start', fontFamily: fonts.bold, color: colors.muted, fontSize: 11, lineHeight: 14 },
  platform: { width: '100%', alignItems: 'center', paddingVertical: 4, borderRadius: 14 },
  details: { width: '100%', minHeight: 48, alignItems: 'center', gap: 5 },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18, textAlign: 'center' },
  marks: { fontFamily: fonts.bold, color: colors.gold, fontSize: 11, lineHeight: 14, textAlign: 'center' },
  badge: { fontFamily: fonts.heavy, color: colors.gold, backgroundColor: colors.goldTint, fontSize: 10, letterSpacing: 0.6, paddingHorizontal: 7,
    paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }
}))
