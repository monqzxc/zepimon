import { useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useJournal } from '../store'
import { averagePace, duration, hasAcquisitionDistance, km } from '../journal'
import { eggMovesOf } from '../games/roster'
import { dexNumber, pokemonType } from '../catalog'
import { eggOf } from '../plan'
import { useCloud } from '../cloud'
import { Button, Copy, Eyebrow, Habitat, Heading, Panel, Screen, TypeBadge, colors } from '../ui'

export default function PokemonScreen() {
  const { name: param } = useLocalSearchParams<{ name: string }>()
  const name = typeof param === 'string' ? param : ''
  const { journal, dex, buddy, chooseBuddy, chooseEgg } = useJournal()
  const { session, linked } = useCloud()
  const [message, setMessage] = useState('')
  const egg = eggOf(name)
  // Makes this Pokemon's egg the next one, in the Adventure tab and, through the cloud, on the watch.
  function hatchNext() {
    if (!egg) return
    chooseEgg(egg.family, egg.mega)
      .then(() => setMessage(`Next egg: ${egg.family[0]}${egg.mega ? `, with ${egg.mega} at 21 km` : ''}. It waits in the Adventure tab` +
        (session && linked ? ' and on your watch.' : '. Link your watch in Sync to see it there too.')))
      .catch(() => setMessage('Could not choose this egg. Please try again.'))
  }
  return <Screen>
    <Panel style={{ gap: 6 }}>
      <Eyebrow color={colors.muted}>{dexNumber(name)}</Eyebrow>
      <Heading>{name || 'Unknown Pokemon'}</Heading>
      <TypeBadge type={pokemonType(name)} />
      {egg && <Button title="Hatch this next" secondary onPress={hatchNext} />}
    </Panel>
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    {[false, true].map(shiny => {
      const key = (shiny ? 'Shiny ' : '') + name
      const record = dex[key]
      if (!record) return <Panel key={key}><Eyebrow>{shiny ? 'SHINY' : 'NORMAL'}</Eyebrow><Copy>Not acquired yet. Keep exploring!</Copy></Panel>
      const caught = record.source === 'safari'
      const eggMoves = eggMovesOf(name).sort((a, b) => b.power - a.power || a.name.localeCompare(b.name))
      const valid = !!journal && hasAcquisitionDistance(name, record, journal.routes)
      return <Habitat key={key} name={name} shiny={shiny}>
        <Eyebrow>{shiny ? '✦ SHINY' : 'NORMAL'} / {caught ? '◎ SAFARI CATCH' : 'ACQUIRED'}</Eyebrow>
        <Heading>{caught ? 'Caught in Safari Hunt' : valid ? km(record.meters) : 'Distance unavailable'}</Heading>
        {caught ? <>
          <Copy color={colors.ink}>Caught in the Safari Hunt mini-game on this phone.</Copy>
          <Copy>No walking or running record. Hatch this Pokemon on a watch adventure to add distance, steps and time.</Copy>
        </> : record.source === 'expedition' ? <>
          <Copy color={colors.ink}>Befriended on a Legendary Expedition.</Copy>
          <Copy>Three clues discovered across 25 km of saved adventures.</Copy>
        </> : valid ? <>
          <Copy color={colors.ink}>Elapsed: {duration(record.elapsedSeconds)}</Copy>
          <Copy>Average pace: {averagePace(record.elapsedSeconds, record.meters)}</Copy>
          <Copy>Hatched at: {duration(record.hatchSeconds)}</Copy>
          {record.steps > 0 && <Copy>Steps: {record.steps.toLocaleString()}</Copy>}
        </> : <Copy>This older record has no valid distance for this form. A newer qualifying adventure can update it.</Copy>}
        {!record.source && <Copy small color={colors.gold}>{eggMoves.length
          ? `Hatched from an egg · ${eggMoves.length} egg moves: ${eggMoves.slice(0, 5).map(move => move.name).join(', ')}${eggMoves.length > 5 ? ' and more' : ''}. They power it up in Route Guard and Trail Defense.`
          : 'Hatched from an egg · this family has no Gen II–IV egg moves.'}</Copy>}
        <Copy small>{caught ? 'Caught' : 'Latest saved record'}: {new Date(record.finishedAt).toLocaleString()}</Copy>
        <Button title={buddy === key ? 'Your current buddy' : `Choose ${shiny ? 'Shiny' : 'Normal'} buddy`} disabled={buddy === key}
          onPress={() => { chooseBuddy(key).then(() => setMessage('Buddy saved to your phone.')).catch(() => setMessage('Could not save your buddy. Please try again.')) }} />
      </Habitat>
    })}
    <Copy small>Adventure records come from your watch or the Adventure tab (phones count distance by GPS, not steps). Expedition friends and ◎ Safari catches are saved on this phone, with Normal and Shiny discoveries kept separately.</Copy>
  </Screen>
}
