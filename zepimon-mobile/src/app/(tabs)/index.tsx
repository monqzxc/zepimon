import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../../store'
import { averagePace, dexEntries, duration, km, personalBests, recordForm } from '../../journal'
import { completedRuns, missions } from '../../progress'
import { Button, Copy, Eyebrow, Habitat, Heading, Panel, Screen, Sprite, colors, styles } from '../../ui'

export default function JournalScreen() {
  const { journal, buddy, progress, error, expeditions } = useJournal()
  const name = buddy?.replace(/^Shiny /, '') || 'Gible'
  const runs = completedRuns(progress)
  const total = runs.reduce((sum, run) => sum + run.record.meters, 0)
  const badges = missions(journal, progress).filter(mission => !mission.weekly && progress.unlocked[mission.id]).length
  const bests = journal ? personalBests(journal) : {}
  return <Screen>
    <Eyebrow>ZEPIMON / YOUR FIELD JOURNAL</Eyebrow>
    <Heading>Every step,{ '\n' }a little adventure.</Heading>
    {!!error && <Copy color={colors.gold}>{error}</Copy>}
    <Habitat name={name} shiny={buddy?.startsWith('Shiny ')}>
      <Heading>{buddy || 'Hello, explorer.'}</Heading>
      <Copy color={colors.ink}>{buddy ? 'Your trail companion. Choose another in your Dex.' : 'Bring your watch adventures along. Your collection, now with room to grow.'}</Copy>
    </Habitat>
    <Panel><Eyebrow>LEGENDARY EXPEDITIONS</Eyebrow>
      <Heading>A little mystery awaits.</Heading>
      <Copy>Find three clues across 25 km of saved adventures, then meet a Legendary or Mythical Pokemon.</Copy>
      <Copy small>{Object.values(expeditions.trails).reduce((sum, trail) => sum + Math.floor(trail.meters / 25000) - trail.claimed, 0)} encounters waiting</Copy>
      <Button title="Explore expeditions" onPress={() => router.push('/expeditions')} />
    </Panel>
    {!journal ? <Panel>
      <Heading>A fresh page</Heading>
      <Copy>Link your watch through Zepp or import a JSON export to see your Pokemon, journeys and missions here.</Copy>
      <Button title="Sync my journal" onPress={() => router.push('/import')} />
    </Panel> : <>
      <View style={styles.row}>
        <Panel style={{ flex: 1, minWidth: 130 }}><Text style={styles.stat}>{dexEntries(journal).length}</Text><Copy>Pokemon acquired</Copy></Panel>
        <Panel style={{ flex: 1, minWidth: 130 }}><Text style={styles.stat}>{badges}</Text><Copy>Badges earned</Copy></Panel>
      </View>
      <Panel>
        <Eyebrow>SAVED ADVENTURES</Eyebrow>
        <Text style={styles.stat}>{km(total)}</Text>
        <Copy>{runs.length} completed adventures kept on this phone</Copy>
        <Copy small>Last watch snapshot: {new Date(journal.snapshot.capturedAt).toLocaleString()}</Copy>
        <Button title="View missions" onPress={() => router.push('/missions')} secondary />
      </Panel>
      {journal.snapshot.active && <Panel>
        <Eyebrow>ON YOUR WATCH / LAST SYNC</Eyebrow>
        <Copy color={colors.ink}>{recordForm(journal.routes[journal.snapshot.active.route], journal.snapshot.active)}</Copy>
        <Copy>{km(journal.snapshot.active.meters)} · {duration(journal.snapshot.active.elapsedSeconds)}</Copy>
        <Copy small>This is a saved snapshot. Continue the adventure on your watch, then sync through Zepp.</Copy>
      </Panel>}
      <Heading>Personal bests</Heading>
      {(['distance', 'elapsed', 'hatch'] as const).map(metric => {
        const record = bests[metric]
        const label = { distance: 'Furthest adventure', elapsed: 'Longest adventure', hatch: 'Fastest 5 km hatch' }[metric]
        const pokemon = record ? recordForm(journal.routes[record.route], record) : 'Egg'
        return <Panel key={metric}>
          <Eyebrow>{label.toUpperCase()}</Eyebrow>
          {record ? <View style={styles.row}>
            <Sprite name={pokemon} shiny={record.shiny} size={72} />
            <View style={{ flex: 1 }}><Copy color={colors.ink}>{record.shiny ? 'Shiny ' : ''}{pokemon}</Copy>
              <Text style={styles.stat}>{metric === 'distance' ? km(record.meters) : duration(metric === 'elapsed' ? record.elapsedSeconds : record.hatchSeconds)}</Text></View>
          </View> : <Copy>No record yet. Finish an adventure to set one.</Copy>}
        </Panel>
      })}
      <Heading>Recent adventures</Heading>
      {!runs.length && <Copy>Completed adventures will appear after you save on your watch and sync through Zepp.</Copy>}
      {runs.slice(0, 20).map(run => <Panel key={run.id}>
        <View style={styles.row}><Sprite name={recordForm(run.family, run.record)} shiny={run.record.shiny} size={64} />
          <View style={{ flex: 1 }}><Copy color={colors.ink}>{run.record.shiny ? 'Shiny ' : ''}{recordForm(run.family, run.record)}</Copy>
            <Copy small>{new Date(run.record.finishedAt).toLocaleString()}</Copy></View></View>
        <Copy>{km(run.record.meters)} · {duration(run.record.elapsedSeconds)}</Copy>
        <Copy small>Average pace: {averagePace(run.record.elapsedSeconds, run.record.meters)}</Copy>
      </Panel>)}
      <Copy small>Showing the latest 20 imported runs. The watch export keeps the latest run per family and personal bests; older overwritten runs are not included. Import regularly to grow your phone history.</Copy>
    </>}
  </Screen>
}
