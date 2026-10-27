import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useJournal } from '../store'
import { averagePace, duration, km, recordForm } from '../journal'
import { decodePath, earnedForms } from '../phone-adventure'
import { findAdventure } from '../adventures'
import type { Adventure } from '../adventures'
import { pokemonType, typeTints } from '../catalog'
import { RouteView } from '../RouteView'
import { cardTitle } from '../ShareCard'
import { PixelSprite } from '../games/TeamPicker'
import { Button, Copy, Eyebrow, Heading, Panel, Screen, Title, colors, fonts, styles } from '../ui'

// One saved adventure: its Pokemon, when it happened, its stats, the route (phone adventures) and the Pokemon it
// reached, with its share image. id is a Journal run's id or a phone adventure's own id.
export default function AdventureDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { progress, phoneRuns } = useJournal()
  const adventure = findAdventure(id, progress, phoneRuns)
  if (!adventure) return <Screen><Panel>
    <Title>Adventure not found</Title>
    <Copy>This adventure is no longer saved on this phone.</Copy>
    <Button title="Back" secondary onPress={() => router.back()} />
  </Panel></Screen>
  return <Details key={adventure.id} adventure={adventure} />
}

const time = (date: Date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Details({ adventure: { id, family, record, device, path } }: { adventure: Adventure }) {
  const points = useMemo(() => path ? decodePath(path) : [], [path])
  const form = recordForm(family, record)
  const earned = earnedForms(family, record.meters, record.mega ?? null)
  const finished = new Date(record.finishedAt)
  const started = record.startedAt != null ? new Date(record.startedAt) : null
  const hatched = record.meters >= 5000 && typeof record.hatchSeconds === 'number' && record.hatchSeconds > 0
  return <Screen>
    <View style={[details.stage, { backgroundColor: typeTints[pokemonType(form === 'Egg' ? family[0] : form)] }]}>
      <Eyebrow>{[device === 'phone' ? 'THIS PHONE' : 'WATCH', record.activity && (record.activity === 'running' ? 'RUN' : 'WALK')].filter(Boolean).join(' · ')}</Eyebrow>
      <View style={{ alignItems: 'center' }}><PixelSprite name={form} shiny={record.shiny} size={136} /></View>
      <Heading>{cardTitle(family, record)}</Heading>
      <Copy color={colors.ink}>{finished.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Copy>
      <Copy small color={colors.ink}>{started && started <= finished ? `${time(started)} – ${time(finished)}` : `Finished at ${time(finished)}`}</Copy>
    </View>
    <View style={details.stats}>
      <Stat label="DISTANCE" value={km(record.meters).replace(' km', '')} unit="km" />
      <Stat label="TIME" value={duration(record.elapsedSeconds)} />
      <Stat label="AVERAGE PACE" value={averagePace(record.elapsedSeconds, record.meters).replace(' /km', '')} unit="/km" />
      {hatched && <Stat label="HATCHED AT" value={duration(record.hatchSeconds)} />}
      {record.steps > 0 && <Stat label="STEPS" value={record.steps.toLocaleString()} />}
    </View>
    {path ? <RouteView points={points} height={280} label={`Route of ${km(record.meters)}`} /> : <Panel>
      <Title>No route</Title>
      <Copy small>Watches count your steps and distance without GPS, so only adventures recorded on this phone draw a route.</Copy>
    </Panel>}
    <Panel>
      <Eyebrow>POKEMON REACHED</Eyebrow>
      {earned.length ? <View style={styles.row}>{earned.map(name => <Pressable key={name} accessibilityRole="button"
        accessibilityLabel={`View ${name} in your Dex`} onPress={() => router.push({ pathname: '/pokemon', params: { name } })}
        style={({ pressed }) => [details.reached, { opacity: pressed ? 0.7 : 1 }]}>
        <PixelSprite name={name} shiny={record.shiny} size={56} />
        <Text style={details.reachedName}>{name}</Text>
      </Pressable>)}</View> : <Copy>The egg did not hatch this time: it needs 5 km in one adventure.</Copy>}
      <Copy small>{family[0]} egg › {family.join(' › ')}{record.mega ? ` › ${record.mega} at 21 km` : ''}</Copy>
    </Panel>
    <Button title="Share image" onPress={() => router.push({ pathname: '/share', params: { id } })} />
  </Screen>
}

function Stat({ label, value, unit }: { label: string, value: string, unit?: string }) {
  return <View accessible accessibilityLabel={`${label.toLowerCase()} ${value} ${unit ?? ''}`} style={details.stat}>
    <Eyebrow color={colors.muted}>{label}</Eyebrow>
    <Text numberOfLines={1} style={details.statValue}>{value}{unit && <Text style={details.statUnit}> {unit}</Text>}</Text>
  </View>
}

const details = StyleSheet.create({
  stage: { borderRadius: 24, padding: 18, gap: 6, borderWidth: 1, borderColor: colors.line },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '45%', flexGrow: 1, backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.black, color: colors.ink, fontSize: 28, lineHeight: 36 },
  statUnit: { fontFamily: fonts.heavy, color: colors.muted, fontSize: 15 },
  reached: { alignItems: 'center', minWidth: 72, padding: 6, borderRadius: 16, backgroundColor: colors.sunken },
  reachedName: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.ink }
})
