import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { router } from 'expo-router'
import { useJournal } from './store'
import { allAdventures } from './adventures'
import type { Adventure } from './adventures'
import { km } from './journal'
import { openEggs } from './phone-adventure'
import { currentAdventure, startAdventure } from './tracker'
import type { LocationIssue } from './tracker'
import { pokemonType } from './catalog'
import { PixelSprite } from './games/TeamPicker'
import { ConfirmDialog } from './ConfirmDialog'
import { pickGymEgg, usePickedGymEgg } from './gym-egg'
import { gymOrder, gyms, sessionSeconds, stepUpNote } from './training-plans'
import type { Gym, GymId, Session } from './training-plans'
import { canSkip, currentWeek, isOpen, matchCandidates, nextSession, progressOf, unlockAt, warmth, welcomeBack } from './training'
import type { ActivePlan } from './training'
import { Button, Copy, Heading, Icon, Panel, Title, colors, displayFont, fonts, themedStyles, typeTints, useTheme } from './ui'

// Gym Training's screens (src/app/gym.tsx). An Operate screen: it answers "what do I do today?" first, with the next
// session and its Start; then the plan as a ladder of weeks ending in the egg (the one element only Zepimon has, drawn
// from the plan's real session lengths), saved adventures that could count, the week, and the badge case.
const DAY = 864e5
const SAFETY = 'These plans are general fitness guidance, not medical advice. If you have a health condition, are pregnant or haven\'t ' +
  'exercised in a long time, check with a doctor first. Stop if you feel pain, dizziness or chest discomfort.'

const randomEgg = (opened: string[][]) => opened[Math.floor(Math.random() * opened.length)]

const locationProblems: Partial<Record<LocationIssue, string>> = {
  off: 'Location is off. Turn it on to record the session.',
  denied: 'Location is not allowed. Allow it while using Zepimon, then start again.',
  blocked: 'Location is blocked. Allow it for Zepimon in its settings, then start again.'
}

// Each Gym's badge colour, used on its emblem and its ladder.
const badgeHue = (gym: GymId) => gym === 'steady-steps' ? colors.success : colors.gold

// How much a week asks, in minutes: the longest walk in a walking plan, the most jogging in one session in a running one.
function weekMinutes(week: Session[]): number {
  const minutes = week.filter(item => item.kind !== 'graduation').map(item => item.kind === 'walk' ? sessionSeconds(item)
    : item.steps.filter(step => step.kind === 'jog' || step.kind === 'run').reduce((sum, step) => sum + (step.seconds ?? 0), 0))
  return Math.round(Math.max(0, ...minutes) / 60)
}

// The plan as a ladder: one bar per week, as tall as that week asks, filled once its sessions are done, the current week
// outlined, and the egg waiting at the top for Hatch Day.
function PlanLadder({ gym, plan, height = 64 }: { gym: Gym, plan?: ActivePlan, height?: number }) {
  const minutes = gym.weeks.map(weekMinutes)
  const most = Math.max(...minutes)
  const week = plan ? currentWeek(plan) : -1
  const hue = badgeHue(gym.id)
  const unit = gym.activity === 'running' ? 'jogging' : 'walking'
  return <View accessible accessibilityLabel={`${gym.weeks.length} weeks, from ${minutes[0]} to ${most} minutes of ${unit}, then Hatch Day` +
    (plan ? `. You are in week ${week + 1}.` : '')} style={[sheet.ladder, { height }]}>
    {minutes.map((value, i) => {
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

export function GymPicker() {
  useTheme()
  const { progress, phoneRuns, training, expeditions, startGym } = useJournal()
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const longest = adventures.reduce((max, item) => Math.max(max, item.record.meters), 0)
  const runner = adventures.some(item => item.record.activity === 'running')
  // Under 5 km in one go: a beginner Gym is the way to a first hatch. Walkers are pointed to Steady Steps.
  const suggested: GymId | null = longest >= 5000 ? null : runner || !adventures.length ? 'first-hatch' : 'steady-steps'
  const [choosing, setChoosing] = useState<GymId | null>(null)
  const opened = useMemo(() => openEggs(expeditions.dex), [expeditions.dex])
  const picked = usePickedGymEgg()
  const [fallback] = useState(() => randomEgg(opened))
  const egg = picked ?? fallback
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function begin(gym: GymId) {
    setBusy(true); setError('')
    try { await startGym(gym, egg, null); pickGymEgg(null) } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start this Gym. Please try again.')
    } finally { setBusy(false) }
  }
  return <>
    <View style={{ gap: 6 }}>
      <Heading>Choose a Gym</Heading>
      <Copy>Each plan builds up week by week to one adventure that hatches the egg you bring.</Copy>
    </View>
    {gymOrder.map(id => {
      const gym = gyms[id]
      const open = choosing === id
      const badge = training.badges[id]
      return <Panel key={id} style={open ? { borderColor: colors.edge, borderWidth: 2 } : undefined}>
        <View style={sheet.row}>
          <BadgeEmblem gym={gym} earned={!!badge} />
          <View style={{ flex: 1, gap: 2 }}>
            <Title>{gym.name}</Title>
            <Text style={sheet.meta}>{gym.activity === 'running' ? 'Run/walk' : 'Walking'} · {gym.weeks.length} weeks · {gym.weeks[0].length} sessions a week</Text>
            {suggested === id && <Text style={[sheet.meta, { color: colors.gold }]}>Suggested for you</Text>}
          </View>
        </View>
        <Copy color={colors.ink}>{gym.blurb}</Copy>
        <PlanLadder gym={gym} />
        <Text style={sheet.caption}>Minutes of {gym.activity === 'running' ? 'jogging' : 'walking'} each week, then Hatch Day.</Text>
        {badge && <Copy small color={colors.gold}>{gym.badge} earned {new Date(badge.at).toLocaleDateString()}. You can train here again.</Copy>}
        {!open ? <Button title={`Choose ${gym.name}`} secondary={suggested !== id} onPress={() => { setChoosing(id); setError('') }} /> : <View style={{ gap: 12 }}>
          <View style={sheet.row}>
            <View style={[sheet.eggArt, { backgroundColor: typeTints[pokemonType(egg[0])] || colors.sunken }]}><PixelSprite name="Egg" size={44} /></View>
            <View style={{ flex: 1 }}>
              <Title>Your plan egg: {egg[0]}</Title>
              <Copy small>It warms with every session and hatches on Hatch Day, at 5 km.</Copy>
            </View>
          </View>
          <Button title="Choose another egg" secondary onPress={() => router.push({ pathname: '/eggs', params: { for: 'gym', current: egg.join('>') } })} />
          <Copy small>{SAFETY}</Copy>
          {!!error && <Copy small color={colors.danger}>{error}</Copy>}
          <Button title={`Start ${gym.name}`} loading={busy} onPress={() => { void begin(id) }} />
          <Button title="Not now" secondary disabled={busy} onPress={() => setChoosing(null)} />
        </View>}
      </Panel>
    })}
    <Copy small>Harder Gyms, up to a marathon, are on the way.</Copy>
    <BadgeCase />
  </>
}

// A Gym Badge: a faceted emblem in the Gym's colour once earned, an empty outline before.
function BadgeEmblem({ gym, earned, size = 48 }: { gym: Gym, earned: boolean, size?: number }) {
  const hue = badgeHue(gym.id)
  return <View accessible accessibilityLabel={`${gym.badge}${earned ? ', earned' : ', not earned yet'}`} style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M24 3 L42 13 L42 35 L24 45 L6 35 L6 13 Z" fill={earned ? hue : 'none'} stroke={earned ? hue : colors.line} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M24 11 L35 17 L35 31 L24 37 L13 31 L13 17 Z" fill={earned ? colors.panel : 'none'} opacity={earned ? 0.35 : 1}
        stroke={earned ? 'none' : colors.line} strokeWidth={2} strokeLinejoin="round" />
      {gym.id === 'steady-steps'
        ? <Path d="M24 33 C24 27 24 22 24 19 M24 25 C20 25 18 22 18 19 C21 19 24 21 24 25 M24 23 C28 23 30 20 30 17 C27 17 24 19 24 23" fill="none"
          stroke={earned ? colors.onBrand : colors.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        : <Path d="M24 15 C29 15 32 22 32 27 C32 31.5 28.5 34 24 34 C19.5 34 16 31.5 16 27 C16 22 19 15 24 15 Z M20 25 L23 27.5 L21.5 30" fill="none"
          stroke={earned ? colors.onBrand : colors.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />}
    </Svg>
  </View>
}

export function BadgeCase() {
  const { training } = useJournal()
  return <Panel>
    <Title>Badge case</Title>
    <View style={sheet.badges}>
      {gymOrder.map(id => <View key={id} style={sheet.badgeItem}>
        <BadgeEmblem gym={gyms[id]} earned={!!training.badges[id]} size={56} />
        <Text style={sheet.badgeName}>{gyms[id].badge}</Text>
      </View>)}
    </View>
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
const sessionLength = (session: Session) => session.kind === 'graduation' ? '5 km' : `${Math.round(sessionSeconds(session) / 60)} min`

export function GymPlan({ plan, now }: { plan: ActivePlan, now: number }) {
  useTheme()
  const { training, progress, phoneRuns, plan: shared, chooseEgg, setPhoneAdventure, skipGymSession, gymGoBack, pauseGym, resumeGym, quitGym,
    countForGym, declineForGym, expeditions } = useJournal()
  const gym = gyms[plan.gym]
  const next = nextSession(plan)
  const week = currentWeek(plan)
  const { done, total } = progressOf(plan)
  const warm = warmth(plan)
  const open = isOpen(plan, now)
  const back = welcomeBack(plan, now)
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const matches = matchCandidates(training, adventures, now)
  const opened = useMemo(() => openEggs(expeditions.dex), [expeditions.dex])
  const [confirm, setConfirm] = useState<'quit' | 'skip' | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const act = (work: Promise<void>, done = '') => work.then(() => { setError(''); setNote(done) }).catch(caught => setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.'))

  async function startSession() {
    if (!next) return
    if (currentAdventure()) { router.navigate('/adventure'); return }
    setBusy(true); setError('')
    // A graduation carries the plan egg; other sessions the egg chosen in the Adventure tab, or a random one.
    const planned = shared?.egg && opened.find(item => item.join('>') === shared.egg!.family.join('>'))
    const family = next.kind === 'graduation' ? plan.egg.family : planned ?? randomEgg(opened)
    const mega = next.kind === 'graduation' ? plan.egg.mega : planned ? shared!.egg!.mega : null
    try {
      const problem = await startAdventure(family, gym.activity, mega, { gym: plan.gym, session: next.id })
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
  return <>
    {back > 0 && !plan.pausedAt && <Panel style={{ borderColor: colors.gold, borderWidth: 1.5 }}>
      <Title>Welcome back</Title>
      <Copy color={colors.ink}>It has been a while. Going back {back === 1 ? 'a week' : 'two weeks'} eases you in, and your egg keeps its warmth.</Copy>
      <Button title={back === 1 ? 'Repeat last week' : 'Go back two weeks'} onPress={() => act(gymGoBack(back), 'Welcome back! Your plan picks up from there.')} />
    </Panel>}

    {next && <Panel>
      <Text style={sheet.meta}>{next.kind === 'graduation' ? `${gym.name} · Graduation` : `${gym.name} · Week ${next.week + 1} of ${gym.weeks.length}`}</Text>
      <Text accessibilityRole="header" style={sheet.today}>{next.title}</Text>
      <Copy color={colors.ink}>{next.detail}</Copy>
      <View style={sheet.facts}>
        <View style={sheet.fact}><Icon name="timer" size={16} color={colors.muted} /><Text style={sheet.factText}>{sessionLength(next)}</Text></View>
        <View style={sheet.fact}><Icon name={gym.activity === 'running' ? 'run' : 'walk'} size={16} color={colors.muted} />
          <Text style={sheet.factText}>{gym.activity === 'running' ? 'Run/walk' : 'Walk'}</Text></View>
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
          cover 5 km with it: the adventure counts once it syncs.</Copy>}
        <Button title={next.kind === 'graduation' ? 'Start Hatch Day' : 'Start session'} loading={busy} onPress={() => { void startSession() }} />
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
          <Title>{plan.egg.family[0]} egg</Title>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Egg warmth" accessibilityValue={{ min: 0, max: 100, now: Math.round(warm * 100) }}
            style={sheet.track}><View style={[sheet.fill, { width: `${Math.round(warm * 100)}%`, backgroundColor: badgeHue(plan.gym) }]} /></View>
          <Text style={sheet.meta}>{Math.round(warm * 100)}% warm · {done} of {total} sessions</Text>
        </View>
      </View>
      <PlanLadder gym={gym} plan={plan} />
      <Text style={sheet.caption}>Minutes of {gym.activity === 'running' ? 'jogging' : 'walking'} each week. Filled weeks are done.</Text>
    </Panel>

    <Panel>
      <Title>Week {week + 1}</Title>
      {weekSessions.map(item => {
        const result = plan.done[item.id]
        const state = result ? result.skipped ? 'Skipped' : 'Done' : item.id === next?.id ? (plan.pausedAt ? 'Paused' : opensText(opens, now)) : 'Later'
        return <View key={item.id} accessible accessibilityLabel={`${item.title}, ${sessionLength(item)}, ${state}`} style={sheet.session}>
          <View style={[sheet.dot, result && !result.skipped && { backgroundColor: colors.edge, borderColor: colors.edge }, item.id === next?.id && { borderColor: colors.edge }]}>
            {result && !result.skipped && <Icon name="check" size={14} color={colors.onEdge} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[sheet.sessionTitle, result?.skipped && { color: colors.muted }]}>{item.title}</Text>
            <Text style={sheet.meta}>{sessionLength(item)}</Text>
          </View>
          <Text style={[sheet.meta, item.id === next?.id && { color: colors.edge }]}>{state}</Text>
        </View>
      })}
    </Panel>

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
  const status = !plan ? 'Guided plans for walkers and new runners' : plan.pausedAt ? 'Paused' : isOpen(plan, now) ? 'Open today' : `Rest day · ${opensText(unlockAt(plan), now)}`
  const label = plan && next ? `${gyms[plan.gym].name}, week ${next.week + 1}: ${next.title}. ${status}` : 'Gym Training. Train for your first hatch'
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens Gym Training" onPress={() => router.push('/gym')}
    style={({ pressed }) => [sheet.card, { opacity: pressed ? 0.8 : 1 }]}>
    {plan ? <BadgeEmblem gym={gyms[plan.gym]} earned={false} size={40} /> : <View style={sheet.cardEgg}><PixelSprite name="Egg" size={32} /></View>}
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={sheet.cardTitle}>{plan && next ? next.title : 'Train for your first hatch'}</Text>
      <Text numberOfLines={1} style={sheet.meta}>{plan ? `${gyms[plan.gym].name} · ${status}` : status}</Text>
    </View>
    <Icon name="chevron" size={18} color={colors.muted} />
  </Pressable>
}

const sheet = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 18 },
  today: { fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: 28, lineHeight: 34 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 14, lineHeight: 19, fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  badgeItem: { alignItems: 'center', gap: 6, width: 96 },
  badgeName: { fontFamily: fonts.bold, color: colors.ink, fontSize: 13, lineHeight: 17, textAlign: 'center' },
  eggArt: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  incubator: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  ladder: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rung: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { alignSelf: 'stretch', borderRadius: 4 },
  rungLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  rungEgg: { width: 34, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16 },
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
