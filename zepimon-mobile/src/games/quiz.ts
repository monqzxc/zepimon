import { shuffle } from '../memory.ts'
import { species } from '../generated/catalog.js'

export const QUIZ_LENGTH = 10
export const quizPokemon = Object.entries(species).filter(([, value]) => value.gen <= 4).map(([name]) => name)
export type QuizQuestion = { answer: string, choices: string[] }
export type Quiz = { questions: QuizQuestion[], index: number, selected: string | null, score: number }

export function createQuiz(names: readonly string[] = quizPokemon, random = Math.random): Quiz {
  const pool = [...new Set(names)]
  const questions = pool.length < 4 ? [] : shuffle(pool, random).slice(0, QUIZ_LENGTH).map(answer => ({
    answer, choices: shuffle([answer, ...shuffle(pool.filter(name => name !== answer), random).slice(0, 3)], random)
  }))
  return { questions, index: 0, selected: null, score: 0 }
}

export function answerQuiz(game: Quiz, answer: string): Quiz {
  const question = game.questions[game.index]
  if (!question || game.selected !== null || !question.choices.includes(answer)) return game
  return { ...game, selected: answer, score: game.score + Number(answer === question.answer) }
}

export function nextQuestion(game: Quiz): Quiz {
  return game.selected === null ? game : { ...game, index: game.index + 1, selected: null }
}

export function quizComplete(game: Quiz): boolean {
  return game.questions.length > 0 && game.index === game.questions.length
}
