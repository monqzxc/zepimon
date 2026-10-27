const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

// The real phone-adventure check, from its own sandbox; snapshots and plans pass through unchecked here.
const companion = vm.createContext({ validateExpedition: value => value })
vm.runInContext(fs.readFileSync('shared/companion.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, ''), companion)

function setup(fetcher) {
  const values = new Map()
  const context = vm.createContext({ setTimeout, clearTimeout,
    cloudConfig: { url: 'https://test.supabase.co', key: 'sb_publishable_test' }, routes: [['Bulbasaur']],
    fetch: fetcher, SNAPSHOT_KEY: 'snapshot', SYNC_FRAME_KEY: 'frame', validateSnapshot: value => value, validatePlan: value => value,
    validatePhoneRuns: companion.validatePhoneRuns, validateAdventure: companion.validateAdventure })
  vm.runInContext(fs.readFileSync('shared/cloud.js', 'utf8').replace(/^import .*\r?\n/gm, '').replace(/export /g, '') +
    '\nglobalThis.serviceMethods = cloudMethods; globalThis.keys = { CLOUD_TOKEN_KEY, CLOUD_REQUEST_KEY, CLOUD_STATUS_KEY, CLOUD_SENT_KEY };', context)
  const service = { ...context.serviceMethods, settings: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } }
  const snapshot = time => JSON.stringify({ schemaVersion: 1, capturedAt: time, dex: {}, records: {}, active: null })
  return { service, values, keys: context.keys, snapshot }
}

test('offline upload persists latest journal; retry accepts parsed or string responses and sends no user session', async () => {
  let online = false
  const calls = []
  const { service, values, keys, snapshot } = setup(async request => {
    calls.push(request)
    if (!online) throw new Error('Offline')
    return { status: 200, body: JSON.stringify({ accepted: true }) }
  })
  values.set(keys.CLOUD_TOKEN_KEY, 'a'.repeat(64))
  values.set('snapshot', snapshot(1000))
  await service.uploadCloud()
  assert.equal(values.has(keys.CLOUD_SENT_KEY), false)
  assert.equal(JSON.parse(values.get('snapshot')).capturedAt, 1000)
  assert.match(values.get(keys.CLOUD_STATUS_KEY), /saved here/)
  online = true
  await service.uploadCloud()
  assert.equal(values.get(keys.CLOUD_SENT_KEY), '1000')
  assert.equal(calls[1].headers.Authorization, undefined)
  assert.equal(JSON.parse(calls[1].body).upload_token, 'a'.repeat(64))
  assert.equal(JSON.parse(calls[1].body).journal.app, 'Zepimon')
  await service.uploadCloud()
  assert.equal(calls.length, 2, 'Already uploaded snapshots should not be uploaded repeatedly')
})

test('a newer watch snapshot arriving during upload is sent next', async () => {
  let finish
  const times = []
  const { service, values, keys, snapshot } = setup(request => {
    times.push(JSON.parse(request.body).journal.snapshot.capturedAt)
    if (times.length === 1) return new Promise(resolve => { finish = resolve })
    return Promise.resolve({ status: 200, body: { accepted: true } })
  })
  values.set(keys.CLOUD_TOKEN_KEY, 'a'.repeat(64))
  values.set('snapshot', snapshot(1000))
  const first = service.uploadCloud()
  values.set('snapshot', snapshot(2000))
  await service.uploadCloud()
  finish({ status: 200, body: { accepted: true } })
  await first
  await new Promise(setImmediate)
  assert.deepEqual(times, [1000, 2000])
  assert.equal(values.get(keys.CLOUD_SENT_KEY), '2000')
})

test('link claims replace token; stopping uploads during an in-flight request cannot mark it synced', async () => {
  let finish
  const { service, values, keys, snapshot } = setup(request => {
    if (request.url.endsWith('zepimon_claim_link')) return Promise.resolve({ status: 200, body: { token: 'b'.repeat(64) } })
    return new Promise(resolve => { finish = resolve })
  })
  values.set(keys.CLOUD_REQUEST_KEY, JSON.stringify({ action: 'link', code: 'code' }))
  await service.cloudRequest()
  assert.equal(values.get(keys.CLOUD_TOKEN_KEY), 'b'.repeat(64))
  assert.equal(values.get(keys.CLOUD_REQUEST_KEY), '')
  values.set('snapshot', snapshot(1000))
  const uploading = service.uploadCloud()
  values.set(keys.CLOUD_REQUEST_KEY, JSON.stringify({ action: 'stop' }))
  await service.cloudRequest()
  finish({ status: 200, body: { accepted: true } })
  await uploading
  assert.equal(values.get(keys.CLOUD_TOKEN_KEY), '')
  assert.equal(values.get(keys.CLOUD_SENT_KEY), '')
  assert.match(values.get(keys.CLOUD_STATUS_KEY), /Uploads stopped/)
})

test('revoked-token and rejected JSON responses preserve retryable progress', async () => {
  const { service, values, keys, snapshot } = setup(async () => ({ status: 400, body: { code: 'P0001', message: 'Watch link expired. Link again.' } }))
  values.set(keys.CLOUD_TOKEN_KEY, 'a'.repeat(64))
  values.set('snapshot', snapshot(1000))
  await service.uploadCloud()
  assert.equal(values.has(keys.CLOUD_SENT_KEY), false)
  assert.match(values.get(keys.CLOUD_STATUS_KEY), /Link again/)
})

test('the watch reads the phone plan with its upload token, and only once linked', async () => {
  const calls = []
  const { service, values, keys } = setup(async request => {
    calls.push(request)
    return { status: 200, body: JSON.stringify({ plan: { egg: null, eggAt: 0, phone: null, updatedAt: 5 } }) }
  })
  assert.equal(await service.fetchPlan(), null, 'An unlinked watch asks for nothing')
  assert.equal(calls.length, 0)
  values.set(keys.CLOUD_TOKEN_KEY, 'b'.repeat(64))
  assert.equal((await service.fetchPlan()).updatedAt, 5)
  assert.match(calls[0].url, /\/rpc\/zepimon_get_plan$/)
  assert.deepEqual(JSON.parse(calls[0].body), { upload_token: 'b'.repeat(64) })
})

test('the watch reads phone adventures after the last one it received, skipping any it cannot read', async () => {
  const calls = []
  const run = { id: 'phone-1', seq: 9, family: ['Eevee', 'Vaporeon'], record: { meters: 5400, steps: 0, shiny: false, finishedAt: '2026-10-20T03:00:00.000Z' } }
  const { service, values, keys } = setup(async request => {
    calls.push(request)
    return { status: 200, body: JSON.stringify({ runs: [run, { ...run, id: 'no spaces allowed' }, { ...run, id: 'phone-2', record: { meters: -1 } }] }) }
  })
  assert.equal((await service.fetchPhoneRuns(0)).length, 0, 'An unlinked watch asks for nothing')
  assert.equal(calls.length, 0)
  values.set(keys.CLOUD_TOKEN_KEY, 'b'.repeat(64))
  const runs = await service.fetchPhoneRuns(8)
  assert.deepEqual(Array.from(runs, item => item.id), ['phone-1'])
  assert.equal(runs[0].record.meters, 5400)
  assert.match(calls[0].url, /\/rpc\/zepimon_get_phone_runs$/)
  assert.deepEqual(JSON.parse(calls[0].body), { upload_token: 'b'.repeat(64), after: 8 })
  await service.fetchPhoneRuns(undefined)
  assert.equal(JSON.parse(calls[1].body).after, 0, 'A watch that never received one starts from the beginning')
})

test('the watch shares its adventure and reads the shared one with its upload token', async () => {
  const calls = []
  const adventure = { id: 'adv-1', family: ['Eevee'], mega: null, shiny: false, activity: 'running', startedAt: 1, device: 'watch',
    deviceAt: 1, meters: 800, hatchSeconds: null, at: 2, ended: false }
  const { service, values, keys } = setup(async request => {
    calls.push(request)
    return { status: 200, body: JSON.stringify(/share/.test(request.url) ? { adventure: { ...adventure, device: 'phone', deviceAt: 5 } }
      : { plan: null, adventure }) }
  })
  assert.equal(await service.fetchShared(), null, 'An unlinked watch asks for nothing')
  await assert.rejects(service.shareAdventure(adventure), /Link your account/)
  assert.equal(calls.length, 0)
  values.set(keys.CLOUD_TOKEN_KEY, 'b'.repeat(64))
  const shared = await service.fetchShared()
  assert.equal(shared.adventure.meters, 800)
  assert.equal(shared.plan, null)
  const answer = await service.shareAdventure(adventure)
  assert.equal(answer.device, 'phone', 'The answer says who records it now')
  assert.match(calls[1].url, /\/rpc\/zepimon_watch_share_adventure$/)
  assert.deepEqual(JSON.parse(calls[1].body), { upload_token: 'b'.repeat(64), adventure })
  await assert.rejects(service.shareAdventure({ ...adventure, device: 'tablet' }), /Invalid shared adventure/)
  assert.equal(calls.length, 2, 'An invalid adventure is never sent')
})
