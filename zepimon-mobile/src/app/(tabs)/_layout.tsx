import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../ui'

export default function TabLayout() {
  const insets = useSafeAreaInsets()
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.gold, tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.edge, height: 72 + insets.bottom, paddingTop: 2, paddingBottom: Math.max(8, insets.bottom) },
    tabBarHideOnKeyboard: true, tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '700' } }}>
    {[
      ['index', 'Journal', '◈'], ['dex', 'Dex', '▦'], ['missions', 'Missions', '☆'], ['play', 'Play', '✦'], ['import', 'Sync', '⇩']
    ].map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title,
      tabBarIcon: ({ color }) => <Text style={{ fontSize: 23, color }}>{icon}</Text> }} />)}
  </Tabs>
}
