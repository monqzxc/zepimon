import { BaseApp } from '@zeppos/zml/base/base-app'
import { appPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/app'
import { LocalStorage } from '@zos/storage'
import { connectStatus } from '@zos/ble'
import { makeSnapshot } from './shared/companion'
import { JOURNAL_KEY, NEXT_KEY, readActive, readNext, withPlan } from './page/saved'

// Keep this file free of the Pokemon catalog: everything imported here loads before the first screen can draw.
// The adventure screen repairs old Dex records whenever it opens, so snapshots are sent as stored.
// Pin ZML to the API 3.0 implementation used by Bip 5 Unity.
BaseApp.use(appPlugin)
const companion = BaseApp({
  globalData: {},
  // The title screen draws first; the journal goes to the phone a moment later.
  onCreate() { this.syncTimer = setTimeout(() => { this.syncTimer = undefined; this.syncToPhone() }, 1000) },
  snapshot() {
    const storage = new LocalStorage()
    const state = storage.getItem(JOURNAL_KEY) || { dex: {}, records: {}, active: null }
    return makeSnapshot({ ...state, active: readActive(storage, state) })
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
  // Asks Zepp for the plan shared by Zepimon mobile (the chosen egg and any adventure the phone is recording) and keeps
  // the newest one for the title screen. done receives the updated next-egg note, or nothing when offline or unchanged.
  fetchPlan(done = () => {}) {
    try {
      if (!connectStatus()) { done(); return }
      this.request({ method: 'zepimon.plan.get' }, { timeout: 8000 }).then((result) => {
        try {
          const storage = new LocalStorage()
          const before = readNext(storage)
          const next = withPlan(before, result && result.plan)
          if (next === before) { done(); return }
          storage.setItem(NEXT_KEY, next)
          done(next)
        } catch (error) { console.log('Zepimon plan:', String(error)); done() }
      }, () => done())
    } catch (error) {
      console.log('Zepimon plan:', String(error))
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
    try { companion.onDestroy.apply(this, args) }
    catch (error) { console.log('Zepimon companion close:', String(error)) }
  }
})
