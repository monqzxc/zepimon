import { useRef, useState } from 'react'
import { Image, Text, View } from 'react-native'
import { spriteSource } from '../catalog'
import { Button, Copy, Eyebrow, Heading, Panel, colors, styles } from '../ui'
import { answerQuiz, createQuiz, nextQuestion, QUIZ_LENGTH, quizComplete } from './quiz'
import type { Quiz } from './quiz'

export function PokemonQuiz({ best, onComplete }: { best?: number, onComplete: (score: number) => void }) {
  const [game, setGame] = useState<Quiz | null>(null)
  const current = useRef(game)
  function update(next: Quiz) {
    if (current.current === next) return
    const wasComplete = current.current && quizComplete(current.current)
    current.current = next
    setGame(next)
    if (!wasComplete && quizComplete(next)) onComplete(next.score)
  }
  function start() { update(createQuiz()) }
  if (!game) return <Panel>
    <Heading>Who’s That Pokémon?</Heading>
    <Image source={spriteSource('Pikachu')} accessibilityLabel="Pokemon silhouette" resizeMode="contain"
      style={{ width: 192, height: 192, alignSelf: 'center', tintColor: colors.ink }} />
    <Copy>Identify {QUIZ_LENGTH} silhouettes from Gen 1–4. Choose one of four answers, then reveal your mystery Pokemon. Take your time!</Copy>
    <Copy color={colors.gold}>Best: {best === undefined ? 'Not set' : `${best} / ${QUIZ_LENGTH}`}</Copy>
    <Button title="Start quiz" onPress={start} />
  </Panel>
  if (quizComplete(game)) return <Panel>
    <Eyebrow>QUIZ COMPLETE</Eyebrow><Heading>{game.score} / {game.questions.length} correct</Heading>
    <Copy>{game.score === game.questions.length ? 'A perfect field researcher!' : 'Every silhouette is a new discovery. Try another set!'}</Copy>
    <Copy color={colors.gold}>Best: {best === undefined ? 'Not set' : `${best} / ${QUIZ_LENGTH}`}</Copy>
    <Button title="Play quiz again" onPress={start} />
  </Panel>
  const question = game.questions[game.index]
  const revealed = game.selected !== null
  return <View style={{ gap: 12 }}>
    <Panel>
      <Eyebrow>WHO’S THAT POKÉMON? / {game.index + 1} OF {game.questions.length}</Eyebrow>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Copy color={colors.gold}>Score: {game.score}</Copy><Copy small>No timer · take your time</Copy>
      </View>
      <View style={{ backgroundColor: '#204b60', borderWidth: 2, borderColor: colors.edge, borderRadius: 6, paddingVertical: 8 }}>
        <Image source={spriteSource(question.answer)} resizeMode="contain" accessibilityLabel={revealed ? question.answer : 'Mystery Pokemon silhouette'}
          style={{ width: 216, height: 216, alignSelf: 'center', ...(revealed ? {} : { tintColor: colors.ink }) }} />
        <Text style={[styles.heading, { textAlign: 'center', fontSize: 22 }]}>{revealed ? question.answer : '???'}</Text>
      </View>
    </Panel>
    {question.choices.map(choice => <Button key={choice} title={revealed ? `${choice}${choice === question.answer ? ' ✓' : choice === game.selected ? ' ×' : ''}` : choice}
      secondary={!revealed || choice !== question.answer} disabled={revealed}
      onPress={() => { if (current.current) update(answerQuiz(current.current, choice)) }} />)}
    {revealed && <Panel>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.ink, fontSize: 16 }}>{game.selected === question.answer ? 'You got it!' : `It’s ${question.answer}!`}</Text>
      <Button title={game.index === game.questions.length - 1 ? 'See quiz results' : 'Next Pokemon'}
        onPress={() => { if (current.current) update(nextQuestion(current.current)) }} />
    </Panel>}
  </View>
}
