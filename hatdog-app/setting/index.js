import { species, megaForms } from '../page/catalog'
import { routes, speciesCount, collectionCount, dexPokemon, currentForm, spritePath, primaryType, elapsedSeconds, elapsedLabel, paceLabel, nextMilestone, hasDexDistance } from '../page/pokemon'
import { SNAPSHOT_KEY, SYNC_KEY, STATUS_KEY, validateSnapshot } from '../shared/companion'
import { eggs } from './eggs'

const palette = { ink: '#f4ebcf', muted: '#9abfcd', edge: '#54c7c4', panel: '#102d42', blue: '#135b89' }
const km = (meters) => (meters / 1000).toFixed(2) + ' km'
const row = (children) => View({ style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' } }, children)
const label = (value, size = 14, color = palette.ink) => Text({
  style: { display: 'block', fontSize: size + 'px', color, lineHeight: '1.5', overflowWrap: 'anywhere' }
}, value)
const panel = (children) => View({ style: {
  background: palette.panel, border: '2px solid ' + palette.edge, padding: '16px', marginTop: '14px', boxShadow: '4px 4px 0 #03111e'
} }, children)
const button = (text, onClick, selected = false) => Button({
  label: text, onClick, style: { minHeight: '44px', padding: '10px 14px', borderRadius: '3px',
    border: '2px solid ' + palette.edge, background: selected ? palette.ink : palette.blue,
    color: selected ? '#102d42' : '#ffffff', fontWeight: 'bold', fontSize: '14px' }
})
const dateLabel = (value) => value ? new Date(value).toLocaleString() : 'Not recorded'

function sprite(name, shiny = false, size = 120) {
  const path = spritePath(name, shiny).split('/').pop()
  const id = parseInt(path, 10)
  // Only phone images use the network, keeping the watch installer small.
  const src = Number.isFinite(id)
    ? 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' +
      (id <= 493 ? 'versions/generation-iv/platinum/' : '') + (path.includes('-shiny') ? 'shiny/' : '') + id + '.png'
    : eggs[shiny ? 1 : 0]
  return Image({ src, alt: (shiny ? 'Shiny ' : '') + name, width: size, height: size,
    style: { objectFit: 'contain', imageRendering: 'pixelated', display: 'block', margin: '0 auto' } })
}

function generationOf(name) {
  const base = species[name] ? name : Object.keys(megaForms).find((key) => megaForms[key].includes(name))
  return base && species[base] ? species[base].gen : 0
}

function recordDetails(record) {
  if (!record) return [label('Not acquired yet', 15, palette.muted)]
  const seconds = Number.isFinite(record.elapsedSeconds) ? record.elapsedSeconds : null
  const details = [label(km(record.meters), 24), label(record.steps + ' steps', 14, palette.muted),
    label(dateLabel(record.finishedAt), 12, palette.muted),
    label(seconds === null ? 'Time and average pace were not saved for this older record.'
      : 'Time ' + elapsedLabel(seconds) + ' / Avg pace ' + paceLabel(seconds, record.meters), 13, palette.muted)]
  if (Number.isFinite(record.hatchSeconds)) details.push(label(
    'Hatch time (first detected): ' + elapsedLabel(record.hatchSeconds), 13, palette.muted))
  return details
}

AppSettingsPage({
  build({ settingsStorage: storage }) {
    const get = (key, fallback = '') => storage.getItem('zepimon-ui-' + key) || fallback
    const set = (key, value) => storage.setItem('zepimon-ui-' + key, String(value))
    const change = (key, value) => { set('page', 0); set('detail', ''); set(key, value) }
    if (this.exportText && get('export') !== '0') {
      return this.shell([label('EXPORT YOUR JOURNAL', 12, palette.edge), label('Save a JSON copy', 27),
        label('Long-press inside the JSON below, choose Select all, then Copy. Paste it into a text editor and save with this filename:', 15),
        panel([label(this.exportName, 14), label(this.exportText.length + ' characters', 12, palette.muted)]),
        View({ style: { marginTop: '16px', background: '#e8efd8', padding: '10px', color: '#102d42' } }, TextInput({
          label: 'JSON export', multiline: true, rows: 16, value: this.exportText,
          onChange: () => {}, labelStyle: { color: '#102d42' }
        })),
        label('This copy stays unchanged while you copy it. Go back and export again to include a newer sync.', 12, palette.muted),
        View({ style: { marginTop: '16px' } }, button('Back to journal', () => {
          this.exportText = null
          this.exportName = null
          set('export', '0')
        }))])
    }
    let data = null
    let receivedAt = null
    let error = ''
    try {
      const saved = storage.getItem(SNAPSHOT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        data = validateSnapshot(parsed)
        receivedAt = parsed.receivedAt
      }
    } catch (_) { error = 'Saved phone data could not be read. Sync again from your watch.' }
    const children = [label('ZEPIMON / FIELD JOURNAL', 12, palette.edge), label('Your adventure, up close.', 27),
      label('Walk. Hatch. Evolve.', 15, palette.muted),
      View({ style: { marginTop: '16px' } }, button('Sync from watch', () => storage.setItem(SYNC_KEY, String(Date.now())))),
      label(error || storage.getItem(STATUS_KEY) || 'Open Zepimon on your connected watch, then sync.', 12, palette.muted)]
    if (receivedAt) children.push(label('Last sync: ' + dateLabel(receivedAt), 12, palette.muted))
    if (!data) {
      children.push(panel([sprite('Egg'), label('Your collection starts here', 21),
        label('Keep the Zepp app and Zepimon on your watch open for the first sync. Your Pokemon and saved journey details will appear here.', 15)]))
      return this.shell(children)
    }
    children.push(View({ style: { marginTop: '12px' } }, button('Export JSON', () => {
      const exportedAt = new Date().toISOString()
      this.exportText = JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt,
        receivedAt: receivedAt || null, snapshot: data, routes }, null, 2)
      this.exportName = 'zepimon-' + exportedAt.slice(0, 19).replace(/:/g, '-') + 'Z.json'
      set('export', exportedAt)
    })))

    const dexKeys = Object.keys(data.dex)
    const normal = dexKeys.filter((key) => !key.startsWith('Shiny ')).length
    const shiny = dexKeys.length - normal
    children.push(panel([label(collectionCount(data.dex) + ' / ' + speciesCount + ' Pokemon acquired', 20),
      label(normal + ' normal forms  /  ' + shiny + ' shiny forms', 14, palette.muted)]))
    const tab = get('tab', 'dex')
    children.push(View({ style: { marginTop: '16px' } }, row([
      button('Pokedex', () => change('tab', 'dex'), tab === 'dex'),
      button('Journeys', () => change('tab', 'journeys'), tab === 'journeys')
    ])))
    if (tab === 'journeys') this.journeys(children, data, get, set)
    else this.dex(children, data, get, set, change)
    children.push(View({ style: { marginTop: '22px' } }, label(
      'Your last sync stays on this phone. Pokemon images load online. Syncing does not change your watch records.', 12, palette.muted)))
    return this.shell(children)
  },

  shell(children) {
    return View({ style: { padding: '22px 16px 36px', minHeight: '100vh', background: '#061b2c',
      color: palette.ink, fontFamily: 'monospace', boxSizing: 'border-box' } }, children)
  },

  pagination(children, total, get, set) {
    const pages = Math.max(1, Math.ceil(total / 12))
    const page = Math.min(pages - 1, Math.max(0, parseInt(get('page', '0'), 10) || 0))
    if (pages > 1) children.push(View({ style: { marginTop: '16px' } }, row([
      button('Previous', () => set('page', Math.max(0, page - 1))),
      label((page + 1) + ' / ' + pages), button('Next', () => set('page', Math.min(pages - 1, page + 1)))
    ])))
    return page * 12
  },

  dex(children, data, get, set, change) {
    const detail = get('detail')
    if (detail && (data.dex[detail] || data.dex['Shiny ' + detail])) {
      children.push(View({ style: { marginTop: '16px' } }, button('Back to Pokedex', () => set('detail', ''))))
      children.push(label(detail, 26), label(primaryType(detail).toUpperCase(), 12, palette.edge))
      for (const shiny of [false, true]) {
        const record = data.dex[(shiny ? 'Shiny ' : '') + detail]
        const details = record && !hasDexDistance(detail, record)
          ? [label('Distance unavailable', 24), label('An older run overwrote these details.', 14, palette.muted)]
          : recordDetails(record)
        children.push(panel([label(shiny ? 'SHINY' : 'NORMAL', 15, shiny ? '#ffe08d' : palette.edge),
          ...(record ? [sprite(detail, shiny, 168)] : []), ...details]))
      }
      return
    }
    const query = get('query')
    const filter = get('filter', 'all')
    const gen = Number(get('generation', '0'))
    children.push(View({ style: { marginTop: '16px', background: '#e8efd8', padding: '10px', color: '#102d42' } }, TextInput({
      label: 'Find a Pokemon', placeholder: 'e.g. Gible or Mega Gengar', value: query,
      onChange: (value) => change('query', value), labelStyle: { color: '#102d42' }
    })))
    children.push(View({ style: { marginTop: '12px' } }, row([
      ...['all', 'normal', 'shiny'].map((value) => button(value === 'all' ? 'All' : value === 'normal' ? 'Normal' : 'Shiny',
        () => change('filter', value), filter === value)),
      button(gen === 0 ? 'All generations' : gen === 5 ? 'Extra families' : 'Generation ' + gen,
        () => change('generation', (gen + 1) % 6))
    ])))
    const names = dexPokemon(data.dex).filter((name) => name.toLowerCase().includes(query.toLowerCase().trim()))
      .filter((name) => filter === 'all' || data.dex[(filter === 'shiny' ? 'Shiny ' : '') + name])
      .filter((name) => !gen || (gen === 5 ? generationOf(name) > 4 : generationOf(name) === gen))
      .sort((a, b) => a.localeCompare(b))
    children.push(label(names.length + ' matching Pokemon', 12, palette.muted))
    const start = this.pagination(children, names.length, get, set)
    if (!names.length) children.push(panel([label(dexPokemon(data.dex).length ? 'No matches. Try another filter.' : 'No Pokemon acquired yet. Hatch an egg, save your journey, then sync.', 16)]))
    const cards = names.slice(start, start + 12).map((name) => {
      const normal = !!data.dex[name]
      const shiny = !!data.dex['Shiny ' + name]
      return View({ style: { width: 'calc(50% - 4px)', boxSizing: 'border-box', padding: '12px 6px',
        marginTop: '10px', border: '2px solid ' + palette.edge, background: palette.panel, textAlign: 'center' } }, [
        sprite(name, filter === 'shiny' || !normal, 112), label(name, 16),
        label((normal ? 'Normal' : 'Normal locked') + ' / ' + (shiny ? 'Shiny' : 'Shiny locked'), 11, palette.muted),
        button('View records', () => set('detail', name))
      ])
    })
    children.push(row(cards))
  },

  journeys(children, data, get, set) {
    const active = data.active
    if (active && routes[active.route]) {
      const form = currentForm(active.route, active.meters, active.mega)
      const seconds = elapsedSeconds(active, data.capturedAt)
      const next = nextMilestone(active.route, active.meters)
      children.push(panel([label('CURRENT ADVENTURE / AT LAST SYNC', 12, palette.edge),
        sprite(form, active.shiny, 160), label((active.shiny ? 'Shiny ' : '') + (form === 'Egg' ? routes[active.route][0] + ' egg' : form), 22),
        label(km(active.meters), 30), label('Time ' + elapsedLabel(seconds) + ' / Avg pace ' + paceLabel(seconds, active.meters)),
        label(active.steps + ' steps', 14, palette.muted),
        label(next === null ? 'Final form reached!' : km(next - active.meters) + ' to the next milestone', 14, palette.edge)]))
    }
    children.push(View({ style: { marginTop: '20px' } }, label('Latest saved journeys', 23)),
      label('One record per egg family. Another saved run replaces that family’s previous journey.', 13, palette.muted))
    const entries = Object.keys(data.records).filter((key) => routes[key])
      .sort((a, b) => Date.parse(data.records[b].finishedAt) - Date.parse(data.records[a].finishedAt))
    const start = this.pagination(children, entries.length, get, set)
    if (!entries.length) children.push(panel([label('No saved journeys yet. Finish an adventure on your watch, then sync.', 16)]))
    for (const key of entries.slice(start, start + 12)) {
      const record = data.records[key]
      const form = record.form || currentForm(Number(key), record.meters, record.mega)
      children.push(panel([sprite(form, record.shiny, 136), label((record.shiny ? 'Shiny ' : '') + form, 23),
        label(routes[key].join(' > '), 12, palette.edge), ...recordDetails(record)]))
    }
  }
})
