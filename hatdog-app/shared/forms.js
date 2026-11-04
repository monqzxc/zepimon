import { megaForms, gigantamaxForms } from '../page/catalog'

// How an egg grows on one adventure, the same on the watch and on Zepimon mobile (npm run sync:watch copies this
// file): it hatches at 5 km and evolves every 5 km after, takes its Mega form at 21 km, Dynamaxes at 42 km (a
// marathon) and, where its family can, Gigantamaxes at 50 km. family is the egg's line of species, first to last;
// mega is the form picked before setting off (see formChoices), kept under that name for older saves.

export const MEGA_AT = 21000
export const DYNAMAX_AT = 42000
export const GIGANTAMAX_AT = 50000

export function megaChoices(family) { return megaForms[family[family.length - 1]] || [] }

// Gigantamax belongs to the latest stage of the family that has it: a Pichu egg Gigantamaxes as Pikachu, an Eevee
// egg as Eevee whichever way it evolved.
export function gigantamaxChoices(family) {
  for (let i = family.length - 1; i >= 0; i--) if (gigantamaxForms[family[i]]) return gigantamaxForms[family[i]]
  return []
}

// The forms to pick from before setting off: the family's Mega forms, or, for a family with none, its Gigantamax
// forms when it has two (Toxtricity, Urshifu). One with a single form needs no choice.
export function formChoices(family) {
  const megas = megaChoices(family)
  const gigantamax = gigantamaxChoices(family)
  return megas.length ? megas : gigantamax.length > 1 ? gigantamax : []
}

// Every form of the adventure with the distance it is reached at, in order. A Mega or Gigantamax form that is chosen
// with mega has its name only when it is one of the choices (null otherwise); with no mega, the first is chosen.
export function formStages(family, mega) {
  const stages = family.map((name, i) => ({ name, meters: (i + 1) * 5000 }))
  const megas = megaChoices(family)
  const gigantamax = gigantamaxChoices(family)
  const chosen = (choices, picked) => {
    const name = picked ? mega || choices[0] : choices[0]
    return choices.indexOf(name) >= 0 ? name : null
  }
  if (megas.length) stages.push({ name: chosen(megas, true), meters: MEGA_AT })
  if (family.length) stages.push({ name: 'Dynamax ' + family[family.length - 1], meters: DYNAMAX_AT })
  if (gigantamax.length) stages.push({ name: chosen(gigantamax, !megas.length && gigantamax.length > 1), meters: GIGANTAMAX_AT })
  return stages
}

export function earnedForms(family, meters, mega) {
  return formStages(family, mega).filter(stage => stage.name && meters >= stage.meters).map(stage => stage.name)
}

// The distance of the next hatch, evolution or special form, or null once the last is reached.
export function nextMilestone(family, meters) {
  const next = formStages(family, null).find(stage => stage.meters > meters)
  return next ? next.meters : null
}

// The previous one, or 0 before the hatch: where the bar towards the next one starts.
export function previousMilestone(family, meters) {
  return formStages(family, null).reduce((previous, stage) => stage.meters <= meters ? stage.meters : previous, 0)
}

// What reaching a milestone (from nextMilestone) does: hatch, evolve, Mega, Dynamax or Gigantamax.
export function milestoneLabel(meters) {
  return meters <= 5000 ? 'hatch' : meters === MEGA_AT ? 'Mega' : meters === DYNAMAX_AT ? 'Dynamax' : meters === GIGANTAMAX_AT ? 'Gigantamax' : 'evolve'
}

const megaBase = {}
const gigantamaxBase = {}
Object.keys(megaForms).forEach(base => megaForms[base].forEach(form => { megaBase[form] = base }))
Object.keys(gigantamaxForms).forEach(base => gigantamaxForms[base].forEach(form => { gigantamaxBase[form] = base }))

// The distance a Mega, Dynamax or Gigantamax form is reached at; 0 for a species. Shiny makes no difference.
export function formDistance(name) {
  const plain = name.replace(/^Shiny /, '')
  return megaBase[plain] ? MEGA_AT : plain.indexOf('Dynamax ') === 0 ? DYNAMAX_AT : gigantamaxBase[plain] ? GIGANTAMAX_AT : 0
}

// The species a form belongs to: Mega Charizard X, Dynamax Charizard and Gigantamax Charizard are all Charizard.
export function baseSpecies(name) {
  const plain = name.replace(/^Shiny /, '')
  return megaBase[plain] || gigantamaxBase[plain] || (plain.indexOf('Dynamax ') === 0 ? plain.slice(8) : plain)
}

// The form whose artwork a form uses: a Dynamax form is its species, drawn with a glow where the screen allows.
export function spriteForm(name) {
  return name.replace(/^(Shiny )?Dynamax /, '$1')
}
