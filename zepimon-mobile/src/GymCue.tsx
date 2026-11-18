import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Text, Vibration, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from './store'
import { currentPace } from './phone-adventure'
import type { ActiveAdventure, PhoneRun } from './phone-adventure'
import { maxStars, paceZones } from './training'
import { clock, paceText } from './running'
import { findSession, gyms, sessionMeters, sessionSeconds } from './training-plans'
import type { GymId } from './training-plans'
import { buzzFor, cueAt, isEffort, remainingText, spokenCue, stepLabel } from './training-cues'
import type { Cue } from './training-cues'
import { Button, Copy, Panel, Title, colors, displayFont, fonts, themedStyles, useTheme } from './ui'

// The Gym session on the recording screen: what to do now in big letters, how long is left, what comes next, and the
// step number. Each change buzzes (two pulses into an effort, one into a walk, a tap 10 s before) and is read out by
// screen readers. It follows the adventure (src/training-cues.ts), so it is right again as soon as the screen is back.
// Cues need the screen on for now: with it off, the session still counts, but nothing buzzes.
export function SessionBanner({ active, now }: { active: ActiveAdventure, now: number }) {
  useTheme()
  const { training } = useJournal()
  const session = active.training ? findSession(active.training.session) : undefined
  const cue = session ? cueAt(session, active, now) : null
  // The pace target for this step, from the plan's 5 km best, and how the last minute compares: words, never colour alone.
  const baseline = training.active && session && training.active.gym === session.gym ? training.active.baseline5k : null
  const zone = cue && !cue.done && cue.step.zone && cue.step.zone !== 'any' && baseline ? paceZones(baseline)[cue.step.zone] : null
  const pace = zone ? currentPace(active, now) : null
  const verdict = !zone || pace === null ? null : cue!.step.zone === 'easy' ? pace < zone[0] * 0.97 ? 'Ease off' : 'Nice and easy'
    : pace < zone[0] * 0.97 ? 'Ease off' : pace > zone[1] * 1.03 ? 'Pick it up' : 'On pace'
  const previous = useRef<Cue | null>(null)
  useEffect(() => {
    if (!cue) return
    const before = previous.current
    const buzz = buzzFor(before, cue)
    if (buzz) Vibration.vibrate(buzz)
    if (!before || before.index !== cue.index || cue.done !== before.done) AccessibilityInfo.announceForAccessibility(spokenCue(cue))
    previous.current = cue
  })
  if (!session || !cue) return null
  const effort = isEffort(cue.step) && !cue.done
  const ink = effort ? colors.onEdge : colors.ink
  return <View accessible accessibilityLabel={`${gyms[session.gym].name}, ${session.title}. ${cue.done ? 'Session complete' : `${stepLabel(cue.step)}, ${remainingText(cue)} left`}`}
    style={[banner.box, { backgroundColor: effort ? colors.edge : colors.mint }]}>
    {cue.done ? <>
      <Text style={[banner.step, { color: ink }]}>{session.kind === 'trial' || (session.kind === 'graduation' && session.gym === 'speed-gym') ? 'Trial complete!' : 'Session complete!'}</Text>
      <Text style={[banner.next, { color: ink }]}>{session.kind === 'graduation' ? 'Finish & save to graduate.' : 'Finish & save to count it, or keep going.'}</Text>
    </> : <>
      <View style={banner.row}>
        <Text style={[banner.step, { color: ink }]}>{stepLabel(cue.step)}</Text>
        <Text style={[banner.time, { color: ink }]}>{remainingText(cue)}</Text>
      </View>
      {zone && <Text accessibilityLiveRegion="polite" style={[banner.target, { color: ink }]}>
        {paceText(zone[0])}–{paceText(zone[1])} /km{pace !== null ? ` · now ${paceText(pace)} · ${verdict}` : ''}</Text>}
      <Text style={[banner.next, { color: ink }]}>{cue.next ? `Then: ${stepLabel(cue.next)}` : 'Last step'} · Step {cue.index + 1} of {cue.total}</Text>
    </>}
    <Text style={[banner.context, { color: ink }]}>{gyms[session.gym].name} · {session.title}</Text>
  </View>
}

// After saving: whether the adventure counted for the Gym session it was started for and its stars, how a trial went,
// or, if it did not count, why.
export function SessionResult({ run }: { run: PhoneRun }) {
  const { training } = useJournal()
  const session = run.training ? findSession(run.training.session) : undefined
  if (!session || !run.training) return null
  const gym = run.training.gym as GymId
  const plan = training.active
  const result = plan?.done[session.id]
  const counted = result?.adventureId === run.id
  const finished = training.finished?.adventureId === run.id ? training.finished : null
  const missed = plan?.trials.find(item => item.adventureId === run.id)
  const most = plan ? maxStars(session, plan) : 1
  const meters = sessionMeters(session)
  const needed = session.kind === 'graduation' ? `${(gyms[gym].graduationMeters / 1000).toFixed(gyms[gym].graduationMeters % 1000 ? 1 : 0)} km with your plan egg`
    : meters ? `${(meters * 0.95 / 1000).toFixed(1)} km` : `${Math.ceil(sessionSeconds(session) * 0.9 / 60)} minutes`
  const title = finished ? finished.badge ? `${gyms[gym].badge} earned!` : `${gyms[gym].name} complete`
    : missed ? 'Not a new best this time' : counted ? session.kind === 'trial' ? 'Your paces are set' : `${session.title}: done` : `${session.title}: not counted`
  const body = finished ? finished.badge ? `You graduated from ${gyms[gym].name}${finished.time ? ` with a 5 km in ${clock(finished.time)}` : ''}. Your plan egg came along.`
    : 'Your plan egg hatched. The Spark Badge waits for another go: a trial needs a new best.'
    : missed ? `${clock(missed.seconds)} against your best of ${clock(plan!.baseline5k)}. Coming up short in a trial is normal: one retry after two rest days.`
      : counted ? session.kind === 'trial' ? `Your 5 km of ${clock(plan!.baseline5k)} sets the paces for the whole plan.` : 'Your plan egg is a little warmer.'
        : `It needs at least ${needed}. Try again whenever you're ready.`
  return <Panel style={{ borderColor: counted || finished ? colors.gold : colors.line, borderWidth: counted || finished ? 2 : 1 }}>
    <Title>{title}</Title>
    <Copy color={colors.ink}>{body}</Copy>
    {counted && most > 1 && <Text style={banner.stars}>{result!.stars ?? 1} of {most} stars{result!.stars === most ? ': paces kept perfectly.'
      : most === 3 ? ': stars come from keeping each part in its pace zone, easy runs included.' : ': do every minute for the second.'}</Text>}
    <Button title="Open Gym Training" secondary onPress={() => router.push('/gym')} />
  </Panel>
}

const banner = themedStyles(() => ({
  box: { borderRadius: 18, padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  context: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, opacity: 0.85 },
  step: { flexShrink: 1, fontFamily: displayFont(fonts.black), fontSize: 30, lineHeight: 38 },
  time: { fontFamily: fonts.black, fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'] },
  next: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  target: { fontFamily: fonts.heavy, fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'] },
  stars: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14, lineHeight: 20 }
}))
