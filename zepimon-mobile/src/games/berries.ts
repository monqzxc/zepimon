export const BERRY_ROUNDS = 20
export const BERRY_INTERVAL = 1500
export const BERRY_DURATION = BERRY_ROUNDS * BERRY_INTERVAL
export type BerryGame = {
  status: 'ready' | 'playing' | 'paused' | 'complete'
  elapsed: number
  lastTick: number
  round: number
  target: number
  caught: boolean
  score: number
}

export function readyBerries(): BerryGame {
  return { status: 'ready', elapsed: 0, lastTick: 0, round: 0, target: 0, caught: false, score: 0 }
}

export function startBerries(now: number, random = Math.random): BerryGame {
  return { ...readyBerries(), status: 'playing', lastTick: now, target: Math.floor(random() * 9) }
}

export function tickBerries(game: BerryGame, now: number, random = Math.random): BerryGame {
  if (game.status !== 'playing' || now <= game.lastTick) return game
  const elapsed = Math.min(BERRY_DURATION, game.elapsed + now - game.lastTick)
  if (elapsed >= BERRY_DURATION) return { ...game, status: 'complete', elapsed, lastTick: now }
  const round = Math.floor(elapsed / BERRY_INTERVAL)
  if (round === game.round) return { ...game, elapsed, lastTick: now }
  const choice = Math.floor(random() * 8)
  return { ...game, elapsed, lastTick: now, round, target: choice >= game.target ? choice + 1 : choice, caught: false }
}

export function catchBerry(game: BerryGame, cell: number, displayedRound: number, now: number, random = Math.random): BerryGame {
  const next = tickBerries(game, now, random)
  if (next.status !== 'playing' || next.round !== displayedRound || next.caught || cell !== next.target) return next
  return { ...next, caught: true, score: next.score + 1 }
}

export function pauseBerries(game: BerryGame, now: number): BerryGame {
  const next = tickBerries(game, now)
  return next.status === 'playing' ? { ...next, status: 'paused' } : next
}

export function resumeBerries(game: BerryGame, now: number): BerryGame {
  return game.status === 'paused' ? { ...game, status: 'playing', lastTick: now } : game
}
