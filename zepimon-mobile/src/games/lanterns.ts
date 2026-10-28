// The Expedition Quest's shrine challenge: light every lantern in a 3 x 3 shrine. Touching a lantern flips it and the
// ones beside it. Each board starts lit and is dimmed by touching three to five different lanterns, so every board can
// be solved (on 3 x 3 there is exactly one shortest answer). The board comes from the quest number, so restarting or
// coming back shows the same puzzle.
export const LANTERN_SIDE = 3
export type Lanterns = { lit: boolean[], presses: number }

export const QUEST_THEMES = [
  { title: 'Ember lanterns', type: 'fire', lore: 'A ruined shrine on the trail holds nine old lanterns. Light them all, and the shrine keeper marks this part of your Expedition Quest as done.' },
  { title: 'Tide stones', type: 'water', lore: 'Nine tide stones glow when the sea is calm. Wake every stone to finish this part of your Expedition Quest.' },
  { title: 'Storm beacons', type: 'electric', lore: 'The beacons on the ridge went dark in the last storm. Relight them all to finish this part of your Expedition Quest.' },
  { title: 'Moon runes', type: 'psychic', lore: 'Runes carved in a circle shine under the moon. Make all nine shine to finish this part of your Expedition Quest.' }
]
export const questTheme = (number: number) => QUEST_THEMES[number % QUEST_THEMES.length]

export function pressLantern(board: Lanterns, index: number): Lanterns {
  if (!Number.isInteger(index) || index < 0 || index >= LANTERN_SIDE ** 2) return board
  const row = Math.floor(index / LANTERN_SIDE), col = index % LANTERN_SIDE
  const lit = board.lit.map((on, i) => {
    const r = Math.floor(i / LANTERN_SIDE), c = i % LANTERN_SIDE
    return Math.abs(r - row) + Math.abs(c - col) <= 1 ? !on : on
  })
  return { lit, presses: board.presses + 1 }
}

export const lanternsLit = (board: Lanterns) => board.lit.every(Boolean)

export function lanternBoard(number: number): Lanterns {
  let draw = (Math.imul(number + 1, 0x9e3779b9) ^ 0x5bd1e995) >>> 0
  const next = () => (draw = (Math.imul(draw, 1664525) + 1013904223) >>> 0)
  const order = Array.from({ length: LANTERN_SIDE ** 2 }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = next() % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let board: Lanterns = { lit: Array(LANTERN_SIDE ** 2).fill(true), presses: 0 }
  for (const index of order.slice(0, 3 + next() % 3)) board = pressLantern(board, index)
  return { ...board, presses: 0 }
}
