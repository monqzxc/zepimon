import { useState } from 'react'
import { useJournal } from '../../store'
import { MemoryMatch } from '../../MemoryMatch'
import { Image, View } from 'react-native'
import { BerryCatch, BerryIcon } from '../../games/BerryCatch'
import { PokemonQuiz } from '../../games/PokemonQuiz'
import type { ArcadeGame } from '../../games/scores'
import { spriteSource } from '../../catalog'
import { Button, Copy, Eyebrow, Heading, Panel, Screen, Sprite, colors } from '../../ui'

export default function PlayScreen() {
  const { journal, bestMoves, recordWin, arcadeScores, recordArcadeScore } = useJournal()
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<'memory' | ArcadeGame | null>(null)
  const entries = Object.keys(journal?.snapshot.dex || {}).map(key => ({ key, name: key.replace(/^Shiny /, ''), shiny: key.startsWith('Shiny ') }))
  function select(game: typeof selected) { setMessage(''); setSelected(game) }
  function saveScore(game: ArcadeGame, score: number) {
    recordArcadeScore(game, score).then(() => setMessage('Your best score is saved on this phone.'))
      .catch(() => setMessage('Could not save this score. Your earlier best is unchanged.'))
  }
  return <Screen>
    <Eyebrow>ZEPIMON / POCKET ARCADE</Eyebrow>
    {selected ? <Button title="Back to arcade" secondary onPress={() => select(null)} /> : <>
      <Heading>A little trail break.</Heading>
      <Copy>Three little games, ready for a rest stop. Play offline and keep your best scores on this phone.</Copy>
      <Panel>
        <Eyebrow>01 / PAIRS & PATIENCE</Eyebrow>
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}><Sprite name="Bulbasaur" size={88} /><Sprite name="Bulbasaur" shiny size={88} /></View>
        <Heading>Memory Match</Heading>
        <Copy>Find matching Normal and Shiny pairs from your collection. Import at least two variants to play.</Copy>
        <Button title="Play Memory Match" onPress={() => select('memory')} />
      </Panel>
      <Panel>
        <Eyebrow>02 / FIELD RESEARCH</Eyebrow>
        <Image source={spriteSource('Pikachu')} resizeMode="contain" accessibilityLabel="Mystery Pokemon silhouette"
          style={{ width: 144, height: 144, alignSelf: 'center', tintColor: colors.ink }} />
        <Heading>Who’s That Pokémon?</Heading>
        <Copy>Ten silhouettes. Four choices. How well do you know Gen 1–4?</Copy>
        <Copy small color={colors.gold}>Best: {arcadeScores.quiz === undefined ? 'Not set' : `${arcadeScores.quiz} / 10`}</Copy>
        <Button title="Play Pokemon Quiz" onPress={() => select('quiz')} />
      </Panel>
      <Panel style={{ borderColor: '#79b977', backgroundColor: '#12392e' }}>
        <Eyebrow>03 / GARDEN DASH</Eyebrow>
        <View style={{ height: 104, alignItems: 'center', justifyContent: 'center' }}><BerryIcon /></View>
        <Heading>Berry Catch</Heading>
        <Copy>A 30-second garden game. Tap each ripe berry before it hops to another patch.</Copy>
        <Copy small color={colors.gold}>Best: {arcadeScores.berries === undefined ? 'Not set' : `${arcadeScores.berries} / 20`}</Copy>
        <Button title="Play Berry Catch" onPress={() => select('berries')} />
      </Panel>
      <Copy small>Quiz and Berry Catch are available right away. Game points stay in the arcade; your walking distance, hatching and Dex records come from your watch.</Copy>
    </>}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    {selected === 'memory' && <MemoryMatch entries={entries} bestMoves={bestMoves} onComplete={(pairs, moves) => {
      recordWin(pairs, moves).then(() => setMessage('Your score is saved.')).catch(() => setMessage('Could not save this score. Please try again.'))
    }} />}
    {selected === 'quiz' && <PokemonQuiz best={arcadeScores.quiz} onComplete={score => saveScore('quiz', score)} />}
    {selected === 'berries' && <BerryCatch best={arcadeScores.berries} onComplete={score => saveScore('berries', score)} />}
  </Screen>
}
