import { BaseSideService } from '@zeppos/zml/base/base-side'
import { messagingPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/side'
import { SNAPSHOT_KEY, SYNC_KEY, STATUS_KEY, validateSnapshot } from '../shared/companion'
import { cloudMethods, CLOUD_REQUEST_KEY, CLOUD_STATUS_KEY } from '../shared/cloud'

BaseSideService.use(messagingPlugin)
AppSideService(BaseSideService({
  ...cloudMethods,
  onInit() {
    // A fresh service has nothing in flight, so a leftover "Syncing…" or "Uploading…" means Zepp stopped it mid-way.
    if (/^Syncing/.test(this.settings.getItem(STATUS_KEY) || '')) this.status('Sync was interrupted. Tap Sync from watch to try again.')
    if (/^(Uploading|Linking)/.test(this.settings.getItem(CLOUD_STATUS_KEY) || '')) this.cloudStatus('The last cloud step was interrupted. Tap Retry upload or link again.')
    if (this.pendingSync) { this.pendingSync = false; this.syncFromWatch() }
    if (this.settings.getItem(CLOUD_REQUEST_KEY)) this.cloudRequest()
    else this.uploadCloud()
  },
  status(message) { this.settings.setItem(STATUS_KEY, message) },
  storeSnapshot(value) {
    const snapshot = validateSnapshot(value)
    this.settings.setItem(SNAPSHOT_KEY, JSON.stringify({ ...snapshot, receivedAt: Date.now() }))
    this.status('Synced with your watch')
    this.uploadCloud()
  },
  onRequest(request, reply) {
    // The watch asks for the phone's plan when its title screen opens. Offline or unlinked, it keeps its last copy.
    if (request.method === 'zepimon.plan.get') {
      this.fetchPlan().then((plan) => reply(null, { plan }), () => reply(null, { plan: null }))
      return
    }
    if (request.method !== 'zepimon.snapshot.put') { reply({ message: 'Unknown request' }); return }
    try {
      this.storeSnapshot(request.params)
      reply(null, { ok: true })
    } catch (_) {
      this.status('Could not read the update. Your last synced records are still saved.')
      reply({ message: 'Invalid snapshot or phone storage unavailable' })
    }
  },
  onSettingsChange(event) {
    if (event.key === CLOUD_REQUEST_KEY && event.newValue) {
      if (this.messaging) this.cloudRequest()
      return
    }
    if (event.key !== SYNC_KEY || !event.newValue) return
    if (!this.messaging) this.pendingSync = true
    else this.syncFromWatch()
  },
  syncFromWatch() {
    if (this.syncBusy) return
    this.syncBusy = true
    this.spinStart()
    this.status('Syncing… keep Zepimon open on your watch')
    const failed = () => this.status('Open Zepimon on your connected watch, then tap Sync again. Last synced records are kept.')
    const done = () => { this.syncBusy = false; this.spinStop() }
    try {
      return this.request({ method: 'zepimon.snapshot.get' }, { timeout: 15000 })
        .then((snapshot) => this.storeSnapshot(snapshot))
        .catch(failed)
        .finally(done)
    } catch (_) { done(); failed() }
  }
}))
