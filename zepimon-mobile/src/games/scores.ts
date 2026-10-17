import { QUIZ_LENGTH } from './quiz.ts'
import { BERRY_ROUNDS } from './berries.ts'

export type ArcadeGame = 'quiz' | 'berries'
export type ArcadeScores = Partial<Record<ArcadeGame, number>>
const limits = { quiz: QUIZ_LENGTH, berries: BERRY_ROUNDS }

export function restoreScores(raw: unknown): ArcadeScores {
  const scores: ArcadeScores = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return scores
  for (const game of ['quiz', 'berries'] as const) {
    const score = (raw as ArcadeScores)[game]
    if (typeof score === 'number' && Number.isSafeInteger(score) && score >= 0 && score <= limits[game]) scores[game] = score
  }
  return scores
}

export function saveBestScore(previous: ArcadeScores, game: ArcadeGame, score: number): ArcadeScores {
  if (!['quiz', 'berries'].includes(game) || !Number.isSafeInteger(score) || score < 0 || score > limits[game]) throw new Error('Invalid game score')
  return { ...previous, [game]: Math.max(previous[game] ?? 0, score) }
}
