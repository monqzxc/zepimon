import { useMemo, useState } from 'react'
import { FlatList, Text, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useJournal } from '../store'
import { km } from '../journal'
import { allAdventures } from '../adventures'
import type { Adventure } from '../adventures'
import { AdventureCard } from '../AdventureCard'
import { Button, Chip, Copy, Eyebrow, Heading, Panel, styles } from '../ui'

// Every saved adventure, from the watch and this phone, newest first and grouped by month. Opened from the Journal
// and the Adventure tab; each one opens its details.
type Device = 'all' | Adventure['device']
const devices: [Device, string][] = [['all', 'All'], ['phone', 'This phone'], ['watch', 'Watch']]
const month = (adventure: Adventure) => new Date(adventure.record.finishedAt).toLocaleDateString([], { month: 'long', year: 'numeric' })

export default function AdventuresScreen() {
  const { progress, phoneRuns } = useJournal()
  const [device, setDevice] = useState<Device>('all')
  const all = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const shown = device === 'all' ? all : all.filter(adventure => adventure.device === device)
  const total = shown.reduce((sum, adventure) => sum + adventure.record.meters, 0)
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
    <FlatList data={shown} keyExtractor={adventure => adventure.id} windowSize={7} initialNumToRender={6} maxToRenderPerBatch={6}
      contentContainerStyle={[styles.content, { gap: 0 }]} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={<Panel style={{ marginBottom: 4 }}>
        <Eyebrow>{device === 'all' ? 'ALL ADVENTURES' : device === 'phone' ? 'ON THIS PHONE' : 'ON YOUR WATCH'}</Eyebrow>
        <Text style={styles.stat}>{km(total)}</Text>
        <Copy>{shown.length} {shown.length === 1 ? 'adventure' : 'adventures'}. Tap one to see its route, stats and Pokemon.</Copy>
        <View style={styles.row}>{devices.map(([value, label]) =>
          <Chip key={value} label={label} selected={device === value} onPress={() => setDevice(value)} />)}</View>
      </Panel>}
      ListEmptyComponent={<Panel>
        <Copy>{all.length ? 'No adventures from this device yet.' : 'Your adventures appear here after you save one in the Adventure tab, or on your watch and sync through Zepp.'}</Copy>
        {!all.length && <Button title="Start an adventure" onPress={() => router.navigate('/adventure')} />}
      </Panel>}
      renderItem={({ item, index }) => <View style={{ gap: 12 }}>
        {(index === 0 || month(item) !== month(shown[index - 1])) && <View style={{ paddingTop: index ? 8 : 12 }}><Heading>{month(item)}</Heading></View>}
        <AdventureCard adventure={item} />
      </View>}
      ListFooterComponent={shown.length ? <View style={{ paddingTop: 16 }}><Copy small>
        The watch sends its last 30 adventures with each sync, so sync at least that often to keep every one here.</Copy></View> : null} />
  </SafeAreaView>
}
