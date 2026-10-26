import { useCallback, useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { ImageSourcePropType } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useJournal } from '../../store'
import { averagePace, duration, km } from '../../journal'
import type { Journal } from '../../journal'
import { pokemonGeneration, pokemonType, spriteSource, typeTints } from '../../catalog'
import { walkingFrames } from '../../generated/walking.js'
import { currentForm, currentPace, decodePath, earnedForms, eggs, expeditionNews, finishAdventure, megaChoices, nextMilestone, phoneTrail } from '../../phone-adventure'
import type { ActiveAdventure, Activity, PhoneRun } from '../../phone-adventure'
import { clearAdventure, checkLocation, openLocationSettings, resumeAdventure, startAdventure, stopAdventure, useTracker } from '../../tracker'
import type { LocationIssue } from '../../tracker'
import { RouteView } from '../../RouteView'
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
    {tracker.active ? <Recording active={tracker.active} recording={tracker.recording} onSaved={setSummary} />
      : summary ? <Saved summary={summary} onDone={() => setSummary(null)} />
      : <Setup />}
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

function Setup() {
  const { journal, phoneRuns } = useJournal()
  const [family, setFamily] = useState(() => eggs[Math.floor(Math.random() * eggs.length)])
  const [mega, setMega] = useState<string | null>(null)
  const [activity, setActivity] = useState<Activity>('walking')
  const [picking, setPicking] = useState(false)
  const [issue, setIssue] = useState<LocationIssue | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useFocusEffect(useCallback(() => { void checkLocation().then(setIssue) }, []))
  const megas = megaChoices(family)
  const last = lastRecord(journal, family)
  function choose(next: string[]) { setFamily(next); setMega(null); setPicking(false) }
  async function start() {
    setBusy(true); setError('')
    try {
      const problem = await startAdventure(family, activity, mega ?? megas[0] ?? null)
      setIssue(problem)
      if (problem && problem !== 'approximate') setError(`${issueText[problem][0]}. ${settingsHint}, then start again.`)
    } catch (caught) {
      setError(`Could not start recording${caught instanceof Error && caught.message ? `: ${caught.message}` : '.'}`)
    } finally {
      setBusy(false)
    }
  }
  return <>
    <Hero eyebrow="ZEPIMON · ADVENTURE" title={'Walk or run\nwith an egg.'}>
      <Copy color={colors.onBrand}>Your phone measures the distance and draws your route. Every 5 km your egg hatches or evolves, and a Mega form waits at 21 km.</Copy>
    </Hero>
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
        <View style={styles.row}>{megas.map(name => <Chip key={name} label={name} selected={(mega ?? megas[0]) === name} onPress={() => setMega(name)} />)}</View>
      </>}
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Button title={picking ? 'Hide eggs' : 'Choose an egg'} secondary onPress={() => setPicking(!picking)} /></View>
        <View style={{ flex: 1 }}><Button title="Random egg" secondary onPress={() => choose(eggs[Math.floor(Math.random() * eggs.length)])} /></View>
      </View>
      {picking && <EggPicker onPick={choose} />}
    </Panel>
    <Panel>
      <Eyebrow>ACTIVITY</Eyebrow>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        {(['walking', 'running'] as const).map(kind => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: activity === kind }}
          accessibilityLabel={kind === 'walking' ? 'Walking' : 'Running'}
          onPress={() => setActivity(kind)} style={({ pressed }) => [adventure.choice, activity === kind && adventure.chosen, { opacity: pressed ? 0.8 : 1 }]}>
          <Icon name={kind === 'walking' ? 'walk' : 'run'} size={30} color={activity === kind ? colors.edge : colors.muted} />
          <Text style={[adventure.choiceText, activity === kind && { color: colors.edge }]}>{kind === 'walking' ? 'Walking' : 'Running'}</Text>
        </Pressable>)}
      </View>
    </Panel>
    {!!error && <Copy color={colors.danger}>{error}</Copy>}
    <Button title={`Start ${activity}`} loading={busy} onPress={() => { void start() }} />
    <Copy small>Recording keeps going with the screen off; Android shows a notification while Zepimon uses your location. Elapsed time includes stops, like on the watch.</Copy>
    {phoneRuns.length > 0 && <>
      <Heading>Your routes</Heading>
      {[...phoneRuns].sort((a, b) => Date.parse(b.record.finishedAt) - Date.parse(a.record.finishedAt)).slice(0, 10).map(run => <RouteCard key={run.id} run={run} />)}
    </>}
  </>
}

function lastRecord(journal: Journal | null, family: string[]) {
  if (!journal) return undefined
  const route = journal.routes.findIndex(item => item.join('>') === family.join('>'))
  return route >= 0 ? journal.snapshot.records[route] : undefined
}

const EGG_GROUPS = [['All', 0], ['Gen 1', 1], ['Gen 2', 2], ['Gen 3', 3], ['Gen 4', 4], ['Extra Mega', 5]] as const
const sortedEggs = [...eggs].sort((a, b) => a[0].localeCompare(b[0]))
function EggPicker({ onPick }: { onPick: (family: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState(0)
  const search = query.trim().toLowerCase()
  const matches = sortedEggs.filter(family => (!group || (group === 5 ? pokemonGeneration(family[0]) > 4 : pokemonGeneration(family[0]) === group)) &&
    (!search || family.some(name => name.toLowerCase().includes(search))))
  return <View style={{ gap: 10 }}>
    <TextInput accessibilityLabel="Search eggs by Pokemon name" placeholder="Search a Pokemon…" placeholderTextColor={colors.muted}
      value={query} onChangeText={setQuery} autoCorrect={false} style={styles.input} />
    <View style={styles.row}>{EGG_GROUPS.map(([label, value]) => <Chip key={label} label={label} selected={group === value} onPress={() => setGroup(value)} />)}</View>
    {matches.slice(0, 30).map(family => <Pressable key={family.join('>')} accessibilityRole="button" accessibilityLabel={`${family[0]} egg: ${family.join(', ')}`}
      onPress={() => onPick(family)} style={({ pressed }) => [adventure.egg, { opacity: pressed ? 0.7 : 1 }]}>
      <PixelSprite name={family[0]} size={40} />
      <Text numberOfLines={2} style={adventure.eggText}>{family.join(' › ')}</Text>
    </Pressable>)}
    {matches.length > 30 && <Copy small>Showing 30 of {matches.length}. Search to find the rest.</Copy>}
    {!matches.length && <Copy small>No eggs match “{query}”.</Copy>}
  </View>
}

function RouteCard({ run }: { run: PhoneRun }) {
  const points = useMemo(() => decodePath(run.path), [run.path])
  const form = run.record.form || 'Egg'
  return <Panel>
    <View style={[styles.row, { flexWrap: 'nowrap', alignItems: 'stretch' }]}>
      <View style={{ width: 112 }}><RouteView points={points} height={84} compact label={`Route of ${km(run.record.meters)}`} /></View>
      <View style={{ flex: 1, gap: 2, justifyContent: 'center' }}>
        <Title>{run.record.shiny ? 'Shiny ' : ''}{form === 'Egg' ? `${run.family[0]} egg` : form}</Title>
        <Copy>{km(run.record.meters)} · {duration(run.record.elapsedSeconds)}</Copy>
        <Copy small>{run.record.activity === 'running' ? 'Run' : 'Walk'} · {new Date(run.record.finishedAt).toLocaleDateString()} · {averagePace(run.record.elapsedSeconds, run.record.meters)}</Copy>
      </View>
    </View>
  </Panel>
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

function Recording({ active, recording, onSaved }: { active: ActiveAdventure, recording: boolean, onSaved: (summary: Summary) => void }) {
  const { phoneRuns, savePhoneRun } = useJournal()
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
    </View>
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
      <Button title="Discard adventure" secondary onPress={() => { void clearAdventure() }} />
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
      {news && <Copy color={colors.gold}>{news === 'encounter' ? 'A Legendary encounter is ready!' : 'A mysterious clue appeared!'}</Copy>}
      {news && <Button title="Open Legendary Expeditions" secondary onPress={() => router.push('/expeditions')} />}
    </Panel>
    <Button title="Done" onPress={onDone} />
  </>
}

const adventure = StyleSheet.create({
  art: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  choice: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 18, borderWidth: 1.5,
    borderColor: colors.line, backgroundColor: colors.panel },
  chosen: { borderColor: colors.edge, borderWidth: 2.5, backgroundColor: colors.mint },
  choiceText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.muted },
  egg: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  eggText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
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
