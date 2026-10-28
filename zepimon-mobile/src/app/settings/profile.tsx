import { useState } from 'react'
import { TextInput } from 'react-native'
import { router } from 'expo-router'
import { useJournal } from '../../store'
import { Button, Copy, Panel, Screen, Title, colors, styles, useTheme } from '../../ui'
import { NAME_LIMIT, setPreference, usePreferences } from '../../preferences'

// Settings → Edit profile: your trainer name, and where the profile picture (your buddy) comes from.
export default function ProfileScreen() {
  const { dark } = useTheme()
  const { name } = usePreferences()
  const { buddy } = useJournal()
  const [draft, setDraft] = useState(name)
  const next = draft.replace(/\s+/g, ' ').trim()
  function save() {
    if (next === name) return
    setPreference('name', next)
    router.back()
  }
  return <Screen>
    <Panel>
      <Title>Trainer name</Title>
      <Copy small>Shown on your Settings profile. It stays on this phone. Leave it blank to show Trainer.</Copy>
      <TextInput accessibilityLabel="Trainer name" value={draft} onChangeText={setDraft} maxLength={NAME_LIMIT} placeholder="Trainer"
        placeholderTextColor={colors.muted} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={save}
        keyboardAppearance={dark ? 'dark' : 'light'} style={styles.input} />
      <Button title="Save name" disabled={next === name} onPress={save} />
    </Panel>
    <Panel>
      <Title>Profile picture</Title>
      <Copy>{buddy ? `Your buddy, ${buddy}, is your profile picture.` : 'Your buddy becomes your profile picture.'} To change it, open any
        Pokemon in your Dex and choose it as your buddy.</Copy>
      <Button title="Open your Dex" secondary onPress={() => router.navigate('/dex')} />
    </Panel>
  </Screen>
}
