import { useCallback, useEffect, useMemo, useState } from 'react'
import { Animated, Easing, Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import type { ImageSourcePropType } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useJournal } from '../../store'
import { averagePace, duration, km, recordForm } from '../../journal'
import type { Journal } from '../../journal'
import { useCloud } from '../../cloud'
import type { Plan } from '../../plan'
import { isDynamax, pokemonType, spriteSource } from '../../catalog'
import { DynamaxAura } from '../../Sprite'
import { spriteForm } from '../../generated/forms.js'
import { walkingFrames } from '../../generated/walking.js'
import { currentForm, currentPace, earnedForms, encodePath, expeditionNews, finishAdventure, formChoices, formStages, gigantamaxChoices, megaChoices,
  milestoneLabel, nextMilestone, openEggs, phoneTrail, previousMilestone } from '../../phone-adventure'
import type { ActiveAdventure, Activity, PhoneRun } from '../../phone-adventure'
import { clearAdventure, checkLocation, continueAdventure, currentAdventure, dismissHandOver, openLocationSettings, resumeAdventure, setScreenOnly, startAdventure, stopAdventure, useTracker } from '../../tracker'
import { onWatch, sharedPace, sharedPokemon } from '../../shared-adventure'
import type { SharedAdventure, SharedTrail } from '../../shared-adventure'
import { usePreferences } from '../../preferences'
import type { LocationIssue } from '../../tracker'
import { RouteMap } from '../../RouteMap'
import { useGateStatus } from '../../LegendaryGate'
import { MapSheet, RouteTrail, gbaBox } from '../../RouteTrail'
import { Squish } from '../../JournalDashboard'
import { allAdventures } from '../../adventures'
import type { Adventure } from '../../adventures'
import { MILESTONE, reachedBy } from '../../adventure-route'
import { mysteryLine, spokenLine } from '../../pokedex'
import { averagePace as runPace, clock, fastestPace, paceText, splits } from '../../running'
import { BottomSheet } from '../../BottomSheet'
import { summary } from '../../journal-calendar'
import { missions } from '../../progress'
import { PixelSprite } from '../../games/TeamPicker'
import { useReducedMotion } from '../../games/hooks'
import { Button, Chip, Copy, Eyebrow, GradientFill, Heading, Icon, IconBubble, Panel, PokeballLoader, Screen, Title, colors, displayFont, fonts, retro, styles, themedStyles, typeInks, typeTints, glass, useTheme } from '../../ui'

// The phone version of the watch adventure: pick an egg, walk or run, and the phone measures the distance by GPS and
// draws the route on a map. Saving adds it to the Journal, Dex, missions and Expeditions just like a watch adventure.
// An adventure the watch is recording shows here as it shares it, all but the map, and can be continued here.
type Summary = { run: PhoneRun, news: ReturnType<typeof expeditionNews> }

export default function AdventureScreen() {
  useTheme()
  const tracker = useTracker()
  const [saved, setSaved] = useState<Summary | null>(null)
  if (!tracker.ready) return <Screen><View style={{ alignItems: 'center', paddingTop: 96 }}><PokeballLoader /></View></Screen>
  const following = onWatch(tracker.shared)
  // The route map, and the live adventure's street map, fill the screen edge to edge, under the status bar; the rest
  // scroll as pages.
  if (tracker.active) return <Recording active={tracker.active} recording={tracker.recording} screenOnly={tracker.screenOnly}
    shareError={tracker.shareError} onSaved={setSaved} />
  if (!saved && !following) return <Setup shared={tracker.shared} handedOver={tracker.handedOver} />
  return <Screen>
    {saved ? <Saved summary={saved} onDone={() => setSaved(null)} />
      : <Following shared={following!} trail={tracker.trail} handedOver={tracker.handedOver} />}
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
  return <Panel style={issue ? { borderColor: colors.star, borderWidth: 1.5 } : undefined}><LocationDetails issue={issue} /></Panel>
}

function LocationDetails({ issue }: { issue: LocationIssue | null }) {
  const web = Platform.OS === 'web'
  return <>
    <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <IconBubble name="location" />
      <View style={{ flex: 1 }}><Eyebrow>LOCATION</Eyebrow><Title>{issue ? issueText[issue][0] : 'Ready when you are'}</Title></View>
    </View>
    <Copy small>{issue ? issueText[issue][1] : 'Zepimon asks for your location when you start. It is used only while recording, and your route stays on this phone.'}</Copy>
    {web ? <Copy small>In a browser, allow location for this site when asked.</Copy>
      : <Button title="Open location settings" secondary onPress={() => { void openLocationSettings(issue) }} />}
  </>
}

// The egg family the shared plan names, if this phone knows it and it is open (a Legendary one once caught on an Expedition).
const plannedFamily = (plan: Plan | null, opened: string[][]) =>
  plan?.egg ? opened.find(item => item.join('>') === plan.egg!.family.join('>')) ?? null : null
const randomEgg = (opened: string[][]) => opened[Math.floor(Math.random() * opened.length)]

// The watch took over the adventure this phone was recording.
function HandedOver({ shared }: { shared: SharedAdventure }) {
  return <Panel style={{ borderColor: colors.star, borderWidth: 1.5 }}>
    <Eyebrow>CONTINUED ON YOUR WATCH</Eyebrow>
    <Title>{sharedPokemon(shared)}</Title>
    <Copy small>Your watch took over this adventure at {km(shared.meters)}. Finish it there: it reaches this phone when saved.</Copy>
    <Button title="OK" secondary onPress={dismissHandOver} />
  </Panel>
}

// Before an adventure: your trainer on the route map at everything you have walked and run (src/RouteTrail.tsx), with
// a card docked below to pick the egg, walk or run, and start. Location, Missions and Expeditions float on the right;
// a milestone reached shows, when tapped, the adventure that got you there.
function Setup({ shared, handedOver }: { shared: SharedAdventure | null, handedOver: SharedAdventure | null }) {
  const { journal, phoneRuns, progress, buddy, plan, dex, expeditions, chooseEgg, setPhoneAdventure } = useJournal()
  const opened = useMemo(() => openEggs(expeditions.dex), [expeditions.dex])
  const { session, linked } = useCloud()
  const reduced = useReducedMotion()
  // The egg shared with the watch, until you pick another; otherwise a random one that is only sent once you choose it.
  const [family, setFamily] = useState(() => plannedFamily(plan, opened) ?? randomEgg(opened))
  const [mega, setMega] = useState<string | null>(() => plannedFamily(plan, opened) ? plan!.egg!.mega : null)
  const [seenPlan, setSeenPlan] = useState(plan?.eggAt ?? 0)
  // Walking or Running as chosen in Settings, until you pick here.
  const { activity: preferred, safariTrainer } = usePreferences()
  const [picked, setActivity] = useState<Activity | null>(null)
  const activity = picked ?? preferred
  const [issue, setIssue] = useState<LocationIssue | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [watchConfirmed, setWatchConfirmed] = useState(false)
  const [sheet, setSheet] = useState<'egg' | 'location' | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const lifetime = useMemo(() => summary(adventures).meters, [adventures])
  // This tab is where adventures start, so every visit opens with the card unfolded, even if it was folded last time.
  useFocusEffect(useCallback(() => {
    setCollapsed(false)
    void checkLocation().then(setIssue)
  }, []))
  // Kept the same between renders, so the map (a memo) is not drawn again for nothing.
  const tip = useCallback((meters: number) => <MilestoneTip meters={meters} adventures={adventures} />, [adventures])
  // An egg chosen elsewhere (Hatch this next in the Dex, another phone) shows up here too.
  if (plan && plan.eggAt !== seenPlan) {
    setSeenPlan(plan.eggAt)
    const next = plannedFamily(plan, opened)
    if (next) { setFamily(next); setMega(plan.egg!.mega) }
  }
  const megas = megaChoices(family)
  const gigantamax = gigantamaxChoices(family)
  // The Mega forms to pick from, or Urshifu's and Toxtricity's two Gigantamax forms.
  const choices = formChoices(family)
  // What the egg becomes stays ??? until you have caught it.
  const line = mysteryLine(family, name => !!(dex[name] || dex[`Shiny ${name}`]))
  const last = lastRecord(journal, family)
  const sentToWatch = plannedFamily(plan, opened) === family
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
      const problem = await startAdventure(family, activity, mega ?? choices[0] ?? null)
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

  const startTitle = watchConfirmed ? 'Start here too' : 'Start'
  const tint = typeTints[pokemonType(family[0])]
  // The card, framed like the map's text boxes inside as well as out: the egg with change and fold buttons, Walk and Run
  // as a menu whose chosen line has the games' cursor, and Start as a raised button. Folding shrinks it into a bubble
  // at the bottom right (`bubble`), leaving the map in view; the bubble opens it again.
  const card = <>
    <View style={adventure.egg}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Your egg: ${family[0]} egg`} accessibilityHint="Shows the egg and lets you change it"
        onPress={() => setSheet('egg')} style={({ pressed }) => [adventure.eggArt, { backgroundColor: tint, opacity: pressed ? 0.75 : 1 }]}>
        <PixelSprite name="Egg" size={32} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={adventure.eggLabel}>YOUR EGG</Text>
        <Text numberOfLines={1} style={adventure.eggName}>{family[0]} egg</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Change egg" hitSlop={6} onPress={() => setSheet('egg')}
        style={({ pressed }) => [adventure.square, adventure.change, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
        <Icon name="sync" size={16} color={colors.edge} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Minimize the card" accessibilityHint="Leaves your egg at the side of the map"
        hitSlop={6} onPress={() => setCollapsed(true)} style={({ pressed }) => [adventure.square, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
        <Icon name="fullscreenExit" size={16} color={colors.muted} />
      </Pressable>
    </View>
    <View accessibilityRole="radiogroup" style={adventure.modes}>
      {(['walking', 'running'] as const).map(kind => {
        const on = activity === kind
        return <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: on }}
          accessibilityLabel={kind === 'walking' ? 'Walking' : 'Running'} onPress={() => setActivity(kind)}
          style={({ pressed }) => [adventure.mode, on && adventure.modeOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <Svg width={7} height={10} viewBox="0 0 7 10" style={{ opacity: on ? 1 : 0 }}><Path d="M0 0L7 5L0 10Z" fill={colors.edge} /></Svg>
          <Icon name={kind === 'walking' ? 'walk' : 'run'} size={18} color={on ? colors.edge : colors.muted} />
          <Text style={[adventure.modeText, on && { color: colors.ink }]}>{kind === 'walking' ? 'Walk' : 'Run'}</Text>
        </Pressable>
      })}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={startTitle} accessibilityState={{ disabled: busy, busy }} disabled={busy}
      onPress={() => { void start() }} style={({ pressed }) => [adventure.start, pressed && adventure.startPressed]}>
      <GradientFill radius={6} />
      {busy ? <PokeballLoader size={18} /> : <Icon name="resume" size={18} color={colors.onBrand} />}
      <Text style={adventure.startText}>{startTitle}</Text>
    </Pressable>
    {watch && <View style={adventure.noteRow}>
      <Icon name="watch" size={16} color={colors.muted} />
      <Text style={[adventure.note, { flex: 1 }]}>{watchFamily ? (watch.shiny ? 'Shiny ' : '') + (recordForm(watchFamily, watch) === 'Egg'
        ? `${watchFamily[0]} egg` : recordForm(watchFamily, watch)) : 'An adventure'} on your watch · {km(watch.meters)}. Finish it there first.</Text>
    </View>}
    {watchConfirmed && <Text style={[adventure.note, { color: colors.gold }]}>Tap again to record here too.</Text>}
    {!!error && <Text style={[adventure.note, { color: colors.danger }]}>{error}</Text>}
  </>

  // The folded card: your egg rocking on its type's colour, with the activity picked in the corner.
  const bubble = <Pressable accessibilityRole="button" accessibilityLabel={`${family[0]} egg, ${activity === 'running' ? 'running' : 'walking'}`}
    accessibilityHint="Opens the card to start an adventure" onPress={() => setCollapsed(false)}
    style={({ pressed }) => [adventure.bubble, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
    <View pointerEvents="none" style={adventure.bubbleRule} />
    <View style={[adventure.bubbleArt, { backgroundColor: tint }]}>
      <Walker name="Egg" shiny={false} activity={activity} size={38} />
    </View>
    <View style={adventure.bubbleBadge}><Icon name={activity === 'running' ? 'run' : 'walk'} size={12} color={colors.onEdge} /></View>
  </Pressable>

  return <>
    <RouteTrail meters={lifetime} trainer={safariTrainer} activity={activity} buddy={buddy} reduced={reduced} card={card} cardWidth={380}
      folded={collapsed} bubble={bubble} rail={<Rail issue={issue} onLocation={() => setSheet('location')} reduced={reduced} />}
      notice={handedOver ? <HandedOver shared={handedOver} /> : undefined}
      tip={tip} />
    <MapSheet visible={sheet === 'egg'} title="Your egg" onClose={() => setSheet(null)} reduced={reduced}>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <View style={[adventure.art, { backgroundColor: typeTints[pokemonType(family[0])] }]}><PixelSprite name="Egg" size={64} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Title>{family[0]} egg</Title>
          <View accessible accessibilityLabel={spokenLine(line)}><Copy small>{line.join(' › ')}</Copy></View>
          <Copy small color={colors.gold}>{last ? `Last adventure: ${km(last.meters)}` : 'No adventure with this egg yet'}</Copy>
        </View>
      </View>
      <Copy small>Every 5 km in one adventure your egg hatches or evolves. {megas.length ? 'It takes its Mega form at 21 km, ' : 'It '}Dynamaxes
        at 42 km{gigantamax.length ? ' and Gigantamaxes at 50 km' : ''}.</Copy>
      {choices.length > 0 && <>
        <Copy small>{megas.length ? 'Mega form at 21 km:' : 'Gigantamax form at 50 km:'}</Copy>
        <View style={styles.row}>{choices.map(name => <Chip key={name} label={name} selected={(mega ?? choices[0]) === name} onPress={() => pickMega(name)} />)}</View>
      </>}
      <Copy small>{!session || !linked ? 'Link your watch in Settings, and the egg you choose here waits on its title screen too. Adventures saved here reach its Dex as well.'
        : sentToWatch ? 'Your watch offers this egg next: open Zepimon there and tap Walk or Run.' : 'Choose an egg to send it to your watch as well.'}</Copy>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><Button title="Choose an egg" secondary onPress={() => {
          setSheet(null)
          router.push({ pathname: '/eggs', params: { current: family.join('>') } })
        }} /></View>
        <View style={{ flex: 1 }}><Button title="Random egg" secondary onPress={() => choose(randomEgg(opened))} /></View>
      </View>
    </MapSheet>
    <MapSheet visible={sheet === 'location'} title="Location" onClose={() => setSheet(null)} reduced={reduced}>
      <LocationDetails issue={issue} />
      <Copy small>Recording keeps going with the screen off; Android shows a notification while Zepimon uses your location. Elapsed time includes stops, like on the watch.{session && linked ? ' Your watch and Zepp show the same adventure, and either device can continue it. One started on your watch shows here live, without the map.' : ''}</Copy>
    </MapSheet>
  </>
}

// What a milestone reached shows in its tip on the map: the adventure that took you past it (its Pokemon, when, walk or
// run, and how far), how long after the milestone before it that was, and a link to that adventure's details.
const DAY = 86400000
function MilestoneTip({ meters, adventures }: { meters: number, adventures: Adventure[] }) {
  const reached = reachedBy(meters, adventures)
  if (!reached) return null
  const { run } = reached
  const form = recordForm(run.family, run.record)
  const finished = new Date(run.record.finishedAt)
  const year = finished.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } as const : {}
  const previous = meters > 0 ? reachedBy(meters - MILESTONE, adventures) : undefined
  const days = previous ? Math.round((finished.getTime() - Date.parse(previous.run.record.finishedAt)) / DAY) : null
  const before = (meters - MILESTONE) / 1000
  const since = !previous ? 'Where it all began' : previous.run === run ? `Same adventure as ${before} km`
    : days === 0 ? `Same day as ${before} km` : `${days} day${days === 1 ? '' : 's'} after ${before} km`
  return <>
    <View style={adventure.tipRow}>
      <View style={[adventure.tipArt, { backgroundColor: typeTints[pokemonType(form === 'Egg' ? run.family[0] : form)] }]}>
        <PixelSprite name={form} shiny={run.record.shiny} size={40} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={adventure.tipDate}>{finished.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...year })}</Text>
        <View style={adventure.tipFact}>
          <Icon name={run.record.activity === 'running' ? 'run' : 'walk'} size={15} color={colors.muted} />
          <Text numberOfLines={1} style={adventure.tipFactText}>{km(run.record.meters)} · {form === 'Egg' ? `${run.family[0]} egg` : form}</Text>
        </View>
      </View>
    </View>
    <View style={adventure.tipFact}>
      <Icon name="calendar" size={15} color={colors.edge} />
      <Text numberOfLines={1} style={[adventure.tipFactText, { color: colors.ink }]}>{since}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open this adventure" hitSlop={4}
      onPress={() => router.push({ pathname: '/adventure-details', params: { id: run.id } })}
      style={({ pressed }) => [adventure.tipLink, { opacity: pressed ? 0.7 : 1 }]}>
      <Text style={adventure.tipLinkText}>View adventure</Text>
      <Icon name="chevron" size={18} color={colors.edge} />
    </Pressable>
  </>
}

// The buttons on the right of the map: whether location is on (tap for details), Missions with this week's 10 km as a
// ring, Legendary Expeditions with a gold dot when an encounter or permit is waiting, and Routes, the log of every
// place walked and the Pokemon that walked it.
function Rail({ issue, onLocation, reduced }: { issue: LocationIssue | null, onLocation: () => void, reduced: boolean }) {
  const { journal, progress } = useJournal()
  const gate = useGateStatus()
  const week = missions(journal, progress).find(mission => mission.id === 'week-distance')
  const share = week ? Math.min(1, week.value / week.goal) : 0
  const on = issue === null
  const state = on ? 'Ready' : issue === 'approximate' ? 'Rough' : 'Off'
  const ready = gate.state === 'waiting' || gate.state === 'permit'
  return <>
    <Squish reduced={reduced} onPress={onLocation} accessibilityLabel={`Location ${state}`} accessibilityHint="Shows how Zepimon uses your location"
      style={adventure.location}>
      <View style={[adventure.locationIcon, { backgroundColor: on ? colors.mint : colors.goldTint }]}>
        <Icon name="location" size={15} color={on ? colors.edge : colors.gold} />
      </View>
      <View>
        <Text style={adventure.railLabel}>Location</Text>
        <Text style={[adventure.locationState, { color: on ? colors.edge : colors.gold }]}>{state}</Text>
      </View>
      <View style={[adventure.switch, on && { backgroundColor: colors.edge }]}><View style={[adventure.knob, on && { alignSelf: 'flex-end' }]} /></View>
    </Squish>
    <Squish reduced={reduced} onPress={() => router.push('/missions')} style={adventure.tile}
      accessibilityLabel={`Missions${week ? `. This week ${Math.min(week.value, week.goal).toFixed(1)} of ${week.goal} km` : ''}`}>
      <View style={adventure.ring}>
        <Svg width={32} height={32} style={{ position: 'absolute' }}>
          <Circle cx={16} cy={16} r={14} stroke={colors.line} strokeWidth={3} fill="none" />
          {share > 0 && <Circle cx={16} cy={16} r={14} stroke={colors.edge} strokeWidth={3} fill="none" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 14 * share} ${2 * Math.PI * 14}`} transform="rotate(-90 16 16)" />}
        </Svg>
        <Icon name="missions" size={16} color={colors.edge} />
      </View>
      <Text style={adventure.railLabel}>Missions</Text>
    </Squish>
    <Squish reduced={reduced} onPress={() => router.push('/expeditions')} style={adventure.tile}
      accessibilityLabel={`Expeditions. ${gate.line}`}>
      <View style={[adventure.ring, { backgroundColor: ready ? colors.goldTint : colors.altTint }]}>
        <Icon name="explore" size={18} color={ready ? colors.gold : colors.alt} />
        {ready && <View style={adventure.alert} />}
      </View>
      <Text style={adventure.railLabel}>Expeditions</Text>
    </Squish>
    <Squish reduced={reduced} onPress={() => router.push('/route-log')} style={adventure.tile}
      accessibilityLabel="Routes. Every place you have walked and the Pokemon that walked it">
      <View style={[adventure.ring, { backgroundColor: colors.mint }]}>
        <Icon name="list" size={18} color={colors.edge} />
      </View>
      <Text style={adventure.railLabel}>Routes</Text>
    </Squish>
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
  // A Dynamax form steps in its species' poses, in a red glow.
  const frames = poses[(shiny ? 'Shiny ' : '') + spriteForm(name)]
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
    {isDynamax(name) && <DynamaxAura size={size} />}
    <Image source={frames ? frames[frame] : spriteSource(name, shiny)} accessibilityLabel={name} resizeMode="contain" fadeDuration={0}
      style={{ width: size, height: size, ...(Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {}) }} />
  </Animated.View>
}

// The adventure's Pokemon stepping along, with the distance to its next hatch, evolution, Mega, Dynamax or Gigantamax
// form. status is the pill in the corner, with a red dot while live.
function Stage({ family, meters, mega, shiny, activity, status, live }: {
  family: string[], meters: number, mega: string | null, shiny: boolean, activity: Activity, status: string, live: boolean
}) {
  const form = currentForm(family, meters, mega)
  const next = nextMilestone(family, meters)
  const previous = previousMilestone(family, meters)
  const progress = next === null ? 1 : Math.max(0, Math.min(1, (meters - previous) / (next - previous)))
  return <View style={[adventure.stage, { backgroundColor: typeTints[pokemonType(form === 'Egg' ? family[0] : form)] }]}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Eyebrow>{activity === 'running' ? 'RUNNING' : 'WALKING'}</Eyebrow>
      <View style={adventure.live}><View style={[adventure.dot, !live && { backgroundColor: colors.muted }]} />
        <Text style={adventure.liveText}>{status}</Text></View>
    </View>
    <View style={{ alignItems: 'center' }}><Walker name={form} shiny={shiny} activity={activity} size={132} /></View>
    <Heading>{(shiny ? 'Shiny ' : '') + (form === 'Egg' ? `${family[0]} egg` : form)}</Heading>
    <Copy small color={colors.ink}>{next === null ? 'Final form reached!' : `${km(next - meters)} to ${milestoneLabel(next)}`}</Copy>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={[styles.track, { backgroundColor: glass(0.7) }]}>
      <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.edge }]} />
    </View>
  </View>
}

// How long ago the watch last shared its adventure, as of now.
function heardAgo(at: number, now: number) {
  const ms = Math.max(0, now - at)
  return ms < 10000 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)} s ago` : `${Math.round(ms / 60000)} min ago`
}
// After this long without a share, the watch adventure shows as quiet and its current pace is unknown.
const QUIET_MS = 180000

// The adventure your watch is recording, as it shares it about every half minute: the Pokemon, distance, time and
// pace. Watches measure distance without GPS, so there is no map or route; Continue here moves recording to the
// phone, which maps the rest of the route.
function Following({ shared, trail, handedOver }: { shared: SharedAdventure, trail: SharedTrail | null, handedOver: SharedAdventure | null }) {
  const [now, setNow] = useState(Date.now)
  const [issue, setIssue] = useState<LocationIssue | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useFocusEffect(useCallback(() => {
    setNow(Date.now())
    void checkLocation().then(setIssue)
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, []))
  const quiet = now - shared.at > QUIET_MS
  const pace = sharedPace(trail?.id === shared.id ? trail : null, now)
  // The phone takes over the watch's adventure, and the watch stops when it next hears from the cloud.
  async function continueHere() {
    setBusy(true); setError('')
    try {
      const problem = await continueAdventure(shared)
      setIssue(problem)
      if (problem && problem !== 'approximate') setError(`${issueText[problem][0]}. ${settingsHint}, then continue again.`)
    } catch (caught) {
      setError(`Could not continue recording${caught instanceof Error && caught.message ? `: ${caught.message}` : '.'}`)
    } finally {
      setBusy(false)
    }
  }
  return <>
    {handedOver && <HandedOver shared={handedOver} />}
    <Stage family={shared.family} meters={shared.meters} mega={shared.mega} shiny={shared.shiny} activity={shared.activity}
      status="ON YOUR WATCH" live={!quiet} />
    <View style={adventure.stats}>
      <Stat label="DISTANCE" value={km(shared.meters).replace(' km', '')} unit="km" />
      <Stat label="TIME" value={duration(Math.max(0, (now - shared.startedAt) / 1000))} />
      <Stat label="PACE NOW" value={(pace === null ? '--:-- /km' : averagePace(pace, 1000)).replace(' /km', '')} unit="/km" />
      <Stat label="AVERAGE PACE" value={averagePace((shared.at - shared.startedAt) / 1000, shared.meters).replace(' /km', '')} unit="/km" />
    </View>
    <Text style={[adventure.gps, quiet && { color: colors.gold }]}>{quiet
      ? `Last heard from your watch ${heardAgo(shared.at, now)}. Keep Zepp connected to follow it here.`
      : `Synced from your watch ${heardAgo(shared.at, now)}`}</Text>
    <Panel>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <IconBubble name="map" />
        <View style={{ flex: 1 }}><Eyebrow>MAP</Eyebrow><Title>No map on the watch</Title></View>
      </View>
      <Copy small>Your watch counts your steps and distance without GPS, so the map and route are drawn only while this phone records. Everything else here follows your watch.</Copy>
    </Panel>
    {issue && <LocationPanel issue={issue} />}
    {!!error && <Copy color={colors.danger}>{error}</Copy>}
    <Button title="Continue here" loading={busy} onPress={() => { void continueHere() }} />
    <Copy small>Record the rest on the phone instead: the distance so far comes along, the map draws your route from here, and the watch stops.</Copy>
  </>
}

// The adventure in progress as a live Pokemon adventure, saved or not, would look in its details: whatever the pace log
// says for splits and the fastest kilometre (src/running.ts).
const liveAdventure = (active: ActiveAdventure, now: number): Adventure => ({ id: 'live', family: active.family, device: 'phone',
  record: { meters: active.meters, steps: 0, shiny: active.shiny, activity: active.activity, finishedAt: new Date(now).toISOString(),
    startedAt: active.startedAt, elapsedSeconds: Math.max(0, (now - active.startedAt) / 1000) },
  ...(active.movingSeconds !== null ? { movingSeconds: active.movingSeconds } : {}), pace: active.pace })

// When the adventure reached a distance, in seconds from its start: the time to hatch, or the pace log's 100 m mark.
// null where it went unrecorded, as for the part an adventure continued from the watch walked there.
function secondsAt(active: ActiveAdventure, meters: number): number | null {
  if (meters === 5000 && active.hatchSeconds) return active.hatchSeconds
  const mark = meters / 100 - active.pace.start
  return mark >= 0 && mark < active.pace.at.length ? active.pace.at[mark] : null
}

// The egg's stages in one adventure, in order: hatching at 5 km, each evolution 5 km on, the Mega form at 21 km,
// Dynamax at 42 km and Gigantamax at 50 km.
const verbs: Record<number, string> = { 21000: 'Mega Evolved', 42000: 'Dynamaxed', 50000: 'Gigantamaxed' }
function stagesOf(active: ActiveAdventure) {
  return formStages(active.family, active.mega)
    .filter((stage): stage is { name: string, meters: number } => !!stage.name)
    .map((stage, i) => ({ ...stage, verb: i === 0 ? 'Hatched' : verbs[stage.meters] ?? 'Evolved' }))
}

const BAR = 56

// An adventure recording on this phone, laid out like a saved adventure's details (src/app/adventure-details.tsx): the
// route so far on a live street map fills the top, with whether it is recording and the GPS over it, and the details
// drag up over it (src/BottomSheet.tsx): the Pokemon and its next hatch or evolution, distance, time and pace, when the
// egg hatched and each form was reached, and the splits so far. Finish & save and Discard stay at the bottom; each asks
// first, in a sheet.
function Recording({ active, recording, screenOnly, shareError, onSaved }: {
  active: ActiveAdventure, recording: boolean, screenOnly: boolean, shareError: string | null, onSaved: (summary: Summary) => void
}) {
  useTheme()
  const { session, linked } = useCloud()
  const { phoneRuns, savePhoneRun, setPhoneAdventure } = useJournal()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const { height: screen } = useWindowDimensions()
  const [now, setNow] = useState(Date.now)
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The tab's own height: the tab bar sits below it, over the bottom of the sheet.
  const [box, setBox] = useState(screen)
  useFocusEffect(useCallback(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, []))
  const form = currentForm(active.family, active.meters, active.mega)
  const type = pokemonType(form === 'Egg' ? active.family[0] : form)
  const ink = typeInks[type] || colors.edge
  const elapsed = Math.max(0, (now - active.startedAt) / 1000)
  const pace = currentPace(active, now)
  const lost = !active.last || now - active.last.at > 30000
  const weak = !lost && active.last!.accuracy !== null && active.last!.accuracy > 35
  const gps = !active.last ? 'Searching for GPS…' : lost ? 'GPS signal lost' :
    weak ? `Weak GPS ±${Math.round(active.last.accuracy!)} m` : `GPS ±${Math.round(active.last.accuracy ?? 0)} m`
  const path = useMemo(() => encodePath(active.points), [active.points])
  const live = liveAdventure(active, now)
  const kilometres = splits(live)
  const next = nextMilestone(active.family, active.meters)
  const previous = previousMilestone(active.family, active.meters)
  const progress = next === null ? 1 : Math.max(0, Math.min(1, (active.meters - previous) / (next - previous)))
  const stages = stagesOf(active)
  const started = new Date(active.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const name = (active.shiny ? 'Shiny ' : '') + (form === 'Egg' ? `${active.family[0]} egg` : form)
  const FOOTER = 84
  const edge = Math.round(box * 0.5)
  const high = insets.top + BAR + 8
  const [y] = useState(() => new Animated.Value(edge))

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
  const keepGoing = active.activity === 'running' ? 'Keep running' : 'Keep walking'
  return <View style={{ flex: 1, backgroundColor: colors.panel }} onLayout={event => setBox(event.nativeEvent.layout.height)}>
    {/* The map stays put and keeps its gestures above the details, which drag up over it and then scroll. */}
    <View style={[adventure.liveMap, { height: edge + 28 }]}>
      <RouteMap path={path} here={active.last} stale={lost} live height={edge + 28} bare top={insets.top + BAR} bottom={28} zoomAt="bottomright"
        label={`Map of your route so far, ${km(active.meters)}`} />
    </View>
    <Svg pointerEvents="none" width="100%" height={insets.top + BAR + 30} style={adventure.shade}>
      <Defs>
        <LinearGradient id="liveShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.38" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height={insets.top + BAR + 30} fill="url(#liveShade)" />
    </Svg>
    <View pointerEvents="box-none" style={[adventure.liveBar, { top: insets.top + 8 }]}>
      <View accessible accessibilityLabel={`${recording ? 'Recording' : 'Recording stopped'}, ${active.activity}`} style={adventure.livePill}>
        <View style={[adventure.dot, !recording && { backgroundColor: colors.muted }]} />
        <Icon name={active.activity === 'running' ? 'run' : 'walk'} size={16} color={colors.ink} />
        <Text style={adventure.liveText}>{recording ? 'RECORDING' : 'STOPPED'}</Text>
      </View>
      <View accessible accessibilityLabel={gps} style={[adventure.livePill, (lost || weak) && { backgroundColor: colors.goldTint }]}>
        <Icon name="location" size={15} color={lost || weak ? colors.gold : colors.edge} />
        <Text style={[adventure.gpsPill, (lost || weak) && { color: colors.gold }]}>{gps}</Text>
      </View>
    </View>

    <BottomSheet low={edge} high={high} y={y} contentStyle={[adventure.liveContent, { paddingBottom: FOOTER + screen - box + insets.bottom + 24 }]}
      header={<View style={adventure.liveTop}><View style={adventure.grabber} /></View>}>
      {!recording && <View style={[adventure.alertCard, { backgroundColor: colors.goldTint }]}>
        <Text style={[adventure.alertTitle, { color: colors.gold }]}>Recording stopped</Text>
        <Text style={adventure.note}>Your phone stopped sending locations. Distance so far is kept.</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Button title="Resume" loading={busy && !confirm} onPress={() => { void resume() }} /></View>
          <View style={{ flex: 1 }}><Button title="Settings" secondary onPress={() => { void openLocationSettings(null) }} /></View>
        </View>
      </View>}
      {screenOnly && <View style={[adventure.alertCard, { backgroundColor: colors.sunken }]}>
        <Text style={adventure.alertTitle}>Keep Zepimon open</Text>
        <Text style={adventure.note}>For now it records only while on screen.</Text>
        <Button title="Record with the screen off" secondary disabled={busy} onPress={() => { void recordInBackground() }} />
      </View>}
      {!!error && <Text style={[adventure.note, { color: colors.danger }]}>{error}</Text>}

      <View style={adventure.hero}>
        <View style={[adventure.heroArt, { backgroundColor: typeTints[type] || colors.sunken }]}>
          <Walker name={form} shiny={active.shiny} activity={active.activity} size={72} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text numberOfLines={1} style={adventure.heroName}>{name}</Text>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} style={adventure.heroTrack}>
            <View style={[adventure.heroFill, { width: `${progress * 100}%`, backgroundColor: ink }]} />
          </View>
          <Text style={adventure.heroNext}>{next === null ? 'Final form reached' : `${km(next - active.meters)} to ${milestoneLabel(next)}`}</Text>
        </View>
      </View>

      <View style={adventure.liveStats}>
        <View accessible accessibilityLabel={`Distance ${km(active.meters)}`} style={adventure.distance}>
          <Text style={adventure.distanceValue}>{(Math.max(0, active.meters) / 1000).toFixed(2)}</Text>
          <Text style={adventure.distanceUnit}>km</Text>
        </View>
        <View style={adventure.statRow}>
          <LiveStat value={clock(elapsed)} label="Time" />
          <LiveStat value={paceText(pace)} label="Pace /km" divided />
          {/* Over moving time, as the saved adventure's details show it. */}
          <LiveStat value={paceText(runPace(live))} label="Avg /km" divided />
        </View>
        <View style={[adventure.statRow, adventure.statRowDivided]}>
          <LiveStat value={clock(active.movingSeconds)} label="Moving" />
          <LiveStat value={paceText(fastestPace(live))} label="Fastest /km" divided />
          <LiveStat value={started} label="Started" divided />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={adventure.heading}>Your egg</Text>
        <TimelineRow sprite="Egg" shiny={active.shiny} title={`${active.family[0]} egg`} detail={`Started ${started}`} done first last={!stages.length} ink={ink} />
        {stages.map((stage, i) => {
          const done = active.meters >= stage.meters
          const at = done ? secondsAt(active, stage.meters) : null
          return <TimelineRow key={stage.name} sprite={stage.name} shiny={active.shiny} done={done} last={i === stages.length - 1} ink={ink}
            title={`${stage.verb} into ${stage.name}`}
            detail={done ? `${stage.meters / 1000} km${at !== null ? ` · ${clock(at)}` : ''}` : `At ${stage.meters / 1000} km · ${km(stage.meters - active.meters)} to go`} />
        })}
      </View>

      {kilometres.length > 0 && <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={adventure.heading}>Splits</Text>
        {kilometres.map(split => <View key={split.km} accessible style={adventure.split}
          accessibilityLabel={`${split.meters === 1000 ? `Kilometre ${split.km}` : `Last ${km(split.meters)}`}: ${paceText(split.pace)} per kilometre`}>
          <Text style={adventure.splitKm}>{split.meters === 1000 ? split.km : (split.meters / 1000).toFixed(1)}</Text>
          <Text style={adventure.splitPace}>{paceText(split.pace)}</Text>
          <View style={adventure.splitTrack}>
            <View style={[adventure.splitBar, { backgroundColor: ink,
              width: `${Math.round(100 * (0.35 + 0.65 * splitShare(split.pace, kilometres.map(item => item.pace))))}%` }]} />
          </View>
        </View>)}
      </View>}

      {/* Whether your watch and Zepp can see this adventure: they follow it through your account. */}
      {session && linked && shareError !== null && <View style={adventure.noteRow}>
        <Icon name="watch" size={16} color={shareError ? colors.gold : colors.muted} />
        <Text style={[adventure.note, { flex: 1 }, shareError ? { color: colors.gold } : null]}>
          {shareError ? `Not shared with your watch yet: ${shareError}` : 'Shared with your watch and Zepp'}</Text>
      </View>}
    </BottomSheet>

    <View style={[adventure.liveFooter, { height: FOOTER }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Discard" onPress={() => setConfirm('discard')}
        style={({ pressed }) => [adventure.discard, { opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="close" size={24} color={colors.danger} />
      </Pressable>
      <View style={{ flex: 1 }}><Button title="Finish & save" onPress={() => setConfirm('finish')} /></View>
    </View>

    <MapSheet visible={confirm === 'finish'} title="Save this adventure?" onClose={() => { if (!busy) setConfirm(null) }} reduced={reduced}>
      <View style={[styles.row, { flexWrap: 'nowrap' }]}>
        <View style={[adventure.tipArt, { backgroundColor: typeTints[type] || colors.sunken }]}><PixelSprite name={form} shiny={active.shiny} size={40} /></View>
        <View style={{ flex: 1 }}>
          <Text style={adventure.heroName}>{km(active.meters)}</Text>
          <Text style={adventure.note}>{clock(elapsed)} · {name}</Text>
        </View>
      </View>
      {form === 'Egg' && <Text style={adventure.note}>Under 5 km, so this one ends as an egg.</Text>}
      {!!error && <Text style={[adventure.note, { color: colors.danger }]}>{error}</Text>}
      <Button title="Save & finish" loading={busy} onPress={() => { void save() }} />
      <Button title={keepGoing} secondary disabled={busy} onPress={() => setConfirm(null)} />
    </MapSheet>
    <MapSheet visible={confirm === 'discard'} title="Discard this adventure?" onClose={() => setConfirm(null)} reduced={reduced}>
      <Text style={adventure.note}>The distance and route are deleted. Nothing is saved.</Text>
      <Button title="Discard" secondary onPress={() => { void clearAdventure().then(() => setPhoneAdventure(null)).catch(() => {}) }} />
      <Button title={keepGoing} onPress={() => setConfirm(null)} />
    </MapSheet>
  </View>
}

// How fast a split was among the others, from 0 for the slowest to 1 for the fastest.
function splitShare(pace: number, paces: number[]) {
  const slowest = Math.max(...paces), quickest = Math.min(...paces)
  return slowest === quickest ? 1 : (slowest - pace) / (slowest - quickest)
}

// One cell of the live stats: a big value over a small label, split from its neighbour by a hairline.
function LiveStat({ value, label, divided = false }: { value: string, label: string, divided?: boolean }) {
  return <View accessible accessibilityLabel={`${label}: ${value}`} style={[adventure.liveStat, divided && adventure.liveStatDivided]}>
    <Text style={adventure.liveStatValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={adventure.liveStatLabel} numberOfLines={1}>{label}</Text>
  </View>
}

// A step of the egg's journey: the form, then when it was reached, or how far it is. A line joins the steps, coloured
// up to the latest one reached. A form not reached yet is a silhouette with its name hidden, as in the games, until the
// adventure gets there.
function TimelineRow({ sprite, shiny, title, detail, done, first = false, last, ink }: {
  sprite: string, shiny: boolean, title: string, detail: string, done: boolean, first?: boolean, last: boolean, ink: string
}) {
  return <View accessible accessibilityLabel={`${done ? title : 'Not reached yet'}. ${detail}`} style={adventure.step}>
    <View style={adventure.stepRail}>
      {!first && <View style={[adventure.stepLine, { top: 0, height: 10, backgroundColor: done ? ink : colors.line }]} />}
      <View style={[adventure.stepArt, done && { borderColor: ink }]}>
        <PixelSprite name={sprite} shiny={shiny} size={34} tint={done ? undefined : colors.ink} />
      </View>
      {!last && <View style={[adventure.stepLine, { bottom: 0, height: 10, backgroundColor: colors.line }]} />}
    </View>
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={[adventure.stepTitle, !done && { color: colors.muted }]}>{done ? title : '???'}</Text>
      <Text numberOfLines={1} style={adventure.stepDetail}>{detail}</Text>
    </View>
    {done ? <Icon name="check" size={20} color={ink} /> : <Icon name="lock" size={18} color={colors.muted} />}
  </View>
}

function Stat({ label, value, unit }: { label: string, value: string, unit?: string }) {
  return <View accessible accessibilityLabel={`${label.toLowerCase()} ${value} ${unit ?? ''}`} style={adventure.stat}>
    <Eyebrow color={colors.muted}>{label}</Eyebrow>
    <Text numberOfLines={1} style={adventure.statValue}>{value}{unit && <Text style={adventure.statUnit}> {unit}</Text>}</Text>
  </View>
}

function Saved({ summary: { run, news }, onDone }: { summary: Summary, onDone: () => void }) {
  const { session, linked } = useCloud()
  const form = run.record.form || 'Egg'
  const earned = earnedForms(run.family, run.record.meters, run.record.mega ?? null)
  return <>
    <Panel style={{ alignItems: 'center' }}>
      <Eyebrow>ADVENTURE SAVED</Eyebrow>
      <PixelSprite name={form} shiny={run.record.shiny} size={120} />
      <Heading>{run.record.shiny ? 'Shiny ' : ''}{form === 'Egg' ? `${run.family[0]} egg` : form}</Heading>
      <Copy color={colors.ink}>{km(run.record.meters)} · {duration(run.record.elapsedSeconds)} · {averagePace(run.movingSeconds ?? run.record.elapsedSeconds, run.record.meters)}</Copy>
      {run.movingSeconds !== undefined && <Copy small>Moving time {duration(run.movingSeconds)}</Copy>}
    </Panel>
    <RouteMap path={run.path} height={260} label={`Map of the route, ${km(run.record.meters)}`} />
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

const adventure = themedStyles(() => ({
  art: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // The card over the map, in the map's own look: small square corners, pixel letters, hard edges.
  egg: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  eggArt: { width: 40, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line },
  eggLabel: { fontFamily: fonts.pixel, fontSize: 10, lineHeight: 13, letterSpacing: 1, color: colors.muted },
  eggName: { fontFamily: fonts.pixel, fontSize: 15, lineHeight: 19, color: colors.ink },
  square: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  change: { backgroundColor: colors.mint, borderWidth: 1.5, borderColor: colors.mintLine },
  // Walk and Run: a two-line menu, the chosen line lit with the games' cursor before it.
  modes: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 6,
    borderWidth: 2, borderColor: colors.line, backgroundColor: colors.sunken },
  modeOn: { borderColor: colors.edge, backgroundColor: colors.mint },
  modeText: { fontFamily: fonts.pixel, fontSize: 14, color: colors.muted },
  // Start: a raised key on a hard shadow that presses down into it.
  start: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 8, borderWidth: 2,
    borderColor: colors.frameOuter ?? colors.edge, boxShadow: `0px 3px 0px ${colors.frameOuter ?? 'rgba(16, 24, 40, 0.45)'}` },
  startPressed: { transform: [{ translateY: 2 }], boxShadow: `0px 1px 0px ${colors.frameOuter ?? 'rgba(16, 24, 40, 0.45)'}` },
  startText: { fontFamily: fonts.pixel, fontSize: 16, lineHeight: 20, color: colors.onBrand },
  // The folded card: a framed button like the rest on the map, the egg in it and the activity in a corner badge.
  bubble: { flex: 1, alignItems: 'center', justifyContent: 'center', ...gbaBox(12) },
  bubbleRule: { position: 'absolute', left: 2, top: 2, right: 2, bottom: 2, borderRadius: 8, borderWidth: 1.5, borderColor: colors.frameInner ?? colors.line },
  bubbleArt: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bubbleBadge: { position: 'absolute', left: -6, bottom: -6, width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.edge, borderWidth: 2, borderColor: colors.panel },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // A milestone's tip on the map.
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipArt: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  tipDate: { fontFamily: fonts.pixel, fontSize: 15, lineHeight: 20, color: colors.ink },
  tipFact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipFactText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.muted },
  tipLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 40, borderRadius: 999, backgroundColor: colors.mint },
  tipLinkText: { fontFamily: fonts.heavy, fontSize: 14, color: colors.edge },
  // The live adventure: map, the bar over it, the details sheet and the footer.
  liveMap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', backgroundColor: colors.sunken },
  shade: { position: 'absolute', top: 0, left: 0 },
  liveBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.panel,
    boxShadow: `0px 4px 12px ${colors.shadow}` },
  gpsPill: { fontFamily: fonts.heavy, fontSize: 12, color: colors.ink },
  liveTop: { height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderTopLeftRadius: retro() ? 12 : 28,
    borderTopRightRadius: retro() ? 12 : 28, boxShadow: `0px -6px 18px ${colors.shadow}` },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line },
  liveContent: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 4, gap: 18 },
  alertCard: { borderRadius: 18, padding: 14, gap: 8 },
  alertTitle: { fontFamily: fonts.heavy, fontSize: 15, color: colors.ink },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroArt: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  heroName: { fontFamily: displayFont(fonts.black), fontSize: retro() ? 18 : 21, lineHeight: 27, color: colors.ink },
  heroTrack: { height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.sunken },
  heroFill: { height: 10, borderRadius: 5 },
  heroNext: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  liveStats: { backgroundColor: colors.sunken, borderRadius: 18 },
  distance: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, paddingTop: 16 },
  distanceValue: { fontFamily: fonts.black, fontSize: 52, lineHeight: 60, color: colors.ink, fontVariant: ['tabular-nums'] },
  distanceUnit: { fontFamily: fonts.heavy, fontSize: 18, color: colors.muted },
  statRow: { flexDirection: 'row', paddingVertical: 14 },
  statRowDivided: { borderTopWidth: 1, borderTopColor: colors.line },
  liveStat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  liveStatDivided: { borderLeftWidth: 1, borderLeftColor: colors.line },
  liveStatValue: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] },
  liveStatLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 12, lineHeight: 16 },
  heading: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 17, lineHeight: 23, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  stepRail: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  stepLine: { position: 'absolute', width: 3, borderRadius: 2 },
  stepArt: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
    borderWidth: 2, borderColor: colors.line },
  stepTitle: { fontFamily: fonts.heavy, fontSize: 15, lineHeight: 20, color: colors.ink },
  stepDetail: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.muted },
  split: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  splitKm: { width: 30, fontFamily: fonts.bold, color: colors.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  splitPace: { width: 48, fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, fontVariant: ['tabular-nums'] },
  splitTrack: { flex: 1, height: 22, justifyContent: 'center' },
  splitBar: { height: 22, borderRadius: 4 },
  liveFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20,
    backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.line },
  discard: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.dangerTint },
  // The buttons on the map, framed like the games' text boxes (gbaBox in src/RouteTrail.tsx).
  location: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 8, paddingVertical: 5, ...gbaBox(8) },
  locationIcon: { width: 26, height: 26, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  locationState: { fontFamily: fonts.pixel, fontSize: 11, lineHeight: 14 },
  switch: { width: 26, height: 16, borderRadius: 4, padding: 2, backgroundColor: colors.line },
  knob: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#FFFFFF' },
  tile: { width: 66, alignItems: 'center', gap: 3, paddingVertical: 6, ...gbaBox(8) },
  ring: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  railLabel: { fontFamily: fonts.pixel, fontSize: 10, lineHeight: 13, color: colors.ink },
  alert: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.panel },
  stage: { borderRadius: 24, padding: 18, gap: 8, borderWidth: 1, borderColor: colors.line },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: glass(0.8) },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  liveText: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1, color: colors.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '45%', flexGrow: 1, backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 28, lineHeight: 36 },
  statUnit: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 15 },
  gps: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, textAlign: 'center' }
}))
