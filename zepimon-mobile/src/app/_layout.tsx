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
import { CrashReport, CrashScreen } from '../CrashReport'
import { AdventureBanner } from '../AdventureBanner'

// An error on any screen shows what happened, with Share, instead of closing the app.
export const ErrorBoundary = CrashScreen

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
      <Stack.Screen name="eggs" options={{ title: 'Choose an egg' }} />
      <Stack.Screen name="share" options={{ title: 'Share adventure' }} />
      <Stack.Screen name="adventures" options={{ title: 'All adventures' }} />
      {/* Its pastel header has its own Back button. */}
      <Stack.Screen name="adventure-details" options={{ title: 'Adventure', headerShown: false }} />
    </Stack>
    <CrashReport />
    <AdventureBanner />
  </>
}
