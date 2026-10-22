import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { JournalProvider, useJournal } from '../store'
import { Copy, Screen, colors } from '../ui'
import { CloudProvider } from '../cloud'

export default function Layout() {
  return <JournalProvider><CloudProvider><Navigator /></CloudProvider></JournalProvider>
}

function Navigator() {
  const { ready } = useJournal()
  if (!ready) return <Screen><Copy>Opening your field journal…</Copy></Screen>
  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pokemon" options={{ title: 'Pokemon record' }} />
      <Stack.Screen name="expeditions" options={{ title: 'Legendary Expeditions' }} />
    </Stack>
  </>
}
