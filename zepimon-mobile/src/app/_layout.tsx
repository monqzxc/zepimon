import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { JournalProvider, useJournal } from '../store'
import { Copy, PokeballLoader, Screen, colors } from '../ui'
import { CloudProvider } from '../cloud'

export default function Layout() {
  return <JournalProvider><CloudProvider><Navigator /></CloudProvider></JournalProvider>
}

function Navigator() {
  const { ready } = useJournal()
  if (!ready) return <Screen><View style={{ alignItems: 'center', gap: 20, paddingTop: 96 }}>
    <PokeballLoader /><Copy>Opening your field journal…</Copy>
  </View></Screen>
  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pokemon" options={{ title: 'Pokemon record' }} />
      <Stack.Screen name="expeditions" options={{ title: 'Legendary Expeditions' }} />
    </Stack>
  </>
}
