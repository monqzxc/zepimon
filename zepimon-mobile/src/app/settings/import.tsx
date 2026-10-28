import { useState } from 'react'
import { Platform, TextInput } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useJournal } from '../../store'
import { dexEntries, parseJournal } from '../../journal'
import type { Journal } from '../../journal'
import { Button, Copy, Eyebrow, Heading, Panel, Screen, Title, colors, styles, useTheme } from '../../ui'

// Settings → Import a watch export: bringing in a watch's JSON export (or a backup file) by hand, without an account.
export default function ImportScreen() {
  const { dark } = useTheme()
  const { journal, importText, error } = useJournal()
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
  return <Screen>
    <Panel>
      <Title>Import a watch export</Title>
      <Copy small>No account? In Zepp, open Zepimon’s settings, tap Sync from watch, then Export JSON, and bring the text here. A Zepimon backup file works too.</Copy>
      {!!error && <Copy color={colors.danger}>{error}</Copy>}
      {!!message && <Copy color={colors.gold}>{message}</Copy>}
      <Button title={busy === 'file' ? 'Working…' : 'Choose JSON file'} loading={busy === 'file'} disabled={!!busy} onPress={pick} />
      <Eyebrow>OR PASTE YOUR EXPORT</Eyebrow>
      <TextInput accessibilityLabel="Paste Zepimon export JSON" multiline value={text} onChangeText={value => { setText(value); setPreview(null) }}
        placeholder={'{ "app": "Zepimon", … }'} placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" editable={!busy}
        keyboardAppearance={dark ? 'dark' : 'light'} style={[styles.input, { minHeight: 148, maxHeight: 240, textAlignVertical: 'top', fontSize: 13 }]} />
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
    </Panel>
  </Screen>
}
