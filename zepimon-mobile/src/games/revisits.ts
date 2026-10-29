import { legendarySpecies } from '../generated/expedition.js'
import { trialStages as generatedStages } from '../generated/trial-maps.js'
import type { DexRecord } from '../journal.ts'
import type { Stage } from './trial.ts'
import { saveTrialRecords, trialFor } from './trials.ts'
import type { TrialRecords } from './trials.ts'

// Shrine Revisits: a caught Legendary's trial rooms can be replayed and its battle fought again, as practice. A revisit
// never claims an encounter, touches the Dex, rolls a Shiny or uses a permit: only a room's best moves (trialRecords)
// and the rematch win count may change. Kept free of React so the rules can be tested.
const trialStages = generatedStages as Record<string, Stage>
const species = legendarySpecies as string[]

export type Revisit = { name: string, shiny: boolean, key: string }
export type RematchWins = Record<string, number>
// The saved fields a revisit reads and may change; everything else passes through untouched.
type Saved = { expeditions: { dex: Record<string, DexRecord> }, trialRecords: TrialRecords, rematchWins: RematchWins }

// Keyed like the Dex: 'Name' or 'Shiny Name'.
export const revisitKey = (name: string, shiny: boolean) => (shiny ? 'Shiny ' : '') + name

// Every caught Legendary in species order, a Shiny catch right after its Normal one.
export function caughtLegendaries(dex: Record<string, DexRecord>): Revisit[] {
  return species.flatMap(name => [false, true].flatMap(shiny => {
    const key = revisitKey(name, shiny)
    return Object.hasOwn(dex, key) ? [{ name, shiny, key }] : []
  }))
}

// The rooms of the Legendary's trial kind: its tutorial and three main rooms, or only the island for the Shattered Star.
export function revisitRooms(name: string): string[] {
  const { kind } = trialFor(name, {})
  if (kind === 'star') return ['star']
  return ['tutorial', '1', '2', '3'].map(room => `${kind}-${room}`).filter(id => Object.hasOwn(trialStages, id))
}

// Only a Legendary caught on an expedition, in the form it was caught, has a shrine to revisit.
export function canRevisit(dex: Record<string, DexRecord>, name: string, shiny: boolean): boolean {
  return species.includes(name) && Object.hasOwn(dex, revisitKey(name, shiny))
}

export const roomName = (id: string) => id === 'star' ? 'The island' : id.endsWith('-tutorial') ? 'Tutorial' : `Room ${id.split('-').pop()}`

// "Room 2 · best 64 · par 58", leaving out what isn't known yet.
export function roomLine(id: string, records: TrialRecords): string {
  const par = trialStages[id]?.par
  return [roomName(id), Object.hasOwn(records, id) ? `best ${records[id]}` : '', par === undefined ? '' : `par ${par}`].filter(Boolean).join(' · ')
}

function refuseUncaught(saved: Saved, name: string, shiny: boolean) {
  if (!canRevisit(saved.expeditions.dex, name, shiny)) throw new Error(`${revisitKey(name, shiny)} hasn’t been caught yet. Catch it on an expedition to revisit its shrine.`)
}

// A cleared practice room: its moves join trialRecords, keeping the lower count. Rooms from another trial are refused.
export function practiceClear<T extends Saved>(saved: T, name: string, shiny: boolean, results: Record<string, number>): T {
  refuseUncaught(saved, name, shiny)
  const rooms = revisitRooms(name)
  for (const [id, moves] of Object.entries(results)) {
    if (!rooms.includes(id) || !Number.isSafeInteger(moves) || moves < 0) throw new Error('That room is not part of this shrine.')
  }
  return { ...saved, trialRecords: saveTrialRecords(saved.trialRecords, results) }
}

// A won rematch counts toward the Legendary's rematch wins, and nothing else.
export function rematchWin<T extends Saved>(saved: T, name: string, shiny: boolean): T {
  refuseUncaught(saved, name, shiny)
  const key = revisitKey(name, shiny)
  return { ...saved, rematchWins: { ...saved.rematchWins, [key]: (saved.rematchWins[key] || 0) + 1 } }
}

export function restoreRematchWins(raw: unknown): RematchWins {
  const wins: RematchWins = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return wins
  for (const [key, count] of Object.entries(raw)) {
    if (species.includes(key.replace(/^Shiny /, '')) && Number.isSafeInteger(count) && (count as number) > 0) wins[key] = count as number
  }
  return wins
}
