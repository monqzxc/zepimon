import { useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { allEggs, eggOpen } from '../phone-adventure'
import { caughtCount, defaultEggFilter, filterEggs, generationsOf, isFiltered, mysteryLine, spokenLine, typesOf } from '../pokedex'
import type { EggFilter, EggStatus } from '../pokedex'
import { FilterSection, GenerationFilter, ResultLine, SearchBox, SortSwitch, TypeFilter } from '../PokedexFilters'
import { dexNumber, pokemonType } from '../catalog'
import { PixelSprite } from '../games/TeamPicker'
import { Chip, Copy, Icon, PokeballIcon, TypeBadge, colors, fonts, shadows, styles, themedStyles, typeTints, useTheme } from '../ui'

// Choose the next egg like browsing a Pokedex: sort by number or name, filter by generation, type and what your Dex
// still misses, or search a name or number. Opened from the Adventure tab; the choice goes to the watch as well.
// Legendary and Mythical eggs are listed too, locked as a dark silhouette until caught on a Legendary Expedition.
const GAP = 5
const generations = generationsOf(allEggs.flat())
const types = typesOf(allEggs.flat())
const statuses: [EggStatus, string][] = [['all', 'All'], ['missing', 'Not caught'], ['caught', 'Caught']]
const counts: Record<EggStatus, string> = { all: '', missing: ' with a Pokemon not in your Dex yet', caught: ' with the whole family in your Dex' }
// The sort and filters stay as you left them until the app closes; the search starts empty each time.
let remembered = defaultEggFilter
const remember = (filter: EggFilter) => { remembered = filter }

export default function EggsScreen() {
  useTheme()
  const { current } = useLocalSearchParams<{ current?: string }>()
  const { dex, expeditions, chooseEgg } = useJournal()
  const [filter, setFilter] = useState<EggFilter>(() => ({ ...remembered, query: '' }))
  function change(next: Partial<EggFilter>) {
    const value = { ...filter, ...next }
    setFilter(value)
    remember(value)
  }
  const caught = (name: string) => !!(dex[name] || dex[`Shiny ${name}`])
  const results = filterEggs(allEggs, filter, caught)
  const open = (family: string[]) => eggOpen(family, expeditions.dex)
  const choices = results.filter(open)
  function choose(family: string[]) {
    chooseEgg(family, null).catch(() => {})
    if (router.canGoBack()) router.back()
    else router.navigate('/adventure')
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <FlatList data={results} keyExtractor={family => family.join('>')} numColumns={3}
      windowSize={5} initialNumToRender={12} maxToRenderPerBatch={12}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: 0, paddingHorizontal: 16 - GAP }]}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 12, paddingHorizontal: GAP }}>
        <SearchBox label="Search eggs by Pokemon name, type or number" placeholder="Search a name, type or No.…"
          value={filter.query} onChange={query => change({ query })} />
        <SortSwitch value={filter.sort} onChange={sort => change({ sort })} />
        <GenerationFilter generations={generations} value={filter.generation} onChange={generation => change({ generation })} />
        <TypeFilter types={types} value={filter.type} onChange={type => change({ type })} />
        <FilterSection label="YOUR DEX">{statuses.map(([status, label]) =>
          <Chip key={status} label={label} selected={filter.status === status} onPress={() => change({ status })} />)}</FilterSection>
        <ResultLine text={`${results.length} ${results.length === 1 ? 'egg' : 'eggs'}${counts[filter.status]}`}
          onClear={isFiltered(filter) ? () => change({ ...defaultEggFilter, sort: filter.sort }) : undefined}
          onRandom={choices.length > 1 ? () => choose(choices[Math.floor(Math.random() * choices.length)]) : undefined} />
      </View>}
      ListEmptyComponent={<View style={{ paddingHorizontal: GAP }}><Copy>No eggs match these filters. Try another name, number, generation or type.</Copy></View>}
      renderItem={({ item }) => <EggCard family={item} line={mysteryLine(item, caught)} caught={caughtCount(item, caught)} current={item.join('>') === current}
        locked={!open(item)} onPress={() => choose(item)} />} />
  </SafeAreaView>
}

// line is the family with the Pokemon not in your Dex yet hidden (mysteryLine). A locked egg is a Legendary or Mythical
// one not caught on an Expedition yet: shown as a silhouette that cannot be chosen.
function EggCard({ family, line, caught, current, locked, onPress }: { family: string[], line: string[], caught: number, current: boolean, locked: boolean, onPress: () => void }) {
  const type = pokemonType(family[0])
  const complete = caught === family.length
  return <View style={{ width: '33.333%', padding: GAP }}>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: current, disabled: locked }} disabled={locked}
      accessibilityLabel={`${family[0]} egg, ${dexNumber(family[0])}. ${locked ? 'Locked. Catch it on a Legendary Expedition to hatch its egg' :
        `${spokenLine(line)}. ${caught} of ${family.length} in your Dex${current ? '. Your current egg' : ''}`}`}
      onPress={onPress} style={({ pressed }) => [eggStyles.card, current && eggStyles.current, locked && eggStyles.locked, { opacity: pressed ? 0.75 : 1 }]}>
      <View style={eggStyles.top}>
        <Text style={eggStyles.number}>{dexNumber(family[0])}</Text>
        {locked ? <Icon name="lock" size={14} color={colors.muted} />
          : complete ? <PokeballIcon size={14} color={colors.edge} /> : <Text style={eggStyles.number}>{caught}/{family.length}</Text>}
      </View>
      <View style={[eggStyles.platform, { backgroundColor: locked ? colors.sunken : typeTints[type] || colors.sunken }]}>
        <PixelSprite name={family[0]} size={60} tint={locked ? colors.ink : undefined} /></View>
      <Text numberOfLines={1} style={[eggStyles.name, locked && { color: colors.muted }]}>{family[0]}</Text>
      {locked ? <Text numberOfLines={2} style={eggStyles.chain}>Catch on an Expedition</Text> : <TypeBadge type={type} />}
      {!locked && family.length > 1 && <Text numberOfLines={1} style={eggStyles.chain}>› {line.slice(1).join(' › ')}</Text>}
      {current && <Text style={eggStyles.currentText}>CURRENT EGG</Text>}
    </Pressable>
  </View>
}

const eggStyles = themedStyles(() => ({
  card: { flex: 1, alignItems: 'center', gap: 5, padding: 8, paddingTop: 8, borderRadius: 18, backgroundColor: colors.panel,
    borderWidth: 1.5, borderColor: colors.line, ...shadows.card },
  current: { borderColor: colors.edge, borderWidth: 2.5 },
  locked: { backgroundColor: colors.sunken, borderStyle: 'dashed' },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, lineHeight: 14 },
  platform: { width: '100%', alignItems: 'center', paddingVertical: 4, borderRadius: 14 },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18, textAlign: 'center' },
  chain: { width: '100%', fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 14, textAlign: 'center' },
  currentText: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 10, letterSpacing: 0.6 }
}))
