import { cloudConfig } from './cloud-config'
import { routes } from '../page/catalog'
import { SNAPSHOT_KEY, SYNC_FRAME_KEY, validateAdventure, validatePhoneRuns, validatePlan, validateSnapshot } from './companion'

export const CLOUD_TOKEN_KEY = 'zepimon-cloud-token'
export const CLOUD_REQUEST_KEY = 'zepimon-cloud-request'
export const CLOUD_STATUS_KEY = 'zepimon-cloud-status'
export const CLOUD_SENT_KEY = 'zepimon-cloud-sent'
// When the current account was linked; the settings page uses it to finish "Change account".
export const CLOUD_LINKED_KEY = 'zepimon-cloud-linked-at'

// Zepp's Fetch API uses an options object and returns a parsed body, unlike browser fetch.
export async function cloudRpc(method, body) {
  if (!cloudConfig.url || !cloudConfig.key) throw new Error('Cloud sync is not configured in this version.')
  let timer
  let response
  try {
    response = await Promise.race([
      fetch({ url: cloudConfig.url + '/rest/v1/rpc/' + method, method: 'POST',
        headers: { apikey: cloudConfig.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cloud request timed out.')), 20000) })
    ])
  } finally { clearTimeout(timer) }
  const data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
  if ((response.status !== undefined && (response.status < 200 || response.status >= 300)) || (data && data.message && data.code)) {
    throw new Error(data && data.message ? data.message : 'Cloud sync failed. Try again when online.')
  }
  return data
}

export const cloudMethods = {
  cloudStatus(message) { this.settings.setItem(CLOUD_STATUS_KEY, message) },
  // The plan Zepimon mobile shares with the watch (chosen egg, phone adventure), read with the upload token, which can
  // read nothing else. null when the watch is not linked or the phone has not shared a plan.
  async fetchPlan() {
    const token = this.settings.getItem(CLOUD_TOKEN_KEY)
    if (!token) return null
    const result = await cloudRpc('zepimon_get_plan', { upload_token: token })
    return validatePlan(result ? result.plan : null)
  },
  // The plan and the adventure the watch shares with the phone, read together. null when the watch is not linked.
  async fetchShared() {
    const token = this.settings.getItem(CLOUD_TOKEN_KEY)
    if (!token) return null
    const result = await cloudRpc('zepimon_get_plan', { upload_token: token })
    return { plan: validatePlan(result ? result.plan : null), adventure: validateAdventure(result ? result.adventure : null) }
  },
  // Shares the watch's adventure (started, progress, taken over or ended) and returns the shared one as it now stands.
  async shareAdventure(adventure) {
    const token = this.settings.getItem(CLOUD_TOKEN_KEY)
    if (!token) throw new Error('Link your account to share adventures.')
    const result = await cloudRpc('zepimon_watch_share_adventure', { upload_token: token, adventure: validateAdventure(adventure) })
    return validateAdventure(result ? result.adventure : null)
  },
  // Adventures recorded on Zepimon mobile after the one the watch received last (after is the cloud's seq), oldest
  // first, read with the same token. Empty when the watch is not linked.
  async fetchPhoneRuns(after) {
    const token = this.settings.getItem(CLOUD_TOKEN_KEY)
    if (!token) return []
    const result = await cloudRpc('zepimon_get_phone_runs', { upload_token: token, after: Number.isSafeInteger(after) && after > 0 ? after : 0 })
    return validatePhoneRuns(result ? result.runs : null)
  },
  // Watch syncs, links and uploads can overlap; the Pokeball keeps spinning until the last one finishes.
  spinStart() {
    this.spinners = (this.spinners || 0) + 1
    if (this.spinTimer !== undefined) return
    const step = () => {
      this.settings.setItem(SYNC_FRAME_KEY, String((Number(this.settings.getItem(SYNC_FRAME_KEY)) || 0) + 1))
      this.spinTimer = setTimeout(step, 140)
    }
    step()
  },
  spinStop() {
    this.spinners = Math.max(0, (this.spinners || 0) - 1)
    if (this.spinners || this.spinTimer === undefined) return
    clearTimeout(this.spinTimer)
    this.spinTimer = undefined
  },
  async cloudRequest() {
    if (this.cloudLinkBusy) return
    const raw = this.settings.getItem(CLOUD_REQUEST_KEY)
    if (!raw) return
    this.settings.setItem(CLOUD_REQUEST_KEY, '')
    let request
    try { request = JSON.parse(raw) } catch (_) { return }
    if (request.action === 'retry') { this.uploadCloud(); return }
    if (request.action === 'stop') {
      this.settings.setItem(CLOUD_TOKEN_KEY, '')
      this.settings.setItem(CLOUD_SENT_KEY, '')
      this.settings.setItem(CLOUD_LINKED_KEY, '')
      this.cloudStatus('Account removed from this phone. Uploads stopped; your watch records are unchanged.')
      return
    }
    if (request.action !== 'link') return
    this.cloudLinkBusy = true
    this.spinStart()
    let linked = false
    this.cloudStatus('Linking your Zepimon account...')
    try {
      const result = await cloudRpc('zepimon_claim_link', { pair_code: request.code })
      if (!result || !/^[a-f0-9]{64}$/.test(result.token)) throw new Error('Could not read the link. Generate a new code.')
      this.settings.setItem(CLOUD_TOKEN_KEY, result.token)
      this.settings.setItem(CLOUD_SENT_KEY, '')
      this.settings.setItem(CLOUD_LINKED_KEY, String(Date.now()))
      linked = true
      this.cloudStatus('Account linked. Sync from your watch to upload its journal.')
    } catch (error) { this.cloudStatus(error.message || 'Could not link. Generate a new code in the mobile app.') }
    finally { this.cloudLinkBusy = false; this.spinStop() }
    if (linked) this.uploadCloud()
  },
  async uploadCloud() {
    if (this.cloudLinkBusy || !this.settings.getItem(CLOUD_TOKEN_KEY)) return
    if (this.cloudBusy) { this.cloudAgain = true; return }
    const raw = this.settings.getItem(SNAPSHOT_KEY)
    if (!raw) return
    this.cloudBusy = true
    this.cloudAgain = false
    this.spinStart()
    const token = this.settings.getItem(CLOUD_TOKEN_KEY)
    try {
      const saved = JSON.parse(raw)
      const snapshot = validateSnapshot(saved)
      if (Number(this.settings.getItem(CLOUD_SENT_KEY)) >= snapshot.capturedAt) return
      this.cloudStatus('Uploading your journal...')
      const journal = { exportVersion: 1, app: 'Zepimon', exportedAt: new Date().toISOString(),
        receivedAt: saved.receivedAt || null, snapshot, routes }
      const result = await cloudRpc('zepimon_upload', { upload_token: token, journal })
      if (!result || (result.accepted !== true && result.reason !== 'not_newer')) throw new Error('Unexpected cloud response.')
      if (token !== this.settings.getItem(CLOUD_TOKEN_KEY)) return
      this.settings.setItem(CLOUD_SENT_KEY, String(snapshot.capturedAt))
      this.cloudStatus('Uploaded. Open Zepimon on your phone to see your progress.')
    } catch (error) {
      if (token === this.settings.getItem(CLOUD_TOKEN_KEY)) this.cloudStatus(
        (error.message || 'Upload unavailable.') + ' Your journal is saved here; tap Retry upload when connected.')
      // Retry on service startup, the next watch update, or an explicit Retry tap.
      if (token === this.settings.getItem(CLOUD_TOKEN_KEY)) this.cloudAgain = false
    } finally {
      this.cloudBusy = false
      this.spinStop()
      if (this.cloudAgain) { this.cloudAgain = false; this.uploadCloud() }
    }
  }
}
