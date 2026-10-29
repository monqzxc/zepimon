import { trialStages as generatedStages } from '../generated/trial-maps.js'
import { startRoom } from './trial.ts'
import type { Room, Stage, TrialKind } from './trial.ts'

// Which trial each Legendary gets, which rooms the player plays given their own records, and the saved multi-room run.
// Rooms are authored data (generated/trial-maps.js) and their rules live in trial.ts; this file only picks and sequences them.
const trialStages = generatedStages as Record<string, Stage>

export const KIND_NAMES: Record<TrialKind, string> = { switch: 'Switch Maze', crumble: 'Crumbling Floor', dark: 'Dark Labyrinth', temple: 'Ancient Temple',
  warp: 'Warp Chamber', star: 'Shattered Star' }

// Best moves per room id.
export type TrialRecords = Record<string, number>

// Each Legendary's shrine: its trial's name, the kind of rooms it uses and a line of lore.
const TRIALS: Record<string, [string, TrialKind, string]> = {
  Articuno: ['Frozen Feather Path', 'crumble', 'Frost has sealed the old paths. Follow the falling feathers to Articuno’s clearing.'],
  Zapdos: ['Thunder Spire', 'switch', 'Lightning has split the spire into narrow halls. Find the one that leads to Zapdos.'],
  Moltres: ['Ember Caldera', 'crumble', 'Cooling lava twists through the caldera. Pick a safe way across to Moltres.'],
  Mewtwo: ['Psychic Labyrinth', 'warp', 'A maze of false turns guards the lab’s last room. Find the exit to face Mewtwo.'],
  Mew: ['Bubble Garden', 'warp', 'Something playful keeps moving the hedges. Follow the giggles to the heart of the garden.'],
  Raikou: ['Storm Run', 'switch', 'Thunder echoes down long corridors. Race through to where Raikou waits.'],
  Entei: ['Burned Tower', 'dark', 'Charred beams block the tower’s rooms. Find a way down to Entei.'],
  Suicune: ['Crystal Spring', 'crumble', 'Clear water winds inward. Follow the current to Suicune’s spring.'],
  Lugia: ['Whirl Islands', 'temple', 'The whirlpools pull every path toward the deep. Ride them down to Lugia.'],
  'Ho-Oh': ['Bell Tower Ascent', 'switch', 'Climb the tower floor by floor to the rainbow at its top.'],
  Celebi: ['Ilex Shrine', 'dark', 'The forest shifts between moments. Keep to the path and reach the little shrine.'],
  Regirock: ['Desert Ruins', 'temple', 'Sand fills half the chambers. Find the sealed door that opens to Regirock.'],
  Regice: ['Island Cave', 'crumble', 'The frozen rooms all look alike. Find the one where Regice sleeps.'],
  Registeel: ['Ancient Tomb', 'temple', 'Iron walls seal the tomb’s chambers. Work your way to Registeel.'],
  Latias: ['Southern Island Breeze', 'crumble', 'A warm wind runs through the island trees. Follow it to Latias.'],
  Latios: ['Southern Island Dusk', 'crumble', 'Evening light paints a path through the trees. Follow it to Latios.'],
  Kyogre: ['Marine Cave', 'dark', 'The tide channels coil toward the cave’s centre. Swim down to Kyogre.'],
  Groudon: ['Terra Cave', 'dark', 'Hot stone corridors protect the sleeping guardian. Find the way through to Groudon.'],
  Rayquaza: ['Sky Pillar Ascent', 'crumble', 'Ancient winds twist the stairs to the sky. Climb to the top to meet Rayquaza.'],
  Jirachi: ['Wishing Star Path', 'switch', 'A trail of falling stars curls inward. Follow it to where Jirachi dreams.'],
  Deoxys: ['Shattered Star', 'star', 'A strange meteorite hums at the island’s heart. Wake the right crystals to stir what sleeps inside.'],
  Uxie: ['Lake Acuity', 'warp', 'The cave remembers every step. Follow the warps inward to Uxie.'],
  Mesprit: ['Lake Verity', 'warp', 'Warm feelings guide the way. Follow the warps inward to Mesprit.'],
  Azelf: ['Lake Valor', 'warp', 'Only the brave keep going. Follow the warps inward to Azelf.'],
  Dialga: ['Spear Pillar: Time', 'warp', 'Each column ticks like a clock. Walk between the moments to Dialga.'],
  Palkia: ['Spear Pillar: Space', 'warp', 'Space folds between the columns. Find the true way to Palkia.'],
  Heatran: ['Stark Mountain', 'crumble', 'Magma glows through cracks in the trail. Wind up the mountain to Heatran.'],
  Regigigas: ['Snowpoint Temple', 'temple', 'Three keys woke the temple. Cross its rooms to the colossus.'],
  Giratina: ['Distortion World', 'dark', 'Up and down trade places here. Find the exit to face Giratina.'],
  Cresselia: ['Fullmoon Island', 'dark', 'Moonlight spirals through the trees. Follow it to Cresselia.'],
  Phione: ['Sea Currents', 'temple', 'Gentle currents swirl together. Drift along them to Phione.'],
  Manaphy: ['Sea Temple', 'temple', 'The temple’s halls spiral toward its heart. Swim on to Manaphy.'],
  Darkrai: ['Newmoon Nightmare', 'dark', 'Dark dreams fill these rooms. Find the waking door to Darkrai.'],
  Shaymin: ['Flower Paradise', 'temple', 'Gracidea blooms line a winding path. Follow the flowers to Shaymin.'],
  Arceus: ['Hall of Origin', 'switch', 'Endless columns rise into light. Walk between them to Arceus.'],
  Zygarde: ['Terminus Cave', 'dark', 'Green cells glow along the cave walls. Follow them to Zygarde.'],
  Diancie: ['Diamond Domain', 'temple', 'Crystal rooms reflect every turn. Find the one where Diancie sparkles.'],
  Magearna: ['Azoth Clockwork', 'switch', 'Gears turn between the corridors. Find the path to Magearna’s chamber.'],
  Zeraora: ['Thunderclap Trail', 'switch', 'Sparks leap between narrow halls. Chase them to Zeraora.']
}

// A kind's rooms: its tutorial first if never cleared, then main room `tier + 1`, where tier is how many main rooms are cleared (at most 2).
// The Shattered Star is a single island room with no tutorial.
export function trialFor(name: string, records: TrialRecords): { title: string, lore: string, kind: TrialKind, stages: string[] } {
  const [title, kind, lore] = Object.hasOwn(TRIALS, name) ? TRIALS[name] : [`${name}’s Shrine`, 'switch', `A quiet maze protects ${name}. Find the golden exit to reach it.`] as const
  if (kind === 'star') return { title, lore, kind, stages: ['star'] }
  const cleared = (id: string) => Object.hasOwn(records, id)
  const tier = Math.min(2, [1, 2, 3].filter(room => cleared(`${kind}-${room}`)).length)
  return { title, lore, kind, stages: [...(cleared(`${kind}-tutorial`) ? [] : [`${kind}-tutorial`]), `${kind}-${tier + 1}`] }
}

// A run through one trial's rooms: the room being played and the moves each earlier room took. JSON-safe.
export type TrialRun = { stages: string[], index: number, room: Room, results: Record<string, number> }

export const startRun = (stages: string[]): TrialRun => ({ stages, index: 0, room: startRoom(trialStages[stages[0]]), results: {} })

// Records the room's moves, then moves on to the next room. On the last room it records and stays.
export function nextRoom(run: TrialRun): TrialRun {
  const results = { ...run.results, [run.stages[run.index]]: run.room.moves }
  if (run.index >= run.stages.length - 1) return { ...run, results }
  return { ...run, index: run.index + 1, room: startRoom(trialStages[run.stages[run.index + 1]]), results }
}

export const restartRoom = (run: TrialRun): TrialRun => ({ ...run, room: startRoom(trialStages[run.stages[run.index]]) })
export const restartRun = (run: TrialRun): TrialRun => startRun(run.stages)
export const runCleared = (run: TrialRun): boolean => run.index === run.stages.length - 1 && run.room.status === 'cleared'

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isList = (value: unknown): value is unknown[] => Array.isArray(value)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const known = (id: string) => Object.hasOwn(trialStages, id)

const DIRECTIONS = ['north', 'south', 'west', 'east']
// Tiles nothing can stand on, and the tiles a boulder can rest on (the grid's own `O` is a boulder on ground).
const SOLID = '#!~R?M'
const GROUND = '.,g@w_O'

// A saved run is only kept if it still fits the rooms as they are now; anything else (or garbage) gives null.
export function restoreRun(raw: unknown): TrialRun | null {
  if (!isRecord(raw) || !isList(raw.stages) || !raw.stages.length || !raw.stages.every(id => typeof id === 'string' && known(id)) ||
      !isCount(raw.index) || raw.index >= raw.stages.length || !isRecord(raw.results) || !isRecord(raw.room)) return null
  const stages = raw.stages as string[]
  const results: Record<string, number> = {}
  for (const [id, moves] of Object.entries(raw.results)) {
    if (!known(id) || !isCount(moves)) return null
    results[id] = moves
  }
  const stage = trialStages[stages[raw.index]]
  const room = restoreRoom(raw.room, stage)
  return room ? { stages, index: raw.index, room, results } : null
}

function restoreRoom(raw: Record<string, unknown>, stage: Stage): Room | null {
  const tileOf = (x: number, y: number) => stage.tiles[y]?.[x]
  const parsePoint = (value: unknown): { x: number, y: number } | null => {
    if (!isRecord(value) || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) return null
    const x = value.x as number, y = value.y as number
    return tileOf(x, y) === undefined ? null : { x, y }
  }
  // A list of unique `x,y` keys that are on the grid and (optionally) on tiles that satisfy `fits`.
  const keys = (value: unknown, fits: (tile: string, x: number, y: number) => boolean = () => true): string[] | null => {
    if (!isList(value)) return null
    const found: string[] = []
    for (const key of value) {
      const match = typeof key === 'string' ? /^(\d+),(\d+)$/.exec(key) : null
      const tile = match ? tileOf(Number(match[1]), Number(match[2])) : undefined
      if (!match || key !== `${Number(match[1])},${Number(match[2])}` || tile === undefined || !fits(tile, Number(match[1]), Number(match[2])) || found.includes(key as string)) return null
      found.push(key as string)
    }
    return found
  }
  const gateLetters = [...'ABC'].filter(letter => stage.tiles.some(row => row.includes(letter))).join('')
  const star = stage.star
  const startBoulders = stage.tiles.reduce((total, row) => total + [...row].filter(tile => tile === 'O').length, 0)
  const at = parsePoint(raw.at), buddy = parsePoint(raw.buddy)
  const boulders = keys(raw.boulders, tile => GROUND.includes(tile))
  const holes = keys(raw.holes, tile => tile === ':')
  const relics = keys(raw.relics, tile => tile === '*')
  const seen = keys(raw.seen)
  const cluesRead = keys(raw.cluesRead, (_, x, y) => !!star?.clues.some(clue => clue.at[0] === x && clue.at[1] === y))
  const lit = raw.lit
  const open = raw.open
  const status = raw.status
  const warpsUsed = raw.warpsUsed
  if (raw.stage !== stage.id || !at || !buddy || !boulders || !holes || !relics || !seen || !cluesRead || boulders.length !== startBoulders ||
      typeof raw.facing !== 'string' || !DIRECTIONS.includes(raw.facing) || typeof raw.buddyFacing !== 'string' || !DIRECTIONS.includes(raw.buddyFacing) ||
      !isCount(raw.moves) || !isCount(raw.attunes) || typeof raw.doorsOpen !== 'boolean' || typeof raw.message !== 'string' ||
      (status !== 'playing' && status !== 'fell' && status !== 'cleared') ||
      typeof open !== 'string' || [...open].some((letter, i) => !gateLetters.includes(letter) || open.indexOf(letter) !== i) ||
      !isList(lit) || lit.some((id, i) => typeof id !== 'string' || !star?.nodes.some(node => node.id === id) || lit.indexOf(id) !== i) ||
      !isCount(raw.pattern) || raw.pattern >= (star?.patterns ?? 1) || !isList(warpsUsed) || warpsUsed.some((pad, i) => typeof pad !== 'string' || !Object.hasOwn(stage.warps, pad) || warpsUsed.indexOf(pad) !== i)) return null
  const tile = tileOf(at.x, at.y)
  const gateShut = 'ABC'.includes(tile) && !open.includes(tile)
  const key = `${at.x},${at.y}`
  // A cleared room ends on its exit, or beside the meteorite for the Shattered Star.
  const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileOf(at.x + dx, at.y + dy) === 'M')
  if (status === 'cleared' && (star ? !beside : tile !== 'X')) return null
  if (SOLID.includes(tile) || gateShut || (tile === '=' && !raw.doorsOpen) || boulders.includes(key) || (status !== 'fell' && holes.includes(key))) return null
  return { stage: stage.id, at, facing: raw.facing as Room['facing'], buddy, buddyFacing: raw.buddyFacing as Room['buddyFacing'], moves: raw.moves, relics, open,
    boulders, holes, doorsOpen: raw.doorsOpen, seen, warpsUsed: warpsUsed as string[], lit: lit as string[], pattern: raw.pattern, attunes: raw.attunes,
    cluesRead, status, message: raw.message }
}

// Keeps the lower move count for every room.
export function saveTrialRecords(records: TrialRecords, results: Record<string, number>): TrialRecords {
  const best = { ...records }
  for (const [id, moves] of Object.entries(results)) best[id] = Object.hasOwn(best, id) ? Math.min(best[id], moves) : moves
  return best
}

export function restoreTrialRecords(raw: unknown): TrialRecords {
  const records: TrialRecords = {}
  if (!isRecord(raw)) return records
  for (const [id, moves] of Object.entries(raw)) if (known(id) && isCount(moves)) records[id] = moves
  return records
}
