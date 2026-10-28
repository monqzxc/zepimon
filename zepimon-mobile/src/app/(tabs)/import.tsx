import { useState } from 'react'
import type { PropsWithChildren } from 'react'
import { Platform, Switch, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import Constants from 'expo-constants'
import { useJournal } from '../../store'
import { dexEntries, parseJournal } from '../../journal'
import type { Journal } from '../../journal'
import { Button, Chip, Copy, Eyebrow, Heading, Hero, Panel, Screen, Title, colors, styles } from '../../ui'
import { AccountPanel, WatchPanel } from '../../CloudPanel'
import { BackupPanel } from '../../BackupPanel'
import { setPreference, usePreferences } from '../../preferences'
import { setScreenOnly, useTracker } from '../../tracker'

// Settings, in the order people look for things: who you are (Account), your watch, how the app behaves, your data,
// and the versions. The route stays /import so older links still land here.

// A version name and, in brackets, its whole-number build code when known: "1.9.9 (build 23)".
const versionLabel = (name: string, code?: number | string) => code === undefined || code === '' ? name : `${name} (build ${code})`
// This app's build code from app.json: android.versionCode, or ios.buildNumber when one is set.
const phoneBuild = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode
  : Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : undefined

export default function SettingsScreen() {
  return <Screen>
    <Hero eyebrow="ZEPIMON · SETTINGS" title="Settings">
      <Copy color={colors.onBrand}>Your account and watch, how the app behaves, and your data.</Copy>
    </Hero>
    <Section label="ACCOUNT"><AccountPanel /></Section>
    <Section label="WATCH"><WatchPanel /></Section>
    <Section label="APP SETTINGS"><AppSettings /></Section>
    <Section label="YOUR DATA"><BackupPanel /><ManualImport /></Section>
    <Section label="ABOUT"><About /></Section>
  </Screen>
}

function Section({ label, children }: PropsWithChildren<{ label: string }>) {
  return <View style={{ gap: 10 }}><Eyebrow>{label}</Eyebrow>{children}</View>
}

// One setting: what it is and what it does, with its control beside it (a switch) or below it (choices).
function Setting({ title, detail, children, inline = false }: PropsWithChildren<{ title: string, detail: string, inline?: boolean }>) {
  return <View style={{ gap: 8, paddingVertical: 4 }}>
    <View style={[styles.row, { flexWrap: 'nowrap' }]}>
      <View style={{ flex: 1, gap: 2 }}><Title>{title}</Title><Copy small>{detail}</Copy></View>
      {inline && children}
    </View>
    {!inline && <View style={styles.row}>{children}</View>}
  </View>
}

function AppSettings() {
  const { activity, motion } = usePreferences()
  const { screenOnly } = useTracker()
  const [problem, setProblem] = useState('')
  return <Panel>
    <Setting title="Start adventures as" detail="What the Adventure tab picks first. You can still switch before you start.">
      {(['walking', 'running'] as const).map(kind => <Chip key={kind} label={kind === 'walking' ? 'Walking' : 'Running'}
        selected={activity === kind} onPress={() => setPreference('activity', kind)} />)}
    </Setting>
    {Platform.OS !== 'web' && <Setting inline title="Record with the screen off"
      detail="Keeps recording in your pocket, with a notification. Turned off after a crash during an adventure; turn it back on here.">
      <Switch accessibilityLabel="Record with the screen off" value={!screenOnly} trackColor={{ true: colors.edge }}
        onValueChange={value => { setProblem(''); setScreenOnly(!value).catch(() => setProblem('Could not switch recording. Try again.')) }} />
    </Setting>}
    <Setting title="Motion" detail="Animations such as Gengar's hops and the game effects. Reduce keeps them still.">
      <Chip label="Follow my phone" selected={motion === 'system'} onPress={() => setPreference('motion', 'system')} />
      <Chip label="Reduce" selected={motion === 'reduced'} onPress={() => setPreference('motion', 'reduced')} />
    </Setting>
    {!!problem && <Copy color={colors.danger}>{problem}</Copy>}
  </Panel>
}

// Bringing in a watch's JSON export by hand, for use without an account. Folded away until it is needed.
function ManualImport() {
  const { journal, importText, error } = useJournal()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<{ text: string, journal: Journal } | null>(null)
  const [message, setMessage] = useState('')
  // Which action is running, so only its button shows the loader.
  const [busy, setBusy] = useState<'' | 'file' | 'save'>('')
  function inspect(value: string) {
    setPreview(null)
    setMessage('')
    try { setPreview({ text: value, journal: parseJournal(value, journal) }) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this export.') }
  }
  async function pick() {
    setMessage('')
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], multiple: false, copyToCacheDirectory: true, base64: false })
      if (result.canceled) return
      setBusy('file')
      const asset = result.assets[0]
      if ((asset.size || 0) > 2 * 1024 * 1024) throw new Error('Choose a JSON export smaller than 2 MB.')
      const value = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text()
      inspect(value)
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Could not open this file.') }
    finally { setBusy('') }
  }
  async function save() {
    if (!preview || busy) return
    setBusy('save')
    try {
      await importText(preview.text)
      setPreview(null); setText(''); setMessage('Journal imported. Your Dex, adventures and missions are ready.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this import. Your previous journal is unchanged.') }
    finally { setBusy('') }
  }
  return <Panel>
    <Title>Import a watch export</Title>
    <Copy small>No account? In Zepp, open Zepimon’s settings, tap Sync from watch, then Export JSON, and bring the text here.</Copy>
    {!open ? <Button title="Import from JSON" secondary onPress={() => setOpen(true)} /> : <>
      {!!error && <Copy color={colors.danger}>{error}</Copy>}
      {!!message && <Copy color={colors.gold}>{message}</Copy>}
      <Button title={busy === 'file' ? 'Working…' : 'Choose JSON file'} loading={busy === 'file'} disabled={!!busy} onPress={pick} />
      <Eyebrow>OR PASTE YOUR EXPORT</Eyebrow>
      <TextInput accessibilityLabel="Paste Zepimon export JSON" multiline value={text} onChangeText={value => { setText(value); setPreview(null) }}
        placeholder={'{ "app": "Zepimon", … }'} placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" editable={!busy}
        style={[styles.input, { minHeight: 148, maxHeight: 240, textAlignVertical: 'top', fontSize: 13 }]} />
      <Button title="Check pasted JSON" secondary disabled={!!busy || !text.trim()} onPress={() => inspect(text)} />
      {preview && <>
        <Eyebrow>READY TO IMPORT</Eyebrow>
        <Heading>{dexEntries(preview.journal).length} Pokemon</Heading>
        <Copy>{Object.keys(preview.journal.snapshot.dex).length} Normal / Shiny records</Copy>
        <Copy>Watch snapshot: {new Date(preview.journal.snapshot.capturedAt).toLocaleString()}</Copy>
        <Copy small>Your latest collection will update. Retained phone adventures and earned badges stay saved.</Copy>
        <Button title="Use this export" onPress={save} loading={busy === 'save'} disabled={!!busy} />
        <Button title="Cancel import" secondary disabled={!!busy} onPress={() => setPreview(null)} />
      </>}
      {journal && <Copy small>Current journal: {new Date(journal.snapshot.capturedAt).toLocaleString()}. Older exports are rejected; importing the same runs again does not count them twice.</Copy>}
      <Button title="Close" secondary disabled={!!busy} onPress={() => setOpen(false)} />
    </>}
  </Panel>
}

function About() {
  const { journal } = useJournal()
  return <Panel>
    <Title>Zepimon</Title>
    <Copy color={colors.ink}>Phone app: {Constants.expoConfig?.version ? versionLabel(Constants.expoConfig.version, phoneBuild) : 'Unknown'}</Copy>
    <Copy color={colors.ink}>Watch app: {journal?.snapshot.appVersion
      ? versionLabel(journal.snapshot.appVersion, journal.snapshot.appVersionCode) : 'Sync your watch to see it'}</Copy>
    <Copy small>The watch app’s version and build number come with each watch sync, as in Zepp.</Copy>
    <Copy small>Pokemon sprites from PokeAPI/sprites, bundled for offline use. Pokemon is a trademark of Nintendo, Creatures and Game Freak; Zepimon is a fan project.</Copy>
  </Panel>
}
