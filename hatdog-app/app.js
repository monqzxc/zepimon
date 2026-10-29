import { BaseApp } from '@zeppos/zml/base/base-app'
import { appPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/app'
import { LocalStorage } from '@zos/storage'
import { connectStatus } from '@zos/ble'
import { getPackageInfo } from '@zos/app'
import { makeSnapshot } from './shared/companion'
import { JOURNAL_KEY, NEXT_KEY, PHONE_RUNS_KEY, readActive, readNext, readPhoneRuns, withPlan, withReceivedRuns, withShared, withoutPending } from './page/saved'

// Keep this file free of the Pokemon catalog: everything imported here loads before the first screen can draw.
// The adventure screen repairs old Dex records whenever it opens, so snapshots are sent as stored.
// Pin ZML to the API 3.0 implementation used by Bip 5 Unity.
BaseApp.use(appPlugin)
// This build's version from app.json, version.name and its whole-number version.code, sent with every snapshot so Zepp
// and Zepimon mobile can show it.
function appVersion() {
  try {
    const version = getPackageInfo().version
    return typeof version === 'string' ? { appVersion: version } : version ? { appVersion: version.name, appVersionCode: version.code } : {}
  } catch (_) { return {} }
}
const companion = BaseApp({
  globalData: {},
  // The title screen draws first; the journal goes to the phone a moment later. Screens reach this companion, which
  // holds the messaging, through globalData (companionApp in page/saved.js).
  onCreate() {
    this.globalData.companion = this
    this.syncTimer = setTimeout(() => { this.syncTimer = undefined; this.syncToPhone() }, 1000)
  },
  snapshot() {
    const storage = new LocalStorage()
    const state = storage.getItem(JOURNAL_KEY) || { dex: {}, records: {}, active: null }
    return makeSnapshot({ ...state, active: readActive(storage, state), ...appVersion() })
  },
  syncToPhone() {
    if (this.phoneSyncBusy) { this.phoneSyncAgain = true; return }
    this.phoneSyncBusy = true
    const done = () => {
      this.phoneSyncBusy = false
      if (this.phoneSyncAgain) { this.phoneSyncAgain = false; this.syncToPhone() }
    }
    try {
      if (!connectStatus()) { done(); return }
      this.request({ method: 'zepimon.snapshot.put', params: this.snapshot() }, { timeout: 15000 })
        .then(done, (error) => { console.log('Zepimon phone sync:', String(error)); done() })
    } catch (error) {
      console.log('Zepimon phone sync:', String(error))
      done()
    }
  },
  // Asks Zepp for the plan shared by Zepimon mobile (the chosen egg) and the adventure the watch and phone share, and
  // keeps them for the title screen. done receives the updated next-egg note, or nothing when unchanged; when the
  // phone could not be checked, its second argument says why.
  // A share the watch could not deliver goes first. Then, separately, the adventures recorded on the phone, which
  // wait for the adventure screen to add them to the journal.
  fetchPlan(done = () => {}) {
    try {
      if (!connectStatus()) { done(undefined, 'phone not connected'); return }
      const storage = new LocalStorage()
      const pending = readNext(storage).pendingShare || undefined
      this.request({ method: 'zepimon.plan.get', params: { share: pending } }, { timeout: 15000 }).then((result) => {
        this.fetchPhoneRuns()
        try {
          const before = readNext(storage)
          let next = result && result.shared ? withoutPending(before, pending) : before
          if (result && result.ok) next = withShared(withPlan(next, result.plan), result.adventure)
          const problem = result && result.ok ? undefined : 'no answer from your account'
          if (next === before) { done(undefined, problem); return }
          storage.setItem(NEXT_KEY, next)
          done(next, problem)
        } catch (error) { console.log('Zepimon plan:', String(error)); done(undefined, 'could not read the reply') }
      }, (error) => { console.log('Zepimon plan:', String(error)); done(undefined, 'no answer from Zepp') })
    } catch (error) {
      console.log('Zepimon plan:', String(error))
      done(undefined, 'could not reach Zepp')
    }
  },
  // Adventures recorded on the phone since the last one received, a few per request; the next title visit asks again.
  fetchPhoneRuns() {
    if (this.runsBusy) return
    this.runsBusy = true
    try {
      const storage = new LocalStorage()
      this.request({ method: 'zepimon.runs.get', params: { after: readPhoneRuns(storage).after } }, { timeout: 20000 }).then((result) => {
        this.runsBusy = false
        try {
          const received = readPhoneRuns(storage)
          const runs = withReceivedRuns(received, result && result.runs)
          if (runs !== received) storage.setItem(PHONE_RUNS_KEY, runs)
        } catch (error) { console.log('Zepimon phone adventures:', String(error)) }
      }, () => { this.runsBusy = false })
    } catch (error) {
      this.runsBusy = false
      console.log('Zepimon phone adventures:', String(error))
    }
  },
  // Shares the adventure recorded here (started, progress, taken over or ended) with the phone and Zepp. Until the
  // cloud has it, it waits as pendingShare. done receives the shared adventure as it now stands, or nothing offline.
  shareAdventure(adventure, done = () => {}) {
    try {
      const storage = new LocalStorage()
      storage.setItem(NEXT_KEY, { ...readNext(storage), pendingShare: adventure })
      if (!connectStatus()) { done(); return }
      this.request({ method: 'zepimon.adventure.share', params: { adventure } }, { timeout: 8000 }).then((result) => {
        try {
          if (!result || !result.ok) { done(); return }
          storage.setItem(NEXT_KEY, withShared(withoutPending(readNext(storage), adventure), result.adventure))
          done(result.adventure || null)
        } catch (error) { console.log('Zepimon share:', String(error)); done() }
      }, () => done())
    } catch (error) {
      console.log('Zepimon share:', String(error))
      done()
    }
  },
  onRequest(request, reply) {
    if (request.method !== 'zepimon.snapshot.get') { reply({ message: 'Unknown request' }); return }
    try { reply(null, this.snapshot()) }
    catch (_) { reply({ message: 'Watch records could not be read' }) }
  }
})

App({
  ...companion,
  onCreate(...args) {
    // A Bluetooth failure must not prevent the watch UI from opening.
    try { companion.onCreate.apply(this, args) }
    catch (error) { console.log('Zepimon companion unavailable:', String(error)) }
  },
  onDestroy(...args) {
    this.phoneSyncAgain = false
    if (this.syncTimer !== undefined) clearTimeout(this.syncTimer)
    if (this.globalData && this.globalData.companion === this) this.globalData.companion = null
    try { companion.onDestroy.apply(this, args) }
    catch (error) { console.log('Zepimon companion close:', String(error)) }
  }
})
