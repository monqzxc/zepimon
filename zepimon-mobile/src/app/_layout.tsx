import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { useFonts } from 'expo-font'
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold'
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold'
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold'
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black'
import { JournalProvider, useJournal } from '../store'
import { Copy, PokeballLoader, Screen, colors, fonts } from '../ui'
import { CloudProvider } from '../cloud'
// Defines the background location task; it must load with the app, before any screen.
import '../tracker'

export default function Layout() {
  return <JournalProvider><CloudProvider><Navigator /></CloudProvider></JournalProvider>
}

function Navigator() {
  const { ready } = useJournal()
  // The rounded Nunito weights ship with the app. If they ever fail to load, text falls back to the system font.
  const [fontsLoaded, fontError] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black })
  if (!ready || (!fontsLoaded && !fontError)) return <Screen><View style={{ alignItems: 'center', gap: 20, paddingTop: 96 }}>
    <PokeballLoader /><Copy>Opening your field journal…</Copy>
  </View></Screen>
  return <>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.ink,
      headerTitleStyle: { fontFamily: fonts.heavy, color: colors.ink }, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pokemon" options={{ title: 'Pokemon record' }} />
      <Stack.Screen name="expeditions" options={{ title: 'Legendary Expeditions' }} />
      <Stack.Screen name="missions" options={{ title: 'Missions' }} />
    </Stack>
  </>
}
