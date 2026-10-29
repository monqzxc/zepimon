import { useState } from 'react'
import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../store'
import { expeditionEncounter, expeditionKey } from '../expeditions'
import type { Trail } from '../expeditions'
import { QUEST_SESSIONS, QUEST_SESSION_METERS, distanceLeg, encounterReady, questSessions, trailUnlocked } from '../expedition-quest'
import { readyToBattle, readyToCapture } from '../expedition-encounter'
import type { ActiveEncounter } from '../expedition-encounter'
import { clueMilestones, expeditionGoal } from '../generated/expedition.js'
import { km } from '../journal'
import { pokemonType } from '../catalog'
import { useReducedMotion } from '../games/hooks'
import { GameScreenContext } from '../games/fullscreen'
import { useImmersive } from '../games/useImmersive'
import { LegendaryTrial } from '../games/LegendaryTrial'
import { LegendaryChamber } from '../games/LegendaryChamber'
import { LegendaryBattle } from '../games/LegendaryBattle'
import { ResonanceTrial } from '../games/ResonanceTrial'
import { walkingBonus } from '../games/adventure'
import { ShrineLanterns } from '../games/ShrineLanterns'
import { ArcadeAchievements } from '../games/ArcadeAchievements'
import { KIND_NAMES, trialFor } from '../games/trials'
import { questTheme } from '../games/lanterns'
import { canRevisit, caughtLegendaries, revisitKey, revisitRooms, roomLine } from '../games/revisits'
import { OverworldSprite } from '../games/OverworldSprite'
import { Button, Copy, Eyebrow, HabitatScene, Heading, Panel, Screen, Title, colors, gradient, styles, useTheme } from '../ui'
import { LegendaryGate } from '../LegendaryGate'

const stories: Record<string, { title: string, clues: string[] }> = {
  Articuno: { title: 'The shimmering feather', clues: ['A frosted feather rests beside the trail.', 'Wing-shaped shadows sweep across the snow.', 'Articuno lands in a quiet snowy clearing.'] },
  Suicune: { title: 'The glowing spring', clues: ['A tiny ripple glows in a still pool.', 'Shining pawprints lead deeper into the woods.', 'Suicune waits beside a crystal-clear spring.'] },
  Rayquaza: { title: 'The sky relic', clues: ['A small green crystal hums in your pocket.', 'A winding silhouette slips between the clouds.', 'The restored relic calls Rayquaza down from the sky.'] },
  Mewtwo: { title: 'The lost research journal', clues: ['A torn journal page floats above the path.', 'A familiar outline glows between strange symbols.', 'Mewtwo steps out of the abandoned research garden.'] }
}
const storyOf = (name: string) => stories[name] || { title: 'A whisper on the trail',
  clues: [`A curious trace leads toward a ${pokemonType(name)} habitat.`, 'A shy silhouette watches from a quiet hiding place.', `${name} waits at the end of the trail.`] }

// A battle keeps its own copy of the Legendary, so the screen stays on it after the catch claims the encounter. A trial keeps
// the rooms picked when it opened, so a record saved mid-trial never changes them. The revisit steps are Shrine Revisits:
// practice for a Legendary already caught, outside the expedition (src/games/revisits.ts).
type Step = { kind: 'overview' } | { kind: 'lanterns' } | { kind: 'chamber', key: string, index: number }
  | { kind: 'trial', key: string, index: number, trial: ReturnType<typeof trialFor> }
  | { kind: 'battle', key: string, index: number, foe: { name: string, shiny: boolean } }
  | { kind: 'resonance', key: string, index: number }
  | { kind: 'revisit-rooms', name: string, shiny: boolean }
  | { kind: 'revisit-trial', name: string, shiny: boolean, room: string, trial: ReturnType<typeof trialFor> }
  | { kind: 'rematch', name: string, shiny: boolean }

// Legendary Expeditions. Three ways open the next encounter: 25 km of saved walks and runs, the Expedition Quest
// (three saved sessions and a shrine challenge) or arcade achievement points; the last two give an Expedition Permit.
// Every encounter then runs trial → chamber (where the Shiny roll is revealed and may be reset) → Resonance Trial (four
// seals in an arena on the Safari Zone's ground; src/games/ResonanceTrial.tsx) → battle → catch, and only a successful
// catch adds the Legendary to the Dex. Shrine Revisits replay a caught Legendary's trial rooms or battle
// as practice, with no permit, distance or quest; they save only rooms' best moves and rematch wins.
export default function ExpeditionsScreen() {
  useTheme()
  const store = useJournal()
  const { journal, expeditions, quest, encounters, progress, buddy } = store
  const reduced = useReducedMotion()
  const [step, setStep] = useState<Step>({ kind: 'overview' })
  const [friend, setFriend] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  // Full screen for the trial (an expedition's or a Shrine Revisit's), as in the arcade: hides the header and status bar,
  // and the back button leaves it first. Leaving the trial for the chamber, the room picker or the overview ends it.
  const playing = step.kind === 'trial' || step.kind === 'revisit-trial'
  const { screen, full, overlay } = useImmersive(playing, 'header')
  const partner = buddy ? { name: buddy.replace(/^Shiny /, ''), shiny: buddy.startsWith('Shiny ') } : { name: 'Pikachu', shiny: false }
  const trails = Object.entries(expeditions.trails).sort((a, b) => a[1].startedAt - b[1].startedAt)
  const pending = trails.reduce((sum, [key, trail]) => sum + trailUnlocked(quest, key, trail) - trail.claimed, 0)
  const currentKey = journal?.snapshot.expedition ? expeditionKey(journal.snapshot.expedition) : ''
  const selected = trails.find(([key, trail]) => encounterReady(quest, key, trail)) || trails.find(([key]) => key === currentKey) || trails.at(-1)

  async function act(task: () => Promise<void>, then?: () => void) {
    setBusy(true); setMessage('')
    try { await task(); then?.() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save that. Try again.') }
    finally { setBusy(false) }
  }
  const leave = (note: string) => { setStep({ kind: 'overview' }); setMessage(note) }
  const enterChamber = (key: string, index: number) => act(() => store.openChamber(key, index), () => setStep({ kind: 'chamber', key, index }))
  // A one-room shrine (the Shattered Star's island) skips the room picker.
  const playRoom = (name: string, shiny: boolean, room: string) => {
    setMessage('')
    setStep({ kind: 'revisit-trial', name, shiny, room, trial: { ...trialFor(name, store.trialRecords), stages: [room] } })
  }
  const revisit = (name: string, shiny: boolean) => {
    const rooms = revisitRooms(name)
    if (rooms.length === 1) playRoom(name, shiny, rooms[0])
    else { setMessage(''); setStep({ kind: 'revisit-rooms', name, shiny }) }
  }

  let content: ReactNode = null
  if ((step.kind === 'revisit-rooms' || step.kind === 'revisit-trial' || step.kind === 'rematch') && !canRevisit(expeditions.dex, step.name, step.shiny)) {
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
          if (single) leave(note)
          else { setStep({ kind: 'revisit-rooms', name, shiny }); setMessage(note) }
        })
      }} />
  } else if (step.kind === 'rematch') {
    const { name, shiny } = step
    // A rematch never calls befriend: a held ball only counts a rematch win.
    content = <LegendaryBattle key={revisitKey(name, shiny)} rematch foe={{ name, shiny }} partner={partner} number={0} reduced={reduced}
      onCaught={() => store.recordRematchWin(name, shiny)} onLeave={() => leave('')} onDone={() => leave('')} />
  } else if (step.kind === 'lanterns') {
    content = <ShrineLanterns number={quest.number} busy={busy} onLeave={() => leave('')}
      onSolved={() => { void act(store.completeQuestChallenge, () => leave('Shrine challenge complete! It counts toward this Expedition Quest.')) }} />
  } else if (step.kind === 'battle') {
    content = <LegendaryBattle foe={step.foe} partner={partner} number={step.index + 1} reduced={reduced}
      onCaught={() => store.befriend(step.key, step.index)} onLeave={() => setStep({ kind: 'chamber', key: step.key, index: step.index })}
      onDone={() => { setFriend((step.foe.shiny ? 'Shiny ' : '') + step.foe.name); setStep({ kind: 'overview' }) }} />
  } else if (step.kind !== 'overview') {
    const trail = expeditions.trails[step.key]
    const encounter = encounters[step.key]
    const number = step.index + 1
    if (!trail || trail.claimed !== step.index) content = null
    else if (step.kind === 'resonance') {
      const { key, index } = step
      if (encounter?.index === index && readyToBattle(encounter)) {
        content = <ResonanceTrial key={`${key}:${index}`} encounter={encounter} number={number} partner={partner} reduced={reduced} busy={busy} error={message}
          weekKm={walkingBonus(progress).km} onStart={() => { void act(() => store.startResonance(key, index)) }}
          onSeal={seal => store.activateSeal(key, index, seal)} onStabilize={() => { void act(() => store.stabilizeResonance(key, index)) }}
          onCapture={() => { if (readyToCapture(encounter)) setStep({ kind: 'battle', key, index, foe: { name: encounter.name, shiny: encounter.shiny } }) }}
          onLeave={() => { setMessage(''); setStep({ kind: 'chamber', key, index }) }} />
      }
    } else if (step.kind === 'trial') {
      const { key, index } = step
      content = <LegendaryTrial name={expeditionEncounter(trail, index).name} partner={partner} reduced={reduced} busy={busy} error={message}
        trial={step.trial} checkpoint={encounter?.index === index ? encounter.checkpoint : undefined}
        onCheckpoint={run => store.saveTrialCheckpoint(key, index, run)}
        onLeave={run => {
          leave('You left the trial. The encounter is still waiting for you.')
          if (!encounter?.trial) store.saveTrialCheckpoint(key, index, run).catch(() => setMessage('You left the trial, but your place in it could not be saved. The encounter is still waiting for you.'))
        }}
        onSolved={results => { void act(async () => { await store.finishTrial(key, index, results); await store.openChamber(key, index) },
          () => setStep({ kind: 'chamber', key, index })) }} />
    } else if (encounter?.index === step.index && encounter.shiny !== null) {
      content = <LegendaryChamber encounter={encounter as ActiveEncounter & { shiny: boolean }} number={number} reduced={reduced} busy={busy}
        onBattle={() => {
          // The catch opens once the Resonance Trial is stabilized; until then the chamber leads into the trial.
          if (readyToCapture(encounter)) setStep({ kind: 'battle', key: step.key, index: step.index, foe: { name: encounter.name, shiny: encounter.shiny } })
          else if (readyToBattle(encounter)) { setMessage(''); setStep({ kind: 'resonance', key: step.key, index: step.index }) }
        }}
        onReset={discardShiny => { void act(() => store.resetEncounter(step.key, step.index, discardShiny)) }}
        onSettle={() => { void act(() => store.finishReset(step.key, step.index)) }}
        onLeave={() => leave('You left the chamber. The same result will be waiting when you return.')} />
    }
    if (!content) content = <Panel><Copy>This encounter is no longer waiting.</Copy><Button title="Back to Expeditions" onPress={() => leave('')} /></Panel>
  }

  // The trial fills the screen without scrolling, so the map and the D-pad are on screen together, as in the Safari Zone.
  return <Screen key={step.kind} fill={playing || step.kind === 'resonance'} full={full} edge={overlay}><GameScreenContext.Provider value={screen}>
    {content ?? <>
      {/* The header is the inside of the Legendary Gate, showing what waits as the gate does on Home. */}
      <LegendaryGate variant="banner" title="Follow a little mystery.">
        <Copy color={colors.onBrand}>Walk 25 km, finish an Expedition Quest or earn arcade points. Then clear the shrine trial and catch the Legendary waiting inside.</Copy>
      </LegendaryGate>
      {!!friend && <Panel><Heading>Gotcha!</Heading><Copy color={colors.gold}>{friend} is now in your Dex.</Copy>
        <Button title="View my new friend" onPress={() => router.push({ pathname: '/pokemon', params: { name: friend.replace(/^Shiny /, '') } })} /></Panel>}
      {!!message && <Copy color={colors.gold}>{message}</Copy>}
      {pending > 0 && <Panel><Copy color={colors.gold}>{pending} encounter{pending === 1 ? '' : 's'} ready to meet. Take your time: they will wait.</Copy></Panel>}
      {selected && selected[1].claimed < 4000 ? <Encounter key={`${selected[0]}:${selected[1].claimed}`} trailKey={selected[0]} trail={selected[1]}
        encounter={encounters[selected[0]]?.index === selected[1].claimed ? encounters[selected[0]] : undefined} busy={busy}
        onBegin={() => { setMessage(''); setStep({ kind: 'trial', key: selected[0], index: selected[1].claimed,
          trial: trialFor(expeditionEncounter(selected[1], selected[1].claimed).name, store.trialRecords) }) }}
        onChamber={() => { void enterChamber(selected[0], selected[1].claimed) }}
        onPermit={() => { void act(() => store.unlockWithPermit(selected[0]), () => setMessage('Your Expedition Permit opened the next encounter!')) }} /> :
        <Panel><Heading>{selected ? 'Every recorded trail explored' : 'Your first clue awaits'}</Heading>
          <Copy>Save an adventure on this phone, or with watch version 1.11.0 or later, to start an expedition trail. Permits from quests and arcade points open encounters on it.</Copy>
          <Button title="Sync my watch" onPress={() => router.push('/import')} /></Panel>}
      <Routes busy={busy} onLanterns={() => setStep({ kind: 'lanterns' })}
        onPermit={() => { void act(store.earnPermit, () => setMessage('Quest complete! You received an Expedition Permit.')) }}
        sessions={questSessions(quest, progress, expeditions)} leg={selected ? distanceLeg(quest, selected[0], selected[1]) : 0} />
      <ShrineRevisits busy={busy} onRevisit={revisit} onRematch={(name, shiny) => { setMessage(''); setStep({ kind: 'rematch', name, shiny }) }} />
      <ArcadeAchievements place="expeditions" />
      <Panel><Eyebrow>YOUR EXPEDITION FRIENDS</Eyebrow>
        <Copy>{Object.keys(expeditions.dex).length} Normal / Shiny discoveries kept on this phone.</Copy>
        <Button title="Open my Dex" secondary onPress={() => router.push('/dex')} />
      </Panel>
      <Copy small>Each roll in the chamber has a 1 in 100 Shiny chance. Leaving, reopening or syncing never rerolls it; only a confirmed reset does, after a 5-second wait, and only before the battle. Encounters opened before this update keep the Shiny they were already showing.</Copy>
      <Copy small>Distance counts only saved adventures, never live distance. A failed catch or leaving uses nothing up. Befriending records, quests and permits are kept on this phone; reinstalling requires befriending unlocked encounters again.</Copy>
    </>}
  </GameScreenContext.Provider></Screen>
}

function Encounter({ trailKey, trail, encounter, busy, onBegin, onChamber, onPermit }: {
  trailKey: string, trail: Trail, encounter: ActiveEncounter | undefined, busy: boolean, onBegin: () => void, onChamber: () => void, onPermit: () => void
}) {
  const { quest, trialRecords } = useJournal()
  const { name } = expeditionEncounter(trail, trail.claimed)
  const trial = trialFor(name, trialRecords)
  const meters = distanceLeg(quest, trailKey, trail)
  const ready = encounterReady(quest, trailKey, trail)
  const byPermit = ready && meters < expeditionGoal
  const shiny = encounter?.shiny === true
  const story = storyOf(name)
  const clues = byPermit ? expeditionGoal : meters
  return <Panel>
    <Eyebrow>EXPEDITION {trail.claimed + 1} / {ready ? byPermit ? 'OPENED WITH A PERMIT' : 'ENCOUNTER READY' : 'FOLLOW THE CLUES'}</Eyebrow>
    <Heading>{ready ? `${shiny ? 'Shiny ' : ''}${name}` : story.title}</Heading>
    <HabitatScene name={clues >= 5000 ? name : 'Egg'} shiny={shiny} discovery={ready ? 'revealed' : meters >= 15000 ? 'silhouette' : 'hidden'} />
    {clueMilestones.map((milestone, i) => <View key={milestone} style={{ gap: 3 }}>
      <Eyebrow>{clues >= milestone ? 'CLUE FOUND' : 'MYSTERY'} / {milestone / 1000} KM</Eyebrow>
      <Copy color={clues >= milestone ? colors.ink : colors.muted}>{clues >= milestone ? story.clues[i] : 'Keep exploring to reveal this clue.'}</Copy>
    </View>)}
    {ready ? <>
      <Copy color={colors.gold}>{encounter?.trial ? `Your trial is done. ${name} waits in the shrine chamber.` : `${trial.title} · ${KIND_NAMES[trial.kind]}: ${encounter?.checkpoint ? 'pick up the trial where you left it' : 'clear the trial'} to reach ${name}.`}</Copy>
      {!encounter?.trial && <Copy>{trial.lore}</Copy>}
      <Button title={encounter?.trial ? 'Return to the chamber' : 'Begin the trial'} loading={busy} onPress={encounter?.trial ? onChamber : onBegin} />
      {encounter?.resetPending && <Copy small>A reset is in progress. It finishes when you return to the chamber.</Copy>}
    </> : <>
      <Copy>Save another adventure on your watch or this phone to continue, or open this encounter early with an Expedition Permit.</Copy>
      {quest.permits > 0 && <Button title={`Use an Expedition Permit (${quest.permits} held)`} loading={busy} onPress={onPermit} />}
    </>}
  </Panel>
}

// The ways to the next encounter, side by side. Any one of them is enough.
function Routes({ sessions, leg, busy, onLanterns, onPermit }: {
  sessions: ReturnType<typeof questSessions>, leg: number, busy: boolean, onLanterns: () => void, onPermit: () => void
}) {
  const { quest } = useJournal()
  const counted = sessions.slice(0, QUEST_SESSIONS)
  const complete = quest.challenge && counted.length >= QUEST_SESSIONS
  return <>
    <Heading>Ways to your next Legendary</Heading>
    <Copy>Any one route is enough. Quests and arcade points give an Expedition Permit instead of walking the 25 km; a permit opens the same next encounter, with the same trial, battle and catch.{quest.permits ? ` Permits held: ${quest.permits}.` : ''}</Copy>
    <Panel>
      <Eyebrow>ROUTE A · DISTANCE</Eyebrow>
      <Text style={styles.stat}>{km(leg)} / 25 km</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 25, now: leg / 1000 }} style={styles.track}>
        <View style={[styles.fill, gradient(), { width: `${leg / expeditionGoal * 100}%` }]} />
      </View>
      <Copy small>{leg >= expeditionGoal ? 'Reached: your encounter is open.' : `${km(expeditionGoal - leg)} of saved walks and runs to go. Clues appear at 5 and 15 km.`}</Copy>
    </Panel>
    <Panel>
      <Eyebrow>ROUTE B · EXPEDITION QUEST {quest.number + 1}</Eyebrow>
      <Copy color={colors.ink}>{Math.min(counted.length, QUEST_SESSIONS)} / {QUEST_SESSIONS} saved sessions · shrine challenge {quest.challenge ? 'done ✓' : 'not done yet'}</Copy>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: QUEST_SESSIONS + 1, now: Math.min(counted.length, QUEST_SESSIONS) + Number(quest.challenge) }} style={styles.track}>
        <View style={[styles.fill, gradient(), { width: `${(Math.min(counted.length, QUEST_SESSIONS) + Number(quest.challenge)) / (QUEST_SESSIONS + 1) * 100}%` }]} />
      </View>
      {counted.map(run => <Copy key={run.id} small>✓ {km(run.record.meters)} · {new Date(run.record.finishedAt).toLocaleDateString()}</Copy>)}
      <Copy small>Sessions are walks or runs of at least {km(QUEST_SESSION_METERS)}, saved on your watch or this phone{quest.since === null ? ' since your expedition began' : ' since your last quest'}. Each one counts once.</Copy>
      {!quest.challenge && <Button title={`Play the shrine challenge: ${questTheme(quest.number).title}`} secondary disabled={busy} onPress={onLanterns} />}
      {complete && <Button title="Receive your Expedition Permit" loading={busy} onPress={onPermit} />}
    </Panel>
  </>
}

// Every Legendary caught on an expedition, in species order (a Shiny catch is its own row): replay its trial or battle it
// again, any time.
function ShrineRevisits({ busy, onRevisit, onRematch }: {
  busy: boolean, onRevisit: (name: string, shiny: boolean) => void, onRematch: (name: string, shiny: boolean) => void
}) {
  const { expeditions, trialRecords, rematchWins } = useJournal()
  const caught = caughtLegendaries(expeditions.dex)
  return <>
    <Heading>Shrine Revisits</Heading>
    <Copy>Come back to any Legendary you’ve caught: replay its trial rooms or battle it again. Revisits are practice. They need no permit and never change your Dex; a cleared room can only improve your best moves.</Copy>
    {caught.length ? caught.map(({ name, shiny, key }) => {
      const trial = trialFor(name, trialRecords)
      const wins = rematchWins[key] || 0
      return <Panel key={key}>
        <View style={[styles.row, { flexWrap: 'nowrap' }]}>
          <View accessible={false} importantForAccessibility="no-hide-descendants"><OverworldSprite name={name} shiny={shiny} size={66} still /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Title>{shiny ? `Shiny ${name} ✦` : name}</Title>
            <Copy small>{trial.title} · {KIND_NAMES[trial.kind]}</Copy>
            {wins > 0 && <Copy small color={colors.gold}>Rematch wins: {wins}</Copy>}
          </View>
        </View>
        <Button title="Revisit the trial" disabled={busy} onPress={() => onRevisit(name, shiny)} />
        <Button title="Battle again" secondary disabled={busy} onPress={() => onRematch(name, shiny)} />
      </Panel>
    }) : <Panel><Copy>Catch a Legendary on an expedition to revisit its shrine here.</Copy></Panel>}
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
