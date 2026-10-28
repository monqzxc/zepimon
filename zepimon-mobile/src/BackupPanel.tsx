import { useState } from 'react'
import { Platform, TextInput } from 'react-native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useJournal } from './store'
import { backupFileName, hasBackupData } from './backup'
import { Button, Copy, Heading, Panel, colors, styles } from './ui'

// Browsers get a direct download; phones write the file to the cache and open the share sheet to save it anywhere.
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`

export function BackupPanel() {
  const { ready, makeBackup, backupInfo } = useJournal()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [text, setText] = useState('')
  const empty = !hasBackupData(backupInfo)

  async function save() {
    if (busy) return
    setBusy(true); setMessage(''); setText('')
    try {
      const value = makeBackup()
      const name = backupFileName()
      if (Platform.OS === 'web') {
        download(value, name)
        setMessage(`Saved ${name} to your downloads.`)
        return
      }
      const file = new File(Paths.cache, name)
      file.create({ overwrite: true })
      file.write(value)
      if (!(await Sharing.isAvailableAsync())) {
        setText(value)
        setMessage('Saving files is not available here. Copy the backup text below instead.')
        return
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your Zepimon backup' })
      setMessage(`${name} is ready. Keep it somewhere safe, like Files, Drive or your email.`)
    } catch (error) {
      setMessage(`Could not create the backup${error instanceof Error && error.message ? `: ${error.message}` : '.'} Your data is unchanged.`)
    } finally { setBusy(false) }
  }

  const { watchRecords, runs, friends, safari, stars, scores } = backupInfo
  // Settings → Back up your data (src/app/settings/backup.tsx).
  return <>
    <Panel>
      <Heading>Keep a copy of your adventure</Heading>
      <Copy>Save one JSON file with your watch journal and everything kept only on this phone: Safari catches, Expedition friends, missions, Adventure Map stars and best scores.</Copy>
      <Copy small color={colors.ink}>{empty ? 'Nothing to back up yet. Sync your watch or play a game first.'
        : [count(watchRecords, 'watch Dex record', 'watch Dex records'), count(runs, 'saved run', 'saved runs'), count(friends, 'Expedition friend', 'Expedition friends'),
          count(safari, 'Safari catch', 'Safari catches'), count(stars, 'star', 'stars'), count(scores, 'best score', 'best scores')].join(' · ')}</Copy>
      {!!message && <Copy color={colors.gold}>{message}</Copy>}
      <Button title={busy ? 'Creating backup…' : 'Save a backup file'} loading={busy} disabled={!ready || empty} onPress={save} />
      <Button title={text ? 'Hide backup text' : 'Show backup as text'} secondary disabled={!ready || empty || busy}
        onPress={() => { setMessage(''); setText(text ? '' : makeBackup()) }} />
      {!!text && <>
        <Copy small>Select all of the text below and copy it into a note or a .json file.</Copy>
        <TextInput accessibilityLabel="Zepimon backup JSON" multiline value={text} onChangeText={() => {}} selectTextOnFocus
          autoCorrect={false} autoCapitalize="none" style={[styles.input, { minHeight: 148, maxHeight: 280, textAlignVertical: 'top', fontSize: 12 }]} />
      </>}
      <Copy small>Account links and sign-in details are never included. To bring a watch journal back, open Import a watch export in Settings and choose the backup file.</Copy>
    </Panel>
  </>
}
