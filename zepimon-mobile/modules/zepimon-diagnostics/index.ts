import { requireOptionalNativeModule } from 'expo'

// Reads the crash recorder in android/ (CrashRecorder.kt). Elsewhere (iOS, the web) there is no report.
type Diagnostics = { lastCrash(): string | null, acknowledgeCrash(): void }
const native = requireOptionalNativeModule<Diagnostics>('ZepimonDiagnostics')

// Why the app last closed unexpectedly, or null when nothing new has happened since the report was last closed.
export function lastCrash(): string | null {
  try { return native?.lastCrash() ?? null } catch { return null }
}

export function acknowledgeCrash() {
  try { native?.acknowledgeCrash() } catch { /* nothing to acknowledge */ }
}
