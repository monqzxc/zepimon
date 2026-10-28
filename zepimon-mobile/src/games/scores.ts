import { QUIZ_LENGTH } from './quiz.ts'
import { BERRY_ROUNDS } from './berries.ts'
import { SAFARI_BALLS } from './safari.ts'
import { BALLS_PER_KM, BONUS_KM_CAP } from './adventure.ts'
import { ITEM_BALLS, ITEM_COUNT } from './safari-zone.ts'

export type ArcadeGame = 'quiz' | 'berries' | 'guard' | 'trail' | 'safari'
export type ArcadeScores = Partial<Record<ArcadeGame, number>>
// Route Guard and Trail Defense count waves cleared in free play; the Safari Zone counts catches in one round, at most
// one per ball: the 12 it starts with, the walking bonus and every item ball on the map.
export const SCORE_LIMITS: Record<ArcadeGame, number> = { quiz: QUIZ_LENGTH, berries: BERRY_ROUNDS, guard: 10, trail: 12,
  safari: SAFARI_BALLS + BALLS_PER_KM * BONUS_KM_CAP + ITEM_COUNT * ITEM_BALLS }
const games = Object.keys(SCORE_LIMITS) as ArcadeGame[]

export function restoreScores(raw: unknown): ArcadeScores {
  const scores: ArcadeScores = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return scores
  for (const game of games) {
    const score = (raw as ArcadeScores)[game]
    if (typeof score === 'number' && Number.isSafeInteger(score) && score >= 0 && score <= SCORE_LIMITS[game]) scores[game] = score
  }
  return scores
}

export function saveBestScore(previous: ArcadeScores, game: ArcadeGame, score: number): ArcadeScores {
  if (!games.includes(game) || !Number.isSafeInteger(score) || score < 0 || score > SCORE_LIMITS[game]) throw new Error('Invalid game score')
  return { ...previous, [game]: Math.max(previous[game] ?? 0, score) }
}
