import { useState } from 'react'
import { Platform, TextInput } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useJournal } from '../../store'
import { dexEntries, parseJournal } from '../../journal'
import type { Journal } from '../../journal'
import { Button, Copy, Eyebrow, Heading, Panel, Screen, colors, styles } from '../../ui'
import { CloudPanel } from '../../CloudPanel'

export default function ImportScreen() {
  const { journal, importText, error } = useJournal()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<{ text: string, journal: Journal } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
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
      setBusy(true)
      const asset = result.assets[0]
      if ((asset.size || 0) > 2 * 1024 * 1024) throw new Error('Choose a JSON export smaller than 2 MB.')
      const value = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text()
      inspect(value)
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Could not open this file.') }
    finally { setBusy(false) }
  }
  async function save() {
    if (!preview || busy) return
    setBusy(true)
    try {
      await importText(preview.text)
      setPreview(null); setText(''); setMessage('Journal imported. Your Dex, adventures and missions are ready.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this import. Your previous journal is unchanged.') }
    finally { setBusy(false) }
  }
  return <Screen>
    <Eyebrow>YOUR CONNECTED JOURNAL</Eyebrow><Heading>Bring your journey.</Heading>
    <CloudPanel />
    <Eyebrow>MANUAL JSON IMPORT</Eyebrow>
    <Copy>Sync your Zepimon watch data in Zepp, then open Zepimon’s settings and choose “Export JSON”. Save the text as a .json file or paste it below.</Copy>
    <Panel><Copy>JSON imports also work offline. Import again after a walk to update your Dex and mission progress.</Copy>
      <Copy small>The watch stays paired with Zepp. This companion does not record phone workouts.</Copy></Panel>
    {!!error && <Copy color={colors.gold}>{error}</Copy>}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    <Button title={busy ? 'Working…' : 'Choose JSON file'} disabled={busy} onPress={pick} />
    <Eyebrow>OR PASTE YOUR EXPORT</Eyebrow>
    <TextInput accessibilityLabel="Paste Zepimon export JSON" multiline value={text} onChangeText={value => { setText(value); setPreview(null) }}
      placeholder={'{ "app": "Zepimon", … }'} placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" editable={!busy}
      style={[styles.input, { minHeight: 148, maxHeight: 240, textAlignVertical: 'top', fontSize: 13 }]} />
    <Button title="Check pasted JSON" secondary disabled={busy || !text.trim()} onPress={() => inspect(text)} />
    {preview && <Panel>
      <Eyebrow>READY TO IMPORT</Eyebrow>
      <Heading>{dexEntries(preview.journal).length} Pokemon</Heading>
      <Copy>{Object.keys(preview.journal.snapshot.dex).length} Normal / Shiny records</Copy>
      <Copy>Watch snapshot: {new Date(preview.journal.snapshot.capturedAt).toLocaleString()}</Copy>
      <Copy small>Your latest collection will update. Retained phone adventures and earned badges stay saved.</Copy>
      <Button title="Use this export" onPress={save} disabled={busy} />
      <Button title="Cancel import" secondary disabled={busy} onPress={() => setPreview(null)} />
    </Panel>}
    {journal && <Copy small>Current journal: {new Date(journal.snapshot.capturedAt).toLocaleString()}. Older exports are rejected; reimporting the same runs does not count them twice.</Copy>}
  </Screen>
}
