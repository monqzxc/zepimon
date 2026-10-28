import { Screen, useTheme } from '../../ui'
import { WatchPanel } from '../../CloudPanel'

// Settings → Watch: link the watch through Zepp, sync, or disconnect.
export default function WatchScreen() {
  useTheme()
  return <Screen><WatchPanel /></Screen>
}
