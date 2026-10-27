import { useMemo } from 'react'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../../store'
import { dexEntries, duration, km, personalBests, recordForm } from '../../journal'
import { missions } from '../../progress'
import { allAdventures } from '../../adventures'
import { AdventureCard } from '../../AdventureCard'
import { Button, Copy, Eyebrow, Habitat, Heading, Hero, IconBubble, Panel, Screen, Sprite, Title, colors, styles } from '../../ui'
import type { IconName } from '../../ui'

function StatTile({ icon, value, label }: { icon: IconName | 'pokeball', value: string | number, label: string }) {
  return <Panel style={{ flex: 1, minWidth: 140, gap: 6 }}>
    <IconBubble name={icon} size={40} />
    <Text style={styles.stat}>{value}</Text>
    <Copy small>{label}</Copy>
  </Panel>
}

// The Journal shows the latest few; All adventures lists every one.
const RECENT = 5

export default function JournalScreen() {
  const { journal, buddy, progress, error, expeditions, phoneRuns } = useJournal()
  const name = buddy?.replace(/^Shiny /, '') || 'Gible'
  const runs = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
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
        {runs.length > 0 && <Button title="View all adventures" onPress={() => router.push('/adventures')} secondary />}
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
      {runs.slice(0, RECENT).map(run => <AdventureCard key={run.id} adventure={run} />)}
      {runs.length > 0 && <Button title={`View all ${runs.length} ${runs.length === 1 ? 'adventure' : 'adventures'}`} secondary onPress={() => router.push('/adventures')} />}
      {runs.length > 0 && <Copy small>Tap an adventure for its route, stats and Pokemon. Every adventure from this phone and your watch is kept. The watch sends its last 30 with each sync, so sync at least that often.</Copy>}
    </>}
  </Screen>
}
