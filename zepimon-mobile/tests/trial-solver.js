import { startRoom, stepRoom } from '../src/games/trial.ts'

const DIRECTIONS = ['north', 'south', 'west', 'east']
export const LIMIT = 500000

// Everything that decides what can happen next. Seen tiles, facing, moves, attunes and clues read never change a rule, so they stay out.
// Boulders keep their own slots and relics the order they were found, so both are sorted: the same tiles are the same state.
export const stateKey = room => [`${room.at.x},${room.at.y}`, [...room.relics].sort().join(';'), room.open, [...room.boulders].sort().join(';'),
  [...room.holes].sort().join(';'), room.doorsOpen, [...room.lit].sort().join(';'), room.pattern].join('|')

// The fewest moves that clear a room, by a 0-1 breadth-first search over the real rules. A press that walks, pushes or warps costs one move;
// a bump costs none but can still matter: attuning the meteorite clears the star island (and a failed attune may reset its crystals),
// so bumps are free edges taken first. `min` is the cleared room's own `moves`, and `route` the presses that reach it.
// Rooms that fall are dropped, and stored rooms forget their seen tiles to save memory. Returns { tooBig: true } past LIMIT states.
export function solveRoom(stage) {
  const start = { ...startRoom(stage), seen: [] }
  const best = new Map([[stateKey(start), { moves: 0, parent: null, direction: null }]])
  const back = [start], front = []
  let head = 0
  const route = key => {
    const presses = []
    for (let at = best.get(key); at.parent; at = best.get(at.parent)) presses.unshift(at.direction)
    return presses
  }
  while (front.length || head < back.length) {
    const room = front.length ? front.pop() : back[head++]
    const key = room.status === 'cleared' ? `cleared|${stateKey(room)}` : stateKey(room)
    if (best.get(key).moves < room.moves) continue
    if (room.status === 'cleared') return { min: room.moves, route: route(key), states: best.size }
    for (const direction of DIRECTIONS) {
      const { room: next, move } = stepRoom(room, stage, direction)
      if (next.status === 'fell') continue
      const nextKey = next.status === 'cleared' ? `cleared|${stateKey(next)}` : stateKey(next)
      const known = best.get(nextKey)
      if (known && known.moves <= next.moves) continue
      best.set(nextKey, { moves: next.moves, parent: key, direction })
      if (best.size > LIMIT) return { tooBig: true }
      if (move === 'bump') front.push({ ...next, seen: [] })
      else back.push({ ...next, seen: [] })
    }
  }
  return { min: undefined, route: [], states: best.size }
}

// The fewest crystal presses (walking ignored) that turn the island's start alignment into its target.
export function crystalPresses(star) {
  const keyOf = (lit, pattern) => `${[...lit].sort().join(';')}|${pattern}`
  const target = keyOf(star.target.lit, star.target.pattern)
  const seen = new Set([keyOf(star.startLit, 0)])
  let layer = [{ lit: [...star.startLit], pattern: 0 }]
  for (let presses = 0; layer.length; presses++) {
    if (layer.some(state => keyOf(state.lit, state.pattern) === target)) return presses
    const next = []
    for (const state of layer) {
      for (const node of star.nodes) {
        const flip = new Set(state.lit)
        for (const id of [node.id, ...node.links]) { if (!flip.delete(id)) flip.add(id) }
        const moved = { lit: [...flip], pattern: (state.pattern + node.turns) % star.patterns }
        const key = keyOf(moved.lit, moved.pattern)
        if (!seen.has(key)) { seen.add(key); next.push(moved) }
      }
    }
    layer = next
  }
  return undefined
}
