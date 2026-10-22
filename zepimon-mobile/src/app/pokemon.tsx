import { useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useJournal } from '../store'
import { averagePace, duration, hasAcquisitionDistance, km } from '../journal'
import { Button, Copy, Eyebrow, Habitat, Heading, Panel, Screen, colors } from '../ui'

export default function PokemonScreen() {
  const { name: param } = useLocalSearchParams<{ name: string }>()
  const name = typeof param === 'string' ? param : ''
  const { journal, buddy, chooseBuddy } = useJournal()
  const [message, setMessage] = useState('')
  return <Screen>
    <Eyebrow>POKEMON RECORD</Eyebrow><Heading>{name || 'Unknown Pokemon'}</Heading>
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    {[false, true].map(shiny => {
      const key = (shiny ? 'Shiny ' : '') + name
      const record = journal?.snapshot.dex[key]
      if (!record || !journal) return <Panel key={key}><Eyebrow>{shiny ? 'SHINY' : 'NORMAL'}</Eyebrow><Copy>Not acquired yet. Keep exploring!</Copy></Panel>
      const valid = hasAcquisitionDistance(name, record, journal.routes)
      return <Habitat key={key} name={name} shiny={shiny}>
        <Eyebrow>{shiny ? '✦ SHINY' : 'NORMAL'} / ACQUIRED</Eyebrow>
        <Heading>{valid ? km(record.meters) : 'Distance unavailable'}</Heading>
        {record.source === 'expedition' ? <>
          <Copy color={colors.ink}>Befriended on a Legendary Expedition.</Copy>
          <Copy>Three clues discovered across 25 km of saved adventures.</Copy>
        </> : valid ? <>
          <Copy color={colors.ink}>Elapsed: {duration(record.elapsedSeconds)}</Copy>
          <Copy>Average pace: {averagePace(record.elapsedSeconds, record.meters)}</Copy>
          <Copy>Hatched at: {duration(record.hatchSeconds)}</Copy>
          <Copy>Steps: {record.steps.toLocaleString()}</Copy>
        </> : <Copy>This older record has no valid distance for this form. A newer qualifying adventure can update it.</Copy>}
        <Copy small>Latest saved record: {new Date(record.finishedAt).toLocaleString()}</Copy>
        <Button title={buddy === key ? 'Your current buddy' : `Choose ${shiny ? 'Shiny' : 'Normal'} buddy`} disabled={buddy === key}
          onPress={() => { chooseBuddy(key).then(() => setMessage('Buddy saved to your phone.')).catch(() => setMessage('Could not save your buddy. Please try again.')) }} />
      </Habitat>
    })}
    <Copy small>Adventure records come from your watch. Expedition friends are saved on this phone, with Normal and Shiny discoveries kept separately.</Copy>
  </Screen>
}
