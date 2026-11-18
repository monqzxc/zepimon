import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { router } from 'expo-router'
import { useJournal } from './store'
import { allAdventures } from './adventures'
import type { Adventure } from './adventures'
import { km } from './journal'
import { formChoices, gigantamaxChoices, megaChoices, openEggs } from './phone-adventure'
import { currentAdventure, startAdventure } from './tracker'
import type { LocationIssue } from './tracker'
import { pokemonType } from './catalog'
import { clock, paceText } from './running'
import { PixelSprite } from './games/TeamPicker'
import { ConfirmDialog } from './ConfirmDialog'
import { gymPermitsLeft } from './expedition-quest'
import { pickGymEgg, usePickedGymEgg } from './gym-egg'
import { gymOrder, gyms, sessionMeters, sessionSeconds, stepUpNote } from './training-plans'
import type { Gym, GymId, Level, Session } from './training-plans'
import { baselineFrom, canSkip, currentWeek, eggAllowed, entryCheck, isOpen, matchCandidates, maxStars, nextSession, paceZones, progressOf,
  refreshOffer, retryClosed, retryUntil, starsOf, suggestGym, takesBreaks, unlockAt, warmth, welcomeBack } from './training'
import type { ActivePlan } from './training'
import { Button, Chip, Copy, Heading, Icon, Panel, Title, colors, displayFont, fonts, styles, themedStyles, typeTints, useTheme } from './ui'

// Gym Training's screens (src/app/gym.tsx). An Operate screen: it answers "what do I do today?" first, with the next
// session and its Start; then the plan egg and the plan as a ladder of weeks ending in the egg (the one element only
// Zepimon has, drawn from the plan's own sessions), your paces, saved adventures that could count, the week, and the
// badge case.
const DAY = 864e5
const SAFETY = 'These plans are general fitness guidance, not medical advice. If you have a health condition, are pregnant or haven\'t ' +
  'exercised in a long time, check with a doctor first. Stop if you feel pain, dizziness or chest discomfort.'
const LONG_SAFETY = 'Marathon and ultra training puts real strain on your body. Sleep, food and water matter as much as the runs. Sharp or ' +
  'worsening pain is a reason to stop, not to push through. Use Pause freely; the plan waits for you.'
const ULTRA_SAFETY = 'Tell someone your route on long runs, carry water and a phone, and be ready to cut a run short in heat.'
const levelNames: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', elite: 'The summit', beyond: 'Beyond the marathon' }

const randomEgg = (opened: string[][]) => opened[Math.floor(Math.random() * opened.length)]
const fitsGym = (gym: GymId) => (family: string[]) => eggAllowed(gym, family, { megas: megaChoices(family), gigantamax: gigantamaxChoices(family) })

const locationProblems: Partial<Record<LocationIssue, string>> = {
  off: 'Location is off. Turn it on to record the session.',
  denied: 'Location is not allowed. Allow it while using Zepimon, then start again.',
  blocked: 'Location is blocked. Allow it for Zepimon in its settings, then start again.'
}

// Each Gym's badge colour, used on its emblem and its ladder.
const badgeHue = (gym: GymId) => ({ 'steady-steps': colors.success, 'first-hatch': colors.gold, 'evolution-road': colors.alt,
  'speed-gym': colors.star, 'mega-trial': colors.edge, 'dynamax-marathon': colors.danger, 'gigantamax-ultra': colors.ink })[gym]

// How much a week asks: in the beginner plans the longest walk or the most jogging in one session, in minutes; in the
// running plans the week's kilometres, before the graduation.
function weekAmount(gym: Gym, week: Session[]): number {
  const plain = week.filter(item => item.kind !== 'graduation')
  if (gym.paced) return Math.round(plain.reduce((sum, item) => sum + sessionMeters(item), 0) / 1000)
  const minutes = plain.map(item => item.kind === 'walk' ? sessionSeconds(item)
    : item.steps.filter(step => step.kind === 'jog' || step.kind === 'run').reduce((sum, step) => sum + (step.seconds ?? 0), 0))
  return Math.round(Math.max(0, ...minutes) / 60)
}
const ladderUnit = (gym: Gym) => gym.paced ? 'Kilometres each week' : `Minutes of ${gym.activity === 'running' ? 'jogging' : 'walking'} each week`

// The plan as a ladder: one bar per week, as tall as that week asks, filled once its sessions are done, the current week
// outlined, and the egg waiting at the top for the graduation.
function PlanLadder({ gym, plan, height = 64 }: { gym: Gym, plan?: ActivePlan, height?: number }) {
  const amounts = gym.weeks.map(week => weekAmount(gym, week))
  const most = Math.max(...amounts)
  const week = plan ? currentWeek(plan) : -1
  const hue = badgeHue(gym.id)
  return <View accessible accessibilityLabel={`${gym.weeks.length} weeks, from ${amounts[0]} to ${most} ${gym.paced ? 'kilometres a week' : 'minutes'}, then the graduation` +
    (plan ? `. You are in week ${week + 1}.` : '')} style={[sheet.ladder, { height }]}>
    {amounts.map((value, i) => {
      const done = plan && gym.weeks[i].every(item => plan.done[item.id])
      const now = i === week
      return <View key={i} style={sheet.rung}>
        <View style={[sheet.bar, { height: Math.max(6, (height - 18) * value / most) },
          done ? { backgroundColor: hue } : now ? { borderWidth: 2, borderColor: hue, backgroundColor: colors.panel } : { backgroundColor: colors.track }]} />
        <Text style={[sheet.rungLabel, now && { color: colors.ink }]}>{value}</Text>
      </View>
    })}
    <View style={sheet.rungEgg}><PixelSprite name="Egg" size={30} /></View>
  </View>
}

// Your paces in one small table, from your 5 km best. The half marathon figure is an estimate and says so.
function PaceTable({ baseline, gym }: { baseline: number, gym: GymId }) {
  const zones = paceZones(baseline)
  const rows: [string, [number, number], string][] = [['Easy', zones.easy, 'You could chat the whole way'],
    ['Tempo', zones.tempo, 'Comfortably hard'], ['Fast', zones.interval, 'Hard: about your 5 km pace'],
    ...gym === 'mega-trial' ? [['Half pace', zones.half, 'Your half marathon goal'] as [string, [number, number], string]] : [],
    ...gym === 'dynamax-marathon' || gym === 'gigantamax-ultra' ? [['Marathon pace', zones.marathon, 'Steady, for hours'] as [string, [number, number], string]] : []]
  return <View style={{ gap: 8 }}>
    {rows.map(([name, [fast, slow], feel]) => <View key={name} accessible accessibilityLabel={`${name}: ${paceText(fast)} to ${paceText(slow)} per kilometre. ${feel}`}
      style={sheet.paceRow}>
      <View style={{ flex: 1 }}>
        <Text style={sheet.paceName}>{name}</Text>
        <Text style={sheet.caption}>{feel}</Text>
      </View>
      <Text style={sheet.paceValue}>{paceText(fast)}–{paceText(slow)}<Text style={sheet.paceUnit}> /km</Text></Text>
    </View>)}
    <Text style={sheet.caption}>From your 5 km best of {clock(baseline)}.{gym === 'mega-trial'
      ? ` Estimated half marathon: ${clock(zones.halfEstimate)}. An estimate, not a promise.`
      : gym === 'dynamax-marathon' ? ` Estimated marathon: ${clock(zones.marathonEstimate)}. An estimate, often optimistic until your long runs reach 30 km.` : ''}</Text>
  </View>
}

export function GymPicker() {
  useTheme()
  const { progress, phoneRuns, training, expeditions, startGym } = useJournal()
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const [now] = useState(Date.now)
  const suggested = useMemo(() => suggestGym(adventures, training.badges, now), [adventures, training.badges, now])
  const baseline = useMemo(() => baselineFrom(adventures, now), [adventures, now])
  const [choosing, setChoosing] = useState<GymId | null>(null)
  const opened = useMemo(() => openEggs(expeditions.dex), [expeditions.dex])
  const picked = usePickedGymEgg()
  const [fallback, setFallback] = useState<string[]>(() => randomEgg(opened))
  const egg = picked && choosing && fitsGym(choosing)(picked) ? picked : fallback
  // The Mega or Gigantamax form the graduation reaches, where the egg has a choice.
  const forms = formChoices(egg)
  const [mega, setMega] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function choose(gym: GymId) {
    setChoosing(gym); setError(''); setMega(null); setConfirmed(false)
    const allowed = opened.filter(fitsGym(gym))
    if (!fitsGym(gym)(fallback)) setFallback(randomEgg(allowed))
  }
  async function begin(gym: GymId) {
    setBusy(true); setError('')
    try { await startGym(gym, egg, forms.length ? mega && forms.includes(mega) ? mega : forms[0] : null); pickGymEgg(null) } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start this Gym. Please try again.')
    } finally { setBusy(false) }
  }
  const levels: Level[] = ['beginner', 'intermediate', 'advanced', 'elite', 'beyond']
  return <>
    <View style={{ gap: 6 }}>
      <Heading>Choose a Gym</Heading>
      <Copy>Each plan builds up week by week to one adventure that hatches, evolves or Mega Evolves the egg you bring.</Copy>
    </View>
    {[{ title: 'Suggested for you', ids: [suggested] }, ...levels.map(level => ({ title: levelNames[level], ids: gymOrder.filter(id => gyms[id].level === level && id !== suggested) }))]
      .filter(group => group.ids.length).map(group => <View key={group.title} style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={sheet.level}>{group.title}</Text>
      {group.ids.map(id => {
        const gym = gyms[id]
        const open = choosing === id
        const badge = training.badges[id]
        const check = entryCheck(id, adventures, training.badges, now)
        return <Panel key={id} style={open ? { borderColor: colors.edge, borderWidth: 2 } : undefined}>
          <View style={sheet.row}>
            <BadgeEmblem gym={gym} earned={!!badge} />
            <View style={{ flex: 1, gap: 2 }}>
              <Title>{gym.name}</Title>
              <Text style={sheet.meta}>{levelNames[gym.level]} · {gym.weeks.length} weeks · {gym.weeks[0].length} sessions a week</Text>
            </View>
          </View>
          <Copy color={colors.ink}>{gym.blurb}</Copy>
          <PlanLadder gym={gym} />
          <Text style={sheet.caption}>{ladderUnit(gym)}, then {gym.weeks.at(-1)!.at(-1)!.title.split(':')[0]}.</Text>
          {badge && <Copy small color={colors.gold}>{gym.badge} earned {new Date(badge.at).toLocaleDateString()}{badge.time ? ` with ${clock(badge.time)}` : ''}. You can train here again.</Copy>}
          {!check.ok && <Copy small color={colors.gold}>{check.reason}</Copy>}
          {!open ? check.locked && !check.confirm ? null : <Button title={`Choose ${gym.name}`} secondary={suggested !== id} onPress={() => choose(id)} /> : <View style={{ gap: 12 }}>
            <View style={sheet.row}>
              <View style={[sheet.eggArt, { backgroundColor: typeTints[pokemonType(egg[0])] || colors.sunken }]}><PixelSprite name="Egg" size={44} /></View>
              <View style={{ flex: 1 }}>
                <Title>Your plan egg: {egg[0]}</Title>
                <Copy small>{gym.eggRule === 'gigantamax' ? 'It hatches at 5 km, evolves on the way, Dynamaxes at 42 km and Gigantamaxes at 50 km on Gigantamax Day.'
                  : gym.id === 'dynamax-marathon' ? `It hatches at 5 km, evolves on the way${megaChoices(egg).length ? ', Mega Evolves at 21 km' : ''} and Dynamaxes at 42 km on Dynamax Day.`
                    : gym.eggRule === 'mega' ? 'It hatches at 5 km, evolves on the way, and Mega Evolves at 21 km on Summit Day.'
                      : gym.eggRule === 'evolves' ? 'It hatches at 5 km and evolves at 10 km on Evolution Day.'
                        : 'It warms with every session and hatches at 5 km on the last day.'}</Copy>
              </View>
            </View>
            {forms.length > 1 && (gym.eggRule !== 'any' || gym.graduationMeters >= 42195) && <View style={styles.row}>
              {forms.map(name => <Chip key={name} label={name} selected={(mega && forms.includes(mega) ? mega : forms[0]) === name} onPress={() => setMega(name)} />)}
            </View>}
            <Button title="Choose another egg" secondary onPress={() => router.push({ pathname: '/eggs',
              params: { for: 'gym', current: egg.join('>'), ...gym.eggRule !== 'any' ? { rule: gym.eggRule } : {} } })} />
            {gym.paced && (baseline ? <PaceTable baseline={baseline} gym={id} />
              : <Copy small>{id === 'speed-gym' ? 'No 5 km best in the last 12 weeks, so the plan starts with a 5 km entry trial that sets your paces.'
                : 'No 5 km best in the last 12 weeks: run by feel. Easy means you could chat; tempo is comfortably hard. Stars for pace need a 5 km best.'}</Copy>)}
            <Copy small>{SAFETY}</Copy>
            {(gym.level === 'elite' || gym.level === 'beyond') && <Copy small>{LONG_SAFETY}{gym.level === 'beyond' ? ` ${ULTRA_SAFETY}` : ''}</Copy>}
            {check.confirm && <Chip label={check.confirm} selected={confirmed} onPress={() => setConfirmed(!confirmed)} />}
            {!!error && <Copy small color={colors.danger}>{error}</Copy>}
            <Button title={check.ok ? `Start ${gym.name}` : 'Start anyway'} loading={busy} disabled={!!check.locked && !confirmed}
              onPress={() => { void begin(id) }} />
            <Button title="Not now" secondary disabled={busy} onPress={() => setChoosing(null)} />
          </View>}
        </Panel>
      })}
    </View>)}
    <BadgeCase />
  </>
}

// A Gym Badge: a faceted emblem in the Gym's colour once earned, an empty outline before, with its own mark.
const marks: Record<GymId, string> = {
  'steady-steps': 'M24 33 C24 27 24 22 24 19 M24 25 C20 25 18 22 18 19 C21 19 24 21 24 25 M24 23 C28 23 30 20 30 17 C27 17 24 19 24 23',
  'first-hatch': 'M24 15 C29 15 32 22 32 27 C32 31.5 28.5 34 24 34 C19.5 34 16 31.5 16 27 C16 22 19 15 24 15 Z M20 25 L23 27.5 L21.5 30',
  'evolution-road': 'M24 34 L24 16 M17 23 L24 16 L31 23 M18 31 L24 25 L30 31',
  'speed-gym': 'M26 14 L18 26 L24 26 L22 34 L30 22 L24 22 Z',
  'mega-trial': 'M14 32 L21 20 L25 26 L28 22 L34 32 Z M21 20 L23 23',
  'dynamax-marathon': 'M16 24 A8 8 0 1 0 32 24 A8 8 0 1 0 16 24 M24 11 L24 15 M24 33 L24 37 M11 24 L15 24 M33 24 L37 24',
  'gigantamax-ultra': 'M24 12 L27.5 20.5 L36 21 L29.5 26.5 L31.5 35 L24 30.5 L16.5 35 L18.5 26.5 L12 21 L20.5 20.5 Z'
}
function BadgeEmblem({ gym, earned, size = 48 }: { gym: Gym, earned: boolean, size?: number }) {
  const hue = badgeHue(gym.id)
  return <View accessible accessibilityLabel={`${gym.badge}${earned ? ', earned' : ', not earned yet'}`} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M24 3 L42 13 L42 35 L24 45 L6 35 L6 13 Z" fill={earned ? hue : 'none'} stroke={earned ? hue : colors.line} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M24 11 L35 17 L35 31 L24 37 L13 31 L13 17 Z" fill={earned ? colors.panel : 'none'} opacity={earned ? 0.35 : 1}
        stroke={earned ? 'none' : colors.line} strokeWidth={2} strokeLinejoin="round" />
      <Path d={marks[gym.id]} fill="none" stroke={earned ? colors.onBrand : colors.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </View>
}

// Stars, drawn: earned ones filled, the rest outlined.
function Stars({ earned, of }: { earned: number, of: number }) {
  return <View accessible accessibilityLabel={`${earned} of ${of} stars`} style={sheet.stars}>
    {Array.from({ length: of }, (_, i) => <Svg key={i} width={14} height={14} viewBox="0 0 24 24">
      <Path d="M12 2.5 L14.9 8.6 L21.5 9.4 L16.6 13.9 L17.9 20.5 L12 17.2 L6.1 20.5 L7.4 13.9 L2.5 9.4 L9.1 8.6 Z"
        fill={i < earned ? colors.star : 'none'} stroke={i < earned ? colors.star : colors.line} strokeWidth={2} strokeLinejoin="round" />
    </Svg>)}
  </View>
}

export function BadgeCase() {
  const { training, quest, claimGymPermits } = useJournal()
  const [note, setNote] = useState('')
  const left = gymPermitsLeft(quest, Object.keys(training.badges).length)
  return <Panel>
    <Title>Badge case</Title>
    <View style={sheet.badges}>
      {gymOrder.map(id => {
        const badge = training.badges[id]
        return <View key={id} style={sheet.badgeItem}>
          <BadgeEmblem gym={gyms[id]} earned={!!badge} size={56} />
          <Text style={sheet.badgeName}>{gyms[id].badge}</Text>
          {badge?.time && <Text style={sheet.caption}>{clock(badge.time)}</Text>}
          {badge?.pacer && <Text style={sheet.caption}>Mega Pacer</Text>}
          {badge?.wall && <Text style={sheet.caption}>Wall Breaker</Text>}
          {badge?.steady && <Text style={sheet.caption}>Ultra Steady</Text>}
        </View>
      })}
    </View>
    {left > 0 && <Button title={`Claim ${left} Expedition Permit${left === 1 ? '' : 's'}`}
      onPress={() => { claimGymPermits().then(() => setNote('Claimed. Use it in Legendary Expeditions.')).catch(() => setNote('Could not claim. Please try again.')) }} />}
    {!!note && <Copy small color={colors.gold}>{note}</Copy>}
    <Copy small>Every Gym Badge earns one Expedition Permit.</Copy>
  </Panel>
}

// The plan egg, with cracks drawn in as it warms: one at a quarter, two at half, three at three quarters.
function Incubator({ family, warm }: { family: string[], warm: number }) {
  const cracks = warm >= 0.75 ? 3 : warm >= 0.5 ? 2 : warm >= 0.25 ? 1 : 0
  const lines = ['M30 22 L35 27 L32 31 L37 35', 'M47 30 L43 34 L46 38', 'M36 44 L40 47 L38 51 L42 54']
  return <View style={[sheet.incubator, { backgroundColor: typeTints[pokemonType(family[0])] || colors.sunken }]}>
    <PixelSprite name="Egg" size={64} />
    {cracks > 0 && <Svg width={84} height={84} viewBox="0 0 84 84" style={{ position: 'absolute' }} pointerEvents="none">
      {lines.slice(0, cracks).map(d => <Path key={d} d={d} fill="none" stroke="#2b2238" strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter" />)}
    </Svg>}
  </View>
}

const weekday = (time: number) => new Date(time).toLocaleDateString(undefined, { weekday: 'long' })
function opensText(at: number, now: number) {
  if (at <= now) return 'Open now'
  return at - now < DAY ? 'Opens tomorrow' : `Opens ${weekday(at)}`
}
function sessionLength(session: Session) {
  const meters = sessionMeters(session)
  if (meters) return `${(meters / 1000).toFixed(meters % 1000 ? 1 : 0)} km`
  return `${Math.round(sessionSeconds(session) / 60)} min`
}

export function GymPlan({ plan, now }: { plan: ActivePlan, now: number }) {
  useTheme()
  const { training, progress, phoneRuns, plan: shared, chooseEgg, setPhoneAdventure, skipGymSession, gymGoBack, pauseGym, resumeGym, quitGym,
    countForGym, declineForGym, refreshGymZones, setGymRunWalk, expeditions } = useJournal()
  const gym = gyms[plan.gym]
  const next = nextSession(plan)
  const week = currentWeek(plan)
  const { done, total } = progressOf(plan)
  const stars = starsOf(plan)
  const warm = warmth(plan)
  const open = isOpen(plan, now)
  const back = welcomeBack(plan, now)
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const matches = matchCandidates(training, adventures, now)
  const refresh = refreshOffer(plan, adventures, now)
  const opened = useMemo(() => openEggs(expeditions.dex), [expeditions.dex])
  const [confirm, setConfirm] = useState<'quit' | 'skip' | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const act = (work: Promise<void>, done = '') => work.then(() => { setError(''); setNote(done) }).catch(caught => setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'))
  const missed = plan.trials.at(-1)
  const closed = retryClosed(plan, now)

  async function startSession() {
    if (!next) return
    if (currentAdventure()) { router.navigate('/adventure'); return }
    setBusy(true); setError('')
    // A graduation carries the plan egg; other sessions the egg chosen in the Adventure tab, or a random one.
    const planned = shared?.egg && opened.find(item => item.join('>') === shared.egg!.family.join('>'))
    const family = next.kind === 'graduation' ? plan.egg.family : planned ?? randomEgg(opened)
    const mega = next.kind === 'graduation' ? plan.egg.mega : planned ? shared!.egg!.mega : null
    try {
      const breaks = plan.runWalk && takesBreaks(next) ? { breaks: plan.runWalk } : {}
      const problem = await startAdventure(family, gym.activity, mega, { gym: plan.gym, session: next.id, ...breaks })
      const message = problem && locationProblems[problem]
      if (message) setError(message)
      else {
        const started = currentAdventure()
        if (started) setPhoneAdventure({ family: started.family, activity: started.activity, startedAt: started.startedAt }).catch(() => {})
        router.navigate('/adventure')
      }
    } catch (caught) {
      setError(`Could not start recording${caught instanceof Error && caught.message ? `: ${caught.message}` : '.'}`)
    } finally { setBusy(false) }
  }

  const weekSessions = gym.weeks[week]
  const opens = unlockAt(plan)
  const graduationName = gym.weeks.at(-1)!.at(-1)!.title.split(':')[0]
  return <>
    {back > 0 && !plan.pausedAt && <Panel style={{ borderColor: colors.gold, borderWidth: 1.5 }}>
      <Title>Welcome back</Title>
      <Copy color={colors.ink}>It has been a while. Going back {back === 1 ? 'a week' : 'two weeks'} eases you in, and your egg keeps its warmth.</Copy>
      <Button title={back === 1 ? 'Repeat last week' : 'Go back two weeks'} onPress={() => act(gymGoBack(back), 'Welcome back! Your plan picks up from there.')} />
    </Panel>}

    {closed ? <Panel style={{ borderColor: colors.gold, borderWidth: 1.5 }}>
      <Title>The retry window has closed</Title>
      <Copy color={colors.ink}>Your trials ran {plan.trials.map(item => clock(item.seconds)).join(' and ')}, against your best of {clock(plan.baseline5k)}.
        Your plan egg hatched, and the Spark Badge waits for another go.</Copy>
      <Button title="Finish this plan" onPress={() => act(quitGym())} />
    </Panel> : next && <Panel>
      <Text style={sheet.meta}>{next.kind === 'trial' ? `${gym.name} · Before week 1` : next.kind === 'graduation' ? `${gym.name} · Graduation`
        : `${gym.name} · Week ${next.week + 1} of ${gym.weeks.length}`}</Text>
      <Text accessibilityRole="header" style={sheet.today}>{missed ? `${next.title.split(':')[0]}: retry` : next.title}</Text>
      {missed ? <Copy color={colors.ink}>Your trial ran {clock(missed.seconds)}, not faster than your best of {clock(plan.baseline5k)}. Coming up short in a
        trial is normal. One retry, after two rest days, until {new Date(retryUntil(plan)!).toLocaleDateString()}.</Copy>
        : <Copy color={colors.ink}>{next.detail}</Copy>}
      <View style={sheet.facts}>
        <View style={sheet.fact}><Icon name={sessionMeters(next) ? 'map' : 'timer'} size={16} color={colors.muted} /><Text style={sheet.factText}>{sessionLength(next)}</Text></View>
        <View style={sheet.fact}><Icon name={gym.activity === 'running' ? 'run' : 'walk'} size={16} color={colors.muted} />
          <Text style={sheet.factText}>{gym.activity === 'running' ? gym.paced ? 'Run' : 'Run/walk' : 'Walk'}</Text></View>
        <View style={sheet.fact}><Icon name="calendar" size={16} color={open ? colors.edge : colors.muted} />
          <Text style={[sheet.factText, open && { color: colors.edge }]}>{plan.pausedAt ? 'Paused' : opensText(opens, now)}</Text></View>
      </View>
      {stepUpNote[next.id] && !plan.pausedAt && <View style={{ gap: 8 }}>
        <Copy small color={colors.gold}>{stepUpNote[next.id]}</Copy>
        <Button title={`Repeat week ${next.week}`} secondary onPress={() => act(gymGoBack(1))} />
      </View>}
      {plan.pausedAt ? <>
        <Copy>Paused since {new Date(plan.pausedAt).toLocaleDateString()}. Your plan waits for you.</Copy>
        <Button title="Resume plan" onPress={() => act(resumeGym())} />
      </> : open ? <>
        {next.kind === 'graduation' && <Copy small>Your {plan.egg.family[0]} egg comes along. Training on your watch? Send it the egg, then
          cover {sessionLength(next)} with it: the adventure counts once it syncs.{gym.graduationMeters >= 42195
            ? ' A phone recording GPS for hours can run flat: start fully charged, carry a power bank, or record on your watch.' : ''}</Copy>}
        <Button title={next.kind === 'graduation' ? `Start ${graduationName}` : next.kind === 'trial' ? 'Start the trial' : 'Start session'} loading={busy}
          onPress={() => { void startSession() }} />
        {next.kind === 'graduation' && <Button title="Send the egg to my watch" secondary
          onPress={() => act(chooseEgg(plan.egg.family, plan.egg.mega), 'Your watch offers this egg next.')} />}
      </> : <View style={sheet.rest}>
        <Icon name="moon" size={20} color={colors.muted} />
        <Text style={sheet.restText}>Rest day. Your legs recover, and your egg rests too.</Text>
      </View>}
      {canSkip(plan) && !plan.pausedAt && <Pressable accessibilityRole="button" onPress={() => setConfirm('skip')} hitSlop={8}
        style={({ pressed }) => [sheet.textAction, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={sheet.textActionLabel}>Skip this session</Text>
      </Pressable>}
      {!!note && <Copy small color={colors.gold}>{note}</Copy>}
      {!!error && <Copy small color={colors.danger}>{error}</Copy>}
    </Panel>}

    {matches.length > 0 && <Panel>
      <Title>Count a saved adventure</Title>
      {matches.slice(0, 3).map(item => <MatchRow key={item.id} adventure={item} session={next!}
        onCount={() => act(countForGym(item.id), 'Counted. Nice work!')} onDecline={() => act(declineForGym(item.id))} />)}
    </Panel>}

    <Panel>
      <View style={sheet.row}>
        <Incubator family={plan.egg.family} warm={warm} />
        <View style={{ flex: 1, gap: 6 }}>
          <Title>{plan.egg.mega ?? plan.egg.family[0]} egg</Title>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Egg warmth" accessibilityValue={{ min: 0, max: 100, now: Math.round(warm * 100) }}
            style={sheet.track}><View style={[sheet.fill, { width: `${Math.round(warm * 100)}%`, backgroundColor: badgeHue(plan.gym) }]} /></View>
          <Text style={sheet.meta}>{Math.round(warm * 100)}% warm · {done} of {total} sessions</Text>
          {stars.possible > 0 && <View style={sheet.row}><Stars earned={1} of={1} /><Text style={sheet.meta}>{stars.earned} of {stars.possible} stars</Text></View>}
        </View>
      </View>
      <PlanLadder gym={gym} plan={plan} />
      <Text style={sheet.caption}>{ladderUnit(gym)}. Filled weeks are done.</Text>
    </Panel>

    {gym.paced && <Panel>
      <Title>Your paces</Title>
      {plan.baseline5k ? <PaceTable baseline={plan.baseline5k} gym={plan.gym} />
        : <Copy>{plan.entry ? 'Your entry trial sets them.' : 'Run by feel: easy means you could chat, tempo is comfortably hard. A 5 km best in the last 12 weeks would set paces and stars.'}</Copy>}
      {refresh && <>
        <Copy small color={colors.gold}>{refresh.from === 'half marathon'
          ? `You ran a half marathon in ${clock(refresh.seconds)}: a much better guide to your marathon than a 5 km. Set your paces from it?`
          : `You ran 5 km in ${clock(refresh.seconds)} since the plan began. Use it to set faster paces?`}</Copy>
        <Button title={`Use ${clock(refresh.seconds)}`} secondary onPress={() => act(refreshGymZones(refresh.baseline), 'Your paces are updated.')} />
      </>}
    </Panel>}

    {plan.gym === 'gigantamax-ultra' && <Panel>
      <Title>Walking breaks</Title>
      <Copy>A minute’s walk on every long run, back-to-back and Gigantamax Day. Walking breaks never cost stars, and walking hills is smart.</Copy>
      <View style={styles.row}>
        <Chip label="Off" selected={!plan.runWalk} onPress={() => act(setGymRunWalk(null))} />
        {[5, 10, 15, 20, 25].map(minutes => <Chip key={minutes} label={`Every ${minutes} min`} selected={plan.runWalk === minutes}
          onPress={() => act(setGymRunWalk(minutes))} />)}
      </View>
    </Panel>}

    {next && next.kind !== 'trial' && <Panel>
      <Title>Week {week + 1}</Title>
      {weekSessions.map(item => {
        const result = plan.done[item.id]
        const most = maxStars(item, plan)
        const state = result ? result.skipped ? 'Skipped' : 'Done' : item.id === next?.id ? (plan.pausedAt ? 'Paused' : opensText(opens, now)) : 'Later'
        return <View key={item.id} accessible accessibilityLabel={`${item.title}, ${sessionLength(item)}, ${state}${result?.stars && most > 1 ? `, ${result.stars} of ${most} stars` : ''}`}
          style={sheet.session}>
          <View style={[sheet.dot, result && !result.skipped && { backgroundColor: colors.edge, borderColor: colors.edge }, item.id === next?.id && { borderColor: colors.edge }]}>
            {result && !result.skipped && <Icon name="check" size={14} color={colors.onEdge} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[sheet.sessionTitle, result?.skipped && { color: colors.muted }]}>{item.title}</Text>
            <Text style={sheet.meta}>{sessionLength(item)}</Text>
          </View>
          {result && !result.skipped && most > 1 ? <Stars earned={result.stars ?? 1} of={most} />
            : <Text style={[sheet.meta, item.id === next?.id && { color: colors.edge }]}>{state}</Text>}
        </View>
      })}
    </Panel>}

    <View style={sheet.row}>
      {!plan.pausedAt && <View style={{ flex: 1 }}><Button title="Pause plan" secondary onPress={() => act(pauseGym(), 'Paused. Resume whenever you are ready.')} /></View>}
      <View style={{ flex: 1 }}><Button title="Quit plan" secondary onPress={() => setConfirm('quit')} /></View>
    </View>
    <BadgeCase />

    <ConfirmDialog visible={confirm === 'skip'} title="Skip this session?" body="It counts as done but doesn't warm your egg. One skip a week."
      confirm="Skip" cancel="Keep it" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void act(skipGymSession()) }} />
    <ConfirmDialog visible={confirm === 'quit'} title={`Quit ${gym.name}?`} body="Your progress in this plan and its egg's warmth are lost. Badges you earned stay."
      confirm="Quit" cancel="Keep training" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void act(quitGym()) }} />
  </>
}

function MatchRow({ adventure, session, onCount, onDecline }: { adventure: Adventure, session: Session, onCount: () => void, onDecline: () => void }) {
  const finished = new Date(adventure.record.finishedAt)
  const kind = adventure.record.activity === 'running' ? 'run' : 'walk'
  const minutes = Math.round((adventure.record.elapsedSeconds ?? 0) / 60)
  return <View style={{ gap: 10 }}>
    <Copy color={colors.ink}>Your {adventure.device} {kind} on {finished.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })},
      {' '}{km(adventure.record.meters)}{minutes ? ` in ${minutes} min` : ''}, is enough for {session.title}. Count it?</Copy>
    <View style={sheet.row}>
      <View style={{ flex: 1 }}><Button title="Count it" onPress={onCount} /></View>
      <View style={{ flex: 1 }}><Button title="Not this one" secondary onPress={onDecline} /></View>
    </View>
  </View>
}

// The Journal's Gym card: the next session and whether it is open today, or an invitation for anyone without a plan
// or badge yet.
export function GymCard({ now }: { now: number }) {
  useTheme()
  const { training } = useJournal()
  const plan = training.active
  if (!plan && Object.keys(training.badges).length) return null
  const next = plan ? nextSession(plan) : null
  const status = !plan ? 'Guided plans from a first 5 km to a half marathon' : plan.pausedAt ? 'Paused' : isOpen(plan, now) ? 'Open today'
    : `Rest day · ${opensText(unlockAt(plan), now)}`
  const label = plan && next ? `${gyms[plan.gym].name}: ${next.title}. ${status}` : 'Gym Training. Train for your first hatch'
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens Gym Training" onPress={() => router.push('/gym')}
    style={({ pressed }) => [sheet.card, { opacity: pressed ? 0.8 : 1 }]}>
    {plan ? <BadgeEmblem gym={gyms[plan.gym]} earned={false} size={40} /> : <View style={sheet.cardEgg}><PixelSprite name="Egg" size={32} /></View>}
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={sheet.cardTitle}>{plan && next ? next.title : 'Gym Training'}</Text>
      <Text numberOfLines={1} style={sheet.meta}>{plan ? `${gyms[plan.gym].name} · ${status}` : status}</Text>
    </View>
    <Icon name="chevron" size={18} color={colors.muted} />
  </Pressable>
}

const sheet = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  level: { fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: 18, lineHeight: 24, marginTop: 4 },
  today: { fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: 28, lineHeight: 34 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19, fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeItem: { alignItems: 'center', gap: 4, width: 92 },
  badgeName: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 17, textAlign: 'center' },
  eggArt: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  incubator: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  ladder: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  rung: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { alignSelf: 'stretch', borderRadius: 4 },
  rungLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  rungEgg: { width: 34, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16 },
  paceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  paceName: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 15, lineHeight: 20 },
  paceValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] },
  paceUnit: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13 },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.sunken },
  restText: { flex: 1, fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 20 },
  textAction: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  textActionLabel: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 15, lineHeight: 20 },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  sessionTitle: { fontFamily: fonts.bold, color: colors.ink, fontSize: 15, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 68, borderRadius: 20, backgroundColor: colors.panel,
    borderWidth: 1, borderColor: colors.line },
  cardEgg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  cardTitle: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 }
}))
