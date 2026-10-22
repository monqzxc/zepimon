import { useState } from 'react'
import { router } from 'expo-router'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../../store'
import { dexEntries } from '../../journal'
import { pokemonGeneration, pokemonType } from '../../catalog'
import { Button, Copy, Eyebrow, Heading, HabitatScene, colors, styles } from '../../ui'

export default function DexScreen() {
  const { journal } = useJournal()
  const [query, setQuery] = useState('')
  const [variant, setVariant] = useState('All')
  const [generation, setGeneration] = useState(0)
  const entries = journal ? dexEntries(journal) : []
  const filtered = entries.filter(entry => `${entry.name} ${pokemonType(entry.name)}`.toLowerCase().includes(query.toLowerCase().trim()) &&
    (variant === 'All' || (variant === 'Shiny' ? entry.shiny : entry.normal)) &&
    (!generation || (generation === 5 ? pokemonGeneration(entry.name) > 4 : pokemonGeneration(entry.name) === generation)))
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
    <FlatList data={filtered} keyExtractor={item => item.name} numColumns={2}
      windowSize={3} initialNumToRender={8} maxToRenderPerBatch={8}
      keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { gap: 0 }]}
      columnWrapperStyle={{ gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 20 }}>
        <Eyebrow>YOUR COLLECTION</Eyebrow><Heading>The field Dex</Heading>
        <Copy>{entries.length} Pokemon · Normal and Shiny records kept separately</Copy>
        <Copy small>Tap a Pokemon to say hello. Tap its name to view records.</Copy>
        <TextInput accessibilityLabel="Search Pokemon or type" placeholder="Search Pokemon or type…" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.input} autoCorrect={false} />
        <View style={styles.row}>{['All', 'Normal', 'Shiny'].map(value => <Button key={value} title={value} secondary={variant !== value} onPress={() => setVariant(value)} />)}</View>
        <View style={styles.row}>{['All gens', 'Gen 1', 'Gen 2', 'Gen 3', 'Gen 4', 'Extras'].map((label, index) =>
          <Button key={label} title={label} secondary={generation !== index} onPress={() => setGeneration(index)} />)}</View>
      </View>}
      ListEmptyComponent={<Copy>{journal ? 'No Pokemon match these filters. Try another name or generation.' : 'Import your Zepp journal to meet your team.'}</Copy>}
      renderItem={({ item }) => <View
        style={[styles.panel, { flex: 1, maxWidth: '50%', padding: 10, marginBottom: 12, alignItems: 'center' }]}>
        <HabitatScene name={item.name} shiny={variant === 'Shiny' || !item.normal} compact />
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name} record`}
          onPress={() => router.push({ pathname: '/pokemon', params: { name: item.name } })}
          style={({ pressed }) => ({ minHeight: 48, width: '100%', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{item.name}</Text>
        <Copy small>{pokemonType(item.name).toUpperCase()}</Copy>
        <Copy small color={colors.gold}>{[item.normal && 'Normal', item.shiny && '✦ Shiny'].filter(Boolean).join(' · ')}</Copy>
        </Pressable>
      </View>} />
  </SafeAreaView>
}
