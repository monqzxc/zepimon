const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function setup(fetcher) {
  const values = new Map()
  const context = vm.createContext({ setTimeout, clearTimeout,
    cloudConfig: { url: 'https://test.supabase.co', key: 'sb_publishable_test' }, routes: [['Bulbasaur']],
    fetch: fetcher, SNAPSHOT_KEY: 'snapshot', SYNC_FRAME_KEY: 'frame', validateSnapshot: value => value })
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
