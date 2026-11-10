import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from '../store'
import { allAdventures } from '../adventures'
import { TICKET_STREAK_WEEKS, currentStreak, runningTickets } from '../running'
import { ticketsLeft } from '../expedition-quest'
import { Button, Copy, Eyebrow, Panel, colors, fonts, gradient, styles, themedStyles } from '../ui'

// Running tickets (src/running.ts runningTickets), each an Expedition Permit to claim: a Sub-4 marathon, the Ultra
// explorer and every 4 weeks in a row, on the achievements screen, with a way to Expeditions (which lists it among its
// routes: src/games/ExpeditionRoutes.tsx). Both can claim.
export function RunningTickets({ place }: { place: 'achievements' }) {
  const store = useJournal()
  const { progress, phoneRuns, quest } = store
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const adventures = useMemo(() => allAdventures(progress, phoneRuns), [progress, phoneRuns])
  const tickets = useMemo(() => runningTickets(adventures), [adventures])
  const streak = currentStreak(adventures)
  const left = ticketsLeft(quest, tickets.length)
  const along = streak % TICKET_STREAK_WEEKS
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  async function claim() {
    setBusy(true); setMessage('')
    try { await store.claimRunningTickets(); setMessage(`Claimed! You received ${left === 1 ? 'an Expedition Permit' : `${left} Expedition Permits`}.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the permit. Try again.') }
    finally { setBusy(false) }
  }
  return <Panel style={place === 'achievements' ? { backgroundColor: colors.goldTint } : undefined}>
    <Eyebrow>RUNNING TICKETS</Eyebrow>
    <Text style={styles.stat}>{left ? `${plural(left, 'ticket')} to claim` : `${plural(tickets.length, 'ticket')} earned`}</Text>
    <Copy color={colors.ink}>{streak ? `${plural(streak, 'week')} in a row · ${plural(TICKET_STREAK_WEEKS - along, 'week')} to your next ticket`
      : 'Go on an adventure this week to start a streak'}</Copy>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: TICKET_STREAK_WEEKS, now: along }} style={styles.track}>
      <View style={[styles.fill, gradient(), { width: `${along / TICKET_STREAK_WEEKS * 100}%` }]} />
    </View>
    <Copy small>Every {TICKET_STREAK_WEEKS} weeks in a row with an adventure gives a ticket, for as long as the streak lasts. A Sub-4 marathon and the Ultra explorer (50 km in one adventure) give one each. Each ticket is an Expedition Permit, with no points needed.{quest.running ? ` Claimed so far: ${quest.running}.` : ''}</Copy>
    {tickets.slice(-4).reverse().map(ticket => <View key={ticket.id} style={look.row}>
      <Text style={look.mark}>🎟</Text>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={look.title}>{ticket.title}</Text>
        <Text style={look.detail}>{ticket.detail} · {new Date(ticket.at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
      </View>
    </View>)}
    {left > 0 && <Button title={`Claim ${left === 1 ? 'your Expedition Permit' : `${left} Expedition Permits`}`} loading={busy} onPress={() => { void claim() }} />}
    {place === 'achievements' && <Button title="Open Legendary Expeditions" secondary onPress={() => router.push('/expeditions')} />}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
  </Panel>
}

const look = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.mintLine, backgroundColor: colors.mint },
  mark: { fontSize: 20, lineHeight: 24 },
  title: { color: colors.ink, fontSize: 14, lineHeight: 19, fontFamily: fonts.heavy },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 16, fontFamily: fonts.body }
}))
