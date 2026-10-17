import { BaseApp } from '@zeppos/zml/base/base-app'
import { appPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/app'
import { LocalStorage } from '@zos/storage'
import { connectStatus } from '@zos/ble'
import { makeSnapshot } from './shared/companion'
import { repairDexRecords } from './page/pokemon'

// Pin ZML to the API 3.0 implementation used by Bip 5 Unity.
BaseApp.use(appPlugin)
const companion = BaseApp({
  globalData: {},
  onCreate() { this.syncToPhone() },
  snapshot() {
    const storage = new LocalStorage()
    const state = storage.getItem('zepimon-v1') || { dex: {}, records: {}, active: null }
    if (repairDexRecords(state)) storage.setItem('zepimon-v1', state)
    return makeSnapshot(state)
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
    try { companion.onDestroy.apply(this, args) }
    catch (error) { console.log('Zepimon companion close:', String(error)) }
  }
})
