import test from 'node:test'
import assert from 'node:assert/strict'
import { answerQuiz, createQuiz, nextQuestion, quizComplete, quizPokemon, QUIZ_LENGTH } from '../src/games/quiz.ts'
import { BERRY_DURATION, BERRY_INTERVAL, BERRY_ROUNDS, catchBerry, pauseBerries, readyBerries, resumeBerries, startBerries, tickBerries } from '../src/games/berries.ts'
import { restoreScores, saveBestScore } from '../src/games/scores.ts'

test('quiz provides ten distinct Gen 1–4 questions, each with exactly one correct choice', () => {
  assert.ok(quizPokemon.includes('Bulbasaur'))
  assert.ok(quizPokemon.includes('Gible'))
  assert.ok(!quizPokemon.includes('Snivy'))
  const before = [...quizPokemon]
  const game = createQuiz(quizPokemon, () => 0.5)
  assert.equal(game.questions.length, QUIZ_LENGTH)
  assert.equal(new Set(game.questions.map(question => question.answer)).size, QUIZ_LENGTH)
  for (const question of game.questions) {
    assert.equal(new Set(question.choices).size, 4)
    assert.equal(question.choices.filter(choice => choice === question.answer).length, 1)
  }
  assert.deepEqual(quizPokemon, before)
  assert.equal(createQuiz(['A', 'A', 'B', 'C']).questions.length, 0)
})

test('quiz guards skipped questions, invalid choices, repeated answers and completion', () => {
  let game = createQuiz(quizPokemon, () => 0)
  assert.strictEqual(nextQuestion(game), game)
  assert.strictEqual(answerQuiz(game, 'Not a choice'), game)
  for (let index = 0; index < QUIZ_LENGTH; index++) {
    const question = game.questions[index]
    const answer = index % 2 ? question.choices.find(choice => choice !== question.answer) : question.answer
    const answered = answerQuiz(game, answer)
    assert.strictEqual(answerQuiz(answered, question.answer), answered, 'One answer per question')
    assert.equal(game.selected, null, 'Previous state is unchanged')
    game = nextQuestion(answered)
  }
  assert.equal(game.score, 5)
  assert.ok(quizComplete(game))
  assert.strictEqual(nextQuestion(game), game)
  assert.strictEqual(answerQuiz(game, 'Bulbasaur'), game)
  assert.equal(quizComplete(createQuiz([])), false)
})

test('berries award one point per appearance and ignore wrong cells or repeated taps', () => {
  const ready = readyBerries()
  assert.strictEqual(catchBerry(ready, 0, 0, 100), ready)
  let game = startBerries(100, () => 0)
  game = catchBerry(game, 1, 0, 200, () => 0)
  assert.equal(game.score, 0)
  game = catchBerry(game, 0, 0, 300, () => 0)
  assert.equal(game.score, 1)
  assert.ok(game.caught)
  assert.equal(catchBerry(game, 0, 0, 400, () => 0).score, 1)
  const next = tickBerries(game, 100 + BERRY_INTERVAL, () => 0)
  assert.notEqual(next.target, game.target)
  assert.equal(next.round, 1)
  assert.equal(next.caught, false)
  assert.equal(next.score, 1)
})

test('berries enforce the deadline at input time, even with a late timer callback', () => {
  const game = startBerries(0, () => 0)
  const late = catchBerry(game, 1, 0, BERRY_INTERVAL, () => 0)
  assert.equal(late.target, 1)
  assert.equal(late.score, 0, 'A tap for the previous round cannot catch the new target')
  const end = catchBerry(game, 0, 0, BERRY_DURATION, () => 0)
  assert.equal(end.status, 'complete')
  assert.equal(end.elapsed, BERRY_DURATION)
  assert.equal(end.score, 0)
  assert.strictEqual(tickBerries(end, BERRY_DURATION * 2), end)
  const jumped = tickBerries(game, 12 * BERRY_INTERVAL + 500, () => 0)
  assert.equal(jumped.round, 12)
  assert.equal(jumped.score, 0, 'Skipped appearances do not add points')
})

test('pause freezes the round; resume counts only foreground play time', () => {
  const running = catchBerry(startBerries(100, () => 0), 0, 0, 300)
  const paused = pauseBerries(running, 700)
  assert.equal(paused.elapsed, 600)
  assert.equal(paused.status, 'paused')
  assert.strictEqual(pauseBerries(paused, 50000), paused)
  assert.strictEqual(tickBerries(paused, 60000), paused)
  assert.strictEqual(catchBerry(paused, paused.target, paused.round, 61000), paused)
  const resumed = resumeBerries(paused, 62000)
  const next = tickBerries(resumed, 62500)
  assert.equal(next.elapsed, 1100)
  assert.equal(next.score, 1)
  assert.ok(next.caught)
  assert.equal(pauseBerries(startBerries(0), BERRY_DURATION + 5).status, 'complete')
})

test('all twenty berry appearances can be caught, and nothing scores after completion', () => {
  let game = startBerries(0, () => 0)
  for (let round = 0; round < BERRY_ROUNDS; round++) {
    const now = round * BERRY_INTERVAL + 50
    game = tickBerries(game, now, () => 0.5)
    game = catchBerry(game, game.target, round, now)
  }
  assert.equal(game.score, BERRY_ROUNDS)
  game = tickBerries(game, BERRY_DURATION)
  assert.strictEqual(catchBerry(game, game.target, game.round, BERRY_DURATION + 1), game)
  assert.equal(startBerries(BERRY_DURATION + 10).score, 0)
})

test('score restoration supports old saves, preserves zero and ignores corrupt fields', () => {
  assert.deepEqual(restoreScores(undefined), {})
  assert.deepEqual(restoreScores(null), {})
  assert.deepEqual(restoreScores([1, 2]), {})
  assert.deepEqual(restoreScores({ quiz: 0, berries: 20, other: 999 }), { quiz: 0, berries: 20 })
  for (const score of [-1, 1.2, '5', NaN, Infinity, 999]) assert.deepEqual(restoreScores({ quiz: score, berries: score }), {})
})

test('each game keeps its own highest valid score without overwriting other data', () => {
  const saved = { quiz: 8, berries: 12 }
  assert.deepEqual(saveBestScore(saved, 'quiz', 3), saved)
  assert.deepEqual(saveBestScore(saved, 'berries', 17), { quiz: 8, berries: 17 })
  assert.deepEqual(saveBestScore({}, 'quiz', 0), { quiz: 0 })
  assert.deepEqual(saved, { quiz: 8, berries: 12 })
  for (const [game, score] of [['quiz', 11], ['berries', 21], ['quiz', -1], ['berries', 0.2], ['constructor', 1]]) {
    assert.throws(() => saveBestScore(saved, game, score), /Invalid game score/)
  }
})
