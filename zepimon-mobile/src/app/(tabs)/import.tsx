import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { useJournal } from '../../store'
import { useCloud } from '../../cloud'
import { cloudClient } from '../../cloud-client'
import { pokemonType } from '../../catalog'
import { PixelSprite } from '../../games/TeamPicker'
import { PokeballIcon, Screen, colors, fonts, gradient, themedStyles, typeTints, useTheme } from '../../ui'
import { ChoiceSheet, SettingsGroup, SettingsRow, SettingsSwitch } from '../../SettingsList'
import { setPreference, usePreferences } from '../../preferences'
import { setScreenOnly, useTracker } from '../../tracker'

// Settings as grouped lists under your profile: preferences, your account and watch, your data, and the versions.
// Longer settings open on their own page (src/app/settings). The route stays /import so older links still land here.

// A version name and, in brackets, its whole-number build code when known: "1.9.9 (build 23)".
const versionLabel = (name: string, code?: number | string) => code === undefined || code === '' ? name : `${name} (build ${code})`
// This app's build code from app.json: android.versionCode, or ios.buildNumber when one is set.
const phoneBuild = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode
  : Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : undefined
const title = (word: string) => word[0].toUpperCase() + word.slice(1)

export default function SettingsScreen() {
  useTheme()
  const { activity, motion, theme, appearance } = usePreferences()
  const { screenOnly } = useTracker()
  const [choosing, setChoosing] = useState(false)
  const [problem, setProblem] = useState('')
  return <Screen>
    <Text accessibilityRole="header" style={page.title}>Settings</Text>
    <Profile />
    <SettingsGroup label="Preferences" footer={'Reduce motion keeps the tab bar’s Pokemon and the game effects still; when it is off, Zepimon follows your phone.' +
      (Platform.OS === 'web' ? '' : ' Recording with the screen off keeps going in your pocket, with a notification. It turns off after a crash during an adventure; turn it back on here.')}>
      <SettingsRow icon="palette" label="Theme" value={`${title(theme)} · ${title(appearance)}`} onPress={() => router.push('/settings/theme')} />
      <SettingsRow icon={activity === 'running' ? 'run' : 'walk'} label="Start adventures as" value={activity === 'running' ? 'Running' : 'Walking'}
        onPress={() => setChoosing(true)} />
      <SettingsSwitch icon="sparkle" label="Reduce motion" value={motion === 'reduced'} onChange={value => setPreference('motion', value ? 'reduced' : 'system')} />
      {Platform.OS !== 'web' && <SettingsSwitch icon="lock" label="Record with the screen off" value={!screenOnly}
        onChange={value => { setProblem(''); setScreenOnly(!value).catch(() => setProblem('Could not switch recording. Try again.')) }} />}
    </SettingsGroup>
    {!!problem && <Text style={[page.note, { color: colors.danger }]}>{problem}</Text>}
    <AccountGroup />
    <SettingsGroup label="Your data">
      <SettingsRow icon="backup" label="Back up your data" onPress={() => router.push('/settings/backup')} />
      <SettingsRow icon="download" label="Import a watch export" onPress={() => router.push('/settings/import')} />
    </SettingsGroup>
    <About />
    <ChoiceSheet title="Start adventures as" open={choosing} value={activity} onChoose={value => setPreference('activity', value)} onClose={() => setChoosing(false)}
      options={[{ value: 'walking', label: 'Walking', detail: 'What the Adventure tab picks first.' },
        { value: 'running', label: 'Running', detail: 'You can still switch before you start.' }]} />
  </Screen>
}

// Your buddy as the profile picture, your trainer name and the account's email.
function Profile() {
  const { buddy } = useJournal()
  const { session } = useCloud()
  const { name } = usePreferences()
  const species = buddy?.replace(/^Shiny /, '') ?? null
  return <View style={page.profile}>
    <View style={page.identity}>
      <View accessible={false} style={[page.avatar, { backgroundColor: species ? typeTints[pokemonType(species)] : colors.mint }]}>
        {/* Sprites carry empty space around the Pokemon, so it is drawn larger than the circle, which crops it. */}
        {species ? <PixelSprite name={species} shiny={buddy!.startsWith('Shiny ')} size={92} /> : <PokeballIcon size={30} color={colors.edge} />}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={page.name} numberOfLines={1}>{name || 'Trainer'}</Text>
        <Text style={page.email} numberOfLines={1}>{session?.user.email ?? (cloudClient ? 'Not signed in' : 'Offline mode')}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/settings/profile')}
      style={({ pressed }) => [page.edit, gradient(), { opacity: pressed ? 0.8 : 1 }]}>
      <Text style={page.editText}>Edit profile</Text>
    </Pressable>
  </View>
}

function AccountGroup() {
  const { session, ready, syncing, message, linked, updatedAt, sync } = useCloud()
  const { cloudOwner } = useJournal()
  const [confirm, setConfirm] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  if (!cloudClient) return <SettingsGroup label="Account" footer="Cloud sync has not been configured in this build. You can still import a watch export under Your data.">
    <SettingsRow icon="cloud" label="Offline mode" />
  </SettingsGroup>
  // A journal downloaded for another account must not sync into this one (as on the Watch page).
  const mismatch = !!session && !!cloudOwner && cloudOwner !== session.user.id
  async function logOut() {
    if (!confirm) { setConfirm(true); return }
    setWorking(true); setNotice('')
    try {
      const { error } = await cloudClient!.auth.signOut({ scope: 'local' })
      if (error) throw error
      setNotice('Logged out. Your downloaded journal remains on this phone.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not log out. Please try again.') }
    finally { setWorking(false); setConfirm(false) }
  }
  // When the watch journal last changed: the time today, otherwise the day.
  const date = updatedAt ? new Date(updatedAt) : null
  const synced = date ? `Updated ${date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : undefined
  return <SettingsGroup label="Account" footer={notice || message || undefined}>
    {!session && <SettingsRow icon="person" label="Sign in" value="Email code" onPress={() => router.push('/settings/account')} />}
    <SettingsRow icon="watch" label="Watch" value={!session ? 'Sign in first' : linked ? 'Linked' : 'Not linked'} onPress={() => router.push('/settings/watch')} />
    {!!session && linked && !mismatch && <SettingsRow icon="sync" label="Sync now" value={syncing ? 'Syncing…' : synced} busy={syncing || !ready}
      onPress={() => { setNotice(''); void sync() }} />}
    {!!session && <SettingsRow icon="logout" danger label={confirm ? 'Tap again to log out' : 'Log out'} busy={working || !ready} onPress={() => { void logOut() }} />}
  </SettingsGroup>
}

function About() {
  const { journal } = useJournal()
  return <SettingsGroup label="About" footer="The watch app’s version and build number come with each watch sync, as in Zepp. Pokemon sprites from PokeAPI/sprites, bundled for offline use. Pokemon is a trademark of Nintendo, Creatures and Game Freak; Zepimon is a fan project.">
    <SettingsRow icon="phone" label="Phone app" value={Constants.expoConfig?.version ? versionLabel(Constants.expoConfig.version, phoneBuild) : 'Unknown'} />
    <SettingsRow icon="watch" label="Watch app" value={journal?.snapshot.appVersion
      ? versionLabel(journal.snapshot.appVersion, journal.snapshot.appVersionCode) : 'Not synced yet'} />
  </SettingsGroup>
}

const page = themedStyles(() => ({
  title: { fontFamily: fonts.heavy, fontSize: 18, lineHeight: 24, color: colors.ink, textAlign: 'center', paddingTop: 4 },
  profile: { gap: 12, paddingHorizontal: 4 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 2, borderColor: colors.panel },
  name: { fontFamily: fonts.heavy, fontSize: 21, lineHeight: 27, color: colors.ink },
  email: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted },
  edit: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9 },
  editText: { fontFamily: fonts.heavy, fontSize: 13, lineHeight: 17, color: colors.onBrand },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginTop: -8 }
}))
