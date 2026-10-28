import { Screen, useTheme } from '../../ui'
import { AccountPanel } from '../../CloudPanel'

// Settings → Sign in: email sign-in, or who is signed in.
export default function AccountScreen() {
  useTheme()
  return <Screen><AccountPanel /></Screen>
}
