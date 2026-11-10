import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from '../store'
import { allAdventures } from '../adventures'
import { QUEST_SESSIONS, arcadePointsLeft, questSessions, ticketsLeft } from '../expedition-quest'
import { expeditionGoal } from '../generated/expedition.js'
import { km } from '../journal'
import { TICKET_STREAK_WEEKS, currentStreak, runningTickets } from '../running'
import { Button, Copy, Icon, IconBubble, colors, displayFont, fonts, gradient, retro, shadows, styles, themedStyles } from '../ui'
import type { IconName } from '../ui'
import { ARCADE_PERMIT_POINTS, legendaryPoints } from './achievements'
import { AchievementRows } from './ArcadeAchievements'
import { questTheme } from './lanterns'

// The four ways to the next Legendary encounter, as short rows: walked distance (25 km), the Expedition Quest (three
// saved sessions and a shrine challenge), achievement points (100 for a permit) and running tickets (one every four weeks
// in a row). Each row is a name, one number and a bar; a route with something to do shows its button, and a tap opens
// the rest. The closest one is marked. Any one is enough.
export type RouteId = 'distance' | 'quest' | 'points' | 'tickets'
type Route = { id: RouteId, name: string, icon: IconName, value: string, share: number, ready: boolean }

// Every route's progress. leg: metres walked toward the selected trail's next encounter.
export function useRoutes(leg: number) {
  const store = useJournal()
  const { quest, progress, expeditions, phoneRuns, arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari } = store
  const sessions = useMemo(() => questSessions(quest, progress, expeditions).slice(0, QUEST_SESSIONS), [quest, progress, expeditions])
  const points = useMemo(() => legendaryPoints({ arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns }),
    [arcadeScores, bestMoves, adventure, trailLevels, trialRecords, safari, progress, phoneRuns])
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const tickets = useMemo(() => runningTickets(adventures), [adventures])
  const streak = currentStreak(adventures)
  const unspent = Math.min(arcadePointsLeft(quest, points.total), ARCADE_PERMIT_POINTS)
  const toClaim = ticketsLeft(quest, tickets.length)
  const along = streak % TICKET_STREAK_WEEKS
  const done = sessions.length + Number(quest.challenge)
  const routes: Route[] = [
    { id: 'distance', name: 'Distance', icon: 'walk', value: `${km(leg).replace(' km', '')} / ${expeditionGoal / 1000} km`, share: leg / expeditionGoal, ready: leg >= expeditionGoal },
    { id: 'quest', name: `Quest ${quest.number + 1}`, icon: 'missions', value: `${done} / ${QUEST_SESSIONS + 1}`, share: done / (QUEST_SESSIONS + 1), ready: done > QUEST_SESSIONS },
    { id: 'points', name: 'Points', icon: 'star', value: `${unspent} / ${ARCADE_PERMIT_POINTS}`, share: unspent / ARCADE_PERMIT_POINTS, ready: unspent >= ARCADE_PERMIT_POINTS },
    { id: 'tickets', name: 'Tickets', icon: 'flame', value: toClaim ? `${toClaim} to claim` : `${along} / ${TICKET_STREAK_WEEKS} weeks`,
      share: toClaim ? 1 : along / TICKET_STREAK_WEEKS, ready: toClaim > 0 }
  ]
  const closest = routes.reduce((best, route) => route.share > best.share ? route : best)
  return { routes, closest, sessions, points, tickets, streak, toClaim }
}

export function ExpeditionRoutes({ leg, busy, onLanterns, onQuestPermit }: { leg: number, busy: boolean, onLanterns: () => void, onQuestPermit: () => void }) {
  const store = useJournal()
  const { quest } = store
  const { routes, closest, sessions, points, tickets, streak, toClaim } = useRoutes(leg)
  const [open, setOpen] = useState<RouteId | null>(null)
  const [help, setHelp] = useState(false)
  const [list, setList] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  async function save(task: () => Promise<void>, done: string) {
    setSaving(true); setMessage('')
    try { await task(); setMessage(done) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the permit. Try again.') }
    finally { setSaving(false) }
  }
  const date = (at: string | number) => new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' })
  // A route's button, shown on its row whether or not the row is open.
  const action: Record<RouteId, ReactNode> = {
    distance: null,
    quest: routes[1].ready ? <Button title="Get your permit" loading={busy} onPress={onQuestPermit} />
      : !quest.challenge ? <Button title={`Play ${questTheme(quest.number).title}`} secondary disabled={busy} onPress={onLanterns} /> : null,
    points: routes[2].ready ? <Button title={`Trade ${ARCADE_PERMIT_POINTS} points`} loading={saving}
      onPress={() => { void save(store.earnArcadePermit, 'Traded for an Expedition Permit.') }} /> : null,
    tickets: toClaim > 0 ? <Button title={toClaim === 1 ? 'Claim your permit' : `Claim ${toClaim} permits`} loading={saving}
      onPress={() => { void save(store.claimRunningTickets, toClaim === 1 ? 'Claimed an Expedition Permit.' : `Claimed ${toClaim} Expedition Permits.`) }} /> : null
  }
  const more: Record<RouteId, ReactNode> = {
    distance: <Copy small>Saved walks and runs. Clues at 5 and 15 km.</Copy>,
    quest: <>
      {sessions.map(run => <Copy key={run.id} small>✓ {km(run.record.meters)} · {date(run.record.finishedAt)}</Copy>)}
      <Copy small>{QUEST_SESSIONS} sessions of 1 km or more, plus the shrine challenge{quest.challenge ? ' ✓' : ''}.</Copy>
    </>,
    points: <>
      <Copy small>{points.arcade} arcade · {points.running} running</Copy>
      <View style={look.links}>
        <Link label={list ? 'Hide arcade list' : 'Arcade list'} onPress={() => setList(!list)} />
        <Link label="Running achievements" onPress={() => router.push('/achievements')} />
      </View>
      {list && <AchievementRows />}
    </>,
    tickets: <>
      <Copy small>{streak ? `${streak} week${streak === 1 ? '' : 's'} in a row.` : 'No streak yet.'} A ticket every {TICKET_STREAK_WEEKS} weeks.</Copy>
      {tickets.slice(-3).reverse().map(ticket => <Copy key={ticket.id} small>🎟 {ticket.title} · {date(ticket.at)}</Copy>)}
    </>
  }
  return <View style={{ gap: 12 }}>
    <View style={look.head}>
      <Text accessibilityRole="header" style={look.title}>Any one opens it</Text>
      <View style={look.permits} accessible accessibilityLabel={`${quest.permits} Expedition Permits held`}>
        <Text style={look.permitsText}>◆ {quest.permits} permit{quest.permits === 1 ? '' : 's'}</Text>
      </View>
    </View>
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    {routes.map(route => {
      const shown = open === route.id
      return <View key={route.id} style={[look.card, route === closest && look.closest]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: shown }}
          accessibilityLabel={`${route.name}: ${route.value}${route === closest ? ', your closest route' : ''}`}
          onPress={() => setOpen(shown ? null : route.id)} style={({ pressed }) => [look.row, { opacity: pressed ? 0.7 : 1 }]}>
          <IconBubble name={route.icon} size={40} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={look.line}>
              <Text style={look.name}>{route.name}</Text>
              {route === closest && <Text style={look.tag}>{route.ready ? 'READY' : 'CLOSEST'}</Text>}
              <Text style={look.value}>{route.value}</Text>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, route.share) * 100) }} style={[styles.track, { height: 6 }]}>
              <View style={[styles.fill, gradient(), { width: `${Math.min(1, route.share) * 100}%` }]} />
            </View>
          </View>
          <View style={{ transform: [{ rotate: shown ? '90deg' : '0deg' }] }}><Icon name="chevron" size={18} color={colors.muted} /></View>
        </Pressable>
        {action[route.id]}
        {shown && <View style={look.more}>{more[route.id]}</View>}
      </View>
    })}
    <Link label={help ? 'Hide how it works' : 'How it works'} onPress={() => setHelp(!help)} />
    {help && <View style={{ gap: 4 }}>{[
      'Walk 25 km, or use an Expedition Permit, to open the next encounter.',
      'Quests, 100 points and tickets each give a permit.',
      'Then: trial → lair → four seals → battle → catch.',
      'Before the first seal, stepping back onto the portal re-rolls Shiny.',
      'Leaving never loses your place. Only saved adventures count.'
    ].map(line => <Copy key={line} small>• {line}</Copy>)}</View>}
  </View>
}

function Link({ label, onPress }: { label: string, onPress: () => void }) {
  return <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}>
    <Text style={look.link}>{label}</Text>
  </Pressable>
}

const look = themedStyles(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontFamily: displayFont(fonts.black), color: colors.ink, fontSize: 22, lineHeight: 28 },
  permits: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: retro() ? 6 : 999, backgroundColor: colors.goldTint },
  permitsText: { fontFamily: fonts.black, color: colors.gold, fontSize: 13, lineHeight: 18 },
  card: { gap: 12, padding: 14, borderRadius: retro() ? 10 : 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, ...shadows.card },
  closest: { borderColor: colors.edge, borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { fontFamily: fonts.heavy, color: colors.ink, fontSize: 16, lineHeight: 21 },
  tag: { fontFamily: fonts.black, color: colors.edge, fontSize: 10, lineHeight: 14, letterSpacing: 0.8 },
  value: { flex: 1, textAlign: 'right', fontFamily: fonts.black, color: colors.ink, fontSize: 15, lineHeight: 21 },
  more: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  link: { fontFamily: fonts.heavy, color: colors.edge, fontSize: 14, lineHeight: 20 }
}))
