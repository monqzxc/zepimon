import { Screen, useTheme } from '../../ui'
import { BackupPanel } from '../../BackupPanel'

// Settings → Back up your data.
export default function BackupScreen() {
  useTheme()
  return <Screen><BackupPanel /></Screen>
}
