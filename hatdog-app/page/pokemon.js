import { routes as catalogRoutes, species, megaForms, sprites, shinySprites } from './catalog'
import { pokemonTypes } from './types'
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
export function rollShiny(random = Math.random) { return Math.floor(random() * 100) === 0 }
export function elapsedSeconds(session, now = Date.now()) {
  if (!Number.isFinite(session.startedAt)) return null
  return Math.max(0, Math.floor((now - session.startedAt) / 1000))
}
export function elapsedLabel(seconds) {
  if (seconds === null) return '--:--:--'
  const pad = (value) => ('0' + value).slice(-2)
  return pad(Math.floor(seconds / 3600)) + ':' + pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60)
}
export function paceLabel(seconds, meters) {
  if (seconds === null || seconds <= 0 || !Number.isFinite(meters) || meters <= 0) return '--:-- /km'
  const pace = Math.round(seconds * 1000 / meters)
  return Math.floor(pace / 60) + ':' + ('0' + pace % 60).slice(-2) + ' /km'
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

export function updateSession(session, meters, steps, day) {
  if (!Number.isFinite(meters) || !Number.isFinite(steps) || meters < 0 || steps < 0) return
  // shortcut: daily totals cannot recover missed days; reopen daily on multi-day adventures.
  const sameDay = session.day === day
  session.meters += sameDay && meters >= session.lastMeters ? meters - session.lastMeters : meters
  session.steps += sameDay && steps >= session.lastSteps ? steps - session.lastSteps : steps
  session.lastMeters = meters
  session.lastSteps = steps
  session.day = day
}

export function finishSession(state, finishedAt) {
  const session = state.active
  const earned = acquiredForms(session.route, session.meters, session.mega)
  const selectedMega = session.mega || megaChoices(session.route)[0]
  routes[session.route].concat(selectedMega || []).forEach((name) => {
    const key = session.shiny ? 'Shiny ' + name : name
    if (earned.includes(name) || state.dex[key]) {
      state.dex[key] = { meters: session.meters, steps: session.steps, finishedAt, shiny: !!session.shiny }
    }
  })
  state.records[session.route] = {
    meters: session.meters, steps: session.steps, finishedAt,
    shiny: !!session.shiny, mega: session.mega, form: currentForm(session.route, session.meters, session.mega)
  }
  state.active = null
}
