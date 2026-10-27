import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const record = { meters: 5100, steps: 6000, shiny: false, finishedAt: '2026-10-19T03:00:00.000Z', elapsedSeconds: 1800, hatchSeconds: 1760 }
const journal = (time = 10000) => ({ app: 'Zepimon', exportVersion: 1, exportedAt: record.finishedAt, receivedAt: time,
  routes: [['Bulbasaur', 'Ivysaur', 'Venusaur']], snapshot: { schemaVersion: 1, capturedAt: time,
    dex: { Bulbasaur: record, 'Shiny Bulbasaur': { ...record, shiny: true } }, records: { 0: record }, active: null } })

test('private cloud journals, one-time links, replay protection, validation and revocation', async t => {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users values ('${alice}'), ('${bob}');`)
  await db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  const role = async (name, uid = '') => {
    await db.exec('reset role; set role ' + name)
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
  }
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value
  const upload = (token, value) => rpc('zepimon_upload', [token, JSON.stringify(value)])
  let token
  await t.test('only a signed-in user creates codes; claim is single-use', async () => {
    await role('anon')
    await assert.rejects(rpc('zepimon_create_link'), /permission denied/)
    await role('authenticated', alice)
    const link = await rpc('zepimon_create_link')
    assert.match(link.code, /^[a-f0-9]{24}$/)
    await role('anon')
    token = (await rpc('zepimon_claim_link', [link.code.match(/.{4}/g).join('-').toUpperCase()])).token
    assert.match(token, /^[a-f0-9]{64}$/)
    await assert.rejects(rpc('zepimon_claim_link', [link.code]), /Invalid or expired/)
  })
  await t.test('upload token cannot read data; users only see their own journal', async () => {
    assert.equal((await upload(token, journal())).accepted, true)
    await assert.rejects(rpc('zepimon_pull'), /permission denied/)
    await assert.rejects(db.query('select * from zepimon_private.links'), /permission denied/)
    await assert.rejects(upload('0'.repeat(64), journal()), /Watch link expired/)
    await role('authenticated', bob)
    assert.equal((await rpc('zepimon_pull')).journal, null)
    await role('authenticated', alice)
    assert.equal((await rpc('zepimon_pull')).journal.snapshot.dex['Shiny Bulbasaur'].shiny, true)
    await assert.rejects(db.query('select * from zepimon_private.journals'), /permission denied/)
  })
  await t.test('the phone shares a plan the watch reads with its upload token, and nothing more', async () => {
    const plan = (updatedAt, extra = {}) => ({ egg: { family: ['Charmander', 'Charmeleon', 'Charizard'], mega: 'Mega Charizard X' },
      eggAt: updatedAt, phone: null, updatedAt, ...extra })
    await role('anon')
    await assert.rejects(rpc('zepimon_set_plan', [JSON.stringify(plan(100))]), /permission denied/)
    assert.equal((await rpc('zepimon_get_plan', [token])).plan, null, 'No plan until the phone shares one')
    await role('authenticated', alice)
    assert.equal((await rpc('zepimon_set_plan', [JSON.stringify(plan(100))])).accepted, true)
    assert.equal((await rpc('zepimon_set_plan', [JSON.stringify(plan(90))])).accepted, false, 'An older plan cannot replace a newer one')
    for (const invalid of [plan(110, { phone: { family: [], activity: 'walking', startedAt: 1 } }),
      plan(110, { egg: { family: ['Eevee', 'Eevee'] } }), plan(110, { phone: { family: ['Eevee'], activity: 'flying', startedAt: 1 } }),
      { ...plan(110), padding: 'x'.repeat(5000) }, { egg: null }]) {
      await assert.rejects(rpc('zepimon_set_plan', [JSON.stringify(invalid)]), /Invalid plan/)
    }
    assert.equal((await rpc('zepimon_pull')).plan.egg.mega, 'Mega Charizard X', 'The phone gets its plan back, e.g. after a reinstall')
    await rpc('zepimon_set_plan', [JSON.stringify(plan(130, { egg: null, phone: { family: ['Pikachu', 'Raichu'], activity: 'running', startedAt: 125 } }))])
    await role('anon')
    const shared = (await rpc('zepimon_get_plan', [token])).plan
    assert.equal(shared.phone.activity, 'running')
    assert.equal(shared.egg, null)
    await assert.rejects(rpc('zepimon_get_plan', ['0'.repeat(64)]), /Watch link expired/)
    await assert.rejects(db.query('select * from zepimon_private.plans'), /permission denied/)
    await role('authenticated', bob)
    assert.equal((await rpc('zepimon_pull')).plan, null, 'Plans are private to their account')
  })
  await t.test('the phone and the watch share one adventure and hand it over', async () => {
    const adventure = (device, deviceAt, at, extra = {}) => ({ id: 'adv-1000', family: ['Pikachu', 'Raichu'], mega: null, shiny: false,
      activity: 'walking', startedAt: 1000, device, deviceAt, meters: 0, hatchSeconds: null, at, ended: false, ...extra })
    const phone = value => rpc('zepimon_share_adventure', [JSON.stringify(value)])
    const watch = value => rpc('zepimon_watch_share_adventure', [token, JSON.stringify(value)])
    await role('anon')
    await assert.rejects(phone(adventure('phone', 1000, 1000)), /permission denied/)
    assert.equal((await rpc('zepimon_get_plan', [token])).adventure, null, 'Nothing shared yet')
    await role('authenticated', alice)
    // The phone starts and reports progress.
    assert.equal((await phone(adventure('phone', 1000, 1000))).adventure.device, 'phone')
    assert.equal((await phone(adventure('phone', 1000, 61000, { meters: 900 }))).adventure.meters, 900)
    assert.equal((await phone(adventure('phone', 1000, 30000, { meters: 500 }))).adventure.meters, 900, 'Older progress is ignored')
    await assert.rejects(phone({ ...adventure('phone', 1000, 1000), device: 'tablet' }), /Invalid adventure/)
    await assert.rejects(phone({ ...adventure('phone', 1000, 1000), family: [] }), /Invalid adventure/)
    // The watch sees it, then takes it over with the distance so far.
    await role('anon')
    assert.equal((await rpc('zepimon_get_plan', [token])).adventure.meters, 900)
    assert.equal((await watch(adventure('watch', 70000, 70000, { meters: 900 }))).adventure.device, 'watch')
    await role('authenticated', alice)
    const told = (await phone(adventure('phone', 1000, 75000, { meters: 1300 }))).adventure
    assert.equal(told.device, 'watch', 'The phone learns the watch took over, and its later progress is ignored')
    assert.equal(told.meters, 900)
    assert.equal((await rpc('zepimon_pull')).adventure.device, 'watch', 'The phone sync carries the shared adventure')
    // The phone takes it back, then finishes it; an ended adventure stays ended.
    assert.equal((await phone(adventure('phone', 90000, 90000, { meters: 1500 }))).adventure.device, 'phone')
    assert.equal((await phone(adventure('phone', 90000, 95000, { meters: 1600, ended: true }))).adventure.ended, true)
    await role('anon')
    assert.equal((await watch(adventure('watch', 99000, 99000, { meters: 1700 }))).adventure.ended, true, 'An ended adventure cannot be taken over')
    // A new adventure replaces an ended one; an older adventure cannot replace a newer one still going.
    const next = { ...adventure('watch', 200000, 200000), id: 'adv-200000', startedAt: 200000, family: ['Eevee'] }
    assert.equal((await watch(next)).adventure.id, 'adv-200000')
    await role('authenticated', alice)
    assert.equal((await phone({ ...adventure('phone', 150000, 150000), id: 'adv-150000', startedAt: 150000 })).adventure.id, 'adv-200000')
    await assert.rejects(db.query('select * from zepimon_private.adventures'), /permission denied/)
    await role('authenticated', bob)
    assert.equal((await rpc('zepimon_pull')).adventure, null, 'Adventures are private to their account')
    await role('anon')
    await assert.rejects(rpc('zepimon_watch_share_adventure', ['0'.repeat(64), JSON.stringify(next)]), /Watch link expired/)
  })
  await t.test('the phone shares its adventures; the watch reads each one once, in arrival order', async () => {
    const run = (id, finishedAt, extra = {}) => ({ id, family: ['Charmander', 'Charmeleon', 'Charizard'],
      record: { meters: 5200, steps: 0, shiny: false, activity: 'walking', finishedAt, startedAt: 1000, elapsedSeconds: 1900, form: 'Charmander' }, ...extra })
    const add = runs => rpc('zepimon_add_phone_runs', [JSON.stringify(runs)])
    const read = after => rpc('zepimon_get_phone_runs', [token, after])
    await role('anon')
    await assert.rejects(add([run('phone-1', '2026-10-20T03:00:00.000Z')]), /permission denied/)
    assert.deepEqual((await read(0)).runs, [], 'Nothing until the phone shares an adventure')
    await role('authenticated', alice)
    assert.deepEqual(await add([run('phone-1', '2026-10-20T03:00:00.000Z'), run('phone-2', '2026-10-21T03:00:00.000Z')]), { added: 2, skipped: 0 })
    assert.deepEqual(await add([run('phone-2', '2026-10-21T03:00:00.000Z'), run('bad id!', '2026-10-21T03:00:00.000Z'),
      run('phone-3', '2026-10-22T03:00:00.000Z', { family: ['Eevee', 'Eevee'] }), run('phone-4', 'not a date')]), { added: 0, skipped: 3 },
    'Sharing again adds nothing, and invalid adventures are skipped')
    await assert.rejects(add(Array.from({ length: 51 }, (_, i) => run('phone-x' + i, '2026-10-20T03:00:00.000Z'))), /Invalid adventures/)
    await role('anon')
    const first = (await read(0)).runs
    assert.deepEqual(first.map(item => item.id), ['phone-1', 'phone-2'])
    assert.equal(first[0].record.meters, 5200)
    await role('authenticated', alice)
    // Shared late, it finished before the others but still arrives after them.
    await add([run('phone-0', '2026-10-19T03:00:00.000Z')])
    await role('anon')
    const later = (await read(first[1].seq)).runs
    assert.deepEqual(later.map(item => item.id), ['phone-0'])
    assert.deepEqual((await read(later[0].seq)).runs, [])
    await assert.rejects(rpc('zepimon_get_phone_runs', ['0'.repeat(64), 0]), /Watch link expired/)
    await assert.rejects(db.query('select * from zepimon_private.phone_runs'), /permission denied/)
    await role('authenticated', bob)
    assert.equal((await add([run('phone-1', '2026-10-20T03:00:00.000Z')])).added, 1, 'Adventures are kept per account')
    await role('authenticated', alice)
    await add(Array.from({ length: 50 }, (_, i) => run('bulk-' + i, '2026-10-23T03:00:00.000Z')))
    for (let batch = 0; batch < 10; batch++) await add(Array.from({ length: 50 }, (_, i) => run(`more-${batch}-${i}`, '2026-10-23T03:00:00.000Z')))
    await role('anon')
    let count = 0
    for (let after = 0, page; (page = (await read(after)).runs).length; after = page[page.length - 1].seq) count += page.length
    assert.equal(count, 500, 'The newest 500 are kept')
  })
  await t.test('older/duplicate snapshots cannot overwrite, missing shiny entries survive watch resets', async () => {
    await role('anon')
    assert.equal((await upload(token, journal(9999))).accepted, false)
    assert.equal((await upload(token, journal())).accepted, false)
    const next = journal(20000)
    next.snapshot.expedition = { seed: 345, startedAt: 1000, meters: 27000 }
    next.snapshot.dex = { Bulbasaur: { ...record, meters: 6500 } }
    next.snapshot.recent = [{ ...record, meters: 3000, hatchSeconds: null, route: 0 }, { ...record, meters: 6500, route: 0 }]
    await upload(token, next)
    await role('authenticated', alice)
    const saved = (await rpc('zepimon_pull')).journal
    assert.deepEqual(saved.snapshot.expedition, next.snapshot.expedition, 'The existing cloud schema retains expedition progress without a migration')
    assert.deepEqual(saved.snapshot.recent, next.snapshot.recent, "The watch's recent adventures pass through without a migration")
    assert.equal(saved.snapshot.dex.Bulbasaur.meters, 6500)
    assert.ok(saved.snapshot.dex['Shiny Bulbasaur'])
  })
  await t.test('invalid, oversized, future-dated journals preserve the previous snapshot', async () => {
    await role('anon')
    for (const mutate of [
      value => { value.snapshot.dex.Bulbasaur = { ...record, meters: -1 } },
      value => { value.snapshot.active = { ...record, route: 5 } },
      value => { value.routes = [['__proto__']] },
      value => { value.snapshot.personalBests = { hatch: { ...record, route: 0, elapsedSeconds: 2 } } },
      value => { value.padding = 'x'.repeat(2097152) }
    ]) {
      const invalid = journal(30000); mutate(invalid)
      await assert.rejects(upload(token, invalid), /Invalid journal/)
    }
    await assert.rejects(upload(token, journal(Date.now() + 86400000)), /clock is ahead/)
    await role('authenticated', alice)
    assert.equal((await rpc('zepimon_pull')).journal.snapshot.capturedAt, 20000)
  })
  await t.test('expired codes fail, replacement revokes old token, unlink also cancels pending codes', async () => {
    const expired = await rpc('zepimon_create_link')
    await role('postgres')
    await db.query("update zepimon_private.links set pair_expires = now() - interval '1 second' where user_id = $1", [alice])
    await role('anon')
    await assert.rejects(rpc('zepimon_claim_link', [expired.code]), /Invalid or expired/)
    await role('authenticated', alice)
    const link = await rpc('zepimon_create_link')
    await role('anon')
    const replacement = (await rpc('zepimon_claim_link', [link.code])).token
    await assert.rejects(upload(token, journal(30000)), /Watch link expired/)
    await upload(replacement, journal(30000))
    await role('authenticated', alice)
    const pending = await rpc('zepimon_create_link')
    await rpc('zepimon_unlink')
    assert.equal((await rpc('zepimon_pull')).linked, false)
    assert.equal((await rpc('zepimon_pull')).journal.snapshot.capturedAt, 30000)
    await role('anon')
    await assert.rejects(upload(replacement, journal(40000)), /Watch link expired/)
    await assert.rejects(rpc('zepimon_claim_link', [pending.code]), /Invalid or expired/)
  })
  await db.close()
})
