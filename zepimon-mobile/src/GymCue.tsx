import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Text, Vibration, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from './store'
import type { ActiveAdventure, PhoneRun } from './phone-adventure'
import { findSession, gyms, sessionSeconds } from './training-plans'
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
  const session = active.training ? findSession(active.training.session) : undefined
  const cue = session ? cueAt(session, active, now) : null
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
      <Text style={[banner.step, { color: ink }]}>Session complete!</Text>
      <Text style={[banner.next, { color: ink }]}>{session.kind === 'graduation' ? 'Finish & save to graduate.' : 'Finish & save to count it, or keep going.'}</Text>
    </> : <>
      <View style={banner.row}>
        <Text style={[banner.step, { color: ink }]}>{stepLabel(cue.step)}</Text>
        <Text style={[banner.time, { color: ink }]}>{remainingText(cue)}</Text>
      </View>
      <Text style={[banner.next, { color: ink }]}>{cue.next ? `Then: ${stepLabel(cue.next)}` : 'Last step'} · Step {cue.index + 1} of {cue.total}</Text>
    </>}
    <Text style={[banner.context, { color: ink }]}>{gyms[session.gym].name} · {session.title}</Text>
  </View>
}

// After saving: whether the adventure counted for the Gym session it was started for, and if not, why.
export function SessionResult({ run }: { run: PhoneRun }) {
  const { training } = useJournal()
  const session = run.training ? findSession(run.training.session) : undefined
  if (!session || !run.training) return null
  const gym = run.training.gym as GymId
  const badge = training.badges[gym]
  const counted = training.active?.done[session.id]?.adventureId === run.id || badge?.adventureId === run.id
  const graduated = counted && session.kind === 'graduation'
  const needed = session.kind === 'graduation' ? `${gyms[gym].graduationMeters / 1000} km with your plan egg`
    : `${Math.ceil(sessionSeconds(session) * 0.9 / 60)} minutes`
  return <Panel style={{ borderColor: counted ? colors.gold : colors.line, borderWidth: counted ? 2 : 1 }}>
    <Title>{graduated ? `${gyms[gym].badge} earned!` : counted ? `${session.title}: done` : `${session.title}: not counted`}</Title>
    <Copy>{graduated ? `You graduated from ${gyms[gym].name}. Your plan egg hatched on Hatch Day.`
      : counted ? 'Your plan egg is a little warmer.' : `It needs at least ${needed}. Try again whenever you're ready.`}</Copy>
    <Button title="Open Gym Training" secondary onPress={() => router.push('/gym')} />
  </Panel>
}

const banner = themedStyles(() => ({
  box: { borderRadius: 18, padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  context: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, opacity: 0.85 },
  step: { flexShrink: 1, fontFamily: displayFont(fonts.black), fontSize: 30, lineHeight: 38 },
  time: { fontFamily: fonts.black, fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'] },
  next: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 }
}))
