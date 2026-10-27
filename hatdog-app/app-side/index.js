import { BaseSideService } from '@zeppos/zml/base/base-side'
import { messagingPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/side'
import { SNAPSHOT_KEY, SYNC_KEY, STATUS_KEY, SHARED_KEY, SHARED_REQUEST_KEY, validateAdventure, validateSnapshot } from '../shared/companion'
import { cloudMethods, CLOUD_REQUEST_KEY, CLOUD_STATUS_KEY } from '../shared/cloud'

BaseSideService.use(messagingPlugin)
// Phone adventures sent to the watch per request: each is a few hundred bytes over Bluetooth.
const RUNS_PER_REPLY = 10
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
  // The chosen egg and the shared adventure, kept for the Zepimon page in Zepp.
  keepShared(change) {
    let kept = {}
    try { kept = JSON.parse(this.settings.getItem(SHARED_KEY) || '{}') || {} } catch (_) { kept = {} }
    this.settings.setItem(SHARED_KEY, JSON.stringify({ ...kept, ...change, at: Date.now() }))
  },
  // Why the cloud could not be reached, for the Zepimon page to show ('' once it answers).
  sharedError(error) {
    return 'Could not reach your Zepimon account: ' + (error && error.message ? error.message : 'check the connection.')
  },
  async refreshShared() {
    try {
      const shared = await this.fetchShared()
      if (shared) this.keepShared({ ...shared, error: '' })
      return shared
    } catch (error) {
      this.keepShared({ error: this.sharedError(error) })
      throw error
    }
  },
  // Shares the watch's adventure: the Zepimon page shows it at once, then as the cloud answers (or why it could not).
  async shareFromWatch(value) {
    const adventure = validateAdventure(value)
    this.keepShared({ adventure })
    try {
      const current = await this.shareAdventure(adventure)
      this.keepShared({ adventure: current, error: '' })
      return current
    } catch (error) {
      this.keepShared({ error: this.sharedError(error) })
      throw error
    }
  },
  onRequest(request, reply) {
    // When its title screen opens (and every minute while it shows), the watch sends any share it could not deliver,
    // then asks for the plan and the shared adventure. The reply stays small so it arrives quickly over Bluetooth.
    // Offline or unlinked (ok: false), the watch keeps what it has.
    if (request.method === 'zepimon.plan.get') {
      const params = request.params || {}
      const share = params.share ? this.shareFromWatch(params.share).then(() => true, () => false) : Promise.resolve(false)
      share.then(shared => this.refreshShared().catch(() => null)
        .then(current => reply(null, { ok: !!current, plan: current && current.plan, adventure: current && current.adventure, shared })))
      return
    }
    // Then, on its own, the adventures recorded on the phone since the last one the watch received, a few at a time.
    if (request.method === 'zepimon.runs.get') {
      this.fetchPhoneRuns(request.params && request.params.after)
        .then(runs => reply(null, { ok: true, runs: runs.slice(0, RUNS_PER_REPLY) }), () => reply(null, { ok: false, runs: [] }))
      return
    }
    // The watch shares its adventure as it starts, about once a minute while it records, and when it ends or is taken
    // over. The reply carries the shared adventure, which tells the watch if the phone took it over.
    if (request.method === 'zepimon.adventure.share') {
      this.shareFromWatch(request.params && request.params.adventure)
        .then((adventure) => reply(null, { ok: true, adventure }), () => reply(null, { ok: false }))
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
    // The Zepimon page in Zepp asks for the latest egg and adventure when it opens.
    if (event.key === SHARED_REQUEST_KEY && event.newValue) {
      this.refreshShared().catch(() => {})
      return
    }
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
