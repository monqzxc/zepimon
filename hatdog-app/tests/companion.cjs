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
const contract = ['SNAPSHOT_KEY', 'SYNC_KEY', 'STATUS_KEY', 'SYNC_FRAME_KEY', 'makeSnapshot', 'validateSnapshot', 'validatePlan', 'validatePhoneRun', 'validatePhoneRuns', 'validateAdventure', 'sharedName', 'SHARED_KEY', 'SHARED_REQUEST_KEY']
const clone = value => JSON.parse(JSON.stringify(value))
const quiet = { log() {}, error() {}, warn() {}, debug() {} }
const Logger = { getLogger: () => ({ ...quiet }) }
class EventBus extends EventEmitter {
  off(event, callback) { return callback ? super.off(event, callback) : this.removeAllListeners(event) }
}

async function main() {
  let watchApp, watchOptions, phoneService, settingsPage, deviceReceive, phoneReceive, connected = true
  let watchState = { dex: {}, records: {}, active: null }
  const watchKeys = new Map()
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
    getPackageInfo: () => ({ appId: 20600, version: { code: 44, name: '1.13' } }),
    LocalStorage: class {
      getItem(key) { return key === 'zepimon-v1' ? clone(watchState) : watchKeys.has(key) ? clone(watchKeys.get(key)) : undefined }
      setItem(key, value) { if (key === 'zepimon-v1') watchState = clone(value); else watchKeys.set(key, clone(value)) }
    },
    // Zepp OS runs the app's lifecycle on the app itself, which carries the options' properties, while getApp()._options
    // is the options object: the two share globalData, which ZML relies on to hand its messaging to screens.
    App: definition => { watchOptions = definition; watchApp = { ...definition } }, getApp: () => ({ _options: watchOptions })
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
  source('page/saved.js', watch, ['JOURNAL_KEY', 'ACTIVE_KEY', 'NEXT_KEY', 'readKey', 'readActive', 'readNext', 'nextEgg', 'phoneAdventure', 'withPlan', 'PHONE_RUNS_KEY', 'readPhoneRuns', 'withReceivedRuns', 'withShared', 'withoutPending', 'companionApp'])
  source('app.js', watch)
  source('app-side/index.js', phone)
  phoneService.onInit()
  watchApp.onCreate()
  const drain = async () => { for (let i = 0; i < 24; i++) await new Promise(setImmediate) }
  // The first sync waits a second, so the title screen draws first.
  await drain()
  assert.notEqual(watchApp.syncTimer, undefined, 'Opening the app waits before its own sync, so the title screen draws first')
  await new Promise(resolve => setTimeout(resolve, 1050))
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
    expedition: { seed: 345, startedAt: 1000, meters: 27000 },
    recent: [{ ...normal, meters: 3100, finishedAt: '2026-10-14T02:00:00.000Z', form: 'Egg', route: 0 },
      { ...normal, form: 'Bulbasaur', elapsedSeconds: 3600, route: 0 }]
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
  assert.equal(saved().appVersion, '1.13', 'The watch app version travels with the snapshot for Zepimon mobile')
  assert.equal(saved().appVersionCode, 44, 'So does its whole-number version code')
  assert.deepEqual(saved().recent.map(item => item.meters), [3100, 5200], 'Both Bulbasaur adventures reach the phone, not just the latest')

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
    value => { value.dex = JSON.parse('{"__proto__": {}}') },
    value => { value.recent = [{ meters: 10, steps: 1, finishedAt: '2026-10-15T02:00:00.000Z' }] },
    value => { value.recent = Array.from({ length: 51 }, () => ({ ...value.records[0], route: 0 })) }]) {
    const value = saved(); mutation(value)
    assert.throws(() => phone.validateSnapshot(value))
  }
  for (const appVersion of ['', '<b>1.13</b>', 113, 'x'.repeat(33)]) {
    assert.equal(phone.validateSnapshot({ ...saved(), appVersion }).appVersion, undefined, 'An unreadable app version is left out, not a failed sync')
  }
  for (const appVersionCode of [-1, 4.5, '44', null]) {
    assert.equal(phone.validateSnapshot({ ...saved(), appVersionCode }).appVersionCode, undefined, 'An unreadable version code is left out too')
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
  assert.match(texts(render()), /^Watch app 1\.13 \(build 44\)$/m, 'Zepp shows the synced watch app version and its version code')

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

  // The watch asks Zepp for the phone's plan and keeps the newest one for the title screen.
  phoneStorage.set(ui.CLOUD_TOKEN_KEY, 'c'.repeat(64))
  const sharedPlan = { egg: { family: ['Charmander', 'Charmeleon', 'Charizard'], mega: null }, eggAt: 40, phone: null, updatedAt: 50 }
  const phoneRun = (id, seq) => ({ id, seq, family: ['Charmander', 'Charmeleon', 'Charizard'], record: { meters: 10400, steps: 0,
    shiny: false, activity: 'running', finishedAt: '2026-10-20T03:00:00.000Z', startedAt: 1000, elapsedSeconds: 3700, form: 'Charmeleon' } })
  let cloudCalls = 0
  const runRequests = []
  phone.fetch = async request => {
    cloudCalls++
    if (/zepimon_get_phone_runs$/.test(request.url)) {
      runRequests.push(JSON.parse(request.body))
      return { status: 200, body: JSON.stringify({ runs: runRequests.length === 1 ? [phoneRun('phone-1', 7), { id: 'unreadable', seq: 8 }] : [] }) }
    }
    return { status: 200, body: JSON.stringify({ plan: sharedPlan }) }
  }
  let planNote
  watchApp.fetchPlan(next => { planNote = next })
  await drain()
  assert.equal(cloudCalls, 2, 'The plan and the phone adventures are read together')
  assert.equal(planNote.plan.egg.family[0], 'Charmander')
  assert.equal(watchKeys.get('zepimon-next').plan.updatedAt, 50, 'The plan is kept for the title screen')
  assert.equal(runRequests[0].after, 0)
  assert.deepEqual(watchKeys.get('zepimon-phone-runs').pending.map(run => run.id), ['phone-1'],
    'Phone adventures wait for the adventure screen, and one the watch cannot read is skipped')
  assert.equal(watchKeys.get('zepimon-phone-runs').after, 7)
  planNote = 'unchanged'
  watchApp.fetchPlan(next => { planNote = next })
  await drain()
  assert.equal(planNote, undefined, 'The same plan again changes nothing')
  assert.equal(runRequests[1].after, 7, 'The watch asks only for adventures after the last one it received')
  assert.equal(watchKeys.get('zepimon-phone-runs').pending.length, 1)
  phone.fetch = async () => { throw new Error('Offline') }
  watchApp.fetchPlan(next => { planNote = next })
  await drain()
  assert.equal(watchKeys.get('zepimon-next').plan.updatedAt, 50, 'Offline, the watch keeps its last plan')

  // The shared adventure: the watch shares its own, keeps the one the cloud answers with, and an undelivered share
  // goes out with the next plan request. The Zepimon page in Zepp shows it.
  const onWatch = { id: 'adv-9000', family: ['Charmander', 'Charmeleon', 'Charizard'], mega: 'Mega Charizard X', shiny: false,
    activity: 'walking', startedAt: 9000, device: 'watch', deviceAt: 9000, meters: 5400, hatchSeconds: 2100, at: Date.now() - 60000, ended: false }
  const cloudCalls2 = []
  let cloudAdventure = null
  phone.fetch = async request => {
    const body = JSON.parse(request.body)
    cloudCalls2.push(request.url.replace(/.*\/rpc\//, ''))
    if (/zepimon_watch_share_adventure$/.test(request.url)) { cloudAdventure = body.adventure; return { status: 200, body: JSON.stringify({ adventure: cloudAdventure }) } }
    if (/zepimon_get_phone_runs$/.test(request.url)) return { status: 200, body: JSON.stringify({ runs: [] }) }
    return { status: 200, body: JSON.stringify({ plan: sharedPlan, adventure: cloudAdventure }) }
  }
  let current = 'none'
  watchApp.shareAdventure(onWatch, value => { current = value })
  await drain()
  assert.equal(current.meters, 5400, 'The watch gets the shared adventure back')
  assert.equal(watchKeys.get('zepimon-next').pendingShare, null, 'A delivered share is not kept waiting')
  assert.equal(watchKeys.get('zepimon-next').adventure.id, 'adv-9000')
  assert.equal(JSON.parse(phoneStorage.get(ui.SHARED_KEY)).adventure.device, 'watch', 'Zepp keeps it for the Zepimon page')
  let page = texts(render())
  assert.match(page, /ADVENTURE/)
  assert.match(page, /Charmander/)
  assert.match(page, /Walking · 5\.40 km · recording on your watch/)
  // Screens reach the companion through getApp()._options, which is not the app the messaging started on.
  // companionApp finds that app through globalData, so a share from the adventure screen reaches Zepp.
  assert.notEqual(watchOptions, watchApp)
  assert.equal(watch.companionApp(), watchApp, 'Screens reach the app that holds the messaging')
  current = 'none'
  watch.companionApp().shareAdventure({ ...onWatch, meters: 5450, at: Date.now() }, value => { current = value })
  await drain()
  assert.equal(current.meters, 5450, 'A share from a screen reaches Zepp and comes back from the cloud')
  assert.equal(JSON.parse(phoneStorage.get(ui.SHARED_KEY)).adventure.meters, 5450, 'and the Zepimon page in Zepp shows it')
  assert.equal(phoneStorage.get(ui.SHARED_REQUEST_KEY) > 0, true, 'Opening the page asks Zepp for a fresh copy')
  // Offline, the share waits and goes out first with the next plan request.
  connected = false
  watchApp.shareAdventure({ ...onWatch, meters: 6000, at: Date.now() })
  await drain()
  assert.equal(watchKeys.get('zepimon-next').pendingShare.meters, 6000)
  connected = true
  cloudCalls2.length = 0
  watchApp.fetchPlan(() => {})
  await drain()
  assert.equal(cloudCalls2[0], 'zepimon_watch_share_adventure', 'The waiting share is sent first')
  assert.equal(watchKeys.get('zepimon-next').pendingShare, null)
  assert.equal(watchKeys.get('zepimon-next').adventure.meters, 6000)
  // The phone takes it over: the next plan request brings that back.
  cloudAdventure = { ...cloudAdventure, device: 'phone', deviceAt: 20000, meters: 6100 }
  watchApp.fetchPlan(() => {})
  await drain()
  assert.equal(watchKeys.get('zepimon-next').adventure.device, 'phone')
  page = texts(render())
  assert.match(page, /recording on your phone/)
  assert.match(page, /tap Continue here on your watch/)
  // If the cloud cannot be reached, Zepp still shows the watch's adventure, and says why it was not shared.
  const reachable = phone.fetch
  phone.fetch = async () => { throw new Error('Network request failed') }
  phoneStorage.set(ui.SHARED_KEY, '{}')
  watchApp.shareAdventure({ ...onWatch, id: 'adv-9500', startedAt: 9500, deviceAt: 9500, meters: 120, at: Date.now() })
  await drain()
  page = texts(render())
  assert.match(page, /0\.12 km · recording on your watch/, 'The page shows what the watch sent')
  assert.match(page, /Could not reach your Zepimon account: Network request failed/)
  assert.equal(watchKeys.get('zepimon-next').pendingShare.id, 'adv-9500', 'The share waits for the next try')
  phone.fetch = reachable
  // Without any share (an older watch app), the page shows the adventure from the last watch sync.
  const syncedBefore = phoneStorage.get(phone.SNAPSHOT_KEY)
  phoneStorage.set(ui.SHARED_KEY, '{}')
  phoneStorage.set(phone.SNAPSHOT_KEY, JSON.stringify({ schemaVersion: 1, capturedAt: 5, dex: {}, records: {}, receivedAt: Date.now(),
    active: { route: 0, meters: 2500, steps: 3000, shiny: false, activity: 'running', startedAt: 1 } }))
  page = texts(render())
  assert.match(page, /Bulbasaur egg/)
  assert.match(page, /Running · 2\.50 km · recording on your watch/)
  assert.match(page, /As of the last watch sync/)
  phoneStorage.set(phone.SNAPSHOT_KEY, syncedBefore)
  // An adventure the phone starts reaches the page when it opens again later, or on Refresh.
  cloudAdventure = { ...onWatch, id: 'adv-9900', startedAt: 9900, device: 'phone', deviceAt: 9900, meters: 300, at: Date.now() }
  settingsPage.sharedAskedAt = Date.now()
  render()
  await drain()
  assert.doesNotMatch(texts(render()), /recording on your phone/, 'Within 20 seconds the page does not ask again by itself')
  click(render(), 'Refresh')
  await drain()
  page = texts(render())
  assert.match(page, /Walking · 0\.30 km · recording on your phone/)
  assert.match(page, /Checked /)
  cloudAdventure = { ...cloudAdventure, meters: 900, at: Date.now() }
  settingsPage.sharedAskedAt = Date.now() - 30000
  render()
  await drain()
  assert.match(texts(render()), /0\.90 km · recording on your phone/, 'Opening the page again later asks for a fresh copy')
  // The plan reply stays small: phone adventures come in their own requests, ten at a time, until the watch catches up.
  const backlog = Array.from({ length: 25 }, (_, i) => phoneRun('phone-b' + i, 100 + i))
  phone.fetch = async request => {
    const body = JSON.parse(request.body)
    if (/zepimon_get_phone_runs$/.test(request.url)) return { status: 200, body: JSON.stringify({ runs: backlog.filter(run => run.seq > body.after).slice(0, 30) }) }
    return { status: 200, body: JSON.stringify({ plan: sharedPlan, adventure: cloudAdventure }) }
  }
  watchKeys.set('zepimon-phone-runs', { after: 99, pending: [] })
  watchApp.fetchPlan(() => {})
  await drain()
  assert.equal(watchKeys.get('zepimon-phone-runs').pending.length, 10)
  assert.equal(watchKeys.get('zepimon-phone-runs').after, 109)
  watchApp.fetchPlan(() => {})
  await drain()
  watchApp.fetchPlan(() => {})
  await drain()
  assert.equal(watchKeys.get('zepimon-phone-runs').pending.length, 25, 'Each visit brings the next ones')
  assert.equal(watchKeys.get('zepimon-phone-runs').after, 124)
  watchKeys.delete('zepimon-phone-runs')
  phoneStorage.set(ui.CLOUD_TOKEN_KEY, '')

  // Sync sends the journal as stored and never rewrites it: the adventure screen repairs old Dex records when it
  // opens, so the app entry does not have to load the Pokemon catalog (see adventure.cjs).
  const watchBeforeRepair = clone(watchState)
  watchState.dex.Bulbasaur = { ...normal, meters: 0, steps: 0 }
  watchApp.syncToPhone()
  await drain()
  assert.equal(saved().dex.Bulbasaur.meters, 0)
  assert.equal(watchState.dex.Bulbasaur.meters, 0, 'Syncing never rewrites the watch journal')
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
