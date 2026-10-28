import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { Icon, PokeballIcon } from '../../ui'
import type { IconName } from '../../ui'
import { TabBar } from '../../TabBar'

// Adventure (record a walk or run on this phone) sits in the middle. Missions opens from the Journal. Settings keeps
// the route name import, which older links use.
const tabs: [name: string, title: string, icon: IconName | 'dex'][] = [
  ['index', 'Journal', 'journal'], ['dex', 'Dex', 'dex'], ['adventure', 'Adventure', 'run'], ['play', 'Play', 'play'], ['import', 'Settings', 'settings']
]

export default function TabLayout() {
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title,
      tabBarIcon: ({ color }) => <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {icon === 'dex' ? <PokeballIcon size={22} color={color} /> : <Icon name={icon} size={24} color={color} />}
      </View> }} />)}
  </Tabs>
}
