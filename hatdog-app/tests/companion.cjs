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
const contract = ['SNAPSHOT_KEY', 'SYNC_KEY', 'STATUS_KEY', 'SYNC_FRAME_KEY', 'makeSnapshot', 'validateSnapshot']
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
  source('shared/expedition.js', watch, ['validateExpedition', 'ensureExpedition'])
  source('shared/expedition.js', phone, ['validateExpedition'])
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
  phone.routes = clone(watch.routes)
  source('shared/cloud-config.js', phone, ['cloudConfig'])
  source('shared/cloud.js', phone, ['cloudMethods', 'CLOUD_REQUEST_KEY', 'CLOUD_STATUS_KEY'])
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
    active: { route: 0, meters: 800, steps: 1200, shiny: true, startedAt: Date.now() - 600000, lastMeters: 9999, day: 'test' },
    expedition: { seed: 345, startedAt: 1000, meters: 27000 }
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
  assert.deepEqual(saved().expedition, watchState.expedition, 'Expedition counter must survive real ZML framing')

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
  source('shared/expedition.js', ui, ['validateExpedition'])
  source('shared/companion.js', ui, contract)
  source('shared/cloud-config.js', ui, ['cloudConfig'])
  source('shared/cloud.js', ui, ['CLOUD_TOKEN_KEY', 'CLOUD_REQUEST_KEY', 'CLOUD_STATUS_KEY', 'CLOUD_SENT_KEY', 'CLOUD_LINKED_KEY'])
  source('setting/index.js', ui)
  const render = () => settingsPage.build({ settingsStorage })
  const nodes = tree => [tree, ...(tree.children || []).flatMap(child => typeof child === 'object' ? nodes(child) : [])]
  const texts = tree => nodes(tree).filter(n => n.component === 'Text').map(n => n.children.join(' ')).join('\n')
  const click = (tree, label) => {
    const button = nodes(tree).find(n => n.component === 'Button' && n.props.label === label)
    assert.ok(button, 'Missing phone button: ' + label); button.props.onClick()
  }
  let tree = render()
  assert.match(texts(tree), /standalone Zepimon app/)
  assert.equal(nodes(tree).filter(n => n.component === 'Image').length, 0)
  assert.ok(!nodes(tree).some(n => n.component === 'Button' && ['Pokedex', 'Journeys'].includes(n.props.label)))
  const beforeLink = phoneStorage.get(phone.SNAPSHOT_KEY)
  const input = nodes(tree).find(n => n.component === 'TextInput')
  assert.equal(input.props.label, 'One-time linking code', 'An empty Zepp TextInput needs its own tappable label to open the editor')
  assert.notEqual(input.props.disabled, true)
  assert.equal(input.props.placeholder, 'Enter one-time linking code')
  assert.equal(input.props.value, '')
  input.props.onChange('abcd-1234-abcd-1234-abcd-1234')
  assert.equal(nodes(render()).find(n => n.component === 'TextInput').props.value, 'abcd-1234-abcd-1234-abcd-1234')
  click(render(), 'Link account')
  assert.equal(phoneStorage.get('zepimon-ui-link-code'), '')
  assert.equal(phoneStorage.get(phone.SNAPSHOT_KEY), beforeLink, 'Link UI must preserve the buffered journal')
  click(render(), 'Sync from watch')
  await drain()
  assert.ok(Number(phoneStorage.get(phone.SYNC_FRAME_KEY)) > 0, 'Syncing advances the Pokeball frame')
  assert.equal(phoneService.spinTimer, undefined, 'The spinner stops once the sync finishes')
  assert.equal(phoneService.spinners, 0)
  assert.ok(saved().dex.Bulbasaur)
  assert.ok(saved().dex['Shiny Bulbasaur'])

  // The real phone importer must accept the exact text produced by Zepp settings.
  const { parseJournal } = await import('../../zepimon-mobile/src/journal.ts')
  const exportInput = () => nodes(render()).find(n => n.component === 'TextInput' && n.props.multiline)
  const beforeExport = phoneStorage.get(phone.SNAPSHOT_KEY)
  phoneStorage.set(ui.CLOUD_TOKEN_KEY, 'test-upload-secret')
  click(render(), 'Export JSON')
  const exportedText = exportInput().props.value
  const imported = parseJournal(exportedText)
  assert.deepEqual(imported.snapshot, clone(ui.validateSnapshot(JSON.parse(beforeExport))))
  assert.deepEqual(imported.snapshot.expedition, watchState.expedition, 'Manual JSON carries the same expedition outcomes')
  assert.deepEqual(imported.routes, clone(ui.routes))
  assert.equal(imported.receivedAt, JSON.parse(beforeExport).receivedAt)
  assert.ok(!exportedText.includes('test-upload-secret'))
  assert.equal(exportInput().props.disabled, undefined, 'Copying must be possible in the native text editor')
  exportInput().props.onChange('accidental edit')
  assert.equal(exportInput().props.value, exportedText, 'Editing the copy cannot change the saved journal')
  assert.equal(phoneStorage.get(phone.SNAPSHOT_KEY), beforeExport)
  const newer = { ...JSON.parse(beforeExport), capturedAt: imported.snapshot.capturedAt + 1 }
  phoneStorage.set(phone.SNAPSHOT_KEY, JSON.stringify(newer))
  assert.equal(exportInput().props.value, exportedText, 'Incoming sync must not replace text during copying')
  click(render(), 'Back to sync')
  phoneStorage.delete(ui.CLOUD_TOKEN_KEY)
  click(render(), 'Export JSON')
  assert.equal(parseJournal(exportInput().props.value).snapshot.capturedAt, newer.capturedAt, 'Export works without a cloud account and includes the newer sync')
  click(render(), 'Back to sync')
  phoneStorage.set(phone.SNAPSHOT_KEY, beforeExport)

  // An empty code is caught on the page instead of sending a doomed link request.
  click(render(), 'Link account')
  assert.match(phoneStorage.get(ui.CLOUD_STATUS_KEY), /enter the code/)
  assert.ok(!phoneStorage.get(ui.CLOUD_REQUEST_KEY))
  assert.match(texts(render()), /NOT LINKED YET/)

  // Linked phones show a trainer card instead of the code form, and unlinking asks first.
  phoneStorage.set(ui.CLOUD_TOKEN_KEY, 'test-upload-secret')
  phoneStorage.set(ui.CLOUD_SENT_KEY, String(JSON.parse(beforeExport).capturedAt))
  let linkedTree = render()
  assert.match(texts(linkedTree), /TRAINER CARD/)
  assert.match(texts(linkedTree), /ACCOUNT LINKED/)
  assert.match(texts(linkedTree), /Up to date/)
  assert.ok(!nodes(linkedTree).some(n => n.component === 'TextInput'), 'Linked phones hide the code form')
  assert.ok(!nodes(linkedTree).some(n => n.component === 'Button' && ['Link account', 'Retry upload'].includes(n.props.label)))
  assert.ok(nodes(linkedTree).some(n => n.component === 'Button' && n.props.label === 'Sync from watch'))
  phoneStorage.set(ui.CLOUD_SENT_KEY, '1')
  assert.match(texts(render()), /New progress waiting/)
  assert.ok(nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Retry upload'))
  phoneStorage.set(ui.CLOUD_SENT_KEY, String(JSON.parse(beforeExport).capturedAt))
  // While the phone works, a banner, a spinning Pokeball and chasing Pokedex lights make it obvious.
  phoneStorage.set(phone.STATUS_KEY, 'Syncing… keep Zepimon open on your watch')
  phoneStorage.set(phone.SYNC_FRAME_KEY, '5')
  const busyTree = render()
  assert.match(texts(busyTree), /SYNCING WITH YOUR WATCH/)
  assert.ok(nodes(busyTree).some(n => n.component === 'Button' && n.props.label === 'Syncing…'))
  assert.ok(nodes(busyTree).some(n => n.component === 'View' && n.props.style && n.props.style.transform === 'rotate(225deg)'))
  assert.ok(!/SYNCING WITH YOUR WATCH/.test(texts((phoneStorage.set(phone.STATUS_KEY, 'Synced with your watch'), render()))))
  phoneStorage.set(phone.STATUS_KEY, 'Synced with your watch')

  // Change account keeps the current link until a new code succeeds, and can be cancelled.
  click(render(), 'Change account')
  let changeTree = render()
  assert.equal(nodes(changeTree).find(n => n.component === 'TextInput').props.label, 'One-time linking code')
  assert.ok(nodes(changeTree).some(n => n.component === 'Button' && n.props.label === 'Link new account'))
  assert.ok(nodes(changeTree).some(n => n.component === 'Button' && n.props.label === 'Sync from watch' && n.props.style.background !== '#b8332a'),
    'Only the new link is the red primary action while changing')
  click(changeTree, 'Link new account')
  assert.match(phoneStorage.get(ui.CLOUD_STATUS_KEY), /enter the code/)
  nodes(render()).find(n => n.component === 'TextInput').props.onChange('other-account-code')
  click(render(), 'Link new account')
  await drain()
  assert.equal(phoneStorage.get(ui.CLOUD_TOKEN_KEY), 'test-upload-secret', 'A failed new link keeps the current account')
  assert.ok(nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Link new account'), 'The change form stays open to retry')
  phoneStorage.set(ui.CLOUD_LINKED_KEY, String(Date.now() + 1000))
  assert.ok(!nodes(render()).some(n => n.component === 'TextInput'), 'A successful new link closes the change form')
  assert.match(texts(render()), /Linked since/)
  click(render(), 'Change account')
  click(render(), 'Cancel')
  assert.ok(!nodes(render()).some(n => n.component === 'TextInput'))

  // Remove account asks once, then stops uploads from this phone.
  click(render(), 'Remove account')
  assert.match(texts(render()), /Remove this account from the phone\?/)
  assert.equal(phoneStorage.get(ui.CLOUD_TOKEN_KEY), 'test-upload-secret', 'Asking is not removing')
  click(render(), 'Keep account')
  assert.ok(nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Remove account'))
  click(render(), 'Remove account')
  click(render(), 'Yes, remove account')
  await drain()
  assert.equal(phoneStorage.get(ui.CLOUD_TOKEN_KEY), '', 'The side service stops uploads')
  assert.equal(phoneStorage.get(ui.CLOUD_LINKED_KEY), '')
  assert.match(texts(render()), /Account removed from this phone/)
  assert.equal(nodes(render()).find(n => n.component === 'TextInput').props.label, 'One-time linking code', 'The code form returns after unlinking')

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

  // All available forms produce a large multi-packet BLE snapshot, without requiring a Dex UI in Zepp.
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
  assert.equal(nodes(render()).filter(n => n.component === 'Image').length, 0)
  const largeSnapshot = phoneStorage.get(phone.SNAPSHOT_KEY)
  assert.ok(largeSnapshot.length > 100000)
  assert.equal(Object.keys(ui.validateSnapshot(JSON.parse(largeSnapshot)).dex).length, allNames.length * 2)
  click(render(), 'Export JSON')
  assert.equal(Object.keys(parseJournal(exportInput().props.value).snapshot.dex).length, allNames.length * 2, 'A full collection export must not be truncated')
  click(render(), 'Back to sync')
  phoneStorage.delete(phone.SNAPSHOT_KEY)
  assert.match(texts(render()), /WATCH BRIDGE/)
  assert.match(texts(render()), /Sync from watch first/)
  assert.ok(!nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Export JSON'))
  phoneStorage.set(phone.SNAPSHOT_KEY, '{bad json')
  assert.match(texts(render()), /WATCH BRIDGE/)
  assert.match(texts(render()), /Could not read the saved watch data/)
  assert.ok(!nodes(render()).some(n => n.component === 'Button' && n.props.label === 'Export JSON'))
  watchApp.onDestroy()
  phoneService.onDestroy()
  assert.equal(settingsListener, null)
  console.log('Companion checks passed: real ZML framing, large Dex sync, offline retention, validation, minimal bridge UI and collection preservation')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
