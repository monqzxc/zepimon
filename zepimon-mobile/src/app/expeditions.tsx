import { useState } from 'react'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../store'
import { expeditionEncounter, expeditionGoal, expeditionKey } from '../expeditions'
import type { Trail } from '../expeditions'
import { clueMilestones } from '../generated/expedition.js'
import { km } from '../journal'
import { pokemonType } from '../catalog'
import { Button, Copy, Eyebrow, HabitatScene, Heading, Panel, Screen, colors, styles } from '../ui'

const stories: Record<string, { title: string, clues: string[], actions: string[], welcome: string }> = {
  Articuno: { title: 'The shimmering feather', clues: ['A frosted feather rests beside the trail.', 'Wing-shaped shadows sweep across the snow.', 'Articuno lands in a quiet snowy clearing.'],
    actions: ['Brush snow off the feather', 'Offer a berry', 'Welcome Articuno'], welcome: 'Articuno folds its wings and settles beside you.' },
  Suicune: { title: 'The glowing spring', clues: ['A tiny ripple glows in a still pool.', 'Shining pawprints lead deeper into the woods.', 'Suicune waits beside a crystal-clear spring.'],
    actions: ['Follow the pawprints', 'Offer a berry', 'Welcome Suicune'], welcome: 'Suicune leans forward for a gentle hello.' },
  Rayquaza: { title: 'The sky relic', clues: ['A small green crystal hums in your pocket.', 'A winding silhouette slips between the clouds.', 'The restored relic calls Rayquaza down from the sky.'],
    actions: ['Lift the sky relic', 'Clear the last cloud', 'Welcome Rayquaza'], welcome: 'Rayquaza circles once, then lowers its head to greet you.' },
  Mewtwo: { title: 'The lost research journal', clues: ['A torn journal page floats above the path.', 'A familiar outline glows between strange symbols.', 'Mewtwo steps out of the abandoned research garden.'],
    actions: ['Trace the glowing symbol', 'Offer your hand', 'Welcome Mewtwo'], welcome: 'Mewtwo gives a quiet nod. A new friendship begins.' }
}

export default function ExpeditionsScreen() {
  const { journal, expeditions } = useJournal()
  const [friend, setFriend] = useState('')
  const trails = Object.entries(expeditions.trails).sort((a, b) => a[1].startedAt - b[1].startedAt)
  const pending = trails.reduce((sum, [, trail]) => sum + Math.floor(trail.meters / expeditionGoal) - trail.claimed, 0)
  const currentKey = journal?.snapshot.expedition ? expeditionKey(journal.snapshot.expedition) : ''
  const selected = trails.find(([, trail]) => trail.meters >= (trail.claimed + 1) * expeditionGoal) || trails.find(([key]) => key === currentKey) || trails.at(-1)
  return <Screen>
    <Eyebrow>LEGENDARY EXPEDITIONS</Eyebrow>
    <Heading>Follow a little mystery.</Heading>
    <Copy>Three clues. 25 km across saved walks and runs. One extraordinary new friend.</Copy>
    {!!friend && <Panel><Heading>A new friendship!</Heading><Copy color={colors.gold}>{friend} is now in your Dex.</Copy>
      <Button title="View my new friend" onPress={() => router.push({ pathname: '/pokemon', params: { name: friend.replace(/^Shiny /, '') } })} /></Panel>}
    {pending > 0 && <Panel><Copy color={colors.gold}>{pending} encounter{pending === 1 ? '' : 's'} ready to meet. Take your time — they will wait.</Copy></Panel>}
    {selected && selected[1].claimed < 4000 ? <Encounter key={`${selected[0]}:${selected[1].claimed}`} trailKey={selected[0]} trail={selected[1]} onBefriended={setFriend} /> :
      <Panel><Heading>{selected ? 'Every recorded trail explored' : 'Your first clue awaits'}</Heading>
        <Copy>Save an adventure using watch version 1.11.0 or later, then sync through Zepp. Expedition distance starts with adventures saved after the update.</Copy>
        <Button title="Sync my watch" onPress={() => router.push('/import')} /></Panel>}
    <Panel><Eyebrow>YOUR EXPEDITION FRIENDS</Eyebrow>
      <Copy>{Object.keys(expeditions.dex).length} Normal / Shiny discoveries kept on this phone.</Copy>
      <Button title="Open my Dex" secondary onPress={() => router.push('/dex')} />
    </Panel>
    <Copy small>Each 25 km unlocks another encounter while your regular buddy keeps growing. Shinies have a 1-in-50 chance. Each encounter keeps the same result when reopened or synced again.</Copy>
    <Copy small>Clues use saved adventures, not live distance. Watch progress and encounter outcomes sync through your existing account. Befriending records are kept on this phone; reinstalling requires befriending unlocked encounters again.</Copy>
  </Screen>
}

function Encounter({ trailKey, trail, onBefriended }: { trailKey: string, trail: Trail, onBefriended: (name: string) => void }) {
  const { befriend } = useJournal()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [met, setMet] = useState(false)
  const encounter = expeditionEncounter(trail, trail.claimed)
  const meters = Math.min(expeditionGoal, trail.meters - trail.claimed * expeditionGoal)
  const ready = meters >= expeditionGoal
  const story = stories[encounter.name] || {
    title: 'A whisper on the trail',
    clues: [`A curious trace leads toward a ${pokemonType(encounter.name)} habitat.`, 'A shy silhouette watches from a quiet hiding place.', `${encounter.name} comes closer to meet you.`],
    actions: ['Follow the little trail', 'Offer a berry', `Welcome ${encounter.name}`],
    welcome: `${encounter.name} brightens up. You have made a new friend!`
  }
  async function act() {
    if (busy || met) return
    if (step < 2) { setStep(step + 1); return }
    setBusy(true); setMessage('')
    try { await befriend(trailKey, trail.claimed); setMet(true); onBefriended((encounter.shiny ? 'Shiny ' : '') + encounter.name) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save your new friend. Try again.') }
    finally { setBusy(false) }
  }
  return <Panel>
    <Eyebrow>EXPEDITION {trail.claimed + 1} / {ready ? 'ENCOUNTER READY' : 'FOLLOW THE CLUES'}</Eyebrow>
    <Heading>{ready ? `${encounter.shiny ? 'Shiny ' : ''}${encounter.name}` : story.title}</Heading>
    <HabitatScene name={meters >= 5000 ? encounter.name : 'Egg'} shiny={encounter.shiny}
      discovery={ready ? 'revealed' : meters >= 15000 ? 'silhouette' : 'hidden'} />
    <Text style={styles.stat}>{km(meters)} / 25 km</Text>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 25, now: meters / 1000 }} style={{ height: 10, backgroundColor: colors.bg, borderRadius: 5, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${meters / expeditionGoal * 100}%`, backgroundColor: colors.edge }} />
    </View>
    {clueMilestones.map((milestone, i) => <View key={milestone} style={{ gap: 3 }}>
      <Eyebrow>{meters >= milestone ? 'CLUE FOUND' : 'MYSTERY'} / {milestone / 1000} KM</Eyebrow>
      <Copy color={meters >= milestone ? colors.ink : colors.muted}>{meters >= milestone ? story.clues[i] : 'Keep exploring to reveal this clue.'}</Copy>
    </View>)}
    {ready ? <>
      <Copy color={colors.gold}>{step === 0 ? 'A new friend is waiting. Approach gently.' : step === 1 ? 'It notices you and takes a little step closer.' : story.welcome}</Copy>
      <Copy small>Tap the Pokemon to say hello, then follow the three steps to befriend it. There is no timer.</Copy>
      <Button title={busy ? 'Saving your friend...' : met ? 'Friend saved' : story.actions[step]} loading={busy} disabled={busy || met} onPress={act} />
    </> : <Copy>Save another adventure on your watch and sync to continue. You can spread the distance across as many outings as you like.</Copy>}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
  </Panel>
}
