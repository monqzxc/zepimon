import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal, km, duration, averagePace, dexEntries, recordForm,
  hasAcquisitionDistance, personalBests, receiveCloudJournal } from '../src/journal.ts';

const finishedAt = '2026-10-16T12:00:00.000Z';
const record = (overrides = {}) => ({ meters: 5500, steps: 7000, finishedAt, shiny: false, ...overrides });
const envelope = () => ({
  exportVersion: 1, app: 'Zepimon', exportedAt: finishedAt, receivedAt: 200000,
  routes: [['Bulbasaur', 'Ivysaur', 'Venusaur'], ['Charmander', 'Charmeleon', 'Charizard']],
  snapshot: { schemaVersion: 1, capturedAt: 100000,
    dex: { Bulbasaur: record(), 'Shiny Bulbasaur': record({ shiny: true, meters: 6000 }) },
    records: { 0: record() }, active: null },
});
const parse = (value, current) => parseJournal(JSON.stringify(value), current);

test('cloud sync preserves local discoveries, rejects mixed accounts and keeps newer offline progress', () => {
  const current = parse(envelope());
  const incoming = envelope();
  incoming.snapshot.capturedAt++;
  incoming.snapshot.dex = { Charmander: record() };
  const result = receiveCloudJournal(JSON.stringify(incoming), current, null, 'account-a');
  assert.ok(result.snapshot.dex.Bulbasaur);
  assert.ok(result.snapshot.dex['Shiny Bulbasaur']);
  assert.ok(result.snapshot.dex.Charmander);
  assert.equal(receiveCloudJournal(JSON.stringify(envelope()), result, 'account-a', 'account-a'), result);
  assert.throws(() => receiveCloudJournal(JSON.stringify(incoming), current, 'account-a', 'account-b'), /another account/);
  assert.throws(() => receiveCloudJournal('{"snapshot":null}', current, null, 'account-a'));
});

test('imports and sanitizes the current watch export, including separate variants', () => {
  const value = envelope();
  value.untrustedExtra = { constructor: 'discard' };
  value.snapshot.extra = 'discard';
  value.snapshot.dex.Bulbasaur.internal = 'discard';
  value.snapshot.dex.Bulbasaur.shiny = true;
  value.snapshot.active = { route: 1, meters: 1000, steps: 1500, shiny: false,
    startedAt: 90000, lastMeters: 8000, day: 'internal' };
  const before = JSON.stringify(value);
  const journal = parse(value);
  assert.equal(journal.snapshot.dex.Bulbasaur.shiny, false);
  assert.equal(journal.snapshot.dex['Shiny Bulbasaur'].shiny, true);
  assert.equal(journal.untrustedExtra, undefined);
  assert.equal(journal.snapshot.extra, undefined);
  assert.equal(journal.snapshot.dex.Bulbasaur.internal, undefined);
  assert.equal(journal.snapshot.active.lastMeters, undefined);
  assert.equal(journal.snapshot.active.day, undefined);
  assert.equal(JSON.stringify(value), before);
  assert.deepEqual(dexEntries(journal).map(({ name, normal, shiny }) =>
    [name, normal.meters, shiny.meters]), [['Bulbasaur', 5500, 6000]]);
});

test('keeps the watch app version and version code from a sync, and none from older watch builds or unreadable values', () => {
  assert.equal(parse(envelope()).snapshot.appVersion, undefined);
  assert.equal(parse(envelope()).snapshot.appVersionCode, undefined);
  const value = envelope();
  value.snapshot.appVersion = '1.13';
  value.snapshot.appVersionCode = 44;
  const current = parse(value);
  assert.equal(current.snapshot.appVersion, '1.13');
  assert.equal(current.snapshot.appVersionCode, 44);
  const incoming = envelope();
  incoming.snapshot.capturedAt++;
  incoming.snapshot.appVersion = '1.14';
  incoming.snapshot.appVersionCode = 45;
  const received = receiveCloudJournal(JSON.stringify(incoming), current, null, 'account-a');
  assert.deepEqual([received.snapshot.appVersion, received.snapshot.appVersionCode], ['1.14', 45]);
  value.snapshot.appVersion = '<b>1.13</b>';
  value.snapshot.appVersionCode = '44';
  assert.equal(parse(value).snapshot.appVersion, undefined);
  assert.equal(parse(value).snapshot.appVersionCode, undefined);
});

test('keeps legacy timing unavailable and optional personal bests absent', () => {
  const value = envelope();
  value.receivedAt = null;
  const journal = parse(value);
  assert.equal(journal.snapshot.personalBests, undefined);
  assert.equal(journal.snapshot.records[0].elapsedSeconds, undefined);
  assert.equal(journal.snapshot.records[0].activity, undefined);
  assert.equal(duration(journal.snapshot.records[0].elapsedSeconds), '--:--:--');
  assert.equal(averagePace(undefined, 5500), '--:-- /km');
});

test('round-trips walking and running across records, Dex, active adventure and personal bests', () => {
  const value = envelope();
  value.snapshot.records[0].activity = 'walking';
  value.snapshot.dex.Bulbasaur.activity = 'walking';
  value.snapshot.dex['Shiny Bulbasaur'].activity = 'running';
  value.snapshot.active = { route: 1, meters: 1000, steps: 1500, shiny: false, activity: 'running' };
  value.snapshot.personalBests = { distance: { ...record({ activity: 'running' }), route: 1 } };
  const journal = parse(value);
  assert.equal(journal.snapshot.records[0].activity, 'walking');
  assert.equal(journal.snapshot.dex.Bulbasaur.activity, 'walking');
  assert.equal(journal.snapshot.dex['Shiny Bulbasaur'].activity, 'running');
  assert.equal(journal.snapshot.active.activity, 'running');
  assert.equal(journal.snapshot.personalBests.distance.activity, 'running');
  assert.deepEqual(parse(journal), journal);

  for (const select of [value => value.snapshot.records[0], value => value.snapshot.dex.Bulbasaur,
    value => value.snapshot.active, value => value.snapshot.personalBests.distance]) {
    for (const activity of ['cycling', '', 1, false, {}]) {
      const invalid = structuredClone(value);
      select(invalid).activity = activity;
      assert.throws(() => parse(invalid), /Invalid activity/);
    }
    const absent = structuredClone(value);
    select(absent).activity = null;
    assert.equal(select(parse(absent)).activity, undefined);
  }
});

test('rejects malformed JSON, oversized UTF-8 content, wrong envelopes and dates', () => {
  assert.throws(() => parseJournal('{broken'), /JSON/);
  assert.throws(() => parseJournal(' '.repeat(2 * 1024 * 1024 + 1)), /2 MB/);
  const unicode = envelope();
  unicode.extra = '😀'.repeat(530000);
  const text = JSON.stringify(unicode);
  assert.ok(text.length < 2 * 1024 * 1024);
  assert.throws(() => parseJournal(text), /2 MB/);
  for (const change of [
    (value) => { value.exportVersion = 2; },
    (value) => { value.app = 'Other'; },
    (value) => { value.exportedAt = 'not a date'; },
    (value) => { value.receivedAt = '200000'; },
    (value) => { value.receivedAt = 9e15; },
    (value) => { value.snapshot.schemaVersion = 2; },
    (value) => { value.snapshot.capturedAt = 9e15; },
    (value) => { value.snapshot.records[0].startedAt = 9e15; },
  ]) {
    const value = envelope(); change(value);
    assert.throws(() => parse(value));
  }
});

test('rejects unsafe names and invalid or missing route references', () => {
  for (const change of [
    (value) => { value.routes = []; },
    (value) => { value.routes[0] = []; },
    (value) => { value.routes[0] = ['Bulbasaur', 'Bulbasaur']; },
    (value) => { value.routes[0] = ['__proto__']; },
    (value) => { value.routes[0] = ['Bulba\u0000saur']; },
    (value) => { value.routes[0] = [' Bulbasaur']; },
    (value) => { value.snapshot.dex = JSON.parse('{"__proto__":{}}'); },
    (value) => { value.snapshot.dex = { 'Shiny constructor': record() }; },
    (value) => { value.snapshot.records[2] = record(); },
    (value) => { value.snapshot.records['01'] = record(); },
    (value) => { value.snapshot.active = { ...record(), route: 2 }; },
    (value) => { value.snapshot.personalBests = { distance: { ...record(), route: 2 } }; },
    (value) => { value.snapshot.records[0].meters = -1; },
    (value) => { value.snapshot.records[0].steps = 1.5; },
    (value) => { value.snapshot.records[0].form = 'Bad\nname'; },
  ]) {
    const value = envelope(); change(value);
    assert.throws(() => parse(value));
  }
});

test('rejects older snapshots without replacing the saved journal; equal reimports work', () => {
  const current = parse(envelope());
  const before = JSON.stringify(current);
  const older = envelope();
  older.snapshot.capturedAt--;
  older.exportedAt = '2026-10-17T12:00:00.000Z';
  assert.throws(() => parse(older, current), /older/);
  assert.equal(JSON.stringify(current), before);
  assert.deepEqual(parse(envelope(), current), current);
  const newer = envelope();
  newer.snapshot.capturedAt++;
  assert.equal(parse(newer, current).snapshot.capturedAt, 100001);
});

test('uses imported routes and earned stages, with explicit compatible Mega variants', () => {
  const imported = envelope();
  imported.routes.reverse();
  const journal = parse(imported);
  const route = journal.routes[0];
  for (const [meters, expected] of [[0, 'Egg'], [4999, 'Egg'], [5000, 'Charmander'],
    [10000, 'Charmeleon'], [15000, 'Charizard']]) {
    assert.equal(recordForm(route, { meters }), expected);
  }
  assert.equal(recordForm(route, { meters: 5000, form: 'Charizard' }), 'Charmander');
  assert.equal(recordForm(route, { meters: 20999, mega: 'Mega Charizard Y' }), 'Charizard');
  assert.equal(recordForm(route, { meters: 21000, mega: 'Mega Charizard Y' }), 'Mega Charizard Y');
  assert.equal(recordForm(route, { meters: 21000, form: 'Mega Charizard X' }), 'Mega Charizard X');
  assert.equal(recordForm(route, { meters: 21000, form: 'Mega Venusaur' }), 'Charizard');
  assert.equal(recordForm(route, { meters: 21000 }), 'Charizard', 'Do not invent an unknown Mega selection');
  assert.equal(recordForm([], { meters: 10000 }), 'Egg');
});

test('recognizes damaged Dex distances without rejecting valid overlapping legacy routes', () => {
  const routes = [...envelope().routes, ['Pichu', 'Pikachu', 'Raichu'], ['Pikachu', 'Raichu']];
  assert.equal(hasAcquisitionDistance('Bulbasaur', record({ meters: 0 }), routes), false);
  assert.equal(hasAcquisitionDistance('Shiny Venusaur', record({ meters: 5500 }), routes), false);
  assert.equal(hasAcquisitionDistance('Venusaur', record({ meters: 15000 }), routes), true);
  assert.equal(hasAcquisitionDistance('Pikachu', record({ meters: 5000 }), routes), true);
  assert.equal(hasAcquisitionDistance('Raichu', record({ meters: 10000 }), routes), true);
  assert.equal(hasAcquisitionDistance('Mega Charizard Y', record({ meters: 20999 }), routes), false);
  assert.equal(hasAcquisitionDistance('Mega Charizard Y', record({ meters: 21000 }), routes), true);
  assert.equal(hasAcquisitionDistance('Unknown', record(), routes), false);
  assert.equal(hasAcquisitionDistance('Bulbasaur', undefined, routes), false);
});

test('personal bests preserve saved winners and stable ties without summing duplicate Dex entries', () => {
  const value = envelope();
  value.snapshot.records = {
    0: record({ meters: 6000, elapsedSeconds: 7200, hatchSeconds: 3000 }),
    1: record({ meters: 21000, elapsedSeconds: 4000, hatchSeconds: 2000, shiny: true, form: 'Mega Charizard Y' }),
  };
  value.snapshot.personalBests = {
    distance: { ...record({ meters: 30000, elapsedSeconds: 5000 }), route: 0 },
    hatch: { ...record({ meters: 5000, elapsedSeconds: 2100, hatchSeconds: 2000 }), route: 0 },
  };
  value.snapshot.active = { route: 0, meters: 999999, steps: 999999, startedAt: 0, shiny: false };
  const journal = parse(value);
  const before = JSON.stringify(journal);
  const bests = personalBests(journal);
  assert.equal(bests.distance.meters, 30000);
  assert.equal(bests.elapsed.elapsedSeconds, 7200);
  assert.equal(bests.hatch.route, 0, 'An equal newly observed time preserves the saved winner');
  assert.equal(JSON.stringify(journal), before);
  bests.distance.meters = 1;
  assert.equal(journal.snapshot.personalBests.distance.meters, 30000);
  assert.equal(personalBests(parse(envelope())).elapsed, undefined);
  assert.equal(personalBests(parse(envelope())).hatch, undefined);
});

test('formats elapsed and average pace without inventing legacy or invalid values', () => {
  assert.equal(km(5500), '5.50 km');
  assert.equal(km(NaN), '-- km');
  assert.equal(duration(360061), '100:01:01');
  assert.equal(duration(0), '00:00:00');
  assert.equal(duration(null), '--:--:--');
  assert.equal(duration(Infinity), '--:--:--');
  assert.equal(averagePace(3599, 10000), '6:00 /km');
  assert.equal(averagePace(5, Number.MIN_VALUE), '--:-- /km');
  assert.equal(averagePace(10, 0), '--:-- /km');
});
