import { STOPS } from './adventure.ts'
import { LEVELS } from './levels.ts'
import type { ArcadeScores } from './scores.ts'
import type { DexRecord } from '../journal.ts'

// Arcade achievements: the third way to a Legendary encounter, beside the 25 km distance route and the Expedition
// Quest. Each achievement is worth points, and every ARCADE_PERMIT_POINTS of them can be traded for an Expedition Permit
// (src/expedition-quest.ts), which opens the next encounter: the trial, chamber, battle and catch still decide whether
// the Legendary joins you. Achievements are read from what the games already save (best scores, Memory Match moves,
// Adventure Map and Trail Defense stars, Safari catches), which only ever improve, so replaying a game, restarting the
// app or importing again can never count one twice.
export const ARCADE_PERMIT_POINTS = 100

export type ArcadeRecords = { arcadeScores: ArcadeScores, bestMoves: Record<string, number>, adventure: Record<string, number>,
  trailLevels: Record<string, number>, safari: Record<string, DexRecord> }
export type Achievement = { id: string, game: string, title: string, description: string, points: number, value: number, goal: number }

export function arcadeAchievements(records: ArcadeRecords): Achievement[] {
  const { arcadeScores: scores, bestMoves, adventure, trailLevels, safari } = records
  const sixPairs = bestMoves[6]
  const mapStars = STOPS.reduce((sum, stop) => sum + (adventure[stop.id] || 0), 0)
  const mapCleared = STOPS.filter(stop => (adventure[stop.id] || 0) >= 1).length
  const levelStars = LEVELS.reduce((sum, level) => sum + (trailLevels[level.id] || 0), 0)
  const levelsCleared = LEVELS.filter(level => (trailLevels[level.id] || 0) >= 1).length
  const safariSpecies = new Set(Object.keys(safari).map(key => key.replace(/^Shiny /, ''))).size
  const safariShiny = Number(Object.keys(safari).some(key => key.startsWith('Shiny ')))
  const won = Object.keys(bestMoves).length
  return [
    { id: 'memory-win', game: 'Memory Match', title: 'First match', description: 'Win a game of Memory Match.', points: 10, value: Math.min(1, won), goal: 1 },
    { id: 'memory-six', game: 'Memory Match', title: 'Sharp memory', description: 'Win Memory Match with six pairs.', points: 20, value: Number(sixPairs > 0), goal: 1 },
    { id: 'memory-perfect', game: 'Memory Match', title: 'Photographic memory', description: 'Win with six pairs in 9 moves or fewer.', points: 30, value: Number(sixPairs > 0 && sixPairs <= 9), goal: 1 },
    { id: 'quiz-5', game: 'Pokémon Quiz', title: 'Pokémon student', description: 'Score 5 or more in the Pokémon Quiz.', points: 10, value: scores.quiz ?? 0, goal: 5 },
    { id: 'quiz-8', game: 'Pokémon Quiz', title: 'Pokémon expert', description: 'Score 8 or more in the Pokémon Quiz.', points: 20, value: scores.quiz ?? 0, goal: 8 },
    { id: 'quiz-10', game: 'Pokémon Quiz', title: 'Professor', description: 'Answer all 10 quiz questions correctly.', points: 30, value: scores.quiz ?? 0, goal: 10 },
    { id: 'berries-10', game: 'Berry Catch', title: 'Berry picker', description: 'Catch 10 berries in one game.', points: 10, value: scores.berries ?? 0, goal: 10 },
    { id: 'berries-15', game: 'Berry Catch', title: 'Berry gatherer', description: 'Catch 15 berries in one game.', points: 20, value: scores.berries ?? 0, goal: 15 },
    { id: 'berries-20', game: 'Berry Catch', title: 'Full basket', description: 'Catch all 20 berries in one game.', points: 30, value: scores.berries ?? 0, goal: 20 },
    { id: 'guard-5', game: 'Route Guard', title: 'Route guardian', description: 'Clear 5 waves in Route Guard free play.', points: 10, value: scores.guard ?? 0, goal: 5 },
    { id: 'guard-10', game: 'Route Guard', title: 'Unbreakable line', description: 'Clear all 10 waves in Route Guard free play.', points: 30, value: scores.guard ?? 0, goal: 10 },
    { id: 'trail-6', game: 'Trail Defense', title: 'Trail keeper', description: 'Clear 6 waves in Trail Defense free play.', points: 10, value: scores.trail ?? 0, goal: 6 },
    { id: 'trail-12', game: 'Trail Defense', title: 'Trail master', description: 'Clear all 12 waves in Trail Defense free play.', points: 30, value: scores.trail ?? 0, goal: 12 },
    { id: 'levels-5', game: 'Trail Defense', title: 'Stage one', description: 'Clear 5 Trail Defense levels.', points: 10, value: levelsCleared, goal: 5 },
    { id: 'levels-10', game: 'Trail Defense', title: 'Halfway there', description: 'Clear 10 Trail Defense levels.', points: 20, value: levelsCleared, goal: 10 },
    { id: 'levels-20', game: 'Trail Defense', title: 'Shadow Summit', description: `Clear all ${LEVELS.length} Trail Defense levels.`, points: 30, value: levelsCleared, goal: LEVELS.length },
    { id: 'levels-stars', game: 'Trail Defense', title: 'Three stars everywhere', description: `Earn all ${LEVELS.length * 3} Trail Defense stars.`, points: 40, value: levelStars, goal: LEVELS.length * 3 },
    { id: 'map-10', game: 'Adventure Map', title: 'Map reader', description: 'Earn 10 stars on the Adventure Map.', points: 10, value: mapStars, goal: 10 },
    { id: 'map-clear', game: 'Adventure Map', title: 'Victory Road', description: `Clear all ${STOPS.length} Adventure Map stops.`, points: 30, value: mapCleared, goal: STOPS.length },
    { id: 'map-stars', game: 'Adventure Map', title: 'Map champion', description: `Earn all ${STOPS.length * 3} Adventure Map stars.`, points: 40, value: mapStars, goal: STOPS.length * 3 },
    { id: 'safari-5', game: 'Safari Zone', title: 'Safari rookie', description: 'Catch 5 Pokémon in one Safari Zone round.', points: 10, value: scores.safari ?? 0, goal: 5 },
    { id: 'safari-12', game: 'Safari Zone', title: 'Safari ranger', description: 'Catch 12 Pokémon in one Safari Zone round.', points: 20, value: scores.safari ?? 0, goal: 12 },
    { id: 'safari-dex-10', game: 'Safari Zone', title: 'Field notes', description: 'Catch 10 different species in the Safari Zone.', points: 10, value: safariSpecies, goal: 10 },
    { id: 'safari-dex-30', game: 'Safari Zone', title: 'Safari researcher', description: 'Catch 30 different species in the Safari Zone.', points: 20, value: safariSpecies, goal: 30 },
    { id: 'safari-shiny', game: 'Safari Zone', title: 'Sparkle in the grass', description: 'Catch a Shiny Pokémon in the Safari Zone.', points: 30, value: safariShiny, goal: 1 }
  ]
}

export const achieved = (achievement: Achievement) => achievement.value >= achievement.goal
export const arcadePoints = (records: ArcadeRecords) => arcadeAchievements(records).reduce((sum, item) => sum + (achieved(item) ? item.points : 0), 0)
