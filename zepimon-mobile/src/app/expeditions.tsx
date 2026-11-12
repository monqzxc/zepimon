import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useJournal } from '../store'
import { expeditionKey } from '../expeditions'
import type { Trail } from '../expeditions'
import { distanceLeg, encounterReady, trailUnlocked } from '../expedition-quest'
import { nextLegendaries, readyToBattle, resetDue } from '../expedition-encounter'
import type { ActiveEncounter } from '../expedition-encounter'
import { clueMilestones, expeditionGoal } from '../generated/expedition.js'
import { pokemonType } from '../catalog'
import { useReducedMotion } from '../games/hooks'
import { GameScreenContext } from '../games/fullscreen'
import { useImmersive } from '../games/useImmersive'
import { LegendaryTrial } from '../games/LegendaryTrial'
import { LairBattle } from '../games/LairBattle'
import { lairFor } from '../games/lair-battle'
import { walkingBonus } from '../games/adventure'
import { ShrineLanterns } from '../games/ShrineLanterns'
import { ExpeditionRoutes, useRoutes } from '../games/ExpeditionRoutes'
import { KIND_NAMES, trialFor } from '../games/trials'
import { canRevisit, journeyRoom, revisitKey, revisitRooms, roomLine } from '../games/revisits'
import { ReleaseLegendaries } from '../games/ReleaseLegendaries'
import { ShrineRevisits } from '../games/ShrineRevisits'
import { BallButton, BigName, ColorBall, SceneFrame, StatusLine } from '../games/ExpeditionParts'
import { Button, Copy, Eyebrow, HabitatScene, Heading, Icon, Panel, Screen, colors, displayFont, fonts, retro, themedStyles, useTheme } from '../ui'
import { LegendaryGate } from '../LegendaryGate'

const stories: Record<string, { title: string, clues: string[] }> = {
  Articuno: { title: 'The shimmering feather', clues: ['A frosted feather rests beside the trail.', 'Wing-shaped shadows sweep across the snow.', 'Articuno lands in a quiet snowy clearing.'] },
  Suicune: { title: 'The glowing spring', clues: ['A tiny ripple glows in a still pool.', 'Shining pawprints lead deeper into the woods.', 'Suicune waits beside a crystal-clear spring.'] },
  Rayquaza: { title: 'The sky relic', clues: ['A small green crystal hums in your pocket.', 'A winding silhouette slips between the clouds.', 'The restored relic calls Rayquaza down from the sky.'] },
  Mewtwo: { title: 'The lost research journal', clues: ['A torn journal page floats above the path.', 'A familiar outline glows between strange symbols.', 'Mewtwo steps out of the abandoned research garden.'] }
}
const storyOf = (name: string) => stories[name] || { title: 'A whisper on the trail',
  clues: [`A curious trace leads toward a ${pokemonType(name)} habitat.`, 'A shy silhouette watches from a quiet hiding place.', `${name} waits at the end of the trail.`] }

// The lair keeps its own copy of the Legendary once the battle is on (foe), so the screen stays on it after the catch
// claims the encounter; attempt enters the lair afresh after a shiny reset. A trial keeps the rooms picked when it
// opened, so a record saved mid-trial never changes them. The revisit steps are Shrine Revisits: practice for a Legendary
// already caught, outside the expedition (src/games/revisits.ts). release trades caught Legendaries for permits.
type Step = { kind: 'overview' } | { kind: 'lanterns' } | { kind: 'release' }
  | { kind: 'trial', key: string, index: number, trial: ReturnType<typeof trialFor> }
  | { kind: 'lair', key: string, index: number, attempt: number, foe?: { name: string, shiny: boolean } }
  | { kind: 'revisit-rooms', name: string, shiny: boolean }
  | { kind: 'revisit-trial', name: string, shiny: boolean, room: string, trial: ReturnType<typeof trialFor>, journey?: boolean }
  | { kind: 'revisit-lair', name: string, shiny: boolean, attempt: number }

// The overview is three tabs, each about a screen: Expedition (the gate, the encounter and its clues, one action), Routes
// (the ways to the next encounter, src/games/ExpeditionRoutes.tsx) and Shrines (Shrine Revisits and your friends).
type Tab = 'expedition' | 'routes' | 'shrines'
const TABS: [Tab, string][] = [['expedition', 'Expedition'], ['routes', 'Routes'], ['shrines', 'Shrines']]

// Legendary Expeditions. Three ways open the next encounter: 25 km of saved walks and runs, the Expedition Quest
// (three saved sessions and a shrine challenge), achievement points (arcade and running) or running tickets; all but
// distance give an Expedition Permit.
// Every encounter then runs one way, with no stop in between: trial → a one-way portal into the Legendary's lair, a room
// from Pokemon Emerald where it waits at its real size (src/games/lairs.ts; coming in shows whether it is Shiny) → the
// battle, right there in the lair (src/games/LairBattle.tsx; until your first move, stepping back onto the portal is the
// shiny reset, met anew right there) → catch, and only a successful catch adds the Legendary to the Dex. Leaving at any
// point keeps its place, and coming back picks up where it was. Shrine Revisits replay a caught Legendary's trial rooms
// or battle as practice, with no permit, distance or quest; they save only rooms' best moves and rematch wins. Caught
// Legendaries can be released for a permit each (src/games/ReleaseLegendaries.tsx), to be met again on a later expedition.
export default function ExpeditionsScreen() {
  useTheme()
  const store = useJournal()
  const { journal, expeditions, quest, encounters, progress, buddy } = store
  const reduced = useReducedMotion()
  const [step, setStep] = useState<Step>({ kind: 'overview' })
  const [tab, setTab] = useState<Tab>('expedition')
  const [friend, setFriend] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // Full screen for the trial and the lair (an expedition's or a Shrine Revisit's), as in the arcade: hides the header and
  // status bar, and the back button leaves it first. It carries on from the trial into the lair; the room picker or the
  // overview ends it.
  const playing = step.kind === 'trial' || step.kind === 'revisit-trial' || step.kind === 'lair' || step.kind === 'revisit-lair'
  const { screen, full, overlay } = useImmersive(playing, 'header')
  const partner = buddy ? { name: buddy.replace(/^Shiny /, ''), shiny: buddy.startsWith('Shiny ') } : { name: 'Pikachu', shiny: false }
  const trails = Object.entries(expeditions.trails).sort((a, b) => a[1].startedAt - b[1].startedAt)
  const pending = trails.reduce((sum, [key, trail]) => sum + trailUnlocked(quest, key, trail) - trail.claimed, 0)
  const currentKey = journal?.snapshot.expedition ? expeditionKey(journal.snapshot.expedition) : ''
  const selected = trails.find(([key, trail]) => encounterReady(quest, key, trail)) || trails.find(([key]) => key === currentKey) || trails.at(-1)
  // Each trail's next Legendary: never one already caught or waiting on another trail.
  const names = nextLegendaries({ expeditions, quest, encounters })

  async function act(task: () => Promise<void>, then?: () => void) {
    setBusy(true); setMessage('')
    try { await task(); then?.() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save that. Try again.') }
    finally { setBusy(false) }
  }
  const leave = (note: string) => { setStep({ kind: 'overview' }); setMessage(note) }
  const enterLair = (key: string, index: number) => act(() => store.enterLair(key, index), () => setStep({ kind: 'lair', key, index, attempt: 0 }))
  // A one-room shrine (the Shattered Star's island) skips the room picker.
  const playRoom = (name: string, shiny: boolean, room: string, journey = false) => {
    setMessage('')
    setStep({ kind: 'revisit-trial', name, shiny, room, trial: { ...trialFor(name, store.trialRecords), stages: [room] }, journey })
  }
  // A revisit's journey: the trial room, then the one-way portal into the lair for a rematch. Practice all the way: nothing is caught.
  const journey = (name: string, shiny: boolean) => playRoom(name, shiny, journeyRoom(name, store.trialRecords), true)
  const enterPracticeLair = (name: string, shiny: boolean) => { setMessage(''); setStep({ kind: 'revisit-lair', name, shiny, attempt: 0 }) }
  const revisit = (name: string, shiny: boolean) => {
    const rooms = revisitRooms(name)
    if (rooms.length === 1) playRoom(name, shiny, rooms[0])
    else { setMessage(''); setStep({ kind: 'revisit-rooms', name, shiny }) }
  }

  let content: ReactNode = null
  if ((step.kind === 'revisit-rooms' || step.kind === 'revisit-trial' || step.kind === 'revisit-lair')
    && !canRevisit(expeditions.dex, step.name, step.shiny)) {
    content = <Panel><Copy>Catch this Legendary on an expedition to revisit its shrine.</Copy><Button title="Back to Expeditions" onPress={() => leave('')} /></Panel>
  } else if (step.kind === 'revisit-rooms') {
    content = <RevisitRooms name={step.name} shiny={step.shiny} message={message} onRoom={room => playRoom(step.name, step.shiny, room)} onBack={() => leave('')} />
  } else if (step.kind === 'revisit-trial') {
    const { name, shiny, room } = step
    const single = revisitRooms(name).length === 1
    // Practice is never saved mid-room: leaving drops the run, and only a clear writes its moves (the lower count is kept).
    content = <LegendaryTrial key={room} practice name={name} partner={partner} reduced={reduced} busy={busy} error={message}
      trial={step.trial} checkpoint={undefined} onCheckpoint={() => Promise.resolve()} onLeave={() => leave('')}
      onSolved={results => {
        const moves = results[room]
        const best = Math.min(store.trialRecords[room] ?? moves, moves)
        void act(() => store.recordPracticeClear(name, shiny, results), () => {
          const note = `Room cleared in ${moves} moves (best ${best}).`
          // On a journey the room's last door is the portal: straight on into the lair.
          if (step.journey) { setStep({ kind: 'revisit-lair', name, shiny, attempt: 0 }); setMessage('') }
          else if (single) leave(note)
          else { setStep({ kind: 'revisit-rooms', name, shiny }); setMessage(note) }
        })
      }} />
  } else if (step.kind === 'revisit-lair') {
    const { name, shiny, attempt } = step
    // The real lair and battle with nothing saved but a rematch win: the portal holds, and a held ball never calls befriend.
    content = <LairBattle key={`${revisitKey(name, shiny)}:${attempt}`} practice engaged foe={{ name, shiny }} partner={partner}
      reduced={reduced} busy={false} error="" weekKm={walkingBonus(progress).km}
      onEngage={() => Promise.resolve()} onReset={() => Promise.resolve()} onCaught={() => store.recordRematchWin(name, shiny)}
      onDone={() => leave('')}
      onLeave={() => leave(`You left ${shiny ? 'the Shiny ' : ''}${name}’s lair. Revisit it any time.`)} />
  } else if (step.kind === 'release') {
    content = <ReleaseLegendaries busy={busy} error={message} onBack={() => leave('')}
      onRelease={keys => { void act(() => store.releaseLegendaries(keys), () => { setTab('expedition')
        leave(`${keys.length} Legendar${keys.length === 1 ? 'y' : 'ies'} released. You received ${keys.length} Expedition Permit${keys.length === 1 ? '' : 's'}.`) }) }} />
  } else if (step.kind === 'lanterns') {
    content = <ShrineLanterns number={quest.number} busy={busy} onLeave={() => leave('')}
      onSolved={() => { void act(store.completeQuestChallenge, () => leave('Shrine challenge complete! It counts toward this Expedition Quest.')) }} />
  } else if (step.kind !== 'overview') {
    const trail = expeditions.trails[step.key]
    const encounter = encounters[step.key]
    if (step.kind === 'lair') {
      const { key, index, attempt } = step
      // The encounter as saved, or the copy kept once the battle is on, which outlives the claim.
      const foe = step.foe ?? (trail?.claimed === index && encounter?.index === index && readyToBattle(encounter) ? { name: encounter.name, shiny: encounter.shiny } : null)
      if (foe) {
        content = <LairBattle key={`${key}:${index}:${attempt}`} foe={foe} engaged={!!encounter?.engaged || !!step.foe} partner={partner} reduced={reduced}
          busy={busy} error={message} weekKm={walkingBonus(progress).km}
          onEngage={() => { setStep(current => current.kind === 'lair' ? { ...current, foe } : current); return store.engageLegendary(key, index) }}
          // The shiny reset at the portal: saved in one step, then the lair is entered afresh with the new meeting.
          onReset={async discardShiny => { setMessage(''); try { await store.resetLair(key, index, discardShiny); setStep({ kind: 'lair', key, index, attempt: attempt + 1 }) }
            catch (error) { setMessage(error instanceof Error ? error.message : 'Could not reset. Try again.'); throw error } }}
          onCaught={() => { setStep(current => current.kind === 'lair' ? { ...current, foe } : current); return store.befriend(key, index) }}
          onDone={() => { setFriend((foe.shiny ? 'Shiny ' : '') + foe.name); setStep({ kind: 'overview' }) }}
          onLeave={() => leave(`You left the ${lairFor(foe.name).label}. ${foe.shiny ? 'The Shiny ' : ''}${foe.name} will be waiting just as it is.`)} />
      }
    } else if (step.kind === 'trial' && trail?.claimed === step.index) {
      const { key, index } = step
      content = <LegendaryTrial name={names[key]} partner={partner} reduced={reduced} busy={busy} error={message}
        trial={step.trial} checkpoint={encounter?.index === index ? encounter.checkpoint : undefined}
        onCheckpoint={run => store.saveTrialCheckpoint(key, index, run)}
        onLeave={run => {
          leave('You left the trial. The encounter is still waiting for you.')
          if (!encounter?.trial) store.saveTrialCheckpoint(key, index, run).catch(() => setMessage('You left the trial, but your place in it could not be saved. The encounter is still waiting for you.'))
        }}
        onSolved={results => { void act(async () => { await store.finishTrial(key, index, results); await store.enterLair(key, index) },
          () => setStep({ kind: 'lair', key, index, attempt: 0 })) }} />
    }
    if (!content) content = <Panel><Copy>This encounter is no longer waiting.</Copy><Button title="Back to Expeditions" onPress={() => leave('')} /></Panel>
  }

  // The trial fills the screen without scrolling, so the map and the D-pad are on screen together, as in the Safari Zone.
  return <Screen key={step.kind} fill={playing || step.kind === 'release'} full={full} edge={overlay}><GameScreenContext.Provider value={screen}>
    {content ?? <>
      <View accessibilityRole="tablist" style={look.tabs}>{TABS.map(([id, label]) =>
        <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => { setTab(id); setMessage('') }}
          style={[look.tab, tab === id && look.tabOn]}>
          <Text style={[look.tabText, tab === id && { color: colors.ink }]}>{label}</Text>
        </Pressable>)}</View>
      {!!friend && <Panel><Heading>Gotcha!</Heading><Copy color={colors.gold}>{friend} is now in your Dex.</Copy>
        <Button title="View my new friend" onPress={() => router.push({ pathname: '/pokemon', params: { name: friend.replace(/^Shiny /, '') } })} /></Panel>}
      {!!message && <Copy color={colors.gold}>{message}</Copy>}
      {tab === 'expedition' && <>
        {/* The inside of the Legendary Gate, showing what waits as the gate does on Home. */}
        <LegendaryGate variant="banner" />
        {pending > 1 && <Copy color={colors.gold}>{pending} encounters ready. They will wait.</Copy>}
        {selected && selected[1].claimed < 4000 ? <Encounter key={`${selected[0]}:${selected[1].claimed}`} trailKey={selected[0]} trail={selected[1]} name={names[selected[0]]}
          encounter={encounters[selected[0]]?.index === selected[1].claimed ? encounters[selected[0]] : undefined} busy={busy}
          onBegin={() => { setMessage(''); setStep({ kind: 'trial', key: selected[0], index: selected[1].claimed,
            trial: trialFor(names[selected[0]], store.trialRecords) }) }}
          onEnter={() => { void enterLair(selected[0], selected[1].claimed) }}
          onRoutes={() => setTab('routes')}
          onPermit={() => { void act(() => store.unlockWithPermit(selected[0]), () => setMessage('Your permit opened the next encounter!')) }} /> :
          <Panel><Heading>{selected ? 'Every trail explored' : 'Your first clue awaits'}</Heading>
            <Copy>Save an adventure to start a trail.</Copy>
            <Button title="Sync my watch" onPress={() => router.push('/import')} /></Panel>}
      </>}
      {tab === 'routes' && <ExpeditionRoutes busy={busy} leg={selected ? distanceLeg(quest, selected[0], selected[1]) : 0}
        onLanterns={() => setStep({ kind: 'lanterns' })}
        onQuestPermit={() => { void act(store.earnPermit, () => setMessage('Quest complete! You received an Expedition Permit.')) }} />}
      {tab === 'shrines' && <>
        <Pressable accessibilityRole="button" accessibilityLabel={`${Object.keys(expeditions.dex).length} Legendaries caught. Open my Dex`}
          onPress={() => router.push('/dex')} style={({ pressed }) => [look.friends, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={look.friendsCount}>{Object.keys(expeditions.dex).length}</Text>
          <Text style={look.friendsText}>caught · Open my Dex</Text>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Pressable>
        <ShrineRevisits busy={busy} onJourney={journey} onRematch={enterPracticeLair} onRevisit={revisit}
          onRelease={() => { setMessage(''); setStep({ kind: 'release' }) }} />
      </>}
    </>}
  </GameScreenContext.Provider></Screen>
}

function Encounter({ trailKey, trail, name, encounter, busy, onBegin, onEnter, onPermit, onRoutes }: {
  trailKey: string, trail: Trail, name: string, encounter: ActiveEncounter | undefined, busy: boolean, onBegin: () => void, onEnter: () => void,
  onPermit: () => void, onRoutes: () => void
}) {
  const { quest, trialRecords } = useJournal()
  const trial = trialFor(name, trialRecords)
  const meters = distanceLeg(quest, trailKey, trail)
  const { closest } = useRoutes(meters)
  const ready = encounterReady(quest, trailKey, trail)
  const byPermit = ready && meters < expeditionGoal
  const shiny = encounter?.shiny === true
  const story = storyOf(name)
  const clues = byPermit ? expeditionGoal : meters
  const found = clueMilestones.filter(milestone => clues >= milestone).length
  const lair = lairFor(name).label
  // After walking out, the entrance stays sealed for a moment (src/expedition-encounter.ts RESET_COOLDOWN).
  const [now, setNow] = useState(() => Date.now())
  const sealedFor = encounter?.resetPending && !resetDue(encounter, now) ? Math.max(0, encounter.nextResetAllowedAt - now) / 1000 : 0
  useEffect(() => {
    if (!encounter?.resetPending) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [encounter?.resetPending])
  const enter = encounter?.engaged ? `Return to the ${lair}`
    : sealedFor > 0 ? `Sealed · ${sealedFor.toFixed(1)} s` : `Enter the ${lair}`
  // One card: the status, the name, the habitat and the clues as three steps; then the one thing to do next.
  return <>
    <Panel style={{ gap: 12 }}>
      <StatusLine eyebrow={`EXPEDITION ${trail.claimed + 1}`} status={ready ? byPermit ? 'OPENED WITH A PERMIT' : 'ENCOUNTER READY' : 'FOLLOW THE CLUES'} />
      <BigName>{ready ? `${shiny ? 'Shiny ' : ''}${name}` : story.title}</BigName>
      <SceneFrame>
        <HabitatScene name={clues >= 5000 ? name : 'Egg'} shiny={shiny} discovery={ready ? 'revealed' : meters >= 15000 ? 'silhouette' : 'hidden'} />
      </SceneFrame>
      <View accessible accessibilityLabel={`${found} of ${clueMilestones.length} clues found. ${found ? story.clues[found - 1] : ''}`} style={{ gap: 8 }}>
        <View style={look.steps}>{clueMilestones.map((milestone, i) => <View key={milestone} style={look.step}>
          {i > 0 && <View style={[look.rail, i < found && { backgroundColor: colors.edge }]} />}
          <ColorBall size={26} dim={i >= found} />
          <Text style={[look.stepText, i >= found && { color: colors.muted }]}>{milestone / 1000} km</Text>
        </View>)}</View>
        <Text style={look.clue}>{found ? story.clues[found - 1] : 'No clues yet. Keep walking.'}</Text>
      </View>
    </Panel>
    {ready ? <>
      <BallButton title={encounter?.trial ? enter : encounter?.checkpoint ? 'Continue the trial' : 'Begin the trial'} loading={busy} disabled={sealedFor > 0}
        onPress={encounter?.trial ? onEnter : onBegin} />
      {!encounter?.trial && <Text style={look.under}>{trial.title} · {KIND_NAMES[trial.kind]}</Text>}
    </> : <>
      {quest.permits > 0 && <BallButton title={`Use a permit · ${quest.permits} held`} loading={busy} onPress={onPermit} />}
      <Pressable accessibilityRole="button" accessibilityLabel={`Closest route: ${closest.name}, ${closest.value}. See all routes`} onPress={onRoutes}
        style={({ pressed }) => [look.friends, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={look.friendsText}><Text style={{ color: colors.edge }}>Closest · </Text>{closest.name}</Text>
        <Text style={look.closestValue}>{closest.value}</Text>
        <Icon name="chevron" size={18} color={colors.muted} />
      </Pressable>
    </>}
  </>
}

// A maze shrine's rooms with their best moves and par. A clear comes back here with how it went.
function RevisitRooms({ name, shiny, message, onRoom, onBack }: {
  name: string, shiny: boolean, message: string, onRoom: (room: string) => void, onBack: () => void
}) {
  const { trialRecords } = useJournal()
  const trial = trialFor(name, trialRecords)
  return <Panel>
    <Eyebrow>SHRINE REVISIT · {KIND_NAMES[trial.kind].toUpperCase()}</Eyebrow>
    <Heading>{trial.title}</Heading>
    <Copy>Pick a room of {shiny ? 'Shiny ' : ''}{name}’s shrine to practice. A clear saves your best moves; nothing else changes.</Copy>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: colors.gold, fontSize: 15, lineHeight: 22 }}>{message}</Text>}
    {revisitRooms(name).map(room => <Button key={room} title={roomLine(room, trialRecords)} secondary onPress={() => onRoom(room)} />)}
    <Button title="Back to Expeditions" onPress={onBack} />
  </Panel>
}

const look = themedStyles(() => ({
  tabs: { flexDirection: 'row', padding: 4, borderRadius: retro() ? 10 : 999, backgroundColor: colors.sunken },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: retro() ? 8 : 999 },
  tabOn: { backgroundColor: colors.panel, boxShadow: `0px 1px 4px ${colors.shadow}` },
  tabText: { fontFamily: displayFont(fonts.heavy), color: colors.muted, fontSize: 14, lineHeight: 19 },
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  // The line back to the step before, behind the balls.
  rail: { position: 'absolute', top: 12, right: '50%', width: '100%', height: 2, backgroundColor: colors.line },
  stepText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 12, lineHeight: 16 },
  clue: { textAlign: 'center', fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 21 },
  under: { textAlign: 'center', fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  friends: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderRadius: retro() ? 10 : 22,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  friendsCount: { fontFamily: fonts.black, color: colors.ink, fontSize: 20, lineHeight: 26 },
  friendsText: { flex: 1, fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 21 },
  closestValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 15, lineHeight: 21 }
}))
