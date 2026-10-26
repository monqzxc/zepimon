import { useState } from 'react'
import { router } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../../store'
import { entriesFromDex } from '../../journal'
import type { DexEntry } from '../../journal'
import { pokemonGeneration, pokemonType } from '../../catalog'
import { Button, Copy, Eyebrow, Heading, HabitatScene, colors, styles } from '../../ui'

// A variant caught in Safari Hunt keeps its ◎ mark until the watch hatches the same variant.
const safari = (entry: DexEntry) => entry.normal?.source === 'safari' || entry.shiny?.source === 'safari'

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
    <FlatList data={filtered} keyExtractor={item => item.name} numColumns={2}
      windowSize={3} initialNumToRender={8} maxToRenderPerBatch={8}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: 0 }]}
      columnWrapperStyle={{ gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 20 }}>
        <Eyebrow>YOUR COLLECTION</Eyebrow><Heading>The field Dex</Heading>
        <Copy>{entries.length} Pokemon · Normal and Shiny records kept separately</Copy>
        {safariCount > 0 && <Copy small color={colors.gold}>◎ {safariCount} caught in Safari Hunt · no walking record</Copy>}
        <Copy small>Tap a Pokemon to say hello. Tap its name to view records.</Copy>
        <TextInput accessibilityLabel="Search Pokemon or type" placeholder="Search Pokemon or type…" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.input} autoCorrect={false} />
        <View style={styles.row}>{['All', 'Normal', 'Shiny', ...(safariCount ? ['Safari'] : [])].map(value => <Button key={value} title={value} secondary={variant !== value} onPress={() => setVariant(value)} />)}</View>
        <View style={styles.row}>{['All gens', 'Gen 1', 'Gen 2', 'Gen 3', 'Gen 4', 'Extras'].map((label, index) =>
          <Button key={label} title={label} secondary={generation !== index} onPress={() => setGeneration(index)} />)}</View>
      </View>}
      ListEmptyComponent={<Copy>{journal || entries.length ? 'No Pokemon match these filters. Try another name or generation.' : 'Import your Zepp journal, or catch Pokemon in Safari Hunt, to meet your team.'}</Copy>}
      renderItem={({ item }) => <View
        style={[styles.panel, { flex: 1, maxWidth: '50%', padding: 10, marginBottom: 12, alignItems: 'center' }]}>
        <HabitatScene name={item.name} shiny={variant === 'Shiny' || !item.normal} compact />
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name} record`}
          onPress={() => router.push({ pathname: '/pokemon', params: { name: item.name } })}
          style={({ pressed }) => ({ minHeight: 48, width: '100%', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{item.name}</Text>
        <Copy small>{pokemonType(item.name).toUpperCase()}</Copy>
        <Copy small color={colors.gold}>{[item.normal && `Normal${item.normal.source === 'safari' ? ' ◎' : ''}`,
          item.shiny && `✦ Shiny${item.shiny.source === 'safari' ? ' ◎' : ''}`].filter(Boolean).join(' · ')}</Copy>
        {safari(item) && <Text style={dexStyles.badge}>◎ SAFARI CATCH</Text>}
        </Pressable>
      </View>} />
  </SafeAreaView>
}

const dexStyles = StyleSheet.create({
  badge: { color: colors.bg, backgroundColor: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, overflow: 'hidden' }
})
