import { expeditionEncounter, expeditionGoal, expeditionKey, legendarySpecies, validateExpedition } from './generated/expedition.js'
import type { DexRecord, Journal } from './journal.ts'

export type Expedition = { seed: number, startedAt: number, meters: number }
export type Trail = Expedition & { claimed: number }
export type ExpeditionProgress = { trails: Record<string, Trail>, dex: Record<string, DexRecord> }
export const emptyExpeditions = (): ExpeditionProgress => ({ trails: {}, dex: {} })
export { expeditionEncounter, expeditionGoal, expeditionKey }

export function importExpeditions(previous: ExpeditionProgress, journal: Journal): ExpeditionProgress {
  if (!journal.snapshot.expedition) return previous
  const incoming = validateExpedition(journal.snapshot.expedition) as Expedition
  const key = expeditionKey(incoming)
  const old = previous.trails[key]
  return { ...previous, trails: { ...previous.trails, [key]: { ...incoming,
    meters: Math.max(old?.meters || 0, incoming.meters), claimed: old?.claimed || 0 } } }
}

export function claimExpedition(previous: ExpeditionProgress, key: string, index: number, now = Date.now()): ExpeditionProgress {
  const trail = previous.trails[key]
  if (!trail || index !== trail.claimed || (index + 1) * expeditionGoal > trail.meters) {
    throw new Error('This encounter is already befriended or is not ready yet.')
  }
  const { name, shiny } = expeditionEncounter(trail, index)
  const record: DexRecord = { meters: expeditionGoal, steps: 0, shiny, form: name,
    source: 'expedition', finishedAt: new Date(now).toISOString() }
  return { trails: { ...previous.trails, [key]: { ...trail, claimed: index + 1 } },
    dex: { ...previous.dex, [(shiny ? 'Shiny ' : '') + name]: record } }
}

export function expeditionJournal(journal: Journal | null, progress: ExpeditionProgress): Journal | null {
  if (!journal) return null
  // Keep phone encounters separate from incoming watch records so every sync retains them.
  return { ...journal, snapshot: { ...journal.snapshot, dex: { ...journal.snapshot.dex, ...progress.dex } } }
}

export function restoreExpeditions(raw: unknown): ExpeditionProgress {
  if (raw === undefined) return emptyExpeditions()
  const value = raw as ExpeditionProgress
  if (!value || typeof value !== 'object' || !value.trails || !value.dex ||
      typeof value.trails !== 'object' || Array.isArray(value.trails) || typeof value.dex !== 'object' || Array.isArray(value.dex)) {
    throw new Error('Invalid saved expeditions')
  }
  const restored = emptyExpeditions()
  for (const [key, trail] of Object.entries(value.trails)) {
    const checked = validateExpedition(trail) as Expedition
    if (key !== expeditionKey(checked) || !Number.isSafeInteger(trail.claimed) || trail.claimed < 0 || trail.claimed > Math.floor(checked.meters / expeditionGoal)) {
      throw new Error('Invalid saved expedition claims')
    }
    restored.trails[key] = { ...checked, claimed: trail.claimed }
  }
  for (const [key, record] of Object.entries(value.dex)) {
    const name = key.replace(/^Shiny /, '')
    if (!legendarySpecies.includes(name) || !record || record.source !== 'expedition' ||
        record.meters !== expeditionGoal || record.steps !== 0 || record.shiny !== key.startsWith('Shiny ') ||
        typeof record.finishedAt !== 'string' || !Number.isFinite(Date.parse(record.finishedAt))) {
      throw new Error('Invalid expedition Pokemon')
    }
    restored.dex[key] = { meters: expeditionGoal, steps: 0, shiny: record.shiny, form: name,
      source: 'expedition', finishedAt: record.finishedAt }
  }
  return restored
}
