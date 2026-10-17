import { mkdirSync, writeFileSync } from 'node:fs'
import { routes } from '../src/generated/catalog.js'
import { parseJournal } from '../src/journal.ts'

// Optional fixture only. The app always starts with an empty journal.
const record = (date, meters, shiny = false, extra = {}) => ({ meters, steps: Math.round(meters * 1.3), shiny,
  startedAt: Date.parse(date), finishedAt: new Date(Date.parse(date) + meters * 0.65 * 1000).toISOString(),
  elapsedSeconds: Math.round(meters * 0.65), ...(meters >= 5000 ? { hatchSeconds: 3250 } : {}), ...extra })
const bulbasaur = record('2026-10-13T06:00:00+08:00', 6000)
const shiny = record('2026-10-14T06:00:00+08:00', 5500, true)
const gible = record('2026-10-15T17:00:00+08:00', 12000)
const gastly = record('2026-10-16T06:00:00+08:00', 21000, false, { form: 'Mega Gengar' })
const index = name => routes.findIndex(route => route[0] === name)
const journal = { exportVersion: 1, app: 'Zepimon', exportedAt: '2026-10-17T00:00:00.000Z', receivedAt: Date.parse('2026-10-17T00:00:00.000Z'), routes,
  snapshot: { schemaVersion: 1, capturedAt: Date.parse('2026-10-17T00:00:00.000Z'), active: null,
    dex: { Bulbasaur: bulbasaur, 'Shiny Bulbasaur': shiny, Gible: gible, Gabite: gible, Gastly: gastly, Haunter: gastly, Gengar: gastly, 'Mega Gengar': gastly },
    records: { [index('Bulbasaur')]: shiny, [index('Gible')]: gible, [index('Gastly')]: gastly },
    personalBests: { distance: { ...gastly, route: index('Gastly') }, elapsed: { ...gastly, route: index('Gastly') }, hatch: { ...bulbasaur, route: index('Bulbasaur') } }
  } }
mkdirSync(new URL('../examples/', import.meta.url), { recursive: true })
writeFileSync(new URL('../examples/demo-export.json', import.meta.url), JSON.stringify(parseJournal(JSON.stringify(journal)), null, 2) + '\n')
console.log('Created optional demo export; no user data was changed.')
