const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')

const read = path => fs.readFileSync(path, 'utf8')
const source = (path, context, exports = []) => vm.runInContext('(function(){' +
  read(path).replace(/^import .*\r?\n/gm, '').replace(/export /g, '') +
  (exports.length ? '\nObject.assign(globalThis, {' + exports.join(',') + '})' : '') + '\n})()', context, { filename: path })
const compiled = (path, context) => vm.runInContext('(function(){' + read(path).replace(/export\{([^}]+)\};?/, (_, names) =>
  'Object.assign(globalThis, {' + names.split(',').map(pair => {
    const [local, exported] = pair.trim().split(/ as /)
    return (exported || local) + ':' + local
  }).join(',') + '});') + '})()', context, { filename: path })
const contract = ['SNAPSHOT_KEY', 'SYNC_KEY', 'STATUS_KEY', 'makeSnapshot', 'validateSnapshot']
const clone = value => JSON.parse(JSON.stringify(value))
const quiet = { log() {}, error() {}, warn() {}, debug() {} }
const Logger = { getLogger: () => ({ ...quiet }) }
class EventBus extends EventEmitter {
  off(event, callback) { return callback ? super.off(event, callback) : this.removeAllListeners(event) }
}

async function main() {
  let watchApp, phoneService, settingsPage, deviceReceive, phoneReceive, connected = true
  let watchState = { dex: {}, records: {}, active: null }
  const phoneStorage = new Map()
  let settingsListener
  const settingsStorage = {
    getItem: key => phoneStorage.get(key),
    setItem(key, value) {
      assert.equal(typeof value, 'string')
      const oldValue = phoneStorage.get(key)
      phoneStorage.set(key, value)
      if (settingsListener) settingsListener({ key, newValue: value, oldValue })
    },
    addListener(_, callback) { settingsListener = callback },
    removeListener() { settingsListener = null }
  }
  // Emulate Zepp's outer BLE header; the installed ZML handles real JSON framing/chunks.
  const devicePacket = (type, payload = Buffer.alloc(0)) => {
    const packet = Buffer.alloc(16 + payload.length)
    packet[0] = 1; packet[1] = 1
    packet.writeUInt16LE(type, 2)
    packet.writeUInt16LE(20, 4); packet.writeUInt16LE(30, 6)
    packet.writeUInt32LE(20600, 8)
    payload.copy(packet, 16)
    return packet
  }
  let chunks = 0
  const ble = {
    addListener() {}, connectStatus: () => connected,
    createConnect(callback) { deviceReceive = callback },
    disConnect() {},
    send(buffer, length) {
      if (!connected) return false
      const packet = Buffer.from(buffer).subarray(0, length)
      const type = packet.readUInt16LE(2)
      if (type === 1) setImmediate(() => deviceReceive(0, devicePacket(1), 16))
      else if (type === 4) { chunks++; setImmediate(() => phoneReceive(packet.subarray(16))) }
      return true
    }
  }
  const sdk = {
    '@zos/app': { getPackageInfo: () => ({ appId: 20600 }) },
    '@zos/ble': ble, '@zos/ui': {}, '@zos/device': {}, '@zos/i18n': {}, '@zos/router': {},
    '@zos/utils': { EventBus, log: Logger }, '@zos/timer': { setTimeout, clearTimeout }
  }
  const watch = vm.createContext({ Buffer, console: quiet, setTimeout, clearTimeout,
    __$$R$$__: name => { assert.ok(sdk[name], 'Unexpected SDK dependency: ' + name); return sdk[name] },
    connectStatus: ble.connectStatus,
    LocalStorage: class {
      getItem() { return clone(watchState) }
      setItem(key, value) { assert.equal(key, 'zepimon-v1'); watchState = clone(value) }
    },
    App: definition => { watchApp = definition }, getApp: () => ({ _options: watchApp })
  })
  const phone = vm.createContext({ Buffer, console: quiet, setTimeout, clearTimeout, Logger,
    sideService: { appInfo: { app: { appName: 'Zepimon' } }, launchReasons: { settingsChanged: true },
      launchArgs: { key: 'zepimon-sync-request', newValue: 'cold-start' } },
    settings: { settingsStorage }, getApp: () => ({ port2: 30 }),
    messaging: { peerSocket: {
      addListener(_, callback) { phoneReceive = callback },
      send(buffer) { const packet = devicePacket(4, Buffer.from(buffer)); setImmediate(() => deviceReceive(0, packet, packet.length)) }
    } }, AppSideService: definition => { phoneService = definition }
  })
  source('shared/companion.js', watch, contract)
  source('shared/companion.js', phone, contract)
  compiled('node_modules/@zeppos/zml/dist/base/base-app.js', watch)
  compiled('node_modules/@zeppos/zml/dist/3.0/module/messaging/plugin/app.js', watch)
  compiled('node_modules/@zeppos/zml/dist/base/base-side.js', phone)
  compiled('node_modules/@zeppos/zml/dist/3.0/module/messaging/plugin/side.js', phone)
  source('page/catalog.js', watch, ['routes', 'species', 'megaForms', 'sprites', 'shinySprites'])
  watch.catalogRoutes = watch.routes
  source('page/types.js', watch, ['pokemonTypes'])
  source('page/pokemon.js', watch, ['repairDexRecords'])
  source('app.js', watch)
  source('app-side/index.js', phone)
  phoneService.onInit()
  watchApp.onCreate()
  const drain = async () => { for (let i = 0; i < 24; i++) await new Promise(setImmediate) }
  await drain()
  const saved = () => JSON.parse(phoneStorage.get(phone.SNAPSHOT_KEY))
  assert.equal(saved().schemaVersion, 1)
  assert.equal(Object.keys(saved().dex).length, 0)
  assert.equal(watchApp.phoneSyncBusy, false)
  assert.equal(phoneService.pendingSync, false, 'A Sync tap that launches the side service must wait for messaging initialization')
  assert.equal(phoneService.syncBusy, false)

  const normal = { meters: 5200, steps: 7000, finishedAt: '2026-10-15T02:00:00.000Z', shiny: false }
  // Legacy Dex records describe different runs from the surviving journey, so their times cannot be backfilled.
  watchState = { dex: { Bulbasaur: { ...normal, meters: 5500 }, 'Shiny Bulbasaur': { ...normal, meters: 8000, shiny: true } },
    records: { 0: { ...normal, form: 'Bulbasaur', elapsedSeconds: 3600, startedAt: Date.parse(normal.finishedAt) - 3600000 } },
    active: { route: 0, meters: 800, steps: 1200, shiny: true, startedAt: Date.now() - 600000, lastMeters: 9999, day: 'test' }
  }
  const before = clone(watchState)
  watchApp.syncToPhone()
  watchState.dex.Bulbasaur.meters = 6000
  watchApp.syncToPhone() // Queue the newer state while a request is in flight.
  await drain()
  assert.equal(saved().dex.Bulbasaur.meters, 6000)
  assert.equal(saved().dex['Shiny Bulbasaur'].meters, 8000)
  assert.equal(saved().active.lastMeters, undefined, 'Internal daily sensor counters must not be exported')
  assert.equal(watchState.active.lastMeters, before.active.lastMeters, 'Sync must not mutate watch data')
  assert.equal(saved().records[0].elapsedSeconds, 3600)

  watchState.dex.Bulbasaur.meters = 6100
  settingsStorage.setItem(phone.SYNC_KEY, 'manual-request')
  await drain()
  assert.equal(saved().dex.Bulbasaur.meters, 6100, 'Phone Sync button must retrieve current watch storage')
  assert.equal(phoneService.syncBusy, false)
  const good = phoneStorage.get(phone.SNAPSHOT_KEY)
  let replyError
  phoneService.onRequest({ method: 'zepimon.snapshot.put', params: { schemaVersion: 7 } }, error => { replyError = error })
  assert.ok(replyError)
  assert.equal(phoneStorage.get(phone.SNAPSHOT_KEY), good, 'Bad updates must preserve the last snapshot')
  for (const mutation of [value => { value.dex.Bulbasaur.meters = -1 },
    value => { value.active.route = -1 }, value => { value.records[0].finishedAt = 'invalid' },
    value => { value.dex = JSON.parse('{"__proto__": {}}') }]) {
    const value = saved(); mutation(value)
    assert.throws(() => phone.validateSnapshot(value))
  }

  const originalRequest = phoneService.request
  phoneService.request = () => Promise.reject(new Error('Disconnected'))
  await phoneService.syncFromWatch()
  assert.equal(phoneStorage.get(phone.SNAPSHOT_KEY), good)
  assert.match(phoneStorage.get(phone.STATUS_KEY), /Last synced records are kept/)
  phoneService.request = originalRequest
  connected = false
  watchApp.syncToPhone()
  await drain()
  assert.equal(watchApp.phoneSyncBusy, false, 'Offline watch must keep running without a pending request')
  connected = true

  const ui = vm.createContext({ console, AppSettingsPage: definition => { settingsPage = definition } })
  for (const component of ['View', 'Text', 'Image', 'Button', 'TextInput']) ui[component] = (props, children = []) => ({ component, props, children: Array.isArray(children) ? children : [children] })
  source('page/catalog.js', ui, ['routes', 'species', 'megaForms', 'sprites', 'shinySprites'])
  ui.catalogRoutes = ui.routes
  source('page/types.js', ui, ['pokemonTypes'])
  source('page/pokemon.js', ui, ['routes', 'speciesCount', 'collectionCount', 'dexPokemon', 'currentForm', 'spritePath', 'primaryType', 'elapsedSeconds', 'elapsedLabel', 'paceLabel', 'nextMilestone', 'hasDexDistance'])
  source('shared/companion.js', ui, contract)
  source('setting/eggs.js', ui, ['eggs'])
  source('setting/index.js', ui)
  const render = () => settingsPage.build({ settingsStorage })
  const nodes = tree => [tree, ...(tree.children || []).flatMap(child => typeof child === 'object' ? nodes(child) : [])]
  const texts = tree => nodes(tree).filter(n => n.component === 'Text').map(n => n.children.join(' ')).join('\n')
  const click = (tree, label) => {
    const button = nodes(tree).find(n => n.component === 'Button' && n.props.label === label)
    assert.ok(button, 'Missing phone button: ' + label); button.props.onClick()
  }
  let tree = render()
  assert.match(texts(tree), /1 normal forms.*1 shiny forms/)
  click(tree, 'View records')
  tree = render()
  assert.match(texts(tree), /6.10 km/)
  assert.match(texts(tree), /8.00 km/)
  assert.equal(nodes(tree).filter(n => n.component === 'Image').length, 2)
  assert.equal(texts(tree).match(/Time and average pace were not saved for this older record\./g).length, 2)
  assert.ok(!texts(tree).includes('Hatch time'), 'Legacy records must not invent a hatch time')
  click(tree, 'Back to Pokedex')
  tree = render(); click(tree, 'Shiny'); tree = render()
  assert.ok(nodes(tree).some(n => n.component === 'Image' && n.props.src.includes('/shiny/1.png')))
  nodes(tree).find(n => n.component === 'TextInput').props.onChange('gible')
  assert.match(texts(render()), /No matches/)
  nodes(render()).find(n => n.component === 'TextInput').props.onChange('')
  click(render(), 'Journeys')
  assert.match(texts(render()), /CURRENT ADVENTURE/)
  assert.match(texts(render()), /01:00:00/)
  assert.match(texts(render()), /11:32 \/km/)
  assert.equal(texts(render()).match(/Avg pace/g).length, 2, 'Current and saved journeys should each display average pace once')
  const journeyPreview = render()

  // Export a frozen, portable copy without changing synced or watch records.
  const exportInput = () => nodes(render()).find(n => n.component === 'TextInput' && n.props.label === 'JSON export')
  const storedBeforeExport = Array.from(phoneStorage.entries())
  const watchBeforeExport = clone(watchState)
  click(render(), 'Export JSON')
  assert.equal(exportInput().props.multiline, true)
  const exportText = exportInput().props.value
  const exported = JSON.parse(exportText)
  assert.equal(exported.exportVersion, 1)
  assert.equal(exported.app, 'Zepimon')
  assert.ok(Number.isFinite(Date.parse(exported.exportedAt)))
  assert.equal(exported.receivedAt, saved().receivedAt)
  assert.deepEqual(exported.snapshot, clone(ui.validateSnapshot(saved())))
  assert.deepEqual(exported.routes[0], ['Bulbasaur', 'Ivysaur', 'Venusaur'])
  assert.equal(exported.snapshot.dex.Bulbasaur.meters, 6100)
  assert.equal(exported.snapshot.dex['Shiny Bulbasaur'].shiny, true)
  assert.equal(exported.snapshot.active.route, 0)
  assert.equal(exported.snapshot.records[0].elapsedSeconds, 3600)
  assert.deepEqual(Array.from(phoneStorage.entries()).filter(([key]) => key !== 'zepimon-ui-export'), storedBeforeExport)
  assert.deepEqual(watchState, watchBeforeExport)
  const storedBeforeTyping = Array.from(phoneStorage.entries())
  exportInput().props.onChange('{edited text}')
  assert.deepEqual(Array.from(phoneStorage.entries()), storedBeforeTyping)
  assert.equal(exportInput().props.value, exportText)
  watchState.dex.Bulbasaur.meters = 6200
  watchApp.syncToPhone()
  await drain()
  assert.equal(saved().dex.Bulbasaur.meters, 6200)
  assert.equal(exportInput().props.value, exportText, 'Background sync must not replace JSON while it is being copied')
  click(render(), 'Back to journal')
  assert.equal(exportInput(), undefined)
  click(render(), 'Export JSON')
  assert.equal(JSON.parse(exportInput().props.value).snapshot.dex.Bulbasaur.meters, 6200)
  const closedExportFlag = phoneStorage.get('zepimon-ui-export')
  const settingsDate = vm.runInContext('Date', ui)
  const reopenedAt = Date.parse(closedExportFlag) + 1000
  ui.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [reopenedAt])) } }
  source('setting/index.js', ui) // Closing settings discards the page instance but keeps its UI storage.
  assert.equal(exportInput(), undefined)
  assert.equal(phoneStorage.get('zepimon-ui-export'), closedExportFlag)
  click(render(), 'Export JSON')
  assert.notEqual(phoneStorage.get('zepimon-ui-export'), closedExportFlag, 'Reopened export must change storage to trigger a redraw')
  assert.equal(phoneStorage.get('zepimon-ui-export'), new Date(reopenedAt).toISOString())
  assert.equal(JSON.parse(exportInput().props.value).snapshot.dex.Bulbasaur.meters, 6200)
  ui.Date = settingsDate
  click(render(), 'Back to journal')

  const latestPhoneSnapshot = phoneStorage.get(phone.SNAPSHOT_KEY)
  const legacy = saved()
  delete legacy.personalBests
  delete legacy.records[0].startedAt
  delete legacy.records[0].elapsedSeconds
  delete legacy.records[0].hatchSeconds
  phoneStorage.set(phone.SNAPSHOT_KEY, JSON.stringify(legacy))
  click(render(), 'Export JSON')
  const legacyExport = JSON.parse(exportInput().props.value)
  assert.equal(legacyExport.snapshot.records[0].elapsedSeconds, undefined)
  assert.deepEqual(legacyExport.snapshot, clone(ui.validateSnapshot(legacy)))
  click(render(), 'Back to journal')

  const extended = JSON.parse(latestPhoneSnapshot)
  extended.active.meters = 5500
  extended.active.hatchSeconds = 540
  extended.records[0].hatchSeconds = 3000
  extended.dex.Bulbasaur.hatchSeconds = 3000
  extended.dex.Bulbasaur.elapsedSeconds = 3720
  extended.dex.Bulbasaur.startedAt = Date.parse(normal.finishedAt) - 3720000
  extended.dex['Shiny Bulbasaur'].hatchSeconds = 2400
  extended.dex['Shiny Bulbasaur'].elapsedSeconds = 4000
  extended.dex['Shiny Bulbasaur'].startedAt = Date.parse(normal.finishedAt) - 4000000
  const best = { ...extended.records[0], route: 0 }
  extended.personalBests = { distance: { ...best }, elapsed: { ...best }, hatch: { ...best } }
  phoneStorage.set(phone.SNAPSHOT_KEY, JSON.stringify(extended))
  click(render(), 'Pokedex')
  click(render(), 'View records')
  const detailTree = render()
  const variantPanel = variant => nodes(detailTree).find(n => n.component === 'View' &&
    n.children.some(child => child.component === 'Text' && child.children.join('') === variant))
  const normalDetails = texts(variantPanel('NORMAL'))
  const shinyDetails = texts(variantPanel('SHINY'))
  assert.match(normalDetails, /6.20 km/)
  assert.match(normalDetails, /Time 01:02:00 \/ Avg pace 10:00 \/km/)
  assert.match(normalDetails, /Hatch time \(first detected\): 00:50:00/)
  assert.ok(!normalDetails.includes('01:06:40'))
  assert.match(shinyDetails, /8.00 km/)
  assert.match(shinyDetails, /Time 01:06:40 \/ Avg pace 8:20 \/km/)
  assert.match(shinyDetails, /Hatch time \(first detected\): 00:40:00/)
  assert.ok(!shinyDetails.includes('01:02:00'))
  assert.ok(!texts(detailTree).includes('were not saved'))
  click(render(), 'Back to Pokedex')
  click(render(), 'Journeys')
  click(render(), 'Export JSON')
  const extendedExport = JSON.parse(exportInput().props.value)
  assert.equal(extendedExport.snapshot.active.hatchSeconds, 540)
  assert.equal(extendedExport.snapshot.records[0].hatchSeconds, 3000)
  assert.equal(extendedExport.snapshot.dex.Bulbasaur.hatchSeconds, 3000)
  assert.deepEqual(extendedExport.snapshot.dex.Bulbasaur, extended.dex.Bulbasaur)
  assert.deepEqual(extendedExport.snapshot.dex['Shiny Bulbasaur'], extended.dex['Shiny Bulbasaur'])
  assert.deepEqual(extendedExport.snapshot.personalBests, extended.personalBests)
  assert.deepEqual(extendedExport.snapshot, clone(ui.validateSnapshot(extendedExport.snapshot)))
  click(render(), 'Back to journal')
  phoneStorage.set(phone.SNAPSHOT_KEY, latestPhoneSnapshot)

  // Damaged old Dex details remain acquired, but must not display an impossible distance.
  const damaged = JSON.parse(latestPhoneSnapshot)
  damaged.dex.Bulbasaur = { ...normal, meters: 0, steps: 0 }
  damaged.records[0] = { ...normal, meters: 0, steps: 0, form: 'Egg', elapsedSeconds: 0 }
  phoneStorage.set(phone.SNAPSHOT_KEY, JSON.stringify(damaged))
  click(render(), 'Pokedex')
  click(render(), 'View records')
  const damagedTree = render()
  const damagedNormal = nodes(damagedTree).find(n => n.component === 'View' &&
    n.children.some(child => child.component === 'Text' && child.children.join('') === 'NORMAL'))
  assert.match(texts(damagedNormal), /Distance unavailable/)
  assert.match(texts(damagedNormal), /An older run overwrote these details\./)
  assert.ok(!texts(damagedNormal).includes('0.00 km'))
  assert.ok(!texts(damagedNormal).includes('steps'))
  assert.ok(!texts(damagedNormal).includes('Time'))
  assert.equal(nodes(damagedNormal).filter(n => n.component === 'Image').length, 1, 'An acquired sprite must remain visible')
  assert.match(texts(damagedTree), /8.00 km/, 'The unaffected shiny variant keeps its own distance')
  click(render(), 'Back to Pokedex')
  click(render(), 'Journeys')
  assert.match(texts(render()), /0.00 km/, 'A genuinely zero-distance latest journey is still shown')
  phoneStorage.set(phone.SNAPSHOT_KEY, latestPhoneSnapshot)

  // Watch sync recovers overwritten Dex data from a surviving completed journey and persists it.
  const watchBeforeRepair = clone(watchState)
  watchState.dex.Bulbasaur = { ...normal, meters: 0, steps: 0 }
  watchApp.syncToPhone()
  await drain()
  assert.equal(watchState.dex.Bulbasaur.meters, watchState.records[0].meters)
  assert.equal(watchState.dex.Bulbasaur.elapsedSeconds, 3600)
  assert.equal(saved().dex.Bulbasaur.meters, watchState.records[0].meters)
  assert.equal(saved().dex.Bulbasaur.elapsedSeconds, 3600)
  assert.equal(saved().dex['Shiny Bulbasaur'].meters, 8000)
  watchState = watchBeforeRepair
  watchApp.syncToPhone()
  await drain()

  // All available forms produce a large multi-packet BLE snapshot, then paginate on the phone.
  const allNames = Object.keys(ui.sprites).filter(name => name !== 'Egg')
  watchState.active = null
  watchState.dex = {}
  for (const name of allNames) {
    watchState.dex[name] = { ...normal }
    watchState.dex['Shiny ' + name] = { ...normal, shiny: true }
  }
  const beforeChunks = chunks
  watchApp.syncToPhone()
  await drain()
  assert.equal(Object.keys(saved().dex).length, allNames.length * 2)
  assert.ok(chunks - beforeChunks > 2, 'Large Pokedex should exercise real ZML chunking')
  click(render(), 'Pokedex')
  tree = render()
  assert.equal(nodes(tree).filter(n => n.component === 'Image').length, 12)
  click(tree, 'Next')
  assert.match(texts(render()), /2 \/ /)
  assert.equal(ui.spritePath('Mega Zygarde'), ui.spritePath('Zygarde'))
  const largeSnapshot = phoneStorage.get(phone.SNAPSHOT_KEY)
  click(render(), 'Export JSON')
  const largeText = exportInput().props.value
  const largeExport = JSON.parse(largeText)
  assert.ok(largeText.length > 100000, 'Full collection export must exercise a large multiline value')
  assert.equal(Object.keys(largeExport.snapshot.dex).length, allNames.length * 2)
  assert.deepEqual(largeExport.snapshot, clone(ui.validateSnapshot(JSON.parse(largeSnapshot))))
  assert.equal(largeExport.routes.length, ui.routes.length)
  assert.equal(phoneStorage.get(phone.SNAPSHOT_KEY), largeSnapshot)
  assert.ok(largeText.endsWith('}'), 'JSON export must include its complete closing content')
  click(render(), 'Back to journal')

  if (process.env.ZEPIMON_PREVIEW) fs.writeFileSync(process.env.ZEPIMON_PREVIEW,
    JSON.stringify({ dex: tree, journeys: journeyPreview }, null, 2))
  phoneStorage.delete(phone.SNAPSHOT_KEY)
  assert.match(texts(render()), /Your collection starts here/)
  assert.ok(!nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Export JSON'))
  phoneStorage.set(phone.SNAPSHOT_KEY, '{bad json')
  assert.match(texts(render()), /Saved phone data could not be read/)
  assert.ok(!nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Export JSON'))
  watchApp.onDestroy()
  phoneService.onDestroy()
  assert.equal(settingsListener, null)
  console.log('Companion checks passed: real ZML framing, large Dex sync, offline retention, validation, phone navigation and frozen JSON export')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
