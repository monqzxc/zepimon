import { validateExpedition } from './expedition'
// Versioned JSON contract shared by the watch, Zepp service and phone view.
export const SNAPSHOT_KEY = 'zepimon-phone-v1'
export const SYNC_KEY = 'zepimon-sync-request'
export const STATUS_KEY = 'zepimon-sync-status'
// Ever-increasing frame count the Zepp service bumps while it is busy, so the settings page can spin its Pokeball.
export const SYNC_FRAME_KEY = 'zepimon-sync-frame'
// The plan and shared adventure the Zepp service last read or shared ({ plan, adventure, at }), for the settings page,
// and the key the page sets to ask for a fresh copy when it opens.
export const SHARED_KEY = 'zepimon-shared'
export const SHARED_REQUEST_KEY = 'zepimon-shared-request'

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = (value) => Number.isFinite(value) && value >= 0
const route = (value) => Number.isInteger(value) && value >= 0 && value < 512
const date = (value) => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value))
const name = (value) => typeof value === 'string' && value.length > 0 && value.length <= 80 &&
  !['__proto__', 'prototype', 'constructor'].includes(value)
const isFamily = (list) => Array.isArray(list) && list.length >= 1 && list.length <= 3 && list.every(name) && new Set(list).size === list.length
const versionName = (value) => typeof value === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(value)

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
  // The latest adventures saved on the watch, so the phone keeps each one (see finishSession in page/pokemon.js).
  if (value.recent !== undefined) {
    if (!Array.isArray(value.recent) || value.recent.length > 50) throw new Error('Invalid recent adventures')
    clean.recent = value.recent.map((item) => {
      if (!object(item) || !route(item.route)) throw new Error('Invalid recent adventure route')
      return { ...record(item), route: item.route }
    })
  }
  if (value.expedition !== undefined) clean.expedition = validateExpedition(value.expedition)
  // The watch app's version from app.json: version.name ("1.15") and its whole-number version.code (46), for Zepp and
  // Zepimon mobile to show. Older watch builds do not send them, and an unreadable one is left out rather than holding
  // back the sync.
  if (versionName(value.appVersion)) clean.appVersion = value.appVersion
  if (Number.isSafeInteger(value.appVersionCode) && value.appVersionCode >= 0) clean.appVersionCode = value.appVersionCode
  return clean
}

// The plan the phone shares with the watch: the egg chosen in Zepimon mobile (eggAt is when it was chosen) and the
// adventure the phone is recording, if any. null means nothing is planned. It travels phone → cloud → Zepp → watch.
export function validatePlan(value) {
  if (value === null || value === undefined) return null
  if (!object(value) || !number(value.updatedAt)) throw new Error('Invalid plan')
  const plan = { egg: null, eggAt: 0, phone: null, updatedAt: value.updatedAt }
  if (value.egg !== null && value.egg !== undefined) {
    if (!object(value.egg) || !isFamily(value.egg.family) || (value.egg.mega != null && !name(value.egg.mega)) || !number(value.eggAt)) {
      throw new Error('Invalid planned egg')
    }
    plan.egg = { family: value.egg.family.slice(), mega: value.egg.mega || null }
    plan.eggAt = value.eggAt
  }
  if (value.phone !== null && value.phone !== undefined) {
    if (!object(value.phone) || !isFamily(value.phone.family) || !['walking', 'running'].includes(value.phone.activity) || !number(value.phone.startedAt)) {
      throw new Error('Invalid phone adventure')
    }
    plan.phone = { family: value.phone.family.slice(), activity: value.phone.activity, startedAt: value.phone.startedAt }
  }
  return plan
}

// The one adventure the watch and Zepimon mobile share (null when none): who records it now (device, since deviceAt:
// its start or the moment it took over) and its distance as of at. Either device can take it over, and the other
// stops. Matches zepimon_private.valid_adventure in zepimon-sync/schema.sql.
export function validateAdventure(value) {
  if (value === null || value === undefined) return null
  const time = (item) => number(item) && item <= 8640000000000000
  if (!object(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id) || !isFamily(value.family) ||
      !['walking', 'running'].includes(value.activity) || !['phone', 'watch'].includes(value.device) ||
      typeof value.shiny !== 'boolean' || typeof value.ended !== 'boolean' || !number(value.meters) || value.meters > 100000000 ||
      !time(value.startedAt) || !time(value.deviceAt) || !time(value.at) || (value.mega != null && !name(value.mega)) ||
      (value.hatchSeconds != null && !(number(value.hatchSeconds) && value.hatchSeconds > 0))) throw new Error('Invalid shared adventure')
  return { id: value.id, family: value.family.slice(), mega: value.mega || null, shiny: value.shiny, activity: value.activity,
    startedAt: value.startedAt, device: value.device, deviceAt: value.deviceAt, meters: value.meters,
    hatchSeconds: value.hatchSeconds || null, at: value.at, ended: value.ended }
}

// The Pokemon of a shared adventure so far, from its distance alone (no catalog): the egg, then a form every 5 km,
// then the chosen Mega at 21 km.
export function sharedName(adventure) {
  const hatched = Math.min(adventure.family.length, Math.floor(adventure.meters / 5000))
  const name = adventure.meters >= 21000 && adventure.mega ? adventure.mega : hatched ? adventure.family[hatched - 1] : adventure.family[0] + ' egg'
  return (adventure.shiny ? 'Shiny ' : '') + name
}

// An adventure recorded on Zepimon mobile, as the cloud passes it on: the phone's id, the egg's family, the saved
// record and seq, its place in the cloud's queue. Matches zepimon_private.valid_phone_run in zepimon-sync/schema.sql.
export function validatePhoneRun(value) {
  if (!object(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id) || !isFamily(value.family) ||
      !Number.isSafeInteger(value.seq) || value.seq <= 0) throw new Error('Invalid phone adventure')
  return { id: value.id, seq: value.seq, family: value.family.slice(), record: record(value.record) }
}

// The valid adventures of a list: one the watch cannot read must not hold back the rest.
export function validatePhoneRuns(list) {
  const runs = []
  if (Array.isArray(list)) list.forEach((value) => { try { runs.push(validatePhoneRun(value)) } catch (_) { /* skipped */ } })
  return runs
}

export function makeSnapshot(state, now = Date.now()) {
  return validateSnapshot({ schemaVersion: 1, capturedAt: now, dex: state.dex, records: state.records,
    active: state.active, personalBests: state.personalBests, recent: state.recent, expedition: state.expedition,
    appVersion: state.appVersion, appVersionCode: state.appVersionCode })
}
