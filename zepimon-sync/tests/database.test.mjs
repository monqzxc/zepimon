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
  await t.test('older/duplicate snapshots cannot overwrite, missing shiny entries survive watch resets', async () => {
    await role('anon')
    assert.equal((await upload(token, journal(9999))).accepted, false)
    assert.equal((await upload(token, journal())).accepted, false)
    const next = journal(20000)
    next.snapshot.expedition = { seed: 345, startedAt: 1000, meters: 27000 }
    next.snapshot.dex = { Bulbasaur: { ...record, meters: 6500 } }
    await upload(token, next)
    await role('authenticated', alice)
    const saved = (await rpc('zepimon_pull')).journal
    assert.deepEqual(saved.snapshot.expedition, next.snapshot.expedition, 'The existing cloud schema retains expedition progress without a migration')
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
