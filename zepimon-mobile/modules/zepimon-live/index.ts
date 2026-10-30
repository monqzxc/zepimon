import { requireOptionalNativeModule } from 'expo'

// The live adventure notification in android/ (LiveNotification.kt). Elsewhere (iOS, the web) there is none.
export type LiveOptions = { activity: string, startedAt: number, distance: string, pokemon: string, icon: string | null }
type Live = { show(options: LiveOptions): void, stop(): void }
const native = requireOptionalNativeModule<Live>('ZepimonLive')

export function showLive(options: LiveOptions) {
  try { native?.show(options) } catch { /* no notification: recording goes on */ }
}

export function stopLive() {
  try { native?.stop() } catch { /* nothing to stop */ }
}
