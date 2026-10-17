import { useState } from 'react'
import { useJournal } from '../../store'
import { MemoryMatch } from '../../MemoryMatch'
import { Copy, Eyebrow, Heading, Screen, colors } from '../../ui'

export default function PlayScreen() {
  const { journal, bestMoves, recordWin } = useJournal()
  const [message, setMessage] = useState('')
  const entries = Object.keys(journal?.snapshot.dex || {}).map(key => ({ key, name: key.replace(/^Shiny /, ''), shiny: key.startsWith('Shiny ') }))
  return <Screen>
    <Eyebrow>A LITTLE TRAIL BREAK</Eyebrow><Heading>Rest. Play. Repeat.</Heading>
    <Copy>A quiet game with the Pokemon you’ve met. Your best scores stay on this phone.</Copy>
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    <MemoryMatch entries={entries} bestMoves={bestMoves} onComplete={(pairs, moves) => {
      recordWin(pairs, moves).then(() => setMessage('Your score is saved.')).catch(() => setMessage('Could not save this score. Please try again.'))
    }} />
  </Screen>
}
