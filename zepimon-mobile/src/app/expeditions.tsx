import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { useJournal } from '../store'
import { expeditionEncounter, expeditionKey } from '../expeditions'
import type { Trail } from '../expeditions'
import { QUEST_SESSIONS, QUEST_SESSION_METERS, distanceLeg, encounterReady, questSessions, trailUnlocked } from '../expedition-quest'
import { readyToBattle, readyToCapture, resetDue } from '../expedition-encounter'
import type { ActiveEncounter } from '../expedition-encounter'
import { clueMilestones, expeditionGoal } from '../generated/expedition.js'
import { km } from '../journal'
import { pokemonType } from '../catalog'
import { useReducedMotion } from '../games/hooks'
import { GameScreenContext } from '../games/fullscreen'
import { useImmersive } from '../games/useImmersive'
import { LegendaryTrial } from '../games/LegendaryTrial'
import { LegendaryBattle } from '../games/LegendaryBattle'
import { ResonanceTrial } from '../games/ResonanceTrial'
import { arenaFor } from '../games/resonance'
import { walkingBonus } from '../games/adventure'
import { ShrineLanterns } from '../games/ShrineLanterns'
import { ArcadeAchievements } from '../games/ArcadeAchievements'
import { RunningTickets } from '../games/RunningTickets'
import { KIND_NAMES, trialFor } from '../games/trials'
import { questTheme } from '../games/lanterns'
import { canRevisit, revisitKey, revisitRooms, roomLine } from '../games/revisits'
import { ShrineRevisits } from '../games/ShrineRevisits'
import { BallButton, BigName, FactRow, Footnote, SceneFrame, StatusLine, StatusNote } from '../games/ExpeditionParts'
import { Button, Copy, Eyebrow, HabitatScene, Heading, Panel, Screen, colors, gradient, styles, useTheme } from '../ui'
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
type Step = { kind: 'overview' } | { kind: 'lanterns' }
  | { kind: 'trial', key: string, index: number, trial: ReturnType<typeof trialFor> }
  | { kind: 'battle', key: string, index: number, foe: { name: string, shiny: boolean }, attempt: number }
  | { kind: 'resonance', key: string, index: number }
  | { kind: 'revisit-rooms', name: string, shiny: boolean }
  | { kind: 'revisit-trial', name: string, shiny: boolean, room: string, trial: ReturnType<typeof trialFor> }
  | { kind: 'rematch', name: string, shiny: boolean }

// Legendary Expeditions. Three ways open the next encounter: 25 km of saved walks and runs, the Expedition Quest
// (three saved sessions and a shrine challenge), achievement points (arcade and running) or running tickets; all but
// distance give an Expedition Permit.
// Every encounter then runs one way, with no stop in between: trial → a one-way portal into the Legendary's lair, a room
// from Pokemon Emerald where it waits (src/games/lairs.ts; coming in shows whether it is Shiny) → Resonance Trial (four
// seals in the lair; src/games/ResonanceTrial.tsx) → battle → catch, and only a successful catch adds the Legendary to
// the Dex. Leaving at any point keeps its place, and coming back picks up where it was. Shrine Revisits replay a caught Legendary's trial rooms or battle
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
  // and the back button leaves it first. Leaving the trial for the lair, the room picker or the overview ends it.
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
  const battle = (key: string, index: number, foe: { name: string, shiny: boolean }) => setStep({ kind: 'battle', key, index, foe, attempt: 0 })
  // Once the seals hold the Legendary steady, the lair goes straight on to the battle, also when coming back to it.
  const enterLair = (key: string, index: number) => {
    const encounter = encounters[key]
    if (encounter?.index === index && readyToCapture(encounter)) { setMessage(''); battle(key, index, { name: encounter.name, shiny: encounter.shiny }); return }
    return act(() => store.enterLair(key, index), () => setStep({ kind: 'resonance', key, index }))
  }
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
    // A failed catch keeps the seals on: Try again starts a fresh battle, and leaving keeps the encounter steadied.
    content = <LegendaryBattle key={step.attempt} foe={step.foe} partner={partner} number={step.index + 1} reduced={reduced}
      onCaught={() => store.befriend(step.key, step.index)}
      onRetry={() => setStep({ ...step, attempt: step.attempt + 1 })}
      onLeave={() => leave(`${step.foe.shiny ? 'The Shiny ' : ''}${step.foe.name} stays calm, its seals still on. Come back to try the catch again.`)}
      onDone={() => { setFriend((step.foe.shiny ? 'Shiny ' : '') + step.foe.name); setStep({ kind: 'overview' }) }} />
  } else if (step.kind !== 'overview') {
    const trail = expeditions.trails[step.key]
    const encounter = encounters[step.key]
    const number = step.index + 1
    if (!trail || trail.claimed !== step.index) content = null
    else if (step.kind === 'resonance') {
      const { key, index } = step
      if (encounter?.index === index && readyToBattle(encounter)) {
        const lair = arenaFor(encounter.name).label
        const foe = { name: encounter.name, shiny: encounter.shiny }
        // Stabilizing saves first, then the battle begins.
        content = encounter.resonance?.stabilized ? <Panel><Copy>{encounter.name} is steady.</Copy><Button title="Begin the battle" onPress={() => battle(key, index, foe)} /></Panel>
          : <ResonanceTrial key={`${key}:${index}:${encounter.attempt}`} encounter={encounter} number={number} partner={partner} reduced={reduced}
          busy={busy} error={message} weekKm={walkingBonus(progress).km}
          onSeal={seal => store.activateSeal(key, index, seal)} onStabilize={() => { void act(() => store.stabilizeResonance(key, index), () => battle(key, index, foe)) }}
          onLeave={() => leave(`You left the ${lair}. ${encounter.shiny ? 'The Shiny ' : ''}${encounter.name} will be waiting just as it is.`)} />
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
        onSolved={results => { void act(async () => { await store.finishTrial(key, index, results); await store.enterLair(key, index) },
          () => setStep({ kind: 'resonance', key, index })) }} />
    }
    if (!content) content = <Panel><Copy>This encounter is no longer waiting.</Copy><Button title="Back to Expeditions" onPress={() => leave('')} /></Panel>
  }

  // The trial fills the screen without scrolling, so the map and the D-pad are on screen together, as in the Safari Zone.
  return <Screen key={step.kind} fill={playing || step.kind === 'resonance'} full={full} edge={overlay}><GameScreenContext.Provider value={screen}>
    {content ?? <>
      {/* The header is the inside of the Legendary Gate, showing what waits as the gate does on Home. */}
      <LegendaryGate variant="banner" title="Follow a little mystery.">
        <Copy color={colors.onBrand}>Walk 25 km, finish an Expedition Quest or earn achievement points. Then clear the shrine trial and catch the Legendary waiting inside.</Copy>
      </LegendaryGate>
      {!!friend && <Panel><Heading>Gotcha!</Heading><Copy color={colors.gold}>{friend} is now in your Dex.</Copy>
        <Button title="View my new friend" onPress={() => router.push({ pathname: '/pokemon', params: { name: friend.replace(/^Shiny /, '') } })} /></Panel>}
      {!!message && <Copy color={colors.gold}>{message}</Copy>}
      {pending > 0 && <Panel><Copy color={colors.gold}>{pending} encounter{pending === 1 ? '' : 's'} ready to meet. Take your time: they will wait.</Copy></Panel>}
      {selected && selected[1].claimed < 4000 ? <Encounter key={`${selected[0]}:${selected[1].claimed}`} trailKey={selected[0]} trail={selected[1]}
        encounter={encounters[selected[0]]?.index === selected[1].claimed ? encounters[selected[0]] : undefined} busy={busy}
        onBegin={() => { setMessage(''); setStep({ kind: 'trial', key: selected[0], index: selected[1].claimed,
          trial: trialFor(expeditionEncounter(selected[1], selected[1].claimed).name, store.trialRecords) }) }}
        onEnter={() => { void enterLair(selected[0], selected[1].claimed) }}
        onPermit={() => { void act(() => store.unlockWithPermit(selected[0]), () => setMessage('Your Expedition Permit opened the next encounter!')) }} /> :
        <Panel><Heading>{selected ? 'Every recorded trail explored' : 'Your first clue awaits'}</Heading>
          <Copy>Save an adventure on this phone, or with watch version 1.11.0 or later, to start an expedition trail. Permits from quests and achievement points open encounters on it.</Copy>
          <Button title="Sync my watch" onPress={() => router.push('/import')} /></Panel>}
      <Routes busy={busy} onLanterns={() => setStep({ kind: 'lanterns' })}
        onPermit={() => { void act(store.earnPermit, () => setMessage('Quest complete! You received an Expedition Permit.')) }}
        sessions={questSessions(quest, progress, expeditions)} leg={selected ? distanceLeg(quest, selected[0], selected[1]) : 0} />
      <ShrineRevisits busy={busy} onRevisit={revisit} onRematch={(name, shiny) => { setMessage(''); setStep({ kind: 'rematch', name, shiny }) }} />
      <ArcadeAchievements place="expeditions" />
      <RunningTickets place="expeditions" />
      <Panel><Eyebrow>YOUR EXPEDITION FRIENDS</Eyebrow>
        <Copy>{Object.keys(expeditions.dex).length} Normal / Shiny discoveries kept on this phone.</Copy>
        <Button title="Open my Dex" secondary onPress={() => router.push('/dex')} />
      </Panel>
      <Copy small>Clearing a shrine trial opens a one-way portal into the Legendary’s lair, where it may be Shiny. The portal seals behind you: steady the Legendary with four seals and the battle begins. Leaving, reopening or syncing never changes it, and you pick up right where you were.</Copy>
      <Copy small>Distance counts only saved adventures, never live distance. A failed catch or leaving uses nothing up. Befriending records, quests and permits are kept on this phone; reinstalling requires befriending unlocked encounters again.</Copy>
    </>}
  </GameScreenContext.Provider></Screen>
}

function Encounter({ trailKey, trail, encounter, busy, onBegin, onEnter, onPermit }: {
  trailKey: string, trail: Trail, encounter: ActiveEncounter | undefined, busy: boolean, onBegin: () => void, onEnter: () => void, onPermit: () => void
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
  const lair = arenaFor(name).label
  const resonance = encounter?.resonance
  // After walking out, the entrance stays sealed for a moment (src/expedition-encounter.ts RESET_COOLDOWN).
  const [now, setNow] = useState(() => Date.now())
  const sealedFor = encounter?.resetPending && !resetDue(encounter, now) ? Math.max(0, encounter.nextResetAllowedAt - now) / 1000 : 0
  useEffect(() => {
    if (!encounter?.resetPending) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [encounter?.resetPending])
  const enter = resonance?.stabilized ? 'Begin the catch' : resonance?.started ? `Return to the ${lair} · ${resonance.seals.length} / 4 seals`
    : sealedFor > 0 ? `The entrance is sealed · ${sealedFor.toFixed(1)} s` : `${encounter?.resetPending ? 'Go back into' : 'Enter'} the ${lair}`
  // The card holds the status, the name and the habitat; the clues, the note and the action follow as their own rows.
  return <>
    <Panel style={{ gap: 12 }}>
      <StatusLine eyebrow={`EXPEDITION ${trail.claimed + 1}`} status={ready ? byPermit ? 'OPENED WITH A PERMIT' : 'ENCOUNTER READY' : 'FOLLOW THE CLUES'} />
      <BigName>{ready ? `${shiny ? 'Shiny ' : ''}${name}` : story.title}</BigName>
      <SceneFrame>
        <HabitatScene name={clues >= 5000 ? name : 'Egg'} shiny={shiny} discovery={ready ? 'revealed' : meters >= 15000 ? 'silhouette' : 'hidden'} />
      </SceneFrame>
    </Panel>
    <View style={{ gap: 10 }}>
      {clueMilestones.map((milestone, i) => <FactRow key={milestone} dim={clues < milestone}
        label={`${clues >= milestone ? 'CLUE FOUND' : 'MYSTERY'} · ${milestone / 1000} KM`}
        text={clues >= milestone ? story.clues[i] : 'Keep exploring to reveal this clue.'} />)}
    </View>
    {ready ? <>
      {encounter?.trial ? <StatusNote tone="success">Your trial is done. {name} waits in the {lair}.</StatusNote>
        : <StatusNote tone="info" detail={trial.lore}>{trial.title} · {KIND_NAMES[trial.kind]}: {encounter?.checkpoint ? 'pick up the trial where you left it' : 'clear the trial'} to reach {name}.</StatusNote>}
      <BallButton title={encounter?.trial ? enter : 'Begin the trial'} loading={busy} disabled={sealedFor > 0} onPress={encounter?.trial ? onEnter : onBegin} />
      {!encounter?.trial && <Footnote>{`The trial’s last door is a one-way portal: it takes you straight into the ${lair}, then on to the battle once ${name} is steady.`}</Footnote>}
    </> : <>
      <StatusNote tone="info">Save another adventure on your watch or this phone to continue, or open this encounter early with an Expedition Permit.</StatusNote>
      {quest.permits > 0 && <BallButton title={`Use an Expedition Permit (${quest.permits} held)`} loading={busy} onPress={onPermit} />}
    </>}
  </>
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
    <Copy>Any one route is enough. Quests, achievement points (from the arcade and your running feats and milestones) and running tickets give an Expedition Permit instead of walking the 25 km; a permit opens the same next encounter, with the same trial, battle and catch.{quest.permits ? ` Permits held: ${quest.permits}.` : ''}</Copy>
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
