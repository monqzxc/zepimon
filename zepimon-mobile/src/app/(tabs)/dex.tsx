import { useState } from 'react'
import { router } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../../store'
import { entriesFromDex } from '../../journal'
import type { DexEntry } from '../../journal'
import { dexNumber, pokemonGeneration, pokemonType, typeTints } from '../../catalog'
import { Chip, Copy, Hero, Icon, Sprite, TypeBadge, colors, fonts, shadows, styles } from '../../ui'

// A variant caught in Safari Hunt keeps its ◎ mark until the watch hatches the same variant.
const safari = (entry: DexEntry) => entry.normal?.source === 'safari' || entry.shiny?.source === 'safari'
const GAP = 5

export default function DexScreen() {
  const { journal, dex } = useJournal()
  const [query, setQuery] = useState('')
  const [variant, setVariant] = useState('All')
  const [generation, setGeneration] = useState(0)
  const entries = entriesFromDex(dex)
  const safariCount = entries.filter(safari).length
  const filtered = entries.filter(entry => `${entry.name} ${pokemonType(entry.name)}`.toLowerCase().includes(query.toLowerCase().trim()) &&
    (variant === 'All' || (variant === 'Safari' ? safari(entry) : variant === 'Shiny' ? entry.shiny : entry.normal)) &&
    (!generation || (generation === 5 ? pokemonGeneration(entry.name) > 4 : pokemonGeneration(entry.name) === generation)))
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
    <FlatList data={filtered} keyExtractor={item => item.name} numColumns={3}
      windowSize={5} initialNumToRender={12} maxToRenderPerBatch={12}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: 0, paddingHorizontal: 16 - GAP }]}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 12, paddingHorizontal: GAP }}>
        <Hero eyebrow="YOUR COLLECTION" title="The field Dex">
          <Copy color={colors.onBrand}>{entries.length} Pokemon · Normal and Shiny records kept separately</Copy>
        </Hero>
        {safariCount > 0 && <Copy small color={colors.gold}>◎ {safariCount} caught in Safari Hunt · no walking record</Copy>}
        <View style={dexStyles.search}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput accessibilityLabel="Search Pokemon or type" placeholder="Search Pokemon or type…" placeholderTextColor={colors.muted}
            value={query} onChangeText={setQuery} style={dexStyles.searchInput} autoCorrect={false} />
        </View>
        <View style={styles.row}>{['All', 'Normal', 'Shiny', ...(safariCount ? ['Safari'] : [])].map(value =>
          <Chip key={value} label={value} selected={variant === value} onPress={() => setVariant(value)} />)}</View>
        <View style={styles.row}>{['All gens', 'Gen 1', 'Gen 2', 'Gen 3', 'Gen 4', 'Extras'].map((label, index) =>
          <Chip key={label} label={label} selected={generation === index} onPress={() => setGeneration(index)} />)}</View>
        <Copy small>Tap a Pokemon to say hello. Tap its name to view records.</Copy>
      </View>}
      ListEmptyComponent={<View style={{ paddingHorizontal: GAP }}><Copy>{journal || entries.length ? 'No Pokemon match these filters. Try another name or generation.' : 'Import your Zepp journal, or catch Pokemon in Safari Hunt, to meet your team.'}</Copy></View>}
      renderItem={({ item }) => {
        const type = pokemonType(item.name)
        return <View style={{ width: '33.333%', padding: GAP }}>
          <View style={dexStyles.card}>
            <Text style={dexStyles.number}>{dexNumber(item.name)}</Text>
            <View style={[dexStyles.platform, { backgroundColor: typeTints[type] || colors.sunken }]}>
              <Sprite name={item.name} shiny={variant === 'Shiny' || !item.normal} size={72} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name} record`}
              onPress={() => router.push({ pathname: '/pokemon', params: { name: item.name } })}
              style={({ pressed }) => [dexStyles.details, { opacity: pressed ? 0.7 : 1 }]}>
              <Text numberOfLines={2} style={dexStyles.name}>{item.name}</Text>
              <View style={{ alignSelf: 'center' }}><TypeBadge type={type} /></View>
              <Text style={dexStyles.marks}>{[item.normal && `Normal${item.normal.source === 'safari' ? ' ◎' : ''}`,
                item.shiny && `✦ Shiny${item.shiny.source === 'safari' ? ' ◎' : ''}`].filter(Boolean).join(' · ')}</Text>
              {safari(item) && <Text style={dexStyles.badge}>◎ SAFARI</Text>}
            </Pressable>
          </View>
        </View>
      }} />
  </SafeAreaView>
}

const dexStyles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  searchInput: { flex: 1, minHeight: 48, color: colors.ink, fontFamily: fonts.body, fontSize: 16 },
  card: { flex: 1, alignItems: 'center', gap: 6, padding: 8, paddingTop: 10, borderRadius: 18, backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line, ...shadows.card },
  number: { alignSelf: 'flex-start', fontFamily: fonts.bold, color: colors.muted, fontSize: 11, lineHeight: 14 },
  platform: { width: '100%', alignItems: 'center', paddingVertical: 4, borderRadius: 14 },
  details: { width: '100%', minHeight: 48, alignItems: 'center', gap: 5 },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 18, textAlign: 'center' },
  marks: { fontFamily: fonts.bold, color: colors.gold, fontSize: 11, lineHeight: 14, textAlign: 'center' },
  badge: { fontFamily: fonts.heavy, color: colors.gold, backgroundColor: '#FFF1D6', fontSize: 10, letterSpacing: 0.6, paddingHorizontal: 7,
    paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }
})
