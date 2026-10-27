import { useCallback, useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useJournal } from '../../store'
import { averagePace, duration, km, recordForm } from '../../journal'
import type { Journal } from '../../journal'
import { useCloud } from '../../cloud'
import type { Plan } from '../../plan'
import { pokemonType, spriteSource, typeTints } from '../../catalog'
import { walkingFrames } from '../../generated/walking.js'
import { currentForm, currentPace, decodePath, earnedForms, eggs, expeditionNews, finishAdventure, megaChoices, nextMilestone, phoneTrail } from '../../phone-adventure'
import type { ActiveAdventure, Activity, PhoneRun } from '../../phone-adventure'
import { clearAdventure, checkLocation, continueAdventure, currentAdventure, dismissHandOver, openLocationSettings, resumeAdventure, setScreenOnly, startAdventure, stopAdventure, useTracker } from '../../tracker'
import { onWatch, sharedPokemon } from '../../shared-adventure'
import type { SharedAdventure } from '../../shared-adventure'
import type { LocationIssue } from '../../tracker'
import { RouteView } from '../../RouteView'
import { AdventureCard } from '../../AdventureCard'
import { PixelSprite } from '../../games/TeamPicker'
import { useReducedMotion } from '../../games/hooks'
import { Button, Chip, Copy, Eyebrow, Heading, Hero, Icon, IconBubble, Panel, PokeballLoader, Screen, Title, colors, fonts, styles } from '../../ui'

// The phone version of the watch adventure: pick an egg, walk or run, and the phone measures the distance by GPS and
// draws the route. Saving adds it to the Journal, Dex, missions and Expeditions just like a watch adventure.
type Summary = { run: PhoneRun, news: ReturnType<typeof expeditionNews> }

export default function AdventureScreen() {
  const tracker = useTracker()
  const [summary, setSummary] = useState<Summary | null>(null)
  if (!tracker.ready) return <Screen><View style={{ alignItems: 'center', paddingTop: 96 }}><PokeballLoader /></View></Screen>
  return <Screen>
    {tracker.active ? <Recording active={tracker.active} recording={tracker.recording} screenOnly={tracker.screenOnly} shareError={tracker.shareError} onSaved={setSummary} />
      : summary ? <Saved summary={summary} onDone={() => setSummary(null)} />
      : <Setup shared={tracker.shared} handedOver={tracker.handedOver} />}
  </Screen>
}

const issueText: Record<LocationIssue, [string, string]> = {
  off: ['Location is off', 'Turn on location so Zepimon can measure your distance and draw your route.'],
  denied: ['Location is not allowed', 'Allow location while using Zepimon, then start again.'],
  blocked: ['Location is blocked', 'Allow location for Zepimon in its settings to record adventures.'],
  approximate: ['Precise location is off', 'With approximate location your route and distance are rough. Turn on precise location for Zepimon.']
}

const settingsHint = Platform.OS === 'web' ? 'Allow location for this site' : 'Use Open location settings'

function LocationPanel({ issue }: { issue: LocationIssue | null }) {
  const web = Platform.OS === 'web'
  return <Panel style={issue ? { borderColor: colors.star, borderWidth: 1.5 } : undefined}>
    <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <IconBubble name="location" />
      <View style={{ flex: 1 }}><Eyebrow>LOCATION</Eyebrow><Title>{issue ? issueText[issue][0] : 'Ready when you are'}</Title></View>
    </View>
    <Copy small>{issue ? issueText[issue][1] : 'Zepimon asks for your location when you start. It is used only while recording, and your route stays on this phone.'}</Copy>
    {web ? <Copy small>In a browser, allow location for this site when asked.</Copy>
      : <Button title="Open location settings" secondary onPress={() => { void openLocationSettings(issue) }} />}
  </Panel>
}

// The egg family the shared plan names, if this phone knows it.
const plannedFamily = (plan: Plan | null) => plan?.egg ? eggs.find(item => item.join('>') === plan.egg!.family.join('>')) ?? null : null

// The adventure shared with the watch, in a line: its activity, distance and when the cloud last heard of it.
const sharedLine = (shared: SharedAdventure) => `${shared.activity === 'running' ? 'Run' : 'Walk'} · ${km(shared.meters)} · as of ${
  new Date(shared.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`

function Setup({ shared, handedOver }: { shared: SharedAdventure | null, handedOver: SharedAdventure | null }) {
  const { journal, phoneRuns, plan, chooseEgg, setPhoneAdventure } = useJournal()
  const { session, linked } = useCloud()
  // The egg shared with the watch, until you pick another; otherwise a random one that is only sent once you choose it.
  const [family, setFamily] = useState(() => plannedFamily(plan) ?? eggs[Math.floor(Math.random() * eggs.length)])
  const [mega, setMega] = useState<string | null>(() => plannedFamily(plan) ? plan!.egg!.mega : null)
  const [seenPlan, setSeenPlan] = useState(plan?.eggAt ?? 0)
  const [activity, setActivity] = useState<Activity>('walking')
  const [issue, setIssue] = useState<LocationIssue | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [watchConfirmed, setWatchConfirmed] = useState(false)
  useFocusEffect(useCallback(() => { void checkLocation().then(setIssue) }, []))
  // An egg chosen elsewhere (Hatch this next in the Dex, another phone) shows up here too.
  if (plan && plan.eggAt !== seenPlan) {
    setSeenPlan(plan.eggAt)
    const next = plannedFamily(plan)
    if (next) { setFamily(next); setMega(plan.egg!.mega) }
  }
  const megas = megaChoices(family)
  const last = lastRecord(journal, family)
  const sentToWatch = plannedFamily(plan) === family
  // The adventure the watch shares while it records it: continue it here instead of starting a second one.
  const elsewhere = onWatch(shared)
  // An older watch only shows its adventure in progress through its last sync.
  const watch = shared ? null : journal?.snapshot.active ?? null
  const watchFamily = watch ? journal!.routes[watch.route] : null
  function choose(next: string[]) {
    setFamily(next); setMega(null)
    chooseEgg(next, null).catch(() => {})
  }
  function pickMega(name: string) {
    setMega(name)
    chooseEgg(family, name).catch(() => {})
  }
  async function start() {
    // Recording on both would count the same steps twice, so starting here takes a second tap.
    if (watch && !watchConfirmed) { setWatchConfirmed(true); return }
    setBusy(true); setError('')
    try {
      const problem = await startAdventure(family, activity, mega ?? megas[0] ?? null)
      setIssue(problem)
      if (problem && problem !== 'approximate') setError(`${issueText[problem][0]}. ${settingsHint}, then start again.`)
      else {
        const started = currentAdventure()
        if (started) setPhoneAdventure({ family: started.family, activity: started.activity, startedAt: started.startedAt }).catch(() => {})
      }
    } catch (caught) {
      setError(`Could not start recording${caught instanceof Error && caught.message ? `: ${caught.message}` : '.'}`)
    } finally {
      setBusy(false)
    }
  }
  // Continue here: the phone takes over the watch's adventure, and the watch stops when it next hears from the cloud.
  async function continueHere(from: SharedAdventure) {
    setBusy(true); setError('')
    try {
      const problem = await continueAdventure(from)
      setIssue(problem)
      if (problem && problem !== 'approximate') setError(`${issueText[problem][0]}. ${settingsHint}, then continue again.`)
    } catch (caught) {
      setError(`Could not continue recording${caught instanceof Error && caught.message ? `: ${caught.message}` : '.'}`)
    } finally {
      setBusy(false)
    }
  }
  return <>
    <Hero eyebrow="ZEPIMON · ADVENTURE" title={'Walk or run\nwith an egg.'}>
      <Copy color={colors.onBrand}>Your phone measures the distance and draws your route. Every 5 km your egg hatches or evolves, and a Mega form waits at 21 km.</Copy>
    </Hero>
    {handedOver && <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <Eyebrow>CONTINUED ON YOUR WATCH</Eyebrow>
      <Title>{sharedPokemon(handedOver)}</Title>
      <Copy small>Your watch took over this adventure at {km(handedOver.meters)}. Finish it there: it reaches this phone when saved.</Copy>
      <Button title="OK" secondary onPress={dismissHandOver} />
    </Panel>}
    {elsewhere && <Panel style={{ borderColor: colors.edge, borderWidth: 1.5 }}>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <IconBubble name={elsewhere.activity === 'running' ? 'run' : 'walk'} />
        <View style={{ flex: 1 }}><Eyebrow>ON YOUR WATCH</Eyebrow><Title>{sharedPokemon(elsewhere)}</Title></View>
      </View>
      <Copy color={colors.ink}>{sharedLine(elsewhere)}</Copy>
      <Copy small>Your watch is recording this adventure. Continue it here to record with the phone instead: the distance so far comes along and the watch stops.</Copy>
      <Button title="Continue here" loading={busy} onPress={() => { void continueHere(elsewhere) }} />
    </Panel>}
    <LocationPanel issue={issue} />
    <Panel>
      <Eyebrow>YOUR EGG</Eyebrow>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <View style={[adventure.art, { backgroundColor: typeTints[pokemonType(family[0])] }]}><PixelSprite name="Egg" size={64} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Title>{family[0]} egg</Title>
          <Copy small>{family.join(' › ')}</Copy>
          <Copy small color={colors.gold}>{last ? `Last adventure: ${km(last.meters)}` : 'No adventure with this egg yet'}</Copy>
        </View>
      </View>
      {megas.length > 0 && <>
        <Copy small>Mega form at 21 km:</Copy>
        <View style={styles.row}>{megas.map(name => <Chip key={name} label={name} selected={(mega ?? megas[0]) === name} onPress={() => pickMega(name)} />)}</View>
      </>}
      <Copy small>{!session || !linked ? 'Link your watch in Sync, and the egg you choose here waits on its title screen too. Adventures saved here reach its Dex as well.'
        : sentToWatch ? 'Your watch offers this egg next: open Zepimon there and tap Walk or Run.' : 'Choose an egg to send it to your watch as well.'}</Copy>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Button title="Choose an egg" secondary
          onPress={() => router.push({ pathname: '/eggs', params: { current: family.join('>') } })} /></View>
        <View style={{ flex: 1 }}><Button title="Random egg" secondary onPress={() => choose(eggs[Math.floor(Math.random() * eggs.length)])} /></View>
      </View>
    </Panel>
    {!elsewhere && <Panel>
      <Eyebrow>ACTIVITY</Eyebrow>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        {(['walking', 'running'] as const).map(kind => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: activity === kind }}
          accessibilityLabel={kind === 'walking' ? 'Walking' : 'Running'}
          onPress={() => setActivity(kind)} style={({ pressed }) => [adventure.choice, activity === kind && adventure.chosen, { opacity: pressed ? 0.8 : 1 }]}>
          <Icon name={kind === 'walking' ? 'walk' : 'run'} size={30} color={activity === kind ? colors.edge : colors.muted} />
          <Text style={[adventure.choiceText, activity === kind && { color: colors.edge }]}>{kind === 'walking' ? 'Walking' : 'Running'}</Text>
        </Pressable>)}
      </View>
    </Panel>}
    {watch && <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <IconBubble name="walk" />
        <View style={{ flex: 1 }}><Eyebrow>ON YOUR WATCH</Eyebrow>
          <Title>{watchFamily ? (watch.shiny ? 'Shiny ' : '') + (recordForm(watchFamily, watch) === 'Egg' ? `${watchFamily[0]} egg` : recordForm(watchFamily, watch)) : 'An adventure'}</Title></View>
      </View>
      <Copy small>{km(watch.meters)} as of {new Date(journal!.snapshot.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Finish it on your watch first, so the same steps are not counted twice.</Copy>
    </Panel>}
    {!!error && <Copy color={colors.danger}>{error}</Copy>}
    {watchConfirmed && <Copy color={colors.gold}>Your watch is recording too. Tap again to record on the phone anyway.</Copy>}
    {!elsewhere && <Button title={watchConfirmed ? `Start ${activity} on the phone too` : `Start ${activity}`} loading={busy} onPress={() => { void start() }} />}
    <Copy small>Recording keeps going with the screen off; Android shows a notification while Zepimon uses your location. Elapsed time includes stops, like on the watch.{session && linked ? ' Your watch and Zepp show the same adventure, and either device can continue it.' : ''}</Copy>
    {phoneRuns.length > 0 && <>
      <Heading>Your routes</Heading>
      {[...phoneRuns].sort((a, b) => Date.parse(b.record.finishedAt) - Date.parse(a.record.finishedAt)).slice(0, 10)
        .map(run => <AdventureCard key={run.id} adventure={{ ...run, device: 'phone' }} />)}
      <Button title="View all adventures" secondary onPress={() => router.push('/adventures')} />
    </>}
  </>
}

function lastRecord(journal: Journal | null, family: string[]) {
  if (!journal) return undefined
  const route = journal.routes.findIndex(item => item.join('>') === family.join('>'))
  return route >= 0 ? journal.snapshot.records[route] : undefined
}

// Steps in place like the watch: twice as fast when running. The egg rocks instead.
const poses = walkingFrames as Record<string, ImageSourcePropType[]>
function Walker({ name, shiny, activity, size }: { name: string, shiny: boolean, activity: Activity, size: number }) {
  const frames = poses[(shiny ? 'Shiny ' : '') + name]
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState(0)
  const [rock] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (reduced) return
    if (frames) {
      const timer = setInterval(() => setFrame(value => 1 - value), activity === 'running' ? 200 : 400)
      return () => clearInterval(timer)
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(rock, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(rock, { toValue: -1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(rock, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(900)
    ]))
    loop.start()
    return () => loop.stop()
  }, [frames, reduced, activity, rock])
  const rotate = rock.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] })
  return <Animated.View style={{ transform: [{ rotate }] }}>
    <Image source={frames ? frames[frame] : spriteSource(name, shiny)} accessibilityLabel={name} resizeMode="contain" fadeDuration={0}
      style={{ width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
  </Animated.View>
}

function Recording({ active, recording, screenOnly, shareError, onSaved }: {
  active: ActiveAdventure, recording: boolean, screenOnly: boolean, shareError: string | null, onSaved: (summary: Summary) => void
}) {
  const { session, linked } = useCloud()
  const { phoneRuns, savePhoneRun, setPhoneAdventure } = useJournal()
  const [now, setNow] = useState(Date.now)
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useFocusEffect(useCallback(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, []))
  const form = currentForm(active.family, active.meters, active.mega)
  const name = (active.shiny ? 'Shiny ' : '') + (form === 'Egg' ? `${active.family[0]} egg` : form)
  const next = nextMilestone(active.family, active.meters)
  const previous = next === null ? 0 : next === 21000 ? active.family.length * 5000 : next - 5000
  const elapsed = Math.max(0, (now - active.startedAt) / 1000)
  const pace = currentPace(active, now)
  const gps = !active.last ? 'Searching for GPS…' : now - active.last.at > 30000 ? 'GPS signal lost' :
    active.last.accuracy !== null && active.last.accuracy > 35 ? `Weak GPS (±${Math.round(active.last.accuracy)} m)` : `GPS ±${Math.round(active.last.accuracy ?? 0)} m`
  const nextLabel = next === null ? 'Final form reached!' : `${km(next - active.meters)} to ${next === 21000 ? 'Mega' : form === 'Egg' ? 'hatch' : 'evolve'}`

  async function save() {
    setBusy(true); setError('')
    try {
      const final = (await stopAdventure()) ?? active
      const run = finishAdventure(final, Date.now())
      const before = phoneTrail(phoneRuns)?.meters ?? 0
      await savePhoneRun(run)
      await clearAdventure()
      setPhoneAdventure(null).catch(() => {})
      onSaved({ run, news: expeditionNews(before, before + run.record.meters) })
    } catch {
      setError('Could not save this adventure. Nothing is lost: try saving again, or resume recording.')
      setBusy(false)
    }
  }
  async function resume() {
    setBusy(true); setError('')
    try {
      const problem = await resumeAdventure()
      if (problem && problem !== 'approximate') setError(`${issueText[problem][0]}. ${settingsHint}, then resume.`)
    } catch { setError('Could not resume recording. Try again.') }
    setBusy(false)
  }
  async function recordInBackground() {
    setBusy(true); setError('')
    try { await setScreenOnly(false) } catch { setError('Could not switch recording. Resume to keep going.') }
    setBusy(false)
  }
  return <>
    <View style={[adventure.stage, { backgroundColor: typeTints[pokemonType(form === 'Egg' ? active.family[0] : form)] }]}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Eyebrow>{active.activity === 'running' ? 'RUNNING' : 'WALKING'}</Eyebrow>
        <View style={adventure.live}><View style={[adventure.dot, !recording && { backgroundColor: colors.muted }]} />
          <Text style={adventure.liveText}>{recording ? 'RECORDING' : 'PAUSED'}</Text></View>
      </View>
      <View style={{ alignItems: 'center' }}><Walker name={form} shiny={active.shiny} activity={active.activity} size={132} /></View>
      <Heading>{name}</Heading>
      <Copy small color={colors.ink}>{nextLabel}</Copy>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(next === null ? 100 : (active.meters - previous) / (next - previous) * 100) }}
        style={[styles.track, { backgroundColor: 'rgba(255, 255, 255, 0.7)' }]}>
        <View style={[styles.fill, { width: `${next === null ? 100 : Math.max(0, Math.min(1, (active.meters - previous) / (next - previous))) * 100}%`, backgroundColor: colors.edge }]} />
      </View>
    </View>
    <View style={adventure.stats}>
      <Stat label="DISTANCE" value={km(active.meters).replace(' km', '')} unit="km" />
      <Stat label="TIME" value={duration(elapsed)} />
      <Stat label="PACE NOW" value={(pace === null ? '--:-- /km' : averagePace(pace, 1000)).replace(' /km', '')} unit="/km" />
      <Stat label="AVERAGE PACE" value={averagePace(elapsed, active.meters).replace(' /km', '')} unit="/km" />
    </View>
    <View style={{ gap: 6 }}>
      <RouteView points={active.points} height={240} live label={`Route so far, ${km(active.meters)}`} />
      <Text style={adventure.gps}>{gps}</Text>
      {/* Whether your watch and Zepp can see this adventure: they follow it through your account. */}
      {session && linked && shareError !== null && <Text style={[adventure.gps, shareError ? { color: colors.gold } : null]}>
        {shareError ? `Not shared with your watch yet: ${shareError}` : 'Shared with your watch and Zepp'}</Text>}
    </View>
    {screenOnly && <Panel>
      <Title>Keep Zepimon open</Title>
      <Copy small>Zepimon closed during an adventure, so for now it records only while it is open on screen. Distance pauses while the screen is off.</Copy>
      <Button title="Record with the screen off again" secondary disabled={busy} onPress={() => { void recordInBackground() }} />
    </Panel>}
    {!recording && <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
      <Title>Recording stopped</Title>
      <Copy small>Your phone stopped sending locations, maybe after a restart. Distance so far is kept.</Copy>
      <Button title="Resume recording" loading={busy && !confirm} onPress={() => { void resume() }} />
      <Button title="Open location settings" secondary onPress={() => { void openLocationSettings(null) }} />
    </Panel>}
    {!!error && <Copy color={colors.danger}>{error}</Copy>}
    {confirm === 'finish' ? <Panel>
      <Title>Save this adventure?</Title>
      <Text style={styles.stat}>{km(active.meters)}</Text>
      <Copy small>It becomes the latest record for the {active.family[0]} family, as on the watch.{form === 'Egg' ? ' Your egg hatches at 5 km in one adventure, so this one ends as an egg.' : ''}</Copy>
      <Button title="Save & finish" loading={busy} onPress={() => { void save() }} />
      <Button title={active.activity === 'running' ? 'Keep running' : 'Keep walking'} secondary disabled={busy} onPress={() => setConfirm(null)} />
    </Panel> : confirm === 'discard' ? <Panel>
      <Title>Discard this adventure?</Title>
      <Copy small>The distance and route are deleted and nothing is saved.</Copy>
      <Button title="Discard adventure" secondary onPress={() => { void clearAdventure().then(() => setPhoneAdventure(null)).catch(() => {}) }} />
      <Button title={active.activity === 'running' ? 'Keep running' : 'Keep walking'} onPress={() => setConfirm(null)} />
    </Panel> : <>
      <Button title="Finish & save" onPress={() => setConfirm('finish')} />
      <Button title="Discard" secondary onPress={() => setConfirm('discard')} />
    </>}
  </>
}

function Stat({ label, value, unit }: { label: string, value: string, unit?: string }) {
  return <View accessible accessibilityLabel={`${label.toLowerCase()} ${value} ${unit ?? ''}`} style={adventure.stat}>
    <Eyebrow color={colors.muted}>{label}</Eyebrow>
    <Text numberOfLines={1} style={adventure.statValue}>{value}{unit && <Text style={adventure.statUnit}> {unit}</Text>}</Text>
  </View>
}

function Saved({ summary: { run, news }, onDone }: { summary: Summary, onDone: () => void }) {
  const { session, linked } = useCloud()
  const points = useMemo(() => decodePath(run.path), [run.path])
  const form = run.record.form || 'Egg'
  const earned = earnedForms(run.family, run.record.meters, run.record.mega ?? null)
  return <>
    <Panel style={{ alignItems: 'center' }}>
      <Eyebrow>ADVENTURE SAVED</Eyebrow>
      <PixelSprite name={form} shiny={run.record.shiny} size={120} />
      <Heading>{run.record.shiny ? 'Shiny ' : ''}{form === 'Egg' ? `${run.family[0]} egg` : form}</Heading>
      <Copy color={colors.ink}>{km(run.record.meters)} · {duration(run.record.elapsedSeconds)} · {averagePace(run.record.elapsedSeconds, run.record.meters)}</Copy>
    </Panel>
    <RouteView points={points} height={260} label={`Route of ${km(run.record.meters)}`} />
    <Panel>
      {earned.length ? <>
        <Eyebrow>IN YOUR DEX</Eyebrow>
        <View style={styles.row}>{earned.map(name => <View key={name} style={{ alignItems: 'center' }}>
          <PixelSprite name={name} shiny={run.record.shiny} size={56} /><Copy small>{name}</Copy></View>)}</View>
      </> : <Copy>Your egg did not hatch this time: it needs 5 km in one adventure.</Copy>}
      {session && linked && <Copy small>It reaches your watch the next time you open Zepimon there, with Zepp connected.</Copy>}
      {news && <Copy color={colors.gold}>{news === 'encounter' ? 'A Legendary encounter is ready!' : 'A mysterious clue appeared!'}</Copy>}
      {news && <Button title="Open Legendary Expeditions" secondary onPress={() => router.push('/expeditions')} />}
    </Panel>
    <Button title="Share adventure image" secondary onPress={() => router.push({ pathname: '/share', params: { id: run.id } })} />
    <Button title="Done" onPress={onDone} />
  </>
}

const adventure = StyleSheet.create({
  art: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  choice: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 18, borderWidth: 1.5,
    borderColor: colors.line, backgroundColor: colors.panel },
  chosen: { borderColor: colors.edge, borderWidth: 2.5, backgroundColor: colors.mint },
  choiceText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.muted },
  stage: { borderRadius: 24, padding: 18, gap: 8, borderWidth: 1, borderColor: colors.line },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.8)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  liveText: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1, color: colors.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '45%', flexGrow: 1, backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 28, lineHeight: 36 },
  statUnit: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 15 },
  gps: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, textAlign: 'center' }
})
