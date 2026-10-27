import { routes as catalogRoutes, species, megaForms, sprites, shinySprites } from './catalog'
import { pokemonTypes } from './types'
import { ensureExpedition } from '../shared/expedition'
export function primaryType(name) { return pokemonTypes[name.replace(/^Shiny /, '')] || 'normal' }
export function dexPokemon(dex) {
  const names = {}
  Object.keys(dex).forEach((key) => { names[key.replace(/^Shiny /, '')] = true })
  return Object.keys(names)
}
export const routes = catalogRoutes
export const speciesCount = Object.keys(species).length
export function generation(route) { return species[routes[route][0]].gen }
export function megaChoices(route) { return megaForms[routes[route][routes[route].length - 1]] || [] }
export function rollShiny(random = Math.random) { return Math.floor(random() * 50) === 0 }
export function elapsedSeconds(session, now = Date.now()) {
  if (!Number.isFinite(session.startedAt)) return null
  return Math.max(0, Math.floor((now - session.startedAt) / 1000))
}
export function elapsedLabel(seconds) {
  if (seconds === null) return '--:--:--'
  const pad = (value) => ('0' + value).slice(-2)
  const hours = Math.floor(seconds / 3600)
  return (hours < 10 ? '0' : '') + hours + ':' + pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60)
}
export function paceLabel(seconds, meters) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(meters) || meters <= 0) return '--:-- /km'
  const pace = Math.round(seconds * 1000 / meters)
  if (!Number.isFinite(pace)) return '--:-- /km'
  return Math.floor(pace / 60) + ':' + ('0' + pace % 60).slice(-2) + ' /km'
}
export function currentPace(tracker, meters, now = Date.now(), activity = 'walking', steps) {
  if (!tracker.stepTracker) tracker.stepTracker = { awaitingChange: tracker.awaitingChange }
  const speed = currentSpeed(tracker, meters, now, activity)
  const cadence = currentSpeed(tracker.stepTracker, steps, now, activity)
  if (!Number.isFinite(meters) || meters < 0 || !Number.isFinite(now)) {
    tracker.stride = null
    tracker.strideMeters = null
    return paceLabel(null, 0)
  }
  // Keep the measured stride stable between distance batches; never assume a default stride.
  if (meters > 0 && Number.isFinite(steps) && steps >= 10 && meters !== tracker.strideMeters) {
    const stride = meters / steps
    if (stride >= 0.2 && stride <= 2.5) {
      tracker.stride = stride
      tracker.strideMeters = meters
    }
  }
  const last = tracker.samples[tracker.samples.length - 1]
  const slowDistance = !speed || tracker.batchInterval > 15000 || (last && now - last.at >= 15000)
  return paceLabel(1, slowDistance && cadence > 0 && tracker.stride ? cadence * tracker.stride : speed)
}
function currentSpeed(tracker, meters, now, activity) {
  const blank = 0
  if (!Number.isFinite(meters) || meters < 0 || !Number.isFinite(now)) {
    tracker.samples = []
    tracker.checkedAt = null
    tracker.batchInterval = 0
    tracker.awaitingChange = true
    return blank
  }
  let samples = tracker.samples || []
  let last = samples[samples.length - 1]
  // After suspension, the first changed counter may contain recovered background distance.
  if ((Number.isFinite(tracker.checkedAt) && (now < tracker.checkedAt || now - tracker.checkedAt > 5000)) ||
      (last && meters < last.meters)) {
    samples = []
    tracker.batchInterval = 0
    tracker.awaitingChange = true
  }
  tracker.checkedAt = now
  if (!samples.length) samples.push({ at: now, meters })
  tracker.samples = samples
  last = samples[samples.length - 1]
  if (tracker.awaitingChange) {
    if (meters > last.meters) {
      tracker.samples = [{ at: now, meters }]
      tracker.awaitingChange = false
    }
    return blank
  }
  // Slow sensor batches still need the preceding distance timestamp to measure pace.
  // Hide stale readings without throwing away that baseline on each timer tick.
  const staleAfter = tracker.batchInterval > 15000 ? Math.min(60000, tracker.batchInterval * 1.5) : 15000
  if (meters === last.meters && now - last.at >= staleAfter) {
    tracker.samples = [last]
    return blank
  }
  const maxBatchInterval = Math.max(60000, Math.min(120000, tracker.batchInterval * 1.5 || 0))
  if (meters > last.meters && now - last.at > maxBatchInterval) {
    tracker.samples = [{ at: now, meters }]
    // Learn a repeated slow cadence, but discard the first batch after a long stop.
    tracker.batchInterval = now - last.at
    return blank
  }
  // Time actual counter updates; flat timer frames must not turn a batch into a speed spike.
  if (meters > last.meters) {
    if (now - last.at < 1000) last.meters = meters
    else {
      tracker.batchInterval = now - last.at
      samples.push({ at: now, meters })
    }
  }
  last = samples[samples.length - 1]
  const window = activity === 'running' ? 8000 : 15000
  while (samples.length > 2 && samples[0].at < last.at - window && last.at - samples[1].at >= 5000) samples.shift()
  const first = samples[0]
  return last.at - first.at >= 5000 ? (last.meters - first.meters) * 1000 / (last.at - first.at) : blank
}
export function spritePath(name, shiny = false) {
  if (name.indexOf('Shiny ') === 0) { name = name.slice(6); shiny = true }
  return (shiny ? shinySprites[name] : sprites[name]) || sprites[name] || sprites.Egg
}
export function collectionCount(dex) {
  const acquired = {}
  Object.keys(dex).forEach((key) => {
    const name = key.indexOf('Shiny ') === 0 ? key.slice(6) : key
    if (name.indexOf('Mega ') !== 0) acquired[name] = true
  })
  return Object.keys(acquired).length
}
export function nextMilestone(route, meters) {
  const normal = routes[route].length * 5000
  if (meters < normal) return (Math.floor(meters / 5000) + 1) * 5000
  return megaChoices(route).length && meters < 21000 ? 21000 : null
}

export function acquiredForms(route, meters, mega) {
  const earned = routes[route].slice(0, Math.min(routes[route].length, Math.floor(meters / 5000)))
  const chosen = mega || (megaForms[routes[route][routes[route].length - 1]] || [])[0]
  if (meters >= 21000 && chosen && (megaForms[routes[route][routes[route].length - 1]] || []).includes(chosen)) earned.push(chosen)
  return earned
}

export function currentForm(route, meters, mega) {
  const forms = acquiredForms(route, meters, mega)
  return forms.length ? forms[forms.length - 1] : 'Egg'
}

export function updateSession(session, meters, steps, day, now = Date.now()) {
  if (!Number.isFinite(meters) || !Number.isFinite(steps) || meters < 0 || steps < 0) return
  const previousMeters = session.meters
  // shortcut: daily totals cannot recover missed days; reopen daily on multi-day adventures.
  const sameDay = session.day === day
  session.meters += sameDay && meters >= session.lastMeters ? meters - session.lastMeters : meters
  session.steps += sameDay && steps >= session.lastSteps ? steps - session.lastSteps : steps
  session.lastMeters = meters
  session.lastSteps = steps
  session.day = day
  if (previousMeters < 5000 && session.meters >= 5000 && !Number.isFinite(session.hatchSeconds)) {
    const seconds = elapsedSeconds(session, now)
    // This is the first detected crossing; closed-app intervals cannot reveal the exact hatch instant.
    if (seconds > 0) session.hatchSeconds = seconds
  }
}

// extra: more records to consider, such as phone adventures older than their family's latest record.
export function refreshPersonalBests(state, extra = []) {
  const bests = state.personalBests || {}
  const fields = { distance: 'meters', elapsed: 'elapsedSeconds', hatch: 'hatchSeconds' }
  const score = (record, metric) => {
    if (!record || !Number.isInteger(record.route) || !routes[record.route] ||
        !Number.isFinite(record.meters) || record.meters < 0) return null
    const value = record[fields[metric]]
    if (!Number.isFinite(value) || (metric === 'distance' ? value < 0 : value <= 0)) return null
    if (metric === 'hatch' && (record.meters < 5000 || !Number.isFinite(record.elapsedSeconds) || value > record.elapsedSeconds)) return null
    return value
  }
  const winners = {}
  Object.keys(fields).forEach((metric) => {
    if (score(bests[metric], metric) !== null) winners[metric] = { ...bests[metric] }
  })
  Object.keys(state.records).map((key) => ({ ...state.records[key], route: Number(key) })).concat(extra).forEach((candidate) => {
    Object.keys(fields).forEach((metric) => {
      const value = score(candidate, metric)
      const previous = score(winners[metric], metric)
      if (value !== null && (previous === null || (metric === 'hatch' ? value < previous : value > previous))) {
        winners[metric] = { ...candidate }
      }
    })
  })
  state.personalBests = winners
  return winners
}

export function hasDexDistance(name, record) {
  name = name.replace(/^Shiny /, '')
  const minimum = name.indexOf('Mega ') === 0 ? 21000 : routes.reduce((lowest, route) => {
    const index = route.indexOf(name)
    return index < 0 ? lowest : Math.min(lowest, (index + 1) * 5000)
  }, Infinity)
  return !!record && Number.isFinite(record.meters) && record.meters >= minimum
}

function dexRecord(record) {
  return { meters: record.meters, steps: record.steps, finishedAt: record.finishedAt, shiny: !!record.shiny,
    ...(record.activity === 'walking' || record.activity === 'running' ? { activity: record.activity } : {}),
    startedAt: Number.isFinite(record.startedAt) && record.startedAt >= 0 ? record.startedAt : null,
    elapsedSeconds: Number.isFinite(record.elapsedSeconds) && record.elapsedSeconds >= 0 ? record.elapsedSeconds : null,
    hatchSeconds: Number.isFinite(record.hatchSeconds) && record.hatchSeconds > 0 && Number.isFinite(record.elapsedSeconds) && record.elapsedSeconds >= record.hatchSeconds
      ? record.hatchSeconds : null }
}

// Adds an adventure recorded on Zepimon mobile as if it had been saved here: its Pokemon join the Dex and it becomes
// the family's latest record, unless the watch already has newer ones. Phone distance stays on the phone's own
// Expedition trail. Returns the record as a personal-best candidate, or null for a family this catalog lacks.
export function applyPhoneRun(state, run) {
  const family = run.family.join('>')
  const route = routes.findIndex((item) => item.join('>') === family)
  if (route < 0) return null
  const record = { ...run.record }
  const finished = Date.parse(record.finishedAt)
  const newer = (previous) => !previous || !(Date.parse(previous.finishedAt) > finished)
  if (newer(state.records[route])) state.records[route] = record
  acquiredForms(route, record.meters, record.mega).forEach((name) => {
    const key = (record.shiny ? 'Shiny ' : '') + name
    if (newer(state.dex[key])) state.dex[key] = dexRecord(record)
  })
  return { ...record, route }
}

export function repairDexRecords(state) {
  const damaged = {}
  const recovered = {}
  let changed = false
  Object.keys(state.dex).forEach((key) => { if (!hasDexDistance(key, state.dex[key])) damaged[key] = true })
  const candidates = Object.keys(state.records).map((key) => ({ ...state.records[key], route: Number(key) }))
    .concat(Object.values(state.personalBests || {}))
  candidates.forEach((record) => {
    if (!record || !Number.isInteger(record.route) || !routes[record.route] ||
        !Number.isFinite(record.meters) || record.meters < 5000 ||
        !Number.isSafeInteger(record.steps) || record.steps < 0 ||
        typeof record.finishedAt !== 'string' || !Number.isFinite(Date.parse(record.finishedAt)) ||
        (record.shiny !== undefined && typeof record.shiny !== 'boolean')) return
    // Old saves may identify a Mega only by their final form; never guess its variant.
    const mega = record.mega || (megaChoices(record.route).includes(record.form) ? record.form : '')
    const earned = acquiredForms(record.route, record.meters, mega).filter((name) => name.indexOf('Mega ') !== 0 || name === mega)
    earned.forEach((name) => {
      const key = (record.shiny ? 'Shiny ' : '') + name
      const previous = state.dex[key]
      if (!previous) return
      const sameJourney = previous.meters === record.meters && previous.steps === record.steps && previous.finishedAt === record.finishedAt
      if ((damaged[key] && (!recovered[key] || Date.parse(record.finishedAt) > Date.parse(recovered[key].finishedAt))) ||
          (!damaged[key] && sameJourney && !Number.isFinite(previous.elapsedSeconds) && Number.isFinite(record.elapsedSeconds) && record.elapsedSeconds >= 0)) {
        recovered[key] = dexRecord(record)
      }
    })
  })
  Object.keys(recovered).forEach((key) => { state.dex[key] = recovered[key]; changed = true })
  return changed
}

// The adventures saved on this watch, newest last. The phone keeps every one from this log, even when the same egg is
// walked again before a sync and its family record is replaced.
const RECENT_LIMIT = 30

export function finishSession(state, finishedAt) {
  if (!state.active) return
  // Seed old saves before replacing this route's latest journey.
  refreshPersonalBests(state)
  repairDexRecords(state)
  const session = state.active
  const expedition = ensureExpedition(state, Date.parse(finishedAt))
  expedition.meters = Math.min(100000000, expedition.meters + session.meters)
  const earned = acquiredForms(session.route, session.meters, session.mega)
  const seconds = elapsedSeconds(session, Date.parse(finishedAt))
  const hatchSeconds = session.meters >= 5000 && Number.isFinite(session.hatchSeconds) &&
    session.hatchSeconds > 0 && seconds !== null && session.hatchSeconds <= seconds ? session.hatchSeconds : null
  state.records[session.route] = {
    meters: session.meters, steps: session.steps, finishedAt,
    ...(session.activity === 'walking' || session.activity === 'running' ? { activity: session.activity } : {}),
    startedAt: Number.isFinite(session.startedAt) ? session.startedAt : null,
    elapsedSeconds: seconds, hatchSeconds,
    shiny: !!session.shiny, mega: session.mega, form: currentForm(session.route, session.meters, session.mega)
  }
  state.recent = (Array.isArray(state.recent) ? state.recent : [])
    .concat({ ...state.records[session.route], route: session.route }).slice(-RECENT_LIMIT)
  earned.forEach((name) => {
    const key = session.shiny ? 'Shiny ' + name : name
    state.dex[key] = dexRecord(state.records[session.route])
  })
  refreshPersonalBests(state)
  state.active = null
}
