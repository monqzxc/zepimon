import { useMemo } from 'react'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../../store'
import { averagePace, dexEntries, duration, km, personalBests, recordForm } from '../../journal'
import { completedRuns, missions } from '../../progress'
import type { SavedRun } from '../../progress'
import { decodePath } from '../../phone-adventure'
import type { PhoneRun } from '../../phone-adventure'
import { RouteView } from '../../RouteView'
import { Button, Copy, Eyebrow, Habitat, Heading, Hero, IconBubble, Panel, Screen, Sprite, Title, colors, styles } from '../../ui'
import type { IconName } from '../../ui'

function StatTile({ icon, value, label }: { icon: IconName | 'pokeball', value: string | number, label: string }) {
  return <Panel style={{ flex: 1, minWidth: 140, gap: 6 }}>
    <IconBubble name={icon} size={40} />
    <Text style={styles.stat}>{value}</Text>
    <Copy small>{label}</Copy>
  </Panel>
}

// A recent adventure. Ones recorded on this phone show their route beside the Pokemon.
function RunCard({ run, phone }: { run: SavedRun, phone?: PhoneRun }) {
  const points = useMemo(() => phone ? decodePath(phone.path) : [], [phone])
  return <Panel>
    <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <View style={{ borderRadius: 18, backgroundColor: colors.sunken }}><Sprite name={recordForm(run.family, run.record)} shiny={run.record.shiny} size={64} /></View>
      <View style={{ flex: 1, gap: 2 }}><Title>{run.record.shiny ? 'Shiny ' : ''}{recordForm(run.family, run.record)}</Title>
        <Copy>{km(run.record.meters)} · {duration(run.record.elapsedSeconds)}</Copy>
        <Copy small>{phone ? 'This phone · ' : ''}{new Date(run.record.finishedAt).toLocaleString()} · Pace {averagePace(run.record.elapsedSeconds, run.record.meters)}</Copy></View>
      {phone && <View style={{ width: 84 }}><RouteView points={points} height={64} compact label={`Route of ${km(run.record.meters)}`} /></View>}
    </View>
  </Panel>
}

export default function JournalScreen() {
  const { journal, buddy, progress, error, expeditions, phoneRuns } = useJournal()
  const phoneOf = (run: SavedRun) => phoneRuns.find(item => item.record.finishedAt === run.record.finishedAt && item.family.join('>') === run.family.join('>'))
  const name = buddy?.replace(/^Shiny /, '') || 'Gible'
  const runs = completedRuns(progress)
  const total = runs.reduce((sum, run) => sum + run.record.meters, 0)
  const badges = missions(journal, progress).filter(mission => !mission.weekly && progress.unlocked[mission.id]).length
  const bests = journal ? personalBests(journal) : {}
  const waiting = Object.values(expeditions.trails).reduce((sum, trail) => sum + Math.floor(trail.meters / 25000) - trail.claimed, 0)
  return <Screen>
    <Hero eyebrow="ZEPIMON · FIELD JOURNAL" title={'Every step,\na little adventure.'} />
    {!!error && <Copy color={colors.danger}>{error}</Copy>}
    <Habitat name={name} shiny={buddy?.startsWith('Shiny ')}>
      <Eyebrow>{buddy ? 'YOUR BUDDY' : 'WELCOME'}</Eyebrow>
      <Heading>{buddy || 'Hello, explorer.'}</Heading>
      <Copy color={colors.ink}>{buddy ? 'Your trail companion. Choose another in your Dex.' : 'Bring your watch adventures along. Your collection, now with room to grow.'}</Copy>
    </Habitat>
    {journal && <View style={styles.row}>
      <StatTile icon="pokeball" value={dexEntries(journal).length} label="Pokemon acquired" />
      <StatTile icon="badge" value={badges} label="Badges earned" />
    </View>}
    <Panel>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <IconBubble name="explore" />
        <View style={{ flex: 1 }}><Eyebrow>LEGENDARY EXPEDITIONS</Eyebrow><Title>A little mystery awaits.</Title></View>
      </View>
      <Copy>Find three clues across 25 km of saved adventures, then meet a Legendary or Mythical Pokemon.</Copy>
      <Copy small color={waiting ? colors.gold : colors.muted}>{waiting} encounter{waiting === 1 ? '' : 's'} waiting</Copy>
      <Button title="Explore expeditions" onPress={() => router.push('/expeditions')} />
    </Panel>
    {!journal ? <Panel>
      <Title>A fresh page</Title>
      <Copy>Start a walk or run in the Adventure tab, or link your watch through Zepp, to see your Pokemon, journeys and missions here.</Copy>
      <Button title="Start an adventure" onPress={() => router.push('/adventure')} />
      <Button title="Sync my journal" secondary onPress={() => router.push('/import')} />
      <Button title="View missions" secondary onPress={() => router.push('/missions')} />
    </Panel> : <>
      <Panel>
        <View style={[styles.row, { flexWrap: 'nowrap' }]}>
          <IconBubble name="walk" />
          <View style={{ flex: 1 }}><Eyebrow>SAVED ADVENTURES</Eyebrow><Text style={styles.stat}>{km(total)}</Text></View>
        </View>
        <Copy>{runs.length} completed adventures kept on this phone</Copy>
        {journal.snapshot.capturedAt > 0 && <Copy small>Last watch snapshot: {new Date(journal.snapshot.capturedAt).toLocaleString()}</Copy>}
        <Button title="View missions" onPress={() => router.push('/missions')} secondary />
      </Panel>
      {journal.snapshot.active && <Panel>
        <Eyebrow>ON YOUR WATCH · LAST SYNC</Eyebrow>
        <Title>{recordForm(journal.routes[journal.snapshot.active.route], journal.snapshot.active)}</Title>
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
          {record ? <View style={[styles.row, { flexWrap: 'nowrap' }]}>
            <View style={{ borderRadius: 20, backgroundColor: colors.sunken }}><Sprite name={pokemon} shiny={record.shiny} size={72} /></View>
            <View style={{ flex: 1 }}><Copy color={colors.ink}>{record.shiny ? 'Shiny ' : ''}{pokemon}</Copy>
              <Text style={styles.stat}>{metric === 'distance' ? km(record.meters) : duration(metric === 'elapsed' ? record.elapsedSeconds : record.hatchSeconds)}</Text></View>
          </View> : <Copy>No record yet. Finish an adventure to set one.</Copy>}
        </Panel>
      })}
      <Heading>Recent adventures</Heading>
      {!runs.length && <Copy>Completed adventures appear here after you save one in the Adventure tab, or on your watch and sync through Zepp.</Copy>}
      {runs.slice(0, 20).map(run => <RunCard key={run.id} run={run} phone={phoneOf(run)} />)}
      <Copy small>Showing the latest 20 runs. Adventures recorded on this phone are all kept here. The watch export keeps the latest run per family and personal bests, so import regularly to grow your watch history.</Copy>
    </>}
  </Screen>
}
