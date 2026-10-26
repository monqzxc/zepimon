import { validateExpedition } from './expedition'
// Versioned JSON contract shared by the watch, Zepp service and phone view.
export const SNAPSHOT_KEY = 'zepimon-phone-v1'
export const SYNC_KEY = 'zepimon-sync-request'
export const STATUS_KEY = 'zepimon-sync-status'
// Ever-increasing frame count the Zepp service bumps while it is busy, so the settings page can spin its Pokeball.
export const SYNC_FRAME_KEY = 'zepimon-sync-frame'

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = (value) => Number.isFinite(value) && value >= 0
const route = (value) => Number.isInteger(value) && value >= 0 && value < 512
const date = (value) => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value))
const name = (value) => typeof value === 'string' && value.length > 0 && value.length <= 80 &&
  !['__proto__', 'prototype', 'constructor'].includes(value)

function record(value, active = false) {
  if (!object(value) || !number(value.meters) || !Number.isSafeInteger(value.steps) || value.steps < 0 ||
      (value.shiny !== undefined && typeof value.shiny !== 'boolean') ||
      (!active && !date(value.finishedAt))) throw new Error('Invalid adventure record')
  const result = { meters: value.meters, steps: value.steps, shiny: !!value.shiny }
  if (value.activity !== undefined && value.activity !== null) {
    if (value.activity !== 'walking' && value.activity !== 'running') throw new Error('Invalid activity')
    result.activity = value.activity
  }
  if (!active) result.finishedAt = value.finishedAt
  if (value.startedAt !== undefined && value.startedAt !== null) {
    if (!number(value.startedAt)) throw new Error('Invalid start time')
    result.startedAt = value.startedAt
  }
  if (value.elapsedSeconds !== undefined && value.elapsedSeconds !== null) {
    if (!number(value.elapsedSeconds)) throw new Error('Invalid elapsed time')
    result.elapsedSeconds = value.elapsedSeconds
  }
  if (value.hatchSeconds !== undefined && value.hatchSeconds !== null) {
    if (!number(value.hatchSeconds) || value.hatchSeconds <= 0 || value.meters < 5000 ||
        (number(value.elapsedSeconds) && value.hatchSeconds > value.elapsedSeconds)) throw new Error('Invalid hatch time')
    result.hatchSeconds = value.hatchSeconds
  }
  for (const key of ['form', 'mega']) {
    if (value[key] !== undefined && value[key] !== null) {
      if (!name(value[key])) throw new Error('Invalid Pokemon name')
      result[key] = value[key]
    }
  }
  return result
}

export function validateSnapshot(value) {
  if (!object(value) || value.schemaVersion !== 1 || !number(value.capturedAt) ||
      !object(value.dex) || !object(value.records) ||
      Object.keys(value.dex).length > 1400 || Object.keys(value.records).length > 512) {
    throw new Error('Invalid Zepimon snapshot')
  }
  const clean = { schemaVersion: 1, capturedAt: value.capturedAt, dex: {}, records: {}, active: null }
  Object.keys(value.dex).forEach((key) => {
    if (!name(key)) throw new Error('Invalid Pokedex entry')
    clean.dex[key] = record(value.dex[key])
    clean.dex[key].shiny = key.indexOf('Shiny ') === 0
  })
  Object.keys(value.records).forEach((key) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(key) || Number(key) >= 512) throw new Error('Invalid route')
    clean.records[key] = record(value.records[key])
  })
  if (value.active !== null) {
    if (!object(value.active) || !route(value.active.route)) {
      throw new Error('Invalid active adventure')
    }
    clean.active = { ...record(value.active, true), route: value.active.route }
  }
  if (value.personalBests !== undefined) {
    if (!object(value.personalBests) || Object.keys(value.personalBests).some((key) => !['distance', 'elapsed', 'hatch'].includes(key))) {
      throw new Error('Invalid personal bests')
    }
    clean.personalBests = {}
    Object.keys(value.personalBests).forEach((key) => {
      const best = value.personalBests[key]
      if (!object(best) || !route(best.route)) throw new Error('Invalid personal best route')
      const checked = record(best)
      if ((key === 'elapsed' && !(checked.elapsedSeconds > 0)) ||
          (key === 'hatch' && !(checked.hatchSeconds > 0 && checked.elapsedSeconds >= checked.hatchSeconds))) {
        throw new Error('Invalid personal best time')
      }
      clean.personalBests[key] = { ...checked, route: best.route }
    })
  }
  if (value.expedition !== undefined) clean.expedition = validateExpedition(value.expedition)
  return clean
}

export function makeSnapshot(state, now = Date.now()) {
  return validateSnapshot({ schemaVersion: 1, capturedAt: now, dex: state.dex, records: state.records,
    active: state.active, personalBests: state.personalBests, expedition: state.expedition })
}
